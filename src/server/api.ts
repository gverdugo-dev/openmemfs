import { body } from './http'
import type { Api } from './module'
import type { Search, Services } from './services'

/**
 * The REST door. Each route reads the request, calls one service and returns its answer:
 * no rule lives here. Every route has an MCP tool twin in `mcp.ts`.
 */
export function coreRoutes(api: Api, { files, folders, tags, categories }: Services) {
  // Files
  api.get('/files', async (c) => {
    const search: Search = {
      prefix: c.req.query('prefix'),
      query: c.req.query('q'),
      in: c.req.query('in') as Search['in'],
      tags: c.req.queries('tag'),
      categoryId: c.req.query('category'),
    }
    return c.json(await files.search(search))
  })
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
  api.post('/files/:id/edit', async (c) => {
    const input = await body<{ old_string?: unknown; new_string?: unknown; if_revision?: unknown }>(c.req.raw)
    const file = await files.edit(
      c.req.param('id'),
      {
        oldString: input.old_string as string,
        newString: input.new_string as string,
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
  api.post('/folders', async (c) => {
    const { path } = await body<{ path?: unknown }>(c.req.raw)
    return c.json({ path: await folders.create(path) }, 201)
  })
  api.post('/folders/move', async (c) => {
    const { from, to } = await body<{ from?: unknown; to?: unknown }>(c.req.raw)
    return c.json({ path: await files.moveFolder(from, to, { author: c.get('author') }) })
  })
  api.delete('/folders', async (c) => {
    await folders.remove(c.req.query('path') ?? '')
    return c.body(null, 204)
  })

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
