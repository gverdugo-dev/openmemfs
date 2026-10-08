import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import type { FolderTag } from '#/lib/api'
import { tagsQuery } from '#/lib/queries'
import { useTagColors } from './Color'

/** Read-only tags: solid for a file's own, muted for what it gets from a folder. */
export function TagList({ tags, inherited = [] }: { tags: string[]; inherited?: string[] }) {
  const colorOf = useTagColors()
  if (tags.length === 0 && inherited.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} data-color={colorOf(tag)} className="chip chip-tone">
          {tag}
        </span>
      ))}
      {inherited
        .filter((tag) => !tags.includes(tag))
        .map((tag) => (
          <span key={tag} data-color={colorOf(tag)} className="chip chip-tone-muted" title="From a folder">
            {tag}
          </span>
        ))}
    </span>
  )
}

interface EditorProps {
  tags: string[]
  /** Tags that come from a folder above: shown, not removable here. */
  inherited?: FolderTag[]
  onAdd: (tag: string) => Promise<unknown>
  onRemove: (tag: string) => Promise<unknown>
}

/**
 * The tags of a file or a folder: each one with a button to take it off, and a field that
 * adds one, suggesting the tags that exist. A new name creates the tag.
 */
export function TagEditor({ tags, inherited = [], onAdd, onRemove }: EditorProps) {
  const { data: all = [] } = useQuery(tagsQuery)
  const colorOf = useTagColors()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const listId = useId()

  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const tag = value.trim()
    if (!tag) return
    await run(() => onAdd(tag))
    setValue('')
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span key={tag} data-color={colorOf(tag)} className="chip chip-tone">
            {tag}
            <button
              type="button"
              className="-mr-1 opacity-60 hover:opacity-100"
              aria-label={`Remove tag ${tag}`}
              onClick={() => void run(() => onRemove(tag))}
            >
              ×
            </button>
          </span>
        ))}
        {inherited.map(({ folder, tag }) => (
          <span key={`${folder}:${tag}`} data-color={colorOf(tag)} className="chip chip-tone-muted" title={`From ${folder}`}>
            {tag}
          </span>
        ))}
        <form onSubmit={submit}>
          <input
            aria-label="Add a tag"
            className="h-6 w-28 rounded-full border-2 border-dashed border-line-strong bg-transparent px-2 text-xs outline-none focus:border-black"
            placeholder="+ tag"
            list={listId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <datalist id={listId}>
            {all
              .filter((t) => !tags.some((own) => own.toLowerCase() === t.name.toLowerCase()))
              .map((t) => (
                <option key={t.id} value={t.name} />
              ))}
          </datalist>
        </form>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
