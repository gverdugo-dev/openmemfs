# CLAUDE.md

Guidance for agents (and people) changing this repository. Read it before writing code: every rule
here exists so that two agents working on openmemfs end up writing it the same way.

## What it is

**openmemfs**: a memory made of files, for a person and their agents. A Notion-style editor over
text files kept in Postgres, with three tabs on every file (Content, Metadata, History) and a REST
API that agents write through. It is small on purpose and grows by **modules**. Anyone deploys it
anywhere: one container, one Postgres, one token.

```
   browser (React)        this server (Bun + Hono)             Postgres
   ┌────────────────┐     ┌──────────────────────────┐     ┌──────────────────┐
   │ editor, tabs,  │ ──► │ /api: files + modules    │ ──► │ files            │
   │ module pages   │ ◄── │ static dist/web          │ ◄── │ file_versions    │
   └────────────────┘     └──────────────────────────┘     │ <module tables>  │
   agents ── Authorization: Bearer <token> ──► /api         └──────────────────┘
```

## Stack

Bun, Hono, postgres.js, React 19, Vite, Tailwind 4, TipTap 3 (StarterKit plus Markdown) and
TypeScript. No ORM, no auth library, no component library. Adding a dependency needs a reason a
reviewer would accept; the default answer is no.

## Layout

```
server/            the core: config, db, auth, the file service, the app, migrations, main
  files.ts         the only code that writes the `files` table
  module.ts        the ServerModule contract
  app.ts           /api routes, module wiring, static files
migrations/        core SQL migrations (NNNN_name.sql)
modules/
  server.ts        the list of active server modules
  web.ts           the list of active web modules
  <id>/server.ts   a module's server side (optional)
  <id>/web.tsx     a module's front side (optional)
  <id>/migrations/ a module's SQL migrations (optional)
web/               the shell: App, sidebar, file page, sign-in, api client, routing, styles
  module.ts        the WebModule contract
scripts/dev.ts     runs the server in watch mode and Vite together
```

Content, Metadata and History are modules like any other. Read them before writing a new one:
`modules/content` is front only, `modules/metadata` is front only, `modules/history` has all three
parts.

## Commands

```bash
bun install
bun run dev          # server on :8080 (watch) + Vite on :5173, which proxies /api
bun run build        # the front into dist/web
bun run start        # the server; serves dist/web when it exists
bun run migrate      # apply pending migrations and exit
bun run check        # tsc --noEmit and bun test
docker compose up    # Postgres and the app on :8080 (needs OPENMEMFS_TOKEN)
```

Tests that touch the database run only with `TEST_DATABASE_URL`, and they empty it. Never point it
at a database with data.

## The data model

- **`files`**: `id` (uuid), `path` (absolute, unique), `content` (text), `metadata` (a JSON
  object), `revision` (an integer bumped on every write), `created_at`, `updated_at`.
- Folders are not stored. A folder exists while some path starts with it.
- A name cannot be a file and a folder at once (`/a` and `/a/b` is a 409 `conflict`).
- **Metadata** is where an agent writes for itself: state, summaries, links, anything it wants to
  find again without parsing the content. The core does not read it; modules may (`when`).
- Every write can carry `if_revision`. If the file moved on, the answer is 409 `stale` and nothing
  is written. The editor always sends it; agents should too.
- Limits: 1 MiB of content, 64 KiB of metadata, 1024 characters of path.

## Auth

One token, `OPENMEMFS_TOKEN`. There are no users.

- Agents send `Authorization: Bearer <token>` and their writes are by `agent`.
- People type the token on the sign-in page, which sets an HttpOnly, SameSite=Strict cookie. Their
  writes are by `user`.
- A request authenticated by the cookie must carry `X-Openmemfs: 1` to write. Other sites cannot
  send that header without a preflight, so the cookie alone never writes. `web/api.ts` adds it.
- Open without a token: `GET /api/health`, `POST /api/session`, `DELETE /api/session`, and the
  static front. Everything else under `/api` is closed. A new route is closed by default; keep it so.

## The API

