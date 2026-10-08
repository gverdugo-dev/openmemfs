import { join } from 'node:path'
import { body } from '../../server/http'
import { invalid, notFound } from '../../server/errors'
import type { Author, Metadata } from '../../server/files'
import type { ServerModule } from '../../server/module'

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
 * version. Restoring writes the old content and metadata back
 * as a new write, so the restore is itself in the history.
 */
export const history: ServerModule = {
  id: 'history',
  migrations: join(import.meta.dir, 'migrations'),
  setup: ({ sql, files, config }) => ({
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
      api.get('/files/:id/versions', async (c) => {
        const file = await files.get(c.req.param('id'))
        const versions = await sql<VersionEntry[]>`
          select version, path, author, octet_length(content) as size, created_at, updated_at
          from file_versions where file_id = ${file.id} order by version desc`
        return c.json(versions)
      })

      api.get('/files/:id/versions/:version', async (c) => {
        const file = await files.get(c.req.param('id'))
        return c.json(await versionOf(file.id, c.req.param('version')))
      })

      api.post('/files/:id/versions/:version/restore', async (c) => {
        const file = await files.get(c.req.param('id'))
        const old = await versionOf(file.id, c.req.param('version'))
        const { if_revision } = await body<{ if_revision?: unknown }>(c.req.raw)
        const restored = await files.update(
          file.id,
          { content: old.content, metadata: old.metadata, ifRevision: if_revision as number | undefined },
          { author: c.get('author'), checkpoint: true },
        )
        return c.json(restored)
      })

      async function versionOf(fileId: string, raw: string): Promise<Version> {
        const n = Number(raw)
        if (!Number.isInteger(n) || n < 1) throw invalid('version must be a positive integer')
        const [version] = await sql<Version[]>`
          select version, path, content, metadata, author, created_at, updated_at
          from file_versions where file_id = ${fileId} and version = ${n}`
        if (!version) throw notFound(`no version ${n}`)
        return version
      }
    },
  }),
}
