import { z } from 'zod'
import { invalid, notFound } from '#/server/errors'
import { body } from '#/server/http'
import { fileRef, tool } from '#/server/mcp'
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
  setup: ({ sql, services: { files }, config }) => {
    const versions = {
      async list(fileId: string): Promise<VersionEntry[]> {
        const file = await files.get(fileId)
        return sql<VersionEntry[]>`
          select version, path, author, message, octet_length(content) as size, created_at, updated_at
          from file_versions where file_id = ${file.id} order by version desc`
      },

      async get(fileId: string, raw: unknown): Promise<Version> {
        const file = await files.get(fileId)
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 1) throw invalid('version must be a positive integer')
        const [version] = await sql<Version[]>`
          select version, path, content, metadata, author, message, created_at, updated_at
          from file_versions where file_id = ${file.id} and version = ${n}`
        if (!version) throw notFound(`no version ${n} of ${file.path}`)
        return version
      },

      /** Names the latest version with a message. Nothing to commit if it already has one. */
      async commit(fileId: string, raw: unknown): Promise<VersionEntry> {
        const file = await files.get(fileId)
        const message = typeof raw === 'string' ? raw.trim() : ''
        if (!message) throw invalid('a commit needs a message')
        if (message.length > MAX_MESSAGE_LENGTH) throw invalid(`a commit message is ${MAX_MESSAGE_LENGTH} characters at most`)
        const [latest] = await sql<{ version: number; message: string | null }[]>`
          select version, message from file_versions where file_id = ${file.id} order by version desc limit 1`
        if (!latest) throw invalid(`${file.path} has no versions yet`)
        if (latest.message !== null) throw invalid(`nothing changed in ${file.path} since the last commit`)
        const [committed] = await sql<VersionEntry[]>`
          update file_versions set message = ${message}
          where file_id = ${file.id} and version = ${latest.version} and message is null
          returning version, path, author, message, octet_length(content) as size, created_at, updated_at`
        // Someone else committed it in between.
        if (!committed) throw invalid(`nothing changed in ${file.path} since the last commit`)
        return committed
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
          from file_versions where file_id = ${file.id}
          order by version desc limit 1 for update`
        if (latest?.same) return
        if (latest?.fold && !checkpoint) {
          await tx`
            update file_versions set path = ${file.path}, content = ${file.content},
              metadata = ${tx.json(file.metadata as never)}, updated_at = now()
            where id = ${latest.id}`
          return
        }
        await tx`
          insert into file_versions (file_id, version, path, content, metadata, author)
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
          async (i) => versions.restore((await files.find(i)).id, i.version, i.if_revision, 'agent'),
        )
      },
    }
  },
}
