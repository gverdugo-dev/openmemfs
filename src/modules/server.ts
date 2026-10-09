import type { ServerModule } from '#/server/module'
import { history } from './history/server'
import { links } from './links/server'
import { suggestions } from './suggestions/server'

/**
 * The server side of the active modules, in order: their migrations run in this order,
 * after the core ones, and their write hooks run in this order on every write.
 * Content has no server side: the core file API already reads and writes it.
 * Links relate files to each other (a post and its images); suggestions hold edits an
 * agent proposes for the person to accept or reject.
 * To add a module, import it here; to switch one off, take it out (its tables stay).
 */
export const serverModules: ServerModule[] = [history, links, suggestions]
