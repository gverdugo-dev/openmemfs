import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Entry } from '#/lib/api'
import { categoriesQuery } from '#/lib/queries'
import { categoryLabel } from './Categories'
import { TagList } from './Tags'

/** Files as rows: name, folder, category, tags, and the matching text when there is one. */
export function FileList({ entries, empty }: { entries: Entry[]; empty: string }) {
  const { data: categories = [] } = useQuery(categoriesQuery)
  if (entries.length === 0) return <p className="py-3 text-sm text-ink-2">{empty}</p>
  return (
    <ul className="border-t border-line">
      {entries.map((entry) => {
        const slash = entry.path.lastIndexOf('/')
        const category = categoryLabel(categories, entry.category_id)
        return (
          <li key={entry.id} className="border-b border-line">
            <Link to="/" search={{ path: entry.path }} className="block py-3 hover:bg-hover">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display font-bold text-black">{entry.path.slice(slash + 1)}</span>
                <span className="font-mono text-xs text-ink-3">{entry.path.slice(0, slash + 1)}</span>
                {category && <span className="text-xs text-ink-2">{category}</span>}
              </span>
              {(entry.tags.length > 0 || entry.folder_tags.length > 0) && (
                <span className="mt-1.5 block">
                  <TagList tags={entry.tags} inherited={entry.folder_tags} />
                </span>
              )}
              {entry.snippet && <span className="mt-1.5 line-clamp-2 block text-sm text-ink-2">…{entry.snippet}…</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
