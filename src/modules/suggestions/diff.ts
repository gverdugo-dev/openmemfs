/**
 * What a suggestion looks like in its document: the paragraph it touches, cut
 * around the change, and the change itself word by word. Pure functions, so
 * the page only paints them.
 */

export type PieceKind = 'same' | 'add' | 'remove'

export interface Piece {
  kind: PieceKind
  text: string
}

/** The paragraph around a change, with the change marked by words. */
export interface InContext {
  before: string
  change: Piece[]
  after: string
}

/** How much of the paragraph shows on each side of the change. */
const CONTEXT_CHARS = 240
/** Past this many token pairs, the change shows as one removal and one addition. */
const MAX_PAIRS = 250_000

/**
 * Where a suggestion lands in content, or undefined when its old_string no
 * longer appears exactly once.
 */
export function locate(content: string, old: string): number | undefined {
  const first = content.indexOf(old)
  if (first < 0 || content.indexOf(old, first + 1) >= 0) return undefined
  return first
}

/**
 * The change in its paragraph: the text from the blank line before it to the
 * blank line after it, cut to a few lines on each side. Without a place in
 * content, only the change.
 */
export function inContext(content: string, old: string, replacement: string): InContext {
  const change = wordDiff(old, replacement)
  const at = locate(content, old)
  if (at === undefined) return { before: '', change, after: '' }

  const start = content.lastIndexOf('\n\n', at)
  const end = content.indexOf('\n\n', at + old.length)
  let before = content.slice(start < 0 ? 0 : start + 2, at)
  let after = content.slice(at + old.length, end < 0 ? content.length : end)
  if (before.length > CONTEXT_CHARS) before = `…${trimStart(before.slice(-CONTEXT_CHARS))}`
  if (after.length > CONTEXT_CHARS) after = `${trimEnd(after.slice(0, CONTEXT_CHARS))}…`
  return { before, change, after: after.replace(/\n+$/, '') }
}

/** Drops the word a cut started in the middle of. */
function trimStart(text: string): string {
  const space = text.search(/\s/)
  return space < 0 ? text : text.slice(space + 1)
}

function trimEnd(text: string): string {
  const space = text.search(/\s\S*$/)
  return space < 0 ? text : text.slice(0, space)
}

/**
 * Splits text into words and the runs of space and punctuation between them,
 * so a diff of the tokens is a diff of words that keeps every character.
 */
export function tokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []
}

/**
 * The change from a to b word by word: what stays, what goes and what comes,
 * with neighbouring pieces of the same kind merged. A longest common
 * subsequence of the tokens, which a sentence or a paragraph can afford.
 */
export function wordDiff(a: string, b: string): Piece[] {
  const x = tokens(a)
  const y = tokens(b)
  if (x.length * y.length > MAX_PAIRS) {
    return merge([
      { kind: 'remove', text: a },
      { kind: 'add', text: b },
    ])
  }

  // lcs[i][j] is the length of the common subsequence of x[i:] and y[j:].
  const lcs = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const pieces: Piece[] = []
  let i = 0
  let j = 0
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      pieces.push({ kind: 'same', text: x[i]! })
      i++
      j++
    } else if (j < y.length && (i === x.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      pieces.push({ kind: 'add', text: y[j]! })
      j++
    } else {
      pieces.push({ kind: 'remove', text: x[i]! })
      i++
    }
  }
  return merge(absorbSpaces(pieces))
}

/**
 * A space kept between a removed word and an added one reads as two changes:
 * "[-muy-] [+tan+]". Folding it into both sides reads as one replacement.
 */
function absorbSpaces(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  for (let k = 0; k < pieces.length; k++) {
    const piece = pieces[k]!
    const prev = pieces[k - 1]
    const next = pieces[k + 1]
    if (piece.kind === 'same' && /^\s+$/.test(piece.text) && prev && next && prev.kind !== 'same' && next.kind !== 'same') {
      out.push({ kind: 'remove', text: piece.text }, { kind: 'add', text: piece.text })
      continue
    }
    out.push(piece)
  }
  return out
}

/** Joins neighbours of one kind, and puts every removal before the addition it sits with. */
function merge(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  let run: Piece[] = []
  const flush = () => {
    for (const kind of ['remove', 'add'] as const) {
      const text = run.filter((piece) => piece.kind === kind).map((piece) => piece.text).join('')
      if (text) out.push({ kind, text })
    }
    run = []
  }
  for (const piece of pieces) {
    if (piece.text === '') continue
    if (piece.kind === 'same') {
      flush()
      const last = out.at(-1)
      if (last?.kind === 'same') last.text += piece.text
      else out.push({ ...piece })
    } else {
      run.push(piece)
    }
  }
  flush()
  return out
}
