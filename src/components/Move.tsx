import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { type DragEvent, useState, useSyncExternalStore } from 'react'
import { files, folders } from '#/lib/api'
import { placeOf } from '#/lib/place'

/**
 * Drag and drop to move. Files and folders in the explorer and on folder pages can be dragged;
 * folders, the folder path above a page and the empty part of the explorer (the root) take
 * drops. A file moves with a path change; a folder with everything in it.
 */
const DRAG_TYPE = 'application/x-openmemfs'

export type Dragged = { kind: 'file'; id: string; path: string } | { kind: 'folder'; path: string }

const nameOf = (item: Dragged) => item.path.split('/').filter(Boolean).at(-1) ?? ''
const parentOf = (item: Dragged) => {
  const trimmed = item.kind === 'folder' ? item.path.slice(0, -1) : item.path
  return trimmed.slice(0, trimmed.lastIndexOf('/') + 1)
}

/** What makes a row or a block draggable. */
export function dragProps(item: Dragged) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item))
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

/** Moves a file or a folder into a folder, and follows it when it was the one on screen. */
function useMove() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search })

  return async (item: Dragged, target: string) => {
    if (parentOf(item) === target) return
    if (item.kind === 'folder' && target.startsWith(item.path)) return notify(`A folder cannot go inside itself.`)
    const to = `${target}${nameOf(item)}${item.kind === 'folder' ? '/' : ''}`
    try {
      if (item.kind === 'file') await files.update(item.id, { path: to })
      else await folders.move(item.path, to)
    } catch (e) {
      return notify((e as Error).message)
    }
    queryClient.removeQueries({ queryKey: ['file'] })
    await queryClient.invalidateQueries({ queryKey: ['files'] })
    await queryClient.invalidateQueries({ queryKey: ['folder-tags'] })
    // Whatever was open under the old path now lives under the new one.
    const place = placeOf(search as Record<string, unknown>)
    const under = (path?: string) => !!path && (item.kind === 'file' ? path === item.path : path.startsWith(item.path))
    if (place.path && under(place.path)) {
      void navigate({ to: '/', search: { ...place, path: to + place.path.slice(item.path.length) } })
    } else if (place.view === 'folder' && place.folder && under(place.folder)) {
      void navigate({ to: '/', search: { ...place, folder: to + place.folder.slice(item.path.length) } })
    }
  }
}

/** What makes an element take drops into `folder`, and whether something is over it now. */
export function useDropTarget(folder: string) {
  const move = useMove()
  const [over, setOver] = useState(false)
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE)
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (!accepts(event)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
      },
      onDrop: (event: DragEvent) => {
        if (!accepts(event)) return
        event.preventDefault()
        event.stopPropagation()
        setOver(false)
        void move(JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as Dragged, folder)
      },
    },
  }
}

// A move that fails says why at the bottom of the screen, then goes away.
let notice = ''
const listeners = new Set<() => void>()
function notify(message: string) {
  notice = message
  for (const l of listeners) l()
  setTimeout(() => {
    if (notice !== message) return
    notice = ''
    for (const l of listeners) l()
  }, 5000)
}

export function MoveNotice() {
  const message = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => notice,
    () => '',
  )
  if (!message) return null
  return (
    <p role="alert" className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border-2 border-ink bg-paper px-4 py-3 text-sm text-ink">
      {message}
    </p>
  )
}
