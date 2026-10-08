import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { type FormEvent, type MouseEvent, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api, type FileData, files, folders } from '#/lib/api'
import { placeOf } from '#/lib/place'
import { type Dragged, nameOf, notify, parentOf, useRelocate } from './Move'
import { NewFile, NewFolder } from './NewFile'

/**
 * Right-click on a file or a folder, in the explorer or on a folder page, opens a menu with what
 * can be done to it. The keyboard opens it too (the context-menu key or Shift+F10, which the
 * browser turns into the same event). The menu and the dialogs it opens live once, in the
 * workspace, and every row only says what it is.
 */
type Menu = { item: Dragged; x: number; y: number }
type Dialog = { kind: 'rename' | 'move' | 'new-file' | 'new-folder'; item: Dragged }

let menu: Menu | null = null
let dialog: Dialog | null = null
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version++
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const openMenu = (next: Menu | null) => {
  menu = next
  emit()
}
const openDialog = (next: Dialog | null) => {
  menu = null
  dialog = next
  emit()
}

/** What a row adds so right-clicking it opens the menu for `item`. */
export function contextMenuProps(item: Dragged) {
  return {
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      // From the keyboard there is no pointer: open it under the row.
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const fromKeyboard = event.clientX === 0 && event.clientY === 0
      openMenu({ item, x: fromKeyboard ? box.left + 16 : event.clientX, y: fromKeyboard ? box.bottom : event.clientY })
    },
  }
}

const linkTo = (item: Dragged) =>
  `${location.origin}/?${new URLSearchParams(item.kind === 'file' ? { path: item.path } : { view: 'folder', folder: item.path })}`

/** The first free name for a copy: "notes copy.md", then "notes copy 2.md". */
function copyName(path: string, taken: (p: string) => Promise<boolean>) {
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  const [stem, ext] = dot > slash ? [path.slice(0, dot), path.slice(dot)] : [path, '']
  return (async () => {
    for (let n = 1; n < 100; n++) {
      const candidate = `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`
      if (!(await taken(candidate))) return candidate
    }
    throw new Error('There are too many copies of this file already.')
  })()
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify(`${what} copied.`)
  } catch {
    notify(`Could not copy the ${what.toLowerCase()}.`)
  }
}

/** The menu and the dialogs, mounted once in the workspace. */
export function ContextMenuHost() {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  return (
    <>
      {menu && <MenuView menu={menu} />}
      {dialog && <DialogView dialog={dialog} />}
    </>
  )
}

interface Action {
  label: string
  hint?: string
  danger?: boolean
  run: () => void | Promise<void>
}

function useActions(item: Dragged): Action[][] {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search })
  const place = placeOf(search as Record<string, unknown>)
  const refresh = () =>
    Promise.all([['files'], ['folder-tags'], ['tags']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))

  const open =
    item.kind === 'file'
      ? () => navigate({ to: '/', search: { path: item.path } })
      : () => navigate({ to: '/', search: { view: 'folder', folder: item.path, layout: place.layout } })

  async function remove() {
    if (item.kind === 'file') {
      if (!window.confirm(`Delete ${item.path}? Its history goes with it.`)) return
      try {
        await files.remove(item.id)
      } catch (e) {
        return notify((e as Error).message)
      }
      queryClient.removeQueries({ queryKey: ['file'] })
      await refresh()
      if (place.path === item.path) void navigate({ to: '/', search: {} })
    } else {
      try {
        await folders.remove(item.path)
      } catch (e) {
        return notify((e as Error).message)
      }
      await refresh()
      if (place.folder?.startsWith(item.path)) void navigate({ to: '/', search: { view: 'folder', folder: parentOf(item) } })
    }
    notify(`${nameOf(item)} deleted.`)
  }

  async function duplicate() {
    if (item.kind !== 'file') return
    try {
      const original = await files.byPath(item.path)
      const path = await copyName(item.path, (p) => files.byPath(p).then(() => true, () => false))
      const copy = await api<FileData>('POST', '/files', { path, content: original.content, metadata: original.metadata })
      await refresh()
      void navigate({ to: '/', search: { path: copy.path } })
    } catch (e) {
      notify((e as Error).message)
    }
  }

  const share: Action[] = [
    { label: 'Copy path', run: () => copyText(item.path, 'Path') },
    { label: 'Copy link', run: () => copyText(linkTo(item), 'Link') },
  ]

  if (item.kind === 'file') {
    return [
      [
        { label: 'Open', run: open },
        { label: 'Open in a new tab', run: () => void window.open(linkTo(item), '_blank', 'noopener') },
      ],
      [
        { label: 'Rename…', hint: 'F2', run: () => openDialog({ kind: 'rename', item }) },
        { label: 'Move to…', run: () => openDialog({ kind: 'move', item }) },
        { label: 'Duplicate', run: duplicate },
      ],
      share,
      [{ label: 'Delete', danger: true, run: remove }],
    ]
  }
  return [
    [
      { label: 'Open', run: open },
      { label: 'Open in a new tab', run: () => void window.open(linkTo(item), '_blank', 'noopener') },
    ],
    [
      { label: 'New file here…', run: () => openDialog({ kind: 'new-file', item }) },
      { label: 'New folder here…', run: () => openDialog({ kind: 'new-folder', item }) },
    ],
    [
      { label: 'Rename…', hint: 'F2', run: () => openDialog({ kind: 'rename', item }) },
      { label: 'Move to…', run: () => openDialog({ kind: 'move', item }) },
    ],
    share,
    [{ label: 'Delete', danger: true, run: remove }],
  ]
}

