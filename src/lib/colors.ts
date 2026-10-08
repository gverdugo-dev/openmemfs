/**
 * The colours a tag, a category or a subcategory can have. The server checks against this list
 * and src/styles.css draws each one (`data-color`). The names are the contract.
 */
export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export type Color = (typeof COLORS)[number]
