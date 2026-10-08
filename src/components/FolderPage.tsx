import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { type Entry, folders } from '#/lib/api'
import { folderTagsQuery, searchQuery } from '#/lib/queries'
import { CategoryBadge } from './Categories'
import { FileIcon, FolderIcon, GridIcon, ListIcon } from './Icons'
import { NewFile } from './NewFile'
import { Page } from './Page'
import { TagEditor, TagList } from './Tags'

type Layout = 'grid' | 'list'

/** A folder inside the open one, with how many files it holds at any depth. */
interface Child {
  name: string
  path: string
  files: number
}

/** What a folder holds directly: its folders and its files. Folders come out of the paths. */
function contentsOf(folder: string, entries: Entry[]) {
  const children = new Map<string, Child>()
  const files: Entry[] = []
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
  const [creating, setCreating] = useState(false)
  const { data: tags = [] } = useQuery(folderTagsQuery(folder))
  const { data: entries } = useQuery(searchQuery({ prefix: folder }))
  const contents = useMemo(() => contentsOf(folder, entries ?? []), [folder, entries])

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

  return (
    <Page>
      <nav className="flex flex-wrap items-center gap-1 font-mono text-xs text-ink-3" aria-label="Folder path">
        <Link to="/" search={{ view: 'folder', folder: '/', layout }} className="hover:text-black hover:underline">
          /
        </Link>
        {segments.slice(0, -1).map((segment, i) => {
          const path = `/${segments.slice(0, i + 1).join('/')}/`
          return (
            <Link key={path} to="/" search={{ view: 'folder', folder: path, layout }} className="hover:text-black hover:underline">
              {segment}/
            </Link>
          )
        })}
      </nav>
      <h1 className="mt-2 flex items-center gap-3 text-4xl md:text-5xl">
        <FolderIcon open className="size-9 shrink-0 md:size-11" />
        {segments.at(-1) || '/'}
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
          <button type="button" className="btn btn-outline h-8 px-3" onClick={() => setCreating(true)}>
            New file here
          </button>
        </div>
      </div>
      {creating && <NewFile folder={folder} onClose={() => setCreating(false)} />}
      {entries && empty && <p className="py-3 text-sm text-ink-2">Nothing here yet.</p>}
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
      className={`grid size-8 place-items-center ${layout === value ? 'bg-black text-white' : 'bg-white text-black hover:bg-hover'}`}
    >
      {icon}
    </Link>
  )
  return (
    <div className="flex overflow-hidden rounded-md border-2 border-black" role="group" aria-label="Layout">
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
  const tile = 'flex min-h-28 flex-col gap-2 rounded-md border-2 border-line-strong bg-white p-3 transition-colors hover:border-black'
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children.map((child) => (
        <li key={child.path}>
          <Link to="/" search={{ view: 'folder', folder: child.path, layout }} className={`${tile} h-full`}>
            <FolderIcon className="size-7 text-black" />
            <span className="truncate font-display font-bold text-black" title={child.name}>
              {child.name}
            </span>
            <span className="mt-auto text-xs text-ink-3">{count(child.files)}</span>
          </Link>
        </li>
      ))}
      {files.map((file) => (
        <li key={file.id}>
          <Link to="/" search={{ path: file.path }} className={`${tile} h-full`}>
            <FileIcon className="size-7 text-ink-2" />
            <span className="truncate font-display font-bold text-black" title={nameOf(file)}>
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
          <Link to="/" search={{ view: 'folder', folder: child.path, layout }} className={row}>
            <FolderIcon className="size-5 shrink-0 text-black" />
            <span className="min-w-0 flex-1 truncate font-display font-bold text-black">{child.name}</span>
            <span className="text-xs text-ink-3">{count(child.files)}</span>
          </Link>
        </li>
      ))}
      {files.map((file) => (
        <li key={file.id} className="border-b border-line">
          <Link to="/" search={{ path: file.path }} className={row}>
            <FileIcon className="size-5 shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1 truncate font-display font-bold text-black">{nameOf(file)}</span>
            <CategoryBadge id={file.category_id} />
            <TagList tags={file.tags} inherited={file.folder_tags} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
