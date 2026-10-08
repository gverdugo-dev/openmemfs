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

/** The mark and the name, with the marker swipe under "mem". */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-extrabold tracking-tight text-ink ${className}`}>
      <Mark className="size-[1.4em] shrink-0" />
      <span>
        open<span className="marker">mem</span>fs
      </span>
    </span>
  )
}
