/**
 * The mark: a folder with a bookmark, a file kept to be remembered, in paper on an ink tile (black and white, swapped in the dark theme).
 * public/favicon.svg is the same drawing; the PNG icons and docs/logo.png are rendered from it.
 */
export function Mark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" className="fill-ink" />
      <path d="M12 20a3 3 0 0 1 3-3h11l5 5h18a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" className="fill-paper" />
      <path d="M38 22v16l-4.5-3.5L29 38V22z" className="fill-ink" />
    </svg>
  )
}

/** The words under the name: what openmemfs is for. */
export const TAGLINE = 'own your context'

/** The mark and the name, with the marker swipe under "mem" and the tagline below. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.45em] font-display font-extrabold tracking-tight text-ink ${className}`}>
      <Mark className="size-[1.9em] shrink-0" />
      <span className="flex flex-col leading-none">
        <span>
          open<span className="marker">mem</span>fs
        </span>
        <span className="mt-[0.3em] text-[0.5em] font-bold uppercase tracking-[0.12em] text-ink-3">{TAGLINE}</span>
      </span>
    </span>
  )
}
