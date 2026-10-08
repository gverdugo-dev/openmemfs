import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Page } from '#/components/Page'
import { THEME_SCRIPT } from '#/components/Theme'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // A memory is private: no search engine should list it.
      { name: 'robots', content: 'noindex' },
      { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#161616', media: '(prefers-color-scheme: dark)' },
      { name: 'description', content: 'A memory made of files, for you and your agents.' },
      { title: 'openmemfs' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
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
    // The theme script sets a class on <html> before React hydrates: that difference is expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* A fixed script of ours: it has to run before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
