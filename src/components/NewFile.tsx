import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { files } from '#/lib/api'

/** Asks for the path of a new file, starting in a folder, then opens it. */
export function NewFile({ folder, onClose }: { folder: string; onClose: () => void }) {
  const [path, setPath] = useState(`${folder}untitled.md`)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const file = await files.create(path.trim())
      void queryClient.invalidateQueries({ queryKey: ['files'] })
      onClose()
      void navigate({ to: '/', search: { path: file.path } })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-lg border-2 border-black bg-white p-2">
      <label className="block text-xs font-medium text-ink-2" htmlFor="new-path">
        Path
      </label>
      <input
        id="new-path"
        className="field mt-1 py-1 font-mono text-sm"
        value={path}
        autoFocus
        onFocus={(e) =>
          e.target.setSelectionRange(folder.length, path.lastIndexOf('.') > folder.length ? path.lastIndexOf('.') : path.length)
        }
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-1">
        <button type="button" className="btn btn-ghost h-8 px-2" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary h-8 px-3">
          Create
        </button>
      </div>
    </form>
  )
}
