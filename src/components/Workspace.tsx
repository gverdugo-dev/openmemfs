import { useQuery } from '@tanstack/react-query'
import { webModules } from '#/modules/web'
import { filesQuery } from '#/lib/queries'
import type { Place } from '#/lib/place'
import { FilePage } from './FilePage'
import { FolderPage } from './FolderPage'
import { Organize } from './Organize'
import { Page } from './Page'
import { Search } from './Search'
import { Sidebar } from './Sidebar'

const tabs = webModules.flatMap((m) => m.tabs ?? [])
const pages = webModules.flatMap((m) => m.pages ?? [])

/** The sidebar on the left and, on the right, a module page, search, tags and categories, a folder, a file, or the home. */
export function Workspace({ place }: { place: Place }) {
  const { data: entries = [] } = useQuery(filesQuery)

  const page = pages.find((p) => p.id === place.page)

  return (
    <div className="grid h-dvh grid-cols-[16rem_1fr] max-md:grid-cols-1 max-md:grid-rows-[auto_1fr]">
      <div className="min-h-0 max-md:max-h-[40dvh]">
        <Sidebar entries={entries} place={place} pages={pages} />
      </div>
      <main className="min-h-0 overflow-y-auto">
        {page ? (
          <page.Component />
        ) : place.view === 'search' ? (
          <Search place={place} />
        ) : place.view === 'organize' ? (
          <Organize />
        ) : place.view === 'folder' && place.folder ? (
          <FolderPage key={place.folder} folder={place.folder} />
        ) : place.path ? (
          <FilePage path={place.path} tab={place.tab} tabs={tabs} />
        ) : (
          <Page>
            <h1 className="text-4xl md:text-5xl">
              Your <span className="marker">memory</span>, in files.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-2">
              {entries.length === 0
                ? 'Nothing here yet. Create a file, or let an agent write one through the API.'
                : `${entries.length} ${entries.length === 1 ? 'file' : 'files'}. Pick one on the left.`}
            </p>
          </Page>
        )}
      </main>
    </div>
  )
}
