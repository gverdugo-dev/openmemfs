import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { serverModules } from '#/modules/server'
import { createApp } from '#/server/app'
import { connect, type Sql } from '#/server/db'
import { migrate } from '#/server/migrate'

// These tests empty the tables, so they only run against TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('the suggestions module', () => {
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
    return { status: res.status, body: (await res.json()) as any }
  }

  test('suggestions wait, go stale when their text changes, and accepting writes the file', async () => {
    const file = (await call('POST', '/files', { path: '/post.md', content: 'One very good line.\n\nAnother very good line.' })).body
    // All or none: the second one does not appear exactly once.
    const bad = await call('POST', `/files/${file.id}/suggestions`, {
      suggestions: [{ old_string: 'One', new_string: 'A' }, { old_string: 'very good', new_string: 'fine' }],
    })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toContain('suggestion 2 of 2')
    expect((await call('GET', '/suggestions')).body).toEqual([])

    const made = await call('POST', `/files/${file.id}/suggestions`, {
      suggestions: [
        { old_string: 'One very', new_string: 'One', reason: 'shorter' },
        { old_string: 'Another', new_string: 'A second', reason: 'clearer' },
        { old_string: 'line.\n\nAnother', new_string: 'line. Another' },
      ],
      author: 'style-reviewer',
    })
    expect(made.status).toBe(201)
    expect(made.body.map((s: any) => s.author)).toEqual(['style-reviewer', 'style-reviewer', 'style-reviewer'])
    expect((await call('GET', '/suggestions/counts')).body).toEqual([{ path: '/post.md', file_id: file.id, pending: 3 }])

    const [first, second, third] = made.body
    // The third overlaps the second: once the second applies, its text is gone.
    const accepted = (await call('POST', '/suggestions/accept', { ids: [first.id, second.id, third.id] })).body
    expect(accepted.accepted).toEqual([first.id, second.id])
    expect(accepted.stale).toEqual([third.id])
    expect(accepted.files[0].content).toBe('One good line.\n\nA second very good line.')
    const left = (await call('GET', '/suggestions?path=/post.md')).body
    expect(left.map((s: any) => [s.id, s.stale])).toEqual([[third.id, true]])

    expect((await call('POST', '/suggestions/accept', { ids: [first.id] })).status).toBe(400)
    expect((await call('POST', '/suggestions/reject', { ids: [third.id] })).body).toEqual({ rejected: 1 })
    expect((await call('GET', '/suggestions?status=rejected')).body.map((s: any) => s.id)).toEqual([third.id])
    expect((await call('GET', '/suggestions?status=all')).body).toHaveLength(3)
  })
})
