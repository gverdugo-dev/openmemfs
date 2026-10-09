import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import { serverModules } from '#/modules/server'
import { createApp } from './app'
import type { Config } from './config'
import type { ServerModule } from './module'
import { connect, type Sql } from './db'
import { migrate } from './migrate'

// These tests empty the tables, so they only run against TEST_DATABASE_URL, never DATABASE_URL.
const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('the API', () => {
  let sql: Sql
  let app: ReturnType<typeof createApp>
  const config = (window: number): Config => ({
    databaseUrl: url!,
    versionWindowSeconds: window,
    migrateOnStart: false,
  })

  beforeAll(async () => {
    sql = connect(url!)
    await migrate(sql)
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate files, folders, tags, categories cascade`
    app = createApp(sql, config(300))
  })

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(`http://localhost/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
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

    await call('PATCH', `/files/${file.body.id}`, { content: 'by hand' }, { 'X-Openmemfs': '1' })
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

  test('everything is open: no token, no session', async () => {
    expect((await app.request('http://localhost/api/health')).status).toBe(200)
    expect((await call('GET', '/files')).status).toBe(200)
    expect((await call('POST', '/files', { path: '/u.md' })).status).toBe(201)
  })

  test('unknown API routes are 404 and do not fall through to the editor', async () => {
    expect((await call('GET', '/nope')).status).toBe(404)
  })

  test('searches by name and by content, and filters by folder', async () => {
    await call('POST', '/files', { path: '/notes/plan.md', content: 'Ship the 50% beta on Friday' })
    await call('POST', '/files', { path: '/notes/beta.md', content: 'nothing here' })
    await call('POST', '/files', { path: '/work/plan.md', content: 'BETA again' })
    const paths = async (query: string) =>
      (await json(await call('GET', `/files?${query}`))).body.map((e: { path: string }) => e.path)

    expect(await paths('q=beta')).toEqual(['/notes/beta.md', '/notes/plan.md', '/work/plan.md'])
    expect(await paths('q=beta&in=name')).toEqual(['/notes/beta.md'])
    expect(await paths('q=beta&in=content')).toEqual(['/notes/plan.md', '/work/plan.md'])
    expect(await paths('q=50%25')).toEqual(['/notes/plan.md'])
    expect(await paths('q=5_%25')).toEqual([])
    expect(await paths('q=plan&prefix=/work/')).toEqual(['/work/plan.md'])
    const [hit] = (await json(await call('GET', '/files?q=friday&in=content'))).body
    expect(hit.snippet).toContain('on Friday')
    expect((await call('GET', '/files?in=everywhere')).status).toBe(400)
  })

  test('tags relate to files and folders, and folder tags reach the files under them', async () => {
    const a = await json(await call('POST', '/files', { path: '/clients/acme/brief.md' }))
    const b = await json(await call('POST', '/files', { path: '/clients/acme/notes.md' }))
    await call('POST', '/files', { path: '/personal/todo.md' })

    const tagged = await json(await call('POST', `/files/${a.body.id}/tags`, { tag: 'Urgent' }))
    expect(tagged.body.tags).toEqual(['Urgent'])
    expect(tagged.body.revision).toBe(1)
    await call('POST', `/files/${a.body.id}/tags`, { tag: 'urgent' })
    expect((await json(await call('GET', '/tags'))).body).toMatchObject([{ name: 'Urgent', files: 1 }])

    expect((await json(await call('POST', '/folders/tags', { folder: '/clients/', tag: 'work' }))).body).toEqual(['work'])
    expect((await call('POST', '/folders/tags', { folder: '/nowhere/', tag: 'work' })).status).toBe(404)
    expect((await call('POST', '/folders/tags', { folder: '/', tag: 'work' })).status).toBe(400)
    const inherited = await json(await call('GET', `/files/${b.body.id}`))
    expect(inherited.body.folder_tags).toEqual([{ folder: '/clients/', tag: 'work' }])

    const paths = async (query: string) =>
      (await json(await call('GET', `/files?${query}`))).body.map((e: { path: string }) => e.path)
    expect(await paths('tag=work')).toEqual(['/clients/acme/brief.md', '/clients/acme/notes.md'])
    expect(await paths('tag=work&tag=URGENT')).toEqual(['/clients/acme/brief.md'])
    expect(await paths('tag=missing')).toEqual([])

    await call('PATCH', '/tags/urgent', { name: 'Now' })
    expect((await json(await call('GET', `/files/${a.body.id}`))).body.tags).toEqual(['Now'])
    expect((await call('POST', '/tags', { name: 'now' })).status).toBe(409)
    await call('DELETE', `/files/${a.body.id}/tags/now`)
    expect((await json(await call('GET', `/files/${a.body.id}`))).body.tags).toEqual([])
    expect((await call('DELETE', '/tags/work')).status).toBe(204)
    expect(await paths('tag=work')).toEqual([])
  })

  test('categories have subcategories, and a category filter finds both', async () => {
    const work = await json(await call('POST', '/categories', { name: 'Work' }))
    const clients = await json(await call('POST', '/categories', { name: 'Clients', parent_id: work.body.id }))
    expect(clients.body.parent_id).toBe(work.body.id)
    expect((await call('POST', '/categories', { name: 'Deep', parent_id: clients.body.id })).status).toBe(400)
    expect((await call('POST', '/categories', { name: 'work' })).status).toBe(409)
    expect((await call('POST', '/categories', { name: 'Clients' })).status).toBe(201)

    const f1 = await json(await call('POST', '/files', { path: '/a.md' }))
    const f2 = await json(await call('POST', '/files', { path: '/b.md' }))
    await call('POST', '/files', { path: '/c.md' })
    const put = await json(await call('PUT', `/files/${f1.body.id}/category`, { category_id: work.body.id }))
    expect(put.body).toMatchObject({ category_id: work.body.id, revision: 1 })
    await call('PUT', `/files/${f2.body.id}/category`, { category_id: clients.body.id })

    const paths = async (id: string) =>
      (await json(await call('GET', `/files?category=${id}`))).body.map((e: { path: string }) => e.path)
    expect(await paths(work.body.id)).toEqual(['/a.md', '/b.md'])
    expect(await paths(clients.body.id)).toEqual(['/b.md'])

    await call('DELETE', `/categories/${work.body.id}`)
    expect((await json(await call('GET', `/files/${f2.body.id}`))).body.category_id).toBeNull()
    expect((await json(await call('GET', '/categories'))).body.map((c: { name: string }) => c.name)).toEqual(['Clients'])
  })

  test('tags and categories have a colour from the palette, set, kept and changed', async () => {
    const tag = await json(await call('POST', '/tags', { name: 'Red', color: 'red' }))
    expect(tag.body.color).toBe('red')
    expect((await call('POST', '/tags', { name: 'Bad', color: 'teal' })).status).toBe(400)
    const picked = await json(await call('POST', '/tags', { name: 'Picked' }))
    expect(picked.body.color).not.toBe('gray')
    const renamed = await json(await call('PATCH', '/tags/red', { name: 'Crimson' }))
    expect(renamed.body).toMatchObject({ name: 'Crimson', color: 'red' })
    expect((await json(await call('PATCH', '/tags/crimson', { color: 'blue' }))).body).toMatchObject({ name: 'Crimson', color: 'blue' })

    const work = await json(await call('POST', '/categories', { name: 'Work', color: 'green' }))
    const sub = await json(await call('POST', '/categories', { name: 'Clients', parent_id: work.body.id, color: 'yellow' }))
    expect(sub.body.color).toBe('yellow')
    const changed = await json(await call('PATCH', `/categories/${work.body.id}`, { color: 'purple' }))
    expect(changed.body).toMatchObject({ name: 'Work', color: 'purple' })
    expect((await call('PATCH', `/categories/${work.body.id}`, { color: 'nope' })).status).toBe(400)
  })

  test('a commit names the latest version, and the next save starts a new one', async () => {
    const file = await json(await call('POST', '/files', { path: '/c.md', content: 'one' }))
    const id = file.body.id
    expect((await call('POST', `/files/${id}/commit`, { message: '  ' })).status).toBe(400)
    const committed = await json(await call('POST', `/files/${id}/commit`, { message: 'First draft' }))
    expect(committed.status).toBe(201)
    expect(committed.body).toMatchObject({ version: 1, message: 'First draft' })
    expect((await call('POST', `/files/${id}/commit`, { message: 'Again' })).status).toBe(400)

    await call('PATCH', `/files/${id}`, { content: 'two' })
    const versions = (await json(await call('GET', `/files/${id}/versions`))).body
    expect(versions.map((v: { version: number; message: string | null }) => [v.version, v.message])).toEqual([
      [2, null],
      [1, 'First draft'],
    ])
    expect((await json(await call('GET', `/files/${id}/versions/1`))).body.content).toBe('one')
  })

  test('folders can be created empty, are listed with the folders of files, and deleted when empty', async () => {
    await call('POST', '/files', { path: '/docs/a.md' })
    expect((await call('POST', '/folders', { path: '/ideas/later' })).status).toBe(201)
    expect((await json(await call('GET', '/folders'))).body).toEqual(['/docs/', '/ideas/', '/ideas/later/'])
    expect((await call('POST', '/folders', { path: '/docs/' })).status).toBe(409)
    expect((await call('POST', '/folders', { path: '/docs/a.md/' })).status).toBe(409)
    expect((await call('POST', '/files', { path: '/ideas/later' })).status).toBe(409)
    expect((await call('POST', '/folders/tags', { folder: '/ideas/', tag: 'someday' })).status).toBe(200)

    await call('POST', '/files', { path: '/ideas/later/one.md' })
    expect((await call('DELETE', '/folders?path=/ideas/')).status).toBe(409)
    const file = await json(await call('GET', '/files/by-path?path=/ideas/later/one.md'))
    await call('DELETE', `/files/${file.body.id}`)
    expect((await call('DELETE', '/folders?path=/ideas/')).status).toBe(200)
    expect((await json(await call('GET', '/folders'))).body).toEqual(['/docs/'])
    expect((await call('DELETE', '/folders?path=/ideas/')).status).toBe(404)
  })

  test('a folder moves with its files, empty folders and tags, and not onto something taken', async () => {
    await call('POST', '/files', { path: '/a/one.md' })
    await call('POST', '/files', { path: '/a/b/two.md' })
    await call('POST', '/files', { path: '/c/three.md' })
    await call('POST', '/folders', { path: '/a/empty/' })
    await call('POST', '/folders/tags', { folder: '/a/b/', tag: 'deep' })

    expect((await call('POST', '/folders/move', { from: '/a/', to: '/c/' })).status).toBe(409)
    expect((await call('POST', '/folders/move', { from: '/a/', to: '/a/b/x/' })).status).toBe(400)
    expect((await call('POST', '/folders/move', { from: '/nope/', to: '/x/' })).status).toBe(404)

    const moved = await json(await call('POST', '/folders/move', { from: '/a/', to: '/c/a/' }))
    expect(moved.body).toEqual({ path: '/c/a/' })
    const list = await json(await call('GET', '/files'))
    expect(list.body.map((f: { path: string }) => f.path)).toEqual(['/c/a/b/two.md', '/c/a/one.md', '/c/three.md'])
    expect(list.body[0].folder_tags).toEqual(['deep'])
    expect((await json(await call('GET', '/folders'))).body).toEqual(['/c/', '/c/a/', '/c/a/b/', '/c/a/empty/'])
  })

  test('edit replaces a piece that appears exactly once', async () => {
    const file = await json(await call('POST', '/files', { path: '/e.md', content: 'one two two' }))
    expect((await call('POST', `/files/${file.body.id}/edit`, { old_string: 'two', new_string: '2' })).status).toBe(400)
    const edited = await json(await call('POST', `/files/${file.body.id}/edit`, { old_string: 'one', new_string: '1' }))
    expect(edited.body).toMatchObject({ content: '1 two two', revision: 2 })
  })

  test('MCP tools reach the same services', async () => {
    const rpc = (method: string, params: unknown) =>
      app.request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
    const callTool = async (name: string, args: unknown) => {
      const { result } = (await (await rpc('tools/call', { name, arguments: args })).json()) as any
      const text: string = result.content[0].text
      return { error: result.isError === true, value: result.isError ? text : JSON.parse(text) }
    }

    const list = (await (await rpc('tools/list', {})).json()) as any
    const names = list.result.tools.map((t: { name: string }) => t.name)
    for (const name of ['list_files', 'create_file', 'edit_file', 'tag_folder', 'create_category', 'update_tag', 'update_category', 'restore_version']) {
      expect(names).toContain(name)
    }

    const created = await callTool('create_file', { path: '/mcp/note.md', content: 'from an agent' })
    expect(created.value.path).toBe('/mcp/note.md')
    expect((await callTool('tag_file', { path: '/mcp/note.md', tag: 'ai' })).value.tags).toEqual(['ai'])
    const cat = await callTool('create_category', { name: 'Inbox', color: 'blue' })
    expect(cat.value.color).toBe('blue')
    expect((await callTool('update_tag', { name: 'ai', color: 'pink' })).value.color).toBe('pink')
    await callTool('set_file_category', { path: '/mcp/note.md', category_id: cat.value.id })
    const found = await callTool('list_files', { tags: ['ai'], category_id: cat.value.id, query: 'agent' })
    expect(found.value.map((e: { path: string }) => e.path)).toEqual(['/mcp/note.md'])
    expect((await callTool('read_file', { path: '/nope.md' })).error).toBe(true)

    const versions = await callTool('list_versions', { path: '/mcp/note.md' })
    expect(versions.value).toMatchObject([{ version: 1, author: 'agent' }])
    const commit = await callTool('commit_file', { path: '/mcp/note.md', message: 'From the agent' })
    expect(commit.value).toMatchObject({ version: 1, message: 'From the agent' })

    const rules = await callTool('get_organisation', {})
    expect(rules.value).toMatchObject({ path: '/organisation.md', seeded: true })
  })

  test('search finds every word, in names, whole paths or content', async () => {
    await call('POST', '/files', { path: '/projects/zeporro/ideas.md', content: 'A burger with legs walks into town' })
    await call('POST', '/files', { path: '/notes/burger.md', content: 'nothing here' })
    await call('POST', '/files', { path: '/notes/legs.md', content: 'walks only' })
    const paths = async (q: string) => (await json(await call('GET', `/files?${q}`))).body.map((e: { path: string }) => e.path)

    expect(await paths('q=legs burger&words=true')).toEqual(['/projects/zeporro/ideas.md'])
    expect(await paths('q=legs burger')).toEqual([])
    expect(await paths('q=zeporro&in=path')).toEqual(['/projects/zeporro/ideas.md'])
    expect(await paths('q=zeporro')).toEqual([])
    expect(await paths('q=burger&in=name')).toEqual(['/notes/burger.md'])
    expect(await paths('limit=2')).toHaveLength(2)
    expect((await call('GET', '/files?limit=0')).status).toBe(400)
    expect((await call('GET', '/files?in=everywhere')).status).toBe(400)
    const hit = (await json(await call('GET', '/files?q=town walks&words=true&in=content'))).body
    expect(hit.map((e: { path: string }) => e.path)).toEqual(['/projects/zeporro/ideas.md'])
    expect(hit[0].snippet).toContain('town')
  })

  test('the tree and the contents of a folder', async () => {
    await call('POST', '/files', { path: '/a/one.md' })
    await call('POST', '/files', { path: '/a/b/two.md' })
    await call('POST', '/files', { path: '/a/b/c/three.md' })
    await call('POST', '/folders', { path: '/a/empty/' })
    await call('POST', '/files', { path: '/top.md' })
    const tree = (await json(await call('GET', '/folders/tree'))).body
    expect(tree).toMatchObject({ path: '/', files: 4 })
    const a = tree.folders.find((f: { path: string }) => f.path === '/a/')
    expect(a).toMatchObject({ name: 'a', files: 3 })
    expect(a.folders.map((f: { name: string; files: number }) => [f.name, f.files])).toEqual([['b', 2], ['empty', 0]])
    expect(a.folders[0].folders[0]).toMatchObject({ path: '/a/b/c/', files: 1, folders: [] })

    const shallow = (await json(await call('GET', '/folders/tree?path=/a/&depth=1'))).body
    expect(shallow.folders[0]).toMatchObject({ path: '/a/b/', files: 2, folders: [] })
    expect((await call('GET', '/folders/tree?path=/nope/')).status).toBe(404)

    const contents = (await json(await call('GET', '/folders/contents?path=/a/'))).body
    expect(contents.folders).toEqual([
      { path: '/a/b/', name: 'b', files: 2 },
      { path: '/a/empty/', name: 'empty', files: 0 },
    ])
    expect(contents.files.map((f: { path: string }) => f.path)).toEqual(['/a/one.md'])
  })

  test('reads a window of lines, writes, appends and replaces every occurrence', async () => {
    const written = await json(await call('PUT', '/files/by-path', { path: '/w.md', content: 'one\ntwo\nthree\nfour' }))
    expect(written.body.revision).toBe(1)
    const window = (await json(await call('GET', '/files/by-path?path=/w.md&offset=2&limit=2'))).body
    expect(window).toMatchObject({ content: 'two\nthree', total_lines: 4, offset: 2 })
    expect((await call('GET', '/files/by-path?path=/w.md&offset=0')).status).toBe(400)

    const replaced = await json(await call('PUT', '/files/by-path', { path: '/w.md', content: 'a a a', if_revision: 1 }))
    expect(replaced.body).toMatchObject({ content: 'a a a', revision: 2 })
    expect((await call('PUT', '/files/by-path', { path: '/w.md', content: 'x', if_revision: 1 })).status).toBe(409)
    expect((await call('PUT', '/files/by-path', { path: '/w.md', content: 'x', if_absent: true })).status).toBe(409)
    expect((await call('PUT', '/files/by-path', { path: '/gone.md', content: 'x', if_revision: 3 })).status).toBe(409)

    const edited = await json(await call('POST', `/files/${written.body.id}/edit`, { old_string: 'a', new_string: 'b', replace_all: true }))
    expect(edited.body.content).toBe('b b b')
    expect((await call('POST', `/files/${written.body.id}/edit`, { old_string: 'zzz', new_string: 'b' })).status).toBe(400)

    await call('POST', '/files/append', { path: '/log.md', content: 'first' })
    const appended = await json(await call('POST', '/files/append', { path: '/log.md', content: '\nsecond' }))
    expect(appended.body).toMatchObject({ content: 'first\nsecond', revision: 2 })
  })

  test('deletes a folder with its files to the trash', async () => {
    await call('POST', '/files', { path: '/old/a.md' })
    await call('POST', '/files', { path: '/old/b/c.md' })
    expect((await call('DELETE', '/folders?path=/old/')).status).toBe(409)
    const gone = await json(await call('DELETE', '/folders?path=/old/&recursive=true'))
    expect(gone.body).toEqual({ trashed: ['/old/a.md', '/old/b/c.md'] })
    expect((await json(await call('GET', '/folders'))).body).toEqual([])
    expect((await json(await call('GET', '/trash'))).body).toHaveLength(2)
    expect((await call('DELETE', '/folders?path=/&recursive=true')).status).toBe(400)
  })

  test('changes, commits across files, the log and diffs', async () => {
    const a = await json(await call('POST', '/files', { path: '/h/a.md', content: 'one\ntwo' }))
    await call('POST', '/files', { path: '/h/b.md', content: 'b' })
    await call('POST', '/files', { path: '/other.md', content: 'o' })
    const changes = (await json(await call('GET', '/history/changes?prefix=/h/'))).body
    expect(changes.map((c: { path: string; committed: number | null }) => [c.path, c.committed])).toEqual([
      ['/h/a.md', null],
      ['/h/b.md', null],
    ])

    const committed = await json(await call('POST', '/history/commit', { prefix: '/h/', message: 'First notes' }))
    expect(committed.status).toBe(201)
    expect(committed.body).toHaveLength(2)
    expect((await call('POST', '/history/commit', { prefix: '/h/', message: 'Again' })).status).toBe(400)
    expect((await json(await call('GET', '/history/changes'))).body.map((c: { path: string }) => c.path)).toEqual(['/other.md'])

    await call('PATCH', `/files/${a.body.id}`, { content: 'one\nTWO\nthree', checkpoint: true })
    const diff = (await json(await call('GET', `/files/${a.body.id}/diff`))).body
    expect(diff).toMatchObject({ from: 1, to: null, added: 2, removed: 1, metadata_changed: false })
    expect(diff.diff).toBe(' one\n-two\n+TWO\n+three')
    expect((await json(await call('GET', `/files/${a.body.id}/diff?from=1&to=2`))).body.to).toBe(2)

    const log = (await json(await call('GET', '/history/commits'))).body
    expect(log.map((c: { path: string; message: string }) => [c.path, c.message]).sort()).toEqual([
      ['/h/a.md', 'First notes'],
      ['/h/b.md', 'First notes'],
    ])
    expect((await call('GET', '/history/commits?limit=0')).status).toBe(400)
  })

  test('MCP has the tools an agent needs to find its way', async () => {
    const rpc = (method: string, params: unknown) =>
      app.request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
    const callTool = async (name: string, args: unknown) => {
      const { result } = (await (await rpc('tools/call', { name, arguments: args })).json()) as any
      const text: string = result.content[0].text
      return { error: result.isError === true, value: result.isError ? text : JSON.parse(text) }
    }
    const tools = ((await (await rpc('tools/list', {})).json()) as any).result.tools as { name: string; annotations: any }[]
    const byName = new Map(tools.map((t) => [t.name, t]))
    for (const name of ['get_tree', 'list_folder', 'search_files', 'write_file', 'append_file', 'get_diff', 'list_changes', 'commit_changes', 'list_commits']) {
      expect(byName.has(name)).toBe(true)
    }
    expect(byName.get('search_files')!.annotations.readOnlyHint).toBe(true)
    expect(byName.get('append_file')!.annotations.destructiveHint).toBe(false)

    await callTool('write_file', { path: '/agent/plan.md', content: 'Ship the search tools\nthen the tree' })
    await callTool('append_file', { path: '/agent/plan.md', content: '\nthen commit' })
    const found = await callTool('search_files', { query: 'tree ship' })
    expect(found.value.map((e: { path: string }) => e.path)).toEqual(['/agent/plan.md'])
    expect((await callTool('search_files', { query: 'tree ship', exact: true })).value).toEqual([])
    expect((await callTool('get_tree', {})).value.folders[0]).toMatchObject({ path: '/agent/', files: 1 })
    expect((await callTool('list_folder', { folder: '/agent/' })).value.files).toHaveLength(1)
    expect((await callTool('read_file', { path: '/agent/plan.md', offset: 3 })).value).toMatchObject({ content: 'then commit', total_lines: 3 })
    expect((await callTool('list_changes', {})).value.map((c: { path: string }) => c.path)).toContain('/agent/plan.md')
    expect((await callTool('get_diff', { path: '/agent/plan.md' })).value.to).toBe(null)
    expect((await callTool('commit_changes', { folder: '/agent/', message: 'Plan' })).value).toHaveLength(1)
    expect((await callTool('list_commits', {})).value[0]).toMatchObject({ path: '/agent/plan.md', message: 'Plan' })
  })

  test('/organisation.md is written from the template once, and cannot be moved or deleted', async () => {
    const first = await json(await call('GET', '/organisation'))
    expect(first.status).toBe(200)
    expect(first.body.seeded).toBe(true)
    expect(first.body.content).toContain('Open Knowledge Format')
    expect(first.body.content).not.toContain('{{now}}')
    expect(Date.parse(first.body.now)).not.toBeNaN()

    const file = (await json(await call('GET', '/files/by-path?path=/organisation.md'))).body
    await call('POST', `/files/${file.id}/edit`, { old_string: '**The owner is `human:owner`.**', new_string: '**The owner is `human:me`.**' })
    const second = await json(await call('GET', '/organisation'))
    expect(second.body.seeded).toBe(false)
    expect(second.body.content).toContain('human:me')

    const moved = await json(await call('PATCH', `/files/${file.id}`, { path: '/rules.md' }))
    expect(moved).toMatchObject({ status: 400, body: { code: 'invalid' } })
    const deleted = await json(await call('DELETE', `/files/${file.id}`))
    expect(deleted).toMatchObject({ status: 400, body: { code: 'invalid' } })
    expect((await call('GET', '/files/by-path?path=/organisation.md')).status).toBe(200)
  })

  test('requests a browser page on another site could send are refused', async () => {
    const page = (headers: Record<string, string>, url = 'http://localhost/api/files') =>
      app.request(url, { method: 'POST', headers, body: JSON.stringify({ path: '/x.md' }) })
    expect((await page({ 'Content-Type': 'application/json', Origin: 'https://evil.example' })).status).toBe(403)
    expect((await page({ 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await page({ 'Content-Type': 'text/plain' })).status).toBe(415)
    expect((await page({ 'Content-Type': 'application/json' }, 'http://rebound.example/api/files')).status).toBe(403)
    expect((await page({ 'Content-Type': 'application/json' }, 'http://rebound.example/mcp')).status).toBe(403)
    expect((await page({ 'Content-Type': 'application/json', Origin: 'http://localhost' })).status).toBe(201)

    const open = createApp(sql, { ...config(300), allowedHosts: ['memory.example.com'] })
    const res = await open.request('http://memory.example.com/api/files', { headers: { Origin: 'http://memory.example.com' } })
    expect(res.status).toBe(200)
  })

  test('metadata Postgres would refuse is a 400, not a 500', async () => {
    const res = await json(await call('POST', '/files', { path: '/m.md', metadata: { a: 'x\u0000y' } }))
    expect(res).toMatchObject({ status: 400, body: { code: 'invalid' } })
  })

  test('deleting the last file of a folder drops the folder tags', async () => {
    const file = (await json(await call('POST', '/files', { path: '/gone/a.md' }))).body
    await call('POST', '/folders/tags', { folder: '/gone/', tag: 'old' })
    await call('DELETE', `/files/${file.id}`)
    expect((await sql`select 1 from folder_tags where folder = '/gone/'`).length).toBe(0)
    await call('POST', '/files', { path: '/gone/b.md' })
    const again = await json(await call('GET', '/folders/tags?folder=/gone/'))
    expect(again.body).toEqual([])
  })

  test('a schema of its own keeps every table there, with no search_path to lean on', async () => {
    await sql`drop schema if exists om_schema_test cascade`
    // A connection whose search_path finds nothing, like a pooler that does not keep it.
    const bare = postgres(url!, { prepare: false, onnotice: () => {}, connection: { search_path: 'nowhere' } })
    try {
      const applied = await migrate(bare, serverModules, 'om_schema_test')
      expect(applied).toContain('core/0001_files.sql')
      expect(await migrate(bare, serverModules, 'om_schema_test')).toEqual([])
      const own = createApp(bare, { ...config(300), schema: 'om_schema_test' })
      const req = (method: string, path: string, body?: unknown) =>
        own.request(`http://localhost/api${path}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      const file = (await (await req('POST', '/files', { path: '/s/a.md', content: 'here' })).json()) as any
      expect(file.path).toBe('/s/a.md')
      expect((await req('POST', `/files/${file.id}/tags`, { tag: 'x' })).status).toBe(200)
      expect((await req('POST', `/files/${file.id}/commit`, { message: 'first' })).status).toBe(201)
      const rows = await sql<{ n: number }[]>`select count(*)::int as n from om_schema_test.files`
      expect(rows[0]!.n).toBe(1)
      expect((await sql`select 1 from files where path = '/s/a.md'`).length).toBe(0)
    } finally {
      await bare.end()
      await sql`drop schema if exists om_schema_test cascade`
    }
  })

  test('deleting moves a file to the trash, with its history, until the trash is emptied', async () => {
    const file = (await json(await call('POST', '/files', { path: '/t/a.md', content: 'one' }))).body
    await call('POST', `/files/${file.id}/tags`, { tag: 'keep' })
    await call('POST', `/files/${file.id}/commit`, { message: 'first' })
    expect((await call('DELETE', `/files/${file.id}`)).status).toBe(204)
    expect((await call('GET', '/files/by-path?path=/t/a.md')).status).toBe(404)
    expect((await json(await call('GET', '/files'))).body.some((e: { path: string }) => e.path === '/t/a.md')).toBe(false)

    const trash = await json(await call('GET', '/trash'))
    expect(trash.body).toMatchObject([{ id: file.id, path: '/t/a.md' }])

    // Its path is free again; restoring there is a conflict, restoring elsewhere is not.
    const other = (await json(await call('POST', '/files', { path: '/t/a.md', content: 'two' }))).body
    expect((await json(await call('POST', `/trash/${file.id}/restore`, {}))).status).toBe(409)
    const back = await json(await call('POST', `/trash/${file.id}/restore`, { path: '/t/b.md' }))
    expect(back.body).toMatchObject({ path: '/t/b.md', content: 'one', tags: ['keep'] })
    const versions = (await json(await call('GET', `/files/${file.id}/versions`))).body
    expect(versions.some((v: { message: string | null }) => v.message === 'first')).toBe(true)

    await call('DELETE', `/files/${other.id}`)
    await call('DELETE', `/files/${back.body.id}`)
    expect((await json(await call('DELETE', `/trash/${other.id}`))).body).toEqual({ deleted: 1 })
    expect((await json(await call('DELETE', '/trash'))).body).toEqual({ deleted: 1 })
    expect((await json(await call('GET', '/trash'))).body).toEqual([])
  })

  test('a module closes the memory, names the author and narrows the reach', async () => {
    const gate: ServerModule = {
      id: 'gate',
      setup: () => ({
        openRoutes: (root) => root.post('/api/gate/callback', (c) => c.text('open')),
        middleware: async (c, next) => {
          const who = c.req.header('x-who')
          if (!who) return c.json({ error: 'sign in' }, 401)
          c.set('author', who)
          if (who !== 'owner@example.com') c.set('reach', ['/shared/'])
          return next()
        },
        contentLimit: (file) => (file.metadata.big === true ? 2 * 1024 * 1024 : undefined),
      }),
    }
    const closed = createApp(sql, config(0), [...serverModules, gate])
    const as = (who: string | null, method: string, path: string, body?: unknown) =>
      closed.request(`http://localhost${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(who ? { 'x-who': who } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    const owner = 'owner@example.com'
    const guest = 'guest@example.com'

    expect((await as(null, 'GET', '/api/files')).status).toBe(401)
    expect((await as(null, 'POST', '/mcp', {})).status).toBe(401)
    expect(await (await closed.request('http://localhost/api/gate/callback', { method: 'POST', body: 'a=1' })).text()).toBe('open')
    expect((await as(null, 'GET', '/api/health')).status).toBe(200)

    const secret = (await (await as(owner, 'POST', '/api/files', { path: '/private/s.md', content: 'secret' })).json()) as any
    const shared = (await (await as(owner, 'POST', '/api/files', { path: '/shared/a.md', content: 'hi' })).json()) as any

    // The guest sees only its folder; outside it a file answers as if it did not exist.
    const listed = (await (await as(guest, 'GET', '/api/files')).json()) as { path: string }[]
    expect(listed.map((e) => e.path)).toEqual(['/shared/a.md'])
    expect((await as(guest, 'GET', `/api/files/${secret.id}`)).status).toBe(404)
    expect((await as(guest, 'GET', '/api/files/by-path?path=/private/s.md')).status).toBe(404)
    expect((await as(guest, 'PATCH', `/api/files/${secret.id}`, { content: 'x' })).status).toBe(404)
    expect((await as(guest, 'DELETE', `/api/files/${secret.id}`)).status).toBe(404)
    expect((await as(guest, 'POST', '/api/files', { path: '/private/new.md' })).status).toBe(404)
    expect((await as(guest, 'PATCH', `/api/files/${shared.id}`, { path: '/private/moved.md' })).status).toBe(404)
    expect((await as(guest, 'POST', '/api/folders/move', { from: '/private/', to: '/shared/p/' })).status).toBe(404)
    const clash = (await (await as(guest, 'POST', '/api/files', { path: '/private' })).json()) as any
    expect(clash.error).not.toContain('/private/s.md')
    expect((await (await as(guest, 'GET', '/api/folders')).json()) as string[]).toEqual(['/shared/'])
    const rules = (await (await as(guest, 'GET', '/api/organisation')).json()) as any
    expect(rules.path).toBe('/organisation.md')

    const mcpAs = async (who: string, name: string, args: unknown) => {
      const res = await closed.request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'x-who': who },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      })
      const { result } = (await res.json()) as any
      return { error: result.isError === true, text: result.content[0].text as string }
    }
    const viaMcp = JSON.parse((await mcpAs(guest, 'list_files', {})).text) as { path: string }[]
    expect(viaMcp.map((e) => e.path)).toEqual(['/shared/a.md'])
    expect((await mcpAs(guest, 'read_file', { path: '/private/s.md' })).error).toBe(true)
    await mcpAs(guest, 'create_file', { path: '/shared/agent.md', content: 'by mcp' })
    const byAgent = JSON.parse((await mcpAs(owner, 'list_versions', { path: '/shared/agent.md' })).text) as any[]
    expect(byAgent[0].author).toBe(guest)

    // Its writes carry its name into the history, through both doors.
    await as(guest, 'PATCH', `/api/files/${shared.id}`, { content: 'hello' })
    const versions = (await (await as(owner, 'GET', `/api/files/${shared.id}/versions`)).json()) as any[]
    expect(versions[0].author).toBe(guest)

    // A module can grant some files more room than the core's 1 MiB.
    const big = 'x'.repeat(1024 * 1024 + 10)
    expect((await as(owner, 'POST', '/api/files', { path: '/shared/b.md', content: big })).status).toBe(400)
    expect((await as(owner, 'POST', '/api/files', { path: '/shared/b.md', content: big, metadata: { big: true } })).status).toBe(201)

    const listing = (await (await as(owner, 'GET', '/api/files?prefix=/shared/&metadata=true')).json()) as any[]
    expect(listing.find((e) => e.path === '/shared/b.md').metadata).toEqual({ big: true })
  })
})
