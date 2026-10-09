<p align="center">
  <img src="docs/banner.jpg" alt="A Dutch canal warehouse with a stepped gable, seen from the front in flat vector" width="100%">
</p>

# openmemfs

<p><img src="docs/logo.png" alt="openmemfs: own your context" width="420"></p>

**Own your context.** Everything your agents should know about you, your work and your projects,
kept as plain files in a Postgres you run. You read and edit them in a Notion-style editor; your
agents read and write the same files through an API and an MCP server.

Harnesses change. Models change. Your context should not have to move with them: whichever agent
you use next connects to the same memory and finds everything where you left it. It is yours to
keep, to read, to take elsewhere and to change.

## Why

- **Yours.** One container and one Postgres, on your machine or wherever you deploy it. No account,
  no service in between, MIT.
- **Plain files.** Markdown with a frontmatter, in folders. Nothing hidden in a format only one tool
  reads.
- **For you and your agents equally.** Everything you can do in the interface, an agent can do
  through REST or MCP: read, search, write, move, tag, commit, restore.
- **Small, and meant to be extended.** The core is files, folders, tags, categories, search and
  history. The rest is yours to add.

## Extend it

openmemfs grows by **modules**: a folder in `src/modules/<id>/` that can add a tab on every file,
a page, API routes, MCP tools and its own tables. Content and History are modules too; read
`src/modules/history` and write yours next to it.

The quickest way is to ask your agent. Open the repository in your harness and describe it:

> Add a module that shows a "Tasks" tab on files tagged `project`, listing every line that starts
> with `- [ ]`, and an MCP tool `list_tasks` that returns them across the memory.

The rules a module follows are in [CLAUDE.md](CLAUDE.md), written so an agent can follow them.
Fork it, change it, make it the software you want. If you build a module others would use, share
it.

## Run it

```bash
docker compose up
```

Open http://localhost:8080 and connect your agent. With Claude Code:

```bash
claude mcp add --transport http openmemfs http://localhost:8080/mcp
```

Anywhere else, build the `Dockerfile` and give it `DATABASE_URL` (any Postgres 13+). Migrations run
on their own. `.env.example` lists every variable.

**There is no login and no key**, on purpose. Whoever reaches the server reads and writes
everything. Keep it on your machine, or put it behind something that controls access before you
expose it: the [authentication guide](docs/guides/05-authentication.md) shows how.

To develop, with Bun and a Postgres:

```bash
cp .env.example .env   # fill DATABASE_URL
bun install
bun run dev            # http://localhost:3000
bun run check          # types and tests
```

## What is in the box

- **Content**: a Notion-like editor over Markdown that saves as you type. The frontmatter shows as
  properties; a Markdown view edits the file as stored, and Copy file copies it whole.
- **History**: every change leaves a version, made by you or an agent, with its diff. Commits are
  optional and name a version; any version can be restored.
- **Organisation**: `/organisation.md`, your rules for the memory, which every agent reads first.
- **Explorer**: new files and folders, drag and drop, a right-click menu, a sidebar you can resize
  and fold, light and dark.
- **Tags, categories and search**: tags on files and folders, categories with subcategories, and
  search by every word of a query in names, paths or content, with filters.

## Guides

Short and in order, in [`docs/guides/`](docs/guides/01-your-context.md): why your context should be
yours, connecting your agent, an `organisation.md` every harness reads, extending it, adding
authentication and deploying it. The app shows them under **Guides**, and
https://openmemfs.gonzaloverdugo.com publishes them.

## License

[MIT](LICENSE).
