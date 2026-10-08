# Give your agent an organisation

An agent that connects to openmemfs sees tools, not intentions. It does not know where you keep
your projects, how you name files or what it may change. Tell it once, in the memory itself.

## 1. Write `/organisation.md`

Create a file at the root of your memory called `organisation.md`. Keep it short:

```markdown
# How this memory is organised

This is openmemfs, my personal memory. Read it before answering about me or my work.

- /projects/<name>/: one folder per project, with a README.md that says what it is.
- /people/: one file per person I work with.
- /inbox.md: anything unsorted. I tidy it on Fridays.

Rules for agents:
- Search before creating a file; prefer editing to rewriting.
- Write in English. Dates as 2026-10-08.
- Commit with a message when you finish a piece of work.
```

Because it is a file, you edit it like any other, and its history shows how your rules changed.

## 2. Add a `get_organisation` tool

A harness reads the tool list when it connects. A tool that says "call me first" puts your rules
in front of every agent, whichever harness it runs in. Add it as a module,
`src/modules/organisation/server.ts`:

```ts
import { tool } from '#/server/mcp'
import type { ServerModule } from '#/server/module'

const PATH = '/organisation.md'

export const organisation: ServerModule = {
  id: 'organisation',
  setup: ({ services: { files } }) => ({
    tools: (mcp) =>
      tool(
        mcp,
        'get_organisation',
        'Call this first, before any other tool: it returns how this memory (openmemfs) is organised and the rules for agents, plus the current time.',
        {},
        async () => {
          const file = await files.getByPath(PATH).catch(() => null)
          return {
            organisation: file?.content ?? `No ${PATH} yet. Ask the person how they want their memory organised.`,
            now: new Date().toISOString(),
          }
        },
      ),
  }),
}
```

Register it in `src/modules/server.ts`:

```ts
import { organisation } from './organisation/server'

export const serverModules: ServerModule[] = [history, organisation]
```

The current time is there because an agent has no clock, and your files will carry dates.

Next: [Extend openmemfs](04-extend.md).
