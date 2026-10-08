import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from './app'
import type { Config } from './config'
import { connect, type Sql } from './db'
import { migrate } from './migrate'

// These tests empty the tables, so they only run against TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL
const TOKEN = 'test-token-0123456789abcdef'

describe.skipIf(!url)('the API', () => {
  let sql: Sql
  let app: ReturnType<typeof createApp>
  const config = (window: number): Config => ({
    databaseUrl: url!,
    token: TOKEN,
    port: 0,
    versionWindowSeconds: window,
    migrateOnStart: false,
  })

  beforeAll(async () => {
    sql = connect(url!)
    await migrate(sql)
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate files cascade`
    app = createApp(sql, config(300))
  })

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(`http://localhost/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as any })

  test('migrations run once', async () => {
    expect(await migrate(sql)).toEqual([])
  })

  test('creates, reads, renames and deletes a file', async () => {
    const created = await json(await call('POST', '/files', { path: '/notes/today.md', content: '# Hi' }))
    expect(created.status).toBe(201)
    expect(created.body.revision).toBe(1)
    expect(created.body.metadata).toEqual({})

    const byPath = await json(await call('GET', '/files/by-path?path=/notes/today.md'))
    expect(byPath.body.id).toBe(created.body.id)

    const renamed = await json(await call('PATCH', `/files/${created.body.id}`, { path: '/notes/tomorrow.md' }))
    expect(renamed.body.path).toBe('/notes/tomorrow.md')
    expect(renamed.body.content).toBe('# Hi')
    expect(renamed.body.revision).toBe(2)

    const list = await json(await call('GET', '/files'))
    expect(list.body.map((e: { path: string }) => e.path)).toEqual(['/notes/tomorrow.md'])
    expect(list.body[0].content).toBeUndefined()

    expect((await call('DELETE', `/files/${created.body.id}`)).status).toBe(204)
    expect((await call('GET', `/files/${created.body.id}`)).status).toBe(404)
  })

  test('rejects bad paths and file/folder clashes', async () => {
    for (const path of ['notes.md', '/a//b.md', '/a/../b.md', '/a/', '']) {
      expect((await call('POST', '/files', { path })).status).toBe(400)
    }
    await call('POST', '/files', { path: '/a/b.md' })
    expect((await call('POST', '/files', { path: '/a/b.md' })).status).toBe(409)
    expect((await call('POST', '/files', { path: '/a' })).status).toBe(409)
    expect((await call('POST', '/files', { path: '/a/b.md/c.md' })).status).toBe(409)
    const other = await json(await call('POST', '/files', { path: '/c.md' }))
    expect((await call('PATCH', `/files/${other.body.id}`, { path: '/a/b.md' })).status).toBe(409)
  })

  test('metadata must be a JSON object', async () => {
    expect((await call('POST', '/files', { path: '/m.md', metadata: [1] })).status).toBe(400)
    const file = await json(await call('POST', '/files', { path: '/m.md', metadata: { seen: 1 } }))
    const updated = await json(await call('PATCH', `/files/${file.body.id}`, { metadata: { seen: 2, tags: ['x'] } }))
    expect(updated.body.metadata).toEqual({ seen: 2, tags: ['x'] })
  })

  test('if_revision refuses to write over a newer version', async () => {
    const file = await json(await call('POST', '/files', { path: '/r.md', content: 'one' }))
    await call('PATCH', `/files/${file.body.id}`, { content: 'two', if_revision: 1 })
    const stale = await json(await call('PATCH', `/files/${file.body.id}`, { content: 'three', if_revision: 1 }))
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('stale')
    expect((await json(await call('GET', `/files/${file.body.id}`))).body.content).toBe('two')
  })

  test('history folds saves by the same author and splits by author', async () => {
    const file = await json(await call('POST', '/files', { path: '/h.md', content: 'a' }))
    await call('PATCH', `/files/${file.body.id}`, { content: 'ab' })
    await call('PATCH', `/files/${file.body.id}`, { content: 'abc' })
    let versions = (await json(await call('GET', `/files/${file.body.id}/versions`))).body
    expect(versions.map((v: { version: number; author: string }) => [v.version, v.author])).toEqual([[1, 'agent']])

    // A checkpoint, or another author, starts a new version.
    await call('PATCH', `/files/${file.body.id}`, { content: 'abcd', checkpoint: true })
    versions = (await json(await call('GET', `/files/${file.body.id}/versions`))).body
    expect(versions).toHaveLength(2)

    const cookie = await signIn()
    await call('PATCH', `/files/${file.body.id}`, { content: 'by hand' }, { Authorization: '', Cookie: cookie, 'X-Openmemfs': '1' })
    versions = (await json(await call('GET', `/files/${file.body.id}/versions`))).body
    expect(versions[0]).toMatchObject({ version: 3, author: 'user' })

    const v1 = await json(await call('GET', `/files/${file.body.id}/versions/1`))
    expect(v1.body.content).toBe('abc')
  })

  test('with a window of 0 every save is a version, and an unchanged save is none', async () => {
    app = createApp(sql, config(0))
    const file = await json(await call('POST', '/files', { path: '/w.md', content: 'a' }))
    await call('PATCH', `/files/${file.body.id}`, { content: 'b' })
    await call('PATCH', `/files/${file.body.id}`, { content: 'b' })
    expect((await json(await call('GET', `/files/${file.body.id}/versions`))).body).toHaveLength(2)
  })

  test('restoring writes the old version back as a new one', async () => {
    const file = await json(await call('POST', '/files', { path: '/x.md', content: 'old', metadata: { k: 1 } }))
    await call('PATCH', `/files/${file.body.id}`, { content: 'new', metadata: {}, checkpoint: true })
    const restored = await json(await call('POST', `/files/${file.body.id}/versions/1/restore`))
    expect(restored.body).toMatchObject({ content: 'old', metadata: { k: 1 }, revision: 3 })
    const versions = (await json(await call('GET', `/files/${file.body.id}/versions`))).body
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1])
    expect((await call('POST', `/files/${file.body.id}/versions/9/restore`)).status).toBe(404)
  })

  test('access needs the token or a session, and browser writes need the header', async () => {
    expect((await call('GET', '/files', undefined, { Authorization: '' })).status).toBe(401)
    expect((await call('GET', '/files', undefined, { Authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await app.request('http://localhost/api/health')).status).toBe(200)

    const wrong = await app.request('http://localhost/api/session', {
      method: 'POST',
      body: JSON.stringify({ token: 'nope' }),
    })
    expect(wrong.status).toBe(401)

    const cookie = await signIn()
    expect(cookie).toContain('HttpOnly')
    const asUser = { Authorization: '', Cookie: cookie }
    expect((await call('GET', '/session', undefined, asUser)).status).toBe(200)
    expect((await call('POST', '/files', { path: '/u.md' }, asUser)).status).toBe(403)
    const created = await json(await call('POST', '/files', { path: '/u.md' }, { ...asUser, 'X-Openmemfs': '1' }))
    expect(created.status).toBe(201)
  })

  test('unknown API routes are 404 and do not fall through to the editor', async () => {
    expect((await call('GET', '/nope')).status).toBe(404)
  })

  async function signIn(): Promise<string> {
    const res = await app.request('http://localhost/api/session', {
      method: 'POST',
      body: JSON.stringify({ token: TOKEN }),
    })
    expect(res.status).toBe(204)
    return res.headers.get('Set-Cookie')!
  }
})
