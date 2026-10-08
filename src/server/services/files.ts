import { type Sql, type Tables, tablesOf, type Tx } from '../db'
import { DomainError, invalid, notFound } from '../errors'
import { checkPath } from '../paths'
import { checkReach, reaches } from '../caller'
import { checkId, dropOrphanFolderTags, isUniqueViolation, likePattern, lockStructure, reachable } from './shared'
import { checkFolder } from './tags'

/**
 * Who wrote: 'user' (a person in the editor) or 'agent' (the API without the editor's header,
 * or MCP), unless a module names the caller (see `caller.ts`).
 */
export type Author = string

export type Metadata = Record<string, unknown>

/** A tag a file carries because one of its folders has it. */
export interface FolderTag {
  folder: string
  tag: string
}

export interface File {
  id: string
  path: string
  content: string
  metadata: Metadata
  /** Its category or subcategory, or null. */
  category_id: string | null
  /** Goes up by one on every write. Send it back as `if_revision` to write only over what you read. */
  revision: number
  created_at: Date
  updated_at: Date
  /** The tags put on the file itself, sorted. */
  tags: string[]
  /** The tags of the folders it is in. */
  folder_tags: FolderTag[]
}

/** A file in a listing: no content, so a listing stays small. */
export interface Entry {
  id: string
  path: string
  size: number
  revision: number
  category_id: string | null
  updated_at: Date
  tags: string[]
  /** The tags it gets from its folders, without repeats. */
  folder_tags: string[]
  /** Around the first match, when searching the content. */
  snippet?: string
  /** Only when the search asks for it (`withMetadata`). */
  metadata?: Metadata
}

/** A file in the trash. */
export interface Trashed {
  id: string
  path: string
  size: number
  deleted_at: Date
}

/** What to look for. Every field narrows the list; leave them all out to list everything. */
export interface Search {
  /** Only files under this folder ("/notes/"). */
  prefix?: string
  /** Text to find, ignoring case. */
  query?: string
  /** Where to find it: the file name, the content, or both (the default). */
  in?: 'name' | 'content' | 'all'
  /** Only files that carry every one of these tags, on themselves or on a folder above them. */
  tags?: string[]
  /** Only files in this category, or in one of its subcategories. */
  categoryId?: string
  /** Give each entry its metadata, so a listing can show what an agent noted without reading every file. */
  withMetadata?: boolean
}

export interface CreateFile {
  path: string
  content?: string
  metadata?: Metadata
}

/** Fields left out stay as they are. */
export interface UpdateFile {
  path?: string
  content?: string
  metadata?: Metadata
  /** Write only if the file still has this revision; otherwise a `stale` error. */
  ifRevision?: number
  /** Ask the history to keep this write as a version of its own. */
  checkpoint?: boolean
}

/** Replace one exact piece of the content, which must appear exactly once. */
export interface EditFile {
  oldString: string
  newString: string
  ifRevision?: number
}

/** Who is writing, and whether this write should start a new version rather than fold into the last. */
export interface Write {
  author: Author
  checkpoint?: boolean
}

/** Runs inside the transaction of every create and update, with the file as written. */
export type WriteHook = (tx: Tx, file: File, write: Write) => Promise<void>

/**
 * A larger content limit for some files, such as an image kept as a data URL. Returns the
 * limit in bytes for this file, or undefined to leave it at MAX_CONTENT_BYTES.
 */
export type ContentLimit = (file: { path: string; metadata: Metadata }) => number | undefined

/** What modules add to the file service. */
export interface FileHooks {
  afterWrite?: WriteHook[]
  contentLimits?: ContentLimit[]
}

/** The rules of the memory: always there, at the root, under this name (see `organisation.ts`). */
export const ORGANISATION_PATH = '/organisation.md'

export const MAX_CONTENT_BYTES = 1024 * 1024
export const MAX_METADATA_BYTES = 64 * 1024
const SNIPPET_BEFORE = 60
const SNIPPET_LENGTH = 180

export type Files = ReturnType<typeof createFiles>

/**
 * The file service: every rule about files lives here, and every door (the REST API, the MCP
 * tools, a module) calls it instead of writing SQL of its own. It is the only code that
 * writes the `files` table.
 */
