import { useCallback, useEffect, useRef, useState } from 'react'

const MIN = 192
const MAX = 480
const DEFAULT = 256
const WIDTH_KEY = 'sidebar-width'
const COLLAPSED_KEY = 'sidebar-collapsed'

/** localStorage can be missing or refuse (private windows, blocked storage): the layout works without it. */
function load(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered, still applied.
  }
}

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)))

/**
 * How wide the sidebar is and whether it is folded, both remembered in this browser.
 * Cmd+\ (Ctrl+\ elsewhere) folds and unfolds it, as in Notion.
 */
export function useSidebarLayout() {
  const [width, setWidthState] = useState(DEFAULT)
  const [collapsed, setCollapsedState] = useState(false)

  useEffect(() => {
    const w = Number(load(WIDTH_KEY))
    if (w) setWidthState(clamp(w))
    setCollapsedState(load(COLLAPSED_KEY) === '1')
  }, [])

  const setWidth = useCallback((w: number) => {
    const next = clamp(w)
    setWidthState(next)
    save(WIDTH_KEY, String(next))
  }, [])

  const setCollapsed = useCallback((c: boolean) => {
    setCollapsedState(c)
    save(COLLAPSED_KEY, c ? '1' : '0')
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setCollapsedState((c) => {
          save(COLLAPSED_KEY, c ? '0' : '1')
          return !c
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { width, collapsed, setWidth, setCollapsed, defaultWidth: DEFAULT }
}

/**
 * The right edge of the sidebar: drag it to widen or narrow the sidebar, double-click to bring it
 * back to its default width. With the focus on it, the arrows, Home and End move it too.
 */
export function SidebarResizer({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      className={`absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize outline-none max-md:hidden ${
        dragging ? 'bg-line' : 'hover:bg-line focus-visible:bg-line'
      }`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, width }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (start.current) onChange(start.current.width + e.clientX - start.current.x)
      }}
      onPointerUp={() => {
        start.current = null
        setDragging(false)
      }}
      onPointerCancel={() => {
        start.current = null
        setDragging(false)
      }}
      onDoubleClick={() => onChange(DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16
        if (e.key === 'ArrowLeft') onChange(width - step)
        else if (e.key === 'ArrowRight') onChange(width + step)
        else if (e.key === 'Home') onChange(MIN)
        else if (e.key === 'End') onChange(MAX)
        else if (e.key === 'Enter') onChange(DEFAULT)
        else return
        e.preventDefault()
      }}
    />
  )
}
