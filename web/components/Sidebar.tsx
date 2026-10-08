import { type FormEvent, useMemo, useState } from 'react'
import { type Entry, files } from '../api'
import type { ModulePage } from '../module'
import { hrefOf, navigate, type Route } from '../route'

interface Folder {
  name: string
  path: string
  folders: Folder[]
  files: Entry[]
}

/** Folders are not stored: they come out of the file paths. */
export function treeOf(entries: Entry[]): Folder {
  const root: Folder = { name: '', path: '/', folders: [], files: [] }
  for (const entry of entries) {
    const segments = entry.path.slice(1).split('/')
    let folder = root
    for (const name of segments.slice(0, -1)) {
      let next = folder.folders.find((f) => f.name === name)
      if (!next) {
        next = { name, path: `${folder.path}${name}/`, folders: [], files: [] }
        folder.folders.push(next)
      }
      folder = next
    }
    folder.files.push(entry)
  }
  return root
}

interface Props {
  entries: Entry[]
  route: Route
  pages: ModulePage[]
  onChanged: () => void
  onSignOut: () => void
}

export function Sidebar({ entries, route, pages, onChanged, onSignOut }: Props) {
  const tree = useMemo(() => treeOf(entries), [entries])
  const [creating, setCreating] = useState(false)

  return (
    <aside className="flex h-full flex-col border-r border-line bg-wash">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <a href="/" className="font-display text-lg font-extrabold tracking-tight text-black">
          openmemfs
        </a>
        <button type="button" className="text-xs text-ink-3 hover:text-black" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <div className="px-3 pb-3">
        <button type="button" className="btn btn-primary w-full" onClick={() => setCreating(true)}>
          New file
        </button>
        {creating && (
          <NewFile
            folder={route.path ? route.path.slice(0, route.path.lastIndexOf('/') + 1) : '/'}
            onDone={(path) => {
              setCreating(false)
              if (path) {
                onChanged()
                navigate({ path })
              }
            }}
          />
        )}
      </div>
      {pages.length > 0 && (
        <nav className="border-t border-line px-2 py-2">
          {pages.map((page) => (
            <Row key={page.id} href={hrefOf({ page: page.id })} active={route.page === page.id} depth={0}>
              {page.label}
            </Row>
          ))}
        </nav>
      )}
      <nav className="min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-2" aria-label="Files">
        {entries.length === 0 ? (
          <p className="px-2 py-1 text-sm text-ink-3">No files yet.</p>
        ) : (
          <FolderItems folder={tree} depth={0} open={route.path} />
        )}
      </nav>
    </aside>
  )
}

function FolderItems({ folder, depth, open }: { folder: Folder; depth: number; open?: string }) {
  return (
    <ul>
      {folder.folders.map((child) => (
        <FolderItem key={child.path} folder={child} depth={depth} open={open} />
      ))}
      {folder.files.map((file) => (
        <li key={file.id}>
          <Row href={hrefOf({ path: file.path })} active={open === file.path} depth={depth}>
            {file.path.slice(file.path.lastIndexOf('/') + 1)}
          </Row>
        </li>
      ))}
    </ul>
  )
}

function FolderItem({ folder, depth, open }: { folder: Folder; depth: number; open?: string }) {
  const [expanded, setExpanded] = useState(() => !open || open.startsWith(folder.path))
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm font-medium text-black hover:bg-hover"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`inline-block w-3 text-ink-3 transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded && <FolderItems folder={folder} depth={depth + 1} open={open} />}
    </li>
  )
}

function Row({ href, active, depth, children }: { href: string; active: boolean; depth: number; children: string }) {
  return (
    <a
      href={href}
      title={children}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return
        event.preventDefault()
        navigate(Object.fromEntries(new URLSearchParams(href.slice(2))))
      }}
      className={`block truncate rounded-md py-1 pr-2 text-sm ${active ? 'bg-pressed font-medium text-black' : 'text-ink-2 hover:bg-hover hover:text-black'}`}
      style={{ paddingLeft: `${8 + depth * 14 + 18}px` }}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </a>
  )
}

/** Asks for the path of the new file, starting in the folder that is open. */
function NewFile({ folder, onDone }: { folder: string; onDone: (path?: string) => void }) {
  const [path, setPath] = useState(`${folder}untitled.md`)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const file = await files.create(path.trim())
      onDone(file.path)
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
        onFocus={(e) => e.target.setSelectionRange(folder.length, path.lastIndexOf('.') > folder.length ? path.lastIndexOf('.') : path.length)}
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-1">
        <button type="button" className="btn btn-ghost h-8 px-2" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary h-8 px-3">
          Create
        </button>
      </div>
    </form>
  )
}
