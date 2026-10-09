import { z } from 'zod'
import { body } from '#/server/http'
import { fileRef, tool, writer } from '#/server/mcp'
import type { ServerModule } from '#/server/module'
import { createSuggestions } from './service'

const proposal = z.object({
  old_string: z.string().describe('the exact text to replace; it has to appear exactly once in the file'),
  new_string: z.string().describe('the text to put instead'),
  reason: z.string().optional().describe('why, in a sentence the owner reads before deciding'),
})

const ids = z.array(z.number().int().positive()).describe('suggestion ids')

/**
 * Suggestions: edits proposed and left waiting for the owner (see service.ts). Proposing never
 * changes the file; accepting writes it like any other write, into the history.
 */
export const suggestions: ServerModule = {
  id: 'suggestions',
  migrations: 'src/modules/suggestions/migrations',
  setup: ({ sql, table, services: { files } }) => {
    const service = createSuggestions(sql, table('suggestions_items'), files)
    return {
      routes(api) {
        api.get('/suggestions', async (c) => {
          const path = c.req.query('path')
          const file = path ? await files.getByPath(path) : undefined
          return c.json(await service.list({ file, status: c.req.query('status') }))
        })
        api.get('/suggestions/counts', async (c) => c.json(await service.counts()))
        api.post('/files/:id/suggestions', async (c) => {
          const { suggestions, author } = await body<{ suggestions?: unknown; author?: string }>(c.req.raw)
          const file = await files.get(c.req.param('id'))
          return c.json(await service.suggest(file, suggestions, author?.trim() || c.get('author')), 201)
        })
        api.post('/suggestions/accept', async (c) => {
          const { ids } = await body<{ ids?: unknown }>(c.req.raw)
          return c.json(await service.accept(ids, c.get('author')))
        })
        api.post('/suggestions/reject', async (c) => {
          const { ids } = await body<{ ids?: unknown }>(c.req.raw)
          return c.json(await service.reject(ids))
        })
      },
      tools(mcp) {
        tool(
          mcp,
          'suggest',
          'Propose changes to a file without making them, such as a review of its writing. Each replaces an exact piece of text that appears once; all are saved or none. The owner accepts or rejects each one.',
          {
            ...fileRef,
            suggestions: z.array(proposal).min(1).describe('the changes, each with its reason'),
            author: z.string().optional().describe('your signature, like the agent or skill name'),
          },
          async (i) => service.suggest(await files.find(i), i.suggestions, i.author?.trim() || writer().author),
        )
        tool(
          mcp,
          'list_suggestions',
          'List suggestions, of one file or of the whole memory: pending by default (stale ones no longer apply), or rejected to learn what the owner does not want.',
          {
            path: z.string().optional().describe('a file; without it, every file'),
            status: z.enum(['pending', 'accepted', 'rejected', 'all']).optional(),
          },
          async (i) => service.list({ file: i.path ? await files.getByPath(i.path) : undefined, status: i.status }),
        )
        tool(
          mcp,
          'accept_suggestions',
          'Apply pending suggestions to their files. Only when the owner asks you to.',
          { ids },
          async (i) => service.accept(i.ids, writer().author),
        )
        tool(mcp, 'reject_suggestions', 'Reject pending suggestions; they stay listed as rejected.', { ids }, async (i) =>
          service.reject(i.ids),
        )
      },
    }
  },
}
