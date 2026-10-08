import { expect, test } from 'bun:test'
import { checkPath, folderOf } from './paths'

test('accepts absolute file paths', () => {
  for (const path of ['/a.md', '/a/b/c.md', '/notes/2026-10-08 standup.md', '/.hidden']) {
    expect(checkPath(path)).toBe(path)
  }
})

test('rejects everything else', () => {
  for (const path of ['', 'a.md', '/', '/a/', '//a', '/a//b', '/./a', '/a/..', '/a\nb', 1, null]) {
    expect(() => checkPath(path)).toThrow()
  }
})

test('folderOf keeps the trailing slash', () => {
  expect(folderOf('/a/b.md')).toBe('/a/')
  expect(folderOf('/b.md')).toBe('/')
})
