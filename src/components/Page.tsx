import type { ReactNode } from 'react'

/** Every view of the main area is a centred column with the same measure. */
export function Page({ children }: { children?: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-6 pt-10 md:px-12">{children}</div>
}
