import { createFileRoute, redirect } from '@tanstack/react-router'
import { Workspace } from '#/components/Workspace'
import { isSignedIn } from '#/lib/session'
import type { Place } from '#/lib/place'

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/**
 * The workspace. Where it is (the open file, its tab, or a module page) lives in the query
 * string, so a reload or a copied link lands in the same place. It renders in the browser
 * only: the editor reads the DOM from its first render.
 */
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): Place => ({
    path: text(search.path),
    tab: text(search.tab),
    page: text(search.page),
  }),
  beforeLoad: async () => {
    if (!(await isSignedIn())) throw redirect({ to: '/sign-in' })
  },
  ssr: false,
  component: function Index() {
    return <Workspace place={Route.useSearch()} />
  },
})
