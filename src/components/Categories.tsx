import { useQuery } from '@tanstack/react-query'
import type { Category } from '#/lib/api'
import { categoriesQuery } from '#/lib/queries'
import { Swatch } from './Color'

/** "Work" for a category, "Work / Clients" for a subcategory. */
export function categoryLabel(list: Category[], id: string | null | undefined): string | undefined {
  const category = list.find((c) => c.id === id)
  if (!category) return undefined
  const parent = list.find((c) => c.id === category.parent_id)
  return parent ? `${parent.name} / ${category.name}` : category.name
}

/**
 * A file's category as a chip in its colour. A subcategory shows its category's dot before
 * its own name, so "Work / Clients" reads in both colours.
 */
export function CategoryBadge({ id }: { id: string | null | undefined }) {
  const { data: list = [] } = useQuery(categoriesQuery)
  const category = list.find((c) => c.id === id)
  if (!category) return null
  const parent = list.find((c) => c.id === category.parent_id)
  return (
    <span data-color={category.color} className="chip chip-tone">
      {parent && <Swatch color={parent.color} className="size-2" />}
      {parent ? `${parent.name} / ${category.name}` : category.name}
    </span>
  )
}

interface SelectProps {
  value: string | null | undefined
  onChange: (id: string | null) => void
  /** What no category reads as: "None" on a file, "Any category" in a filter. */
  empty: string
  label: string
  className?: string
}

/** A category or subcategory ("Work / Clients"), in the order the API keeps: each category before its subcategories. */
export function CategorySelect({ value, onChange, empty, label, className = '' }: SelectProps) {
  const { data: list = [] } = useQuery(categoriesQuery)
  const chosen = list.find((c) => c.id === value)
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      {chosen && <Swatch color={chosen.color} className="size-3" />}
      <select
      aria-label={label}
      className={`field ${className}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{empty}</option>
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {categoryLabel(list, c.id)}
        </option>
      ))}
      </select>
    </span>
  )
}
