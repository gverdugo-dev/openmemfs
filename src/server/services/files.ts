import type { Sql, Tx } from '../db'
import { DomainError, invalid, notFound } from '../errors'
import { checkPath } from '../paths'
import { checkId, isUniqueViolation, likePattern } from './shared'
import { checkFolder } from './tags'

/** Who wrote: a person in the editor, or an agent (the API without the editor's header, or MCP). */
export type Author = 'user' | 'agent'

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
export function createFiles(sql: Sql, afterWrite: WriteHook[] = []) {
  async function runHooks(tx: Tx, file: File, write: Write) {
    for (const hook of afterWrite) await hook(tx, file, write)
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
          ${tagsOf(sql)} as tags,
          coalesce((
            select array_agg(distinct t.name) from folder_tags dt join tags t on t.id = dt.tag_id
            where starts_with(f.path, dt.folder)
          ), '{}') as folder_tags,
          case when ${byContent} and f.content ilike ${pattern} then
            substr(f.content, greatest(strpos(lower(f.content), lower(${query})) - ${SNIPPET_BEFORE}, 1), ${SNIPPET_LENGTH})
          end as snippet
        from files f
        left join categories c on c.id = f.category_id
        where starts_with(f.path, ${prefix})
          and (${query}::text is null
            or (${byName} and regexp_replace(f.path, '^.*/', '') ilike ${pattern})
            or (${byContent} and f.content ilike ${pattern}))
          and (${categoryId}::uuid is null or f.category_id = ${categoryId} or c.parent_id = ${categoryId})
          and not exists (
            select 1 from unnest(${tags}::text[]) as wanted(name)
            where not exists (
              select 1 from file_tags ft join tags t on t.id = ft.tag_id
              where ft.file_id = f.id and lower(t.name) = wanted.name
            ) and not exists (
              select 1 from folder_tags dt join tags t on t.id = dt.tag_id
              where starts_with(f.path, dt.folder) and lower(t.name) = wanted.name
            ))
        order by f.path collate "C"`
    },

    async get(id: string): Promise<File> {
      return one(sql, checkId(id, 'file'))
    },

    async getByPath(path: string): Promise<File> {
      const [row] = await sql<{ id: string }[]>`select id from files where path = ${checkPath(path)}`
      if (!row) throw notFound(`no file ${path}`)
      return one(sql, row.id)
    },

    /** A file by its id or its path, whichever the caller has: agents mostly know paths. */
    async find(ref: { id?: string; path?: string }): Promise<File> {
      if (ref.id) return files.get(ref.id)
      if (ref.path) return files.getByPath(ref.path)
      throw invalid('give the file id or its path')
    },

    async create(input: CreateFile, write: Write): Promise<File> {
      const path = checkPath(input.path)
      const content = checkContent(input.content ?? '')
      const metadata = checkMetadata(input.metadata ?? {})
      return sql.begin(async (tx) => {
        await checkNoClash(tx, path, null)
        const [row] = await tx<{ id: string }[]>`
          insert into files (path, content, metadata)
          values (${path}, ${content}, ${tx.json(metadata as never)})
          on conflict (path) do nothing
          returning id`
        if (!row) throw new DomainError('conflict', `${path} already exists`)
        const file = await one(tx, row.id)
        await runHooks(tx, file, write)
        return file
      })
    },

    async update(id: string, input: UpdateFile, write: Write): Promise<File> {
      checkId(id, 'file')
      const path = input.path === undefined ? undefined : checkPath(input.path)
      const content = input.content === undefined ? undefined : checkContent(input.content)
      const metadata = input.metadata === undefined ? undefined : checkMetadata(input.metadata)
      checkRevision(input.ifRevision)
      return sql
        .begin(async (tx) => {
          const current = await lock(tx, id, input.ifRevision)
          if (path !== undefined && path !== current.path) await checkNoClash(tx, path, id)
          await tx`
            update files set
              path = ${path ?? current.path},
              content = ${content ?? current.content},
              metadata = ${tx.json((metadata ?? current.metadata) as never)},
              revision = revision + 1,
              updated_at = now()
            where id = ${id}`
          const file = await one(tx, id)
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
      const from = checkFolder(fromRaw)
      const to = checkFolder(toRaw)
      if (from === to) return to
      if (to.startsWith(from)) throw invalid(`${from} cannot move into itself`)
      return sql
        .begin(async (tx) => {
          const [source] = await tx`
            select 1 from files where starts_with(path, ${from})
            union all select 1 from folders where starts_with(path, ${from}) limit 1`
          if (!source) throw notFound(`no folder ${from}`)
          const [taken] = await tx<{ path: string }[]>`
            select path from files where starts_with(path, ${to}) or ${to} = path || '/' or starts_with(${to}, path || '/')
            union all select path from folders where starts_with(path, ${to}) limit 1`
          if (taken) throw new DomainError('conflict', `${to} is taken: ${taken.path} is already there`)
          const moved = await tx<{ id: string }[]>`
            update files set path = ${to} || substr(path, ${from.length + 1}), revision = revision + 1, updated_at = now()
            where starts_with(path, ${from}) returning id`
          await tx`update folders set path = ${to} || substr(path, ${from.length + 1}) where starts_with(path, ${from})`
          await tx`update folder_tags set folder = ${to} || substr(folder, ${from.length + 1}) where starts_with(folder, ${from})`
          for (const { id } of moved) await runHooks(tx, await one(tx, id), write)
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
        const [found] = await sql`select 1 from categories where id = ${categoryId}`
        if (!found) throw notFound(`no category with id ${categoryId}`)
      }
      const updated = await sql`update files set category_id = ${categoryId} where id = ${id} returning id`
      if (updated.length === 0) throw notFound(`no file with id ${id}`)
      return one(sql, id)
    },

    async remove(id: string): Promise<void> {
      const deleted = await sql`delete from files where id = ${checkId(id, 'file')} returning id`
      if (deleted.length === 0) throw notFound(`no file with id ${id}`)
    },
  }
  return files
}

/** The direct tags of the file aliased `f`, sorted, as a SQL fragment. */
function tagsOf(sql: Sql | Tx) {
  return sql`coalesce((
    select array_agg(t.name order by lower(t.name)) from file_tags ft join tags t on t.id = ft.tag_id
    where ft.file_id = f.id
  ), '{}')`
}

/** One file with its tags and the tags of its folders. */
async function one(sql: Sql | Tx, id: string): Promise<File> {
  const [file] = await sql<File[]>`
    select f.*, ${tagsOf(sql)} as tags,
      coalesce((
        select json_agg(json_build_object('folder', dt.folder, 'tag', t.name) order by dt.folder, lower(t.name))
        from folder_tags dt join tags t on t.id = dt.tag_id
        where starts_with(f.path, dt.folder)
      ), '[]') as folder_tags
    from files f where f.id = ${id}`
  if (!file) throw notFound(`no file with id ${id}`)
  return file
}

/** Locks the row for a write and checks the revision the caller read. */
async function lock(tx: Tx, id: string, ifRevision: number | undefined) {
  const [current] = await tx<Pick<File, 'path' | 'content' | 'metadata' | 'revision'>[]>`
    select path, content, metadata, revision from files where id = ${id} for update`
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
async function checkNoClash(tx: Tx, path: string, ownId: string | null) {
  const [clash] = await tx<{ path: string }[]>`
    select path from files
    where (${ownId}::uuid is null or id <> ${ownId}::uuid)
      and (starts_with(path, ${path + '/'}) or starts_with(${path}, path || '/'))
    union all
    select path from folders where starts_with(path, ${path + '/'})
    limit 1`
  if (clash) {
    throw new DomainError('conflict', `${path} clashes with ${clash.path}: a name cannot be a file and a folder`)
  }
}

function checkRevision(ifRevision: unknown) {
  if (ifRevision !== undefined && !Number.isInteger(ifRevision)) throw invalid('if_revision must be an integer')
}

function checkContent(content: unknown): string {
  if (typeof content !== 'string') throw invalid('content must be a string')
  if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) throw invalid('content is larger than 1 MiB')
  if (content.includes('\u0000')) throw invalid('content has a NUL character')
  return content
}

function checkMetadata(metadata: unknown): Metadata {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw invalid('metadata must be a JSON object')
  }
  if (Buffer.byteLength(JSON.stringify(metadata)) > MAX_METADATA_BYTES) {
    throw invalid('metadata is larger than 64 KiB')
  }
  return metadata as Metadata
}
