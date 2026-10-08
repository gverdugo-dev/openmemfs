import { AsyncLocalStorage } from 'node:async_hooks'
import { notFound } from './errors'

/**
 * Who a request is for, carried from the doors down to the services without threading it
 * through every call. The core sets `author` from the editor's header; a module's middleware
 * may name the author (an email, say) and narrow `reach`.
 */
export interface Caller {
  /** Written into the history next to each version. 'user' and 'agent' unless a module says more. */
  author: string
  /**
   * The folders this request reaches ("/work/acme/"), or null for the whole memory. Outside
   * them a file answers as if it did not exist. The core never narrows it: a module does.
   */
  reach: string[] | null
}

/** Scripts, tests and the server's own start write as an agent over the whole memory. */
const NOBODY: Caller = { author: 'agent', reach: null }

const storage = new AsyncLocalStorage<Caller>()

/** Runs `fn` for this caller: every service call inside sees it. */
export function runAs<T>(caller: Caller, fn: () => T): T {
  return storage.run(caller, fn)
}

export function caller(): Caller {
  return storage.getStore() ?? NOBODY
}

/** Whether the current caller reaches this path (a file, or a folder with its trailing slash). */
export function reaches(path: string): boolean {
  const { reach } = caller()
  return reach === null || reach.some((folder) => path.startsWith(folder))
}

/** Refuses a path outside the caller's reach, before anything is read or written there. */
export function checkReach(path: string): string {
  if (!reaches(path)) throw notFound(`${path} is outside the folders you can reach`)
  return path
}
