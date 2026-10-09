import { DomainError, invalid } from '#/server/errors'
import type { File, Files, Metadata, Write } from '#/server/services/files'

/** A relation name, like `image`: lowercase words joined by hyphens. */
const REL = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** The most targets one relation holds. */
export const MAX_LINKS = 50

/** A file a link points at, as the reader sees it now. */
export interface Target {
  id: string
  path: string
  category_id: string | null
  metadata: Metadata
}

export interface Backlink {
  id: string
  path: string
  rel: string
}

/** The links a file keeps in its metadata: relation to the ids of its targets, in order. */
export function linksOf(metadata: Metadata | undefined): Record<string, string[]> {
  const links = metadata?.links
  if (!links || typeof links !== 'object' || Array.isArray(links)) return {}
  const out: Record<string, string[]> = {}
  for (const [rel, ids] of Object.entries(links as Record<string, unknown>)) {
    if (Array.isArray(ids)) out[rel] = ids.filter((id): id is string => typeof id === 'string')
  }
  return out
}

/** Null when the file is gone or out of the caller's reach: such a link is not shown. */
async function maybe<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read
  } catch (error) {
    if (error instanceof DomainError && error.code === 'not_found') return null
    throw error
  }
}

/**
 * Links: a file points at other files by relation and in order, like a post at its images.
 * They live in the file's metadata (`links: { image: [ids] }`), so they are versioned with the
 * file, and by id, so they follow both files through moves. A target that is gone, in the
 * trash or out of the caller's reach is left out when reading.
 */
export function createLinks(files: Files) {
  return {
    async of(file: File): Promise<Record<string, Target[]>> {
      const out: Record<string, Target[]> = {}
      for (const [rel, ids] of Object.entries(linksOf(file.metadata))) {
        const targets = await Promise.all(ids.map((id) => maybe(files.get(id))))
        out[rel] = targets
          .filter((t): t is File => t !== null)
          .map(({ id, path, category_id, metadata }) => ({ id, path, category_id, metadata }))
      }
      return out
    },

    /** Replaces the targets of one relation; an empty list removes it. */
    async set(file: File, relRaw: unknown, pathsRaw: unknown, ifRevision: number | undefined, write: Write): Promise<File> {
      const rel = typeof relRaw === 'string' ? relRaw : ''
      if (!REL.test(rel) || rel.length > 64) throw invalid('a relation is lowercase words joined by hyphens, like image')
      if (!Array.isArray(pathsRaw) || pathsRaw.some((p) => typeof p !== 'string')) throw invalid('send the paths to link as a list')
      const paths = pathsRaw as string[]
      if (paths.length > MAX_LINKS) throw invalid(`a relation holds ${MAX_LINKS} links at most`)
      const ids: string[] = []
      for (const path of paths) {
        const target = await maybe(files.getByPath(path))
        if (!target) throw invalid(`no file ${path} to link to`)
        if (target.id === file.id) throw invalid('a file does not link to itself')
        if (!ids.includes(target.id)) ids.push(target.id)
      }
      const links = linksOf(file.metadata)
      if (ids.length === 0) delete links[rel]
      else links[rel] = ids
      const metadata: Metadata = { ...file.metadata, links }
      if (Object.keys(links).length === 0) delete metadata.links
      return files.update(file.id, { metadata, ifRevision }, write)
    },

    /** Who links to a file, by path and relation. */
    async backlinks(file: File): Promise<Backlink[]> {
      const entries = await files.search({ withMetadata: true })
      const out: Backlink[] = []
      for (const entry of entries) {
        for (const [rel, ids] of Object.entries(linksOf(entry.metadata))) {
          if (ids.includes(file.id)) out.push({ id: entry.id, path: entry.path, rel })
        }
      }
      return out.sort((a, b) => a.path.localeCompare(b.path) || a.rel.localeCompare(b.rel))
    },
  }
}

export type Links = ReturnType<typeof createLinks>
