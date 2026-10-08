import { useQuery } from '@tanstack/react-query'
import { webModules } from '#/modules/web'
import { filesQuery, foldersQuery } from '#/lib/queries'
import type { Place } from '#/lib/place'
import { FilePage } from './FilePage'
import { FolderPage } from './FolderPage'
import { Guides } from './Guides'
import { MoveNotice } from './Move'
import { Organize } from './Organize'
import { Search } from './Search'
import { Sidebar } from './Sidebar'

const tabs = webModules.flatMap((m) => m.tabs ?? [])
const pages = webModules.flatMap((m) => m.pages ?? [])

/** The sidebar on the left and, on the right, a module page, search, the guides, tags and categories, a folder, a file, or the home. */
export function Workspace({ place }: { place: Place }) {
  const { data: entries = [] } = useQuery(filesQuery)
  const { data: folders = [] } = useQuery(foldersQuery)

  const page = pages.find((p) => p.id === place.page)

  return (
    <div className="grid h-dvh grid-cols-[16rem_1fr] max-md:grid-cols-1 max-md:grid-rows-[auto_1fr]">
      <div className="min-h-0 max-md:max-h-[40dvh]">
        <Sidebar entries={entries} folders={folders} place={place} pages={pages} />
      </div>
      <main className="min-h-0 overflow-y-auto">
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
    </div>
  )
}
