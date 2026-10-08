import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { Filters } from '#/lib/api'
import type { Place } from '#/lib/place'
import { searchQuery, tagsQuery } from '#/lib/queries'
import { CategorySelect } from './Categories'
import { FileList } from './FileList'
import { Page } from './Page'

const WHERE = [
  ['all', 'Name and content'],
  ['name', 'Name'],
  ['content', 'Content'],
] as const

/**
 * Search and filters. Everything lives in the query string, so a search has a link: the text
 * (in the name, the content or both), the tags the files must all carry and a category.
 */
export function Search({ place }: { place: Place }) {
  const navigate = useNavigate()
  const [text, setText] = useState(place.q ?? '')
  const filters: Filters = { q: place.q, in: place.in, tag: place.tag, category: place.category }
  const { data: results, isFetching } = useQuery({ ...searchQuery(filters), placeholderData: keepPreviousData })
  const { data: tags = [] } = useQuery(tagsQuery)

  const go = (next: Partial<Place>) =>
    void navigate({ to: '/', search: { view: 'search', ...filters, ...next }, replace: true })

  // The text goes to the URL a moment after the last key, not on every key.
  useEffect(() => {
    if (text === (place.q ?? '')) return
    const timer = setTimeout(() => go({ q: text || undefined }), 250)
    return () => clearTimeout(timer)
  })

  const chosen = place.tag ?? []
  const toggle = (tag: string) => {
    const next = chosen.includes(tag) ? chosen.filter((t) => t !== tag) : [...chosen, tag]
    go({ tag: next.length ? next : undefined })
  }

  return (
    <Page>
      <h1 className="text-4xl md:text-5xl">Search</h1>
      <div className="mt-6 flex flex-wrap gap-2">
        <input
          aria-label="Search text"
          type="search"
          className="field min-w-0 flex-1 basis-64"
          placeholder="Find in names and content"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        <select
          aria-label="Where to look"
          className="field w-auto"
          value={place.in ?? 'all'}
          onChange={(e) => go({ in: e.target.value === 'all' ? undefined : (e.target.value as Place['in']) })}
        >
          {WHERE.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <CategorySelect
          label="Category"
          empty="Any category"
          className="w-auto"
          value={place.category}
          onChange={(id) => go({ category: id ?? undefined })}
        />
      </div>

      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tags">
          <span className="mr-1 text-xs font-medium text-ink-3 uppercase">Tags</span>
          {tags.map((tag) => {
            const on = chosen.includes(tag.name)
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={on}
                className={`chip ${on ? 'chip-on' : ''}`}
                onClick={() => toggle(tag.name)}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}

      <p className="mt-6 mb-2 text-xs text-ink-3" aria-live="polite">
        {results ? `${results.length} ${results.length === 1 ? 'file' : 'files'}` : ''}
        {isFetching ? ' …' : ''}
      </p>
      {results && <FileList entries={results} empty="No file matches." />}
    </Page>
  )
}
