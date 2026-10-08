import { queryOptions } from '@tanstack/react-query'
import { categories, type Filters, files, folders, tags } from './api'

/** Every file, without content: the sidebar tree. */
export const filesQuery = queryOptions({ queryKey: ['files'], queryFn: () => files.list() })

/** The files that match some filters. Under ['files'], so every change to the list refreshes it. */
export const searchQuery = (filters: Filters) =>
  queryOptions({ queryKey: ['files', 'search', filters], queryFn: () => files.list(filters) })

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

/** Every folder, empty ones included. Under ['files'], so it follows every change to the files. */
export const foldersQuery = queryOptions({ queryKey: ['files', 'folders'], queryFn: folders.list })

export const tagsQuery = queryOptions({ queryKey: ['tags'], queryFn: tags.list })

export const categoriesQuery = queryOptions({ queryKey: ['categories'], queryFn: categories.list })

export const folderTagsQuery = (folder: string) =>
  queryOptions({ queryKey: ['folder-tags', folder], queryFn: () => folders.tags(folder) })
