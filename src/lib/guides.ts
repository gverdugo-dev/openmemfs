import { Marked } from 'marked'

/**
 * The guides live once, as Markdown in docs/guides/ (NN-slug.md), and are read by two
 * readers: the Guides view of the app and the website of openmemfs, built elsewhere. This module is
 * what both share, so a guide reads the same everywhere.
 */
export interface Guide {
  /** The file name without its number and extension: "connect-your-agent". */
  slug: string
  /** Its position in the reading order, from the file name. */
  order: number
  /** The first heading. */
  title: string
  markdown: string
}

/** Reads the guides from a map of file name (or path) to Markdown, in reading order. */
export function readGuides(files: Record<string, string>): Guide[] {
  return Object.entries(files)
    .map(([path, markdown]) => {
      const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
      const match = /^(\d+)-(.+)$/.exec(name)
      return {
        slug: match?.[2] ?? name,
        order: Number(match?.[1] ?? 999),
        title: /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? name,
        markdown,
      }
    })
    .sort((a, b) => a.order - b.order)
}

/**
 * A guide as HTML, without its first heading (each reader shows the title its own way). A link
 * to another guide (`02-connect-your-agent.md`) goes where `linkTo` says for its slug; a link to
 * another file of the repository goes to it on GitHub.
 */
export function guideHtml(guide: Guide, linkTo: (slug: string) => string): string {
  const marked = new Marked({
    walkTokens(token) {
      if (token.type !== 'link') return
      const toGuide = /^(?:\.\/)?\d+-([\w-]+)\.md(#.*)?$/.exec(token.href)
      if (toGuide) token.href = linkTo(toGuide[1] ?? '') + (toGuide[2] ?? '')
      else if (token.href.startsWith('../../')) token.href = `${REPOSITORY}/blob/main/${token.href.slice(6)}`
    },
  })
  return marked.parse(guide.markdown.replace(/^#\s+.+\n+/, ''), { async: false })
}

export const REPOSITORY = 'https://github.com/gverdugo-dev/openmemfs'
