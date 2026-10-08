import { Link } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import type { Entry } from '#/lib/api'
import type { ModulePage } from '#/lib/module'
import type { Place } from '#/lib/place'
import { BookIcon, FileIcon, FolderIcon, SearchIcon, TagIcon } from './Icons'
import { Logo } from './Logo'
import { type Dragged, dragProps, useDropTarget } from './Move'
import { NewFile, NewFolder } from './NewFile'
import { ThemeToggle } from './Theme'

interface Folder {
  name: string
  path: string
  folders: Folder[]
  files: Entry[]
}

/** The tree of the explorer: the folders of the file paths, plus the empty ones that were created. */
export function treeOf(entries: Entry[], folderPaths: string[] = []): Folder {
  const root: Folder = { name: '', path: '/', folders: [], files: [] }
  const folderOf = (segments: string[]) => {
    let folder = root
    for (const name of segments) {
      let next = folder.folders.find((f) => f.name === name)
      if (!next) {
        next = { name, path: `${folder.path}${name}/`, folders: [], files: [] }
        folder.folders.push(next)
      }
      folder = next
    }
    return folder
  }
  for (const path of folderPaths) folderOf(path.slice(1, -1).split('/'))
  for (const entry of entries) folderOf(entry.path.slice(1).split('/').slice(0, -1)).files.push(entry)
  const sort = (folder: Folder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name))
    folder.folders.forEach(sort)
  }
  sort(root)
  return root
}

interface Props {
  entries: Entry[]
  /** Every folder, empty ones included. */
  folders: string[]
  place: Place
  pages: ModulePage[]
}

export function Sidebar({ entries, folders, place, pages }: Props) {
  const tree = useMemo(() => treeOf(entries, folders), [entries, folders])
  const root = useDropTarget('/')
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  // New things go where you are: the open folder, or the folder of the open file.
  const here = place.folder ?? (place.path ? place.path.slice(0, place.path.lastIndexOf('/') + 1) : '/')

  return (
    <aside className="flex h-full flex-col border-r border-line bg-wash">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link to="/" aria-label="openmemfs, home">
          <Logo className="text-lg" />
        </Link>
        <ThemeToggle />
      </div>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-primary px-2" onClick={() => setCreating('file')}>
            <FileIcon className="size-4" />
            New file
          </button>
          <button type="button" className="btn btn-outline px-2" onClick={() => setCreating('folder')}>
            <FolderIcon className="size-4" />
            New folder
          </button>
        </div>
        {creating === 'file' && <NewFile folder={here} onClose={() => setCreating(null)} />}
        {creating === 'folder' && <NewFolder folder={here} onClose={() => setCreating(null)} />}
      </div>
      <nav className="border-t border-line px-2 py-2">
        <Row search={{ view: 'search' }} active={place.view === 'search'} depth={0} icon={<SearchIcon />}>
          Search
        </Row>
        <Row search={{ view: 'guides' }} active={place.view === 'guides'} depth={0} icon={<BookIcon />}>
          Guides
        </Row>
        <Row search={{ view: 'organize' }} active={place.view === 'organize'} depth={0} icon={<TagIcon />}>
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
      {/* Dropping on the explorer outside any folder moves to the root. */}
      <nav
        className={`min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-2 ${root.over ? 'bg-pressed' : ''}`}
        aria-label="Files"
        {...root.props}
      >
        {entries.length === 0 && folders.length === 0 ? (
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
          <Row
            search={{ path: file.path }}
            active={open === file.path}
            depth={depth}
            icon={<FileIcon />}
            drag={{ kind: 'file', id: file.id, path: file.path }}
          >
            {file.path.slice(file.path.lastIndexOf('/') + 1)}
          </Row>
        </li>
      ))}
    </ul>
  )
}

/**
 * A folder: the chevron opens and closes it, the name opens its page (tags, files), and the +
 * that shows on hover creates a file inside it.
 */
function FolderItem({ folder, depth, open, openFolder }: ItemsProps) {
  const [expanded, setExpanded] = useState(() => (!open && !openFolder) || !!(open ?? openFolder)?.startsWith(folder.path))
  const [creating, setCreating] = useState(false)
  const drop = useDropTarget(folder.path)
  const active = openFolder === folder.path
  return (
    <li>
      <div
        className={`group flex items-center rounded-md text-sm font-medium text-ink ${drop.over ? 'bg-pressed ring-2 ring-ink' : active ? 'bg-pressed' : 'hover:bg-hover'}`}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
        {...dragProps({ kind: 'folder', path: folder.path })}
        {...drop.props}
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
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2"
          aria-current={active ? 'page' : undefined}
          title={folder.path}
        >
          <FolderIcon open={expanded} className="size-4 shrink-0 text-ink-2" />
          <span className="truncate">{folder.name}</span>
        </Link>
        <button
          type="button"
          className="mr-1 rounded px-1.5 text-base leading-6 text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-pressed hover:text-ink focus-visible:opacity-100 max-md:opacity-100"
          aria-label={`New file in ${folder.name}`}
          title={`New file in ${folder.path}`}
          onClick={() => setCreating(true)}
        >
          +
        </button>
      </div>
      {creating && (
        <div style={{ paddingLeft: `${4 + depth * 14}px` }}>
          <NewFile folder={folder.path} onClose={() => setCreating(false)} />
        </div>
      )}
      {expanded && <FolderItems folder={folder} depth={depth + 1} open={open} openFolder={openFolder} />}
    </li>
  )
}

interface RowProps {
  search: Place
  active: boolean
  depth: number
  icon?: ReactNode
  /** What dragging the row moves, if it can be moved. */
  drag?: Dragged
  children: string
}

/** A row of the explorer: a file, or one of the views at the top. */
function Row({ search, active, depth, icon, drag, children }: RowProps) {
  return (
    <Link
      to="/"
      search={search}
      title={children}
      className={`flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm ${active ? 'bg-pressed font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}
      style={{ paddingLeft: `${8 + depth * 14 + (depth > 0 || search.path ? 18 : 0)}px` }}
      aria-current={active ? 'page' : undefined}
      {...(drag ? dragProps(drag) : {})}
    >
      {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      <span className="truncate">{children}</span>
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
