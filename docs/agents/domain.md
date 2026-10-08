# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CLAUDE.md`** at the repo root: the data model, the API, the auth model and how modules and
  migrations are written. Its names (file, path, content, metadata, revision, version, author,
  module, tab, page) are the vocabulary; a synonym invented elsewhere is a defect.
- **`CONTEXT.md`** and **`docs/adr/`**: not created yet. `domain-modeling` creates them when a term
  or a decision needs one.

## File structure

Single-context repo: one `CONTEXT.md` and one `docs/adr/` at the root, ADRs numbered
`NNNN-slug.md` from `0001`.

## Flag ADR conflicts

If your output contradicts an ADR, surface it explicitly rather than silently overriding.
