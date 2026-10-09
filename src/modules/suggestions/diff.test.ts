import { describe, expect, test } from 'bun:test'

import { inContext, locate, wordDiff, type Piece } from './diff'

/** A diff as text: [-removed-] and {+added+}, like git's word diff. */
function show(pieces: Piece[]): string {
  return pieces
    .map((piece) => (piece.kind === 'remove' ? `[-${piece.text}-]` : piece.kind === 'add' ? `{+${piece.text}+}` : piece.text))
    .join('')
}

describe('wordDiff', () => {
  test('marks only the words that change', () => {
    expect(show(wordDiff('Fue un éxito muy grande.', 'Fue un éxito enorme.'))).toBe('Fue un éxito [-muy grande-]{+enorme+}.')
  })

  test('keeps every character of both sides', () => {
    const a = 'El lanzamiento fue realizado por el equipo.'
    const b = 'El equipo hizo el lanzamiento.'
    const pieces = wordDiff(a, b)
    expect(pieces.filter((p) => p.kind !== 'add').map((p) => p.text).join('')).toBe(a)
    expect(pieces.filter((p) => p.kind !== 'remove').map((p) => p.text).join('')).toBe(b)
  })

  test('a pure insertion or removal', () => {
    expect(show(wordDiff('un post', 'un buen post'))).toBe('un {+buen +}post')
    expect(show(wordDiff('un buen post', 'un post'))).toBe('un [-buen -]post')
  })

  test('punctuation is its own token', () => {
    expect(show(wordDiff('Hola, mundo', 'Hola mundo'))).toBe('Hola[-,-] mundo')
  })
})

describe('inContext', () => {
  const content = '# Title\n\nFirst paragraph.\n\nThe launch was done by the team. It went well.\n\nLast one.\n'

  test('shows the paragraph around the change', () => {
    const shown = inContext(content, 'was done by the team', 'the team did')
    expect(shown.before).toBe('The launch ')
    expect(shown.after).toBe('. It went well.')
    expect(show(shown.change)).toBe('[-was done by -]the team{+ did+}')
  })

  test('cuts a long paragraph at a word', () => {
    const long = `${'word '.repeat(100)}target ${'more '.repeat(100)}`
    const shown = inContext(long, 'target', 'aim')
    expect(shown.before.startsWith('…word')).toBe(true)
    expect(shown.after.endsWith('more…')).toBe(true)
    expect(shown.before.length).toBeLessThan(260)
  })

  test('a stale suggestion has no place in the file', () => {
    expect(locate('a b a', 'a')).toBeUndefined()
    expect(locate('a b', 'c')).toBeUndefined()
    expect(locate('a b', 'b')).toBe(2)
    expect(inContext('a b a', 'a', 'x').before).toBe('')
  })
})
