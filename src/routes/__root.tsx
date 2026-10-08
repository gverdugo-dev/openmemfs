import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Page } from '#/components/Page'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // A memory is private: no search engine should list its sign-in page.
      { name: 'robots', content: 'noindex' },
      { title: 'openmemfs' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: Document,
  notFoundComponent: () => (
    <Page>
      <h1 className="text-4xl">Not here</h1>
      <p className="mt-3 text-ink-2">
        There is no page at this address. <a className="underline" href="/">Open the memory</a>.
      </p>
    </Page>
  ),
})

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