export function createFiles(sql: Sql, hooks: FileHooks = {}, tb: Tables = tablesOf(sql)) {
  async function runHooks(tx: Tx, file: File, write: Write) {
    for (const hook of hooks.afterWrite ?? []) await hook(tx, file, write)
  }

  /** The content limit of this file: the largest any module grants it, at least MAX_CONTENT_BYTES. */
  function checkSize(file: { path: string; content: string; metadata: Metadata }) {
    let limit = MAX_CONTENT_BYTES
    for (const grant of hooks.contentLimits ?? []) limit = Math.max(limit, grant(file) ?? 0)
    if (Buffer.byteLength(file.content) > limit) throw invalid(`content is larger than ${sizeName(limit)}`)
  }

  const files = {
    async search(search: Search = {}): Promise<Entry[]> {
      const prefix = search.prefix ?? '/'
      if (!prefix.startsWith('/')) throw invalid('prefix must start with "/"')
      const where = search.in ?? 'all'
      if (!['name', 'content', 'all'].includes(where)) throw invalid('in must be "name", "content" or "all"')
      const query = search.query?.trim() || null
      const pattern = query && likePattern(query)
      const byName = query !== null && where !== 'content'
      const byContent = query !== null && where !== 'name'
      const tags = [...new Set((search.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))]
      const categoryId = search.categoryId ? checkId(search.categoryId, 'category') : null

      return sql<Entry[]>`
        select f.id, f.path, octet_length(f.content) as size, f.revision, f.category_id, f.updated_at,
          ${tagsOf(tb, sql)} as tags,
          coalesce((
            select array_agg(distinct t.name) from ${tb.folder_tags} dt join ${tb.tags} t on t.id = dt.tag_id
            where starts_with(f.path, dt.folder)
          ), '{}') as folder_tags,
          ${search.withMetadata ? sql`f.metadata` : sql`null`} as metadata,
          case when ${byContent} and f.content ilike ${pattern} then
            substr(f.content, greatest(strpos(lower(f.content), lower(${query})) - ${SNIPPET_BEFORE}, 1), ${SNIPPET_LENGTH})
          end as snippet
        from ${tb.files} f
        left join ${tb.categories} c on c.id = f.category_id
        where f.deleted_at is null and starts_with(f.path, ${prefix}) and ${reachable(sql, sql`f.path`)}
          and (${query}::text is null
            or (${byName} and regexp_replace(f.path, '^.*/', '') ilike ${pattern})
            or (${byContent} and f.content ilike ${pattern}))
          and (${categoryId}::uuid is null or f.category_id = ${categoryId} or c.parent_id = ${categoryId})
          and not exists (
            select 1 from unnest(${tags}::text[]) as wanted(name)
            where not exists (
              select 1 from ${tb.file_tags} ft join ${tb.tags} t on t.id = ft.tag_id
              where ft.file_id = f.id and lower(t.name) = wanted.name
            ) and not exists (
              select 1 from ${tb.folder_tags} dt join ${tb.tags} t on t.id = dt.tag_id
              where starts_with(f.path, dt.folder) and lower(t.name) = wanted.name
            ))
        order by f.path collate "C"`
    },

    async get(id: string): Promise<File> {
      return one(tb, sql, checkId(id, 'file'))
    },

    async getByPath(path: string): Promise<File> {
      const [row] = await sql<{ id: string }[]>`select id from ${tb.files}
        where path = ${checkPath(path)} and deleted_at is null and ${reachable(sql, sql`path`)}`
      if (!row) throw notFound(`no file ${path}`)
      return one(tb, sql, row.id)
    },

    /** A file by its id or its path, whichever the caller has: agents mostly know paths. */
    async find(ref: { id?: string; path?: string }): Promise<File> {
      if (ref.id) return files.get(ref.id)
      if (ref.path) return files.getByPath(ref.path)
      throw invalid('give the file id or its path')
    },

    async create(input: CreateFile, write: Write): Promise<File> {
      const path = checkReach(checkPath(input.path))
      const content = checkContent(input.content ?? '')
      const metadata = checkMetadata(input.metadata ?? {})
      checkSize({ path, content, metadata })
      return sql.begin(async (tx) => {
        await lockStructure(tx)
        await checkNoClash(tb, tx, path, null)
        const [row] = await tx<{ id: string }[]>`
          insert into ${tb.files} (path, content, metadata)
          values (${path}, ${content}, ${tx.json(metadata as never)})
          on conflict (path) where deleted_at is null do nothing
          returning id`
        if (!row) throw new DomainError('conflict', `${path} already exists`)
        const file = await one(tb, tx, row.id)
        await runHooks(tx, file, write)
        return file
      })
    },

    async update(id: string, input: UpdateFile, write: Write): Promise<File> {
      checkId(id, 'file')
      const path = input.path === undefined ? undefined : checkReach(checkPath(input.path))
      const content = input.content === undefined ? undefined : checkContent(input.content)
      const metadata = input.metadata === undefined ? undefined : checkMetadata(input.metadata)
      checkRevision(input.ifRevision)
      return sql
        .begin(async (tx) => {
          const current = await lock(tb, tx, id, input.ifRevision)
          if (current.path === ORGANISATION_PATH && path !== undefined && path !== current.path)
            throw invalid(`${ORGANISATION_PATH} cannot be moved or renamed: every agent looks for it there`)
          const moved = path !== undefined && path !== current.path
          checkSize({ path: path ?? current.path, content: content ?? current.content, metadata: metadata ?? current.metadata })
          if (moved) {
            await lockStructure(tx)
            await checkNoClash(tb, tx, path, id)
          }
          await tx`
            update ${tb.files} set
              path = ${path ?? current.path},
              content = ${content ?? current.content},
              metadata = ${tx.json((metadata ?? current.metadata) as never)},
              revision = revision + 1,
              updated_at = now()
            where id = ${id}`
          if (moved) await dropOrphanFolderTags(tb, tx)
          const file = await one(tb, tx, id)
          await runHooks(tx, file, { ...write, checkpoint: write.checkpoint || input.checkpoint })
          return file
        })
        .catch((error) => {
          if (isUniqueViolation(error)) throw new DomainError('conflict', `${path} already exists`)
          throw error
        })
    },

    async edit(id: string, input: EditFile, write: Write): Promise<File> {
      if (typeof input.oldString !== 'string' || input.oldString === '') throw invalid('old_string is required')
      if (typeof input.newString !== 'string') throw invalid('new_string must be a string')
      const current = await files.get(id)
      if (input.ifRevision !== undefined && input.ifRevision !== current.revision) throw staleError(current, input.ifRevision)
      const count = current.content.split(input.oldString).length - 1
      if (count !== 1) {
        throw invalid(`old_string appears ${count} times in ${current.path}; it must appear exactly once`)
      }
      const content = current.content.replace(input.oldString, () => input.newString)
      return files.update(id, { content, ifRevision: current.revision }, write)
    },

    /**
     * Moves a folder, with everything in it, to a new path: its files (each one a write, so
     * the history sees it), its empty folders and its folder tags. Returns the new path.
     */
    async moveFolder(fromRaw: unknown, toRaw: unknown, write: Write): Promise<string> {
      const from = checkReach(checkFolder(fromRaw))
      const to = checkReach(checkFolder(toRaw))
      if (from === to) return to
      if (to.startsWith(from)) throw invalid(`${from} cannot move into itself`)
      return sql
        .begin(async (tx) => {
          await lockStructure(tx)
          const [source] = await tx`
            select 1 from ${tb.files} where deleted_at is null and starts_with(path, ${from})
            union all select 1 from ${tb.folders} where starts_with(path, ${from}) limit 1`
          if (!source) throw notFound(`no folder ${from}`)
          const [taken] = await tx<{ path: string }[]>`
            select path from ${tb.files}
            where deleted_at is null and (starts_with(path, ${to}) or ${to} = path || '/' or starts_with(${to}, path || '/'))
            union all select path from ${tb.folders} where starts_with(path, ${to}) limit 1`
          if (taken) throw new DomainError('conflict', `${to} is taken${reaches(taken.path) ? `: ${taken.path} is already there` : ''}`)
          // Tags left behind by a folder that used to be at the destination would collide.
          await dropOrphanFolderTags(tb, tx)
          const moved = await tx<{ id: string; path: string }[]>`
            update ${tb.files} set path = ${to} || substr(path, ${from.length + 1}), revision = revision + 1, updated_at = now()
            where deleted_at is null and starts_with(path, ${from}) returning id, path`
          for (const file of moved) checkPath(file.path)
          await tx`update ${tb.folders} set path = ${to} || substr(path, ${from.length + 1}) where starts_with(path, ${from})`
          await tx`update ${tb.folder_tags} set folder = ${to} || substr(folder, ${from.length + 1}) where starts_with(folder, ${from})`
          for (const { id } of moved) await runHooks(tx, await one(tb, tx, id), write)
          return to
        })
        .catch((error) => {
          if (isUniqueViolation(error)) throw new DomainError('conflict', `${to} is taken`)
          throw error
        })
    },

    /** Puts a file in a category or subcategory, or takes it out with null. Not a content write. */
    async setCategory(id: string, categoryId: string | null): Promise<File> {
      checkId(id, 'file')
      if (categoryId !== null) {
        checkId(categoryId, 'category')
        const [found] = await sql`select 1 from ${tb.categories} where id = ${categoryId}`
        if (!found) throw notFound(`no category with id ${categoryId}`)
      }
      const updated = await sql`update ${tb.files} set category_id = ${categoryId} where id = ${id} and deleted_at is null and ${reachable(sql, sql`path`)} returning id`
      if (updated.length === 0) throw notFound(`no file with id ${id}`)
      return one(tb, sql, id)
    },

    /** Moves a file to the trash. It keeps its history, tags and category until the trash is emptied. */
    async remove(id: string): Promise<void> {
      checkId(id, 'file')
      await sql.begin(async (tx) => {
        const [current] = await tx<{ path: string }[]>`
          select path from ${tb.files} where id = ${id} and deleted_at is null and ${reachable(tx, tx`path`)} for update`
        if (!current) throw notFound(`no file with id ${id}`)
        if (current.path === ORGANISATION_PATH) throw invalid(`${ORGANISATION_PATH} cannot be deleted: edit it instead`)
        await tx`update ${tb.files} set deleted_at = now() where id = ${id}`
        await dropOrphanFolderTags(tb, tx)
      })
    },

    /** The files in the trash, most recently deleted first. */
    async trash(): Promise<Trashed[]> {
      return sql<Trashed[]>`
        select id, path, octet_length(content) as size, deleted_at from ${tb.files}
        where deleted_at is not null and ${reachable(sql, sql`path`)} order by deleted_at desc, path collate "C"`
    },

    /**
     * Takes a file out of the trash, back to its path or to `path` when given. Restoring is a
     * write: the revision goes up and the history sees it.
     */
    async restore(id: string, input: { path?: unknown }, write: Write): Promise<File> {
      checkId(id, 'file')
      const path = input.path === undefined || input.path === null ? undefined : checkReach(checkPath(input.path))
      return sql
        .begin(async (tx) => {
          const [trashed] = await tx<{ path: string }[]>`
            select path from ${tb.files} where id = ${id} and deleted_at is not null and ${reachable(tx, tx`path`)} for update`
          if (!trashed) throw notFound(`no file with id ${id} in the trash`)
          const target = path ?? trashed.path
          await lockStructure(tx)
          const [taken] = await tx`select 1 from ${tb.files} where path = ${target} and deleted_at is null`
          if (taken) throw new DomainError('conflict', `${target} already exists: restore it under another path`)
          await checkNoClash(tb, tx, target, id)
          await tx`
            update ${tb.files} set path = ${target}, deleted_at = null, revision = revision + 1, updated_at = now()
            where id = ${id}`
          const file = await one(tb, tx, id)
          await runHooks(tx, file, write)
          return file
        })
        .catch((error) => {
          if (isUniqueViolation(error)) throw new DomainError('conflict', `${path} already exists`)
          throw error
        })
    },

    /** Deletes for good one file of the trash, or the whole trash. Returns how many went. */
    async emptyTrash(id?: string): Promise<{ deleted: number }> {
      if (id !== undefined) {
        checkId(id, 'file')
        const gone = await sql`
          delete from ${tb.files} where id = ${id} and deleted_at is not null and ${reachable(sql, sql`path`)} returning id`
        if (gone.length === 0) throw notFound(`no file with id ${id} in the trash`)
        return { deleted: 1 }
      }
      const gone = await sql`delete from ${tb.files} where deleted_at is not null and ${reachable(sql, sql`path`)} returning id`
      return { deleted: gone.length }
    },
  }
  return files
}

