import { body } from './http'
import type { Api } from './module'
import type { Search, Services } from './services'

/**
 * The REST door. Each route reads the request, calls one service and returns its answer:
 * no rule lives here. Every route has an MCP tool twin in `mcp.ts`.
 */
export function coreRoutes(api: Api, { files, folders, tags, categories, organisation }: Services) {
  // The rules of the memory, written from the template the first time
  api.get('/organisation', async (c) => c.json(await organisation.get()))

  // Files
  api.get('/files', async (c) => {
    const search: Search = {
      prefix: c.req.query('prefix'),
      query: c.req.query('q'),
      in: c.req.query('in') as Search['in'],
      words: c.req.query('words') === 'true',
      limit: c.req.query('limit') === undefined ? undefined : Number(c.req.query('limit')),
      tags: c.req.queries('tag'),
      categoryId: c.req.query('category'),
      withMetadata: c.req.query('metadata') === 'true',
    }
    return c.json(await files.search(search))
  })
  // offset and limit read a window of lines of a long file.
  const lines = (c: { req: { query: (k: string) => string | undefined } }) => ({ offset: c.req.query('offset'), limit: c.req.query('limit') })
  api.get('/files/by-path', async (c) => c.json(files.lines(await files.getByPath(c.req.query('path') ?? ''), lines(c))))
  // Create the file at a path, or replace the one there.
  api.put('/files/by-path', async (c) => {
    const input = await body<{ path?: unknown; content?: unknown; metadata?: unknown; if_absent?: unknown; if_revision?: unknown }>(c.req.raw)
    const file = await files.write(
      {
        path: input.path as string,
        content: input.content as string,
        metadata: input.metadata as never,
        ifAbsent: input.if_absent === true,
        ifRevision: input.if_revision as number | undefined,
      },
      { author: c.get('author') },
    )
    return c.json(file)
  })
  api.post('/files/append', async (c) => {
    const { path, content } = await body<{ path?: unknown; content?: unknown }>(c.req.raw)
    return c.json(await files.append(path as string, content, { author: c.get('author') }))
  })
  api.get('/files/:id', async (c) => c.json(files.lines(await files.get(c.req.param('id')), lines(c))))
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
  api.post('/files/:id/edit', async (c) => {
    const input = await body<{ old_string?: unknown; new_string?: unknown; replace_all?: unknown; if_revision?: unknown }>(c.req.raw)
    const file = await files.edit(
      c.req.param('id'),
      {
        oldString: input.old_string as string,
        newString: input.new_string as string,
        replaceAll: input.replace_all === true,
        ifRevision: input.if_revision as number | undefined,
      },
      { author: c.get('author') },
    )
    return c.json(file)
  })
  api.delete('/files/:id', async (c) => {
    await files.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  // The trash: deleted files wait here, with their history, until it is emptied.
  api.get('/trash', async (c) => c.json(await files.trash()))
  api.post('/trash/:id/restore', async (c) => {
    const { path } = await body<{ path?: unknown }>(c.req.raw)
    return c.json(await files.restore(c.req.param('id'), { path }, { author: c.get('author') }))
  })
  api.delete('/trash/:id', async (c) => c.json(await files.emptyTrash(c.req.param('id'))))
  api.delete('/trash', async (c) => c.json(await files.emptyTrash()))

  // A file's category and tags. They are not content: they do not change the revision.
  api.put('/files/:id/category', async (c) => {
    const { category_id } = await body<{ category_id?: unknown }>(c.req.raw)
    return c.json(await files.setCategory(c.req.param('id'), (category_id ?? null) as string | null))
  })
  api.post('/files/:id/tags', async (c) => {
    const { tag } = await body<{ tag?: unknown }>(c.req.raw)
    await tags.tagFile(c.req.param('id'), tag as string)
    return c.json(await files.get(c.req.param('id')))
  })
  api.delete('/files/:id/tags/:tag', async (c) => {
    await tags.untagFile(c.req.param('id'), c.req.param('tag'))
    return c.json(await files.get(c.req.param('id')))
  })

  // Folders. One exists while a file is in it, or because someone created it (then it may be empty).
  api.get('/folders', async (c) => c.json(await folders.list()))
  api.get('/folders/tree', async (c) => c.json(await folders.tree(c.req.query('path'), c.req.query('depth'))))
  api.get('/folders/contents', async (c) =>
    c.json(await folders.contents(c.req.query('path'), { withMetadata: c.req.query('metadata') === 'true' })),
  )
  api.post('/folders', async (c) => {
    const { path } = await body<{ path?: unknown }>(c.req.raw)
    return c.json({ path: await folders.create(path) }, 201)
  })
  api.post('/folders/move', async (c) => {
    const { from, to } = await body<{ from?: unknown; to?: unknown }>(c.req.raw)
    return c.json({ path: await files.moveFolder(from, to, { author: c.get('author') }) })
  })
  api.delete('/folders', async (c) =>
    c.json(await folders.remove(c.req.query('path') ?? '', { recursive: c.req.query('recursive') === 'true' })),
  )

  // A folder's tags. The folder goes in the query: it has slashes of its own.
  api.get('/folders/tags', async (c) => c.json(await tags.ofFolder(c.req.query('folder') ?? '')))
  api.post('/folders/tags', async (c) => {
    const { folder, tag } = await body<{ folder?: unknown; tag?: unknown }>(c.req.raw)
    return c.json(await tags.tagFolder(folder as string, tag as string))
  })
  api.delete('/folders/tags', async (c) =>
    c.json(await tags.untagFolder(c.req.query('folder') ?? '', c.req.query('tag') ?? '')),
  )

  // Tags, named by their name
  api.get('/tags', async (c) => c.json(await tags.list()))
  api.post('/tags', async (c) => {
    const { name, color } = await body<{ name?: unknown; color?: unknown }>(c.req.raw)
    return c.json(await tags.create(name as string, color), 201)
  })
  api.patch('/tags/:name', async (c) => {
    const { name, color } = await body<{ name?: unknown; color?: unknown }>(c.req.raw)
    return c.json(await tags.update(c.req.param('name'), { name, color }))
  })
  api.delete('/tags/:name', async (c) => {
    await tags.remove(c.req.param('name'))
    return c.body(null, 204)
  })

  // Categories and subcategories, named by their id
  api.get('/categories', async (c) => c.json(await categories.list()))
  api.post('/categories', async (c) => {
    const { name, parent_id, color } = await body<{ name?: unknown; parent_id?: unknown; color?: unknown }>(c.req.raw)
    return c.json(await categories.create({ name: name as string, parentId: parent_id as string | null, color }), 201)
  })
  api.patch('/categories/:id', async (c) => {
    const { name, color } = await body<{ name?: unknown; color?: unknown }>(c.req.raw)
    return c.json(await categories.update(c.req.param('id'), { name, color }))
  })
  api.delete('/categories/:id', async (c) => {
    await categories.remove(c.req.param('id'))
    return c.body(null, 204)
  })
}
