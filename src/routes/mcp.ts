import { createFileRoute } from '@tanstack/react-router'
import { getServer } from '#/server/instance'

/** /mcp: the MCP endpoint for agents, in the Hono app of src/server/app.ts. Open, like the rest. */
export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      ANY: async ({ request }) => (await getServer()).app.fetch(request),
    },
  },
})
