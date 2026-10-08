import { createFileRoute } from '@tanstack/react-router'
import { getServer } from '#/server/instance'

/** /api/*: the core routes and the modules' routes, all in the Hono app of src/server/app.ts. */
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => (await getServer()).api.fetch(request),
    },
  },
})
