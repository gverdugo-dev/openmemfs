export type Metadata = Record<string, unknown>

/** A tag a file carries because one of its folders has it. */
export interface FolderTag {
  folder: string
  tag: string
}

/** A file as the API returns it. Field names are the API's. */
export interface FileData {
  id: string
  path: string
  content: string
  metadata: Metadata
  category_id: string | null
  revision: number
  created_at: string
  updated_at: string
  tags: string[]
  folder_tags: FolderTag[]
}

export interface Entry {
  id: string
  path: string
  size: number
  revision: number
  category_id: string | null
  updated_at: string
  tags: string[]
  folder_tags: string[]
  snippet?: string
}

export interface Tag {
  id: string
  name: string
  files: number
  folders: string[]
}

export interface Category {
  id: string
  name: string
  parent_id: string | null
  files: number
}

/** What to look for. Empty fields do not narrow anything. */
export interface Filters {
  q?: string
  in?: 'name' | 'content' | 'all'
  tag?: string[]
  category?: string
  prefix?: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
}

/**
 * Calls the API with the session cookie. Every call carries the X-Openmemfs header, which
 * the server requires on browser writes so another site cannot write through the cookie.
 */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'X-Openmemfs': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) window.dispatchEvent(new Event('openmemfs:signed-out'))
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.code)
  return data as T
}

/** The query string of a search, with one `tag` per tag. */
export function filtersQuery(filters: Filters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    for (const one of Array.isArray(value) ? value : [value]) if (one) params.append(key, one)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const enc = encodeURIComponent

export const files = {
  list: (filters: Filters = {}) => api<Entry[]>('GET', `/files${filtersQuery(filters)}`),
  byPath: (path: string) => api<FileData>('GET', `/files/by-path?path=${enc(path)}`),
  create: (path: string, content = '') => api<FileData>('POST', '/files', { path, content }),
  update: (id: string, patch: Record<string, unknown>) => api<FileData>('PATCH', `/files/${id}`, patch),
  remove: (id: string) => api<void>('DELETE', `/files/${id}`),
  setCategory: (id: string, categoryId: string | null) =>
    api<FileData>('PUT', `/files/${id}/category`, { category_id: categoryId }),
  tag: (id: string, tag: string) => api<FileData>('POST', `/files/${id}/tags`, { tag }),
  untag: (id: string, tag: string) => api<FileData>('DELETE', `/files/${id}/tags/${enc(tag)}`),
}

export const folders = {
  tags: (folder: string) => api<string[]>('GET', `/folders/tags?folder=${enc(folder)}`),
  tag: (folder: string, tag: string) => api<string[]>('POST', '/folders/tags', { folder, tag }),
  untag: (folder: string, tag: string) => api<string[]>('DELETE', `/folders/tags?folder=${enc(folder)}&tag=${enc(tag)}`),
}

export const tags = {
  list: () => api<Tag[]>('GET', '/tags'),
  create: (name: string) => api<Tag>('POST', '/tags', { name }),
  rename: (name: string, newName: string) => api<Tag>('PATCH', `/tags/${enc(name)}`, { name: newName }),
  remove: (name: string) => api<void>('DELETE', `/tags/${enc(name)}`),
}

export const categories = {
  list: () => api<Category[]>('GET', '/categories'),
  create: (name: string, parentId?: string) => api<Category>('POST', '/categories', { name, parent_id: parentId }),
  rename: (id: string, name: string) => api<Category>('PATCH', `/categories/${id}`, { name }),
  remove: (id: string) => api<void>('DELETE', `/categories/${id}`),
}
