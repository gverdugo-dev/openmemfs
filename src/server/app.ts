import { Hono } from 'hono'
import { serverModules } from '#/modules/server'
import { createAuth } from './auth'
import type { Config } from './config'
import type { Sql } from './db'
import { DomainError, statusOf } from './errors'
import { createFiles, type WriteHook } from './files'
import { body } from './http'
import type { Api, AppEnv, ServerModule } from './module'

/**
 * Builds the API: everything under /api, with the routes of every module. The pages are
 * TanStack Start's; this is mounted on its /api/$ server route (src/routes/api/$.ts).
 */
export function createApp(sql: Sql, config: Config, modules: ServerModule[] = serverModules) {
  const hooks: WriteHook[] = []
  const files = createFiles(sql, hooks)
  const auth = createAuth(config.token)

  const app = new Hono()
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

  const api: Api = new Hono<AppEnv>()
  api.use(auth.require)
  api.get('/session', (c) => c.json({ author: c.get('author') }))

  api.get('/files', async (c) => c.json(await files.list(c.req.query('prefix') ?? '/')))
  api.get('/files/by-path', async (c) => c.json(await files.getByPath(c.req.query('path') ?? '')))
  api.get('/files/:id', async (c) => c.json(await files.get(c.req.param('id'))))
  api.post('/files', async (c) => {
    const input = await body<{ path?: unknown; content?: unknown; metadata?: unknown }>(c.req.raw)
    const file = await files.create(
      { path: input.path as string, content: input.content as string, metadata: input.metadata as never },
      { author: c.get('author') },
    )
    return c.json(file, 201)
  })
  api.patch('/files/:id', async (c) => {
    const input = await body<{
      path?: unknown
      content?: unknown
      metadata?: unknown
      if_revision?: unknown
      checkpoint?: unknown
    }>(c.req.raw)
    const file = await files.update(
      c.req.param('id'),
      {
        path: input.path as string | undefined,
        content: input.content as string | undefined,
        metadata: input.metadata as never,
        ifRevision: input.if_revision as number | undefined,
        checkpoint: input.checkpoint === true,
      },
      { author: c.get('author') },
    )
    return c.json(file)
  })
  api.delete('/files/:id', async (c) => {
    await files.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  const seen = new Set<string>()
  for (const module of modules) {
    if (seen.has(module.id)) throw new Error(`two modules are called ${module.id}`)
    seen.add(module.id)
    const parts = module.setup?.({ sql, files, config }) ?? {}
    if (parts.afterWrite) hooks.push(parts.afterWrite)
    parts.routes?.(api)
  }

  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'no such route' }, 404))


  return app
}
