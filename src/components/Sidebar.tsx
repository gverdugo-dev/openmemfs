import { Link } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import type { Entry } from '#/lib/api'
import type { ModulePage } from '#/lib/module'
import type { Place } from '#/lib/place'
import { NewFile } from './NewFile'

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
  place: Place
  pages: ModulePage[]
}

export function Sidebar({ entries, place, pages }: Props) {
  const tree = useMemo(() => treeOf(entries), [entries])
  const [creating, setCreating] = useState(false)

  return (
    <aside className="flex h-full flex-col border-r border-line bg-wash">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link to="/" className="font-display text-lg font-extrabold tracking-tight text-black">
          openmemfs
        </Link>
      </div>
      <div className="px-3 pb-3">
        <button type="button" className="btn btn-primary w-full" onClick={() => setCreating(true)}>
          New file
        </button>
        {creating && (
          <NewFile
            folder={place.folder ?? (place.path ? place.path.slice(0, place.path.lastIndexOf('/') + 1) : '/')}
            onClose={() => setCreating(false)}
          />
        )}
      </div>
      <nav className="border-t border-line px-2 py-2">
        <Row search={{ view: 'search' }} active={place.view === 'search'} depth={0}>
          Search
        </Row>
        <Row search={{ view: 'organize' }} active={place.view === 'organize'} depth={0}>
          Tags & categories
        </Row>
      </nav>
      {pages.length > 0 && (
        <nav className="border-t border-line px-2 py-2">
          {pages.map((page) => (
            <Row key={page.id} search={{ page: page.id }} active={place.page === page.id} depth={0}>
              {page.label}
            </Row>
          ))}
        </nav>
      )}
      <nav className="min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-2" aria-label="Files">
        {entries.length === 0 ? (
          <p className="px-2 py-1 text-sm text-ink-3">No files yet.</p>
        ) : (
          <FolderItems folder={tree} depth={0} open={place.path} openFolder={place.view === 'folder' ? place.folder : undefined} />
        )}
      </nav>
    </aside>
  )
}

interface ItemsProps {
  folder: Folder
  depth: number
  /** The open file. */
  open?: string
  /** The open folder page. */
  openFolder?: string
}

function FolderItems({ folder, depth, open, openFolder }: ItemsProps) {
  return (
    <ul>
      {folder.folders.map((child) => (
        <FolderItem key={child.path} folder={child} depth={depth} open={open} openFolder={openFolder} />
      ))}
      {folder.files.map((file) => (
        <li key={file.id}>
          <Row search={{ path: file.path }} active={open === file.path} depth={depth}>
            {file.path.slice(file.path.lastIndexOf('/') + 1)}
          </Row>
        </li>
      ))}
    </ul>
  )
}

/** A folder: the chevron opens and closes it, the name opens its page (tags, files). */
function FolderItem({ folder, depth, open, openFolder }: ItemsProps) {
  const [expanded, setExpanded] = useState(() => (!open && !openFolder) || !!(open ?? openFolder)?.startsWith(folder.path))
  const active = openFolder === folder.path
  return (
    <li>
      <div
        className={`flex items-center rounded-md text-sm font-medium text-black ${active ? 'bg-pressed' : 'hover:bg-hover'}`}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
      >
        <button
          type="button"
          className="rounded p-1"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Close' : 'Open'} ${folder.name}`}
          onClick={() => setExpanded(!expanded)}
        >
          <Chevron open={expanded} />
        </button>
        <Link
          to="/"
          search={{ view: 'folder', folder: folder.path }}
          className="min-w-0 flex-1 truncate py-1 pr-2"
          aria-current={active ? 'page' : undefined}
        >
          {folder.name}
        </Link>
      </div>
      {expanded && <FolderItems folder={folder} depth={depth + 1} open={open} openFolder={openFolder} />}
    </li>
  )
}

function Row({ search, active, depth, children }: { search: Place; active: boolean; depth: number; children: string }) {
  return (
    <Link
      to="/"
      search={search}
      title={children}
      className={`block truncate rounded-md py-1 pr-2 text-sm ${active ? 'bg-pressed font-medium text-black' : 'text-ink-2 hover:bg-hover hover:text-black'}`}
      style={{ paddingLeft: `${8 + depth * 14 + 18}px` }}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  )
}

function Chevron({ open }: { open: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
