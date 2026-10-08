import type { Sql, Tx } from './db'
import { DomainError, invalid, notFound } from './errors'
import { checkPath } from './paths'

/** Who wrote: a person in the editor (cookie session) or an agent through the API (Bearer token). */
export type Author = 'user' | 'agent'

export type Metadata = Record<string, unknown>

export interface File {
  id: string
  path: string
  content: string
  metadata: Metadata
  /** Goes up by one on every write. Send it back as `if_revision` to write only over what you read. */
  revision: number
  created_at: Date
  updated_at: Date
}

/** A file in a listing: no content, so a listing stays small. */
export interface Entry {
  id: string
  path: string
  size: number
  revision: number
  updated_at: Date
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

/** Who is writing, and whether this write should start a new version rather than fold into the last. */
export interface Write {
  author: Author
  checkpoint?: boolean
}

/** Runs inside the transaction of every create and update, with the file as written. */
export type WriteHook = (tx: Tx, file: File, write: Write) => Promise<void>

export const MAX_CONTENT_BYTES = 1024 * 1024
export const MAX_METADATA_BYTES = 64 * 1024

export type Files = ReturnType<typeof createFiles>

/**
 * The file service: every rule about files lives here, and every door (the REST API, a
 * module's routes) calls it instead of writing SQL of its own.
 */
export function createFiles(sql: Sql, afterWrite: WriteHook[] = []) {
  async function runHooks(tx: Tx, file: File, write: Write) {
    for (const hook of afterWrite) await hook(tx, file, write)
  }

  return {
    async list(prefix = '/'): Promise<Entry[]> {
      if (!prefix.startsWith('/')) throw invalid('prefix must start with "/"')
      return sql<Entry[]>`
        select id, path, octet_length(content) as size, revision, updated_at
        from files where starts_with(path, ${prefix})
        order by path collate "C"`
    },

    async get(id: string): Promise<File> {
      const [file] = await sql<File[]>`select * from files where id = ${checkId(id)}`
      if (!file) throw notFound(`no file with id ${id}`)
      return file
    },

    async getByPath(path: string): Promise<File> {
      const [file] = await sql<File[]>`select * from files where path = ${checkPath(path)}`
      if (!file) throw notFound(`no file ${path}`)
      return file
    },

    async create(input: CreateFile, write: Write): Promise<File> {
      const path = checkPath(input.path)
      const content = checkContent(input.content ?? '')
      const metadata = checkMetadata(input.metadata ?? {})
      return sql.begin(async (tx) => {
        await checkNoClash(tx, path, null)
        const [file] = await tx<File[]>`
          insert into files (path, content, metadata)
          values (${path}, ${content}, ${tx.json(metadata as never)})
          on conflict (path) do nothing
          returning *`
        if (!file) throw new DomainError('conflict', `${path} already exists`)
        await runHooks(tx, file, write)
        return file
      })
    },

    async update(id: string, input: UpdateFile, write: Write): Promise<File> {
      checkId(id)
      const path = input.path === undefined ? undefined : checkPath(input.path)
      const content = input.content === undefined ? undefined : checkContent(input.content)
      const metadata = input.metadata === undefined ? undefined : checkMetadata(input.metadata)
      if (input.ifRevision !== undefined && !Number.isInteger(input.ifRevision)) {
        throw invalid('if_revision must be an integer')
      }
      return sql.begin(async (tx) => {
        const [current] = await tx<File[]>`select * from files where id = ${id} for update`
        if (!current) throw notFound(`no file with id ${id}`)
        if (input.ifRevision !== undefined && current.revision !== input.ifRevision) {
          throw new DomainError(
            'stale',
            `${current.path} changed since revision ${input.ifRevision}: it is at revision ${current.revision}`,
          )
        }
        if (path !== undefined && path !== current.path) await checkNoClash(tx, path, id)
        const [file] = await tx<File[]>`
          update files set
            path = ${path ?? current.path},
            content = ${content ?? current.content},
            metadata = ${tx.json((metadata ?? current.metadata) as never)},
            revision = revision + 1,
            updated_at = now()
          where id = ${id}
          returning *`
        await runHooks(tx, file!, { ...write, checkpoint: write.checkpoint || input.checkpoint })
        return file!
      }).catch((error) => {
        if (isUniqueViolation(error)) throw new DomainError('conflict', `${path} already exists`)
        throw error
      })
    },

    async remove(id: string): Promise<void> {
      const deleted = await sql`delete from files where id = ${checkId(id)} returning id`
      if (deleted.length === 0) throw notFound(`no file with id ${id}`)
    },
  }
}

/** A name cannot be a file and a folder at once: "/a" and "/a/b.md" cannot both exist. */
async function checkNoClash(tx: Tx, path: string, ownId: string | null) {
  const [clash] = await tx<{ path: string }[]>`
    select path from files
    where (${ownId}::uuid is null or id <> ${ownId}::uuid)
      and (starts_with(path, ${path + '/'}) or starts_with(${path}, path || '/'))
    limit 1`
  if (clash) {
    throw new DomainError('conflict', `${path} clashes with ${clash.path}: a name cannot be a file and a folder`)
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function checkId(id: string): string {
  if (!UUID.test(id)) throw notFound(`no file with id ${id}`)
  return id
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}
