/** Where the workspace is. It is the query string of `/`, so every place has a link. */
export interface Place {
  /** The open file. */
  path?: string
  /** The open tab of that file. */
  tab?: string
  /** A module page, instead of a file. */
  page?: string
}
