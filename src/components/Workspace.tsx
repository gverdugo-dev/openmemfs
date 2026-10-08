import { useQuery } from '@tanstack/react-query'
import { webModules } from '#/modules/web'
import { filesQuery, foldersQuery } from '#/lib/queries'
import type { Place } from '#/lib/place'
import { ContextMenuHost } from './ContextMenu'
import { FilePage } from './FilePage'
import { FolderPage } from './FolderPage'
import { Guides } from './Guides'
import { MoveNotice } from './Move'
import { Organize } from './Organize'
import { Search } from './Search'
import { PanelIcon } from './Icons'
import { Sidebar } from './Sidebar'
import { SidebarResizer, useSidebarLayout } from './SidebarLayout'

const tabs = webModules.flatMap((m) => m.tabs ?? [])
const pages = webModules.flatMap((m) => m.pages ?? [])

/** The sidebar on the left and, on the right, a module page, search, the guides, tags and categories, a folder, a file, or the home. */
export function Workspace({ place }: { place: Place }) {
  const { data: entries = [] } = useQuery(filesQuery)
  const { data: folders = [] } = useQuery(foldersQuery)

  const page = pages.find((p) => p.id === place.page)
  const sidebar = useSidebarLayout()

  return (
    <div
      className={`grid h-dvh max-md:grid-cols-1 ${
        sidebar.collapsed ? 'grid-cols-1' : 'grid-cols-[var(--sidebar)_1fr] max-md:grid-rows-[auto_1fr]'
      }`}
      style={{ '--sidebar': `${sidebar.width}px` } as React.CSSProperties}
    >
      <div className={`relative min-h-0 max-md:max-h-[40dvh] ${sidebar.collapsed ? 'hidden' : ''}`}>
        <Sidebar entries={entries} folders={folders} place={place} pages={pages} onCollapse={() => sidebar.setCollapsed(true)} />
        <SidebarResizer width={sidebar.width} onChange={sidebar.setWidth} />
      </div>
      <main className="relative min-h-0 overflow-y-auto">
        {sidebar.collapsed && (
          <button
            type="button"
            onClick={() => sidebar.setCollapsed(false)}
            className="absolute top-4 left-4 z-10 grid size-8 place-items-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"
            aria-label="Show the sidebar"
            title={'Show the sidebar (Cmd+\\)'}
          >
            <PanelIcon className="size-[18px]" />
          </button>
        )}
        {page ? (
          <page.Component />
        ) : place.view === 'search' ? (
          <Search place={place} />
        ) : place.view === 'guides' ? (
          <Guides slug={place.guide} />
        ) : place.view === 'organize' ? (
          <Organize />
        ) : place.path ? (
          <FilePage path={place.path} tab={place.tab} tabs={tabs} />
        ) : (
          // The home is the root folder: its folders and files, and the buttons to add more.
          <FolderPage key={place.folder ?? '/'} folder={place.folder ?? '/'} layout={place.layout} />
        )}
      </main>
      <MoveNotice />
      <ContextMenuHost />
    </div>
  )
}
