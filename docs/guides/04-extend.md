# Extend openmemfs

The core is small on purpose: files, folders, tags, categories, search and history. Everything
else is yours to add, and the way to add it is a **module**: a folder in `src/modules/<id>/` with
up to three parts.

- `server.ts`: API routes, MCP tools, and a hook that runs on every write.
- `web.tsx`: a tab on every file, or a page of its own in the sidebar.
- `migrations/`: its own tables, in plain SQL.

`src/modules/history` has all three; read it before writing your own. The rules every module
follows are in [CLAUDE.md](../../CLAUDE.md), written so an agent can follow them too.

## Build it with an agent

Open the repository in your harness and describe what you want:

> Add a module that shows a "Tasks" tab on files tagged `project`, listing every line that starts
> with `- [ ]`, and an MCP tool `list_tasks` that returns them across the memory.

Review the change, run `bun run check` and keep it if it works. It is your software.

## What people usually add first

- [An organisation file and a `get_organisation` tool](03-organisation.md), so every harness starts
  with your rules.
- [Authentication](05-authentication.md), before the memory leaves your machine.
- [A deployment](06-deploy.md), so your agents reach it from anywhere.
- Views for your own kinds of file: a tab that renders a recipe, a draft post or a meeting note
  differently, shown only when the file's metadata says what it is.

## One rule

Whatever you add, keep it your context: plain files that you and your agents read and write. A
module adds ways to see and use them; it does not hide them somewhere else.
