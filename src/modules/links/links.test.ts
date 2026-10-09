import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { serverModules } from '#/modules/server'
import { createApp } from '#/server/app'
import { connect, type Sql } from '#/server/db'
import { migrate } from '#/server/migrate'

// These tests empty the tables, so they only run against TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('the links module', () => {
  let sql: Sql
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    sql = connect(url!)
    await migrate(sql, serverModules)
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate files, folders, tags, categories cascade`
    app = createApp(sql, { databaseUrl: url!, versionWindowSeconds: 300, migrateOnStart: false }, serverModules)
  })

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as any) }
  }

  test('a post links to its images in order, through moves, and the images know who links to them', async () => {
    const post = (await call('POST', '/files', { path: '/posts/a.md', content: 'post' })).body
    await call('POST', '/files', { path: '/img/1.png' })
    const two = (await call('POST', '/files', { path: '/img/2.png' })).body

    expect((await call('PUT', `/files/${post.id}/links/image`, { paths: ['/img/nope.png'] })).status).toBe(400)
    expect((await call('PUT', `/files/${post.id}/links/Bad Rel`, { paths: [] })).status).toBe(400)
    const linked = await call('PUT', `/files/${post.id}/links/image`, { paths: ['/img/2.png', '/img/1.png'] })
    expect(linked.status).toBe(200)

    await call('PATCH', `/files/${two.id}`, { path: '/img/moved.png' })
    const out = (await call('GET', `/files/${post.id}/links`)).body
    expect(out.image.map((t: any) => t.path)).toEqual(['/img/moved.png', '/img/1.png'])
    expect((await call('GET', `/files/${two.id}/backlinks`)).body).toEqual([{ id: post.id, path: '/posts/a.md', rel: 'image' }])

    // A target in the trash is left out; an empty list removes the relation.
    await call('DELETE', `/files/${two.id}`)
    expect((await call('GET', `/files/${post.id}/links`)).body.image.map((t: any) => t.path)).toEqual(['/img/1.png'])
    const cleared = (await call('PUT', `/files/${post.id}/links/image`, { paths: [] })).body
    expect(cleared.metadata.links).toBeUndefined()
  })
})