/** The direct tags of the file aliased `f`, sorted, as a SQL fragment. */
function tagsOf(tb: Tables, sql: Sql | Tx) {
  return sql`coalesce((
    select array_agg(t.name order by lower(t.name)) from ${tb.file_tags} ft join ${tb.tags} t on t.id = ft.tag_id
    where ft.file_id = f.id
  ), '{}')`
}

/** One file with its tags and the tags of its folders. */
async function one(tb: Tables, sql: Sql | Tx, id: string): Promise<File> {
  const [file] = await sql<File[]>`
    select f.*, ${tagsOf(tb, sql)} as tags,
      coalesce((
        select json_agg(json_build_object('folder', dt.folder, 'tag', t.name) order by dt.folder, lower(t.name))
        from ${tb.folder_tags} dt join ${tb.tags} t on t.id = dt.tag_id
        where starts_with(f.path, dt.folder)
      ), '[]') as folder_tags
    from ${tb.files} f where f.id = ${id} and f.deleted_at is null and ${reachable(sql, sql`f.path`)}`
  if (!file) throw notFound(`no file with id ${id}`)
  return file
}

/** Locks the row for a write and checks the revision the caller read. */
async function lock(tb: Tables, tx: Tx, id: string, ifRevision: number | undefined) {
  const [current] = await tx<Pick<File, 'path' | 'content' | 'metadata' | 'revision'>[]>`
    select path, content, metadata, revision from ${tb.files}
    where id = ${id} and deleted_at is null and ${reachable(tx, tx`path`)} for update`
  if (!current) throw notFound(`no file with id ${id}`)
  if (ifRevision !== undefined && current.revision !== ifRevision) throw staleError(current, ifRevision)
  return current
}

