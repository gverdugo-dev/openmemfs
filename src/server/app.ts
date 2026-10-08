import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { serverModules } from '#/modules/server'
import { coreRoutes } from './api'
import type { Config } from './config'
import type { Sql } from './db'
import { DomainError, statusOf } from './errors'
import { LOOPBACK_HOSTS, requestGuard } from './guard'
import { coreTools, createMcpHandler, describe } from './mcp'
import type { Api, AppEnv, ServerModule } from './module'
import { createServices, type WriteHook } from './services'

/** The editor sends it on every call, so its writes are by `user`; everything else is by `agent`. */
export const EDITOR_HEADER = 'X-Openmemfs'

/**
 * Builds the server: the service layer, and its two doors on top, the REST API under /api
 * and the MCP endpoint at /mcp, each with the parts every module adds. TanStack Start hands
 * those paths here (src/routes/api/$.ts and src/routes/mcp.ts); the pages are its own.
 */
export function createApp(sql: Sql, config: Config, modules: ServerModule[] = serverModules) {
  const hooks: WriteHook[] = []
  const services = createServices(sql, hooks)
  const api: Api = new Hono<AppEnv>()
  // There is no access control: whoever reaches the server reads and writes. The header only
  // says who wrote, for the history: the editor sends it, agents do not.
  api.use(async (c, next) => {
    c.set('author', c.req.header(EDITOR_HEADER) === '1' ? 'user' : 'agent')
    return next()
  })
  coreRoutes(api, services)
  const tools: ((mcp: McpServer) => void)[] = [(mcp) => coreTools(mcp, services)]

  const seen = new Set<string>()
  for (const module of modules) {
    if (seen.has(module.id)) throw new Error(`two modules are called ${module.id}`)
    seen.add(module.id)
    const parts = module.setup?.({ sql, services, config }) ?? {}
    if (parts.afterWrite) hooks.push(parts.afterWrite)
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
  const guard = requestGuard(config.allowedHosts ?? LOOPBACK_HOSTS)
  app.use('/api/*', guard)
  app.use('/mcp', guard)
  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'no such route' }, 404))

  const mcp = createMcpHandler((server) => {
    for (const register of tools) register(server)
  })
  app.all('/mcp', (c) => mcp(c.req.raw))

  return app
}
