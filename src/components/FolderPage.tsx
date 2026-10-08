import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { type Entry, folders } from '#/lib/api'
import { folderTagsQuery, foldersQuery, searchQuery } from '#/lib/queries'
import { Breadcrumbs } from './Breadcrumbs'
import { contextMenuProps, renameKeyProps } from './ContextMenu'
import { CategoryBadge } from './Categories'
import { FileIcon, FolderIcon, GridIcon, ListIcon } from './Icons'
import { type Dragged, dragProps, useDropTarget } from './Move'
import { NewFile, NewFolder } from './NewFile'
import { Page } from './Page'
import { TagEditor, TagList } from './Tags'

type Layout = 'grid' | 'list'

/** A folder inside the open one, with how many files it holds at any depth. */
interface Child {
  name: string
  path: string
  files: number
}

/** What a folder holds directly: its folders (from the file paths and the created ones) and its files. */
function contentsOf(folder: string, entries: Entry[], folderPaths: string[]) {
  const children = new Map<string, Child>()
  const files: Entry[] = []
  for (const path of folderPaths) {
    if (!path.startsWith(folder) || path === folder) continue
    const name = path.slice(folder.length).split('/')[0] ?? ''
    if (!children.has(name)) children.set(name, { name, path: `${folder}${name}/`, files: 0 })
  }
  for (const entry of entries) {
    const rest = entry.path.slice(folder.length)
    const slash = rest.indexOf('/')
    if (slash === -1) {
      files.push(entry)
      continue
    }
    const name = rest.slice(0, slash)
    const child = children.get(name) ?? { name, path: `${folder}${name}/`, files: 0 }
    child.files += 1
    children.set(name, child)
  }
  return { folders: [...children.values()].sort((a, b) => a.name.localeCompare(b.name)), files }
}

const count = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`

/**
 * A folder, as a file explorer shows it: its tags, then the folders and files directly in it,
 * as blocks or as rows. Opening a folder opens its page; opening a file opens the file.
 */
export function FolderPage({ folder, layout = 'grid' }: { folder: string; layout?: Layout }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  const [error, setError] = useState('')
  const { data: tags = [] } = useQuery(folderTagsQuery(folder))
  const { data: entries } = useQuery(searchQuery({ prefix: folder }))
  const { data: folderPaths = [] } = useQuery(foldersQuery)
  const contents = useMemo(() => contentsOf(folder, entries ?? [], folderPaths), [folder, entries, folderPaths])

  async function change(action: () => Promise<unknown>) {
    await action()
    await Promise.all([
      queryClient.invalidateQueries(folderTagsQuery(folder)),
      queryClient.invalidateQueries({ queryKey: ['files'] }),
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
    ])
  }

  const segments = folder.slice(1, -1).split('/')
  const empty = contents.folders.length === 0 && contents.files.length === 0
  const parent = `/${segments.slice(0, -1).join('/')}${segments.length > 1 ? '/' : ''}`

  async function remove() {
    try {
      await folders.remove(folder)
      await queryClient.invalidateQueries({ queryKey: ['files'] })
      void navigate({ to: '/', search: { view: 'folder', folder: parent, layout } })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Page>
      <Breadcrumbs folder={folder === '/' ? '/' : parent} layout={layout} />
      <h1 className="mt-2 flex items-center gap-3 text-4xl md:text-5xl">
        <FolderIcon open className="size-9 shrink-0 md:size-11" />
        {segments.at(-1) || 'All files'}
      </h1>

      {folder !== '/' && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium text-ink-3 uppercase">Folder tags</p>
          <TagEditor
            tags={tags}
            onAdd={(tag) => change(() => folders.tag(folder, tag))}
            onRemove={(tag) => change(() => folders.untag(folder, tag))}
          />
          <p className="mt-2 text-xs text-ink-3">Every file in this folder and below carries these tags when you filter.</p>
        </div>
      )}

      <div className="mt-10 mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-ink-3 uppercase">
          {contents.folders.length} {contents.folders.length === 1 ? 'folder' : 'folders'} · {count(contents.files.length)}
        </p>
        <div className="flex items-center gap-2">
          <LayoutSwitch folder={folder} layout={layout} />
          <button type="button" className="btn btn-primary h-8 px-3" onClick={() => setCreating('file')}>
            <FileIcon className="size-4" />
            New file
          </button>
          <button type="button" className="btn btn-outline h-8 px-3" onClick={() => setCreating('folder')}>
            <FolderIcon className="size-4" />
            New folder
          </button>
        </div>
      </div>
      {creating === 'file' && <NewFile folder={folder} onClose={() => setCreating(null)} />}
      {creating === 'folder' && <NewFolder folder={folder} onClose={() => setCreating(null)} />}
      {entries && empty && (
        <div className="py-3 text-sm text-ink-2">
          <p>Nothing here yet. Create a file or a folder with the buttons above.</p>
          {folder !== '/' && (
            <button type="button" className="btn btn-ghost mt-3 h-8 px-2 text-destructive" onClick={remove}>
              Delete this empty folder
            </button>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      )}
      {entries && !empty && (layout === 'grid' ? <Grid {...contents} layout={layout} /> : <List {...contents} layout={layout} />)}
    </Page>
  )
}

/** Blocks or rows. The choice is in the link, so it stays as you move between folders. */
function LayoutSwitch({ folder, layout }: { folder: string; layout: Layout }) {
  const option = (value: Layout, label: string, icon: ReactNode) => (
    <Link
      to="/"
      search={{ view: 'folder', folder, layout: value }}
      aria-label={label}
      title={label}
      aria-current={layout === value ? 'true' : undefined}
      className={`grid size-8 place-items-center ${layout === value ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-hover'}`}
    >
      {icon}
    </Link>
  )
  return (
    <div className="flex overflow-hidden rounded-md border-2 border-ink" role="group" aria-label="Layout">
      {option('grid', 'Blocks', <GridIcon />)}
      {option('list', 'List', <ListIcon />)}
    </div>
  )
}

