import type { WebModule } from '#/lib/module'
import { content } from './content/web'
import { history } from './history/web'
import { metadata } from './metadata/web'

/**
 * The front side of the active modules. Their tabs are sorted by `order`, so the order
 * here only matters for sidebar pages. To add a module, import it here.
 */
export const webModules: WebModule[] = [content, metadata, history]