```
GET    /api/files?prefix=/notes/          list (no content)
GET    /api/files/by-path?path=/a.md       one file
GET    /api/files/:id                      one file
POST   /api/files                          { path, content?, metadata? }
PATCH  /api/files/:id                      { path?, content?, metadata?, if_revision?, checkpoint? }
DELETE /api/files/:id
GET    /api/files/:id/versions             history module
GET    /api/files/:id/versions/:n
POST   /api/files/:id/versions/:n/restore  { if_revision? }
```

Errors are `{ "error": "...", "code": "invalid|not_found|conflict|stale|unauthorized" }` with the
matching status. The message is written to be read by the caller, often a model.

## Adding a module

A module is a folder in `modules/` with a kebab-case id. It can have up to three parts; write only
the ones it needs.

1. **Server side**, `modules/<id>/server.ts`, exporting a `ServerModule` (see `server/module.ts`):
   - `id`: the folder name.
   - `migrations`: `join(import.meta.dir, 'migrations')` if it has tables.
   - `setup(ctx)` returns `routes(api)` to add routes under `/api` (already authenticated; prefix
     them with the module id or hang them under `/files/:id/<id>`) and `afterWrite(tx, file, write)`
     to react to every file write inside its transaction.
   - It reads and writes files through `ctx.files`, never with its own SQL on `files`. Its own
     tables are its own.
   - Throw `invalid()` / `notFound()` from `server/errors.ts`; never build an error response by hand.
   - Register it in `modules/server.ts`.
2. **Front side**, `modules/<id>/web.tsx`, exporting a `WebModule` (see `web/module.ts`):
   - `tabs`: a tab on every file page, with `order` (Content 10, Metadata 20, History 30) and an
     optional `when(file)` to show it only for some files, for example
     `when: (f) => f.metadata.kind === 'linkedin-post'`.
   - `pages`: a page of its own, linked from the sidebar as `?page=<id>`.
   - A tab writes with the `write` it receives, never with `fetch`: `write` queues writes, sends
     `if_revision` and shows conflicts. Use `replace` to put a file from the server on screen.
   - Register it in `modules/web.ts`.
3. **Migrations**, `modules/<id>/migrations/NNNN_name.sql`. Name tables after the module
   (`<id>_...`), and reference `files(id)` with `on delete cascade` when rows belong to a file.

Then add tests for its routes next to `server/app.test.ts` and run `bun run check`.

## Migrations

- Plain SQL files, `NNNN_snake_case.sql`, numbered from `0001` inside each folder.
- Core migrations run first, then each module's, in the order of `modules/server.ts`.
- Applied ones are recorded in `openmemfs_migrations` as `<owner>/<file>` (`core/0001_files.sql`,
  `history/0001_file_versions.sql`). Each file runs in its own transaction, under an advisory lock,
  so two instances starting together do not race.
- **Never edit or rename a migration that has been released.** Someone has already applied it.
  Change the schema with the next number.
- Use Postgres that any host has (13 or newer, no extensions beyond the built-in ones).
- The server applies pending migrations on start unless `MIGRATE_ON_START=false`.

## Design

The black sketchbook of Modyard and Widgetry: white paper, black ink, 2px black outlines, a black
marker for emphasis and the primary button, Inter 800 for headings and uppercase labels, Poppins for
reading. The tokens live in `web/styles.css`; use them by name (`text-ink-2`, `bg-wash`,
`border-line`, `btn btn-primary`, `field`, `marker`).

- No new colours. A literal colour in a component is a defect.
- No gradients, shadows, blur or rounded cards. Lines and white space do the work.
- Every view of the main area sits in `Page` (`web/components/FilePage.tsx`).
- The interface is in English and has no i18n yet; copy lives in the component that shows it.

## Conventions

- English everywhere: code, comments, docs, commits, PRs. No em-dashes in comments.
- Keep it small. A feature that only some people want is a module, not a change to the core.
- The core never learns about a module: if the core needs a branch for one module, the contract is
  missing something; extend the contract.
- No secrets in the repo: `.env` is ignored, `.env.example` documents every variable.

## Agent skills

Issues live in the tracker described in `docs/agents/issue-tracker.md` (label `resource:openmemfs`);
triage labels in `docs/agents/triage-labels.md`; domain docs in `docs/agents/domain.md`.
