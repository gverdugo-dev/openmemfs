import { expect, test } from 'bun:test'
import { joinFrontmatter, readProperties, splitFrontmatter } from './frontmatter'

const file = `---
type: Reference
title: How this memory is organised
tags: [openmemfs, organisation, okf]
generated: {by: process:openmemfs-seed, at: 2026-10-08T19:10:05.432Z}
---

# How this memory is organised

Body.
`

test('the frontmatter is split off and put back exactly', () => {
  const split = splitFrontmatter(file)
  expect(split.frontmatter).toStartWith('type: Reference')
  expect(split.body).toStartWith('# How this memory')
  expect(joinFrontmatter(split)).toBe(file)
})

test('a file without frontmatter is all body', () => {
  expect(splitFrontmatter('# Hi\n\n---\n\nthere')).toEqual({ frontmatter: null, body: '# Hi\n\n---\n\nthere' })
  expect(joinFrontmatter({ frontmatter: null, body: 'x' })).toBe('x')
})

test('properties read scalars, flow lists and flow maps', () => {
  const props = readProperties(splitFrontmatter(file).frontmatter!)
  expect(props).toEqual([
    { key: 'type', value: 'Reference' },
    { key: 'title', value: 'How this memory is organised' },
    { key: 'tags', value: ['openmemfs', 'organisation', 'okf'] },
    { key: 'generated', value: { by: 'process:openmemfs-seed', at: '2026-10-08T19:10:05.432Z' } },
  ])
})

test('a nested block is kept as text', () => {
  const props = readProperties('sources:\n  - id: a\n    resource: /x.md\ntitle: "Quoted: yes"')
  expect(props[0]).toEqual({ key: 'sources', value: '- id: a\nresource: /x.md' })
  expect(props[1]).toEqual({ key: 'title', value: 'Quoted: yes' })
})
