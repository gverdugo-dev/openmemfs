import { useCallback, useEffect, useState } from 'react'
import { webModules } from '../modules/web'
import { api, type Entry, files } from './api'
import { FilePage, Page } from './components/FilePage'
import { SignIn } from './components/SignIn'
import { Sidebar } from './components/Sidebar'
import { useRoute } from './route'

const tabs = webModules.flatMap((m) => m.tabs ?? [])
const pages = webModules.flatMap((m) => m.pages ?? [])

export function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const route = useRoute()

  const refresh = useCallback(() => {
    files.list().then(setEntries, () => {})
  }, [])

  useEffect(() => {
    api('GET', '/session').then(
      () => setSignedIn(true),
      () => setSignedIn(false),
    )
    const out = () => setSignedIn(false)
    window.addEventListener('openmemfs:signed-out', out)
    return () => window.removeEventListener('openmemfs:signed-out', out)
  }, [])

  useEffect(() => {
    if (signedIn) refresh()
  }, [signedIn, refresh])

  if (signedIn === null) return null
  if (!signedIn) return <SignIn onSignedIn={() => setSignedIn(true)} />

  const page = pages.find((p) => p.id === route.page)

  return (
    <div className="grid h-dvh grid-cols-[16rem_1fr] max-md:grid-cols-1 max-md:grid-rows-[auto_1fr]">
      <div className="min-h-0 max-md:max-h-[40dvh]">
        <Sidebar
          entries={entries}
          route={route}
          pages={pages}
          onChanged={refresh}
          onSignOut={async () => {
            await fetch('/api/session', { method: 'DELETE' })
            setSignedIn(false)
          }}
        />
      </div>
      <main className="min-h-0 overflow-y-auto">
        {page ? (
          <page.Component />
        ) : route.path ? (
          <FilePage path={route.path} tab={route.tab} tabs={tabs} onChanged={refresh} />
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
