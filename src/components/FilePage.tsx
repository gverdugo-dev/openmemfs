import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ApiError, type FileData, files } from '#/lib/api'
import type { FileTab, WritePatch } from '#/lib/module'
import { fileQuery, filesQuery } from '#/lib/queries'
import { CategorySelect } from './Categories'
import { Page } from './Page'
import { TagEditor } from './Tags'

type Saving = 'saved' | 'saving' | 'conflict' | 'error'

interface Props {
  path: string
  tab?: string
  tabs: FileTab[]
}

/**
 * The page of a file: its folder, its name (which renames it), and the tabs the modules
 * give it. All writes go through `write`, one at a time and only over the revision on screen,
 * so the editor never overwrites a change an agent made meanwhile without saying so.
 */
export function FilePage({ path, tab, tabs }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: file, error, refetch } = useQuery(fileQuery(path))
  const [saving, setSaving] = useState<Saving>('saved')
  const [message, setMessage] = useState('')
  /** Bumped when the file on screen is replaced from outside the tab (reload, restore). */
  const [generation, setGeneration] = useState(0)
  const latest = useRef<FileData | null>(null)
  latest.current = file ?? null
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  /** The last write refused for a conflict: "Keep mine" sends it again over the newer version. */
  const refused = useRef<WritePatch | null>(null)

  const show = useCallback(
    (next: FileData, remount: boolean) => {
      latest.current = next
      queryClient.setQueryData(fileQuery(next.path).queryKey, next)
      if (remount) setGeneration((g) => g + 1)
    },
    [queryClient],
  )

  async function reload() {
    const { data } = await refetch()
    if (data) show(data, true)
    setSaving('saved')
  }

  const write = useCallback(
    (patch: WritePatch, force = false): Promise<FileData | null> => {
      const run = async () => {
        const current = latest.current
        if (!current) return null
        setSaving('saving')
        try {
          const next = await files.update(current.id, { ...patch, ...(force ? {} : { if_revision: current.revision }) })
          show(next, false)
          setSaving('saved')
          return next
        } catch (e) {
          const conflict = e instanceof ApiError && e.code === 'stale'
          if (conflict) refused.current = patch
          setSaving(conflict ? 'conflict' : 'error')
          setMessage((e as Error).message)
          return null
        }
      }
      const next = queue.current.then(run)
      queue.current = next
      return next
    },
    [show],
  )

  const visible = useMemo(
    () => (file ? tabs.filter((t) => !t.when || t.when(file)).sort((a, b) => a.order - b.order) : []),
    [tabs, file],
  )

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Page>
        <h1 className="text-4xl">Not here</h1>
        <p className="mt-3 text-ink-2">
          There is no file at <code className="font-mono text-ink">{path}</code>. It may have been moved or deleted.
        </p>
      </Page>
    )
  }
  if (error) return <Page><p className="text-sm text-destructive">{error.message}</p></Page>
  if (!file) return <Page />

  const active = visible.find((t) => t.id === tab) ?? visible[0]
  const name = file.path.slice(file.path.lastIndexOf('/') + 1)
  const folder = file.path.slice(0, file.path.lastIndexOf('/') + 1)

  async function rename(next: string) {
    const target = next.startsWith('/') ? next : folder + next
    if (!next || target === file!.path) return
    try {
      const renamed = await files.update(file!.id, { path: target, if_revision: file!.revision })
      show(renamed, false)
      void queryClient.invalidateQueries(filesQuery)
      void navigate({ to: '/', search: { path: renamed.path, tab }, replace: true })
    } catch (e) {
      setSaving('error')
      setMessage((e as Error).message)
    }
  }

  /**
   * Category and tags are not content: they do not move the revision. They still wait in the
   * write queue, so their answer never puts an older revision on screen over a newer one.
   */
  function organize(action: (id: string) => Promise<FileData>) {
    const run = async () => {
      try {
        show(await action(file!.id), false)
        void Promise.all(
          [['files'], ['tags'], ['categories']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        )
      } catch (e) {
        setSaving('error')
        setMessage((e as Error).message)
      }
    }
    const next = queue.current.then(run)
    queue.current = next
    return next
  }

  async function remove() {
    if (!window.confirm(`Delete ${file!.path}? Its history goes with it.`)) return
    await files.remove(file!.id)
    void queryClient.invalidateQueries(filesQuery)
    void navigate({ to: '/', search: {} })
  }

  return (
    <Page>
      <div className="flex items-center justify-between gap-4">
        <p className="truncate font-mono text-xs text-ink-3">{folder}</p>
        <div className="flex shrink-0 items-center gap-3">
          <SavingState saving={saving} />
          <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <FileName key={file.path} name={name} onRename={rename} />

      <dl className="mt-4 grid grid-cols-[6rem_1fr] items-center gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-3">Category</dt>
        <dd>
          <CategorySelect
            label="Category"
            empty="None"
            className="h-9 w-auto max-w-full py-0 text-sm"
            value={file.category_id}
            onChange={(id) => void organize((fileId) => files.setCategory(fileId, id))}
          />
        </dd>
        <dt className="text-ink-3">Tags</dt>
        <dd>
          <TagEditor
            tags={file.tags}
            inherited={file.folder_tags}
            onAdd={(tag) => organize((id) => files.tag(id, tag))}
            onRemove={(tag) => organize((id) => files.untag(id, tag))}
          />
        </dd>
      </dl>

      {(saving === 'conflict' || saving === 'error') && (
        <div className="mt-4 rounded-lg border-2 border-ink bg-wash px-4 py-3 text-sm">
          <p className="text-ink">
            {saving === 'conflict'
              ? 'This file changed somewhere else (an agent, another tab) since you opened it. Your last edit is not saved.'
              : message}
          </p>
          {saving === 'conflict' && (
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary h-8 px-3" onClick={() => void reload()}>
                Load theirs
              </button>
              <button
                type="button"
                className="btn btn-outline h-8 px-3"
                onClick={() => refused.current && void write(refused.current, true)}
              >
                Keep mine
              </button>
            </div>
          )}
        </div>
      )}

      <div role="tablist" className="mt-8 flex gap-6 border-b-2 border-line">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t === active}
            onClick={() => void navigate({ to: '/', search: { path: file.path, tab: t.id }, replace: true })}
            className={`-mb-0.5 border-b-2 pb-2 font-display text-[13px] font-bold tracking-[0.04em] uppercase transition-colors ${t === active ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 pb-24" role="tabpanel">
        {active && (
          <active.Component key={`${file.id}:${generation}`} file={file} write={write} replace={(f) => show(f, true)} />
        )}
      </div>
    </Page>
  )
}

/** The title is the file name: editing it renames the file in its folder (a "/" path moves it). */
function FileName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name)
  return (
    <input
      aria-label="File name"
      className="mt-2 w-full bg-transparent font-display text-4xl font-extrabold tracking-tight text-ink outline-none md:text-5xl"
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onRename(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setValue(name)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function SavingState({ saving }: { saving: Saving }) {
  const text = { saved: 'Saved', saving: 'Saving…', conflict: 'Not saved', error: 'Not saved' }[saving]
  return (
    <span className={`text-xs ${saving === 'saved' ? 'text-ink-3' : saving === 'saving' ? 'text-ink-2' : 'text-destructive'}`}>
      {text}
    </span>
  )
}
