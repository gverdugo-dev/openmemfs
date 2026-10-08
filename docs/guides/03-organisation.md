# Your organisation file

An agent that connects to openmemfs sees tools, not intentions. It does not know where you keep
your projects, how you name files or what it may change. openmemfs tells it, from the memory
itself.

## `/organisation.md` is always there

The first time openmemfs starts, it writes `/organisation.md` at the root. It holds your rules
for the memory: the folders, how files are named, how they are labelled and how an agent should
work. It cannot be moved or deleted; you edit it like any other file, and its history shows how
your rules changed.

It starts from a template you make your own:

- **The owner.** Replace `human:owner` with your id, once.
- **The folders.** A starting layout (`/inbox/`, `/personal/`, `/work/`, `/references/`). Change
  it to fit your life.
- **Names.** Lowercase kebab-case, dates first for things that happened on a day.
- **Labels in the Open Knowledge Format.** Every Markdown file carries a short YAML frontmatter
  in [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), the
  open format published by Google Cloud for knowledge that people and agents share: what kind of
  thing the file is (`type`), a one-line `description`, `tags`, and who wrote it and when
  (`generated`). Any tool that reads OKF can read your memory.
- **How to work.** Search before writing, edit rather than rewrite, commit with a message, never
  store a secret.

## `get_organisation`, the first call

Every MCP client gets a `get_organisation` tool, and the server tells agents to call it before
anything else. It returns the file and the current time, because an agent has no clock and your
files carry dates. The REST API has it too: `GET /api/organisation`.

```bash
curl http://localhost:3000/api/organisation
```

Change harness and nothing changes: the next agent reads the same rules.

Next: [Extend openmemfs](04-extend.md).
