# openmemfs

A memory made of files, for you and your agents. A Notion-style editor over text files in
Postgres, with a REST API your agents write through. Small, and extended by modules.

| | |
|---|---|
| **What it is** | A self-hosted file memory: an editor for people, an API for agents |
| **Status** | v0.1: editor, metadata, version history, modules |
| **Stack** | TanStack Start, React, TanStack Query, Hono, Postgres, TipTap, Tailwind, Bun |
| **License** | MIT |

## What it does

- **Content**: every file opens in a Notion-like editor that reads and writes Markdown. It saves as
  you type.
- **Metadata**: a JSON object per file, where an agent writes notes for itself (state, summary,
  links) without touching the content.
- **History**: every change leaves a version, with who made it (you or an agent). Saves close
  together fold into one version. Any version can be restored, and the restore is a version too.
- **Rename and move**: edit the name at the top of the page; a name starting with `/` moves the file.
- **Conflicts**: if an agent changes a file you have open, nothing is overwritten; you choose.
- **Modules**: new tabs, pages, routes and tables live in `src/modules/`, each in its own folder.

## Run it

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

## Let an agent write

```bash
curl -X POST http://localhost:8080/api/files \
  -H "Authorization: Bearer $OPENMEMFS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"path": "/notes/today.md", "content": "# Today\n\n- ship it", "metadata": {"status": "draft"}}'
```

The whole API, the auth model and how to write a module are in [CLAUDE.md](CLAUDE.md).

## Structure

```
src/routes/   the pages (sign-in, the workspace) and /api
src/server/   the core: files, auth, migrations, the HTTP API
src/modules/  content, metadata, history, and yours
src/components/ the editor shell
migrations/   the core tables
```

## License

MIT. See [LICENSE](LICENSE).
