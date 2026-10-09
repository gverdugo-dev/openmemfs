import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { api, type FileData, type Metadata } from '#/lib/api'
import type { TabProps, WebModule } from '#/lib/module'

interface Target {
  id: string
  path: string
  metadata: Metadata
}

interface Backlink {
  id: string
  path: string
  rel: string
}

/** The links of a file and the files that link to it, with each relation editable as a list of paths. */
function LinksTab({ file, replace }: TabProps) {
  const queryClient = useQueryClient()
  const key = ['links', file.id, file.revision]
  const { data: links, error } = useQuery({ queryKey: [...key, 'out'], queryFn: () => api<Record<string, Target[]>>('GET', `/files/${file.id}/links`) })
  const { data: backlinks } = useQuery({ queryKey: [...key, 'in'], queryFn: () => api<Backlink[]>('GET', `/files/${file.id}/backlinks`) })
  const [editing, setEditing] = useState<{ rel: string; paths: string } | null>(null)
  const [failure, setFailure] = useState('')

  async function save() {
    if (!editing) return
    setFailure('')
    try {
      const paths = editing.paths
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
      const written = await api<FileData>('PUT', `/files/${file.id}/links/${encodeURIComponent(editing.rel.trim())}`, {
        paths,
        if_revision: file.revision,
      })
      replace(written)
      setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['links', file.id] })
    } catch (e) {
      setFailure((e as Error).message)
    }
  }

  if (error) return <p className="text-ink-2">{(error as Error).message}</p>
  const rels = Object.entries(links ?? {})
  return (
    <div className="space-y-10 pb-24">
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl">Links</h2>
          {!editing && (
            <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => setEditing({ rel: '', paths: '' })}>
              New relation
            </button>
          )}
        </div>
        {rels.length === 0 && !editing && <p className="mt-3 text-ink-2">This file links to no other file.</p>}
        {rels.map(([rel, targets]) => (
          <div key={rel} className="mt-4">
            <div className="flex items-baseline justify-between">
              <h3 className="font-mono text-sm uppercase text-ink-2">{rel}</h3>
              {!editing && (
                <button
                  type="button"
                  className="btn btn-ghost h-8 px-2 text-xs"
                  onClick={() => setEditing({ rel, paths: targets.map((t) => t.path).join('\n') })}
                >
                  Edit
                </button>
              )}
            </div>
            <Paths items={targets} />
          </div>
        ))}
        {editing && (
          <div className="mt-4 space-y-3 border-2 border-ink p-4">
            <input
              className="field w-full font-mono text-sm"
              placeholder="relation, like image"
              value={editing.rel}
              onChange={(e) => setEditing({ ...editing, rel: e.target.value })}
            />
            <textarea
              className="field h-32 w-full font-mono text-sm"
              placeholder="one absolute path per line, in order; empty removes the relation"
              value={editing.paths}
              onChange={(e) => setEditing({ ...editing, paths: e.target.value })}
            />
            {failure && <p className="text-sm text-ink">{failure}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={save} disabled={editing.rel.trim() === ''}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
      <section>
        <h2 className="text-2xl">Linked from</h2>
        {backlinks && backlinks.length === 0 && <p className="mt-3 text-ink-2">No file links here.</p>}
        {backlinks && backlinks.length > 0 && <Paths items={backlinks} />}
      </section>
    </div>
  )
}

function Paths({ items }: { items: { id: string; path: string; rel?: string }[] }) {
  return (
    <ul className="mt-2 border-t border-line">
      {items.map((item) => (
        <li key={`${item.id}-${item.rel ?? ''}`} className="flex justify-between border-b border-line py-2 text-sm">
          <Link to="/" search={{ path: item.path }} className="font-mono text-ink hover:underline">
            {item.path}
          </Link>
          {item.rel && <span className="font-mono text-xs uppercase text-ink-2">{item.rel}</span>}
        </li>
      ))}
    </ul>
  )
}

export const links: WebModule = {
  id: 'links',
  tabs: [{ id: 'links', label: 'Links', order: 40, Component: LinksTab }],
}
