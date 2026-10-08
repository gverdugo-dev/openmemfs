import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { files, folders } from '#/lib/api'
import { FileIcon, FolderIcon } from './Icons'

interface Props {
  /** The folder it goes in, with its trailing slash. */
  folder: string
  onClose: () => void
}

/**
 * Where a name typed in a form goes: inside the folder, unless it starts with "/", which is a
 * whole path. People type names; the path is shown, not asked for.
 */
const pathOf = (folder: string, name: string) => (name.startsWith('/') ? name : `${folder}${name}`)

/** Asks for the name of a new file and opens it. A name without an extension gets ".md". */
export function NewFile({ folder, onClose }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <NameForm
      kind="file"
      folder={folder}
      initial="Untitled"
      onClose={onClose}
      create={async (name) => {
        const path = pathOf(folder, /\.[^./]+$/.test(name) ? name : `${name}.md`)
        const file = await files.create(path)
        void queryClient.invalidateQueries({ queryKey: ['files'] })
        void navigate({ to: '/', search: { path: file.path } })
      }}
    />
  )
}

/**
 * Asks for the name of a new folder and stays where you are, so several folders can be made
 * side by side; the new one shows up in the explorer and in the folder you are looking at.
 */
export function NewFolder({ folder, onClose }: Props) {
  const queryClient = useQueryClient()
  return (
    <NameForm
      kind="folder"
      folder={folder}
      initial="New folder"
      onClose={onClose}
      create={async (name) => {
        await folders.create(`${pathOf(folder, name.replace(/\/+$/, ''))}/`)
        await queryClient.invalidateQueries({ queryKey: ['files'] })
      }}
    />
  )
}

interface FormProps extends Props {
  kind: 'file' | 'folder'
  initial: string
  create: (name: string) => Promise<void>
}

function NameForm({ kind, folder, initial, onClose, create }: FormProps) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError(`Give the ${kind} a name.`)
    setBusy(true)
    try {
      await create(trimmed)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const Icon = kind === 'file' ? FileIcon : FolderIcon
  return (
    <form onSubmit={submit} className="mt-2 rounded-lg border-2 border-ink bg-paper p-3">
      <label className="flex items-center gap-1.5 text-sm font-bold" htmlFor={`new-${kind}`}>
        <Icon className="size-4" />
        New {kind}
      </label>
      <input
        id={`new-${kind}`}
        className="field mt-2 py-1.5"
        value={name}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setName(e.target.value)
          setError('')
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        aria-describedby={`new-${kind}-where`}
      />
      <p id={`new-${kind}-where`} className="mt-1 truncate text-xs text-ink-3" title={folder}>
        In <span className="font-mono">{folder}</span>
      </p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-1">
        <button type="button" className="btn btn-ghost h-8 px-2" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary h-8 px-3" disabled={busy}>
          Create
        </button>
      </div>
    </form>
  )
}
