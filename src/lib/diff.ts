/** One line of a diff: kept, added or removed. */
export interface DiffLine {
  kind: 'same' | 'add' | 'del'
  text: string
}

/** Past this many edits the diff stops looking for the shortest one and replaces the rest whole. */
const MAX_EDITS = 2000

/**
 * The lines that changed from `before` to `after` (Myers' algorithm). Two versions of a
 * memory file differ in a few lines, so this stays fast; a rewrite past MAX_EDITS shows as
 * the old lines removed and the new ones added.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  const n = a.length
  const m = b.length
  const max = Math.min(n + m, MAX_EDITS)
  const offset = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []

  let found = -1
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = d
        break
      }
    }
  }
  if (found < 0) return [...a.map((text) => ({ kind: 'del' as const, text })), ...b.map((text) => ({ kind: 'add' as const, text }))]

  // Walk back from the end through the saved frontiers.
  const lines: DiffLine[] = []
  let x = n
  let y = m
  for (let d = found; d > 0; d--) {
    const prev = trace[d]!
    const k = x - y
    const down = k === -d || (k !== d && prev[offset + k - 1]! < prev[offset + k + 1]!)
    const prevK = down ? k + 1 : k - 1
    const prevX = prev[offset + prevK]!
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) lines.push({ kind: 'same', text: a[--x]! }), y--
    if (down) lines.push({ kind: 'add', text: b[--y]! })
    else lines.push({ kind: 'del', text: a[--x]! })
  }
  while (x > 0 && y > 0) lines.push({ kind: 'same', text: a[--x]! }), y--
  return lines.reverse()
}

/** A diff cut down to the changed lines and `context` lines around each, with gaps marked by null. */
export function hunks(lines: DiffLine[], context = 3): (DiffLine | null)[] {
  const keep = lines.map(() => false)
  lines.forEach((line, i) => {
    if (line.kind === 'same') return
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true
  })
  const out: (DiffLine | null)[] = []
  lines.forEach((line, i) => {
    if (keep[i]) out.push(line)
    else if (out.length > 0 && out.at(-1) !== null) out.push(null)
  })
  if (out.at(-1) === null) out.pop()
  return out
}

/**
 * A diff as text for a reader that is not a screen, such as an agent: `+` added, `-` removed,
 * a space for context, and `@@` where unchanged lines were left out.
 */
export function diffText(before: string, after: string, context = 3): { diff: string; added: number; removed: number } {
  const lines = diffLines(before, after)
  const diff = hunks(lines, context)
    .map((l) => (l === null ? '@@' : `${l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}${l.text}`))
    .join('\n')
  return {
    diff,
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'del').length,
  }
}
