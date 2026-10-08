import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono, type MiddlewareHandler } from 'hono'
import { serverModules } from '#/modules/server'
import { coreRoutes } from './api'
import { runAs } from './caller'
import type { Config } from './config'
import { type Sql, tablesOf } from './db'
import { DomainError, statusOf } from './errors'
import { LOOPBACK_HOSTS, requestGuard } from './guard'
import { coreTools, createMcpHandler, describe } from './mcp'
import type { Api, App, AppEnv, ServerModule } from './module'
import { type ContentLimit, createServices, type WriteHook } from './services'

/** The editor sends it on every call, so its writes are by `user`; everything else is by `agent`. */
export const EDITOR_HEADER = 'X-Openmemfs'

/** The longest author name the history keeps. */
const MAX_AUTHOR_LENGTH = 200

/**
 * Builds the server: the service layer, and its two doors on top, the REST API under /api
 * and the MCP endpoint at /mcp, each with the parts every module adds. TanStack Start hands
 * those paths here (src/routes/api/$.ts and src/routes/mcp.ts); the pages are its own.
 */
export function createApp(sql: Sql, config: Config, modules: ServerModule[] = serverModules) {
  const afterWrite: WriteHook[] = []
  const contentLimits: ContentLimit[] = []
  const tables = tablesOf(sql, config.schema)
  const services = createServices(sql, { afterWrite, contentLimits }, tables)
  const api: Api = new Hono<AppEnv>()
  coreRoutes(api, services)
  const tools: ((mcp: McpServer) => void)[] = [(mcp) => coreTools(mcp, services)]
  const middlewares: MiddlewareHandler<AppEnv>[] = []
  const openRoutes: ((app: App) => void)[] = []

  const seen = new Set<string>()
  for (const module of modules) {
    if (seen.has(module.id)) throw new Error(`two modules are called ${module.id}`)
    seen.add(module.id)
    const parts = module.setup?.({ sql, table: tables.table, services, config }) ?? {}
    if (parts.afterWrite) afterWrite.push(parts.afterWrite)
    if (parts.contentLimit) contentLimits.push(parts.contentLimit)
    if (parts.middleware) middlewares.push(parts.middleware)
    if (parts.openRoutes) openRoutes.push(parts.openRoutes)
    parts.routes?.(api)
    if (parts.tools) tools.push(parts.tools)
  }

  const app = new Hono<AppEnv>()
  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json({ error: error.message, code: error.code }, statusOf(error.code))
    // The path without its query, and the error without the values it may carry.
    console.error(`${c.req.method} ${c.req.path}: ${describe(error)}`)
    return c.json({ error: 'internal error' }, 500)
  })

  app.get('/api/health', (c) => c.json({ ok: true }))
  for (const mount of openRoutes) mount(app)
  const chain: MiddlewareHandler<AppEnv>[] = [
    requestGuard(config.allowedHosts ?? LOOPBACK_HOSTS, config.maxBodyBytes),
    // There is no access control in the core: whoever reaches the server reads and writes. The
    // header only says who wrote, for the history: the editor sends it, agents do not.
    async (c, next) => {
      c.set('author', c.req.header(EDITOR_HEADER) === '1' ? 'user' : 'agent')
      c.set('reach', null)
      return next()
    },
    ...middlewares,
    // From here on, every service call sees who the request is for.
    async (c, next) => {
      const author = c.get('author')
      if (typeof author !== 'string' || author.trim() === '' || author.length > MAX_AUTHOR_LENGTH) {
        throw new Error('a middleware set an empty or overlong author')
      }
      const reach = c.get('reach')
      if (reach !== null && !reach.every((f) => typeof f === 'string' && f.startsWith('/') && f.endsWith('/'))) {
        throw new Error('a middleware set a reach that is not a list of folders like "/notes/"')
      }
      return runAs({ author, reach }, next)
    },
  ]
  app.use('/api/*', ...chain)
  app.use('/mcp', ...chain)
  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'no such route' }, 404))

  const mcp = createMcpHandler((server) => {
    for (const register of tools) register(server)
  })
  app.all('/mcp', (c) => mcp(c.req.raw))

  return app
}
