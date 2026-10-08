# openmemfs

A memory made of files, for you and your agents. A Notion-style editor over text files in
Postgres, with a REST API and an MCP server your agents use to do anything you can do. Small, and
extended by modules.

| | |
|---|---|
| **What it is** | A self-hosted file memory: an editor for people, an API for agents |
| **Status** | v0.1: editor, metadata, version history, tags, categories, search, REST and MCP, modules |
| **Stack** | TanStack Start, React, TanStack Query, Hono, Postgres, TipTap, Tailwind, Bun |
| **Repo** | `gverdugo-dev/openmemfs`, public, MIT |
| **Part of** | `personal-public-resources`, the container of Gonzalo Verdugo's personal resources |

## What it does

- **Content**: every file opens in a Notion-like editor that reads and writes Markdown. It saves as
  you type.
- **Metadata**: a JSON object per file, where an agent writes notes for itself (state, summary,
  links) without touching the content.
- **History**: every change leaves a version, with who made it (you or an agent). Saves close
  together fold into one version. Any version can be restored, and the restore is a version too.
- **Rename and move**: edit the name at the top of the page; a name starting with `/` moves the file.
- **Tags**: on a file or on a folder (every file below carries a folder's tags when you filter).
- **Categories and subcategories**: one per file, managed on the Tags & categories page.
- **Search**: by file name, by content or both, filtered by tags (all of them), by category (with
  its subcategories) and by folder. Every search has a link.
- **Conflicts**: if an agent changes a file you have open, nothing is overwritten; you choose.
- **Modules**: new tabs, pages, routes and tables live in `src/modules/`, each in its own folder.

## How to use it

With Docker:

```bash
OPENMEMFS_TOKEN=$(openssl rand -hex 32) docker compose up
```

Open http://localhost:8080 and type the token.

Anywhere else, build the `Dockerfile` and give it two variables: `DATABASE_URL` (any Postgres 13+)
and `OPENMEMFS_TOKEN` (at least 16 characters). Migrations run on the first request. See `.env.example` for
the rest.

Locally, with Bun and a Postgres:

```bash
cp .env.example .env   # fill DATABASE_URL and OPENMEMFS_TOKEN
bun install
bun run dev            # http://localhost:3000
```

To let an agent write, call the API:

```bash
curl -X POST http://localhost:8080/api/files \
  -H "Authorization: Bearer $OPENMEMFS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"path": "/notes/today.md", "content": "# Today\n\n- ship it", "metadata": {"status": "draft"}}'
```

Or connect an MCP client. With Claude Code:

```bash
claude mcp add --transport http openmemfs http://localhost:8080/mcp \
  --header "Authorization: Bearer $OPENMEMFS_TOKEN"
```

The agent gets a tool for everything the interface does: list and search files, read, create,
edit, move and delete them, tag files and folders, manage tags and categories, and read or restore
versions.

## Structure

```
src/routes/   the pages (sign-in, the workspace) and /api
src/server/   the core: services, auth, migrations, the REST and MCP doors
src/modules/  content, metadata, history, and yours
src/components/ the editor shell
migrations/   the core tables: files, categories, tags
```

## How it fits

openmemfs is the public, deployable version of a private memory service it grew out of:
the same idea (text files in Postgres, one service layer behind an HTTP door and an MCP door) with
its own editor built in and no dependency on any other resource. It needs one container, one
Postgres and one token, and runs wherever those do.

## More information

- [CLAUDE.md](CLAUDE.md): the whole API, the MCP tools, the data model, the auth model and how to
  write a module.
- `.env.example`: every variable the server reads.
- [LICENSE](LICENSE): MIT.
