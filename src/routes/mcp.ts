import { createFileRoute } from '@tanstack/react-router'
import { getServer } from '#/server/instance'

/** /mcp: the MCP endpoint for agents, in the Hono app of src/server/app.ts. Needs the Bearer token. */
export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      ANY: async ({ request }) => (await getServer()).app.fetch(request),
    },
  },
})
