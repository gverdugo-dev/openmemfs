import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { useDropTarget } from './Move'

/**
 * A folder path where every step is a link: "/" opens the root, "work/" opens /work/, and so
 * on. Above a file it is the file's folder; above a folder page, its parent.
 */
export function Breadcrumbs({ folder, layout }: { folder: string; layout?: 'grid' | 'list' }) {
  const segments = folder.split('/').filter(Boolean)
  return (
    <nav className="flex flex-wrap items-center font-mono text-xs text-ink-3" aria-label="Folder path">
      <Step folder="/" layout={layout}>
        /
      </Step>
      {segments.map((segment, i) => {
        const path = `/${segments.slice(0, i + 1).join('/')}/`
        return (
          <Fragment key={path}>
            <Step folder={path} layout={layout}>
              {segment}
            </Step>
            <span aria-hidden="true">/</span>
          </Fragment>
        )
      })}
    </nav>
  )
}

/** One step of the path: a link to its folder, and a place to drop a file or folder into it. */
function Step({ folder, layout, children }: { folder: string; layout?: 'grid' | 'list'; children: ReactNode }) {
  const drop = useDropTarget(folder)
  return (
    <Link
      to="/"
      search={{ view: 'folder', folder, layout }}
      title={folder}
      className={`rounded px-0.5 hover:bg-hover hover:text-ink hover:underline ${drop.over ? 'bg-pressed text-ink ring-2 ring-ink' : ''}`}
      {...drop.props}
    >
      {children}
    </Link>
  )
}
