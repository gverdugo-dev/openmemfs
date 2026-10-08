import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ApiError, type FileData, type Trashed, trash } from '#/lib/api'
import { trashQuery } from '#/lib/queries'
import { notify } from './Move'
import { Page } from './Page'

/** Deleted files, with their history, until the trash is emptied. */
export function Trash() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: list = [] } = useQuery(trashQuery)
  const [error, setError] = useState('')

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError('')
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
      return false
    }
    await queryClient.invalidateQueries({ queryKey: ['files'] })
    return true
  }

  async function restore(item: Trashed) {
    setError('')
    let restored: FileData
    try {
      restored = await trash.restore(item.id)
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'conflict')) return setError((e as Error).message)
      // Something else took its path meanwhile: ask where this one goes instead.
      const path = window.prompt(`${(e as Error).message}\n\nRestore it as:`, item.path.replace(/(\.[^./]+)?$/, '-restored$1'))
      if (!path) return
      try {
        restored = await trash.restore(item.id, path)
      } catch (again) {
        return setError((again as Error).message)
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['files'] })
    notify(`${restored.path} restored.`)
    void navigate({ to: '/', search: { path: restored.path } })
  }

  async function forget(item: Trashed) {
    if (!window.confirm(`Delete ${item.path} for good? Its history goes with it.`)) return
    await run(() => trash.remove(item.id))
  }

  async function empty() {
    if (!window.confirm(`Delete the ${list.length} files in the trash for good? Their history goes with them.`)) return
    await run(() => trash.empty())
  }

  return (
    <Page>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-4xl md:text-5xl">Trash</h1>
        {list.length > 0 && (
          <button type="button" className="btn btn-outline" onClick={empty}>
            Empty trash
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-ink-2">Deleted files wait here with their history and tags. Restore one, or delete it for good.</p>
      {error && <p className="mt-4 rounded-lg border-2 border-ink bg-wash px-4 py-3 text-sm text-ink">{error}</p>}
      {list.length === 0 ? (
        <p className="mt-10 text-ink-2">The trash is empty.</p>
      ) : (
        <ul className="mt-6 border-t border-line pb-24">
          {list.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b border-line py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm text-ink">{item.path}</div>
                <div className="text-xs text-ink-2">
                  Deleted {new Date(item.deleted_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => restore(item)}>
                Restore
              </button>
              <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => forget(item)}>
                Delete for good
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
