/**
 * A markdown file may open with YAML frontmatter between two `---` lines (Open Knowledge Format
 * labels, say). The editor never sees it: TipTap would read the fences as rules and the last key
 * as a heading, and write them back changed. The frontmatter is kept as the exact text it was,
 * shown as properties, and put back in front of the body on every save.
 */
export interface Split {
  /** The YAML between the fences, without them; null when the file has none. */
  frontmatter: string | null
  body: string
}

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(content: string): Split {
  const match = FENCE.exec(content)
  if (!match) return { frontmatter: null, body: content }
  return { frontmatter: match[1] ?? '', body: content.slice(match[0].length).replace(/^\r?\n/, '') }
}

export function joinFrontmatter({ frontmatter, body }: Split): string {
  if (frontmatter === null) return body
  return `---\n${frontmatter}\n---\n\n${body}`
}

export type Value = string | string[] | { [key: string]: string }

export interface Property {
  key: string
  value: Value
}

/**
 * Reads the frontmatter enough to show it: `key: value`, flow lists `[a, b]` and flow maps
 * `{by: x, at: y}`. Anything else (a nested block, a multi-line string) is shown as its text.
 * It is a display, not a YAML parser: the file keeps the text as written.
 */
export function readProperties(yaml: string): Property[] {
  const properties: Property[] = []
  for (const line of yaml.split(/\r?\n/)) {
    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    const last = properties.at(-1)
    if (top?.[1] !== undefined) {
      properties.push({ key: top[1], value: scalarOrFlow(top[2] ?? '') })
    } else if (last && line.trim()) {
      // A continuation of the previous key: keep it as text.
      const text = typeof last.value === 'string' ? last.value : JSON.stringify(last.value)
      last.value = `${text}${text ? '\n' : ''}${line.trim()}`
    }
  }
  return properties
}

function unquote(text: string): string {
  const t = text.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

/** Splits on commas that are not inside quotes or brackets. */
function items(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current)
  return out.map((s) => s.trim())
}

function scalarOrFlow(raw: string): Value {
  const text = raw.trim()
  if (text.startsWith('[') && text.endsWith(']')) return items(text.slice(1, -1)).map(unquote)
  if (text.startsWith('{') && text.endsWith('}')) {
    const map: Record<string, string> = {}
    for (const pair of items(text.slice(1, -1))) {
      const at = pair.indexOf(':')
      if (at < 0) return text
      map[pair.slice(0, at).trim()] = unquote(pair.slice(at + 1))
    }
    return map
  }
  return unquote(text)
}
