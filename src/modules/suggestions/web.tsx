import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '#/components/Page'
import { api, type FileData } from '#/lib/api'
import type { TabProps, WebModule } from '#/lib/module'
import { inContext } from './diff'

interface Suggestion {
  id: number
  path: string
  old_string: string
  new_string: string
  reason: string
  author: string
  stale: boolean
  created_at: string
}

interface Acceptance {
  accepted: number[]
  stale: number[]
  files: FileData[]
}

/**
 * The pending suggestions of a file, each in its paragraph with the change marked word by
 * word, in the order of the document; the stale ones last. Accepting writes the file.
 */
function SuggestionsTab({ file, replace }: TabProps) {
  const queryClient = useQueryClient()
  const { data, error } = useQuery({
    queryKey: ['suggestions', file.id, file.revision],
    queryFn: () => api<Suggestion[]>('GET', `/suggestions?path=${encodeURIComponent(file.path)}`),
  })
  const [notice, setNotice] = useState('')

  async function decide(action: 'accept' | 'reject', ids: number[]) {
    setNotice('')
    try {
      if (action === 'accept') {
        const done = await api<Acceptance>('POST', '/suggestions/accept', { ids })
        const written = done.files.find((f) => f.id === file.id)
        if (written) replace(written)
        if (done.stale.length > 0) setNotice(`${done.stale.length} no longer applied and stay pending.`)
      } else {
        await api('POST', '/suggestions/reject', { ids })
      }
    } catch (e) {
      setNotice((e as Error).message)
    }
    await queryClient.invalidateQueries({ queryKey: ['suggestions'] })
  }

  if (error) return <p className="text-ink-2">{(error as Error).message}</p>
  if (!data) return null
  const at = (s: Suggestion) => (s.stale ? Number.MAX_SAFE_INTEGER : file.content.indexOf(s.old_string))
  const list = [...data].sort((a, b) => at(a) - at(b))
  const live = list.filter((s) => !s.stale)

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-baseline justify-between">
        <p className="text-ink-2">{list.length === 0 ? 'No suggestions are waiting on this file.' : `${list.length} waiting.`}</p>
        {live.length > 1 && (
          <button type="button" className="btn btn-primary" onClick={() => decide('accept', live.map((s) => s.id))}>
            Accept the {live.length}
          </button>
        )}
      </div>
      {notice && <p className="rounded-lg border-2 border-ink bg-wash px-4 py-3 text-sm text-ink">{notice}</p>}
      {list.map((s) => (
        <article key={s.id} className="border-2 border-line p-4">
          <Change content={file.content} suggestion={s} />
          <p className="mt-3 text-sm text-ink-2">
            {s.reason && <span className="text-ink">{s.reason} </span>}
            <span className="font-mono text-xs">{s.author}</span>
            {s.stale && (
              <span data-color="yellow" className="chip-tone ml-2 rounded px-1.5 py-0.5 text-xs">
                stale
              </span>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            {!s.stale && (
              <button type="button" className="btn btn-outline h-8 px-3 text-xs" onClick={() => decide('accept', [s.id])}>
                Accept
              </button>
            )}
            <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={() => decide('reject', [s.id])}>
              Reject
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function Change({ content, suggestion }: { content: string; suggestion: Suggestion }) {
  const { before, change, after } = inContext(content, suggestion.old_string, suggestion.new_string)
  return (
    <p className="whitespace-pre-wrap text-ink">
      {before}
      {change.map((piece, i) =>
        piece.kind === 'same' ? (
          <span key={i}>{piece.text}</span>
        ) : (
          <span
            key={i}
            data-color={piece.kind === 'add' ? 'green' : 'red'}
            className={`bg-[var(--tone-fill)] text-[var(--tone-ink)] ${piece.kind === 'remove' ? 'line-through' : ''}`}
          >
            {piece.text}
          </span>
        ),
      )}
      {after}
    </p>
  )
}

/** Every file with suggestions waiting, with how many. */
function SuggestionsPage() {
  const { data, error } = useQuery({
    queryKey: ['suggestions', 'counts'],
    queryFn: () => api<{ path: string; pending: number }[]>('GET', '/suggestions/counts'),
  })
  return (
    <Page>
      <h1 className="text-4xl md:text-5xl">Suggestions</h1>
      <p className="mt-2 text-sm text-ink-2">Edits proposed by agents, waiting for you to accept or reject them.</p>
      {error && <p className="mt-6 text-ink-2">{(error as Error).message}</p>}
      {data && data.length === 0 && <p className="mt-6 text-ink-2">Nothing is waiting.</p>}
      {data && data.length > 0 && (
        <ul className="mt-6 border-t border-line">
          {data.map((f) => (
            <li key={f.path} className="flex justify-between border-b border-line py-2 text-sm">
              <Link to="/" search={{ path: f.path, tab: 'suggestions' }} className="font-mono text-ink hover:underline">
                {f.path}
              </Link>
              <span className="text-ink-2">{f.pending}</span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

export const suggestions: WebModule = {
  id: 'suggestions',
  tabs: [
    { id: 'suggestions', label: 'Suggestions', order: 20, when: (f) => !f.metadata?.media, Component: SuggestionsTab },
  ],
  pages: [{ id: 'suggestions', label: 'Suggestions', Component: SuggestionsPage }],
}
