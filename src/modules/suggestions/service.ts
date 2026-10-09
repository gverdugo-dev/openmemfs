import type { Sql, Table } from '#/server/db'
import { DomainError, invalid } from '#/server/errors'
import type { Author, File, Files } from '#/server/services/files'
import { locate } from './diff'

export type Status = 'pending' | 'accepted' | 'rejected'

export interface Suggestion {
  id: number
  file_id: string
  path: string
  old_string: string
  new_string: string
  reason: string
  author: string
  status: Status
  /** Pending, and its old text no longer appears exactly once in the file. */
  stale: boolean
  created_at: Date
  resolved_at: Date | null
}

export interface Proposal {
  old_string: string
  new_string: string
  reason?: string
}

export interface Acceptance {
  accepted: number[]
  /** Pending ones that no longer apply; they stay pending. */
  stale: number[]
  files: File[]
}

/** The most suggestions one call proposes. */
export const MAX_PROPOSALS = 100
const MAX_REASON = 2000

type Row = Omit<Suggestion, 'path' | 'stale'>

/**
 * Suggestions over the files service. Reach is the files service's: a suggestion on a file
 * the caller does not reach does not exist for them.
 */
export function createSuggestions(sql: Sql, items: Table, files: Files) {
  /** The file of each row the caller reaches, read once per file. */
  async function filesOf(rows: Row[]): Promise<Map<string, File>> {
    const out = new Map<string, File>()
    for (const id of new Set(rows.map((r) => r.file_id))) {
      try {
        out.set(id, await files.get(id))
      } catch (error) {
        if (!(error instanceof DomainError && error.code === 'not_found')) throw error
      }
    }
    return out
  }

  function shape(row: Row, file: File): Suggestion {
    return { ...row, path: file.path, stale: row.status === 'pending' && locate(file.content, row.old_string) === undefined }
  }

  async function visible(rows: Row[]): Promise<Suggestion[]> {
    const byId = await filesOf(rows)
    return rows.flatMap((row) => {
      const file = byId.get(row.file_id)
      return file ? [shape(row, file)] : []
    })
  }

  /** The rows of these ids, all pending and reachable, or an error that names the first that is not. */
  async function pending(raw: unknown): Promise<{ rows: Row[]; byFile: Map<string, File> }> {
    if (!Array.isArray(raw) || raw.length === 0 || !raw.every((id) => Number.isInteger(id) && id > 0)) {
      throw invalid('ids is a list of suggestion ids')
    }
    const ids = [...new Set(raw as number[])]
    const rows = await sql<Row[]>`select * from ${items} where id in ${sql(ids)} order by id`
    const byFile = await filesOf(rows)
    for (const id of ids) {
      const row = rows.find((r) => Number(r.id) === id)
      if (!row || !byFile.has(row.file_id)) throw invalid(`no suggestion ${id}`)
      if (row.status !== 'pending') throw invalid(`suggestion ${id} is already ${row.status}`)
    }
    return { rows, byFile }
  }

  return {
    /** Proposes changes to a file, all or none. The file does not change. */
    async suggest(file: File, raw: unknown, author: Author): Promise<Suggestion[]> {
      if (file.metadata?.media) throw invalid(`${file.path} is media: there is no text to suggest on`)
      if (!Array.isArray(raw) || raw.length === 0) throw invalid('suggestions is a list of { old_string, new_string, reason }')
      if (raw.length > MAX_PROPOSALS) throw invalid(`at most ${MAX_PROPOSALS} suggestions at once`)
      const proposals = raw.map((p: Partial<Proposal>, i): Proposal => {
        const at = `suggestion ${i + 1} of ${raw.length}`
        if (typeof p?.old_string !== 'string' || p.old_string === '') throw invalid(`${at}: old_string is the exact text to replace`)
        if (typeof p.new_string !== 'string') throw invalid(`${at}: new_string is the text to put instead`)
        if (p.old_string === p.new_string) throw invalid(`${at}: new_string is the same as old_string`)
        if (p.reason !== undefined && typeof p.reason !== 'string') throw invalid(`${at}: reason is text`)
        if ((p.reason ?? '').length > MAX_REASON) throw invalid(`${at}: the reason is ${MAX_REASON} characters at most`)
        if (locate(file.content, p.old_string) === undefined) {
          throw invalid(`${at}: old_string has to appear exactly once in ${file.path}`)
        }
        return { old_string: p.old_string, new_string: p.new_string, reason: p.reason ?? '' }
      })
      const rows = await sql<Row[]>`
        insert into ${items} ${sql(proposals.map((p) => ({ ...p, file_id: file.id, author })))}
        returning *`
      return rows.map((row) => shape(row, file))
    },

    /** Suggestions the caller reaches, of one file or of every file, pending by default. */
    async list(opts: { file?: File; status?: unknown }): Promise<Suggestion[]> {
      const status = opts.status ?? 'pending'
      if (status !== 'all' && status !== 'pending' && status !== 'accepted' && status !== 'rejected') {
        throw invalid('status is pending, accepted, rejected or all')
      }
      const rows = await sql<Row[]>`
        select * from ${items}
        where true
          ${opts.file ? sql`and file_id = ${opts.file.id}` : sql``}
          ${status === 'all' ? sql`` : sql`and status = ${status}`}
        order by created_at desc, id desc
        limit 1000`
      return visible(rows)
    },

    /**
     * Applies suggestions: per file, in id order, each one over the result of the ones before,
     * and one write per file over the revision read. The ones whose text no longer appears
     * once stay pending and come back as stale. Nothing of a file is applied if it changed in
     * between (a stale error).
     */
    async accept(ids: unknown, author: Author): Promise<Acceptance> {
      const { rows, byFile } = await pending(ids)
      const out: Acceptance = { accepted: [], stale: [], files: [] }
      for (const [fileId, file] of byFile) {
        let content = file.content
        const applied: number[] = []
        for (const row of rows.filter((r) => r.file_id === fileId)) {
          const at = locate(content, row.old_string)
          if (at === undefined) {
            out.stale.push(Number(row.id))
            continue
          }
          content = content.slice(0, at) + row.new_string + content.slice(at + row.old_string.length)
          applied.push(Number(row.id))
        }
        if (applied.length === 0) continue
        out.files.push(await files.update(fileId, { content, ifRevision: file.revision }, { author }))
        await sql`update ${items} set status = 'accepted', resolved_at = now() where id in ${sql(applied)} and status = 'pending'`
        out.accepted.push(...applied)
      }
      return out
    },

    async reject(ids: unknown): Promise<{ rejected: number }> {
      const { rows } = await pending(ids)
      const done = await sql`
        update ${items} set status = 'rejected', resolved_at = now()
        where id in ${sql(rows.map((r) => r.id))} and status = 'pending' returning id`
      return { rejected: done.length }
    },

    /** How many are pending in each file the caller reaches. */
    async counts(): Promise<{ path: string; file_id: string; pending: number }[]> {
      const rows = await sql<{ file_id: string; pending: number }[]>`
        select file_id, count(*)::int as pending from ${items} where status = 'pending' group by file_id`
      const byFile = await filesOf(rows as unknown as Row[])
      return rows
        .flatMap((r) => {
          const file = byFile.get(r.file_id)
          return file ? [{ path: file.path, file_id: r.file_id, pending: r.pending }] : []
        })
        .sort((a, b) => a.path.localeCompare(b.path))
    },
  }
}

export type SuggestionsService = ReturnType<typeof createSuggestions>
