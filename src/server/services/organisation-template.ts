/**
 * What `/organisation.md` holds the first time: a generic starting point that explains the
 * Open Knowledge Format, for the owner to make their own. `{{now}}` is replaced when it is written.
 */
export const ORGANISATION_TEMPLATE = `---
type: Reference
title: How this memory is organised
description: Where every kind of thing goes, how a file is labelled and how to work in this memory. The owner's rules; they win over any habit of an agent.
tags: [openmemfs, organisation, okf]
generated: {by: process:openmemfs-seed, at: {{now}}}
---

# How this memory is organised

This is openmemfs, the personal memory of its owner and the context of their agents. This file holds the rules for it. It is the owner's: edit it to change them. It is versioned like any other file, cannot be moved or deleted, and every agent reads it first with \`get_organisation\`.

**The owner is \`human:owner\`.** Replace that id with yours, here, once. It is the actor to use whenever a person has to be named.

# Folders

A starting layout. Change it to fit your life and your work.

\`\`\`
/organisation.md          this file
/inbox/                   captured, not sorted yet
/personal/                life outside work
    people/               one file per person
    projects/<project>/   things being built or planned
/work/
    <company>/            one folder per company you work for or run
        people/           colleagues and partners
        clients/<client>/ everything about one client
        projects/<project>/
/references/              outside material mirrored or summarised here, for other files to cite
\`\`\`

Rules for the tree:

- What is about one client or project goes under it. Link to other files instead of copying.
- When nothing fits, write to \`/inbox/\` and say so. Never invent a top level folder: propose it to the owner, and add it here first.
- A new subfolder is earned by the third file on the same subject.
- At most five levels deep.

# Names

- Lowercase kebab-case, ASCII, no spaces, \`.md\`: \`pricing-model.md\`.
- Anything that happened on a day starts with it: \`2026-09-17-kickoff.md\`.
- The card of a folder carries the folder's name: \`acme/acme.md\`.
- \`index.md\` and \`log.md\` are reserved by OKF and are never the name of a concept.

# Labels: Open Knowledge Format

This memory is an [Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle whose root is \`/\`. OKF is an open format, published by Google Cloud, for knowledge that people and agents share: every \`.md\` file is a **concept**, Markdown with YAML frontmatter that says what kind of thing it is, who wrote it and when. Any tool that reads OKF can read this memory, and an export of it is a valid bundle.

The format only requires \`type\`. This memory always writes these five, in this order:

\`\`\`yaml
---
type: Meeting
title: Kickoff with Acme
description: One sentence saying what this file holds, under 180 characters.
tags: [acme, onboarding]
generated: {by: claude-code/claude-opus-5, at: 2026-09-17T13:10:00Z}
---
\`\`\`

- **\`type\`** is what kind of thing the file is, from the table below, in Title Case and singular. Never what it is about: the subject goes in \`tags\`.
- **\`tags\`**: up to five, lowercase kebab-case: the client, the project, the person, the technology. Reuse one that exists before making a new one.
- **\`generated\`** is who wrote the content as it stands, and when. \`by\` tells the truth: \`<producer>/<version>\` when an agent wrote it, \`human:<id>\` when a person typed it, \`process:<id>\` for an automatic job. \`at\` is an ISO 8601 datetime with its offset, taken from the \`now\` that \`get_organisation\` returns: a date written from memory is a defect. Set both again on every change that alters what the file says.

The rest of the format, only when it adds something:

| Key | When |
| --- | --- |
| \`verified: {by: human:owner, at: <now>}\` | The owner confirmed the content in so many words. Never on an agent's own initiative |
| \`status: draft\` | The content is provisional. Absent means \`stable\`; \`deprecated\` for what is kept only for the record |
| \`stale_after: 2026-12-31T00:00:00Z\` | The content expires: a price, a status, a plan with a date |
| \`resource: <uri>\` | The file describes one asset with an address: a repository, a dashboard, a document |
| \`sources: [{id: <key>, resource: <url or path>, title: <label>}]\` | The content came from somewhere really consulted. Cite it with a footnote: \`text.[^key]\` |

Types:

| \`type\` | What it is |
| --- | --- |
| \`Note\` | A thought, an observation, a capture. The default |
| \`Person\` | One person: who they are, how to work with them |
| \`Client\` | The card of a client |
| \`Project\` | The card of a project: goal, state, next step |
| \`Meeting\` | What was said and agreed on one occasion |
| \`Decision\` | One decision: the context, what was chosen, what was ruled out |
| \`Playbook\` | How something is done, step by step |
| \`Reference\` | Stable facts to look up: a how-to, a list, a specification |
| \`Preference\` | How the owner likes something done |

A new type is added to this table first, by the owner.

The body opens with \`# <title>\` and favours headings, lists and tables over long prose. One subject per file: past two hundred lines, split it. Link with absolute paths, which here are the paths of this memory: \`[the card](/work/acme/clients/globex/globex.md)\`.

OKF frontmatter is not the same thing as openmemfs **tags**, **categories** and **metadata**: those live outside the content, the interface shows them and the tools filter by them. Use them to find files; use the frontmatter to say what a file is.

# Working here

1. **Search before writing.** A second file on a subject that already has one is the failure a memory exists to prevent: update the one that exists.
2. **Place it** with the folder rules above, then name it.
3. **Write it** with its frontmatter. Prefer \`edit_file\` to rewriting a whole file, and pass \`if_revision\` so you never overwrite a change the owner just made.
4. **Commit** when a coherent piece of work is done, with a message that says what changed and why.
5. **Say where it went**: the path, in your answer.

What never goes in: passwords, keys, tokens or card numbers, not even redacted. And nothing invented: a file records what the owner said or what a source says, never a guess written as a fact.
`