function MenuView({ menu: { item, x, y } }: { menu: Menu }) {
  const groups = useActions(item)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Keep the whole menu on screen, and put the focus on its first entry.
  useLayoutEffect(() => {
    const box = ref.current!.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    })
    ref.current!.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [x, y])

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) openMenu(null)
    }
    const dismiss = () => openMenu(null)
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('blur', dismiss)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('blur', dismiss)
    }
  }, [])

  function onKeyDown(event: React.KeyboardEvent) {
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role=menuitem]')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => items[(i + items.length) % items.length]?.focus()
    if (event.key === 'ArrowDown') go(at + 1)
    else if (event.key === 'ArrowUp') go(at - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(items.length - 1)
    else if (event.key === 'Tab') openMenu(null)
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${nameOf(item)}`}
      className="fixed z-50 min-w-52 rounded-md border-2 border-ink bg-paper py-1 text-sm"
      style={pos}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="truncate px-3 pt-1 pb-1.5 text-xs font-bold uppercase tracking-wide text-ink-3" title={item.path}>
        {nameOf(item)}
      </p>
      {groups.map((group, i) => (
        <div key={i} className="border-t border-line py-1">
          {group.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left outline-none hover:bg-hover focus-visible:bg-hover ${
                action.danger ? 'text-destructive' : 'text-ink'
              }`}
              onClick={() => {
                openMenu(null)
                void action.run()
              }}
            >
              {action.label}
              {action.hint && <span className="text-xs text-ink-3">{action.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function DialogView({ dialog: { kind, item } }: { dialog: Dialog }) {
  const close = () => openDialog(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-ink/20 pt-[18vh]"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div role="dialog" aria-modal="true" className="w-[min(26rem,calc(100vw-2rem))]">
        {kind === 'new-file' && <NewFile folder={item.path} onClose={close} />}
        {kind === 'new-folder' && <NewFolder folder={item.path} onClose={close} />}
        {(kind === 'rename' || kind === 'move') && <PathForm kind={kind} item={item} onClose={close} />}
      </div>
    </div>
  )
}

/** Rename asks for the name only; Move asks for the whole path, with the name kept. */
function PathForm({ kind, item, onClose }: { kind: 'rename' | 'move'; item: Dragged; onClose: () => void }) {
  const relocate = useRelocate()
  const slash = item.kind === 'folder' ? '/' : ''
  const [value, setValue] = useState(kind === 'rename' ? nameOf(item) : parentOf(item))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = value.trim()
    if (!text) return setError(kind === 'rename' ? 'Give it a name.' : 'Say where it goes.')
    if (kind === 'rename' && text.includes('/')) return setError('A name cannot have a "/". Use Move to change its folder.')
    let to: string
    if (kind === 'rename') to = `${parentOf(item)}${text}${slash}`
    else {
      const folder = `/${text.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
      to = `${folder}${nameOf(item)}${slash}`
    }
    if (to === item.path) return onClose()
    setBusy(true)
    if (await relocate(item, to)) onClose()
    else setBusy(false)
  }

  // A file's name is selected without its extension, as in a file manager.
  const select = (input: HTMLInputElement) => {
    const dot = kind === 'rename' && item.kind === 'file' ? input.value.lastIndexOf('.') : -1
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
  }

  return (
    <form onSubmit={submit} className="rounded-lg border-2 border-ink bg-paper p-3">
      <label className="text-sm font-bold" htmlFor="path-form">
        {kind === 'rename' ? `Rename ${nameOf(item)}` : `Move ${nameOf(item)} to the folder`}
      </label>
      <input
        id="path-form"
        className="field mt-2 py-1.5 font-mono"
        value={value}
        autoFocus
        spellCheck={false}
        onFocus={(e) => select(e.target)}
        onChange={(e) => {
          setValue(e.target.value)
          setError('')
        }}
      />
      <p className="mt-1 truncate text-xs text-ink-3" title={item.path}>
        Now <span className="font-mono">{item.path}</span>
      </p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-1">
        <button type="button" className="btn btn-ghost h-8 px-2" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary h-8 px-3" disabled={busy}>
          {kind === 'rename' ? 'Rename' : 'Move'}
        </button>
      </div>
    </form>
  )
}

/** F2 on a focused row renames it, as in a file manager. */
export function renameKeyProps(item: Dragged) {
  return {
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'F2') {
        event.preventDefault()
        openDialog({ kind: 'rename', item })
      }
    },
  }
}
