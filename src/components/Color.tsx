import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { COLORS, type Color } from '#/lib/colors'
import { tagsQuery } from '#/lib/queries'

/** A dot in a label colour. */
export function Swatch({ color, className = 'size-2.5' }: { color: Color; className?: string }) {
  return <span data-color={color} className={`tone-dot inline-block shrink-0 rounded-full ${className}`} aria-hidden="true" />
}

/** The nine colours of the palette as buttons, the chosen one ringed in black. */
export function ColorPicker({ value, onChange, label }: { value: Color; onChange: (color: Color) => void; label: string }) {
  return (
    <span role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          title={color}
          data-color={color}
          className={`tone-dot size-4 rounded-full ring-offset-2 transition-transform hover:scale-110 ${color === value ? 'ring-2 ring-black' : ''}`}
          onClick={() => color !== value && onChange(color)}
        />
      ))}
    </span>
  )
}

/** The colour of each tag by name, ignoring case, as the API names them. */
export function useTagColors(): (name: string) => Color {
  const { data: list = [] } = useQuery(tagsQuery)
  return useMemo(() => {
    const byName = new Map(list.map((t) => [t.name.toLowerCase(), t.color]))
    return (name: string) => byName.get(name.toLowerCase()) ?? 'gray'
  }, [list])
}
