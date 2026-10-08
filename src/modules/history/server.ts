import { z } from 'zod'
import { invalid, notFound } from '#/server/errors'
import { body } from '#/server/http'
import { fileRef, tool } from '#/server/mcp'
import type { ServerModule } from '#/server/module'
import type { Author, Metadata } from '#/server/services'

export interface Version {
  version: number
  path: string
  content: string
  metadata: Metadata
  author: Author
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
 * is itself in the history. Its service (`versions`) backs both its routes and its tools.
 */
export const history: ServerModule = {
  id: 'history',
  migrations: 'src/modules/history/migrations',
  setup: ({ sql, services: { files }, config }) => {
    const versions = {
      async list(fileId: string): Promise<VersionEntry[]> {
        const file = await files.get(fileId)
        return sql<VersionEntry[]>`
          select version, path, author, octet_length(content) as size, created_at, updated_at
          from file_versions where file_id = ${file.id} order by version desc`
      },

      async get(fileId: string, raw: unknown): Promise<Version> {
        const file = await files.get(fileId)
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 1) throw invalid('version must be a positive integer')
        const [version] = await sql<Version[]>`
          select version, path, content, metadata, author, created_at, updated_at
          from file_versions where file_id = ${file.id} and version = ${n}`
        if (!version) throw notFound(`no version ${n} of ${file.path}`)
        return version
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
            author = ${author} and updated_at > now() - make_interval(secs => ${config.versionWindowSeconds}) as fold,
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
        tool(mcp, 'list_versions', 'List the versions of a file, newest first, with who wrote each.', fileRef, async (i) =>
          versions.list((await files.find(i)).id),
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
