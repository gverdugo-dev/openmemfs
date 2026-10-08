import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'

/**
 * A folder path where every step is a link: "/" opens the root, "work/" opens /work/, and so
 * on. Above a file it is the file's folder; above a folder page, its parent.
 */
export function Breadcrumbs({ folder, layout }: { folder: string; layout?: 'grid' | 'list' }) {
  const segments = folder.split('/').filter(Boolean)
  const link = 'rounded px-0.5 hover:bg-hover hover:text-ink hover:underline'
  return (
    <nav className="flex flex-wrap items-center font-mono text-xs text-ink-3" aria-label="Folder path">
      <Link to="/" search={{ view: 'folder', folder: '/', layout }} className={link} title="/">
        /
      </Link>
      {segments.map((segment, i) => {
        const path = `/${segments.slice(0, i + 1).join('/')}/`
        return (
          <Fragment key={path}>
            <Link to="/" search={{ view: 'folder', folder: path, layout }} className={link} title={path}>
              {segment}
            </Link>
            <span aria-hidden="true">/</span>
          </Fragment>
        )
      })}
    </nav>
  )
}