interface ContentsProps {
  folders: Child[]
  files: Entry[]
  layout: Layout
}

const nameOf = (entry: Entry) => entry.path.slice(entry.path.lastIndexOf('/') + 1)

function Grid({ folders: children, files, layout }: ContentsProps) {
  const tile = 'flex min-h-28 flex-col gap-2 rounded-md border-2 border-line-strong bg-paper p-3 transition-colors hover:border-ink'
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children.map((child) => (
        <li key={child.path}>
          <FolderLink folder={child.path} layout={layout} className={`${tile} h-full`}>
            <FolderIcon className="size-7 text-ink" />
            <span className="truncate font-display font-bold text-ink" title={child.name}>
              {child.name}
            </span>
            <span className="mt-auto text-xs text-ink-3">{count(child.files)}</span>
          </FolderLink>
        </li>
      ))}
      {files.map((file) => (
        <li key={file.id}>
          <Link to="/" search={{ path: file.path }} className={`${tile} h-full`} {...itemProps({ kind: 'file', id: file.id, path: file.path })}>
            <FileIcon className="size-7 text-ink-2" />
            <span className="truncate font-display font-bold text-ink" title={nameOf(file)}>
              {nameOf(file)}
            </span>
            <span className="mt-auto flex flex-wrap gap-1">
              <CategoryBadge id={file.category_id} />
              <TagList tags={file.tags} inherited={file.folder_tags} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function List({ folders: children, files, layout }: ContentsProps) {
  const row = 'flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2.5 hover:bg-hover'
  return (
    <ul className="border-t border-line">
      {children.map((child) => (
        <li key={child.path} className="border-b border-line">
          <FolderLink folder={child.path} layout={layout} className={row}>
            <FolderIcon className="size-5 shrink-0 text-ink" />
            <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">{child.name}</span>
            <span className="text-xs text-ink-3">{count(child.files)}</span>
          </FolderLink>
        </li>
      ))}
      {files.map((file) => (
        <li key={file.id} className="border-b border-line">
          <Link to="/" search={{ path: file.path }} className={row} {...itemProps({ kind: 'file', id: file.id, path: file.path })}>
            <FileIcon className="size-5 shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1 truncate font-display font-bold text-ink">{nameOf(file)}</span>
            <CategoryBadge id={file.category_id} />
            <TagList tags={file.tags} inherited={file.folder_tags} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** A folder in the list: opens its page, can be dragged, and takes drops into itself. */
function FolderLink({ folder, layout, className, children }: { folder: string; layout: Layout; className: string; children: ReactNode }) {
  const drop = useDropTarget(folder)
  return (
    <Link
      to="/"
      search={{ view: 'folder', folder, layout }}
      className={`${className} ${drop.over ? 'border-ink bg-pressed' : ''}`}
      {...itemProps({ kind: 'folder', path: folder })}
      {...drop.props}
    >
      {children}
    </Link>
  )
}

/** A file or a folder on the page: it can be dragged, right-clicked, and renamed with F2. */
const itemProps = (item: Dragged) => ({ ...dragProps(item), ...contextMenuProps(item), ...renameKeyProps(item) })
