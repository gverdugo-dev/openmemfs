import { DomainError, notFound } from '../errors'
import type { Sql } from '../db'
import { checkFolder } from './tags'

/**
 * Folders. A folder exists while some file is under it, or because someone created it (then
 * it can be empty, and it is a row of `folders`). Listing gives both kinds, with every folder
 * on the way to them.
 */
export function createFolders(sql: Sql) {
  const folders = {
    /** Every folder, with its trailing slash, sorted. */
    async list(): Promise<string[]> {
      const rows = await sql<{ path: string }[]>`
        select path from folders
        union
        select left(path, length(path) - position('/' in reverse(path)) + 1) from files`
      const all = new Set<string>()
      for (const { path } of rows) {
        const segments = path.slice(1, -1).split('/').filter(Boolean)
        for (let i = 1; i <= segments.length; i++) all.add(`/${segments.slice(0, i).join('/')}/`)
      }
      return [...all].sort()
    },

    /** Creates an empty folder. Its parent folders need no creating. */
    async create(raw: unknown): Promise<string> {
      const path = checkFolder(raw)
      return sql.begin(async (tx) => {
        const [file] = await tx<{ path: string }[]>`
          select path from files where ${path} = path || '/' or starts_with(${path}, path || '/') limit 1`
        if (file) throw new DomainError('conflict', `${path} clashes with ${file.path}: a name cannot be a file and a folder`)
        const [exists] = await tx`
          select 1 from folders where path = ${path}
          union all select 1 from files where starts_with(path, ${path}) limit 1`
        if (exists) throw new DomainError('conflict', `the folder ${path} already exists`)
        await tx`insert into folders (path) values (${path})`
        return path
      })
    },

    /** Deletes an empty folder (and the empty folders in it), with its tags. */
    async remove(raw: unknown): Promise<void> {
      const path = checkFolder(raw)
      await sql.begin(async (tx) => {
        const [file] = await tx`select 1 from files where starts_with(path, ${path}) limit 1`
        if (file) throw new DomainError('conflict', `${path} has files: delete or move them first`)
        const removed = await tx`delete from folders where starts_with(path, ${path}) returning path`
        if (removed.length === 0) throw notFound(`no folder ${path}`)
        await tx`delete from folder_tags where starts_with(folder, ${path})`
      })
    },
  }
  return folders
}
