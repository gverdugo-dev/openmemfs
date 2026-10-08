import type { ServerModule } from '#/server/module'
import { history } from './history/server'

/**
 * The server side of the active modules, in order: their migrations run in this order,
 * after the core ones, and their write hooks run in this order on every write.
 * Content and metadata have no server side: the core file API already reads and writes them.
 * To add a module, import it here; to switch one off, take it out (its tables stay).
 */
export const serverModules: ServerModule[] = [history]
