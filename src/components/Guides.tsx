import { Link, useNavigate } from '@tanstack/react-router'
import type { MouseEvent } from 'react'
import { guideHtml, readGuides } from '#/lib/guides'
import { Page } from './Page'

/** The guides of docs/guides/, bundled with the app: the same files the website shows. */
const guides = readGuides(
  import.meta.glob<string>('../../docs/guides/*.md', { query: '?raw', import: 'default', eager: true }),
)

const hrefOf = (slug: string) => `/?view=guides&guide=${slug}`

/** One guide, read only, with the list of all of them above it so they read in order. */
export function Guides({ slug }: { slug?: string }) {
  const navigate = useNavigate()
  const index = Math.max(
    0,
    guides.findIndex((g) => g.slug === slug),
  )
  const guide = guides[index]
  if (!guide) return null
  const next = guides[index + 1]

  // Links between guides are plain anchors in the rendered HTML: let the router take them.
  function follow(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href') ?? ''
    if (!href.startsWith('/?view=guides')) return
    event.preventDefault()
    void navigate({ to: '/', search: { view: 'guides', guide: new URLSearchParams(href.slice(2)).get('guide') ?? undefined } })
  }

  return (
    <Page>
      <nav aria-label="Guides" className="flex flex-wrap gap-1.5">
        {guides.map((g) => (
          <Link
            key={g.slug}
            to="/"
            search={{ view: 'guides', guide: g.slug }}
            className={`chip ${g === guide ? 'chip-on' : 'chip-muted'}`}
          >
            {g.order}. {g.title}
          </Link>
        ))}
      </nav>
      <h1 className="mt-8 text-4xl">{guide.title}</h1>
      {/* The guides are files of this repository, never user content. */}
      <article
        className="prose-openmemfs mt-6 pb-10"
        onClick={follow}
        dangerouslySetInnerHTML={{ __html: guideHtml(guide, hrefOf) }}
      />
      {next && (
        <Link
          to="/"
          search={{ view: 'guides', guide: next.slug }}
          className="btn btn-outline mb-16"
        >
          Next: {next.title}
        </Link>
      )}
    </Page>
  )
}
