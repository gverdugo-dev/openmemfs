/** Where the workspace is. It is the query string of `/`, so every place has a link. */
export interface Place {
  /** The open file. */
  path?: string
  /** The open tab of that file. */
  tab?: string
  /** A module page, instead of a file. */
  page?: string
  /** A view of the core instead of a file: search, the folder page, tags and categories, the guides, the trash. */
  view?: 'search' | 'folder' | 'organize' | 'guides' | 'trash'
  /** The open guide, by its slug, on the guides view. */
  guide?: string
  /** The open folder, with its trailing slash, on the folder view. */
  folder?: string
  /** How the folder view lays out its folders and files: blocks (the default) or rows. */
  layout?: 'grid' | 'list'
  /** The search: text, where to look, tags the files must all carry, a category. */
  q?: string
  in?: 'name' | 'content' | 'all'
  tag?: string[]
  category?: string
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const oneOf = <T extends string>(value: unknown, options: readonly T[]) =>
  options.includes(value as T) ? (value as T) : undefined
const texts = (value: unknown) => {
  const list = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string' && v !== '')
  return list.length ? list : undefined
}

/** Reads a place from the query string, dropping anything it does not know. */
export function placeOf(search: Record<string, unknown>): Place {
  return {
    path: text(search.path),
    tab: text(search.tab),
    page: text(search.page),
    view: oneOf(search.view, ['search', 'folder', 'organize', 'guides', 'trash'] as const),
    guide: text(search.guide),
    folder: text(search.folder),
    layout: oneOf(search.layout, ['grid', 'list'] as const),
    q: text(search.q),
    in: oneOf(search.in, ['name', 'content', 'all'] as const),
    tag: texts(search.tag),
    category: text(search.category),
  }
}
