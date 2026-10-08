# Issue tracker: GitHub (container repo)

Issues and specs for this repo do **not** live here. They live as GitHub issues in the private container repo **`gverdugo-dev/personal-public-resources`**, which holds the tasks of every resource in one place so that nothing about the work leaks into the public repos. Use the `gh` CLI for all operations, with the `gverdugo-dev` account active (`gh auth status`, `gh auth switch --user gverdugo-dev`).

Two rules follow from this, and every command below already applies them:

1. **Always pass `-R gverdugo-dev/personal-public-resources`.** `gh` infers the repo from `git remote -v`, and inside this clone that would be the wrong one.
2. **Always label issues of this resource with `resource:openmemfs`.** It is the only thing that tells the issues of this resource apart from the others. Add it on create and filter by it on list.

## Conventions

- **Create an issue**: `gh issue create -R gverdugo-dev/personal-public-resources --label "resource:openmemfs" --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> -R gverdugo-dev/personal-public-resources --comments`, filtering comments by `jq` and also fetching labels.
- **List issues of this resource**: `gh issue list -R gverdugo-dev/personal-public-resources --label "resource:openmemfs" --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with further `--label` and `--state` filters as needed.
- **Comment on an issue**: `gh issue comment <number> -R gverdugo-dev/personal-public-resources --body "..."`
- **Apply / remove labels**: `gh issue edit <number> -R gverdugo-dev/personal-public-resources --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> -R gverdugo-dev/personal-public-resources --comment "..."`

Pull requests, by contrast, stay in this repo: `gh pr ...` without `-R` is correct. When a PR closes an issue, reference it with its full name (`Closes gverdugo-dev/personal-public-resources#<n>`), since a bare `#<n>` would point at this repo.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents in **this** repo:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

Issues and PRs live in different repos here, so a bare `#42` is ambiguous: issues resolve against the container repo (`gh issue view 42 -R gverdugo-dev/personal-public-resources`) and PRs against this one (`gh pr view 42`).

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `gverdugo-dev/personal-public-resources` labelled `resource:openmemfs`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> -R gverdugo-dev/personal-public-resources --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets. Everything below happens in the container repo, so `-R gverdugo-dev/personal-public-resources` applies to every command, and both the map and its children carry `resource:openmemfs`.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create -R gverdugo-dev/personal-public-resources --label "wayfinder:map,resource:openmemfs"`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`) plus `resource:openmemfs`. Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/gverdugo-dev/personal-public-resources/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/gverdugo-dev/personal-public-resources/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list -R gverdugo-dev/personal-public-resources --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> -R gverdugo-dev/personal-public-resources --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> -R gverdugo-dev/personal-public-resources --body "<answer>"`, then `gh issue close <n> -R gverdugo-dev/personal-public-resources`, then append a context pointer (gist + link) to the map's Decisions-so-far.
