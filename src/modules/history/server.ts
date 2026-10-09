import { z } from 'zod'
import { diffText } from '#/lib/diff'
import { invalid, notFound } from '#/server/errors'
import { body } from '#/server/http'
import { fileRef, tool, writer } from '#/server/mcp'
import type { ServerModule } from '#/server/module'
import type { Author, Metadata } from '#/server/services'

/** The longest commit message. */
const MAX_MESSAGE_LENGTH = 500

export interface Version {
  version: number
  path: string
  content: string
  metadata: Metadata
  author: Author
  /** Set when someone committed this version, with why. Null for a plain save. */
  message: string | null
  created_at: Date
  updated_at: Date
}

/** A version in a listing, without the content. */
export type VersionEntry = Omit<Version, 'content' | 'metadata'> & { size: number }

/** A file whose latest version has no commit yet: what changed since it was last committed. */
export interface Change {
  id: string
  path: string
  /** The version a commit would name. */
  version: number
  /** The latest committed version, or null when the file was never committed. */
  committed: number | null
  author: Author
  updated_at: Date
}

/** A committed version, in the log of the memory. */
export interface Commit {
  id: string
  /** Where the file is now. */
  path: string
  version: number
  message: string
  author: Author
  updated_at: Date
}

/** How a file changed between two versions, or between a version and the file as it is now. */
export interface Diff {
  path: string
  from: number
  /** The later version, or null for the file as it is now. */
  to: number | null
  diff: string
  added: number
  removed: number
  metadata_changed: boolean
  path_changed: boolean
}

/** The most entries list_commits gives. */
const MAX_LOG = 500

/**
 * History: every write leaves a version. A write by the same author within the window
 * (VERSION_WINDOW_SECONDS) of the latest version updates that version instead, so
 * autosave does not fill the history; a write with `checkpoint: true` always starts a new
 * version. Restoring writes the old content and metadata back as a new write, so the restore
 * is itself in the history. Committing is optional: it names the latest version with a
 * message and closes it, so the next save starts a new version. Its service (`versions`)
 * backs both its routes and its tools.
 */
