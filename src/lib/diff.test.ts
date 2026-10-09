import { describe, expect, test } from 'bun:test'
import { diffLines, diffText, hunks } from './diff'

const render = (before: string, after: string) =>
  diffLines(before, after).map((l) => `${l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '}${l.text}`)

describe('diffLines', () => {
  test('marks added, removed and kept lines', () => {
    expect(render('a\nb\nc', 'a\nB\nc\nd')).toEqual([' a', '-b', '+B', ' c', '+d'])
  })
  test('from nothing and to nothing', () => {
    expect(render('', 'x\ny')).toEqual(['+x', '+y'])
    expect(render('x', '')).toEqual(['-x'])
    expect(render('same', 'same')).toEqual([' same'])
  })
  test('rebuilds both sides', () => {
    const before = 'one\ntwo\nthree\nfour\nfive\nsix'
    const after = 'zero\none\nthree\nfour!\nfive\nsix\nseven'
    const lines = diffLines(before, after)
    expect(lines.filter((l) => l.kind !== 'add').map((l) => l.text).join('\n')).toBe(before)
    expect(lines.filter((l) => l.kind !== 'del').map((l) => l.text).join('\n')).toBe(after)
  })
})

describe('hunks', () => {
  test('keeps context around changes and marks the gaps', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l2', 'L2').replace('l17', 'L17')
    const cut = hunks(diffLines(before, after), 1)
    expect(cut.map((l) => (l === null ? '…' : l.text))).toEqual(['l1', 'l2', 'L2', 'l3', '…', 'l16', 'l17', 'L17', 'l18'])
  })
})

describe('diffText', () => {
  test('marks changes, context and gaps, and counts them', () => {
    const before = Array.from({ length: 10 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l1', 'L1').replace('l8', 'L8')
    expect(diffText(before, after, 1)).toEqual({
      diff: [' l0', '-l1', '+L1', ' l2', '@@', ' l7', '-l8', '+L8', ' l9'].join('\n'),
      added: 2,
      removed: 2,
    })
  })
})
