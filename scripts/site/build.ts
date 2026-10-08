/**
 * Builds the website: a presentation of openmemfs and the guides of docs/guides/, the same files
 * the app shows. Static HTML into site-dist/, published by .github/workflows/pages.yml.
 *
 *   bun scripts/site/build.ts && bunx serve site-dist
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Guide, guideHtml, readGuides, REPOSITORY } from '../../src/lib/guides'

const ROOT = join(import.meta.dir, '../..')
const OUT = join(ROOT, 'site-dist')
const DOMAIN = 'openmemfs.gonzaloverdugo.com'

const guidesDir = join(ROOT, 'docs/guides')
const guides = readGuides(
  Object.fromEntries(
    readdirSync(guidesDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => [f, readFileSync(join(guidesDir, f), 'utf8')]),
  ),
)

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const logo = `<span class="logo"><img src="{root}favicon.svg" alt="" width="36" height="36"><span class="logo-words"><span>open<span class="marker">mem</span>fs</span><span class="tagline">own your context</span></span></span>`

/** The document every page shares. `root` is the relative way back to the site root. */
function page({ title, description, root, body }: { title: string; description: string; root: string; body: string }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="https://${DOMAIN}/logo.png">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&family=Poppins:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${root}site.css">
</head>
<body>
<header class="top"><a href="${root}" aria-label="openmemfs, home">${logo.replace('{root}', root)}</a>
<nav><a href="${root}guides/${guides[0]?.slug}/">Guides</a><a href="${REPOSITORY}">GitHub</a></nav></header>
${body}
<footer class="foot">openmemfs is free software under the MIT license. <a href="${REPOSITORY}">Source on GitHub</a>.</footer>
</body>
</html>
`
}

function guideList(root: string, current?: Guide) {
  return `<ol class="guides">${guides
    .map(
      (g) =>
        `<li${g === current ? ' aria-current="page"' : ''}><a href="${root}guides/${g.slug}/"><span class="n">${g.order}</span>${escape(g.title)}</a></li>`,
    )
    .join('')}</ol>`
}

function home() {
  const root = './'
  return page({
    title: 'openmemfs, the context of your personal agent',
    description:
      'A memory made of files, for you and your agents. Self-hosted, open source, with a Notion-style editor, a REST API and an MCP server.',
    root,
    body: `<main class="wrap">
<section class="hero">
<h1>The context of your <span class="marker">personal agent</span>, as files you own.</h1>
<p class="lead">openmemfs is a memory made of text files, kept in your own Postgres. You read and edit it
in a Notion-style editor; your agents read and write the same files through MCP and a REST API. Change
harness whenever you like: your context stays.</p>
<p class="actions"><a class="btn btn-primary" href="guides/${guides[0]?.slug}/">Read the guides</a><a class="btn" href="${REPOSITORY}">Get the code</a></p>
<pre><code>git clone ${REPOSITORY}.git
cd openmemfs &amp;&amp; docker compose up
claude mcp add --transport http openmemfs http://localhost:8080/mcp</code></pre>
</section>
<section class="points">
<div><h2>Yours</h2><p>Your server, your database, your rules. Plain files you can export, read and move.</p></div>
<div><h2>Any agent</h2><p>Every harness that speaks MCP gets the same tools: list, read, write, tag, search, commit.</p></div>
<div><h2>Personal</h2><p>One person and their agents. No accounts out of the box: add only what you need.</p></div>
<div><h2>Grows with you</h2><p>Small on purpose, extended by modules. Ask your agent for a tab, a tool or a page.</p></div>
</section>
<section>
<h2 class="section">The guides</h2>
<p class="muted">Short, and in order: from why it exists to running it in the cloud.</p>
${guideList(root)}
</section>
</main>`,
  })
}

function guidePage(guide: Guide, index: number) {
  const root = '../../'
  const next = guides[index + 1]
  return page({
    title: `${guide.title} · openmemfs`,
    description: /\n\n([^#\n][^\n]+)/.exec(guide.markdown)?.[1]?.replace(/[*`[\]]/g, '').slice(0, 160) ?? guide.title,
    root,
    body: `<main class="wrap guide">
<aside>${guideList(root, guide)}</aside>
<article>
<p class="kicker">Guide ${guide.order} of ${guides.length}</p>
<h1>${escape(guide.title)}</h1>
<div class="prose">${guideHtml(guide, (slug) => `../${slug}/`)}</div>
${next ? `<p><a class="btn" href="../${next.slug}/">Next: ${escape(next.title)}</a></p>` : ''}
</article>
</main>`,
  })
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'index.html'), home())
guides.forEach((guide, i) => {
  mkdirSync(join(OUT, 'guides', guide.slug), { recursive: true })
  writeFileSync(join(OUT, 'guides', guide.slug, 'index.html'), guidePage(guide, i))
})
copyFileSync(join(import.meta.dir, 'site.css'), join(OUT, 'site.css'))
copyFileSync(join(ROOT, 'public/favicon.svg'), join(OUT, 'favicon.svg'))
copyFileSync(join(ROOT, 'docs/logo.png'), join(OUT, 'logo.png'))
writeFileSync(join(OUT, 'CNAME'), `${DOMAIN}\n`)
writeFileSync(join(OUT, '.nojekyll'), '')
console.log(`site-dist/: home and ${guides.length} guides`)