function staleError(current: { path: string; revision: number }, ifRevision: number) {
  return new DomainError(
    'stale',
    `${current.path} changed since revision ${ifRevision}: it is at revision ${current.revision}`,
  )
}

/**
 * A name cannot be a file and a folder at once: "/a" and "/a/b.md" cannot both exist, and
 * neither can a file "/a" and an empty folder "/a/".
 */
async function checkNoClash(tb: Tables, tx: Tx, path: string, ownId: string | null) {
  const [clash] = await tx<{ path: string }[]>`
    select path from ${tb.files}
    where deleted_at is null and (${ownId}::uuid is null or id <> ${ownId}::uuid)
      and (starts_with(path, ${path + '/'}) or starts_with(${path}, path || '/'))
    union all
    select path from ${tb.folders} where starts_with(path, ${path + '/'})
    limit 1`
  if (clash) {
    if (!reaches(clash.path)) throw new DomainError('conflict', `${path} is taken`)
    throw new DomainError('conflict', `${path} clashes with ${clash.path}: a name cannot be a file and a folder`)
  }
}

/** "1 MiB", "30 MiB", "512 KiB". */
function sizeName(bytes: number): string {
  return bytes % (1024 * 1024) === 0 ? `${bytes / 1024 / 1024} MiB` : `${Math.round(bytes / 1024)} KiB`
}

function checkRevision(ifRevision: unknown) {
  if (ifRevision !== undefined && !Number.isInteger(ifRevision)) throw invalid('if_revision must be an integer')
}

function checkContent(content: unknown): string {
  if (typeof content !== 'string') throw invalid('content must be a string')
  if (content.includes('\u0000')) throw invalid('content has a NUL character')
  return content
}

function checkMetadata(metadata: unknown): Metadata {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw invalid('metadata must be a JSON object')
  }
  const text = JSON.stringify(metadata)
  // Postgres jsonb refuses these; say so instead of failing inside the database.
  if (text.includes('\\u0000')) throw invalid('metadata has a NUL character')
  if (/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])|(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}/i.test(text)) {
    throw invalid('metadata has an unpaired surrogate')
  }
  if (Buffer.byteLength(text) > MAX_METADATA_BYTES) {
    throw invalid('metadata is larger than 64 KiB')
  }
  return metadata as Metadata
}
