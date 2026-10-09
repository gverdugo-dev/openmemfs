import { z } from 'zod'
import { body } from '#/server/http'
import { fileRef, tool, writer } from '#/server/mcp'
import type { ServerModule } from '#/server/module'
import { createLinks } from './service'

/** Links between files (see service.ts). No tables: they live in each file's metadata. */
export const links: ServerModule = {
  id: 'links',
  setup: ({ services: { files } }) => {
    const links = createLinks(files)
    return {
      routes(api) {
        api.get('/files/:id/links', async (c) => c.json(await links.of(await files.get(c.req.param('id')))))
        api.put('/files/:id/links/:rel', async (c) => {
          const { paths, if_revision } = await body<{ paths?: unknown; if_revision?: number }>(c.req.raw)
          const file = await files.get(c.req.param('id'))
          return c.json(await links.set(file, c.req.param('rel'), paths, if_revision, { author: c.get('author') }))
        })
        api.get('/files/:id/backlinks', async (c) => c.json(await links.backlinks(await files.get(c.req.param('id')))))
      },
      tools(mcp) {
        tool(mcp, 'list_links', 'List the files a file links to, by relation and in order (a post and its images, say).', fileRef, async (i) =>
          links.of(await files.find(i)),
        )
        tool(
          mcp,
          'set_links',
          'Set the files a file links to under one relation, in order, replacing the ones it had there. An empty list removes the relation. Links follow files when they move.',
          {
            ...fileRef,
            rel: z.string().describe('the relation, lowercase words joined by hyphens, like image'),
            paths: z.array(z.string()).describe('absolute paths of the targets, in order'),
            if_revision: z.number().int().optional(),
          },
          async (i) => links.set(await files.find(i), i.rel, i.paths, i.if_revision, writer()),
        )
        tool(mcp, 'list_backlinks', 'List the files that link to a file, with the relation of each link.', fileRef, async (i) =>
          links.backlinks(await files.find(i)),
        )
      },
    }
  },
}
