import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Hono } from 'hono'
import { serverModules } from '#/modules/server'
import { coreRoutes } from './api'
import { createAuth } from './auth'
import type { Config } from './config'
import type { Sql } from './db'
import { DomainError, statusOf } from './errors'
import { body } from './http'
import { coreTools, createMcpHandler } from './mcp'
import type { Api, AppEnv, ServerModule } from './module'
import { createServices, type WriteHook } from './services'

/**
 * Builds the server: the service layer, and its two doors on top, the REST API under /api
 * and the MCP endpoint at /mcp, each with the parts every module adds. TanStack Start hands
 * those paths here (src/routes/api/$.ts and src/routes/mcp.ts); the pages are its own.
 */
export function createApp(sql: Sql, config: Config, modules: ServerModule[] = serverModules) {
  const hooks: WriteHook[] = []
  const services = createServices(sql, hooks)
  const auth = createAuth(config.token)

  const api: Api = new Hono<AppEnv>()
  api.use(auth.require)
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
    console.error(`${c.req.method} ${c.req.path}:`, error)
    return c.json({ error: 'internal error' }, 500)
  })

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.post('/api/session', async (c) => {
    const { token } = await body<{ token?: unknown }>(c.req.raw)
    if (typeof token !== 'string' || !auth.signIn(c, token)) return c.json({ error: 'wrong token' }, 401)
    return c.body(null, 204)
  })
  app.delete('/api/session', (c) => {
    auth.signOut(c)
    return c.body(null, 204)
  })
  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'no such route' }, 404))

  const mcp = createMcpHandler((server) => {
    for (const register of tools) register(server)
  })
  app.all('/mcp', auth.requireAgent, (c) => mcp(c.req.raw))

  return app
}
