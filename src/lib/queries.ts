import { queryOptions } from '@tanstack/react-query'
import { files } from './api'

/** Every file, without content: the sidebar tree. */
export const filesQuery = queryOptions({ queryKey: ['files'], queryFn: files.list })

/**
 * One open file. Never refetched on its own: the page writes over the revision on screen, so
 * a silent refetch would hide an agent's change instead of showing it as a conflict.
 */
export const fileQuery = (path: string) =>
  queryOptions({
    queryKey: ['file', path],
    queryFn: () => files.byPath(path),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
