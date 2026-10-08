import { invalid } from './errors'

export const MAX_PATH_LENGTH = 1024

/**
 * Checks a file path and returns it unchanged. A path is absolute ("/notes/today.md"),
 * has no empty, "." or ".." segment, no trailing slash and no control characters.
 */
export function checkPath(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) throw invalid('path is required')
  if (path.length > MAX_PATH_LENGTH) throw invalid(`path is longer than ${MAX_PATH_LENGTH} characters`)
  if (!path.startsWith('/')) throw invalid('path must start with "/"')
  if (path.endsWith('/')) throw invalid('path must name a file, not a folder: remove the trailing "/"')
  if (/[\u0000-\u001f\u007f]/.test(path)) throw invalid('path has control characters')
  for (const segment of path.slice(1).split('/')) {
    if (segment === '') throw invalid('path has an empty segment ("//")')
    if (segment === '.' || segment === '..') throw invalid('path has a "." or ".." segment')
  }
  return path
}

/** The folder a path lives in, with its trailing slash: "/a/b.md" is in "/a/". */
export function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1)
}
