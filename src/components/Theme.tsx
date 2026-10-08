/**
 * Light and dark. The choice is kept in localStorage ("theme"); without one the page follows
 * the system. THEME_SCRIPT runs in <head> before the first paint, so the page never flashes
 * the wrong theme; the button only flips the class and remembers the choice.
 */
export const THEME_SCRIPT = `(() => {
  const root = document.documentElement
  const apply = () => {
    let saved = null
    try { saved = localStorage.getItem('theme') } catch {}
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', dark)
  }
  apply()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply)
})()`

function flip() {
  const dark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  } catch {
    // Private windows may refuse storage: the theme still changes for this page.
  }
}

/** A sun in the dark theme, a moon in the light one: the icon is the theme it switches to. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={flip}
      className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"
      aria-label="Switch between light and dark"
      title="Light or dark"
    >
      <svg viewBox="0 0 24 24" className="size-[18px] dark:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
      </svg>
      <svg viewBox="0 0 24 24" className="hidden size-[18px] dark:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  )
}
