export type Metadata = Record<string, unknown>

/** A file as the API returns it. Field names are the API's. */
export interface FileData {
  id: string
  path: string
  content: string
  metadata: Metadata
  revision: number
  created_at: string
  updated_at: string
}

export interface Entry {
  id: string
  path: string
  size: number
  revision: number
  updated_at: string
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

export const files = {
  list: () => api<Entry[]>('GET', '/files'),
  byPath: (path: string) => api<FileData>('GET', `/files/by-path?path=${encodeURIComponent(path)}`),
  create: (path: string, content = '') => api<FileData>('POST', '/files', { path, content }),
  update: (id: string, patch: Record<string, unknown>) => api<FileData>('PATCH', `/files/${id}`, patch),
  remove: (id: string) => api<void>('DELETE', `/files/${id}`),
}
