import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type FileData, type Metadata } from '#/lib/api'
import type { TabProps, WebModule } from '#/lib/module'

interface VersionEntry {
  version: number
  path: string
  author: 'user' | 'agent'
  size: number
  created_at: string
  updated_at: string
}

interface Version extends Omit<VersionEntry, 'size'> {
  content: string
  metadata: Metadata
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** History: every version of the file, who left it, and a way back to any of them. */
function HistoryTab({ file, replace }: TabProps) {
  // Keyed by the revision too: every write to the file may have left a version.
  const { data: versions, error: loadError } = useQuery({
    queryKey: ['versions', file.id, file.revision],
    queryFn: () => api<VersionEntry[]>('GET', `/files/${file.id}/versions`),
  })
  const [open, setOpen] = useState<Version | null>(null)
  const [restoreError, setError] = useState('')
  const error = loadError?.message ?? restoreError

  async function show(n: number) {
    setOpen(open?.version === n ? null : await api<Version>('GET', `/files/${file.id}/versions/${n}`))
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

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!versions) return null
  if (versions.length === 0) return <p className="text-sm text-ink-2">No versions yet.</p>

  return (
    <ol className="border-t border-line">
      {versions.map((v, i) => (
        <li key={v.version} className="border-b border-line">
          <div className="flex items-center gap-3 py-3">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
              aria-expanded={open?.version === v.version}
              onClick={() => void show(v.version)}
            >
              <span className="w-10 shrink-0 font-display text-sm font-bold text-black">v{v.version}</span>
              <span className="rounded-full border-2 border-black px-2 font-display text-[11px] leading-[18px] font-bold tracking-[0.04em] text-black uppercase">
                {v.author}
              </span>
              <span className="truncate text-sm text-ink-2">{when.format(new Date(v.updated_at))}</span>
              {v.path !== file.path && <span className="truncate font-mono text-xs text-ink-3">{v.path}</span>}
            </button>
            {i === 0 ? (
              <span className="text-xs text-ink-3">Current</span>
            ) : (
              <button type="button" className="btn btn-outline h-8 px-3" onClick={() => void restore(v.version)}>
                Restore
              </button>
            )}
          </div>
          {open?.version === v.version && (
            <div className="pb-4">
              <pre className="max-h-96 overflow-auto rounded-xl bg-wash p-4 font-mono text-[13px] whitespace-pre-wrap text-black">
                {open.content || '(empty)'}
              </pre>
              {Object.keys(open.metadata).length > 0 && (
                <pre className="mt-2 overflow-auto rounded-xl bg-wash p-4 font-mono text-[12px] text-ink-2">
                  {JSON.stringify(open.metadata, null, 2)}
                </pre>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

export const history: WebModule = {
  id: 'history',
  tabs: [{ id: 'history', label: 'History', order: 30, Component: HistoryTab }],
}
