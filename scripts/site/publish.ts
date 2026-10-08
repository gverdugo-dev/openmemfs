/**
 * Builds the website and pushes site-dist/ to the gh-pages branch of this repository's origin,
 * where GitHub Pages serves it (Settings > Pages: deploy from the gh-pages branch, root).
 * No workflow: whoever changes the guides runs it.
 *
 *   bun run site:publish
 */
import { $ } from 'bun'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..', '..')
const OUT = join(ROOT, 'site-dist')

await $`bun ${join(import.meta.dir, 'build.ts')}`
const origin = (await $`git -C ${ROOT} remote get-url origin`.text()).trim()
const commit = (await $`git -C ${ROOT} rev-parse --short HEAD`.text()).trim()

// site-dist/ is rebuilt from scratch every time, so it gets a fresh one-commit history.
await $`rm -rf ${join(OUT, '.git')}`
await $`git -C ${OUT} init -q -b gh-pages`
await $`git -C ${OUT} add -A`
await $`git -C ${OUT} -c user.name=openmemfs -c user.email=site@openmemfs commit -q -m ${`Website from ${commit}`}`
await $`git -C ${OUT} push -q -f ${origin} gh-pages`
console.log(`Published the website from ${commit} to the gh-pages branch.`)
