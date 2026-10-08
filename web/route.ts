import { useEffect, useState } from 'react'

/** Where the editor is lives in the query string, so a reload or a copied link lands in the same place. */
export interface Route {
  /** The open file. */
  path?: string
  /** The open tab of that file. */
  tab?: string
  /** A module page, instead of a file. */
  page?: string
}

function read(): Route {
  const q = new URLSearchParams(window.location.search)
  return { path: q.get('path') ?? undefined, tab: q.get('tab') ?? undefined, page: q.get('page') ?? undefined }
}

export function hrefOf(route: Route): string {
  const q = new URLSearchParams()
  if (route.path) q.set('path', route.path)
  if (route.tab) q.set('tab', route.tab)
  if (route.page) q.set('page', route.page)
  const s = q.toString().replaceAll('%2F', '/')
  return s ? `/?${s}` : '/'
}

/** Changes the route; `replace` keeps the browser history as it is (a rename, say). */
export function navigate(route: Route, replace = false) {
  const href = hrefOf(route)
  if (replace) window.history.replaceState(null, '', href)
  else window.history.pushState(null, '', href)
  window.dispatchEvent(new Event('openmemfs:navigate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const update = () => setRoute(read())
    window.addEventListener('popstate', update)
    window.addEventListener('openmemfs:navigate', update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('openmemfs:navigate', update)
    }
  }, [])
  return route
}