export const history: ServerModule = {
  id: 'history',
  migrations: 'src/modules/history/migrations',
  setup: ({ sql, table, services: { files }, config }) => {
    const versionsTable = table('file_versions')

    /**
     * The files the caller reaches under a folder, or the one file a path names, by id with
     * their current paths. Every history query across files starts here, so it sees only those.
     */
    async function reached(raw: unknown): Promise<Map<string, string>> {
      const path = raw === undefined || raw === null || raw === '' ? '/' : String(raw)
      if (!path.startsWith('/')) throw invalid('paths are absolute, like /notes/')
      if (!path.endsWith('/')) {
        const file = await files.getByPath(path).catch(() => null)
        if (file) return new Map([[file.id, file.path]])
      }
      const entries = await files.search({ prefix: path.endsWith('/') ? path : `${path}/` })
      return new Map(entries.map((e) => [e.id, e.path]))
    }

    const versions = {
      async list(fileId: string): Promise<VersionEntry[]> {
        const file = await files.get(fileId)
        return sql<VersionEntry[]>`
          select version, path, author, message, octet_length(content) as size, created_at, updated_at
          from ${versionsTable} where file_id = ${file.id} order by version desc`
      },

      async get(fileId: string, raw: unknown): Promise<Version> {
        const file = await files.get(fileId)
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 1) throw invalid('version must be a positive integer')
        const [version] = await sql<Version[]>`
          select version, path, content, metadata, author, message, created_at, updated_at
          from ${versionsTable} where file_id = ${file.id} and version = ${n}`
        if (!version) throw notFound(`no version ${n} of ${file.path}`)
        return version
      },

      /** Names the latest version with a message. Nothing to commit if it already has one. */
      async commit(fileId: string, raw: unknown): Promise<VersionEntry> {
        const file = await files.get(fileId)
        const message = checkMessage(raw)
        const [latest] = await sql<{ version: number; message: string | null }[]>`
          select version, message from ${versionsTable} where file_id = ${file.id} order by version desc limit 1`
        if (!latest) throw invalid(`${file.path} has no versions yet`)
        if (latest.message !== null) throw invalid(`nothing changed in ${file.path} since the last commit`)
        const [committed] = await sql<VersionEntry[]>`
          update ${versionsTable} set message = ${message}
          where file_id = ${file.id} and version = ${latest.version} and message is null
          returning version, path, author, message, octet_length(content) as size, created_at, updated_at`
        // Someone else committed it in between.
        if (!committed) throw invalid(`nothing changed in ${file.path} since the last commit`)
        return committed
      },

      /** The files under a folder (a file path names one) whose latest version is not committed. */
      async changes(rawPrefix: unknown): Promise<Change[]> {
        const ids = await reached(rawPrefix)
        if (ids.size === 0) return []
        const rows = await sql<(Omit<Change, 'path'> & { message: string | null })[]>`
          select distinct on (v.file_id) v.file_id as id, v.version, v.message, v.author, v.updated_at,
            (select max(c.version) from ${versionsTable} c where c.file_id = v.file_id and c.message is not null) as committed
          from ${versionsTable} v where v.file_id = any(${[...ids.keys()]}::uuid[])
          order by v.file_id, v.version desc`
        return rows
          .filter((r) => r.message === null)
          .map(({ message: _, ...r }) => ({ ...r, path: ids.get(r.id)! }))
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      },

      /** Commits every change under a folder (the root by default) with one message. */
      async commitAll(rawPrefix: unknown, raw: unknown): Promise<VersionEntry[]> {
        const message = checkMessage(raw)
        const pending = await versions.changes(rawPrefix)
        if (pending.length === 0) throw invalid(`nothing to commit under ${rawPrefix || '/'}`)
        return sql<VersionEntry[]>`
          update ${versionsTable} v set message = ${message}
          from unnest(${pending.map((c) => c.id)}::uuid[], ${pending.map((c) => c.version)}::int[]) as p(file_id, version)
          where v.file_id = p.file_id and v.version = p.version and v.message is null
          returning v.path, v.version, v.author, v.message, octet_length(v.content) as size, v.created_at, v.updated_at`
      },

      /** The committed versions of the files under a folder, newest first. */
      async log(rawPrefix: unknown, rawLimit: unknown): Promise<Commit[]> {
        const limit = rawLimit === undefined || rawLimit === null || rawLimit === '' ? 50 : Number(rawLimit)
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LOG) throw invalid(`limit must be an integer from 1 to ${MAX_LOG}`)
        const ids = await reached(rawPrefix)
        if (ids.size === 0) return []
        const rows = await sql<Omit<Commit, 'path'>[]>`
          select file_id as id, version, message, author, updated_at from ${versionsTable}
          where file_id = any(${[...ids.keys()]}::uuid[]) and message is not null
          order by updated_at desc, version desc limit ${limit}`
        return rows.map((r) => ({ ...r, path: ids.get(r.id)! }))
      },

      /**
       * How a file changed from one version to another. `to` left out is the file as it is now;
       * `from` left out is the latest committed version, so the diff shows what a commit would name.
       */
      async diff(fileId: string, rawFrom: unknown, rawTo: unknown): Promise<Diff> {
        const file = await files.get(fileId)
        const given = (raw: unknown) => raw !== undefined && raw !== null && raw !== ''
        let from: Version
        if (given(rawFrom)) from = await versions.get(fileId, rawFrom)
        else {
          const [last] = await sql<{ version: number }[]>`
            select version from ${versionsTable} where file_id = ${file.id} and message is not null order by version desc limit 1`
          from = await versions.get(fileId, last?.version ?? 1)
        }
        const to = given(rawTo) ? await versions.get(fileId, rawTo) : null
        const after = to ?? file
        return {
          path: file.path,
          from: from.version,
          to: to?.version ?? null,
          ...diffText(from.content, after.content),
          metadata_changed: JSON.stringify(from.metadata) !== JSON.stringify(after.metadata),
          path_changed: from.path !== after.path,
        }
      },

      async restore(fileId: string, raw: unknown, ifRevision: number | undefined, author: Author) {
        const old = await versions.get(fileId, raw)
        return files.update(fileId, { content: old.content, metadata: old.metadata, ifRevision }, { author, checkpoint: true })
      },
    }

    return {
      async afterWrite(tx, file, { author, checkpoint }) {
        const [latest] = await tx<{ id: string; version: number; fold: boolean; same: boolean }[]>`
          select id, version,
            author = ${author} and message is null and updated_at > now() - make_interval(secs => ${config.versionWindowSeconds}) as fold,
            path = ${file.path} and content = ${file.content} and metadata = ${tx.json(file.metadata as never)} as same
          from ${versionsTable} where file_id = ${file.id}
          order by version desc limit 1 for update`
        if (latest?.same) return
        if (latest?.fold && !checkpoint) {
          await tx`
            update ${versionsTable} set path = ${file.path}, content = ${file.content},
              metadata = ${tx.json(file.metadata as never)}, updated_at = now()
            where id = ${latest.id}`
          return
        }
        await tx`
          insert into ${versionsTable} (file_id, version, path, content, metadata, author)
          values (${file.id}, ${(latest?.version ?? 0) + 1}, ${file.path}, ${file.content},
            ${tx.json(file.metadata as never)}, ${author})`
      },

      routes(api) {
        api.get('/files/:id/versions', async (c) => c.json(await versions.list(c.req.param('id'))))
        api.get('/files/:id/versions/:version', async (c) =>
          c.json(await versions.get(c.req.param('id'), c.req.param('version'))),
        )
        api.post('/files/:id/commit', async (c) => {
          const { message } = await body<{ message?: unknown }>(c.req.raw)
          return c.json(await versions.commit(c.req.param('id'), message), 201)
        })
        api.get('/files/:id/diff', async (c) => c.json(await versions.diff(c.req.param('id'), c.req.query('from'), c.req.query('to'))))
        // Across the memory: what changed since the last commit, committing it, and the log.
        api.get('/history/changes', async (c) => c.json(await versions.changes(c.req.query('prefix'))))
        api.post('/history/commit', async (c) => {
          const { prefix, message } = await body<{ prefix?: unknown; message?: unknown }>(c.req.raw)
          return c.json(await versions.commitAll(prefix, message), 201)
        })
        api.get('/history/commits', async (c) => c.json(await versions.log(c.req.query('prefix'), c.req.query('limit'))))
        api.post('/files/:id/versions/:version/restore', async (c) => {
          const { if_revision } = await body<{ if_revision?: unknown }>(c.req.raw)
          const restored = await versions.restore(
            c.req.param('id'),
            c.req.param('version'),
            if_revision as number | undefined,
            c.get('author'),
          )
          return c.json(restored)
        })
      },

      tools(mcp) {
        tool(mcp, 'list_versions', 'List the versions of a file, newest first, with who wrote each and the message of the committed ones.', fileRef, async (i) =>
          versions.list((await files.find(i)).id),
        )
        tool(
          mcp,
          'commit_file',
          'Commit a file: name its latest version with a message that says what changed and why. Optional: every save already leaves a version; a commit marks one worth finding again.',
          { ...fileRef, message: z.string() },
          async (i) => versions.commit((await files.find(i)).id, i.message),
        )
        tool(
          mcp,
          'read_version',
          'Read one version of a file: its path, content and metadata as they were.',
          { ...fileRef, version: z.number().int() },
          async (i) => versions.get((await files.find(i)).id, i.version),
        )
        tool(
          mcp,
          'restore_version',
          'Write an old version back. The restore is a new version, so nothing is lost.',
          { ...fileRef, version: z.number().int(), if_revision: z.number().int().optional() },
          async (i) => versions.restore((await files.find(i)).id, i.version, i.if_revision, writer().author),
        )
        tool(
          mcp,
          'get_diff',
          'How a file changed: + added lines, - removed, @@ where unchanged lines were left out. from and to are versions (from list_versions); to left out is the file as it is now, from left out is its last commit, so by default it shows what changed since then.',
          { ...fileRef, from: z.number().int().optional(), to: z.number().int().optional() },
          async (i) => versions.diff((await files.find(i)).id, i.from, i.to),
        )
        const scope = z.string().optional().describe('a folder like /notes/, or one file; the whole memory by default')
        tool(
          mcp,
          'list_changes',
          'What changed since the last commit: the files under a folder whose latest version is not committed yet. get_diff shows how each changed.',
          { folder: scope },
          (i) => versions.changes(i.folder),
        )
        tool(
          mcp,
          'commit_changes',
          'Commit every change under a folder (or the whole memory) with one message that says what changed and why: do it when a piece of work is done. commit_file commits one file.',
          { folder: scope, message: z.string() },
          (i) => versions.commitAll(i.folder, i.message),
        )
        tool(
          mcp,
          'list_commits',
          'The log: the committed versions of the files under a folder, newest first, with their messages.',
          { folder: scope, limit: z.number().int().min(1).max(MAX_LOG).optional().describe('50 by default') },
          (i) => versions.log(i.folder, i.limit),
        )
      },
    }
  },
}

function checkMessage(raw: unknown): string {
  const message = typeof raw === 'string' ? raw.trim() : ''
  if (!message) throw invalid('a commit needs a message')
  if (message.length > MAX_MESSAGE_LENGTH) throw invalid(`a commit message is ${MAX_MESSAGE_LENGTH} characters at most`)
  return message
}
