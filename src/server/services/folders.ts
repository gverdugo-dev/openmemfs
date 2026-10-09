import { DomainError, invalid, notFound } from '../errors'
import { type Sql, type Tables, tablesOf } from '../db'
import { caller, checkReach, reaches } from '../caller'
import { type Entry, type Files, trashFolder } from './files'
import { lockStructure, reachable } from './shared'
import { checkFolder } from './tags'

/** A folder in the tree, with the folders under it. */
export interface TreeFolder {
  path: string
  name: string
  /** Files under it, at any depth. */
  files: number
  folders: TreeFolder[]
}

/** A folder right under another, in a listing. */
export interface FolderEntry {
  path: string
  name: string
  /** Files under it, at any depth. */
  files: number
}

/** What one folder holds: the folders right under it and its own files. */
export interface FolderContents {
  path: string
  folders: FolderEntry[]
  files: Entry[]
}

/**
 * Folders. A folder exists while some file is under it, or because someone created it (then
 * it can be empty, and it is a row of `folders`). Listing gives both kinds, with every folder
 * on the way to them.
 */
export function createFolders(sql: Sql, files: Files, tb: Tables = tablesOf(sql)) {
  /** A folder that exists for the caller: every folder, and the paths of the files under it. */
  async function existing(raw: unknown) {
    const path = raw === undefined || raw === null || raw === '' ? '/' : checkFolder(raw)
    const [all, rows] = await Promise.all([
      folders.list(),
      sql<{ path: string }[]>`
        select path from ${tb.files}
        where deleted_at is null and starts_with(path, ${path}) and ${reachable(sql, sql`path`)}`,
    ])
    if (path !== '/' && !all.includes(path)) throw notFound(`no folder ${path}`)
    return { path, all, paths: rows.map((r) => r.path) }
  }

  const under = (paths: string[], folder: string) => paths.filter((p) => p.startsWith(folder)).length
  const nameOf = (folder: string) => (folder === '/' ? '/' : folder.slice(folder.slice(0, -1).lastIndexOf('/') + 1, -1))
  const childrenOf = (all: string[], folder: string) =>
    all.filter((f) => f !== folder && f.startsWith(folder) && !f.slice(folder.length, -1).includes('/'))

  const folders = {
    /** Every folder, with its trailing slash, sorted. */
    async list(): Promise<string[]> {
      const rows = await sql<{ path: string }[]>`
        select path from ${tb.folders} where ${reachable(sql, sql`path`)}
        union
        select left(path, length(path) - position('/' in reverse(path)) + 1) from ${tb.files}
        where deleted_at is null and ${reachable(sql, sql`path`)}`
      const all = new Set<string>()
      // The folders a caller reaches are there even with nothing in them yet, with the way to them.
      for (const path of [...rows.map((r) => r.path), ...(caller().reach ?? [])]) {
        const segments = path.slice(1, -1).split('/').filter(Boolean)
        for (let i = 1; i <= segments.length; i++) all.add(`/${segments.slice(0, i).join('/')}/`)
      }
      return [...all].sort()
    },

    /**
     * The layout of the memory: the folders under a folder, nested, each with how many files it
     * holds at any depth. `depth` levels at most; 0 or left out is every level.
     */
    async tree(raw?: unknown, rawDepth?: unknown): Promise<TreeFolder> {
      const depth = rawDepth === undefined || rawDepth === null || rawDepth === '' ? 0 : Number(rawDepth)
      if (!Number.isInteger(depth) || depth < 0) throw invalid('depth must be 0 (every level) or a positive integer')
      const { path, all, paths } = await existing(raw)
      const build = (folder: string, level: number): TreeFolder => ({
        path: folder,
        name: nameOf(folder),
        files: under(paths, folder),
        folders: depth > 0 && level >= depth ? [] : childrenOf(all, folder).map((f) => build(f, level + 1)),
      })
      return build(path, 0)
    },

    /** What one folder holds: the folders right under it, with their file counts, and its own files. */
    async contents(raw?: unknown, options: { withMetadata?: boolean } = {}): Promise<FolderContents> {
      const { path, all, paths } = await existing(raw)
      const entries = await files.search({ prefix: path, withMetadata: options.withMetadata })
      return {
        path,
        folders: childrenOf(all, path).map((f) => ({ path: f, name: nameOf(f), files: under(paths, f) })),
        files: entries.filter((e) => !e.path.slice(path.length).includes('/')),
      }
    },

    /** Creates an empty folder. Its parent folders need no creating. */
    async create(raw: unknown): Promise<string> {
      const path = checkReach(checkFolder(raw))
      return sql.begin(async (tx) => {
        await lockStructure(tx)
        const [file] = await tx<{ path: string }[]>`
          select path from ${tb.files}
          where deleted_at is null and (${path} = path || '/' or starts_with(${path}, path || '/')) limit 1`
        if (file && !reaches(file.path)) throw new DomainError('conflict', `${path} is taken`)
        if (file) throw new DomainError('conflict', `${path} clashes with ${file.path}: a name cannot be a file and a folder`)
        const [exists] = await tx`
          select 1 from ${tb.folders} where path = ${path}
          union all select 1 from ${tb.files} where deleted_at is null and starts_with(path, ${path}) limit 1`
        if (exists) throw new DomainError('conflict', `the folder ${path} already exists`)
        await tx`insert into ${tb.folders} (path) values (${path})`
        return path
      })
    },

    /**
     * Deletes an empty folder (and the empty folders in it), with its tags. With `recursive`,
     * a folder with files goes too: its files to the trash, where they keep their history.
     * Returns the paths of the files it trashed.
     */
    async remove(raw: unknown, options: { recursive?: boolean } = {}): Promise<{ trashed: string[] }> {
      const path = checkReach(checkFolder(raw))
      return sql.begin(async (tx) => {
        await lockStructure(tx)
        const trashed = options.recursive ? await trashFolder(tb, tx, path) : []
        const [file] = await tx`select 1 from ${tb.files} where deleted_at is null and starts_with(path, ${path}) limit 1`
        if (file) throw new DomainError('conflict', `${path} has files: delete or move them first, or pass recursive`)
        const removed = await tx`delete from ${tb.folders} where starts_with(path, ${path}) returning path`
        if (removed.length === 0 && trashed.length === 0) throw notFound(`no folder ${path}`)
        await tx`delete from ${tb.folder_tags} where starts_with(folder, ${path})`
        return { trashed }
      })
    },
  }
  return folders
}
