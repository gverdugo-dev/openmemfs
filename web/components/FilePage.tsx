import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, type FileData, files } from '../api'
import type { FileTab, WritePatch } from '../module'
import { navigate } from '../route'

type Saving = 'saved' | 'saving' | 'conflict' | 'error'

interface Props {
  path: string
  tab?: string
  tabs: FileTab[]
  onChanged: () => void
}

/**
 * The page of a file: its folder, its name (which renames it), and the tabs the modules
 * give it. All writes go through `write`, one at a time and only over the revision on screen,
 * so the editor never overwrites a change an agent made meanwhile without saying so.
 */
export function FilePage({ path, tab, tabs, onChanged }: Props) {
  const [file, setFile] = useState<FileData | null>(null)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState<Saving>('saved')
  const [message, setMessage] = useState('')
  /** Bumped when the file on screen is replaced from outside the tab (reload, restore). */
  const [generation, setGeneration] = useState(0)
  const latest = useRef<FileData | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  /** The last write refused for a conflict: "Keep mine" sends it again over the newer version. */
  const refused = useRef<WritePatch | null>(null)

  const show = useCallback((next: FileData, remount: boolean) => {
    latest.current = next
    setFile(next)
    if (remount) setGeneration((g) => g + 1)
  }, [])

  const load = useCallback(async () => {
    try {
      show(await files.byPath(path), true)
      setMissing(false)
      setSaving('saved')
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true)
      else throw e
    }
  }, [path, show])

  useEffect(() => {
    if (latest.current?.path !== path) {
      setFile(null)
      void load()
    }
  }, [path, load])

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

  if (missing) {
    return (
      <Page>
        <h1 className="text-4xl">Not here</h1>
        <p className="mt-3 text-ink-2">
          There is no file at <code className="font-mono text-black">{path}</code>. It may have been moved or deleted.
        </p>
      </Page>
    )
  }
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
      onChanged()
      navigate({ path: renamed.path, tab }, true)
    } catch (e) {
      setSaving('error')
      setMessage((e as Error).message)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${file!.path}? Its history goes with it.`)) return
    await files.remove(file!.id)
    onChanged()
    navigate({})
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

      {(saving === 'conflict' || saving === 'error') && (
        <div className="mt-4 rounded-lg border-2 border-black bg-wash px-4 py-3 text-sm">
          <p className="text-black">
            {saving === 'conflict'
              ? 'This file changed somewhere else (an agent, another tab) since you opened it. Your last edit is not saved.'
              : message}
          </p>
          {saving === 'conflict' && (
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary h-8 px-3" onClick={() => void load()}>
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
            onClick={() => navigate({ path: file.path, tab: t.id }, true)}
            className={`-mb-0.5 border-b-2 pb-2 font-display text-[13px] font-bold tracking-[0.04em] uppercase transition-colors ${t === active ? 'border-black text-black' : 'border-transparent text-ink-3 hover:text-black'}`}
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

/** Every page is a centred column with the same measure. */
export function Page({ children }: { children?: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-6 pt-10 md:px-12">{children}</div>
}

/** The title is the file name: editing it renames the file in its folder (a "/" path moves it). */
function FileName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name)
  return (
    <input
      aria-label="File name"
      className="mt-2 w-full bg-transparent font-display text-4xl font-extrabold tracking-tight text-black outline-none md:text-5xl"
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
