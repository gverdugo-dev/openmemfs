import { createFileRoute, redirect } from '@tanstack/react-router'
import { Workspace } from '#/components/Workspace'
import { isSignedIn } from '#/lib/session'
import { placeOf } from '#/lib/place'

/**
 * The workspace. Where it is (the open file and its tab, a folder, a search, a module page) lives in the query
 * string, so a reload or a copied link lands in the same place. It renders in the browser
 * only: the editor reads the DOM from its first render.
 */
export const Route = createFileRoute('/')({
  validateSearch: placeOf,
  beforeLoad: async () => {
    if (!(await isSignedIn())) throw redirect({ to: '/sign-in' })
  },
  ssr: false,
  component: function Index() {
    return <Workspace place={Route.useSearch()} />
  },
})
