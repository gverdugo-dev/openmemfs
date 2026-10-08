import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, type FileData, type Metadata } from '#/lib/api'
import { diffLines, hunks } from '#/lib/diff'
import type { TabProps, WebModule } from '#/lib/module'

interface VersionEntry {
  version: number
  path: string
  author: 'user' | 'agent'
  message: string | null
  size: number
  created_at: string
  updated_at: string
}

interface Version extends Omit<VersionEntry, 'size'> {
  content: string
  metadata: Metadata
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const versionQuery = (fileId: string, n: number) => ({
  queryKey: ['version', fileId, n],
  queryFn: () => api<Version>('GET', `/files/${fileId}/versions/${n}`),
  staleTime: Infinity,
})

/**
 * History: every save leaves a version, and a commit names one with a message. The list
 * shows every change, or only the commits; opening one shows what changed since the one
 * before it in that list, line by line.
 */
function HistoryTab({ file, replace }: TabProps) {
  const queryClient = useQueryClient()
  // Keyed by the revision too: every write to the file may have left a version.
  const { data: versions, error: loadError } = useQuery({
    queryKey: ['versions', file.id, file.revision],
    queryFn: () => api<VersionEntry[]>('GET', `/files/${file.id}/versions`),
  })
  const [only, setOnly] = useState<'all' | 'commits'>('all')
  const [open, setOpen] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [actionError, setError] = useState('')
  const error = loadError?.message ?? actionError

  async function commit(event: FormEvent) {
    event.preventDefault()
    if (!message.trim()) return
    setError('')
    try {
      await api('POST', `/files/${file.id}/commit`, { message })
      setMessage('')
      await queryClient.invalidateQueries({ queryKey: ['versions', file.id] })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function restore(n: number) {
    if (!window.confirm(`Bring back version ${n}? It is saved as a new version; nothing is lost.`)) return
    try {
      const restored = await api<FileData>('POST', `/files/${file.id}/versions/${n}/restore`, {
        if_revision: file.revision,
      })
      replace(restored)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!versions) return error ? <p className="text-sm text-destructive">{error}</p> : null
  if (versions.length === 0) return <p className="text-sm text-ink-2">No versions yet.</p>

  const committed = versions[0]!.message !== null
  const shown = only === 'commits' ? versions.filter((v) => v.message !== null) : versions

  return (
    <div>
      <form onSubmit={commit} className="flex flex-wrap gap-2">
        <input
          aria-label="Commit message"
          className="field min-w-0 flex-1"
          placeholder={committed ? 'Everything is committed' : 'Commit the latest version: what changed, and why'}
          disabled={committed}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={committed || !message.trim()}>
          Commit
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-3">
        Committing is optional: every save already leaves a version. A commit names one so it is easy to find again.
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-6 mb-2 flex items-center gap-1" role="group" aria-label="Show">
        {(['all', 'commits'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={only === value}
            className={`chip ${only === value ? 'chip-on' : ''}`}
            onClick={() => {
              setOnly(value)
              setOpen(null)
            }}
          >
            {value === 'all' ? `All changes (${versions.length})` : `Commits (${versions.filter((v) => v.message).length})`}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="py-3 text-sm text-ink-2">No commits yet.</p>}
      <ol className="border-t border-line">
        {shown.map((v, i) => (
          <li key={v.version} className="border-b border-line">
            <div className="flex items-center gap-3 py-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-left"
                aria-expanded={open === v.version}
                onClick={() => setOpen(open === v.version ? null : v.version)}
              >
                <span className="w-10 shrink-0 font-display text-sm font-bold text-black">v{v.version}</span>
                <span className={`min-w-0 truncate text-sm ${v.message ? 'font-medium text-black' : 'text-ink-3'}`}>
                  {v.message ?? 'Saved'}
                </span>
                <span className="rounded-full border-2 border-black px-2 font-display text-[11px] leading-[18px] font-bold tracking-[0.04em] text-black uppercase">
                  {v.author}
                </span>
                <span className="text-xs text-ink-3">{when.format(new Date(v.updated_at))}</span>
                {v.path !== file.path && <span className="truncate font-mono text-xs text-ink-3">{v.path}</span>}
              </button>
              {v.version === versions[0]!.version ? (
                <span className="text-xs text-ink-3">Current</span>
              ) : (
                <button type="button" className="btn btn-outline h-8 px-3" onClick={() => void restore(v.version)}>
                  Restore
                </button>
              )}
            </div>
            {open === v.version && <Changes fileId={file.id} version={v.version} base={shown[i + 1]?.version} />}
          </li>
        ))}
      </ol>
    </div>
  )
}

const pretty = (metadata: Metadata) => (Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '')

/** What a version changed since `base` (an older version, or nothing for the first one). */
function Changes({ fileId, version, base }: { fileId: string; version: number; base?: number }) {
  const after = useQuery(versionQuery(fileId, version))
  const before = useQuery({ ...versionQuery(fileId, base ?? 0), enabled: base !== undefined })
  if (!after.data || (base !== undefined && !before.data)) return <p className="pb-4 text-sm text-ink-3">Loading…</p>

  const old = before.data
  const content = hunks(diffLines(old?.content ?? '', after.data.content))
  const metadata = hunks(diffLines(old ? pretty(old.metadata) : '', pretty(after.data.metadata)))
  const moved = old && old.path !== after.data.path

  return (
    <div className="space-y-3 pb-4">
      <p className="text-xs text-ink-3">{base ? `Changes since v${base}` : 'The first version'}</p>
      {moved && (
        <p className="font-mono text-xs text-black">
          {old.path} → {after.data.path}
        </p>
      )}
      {content.length === 0 && metadata.length === 0 && !moved && <p className="text-sm text-ink-2">No changes.</p>}
      {content.length > 0 && <Diff lines={content} />}
      {metadata.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-ink-3 uppercase">Metadata</p>
          <Diff lines={metadata} />
        </div>
      )}
    </div>
  )
}

function Diff({ lines }: { lines: ReturnType<typeof hunks> }) {
  const added = lines.filter((l) => l?.kind === 'add').length
  const removed = lines.filter((l) => l?.kind === 'del').length
  return (
    <div className="overflow-hidden rounded-md border-2 border-line-strong">
      <p className="border-b border-line bg-wash px-3 py-1 font-mono text-xs text-ink-2">
        +{added} −{removed}
      </p>
      <pre className="max-h-[28rem] overflow-auto py-1 font-mono text-[13px] leading-6">
        {lines.map((line, i) =>
          line === null ? (
            <div key={i} className="px-3 text-ink-4">
              ⋯
            </div>
          ) : (
            <div
              key={i}
              data-color={line.kind === 'add' ? 'green' : line.kind === 'del' ? 'red' : undefined}
              className={`px-3 whitespace-pre-wrap ${line.kind === 'same' ? 'text-ink-2' : 'bg-(--tone-fill) text-(--tone-ink)'}`}
            >
              <span className="mr-2 inline-block w-3 select-none">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span>
              {line.text || ' '}
            </div>
          ),
        )}
      </pre>
    </div>
  )
}

export const history: WebModule = {
  id: 'history',
  tabs: [{ id: 'history', label: 'History', order: 30, Component: HistoryTab }],
}
