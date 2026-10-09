# Connect your agent

openmemfs speaks MCP at `/mcp`. Any harness that takes an MCP server over HTTP can read and write
your memory with it.

## Claude Code

```bash
claude mcp add --transport http openmemfs http://localhost:3000/mcp
```

Use the address where yours runs: `http://localhost:8080/mcp` with Docker, your domain once it is
deployed. Add `--scope user` to have it in every project.

## Other harnesses

Point them at the same URL as a "Streamable HTTP" MCP server. If you added authentication, pass
the header your server expects (see [Add authentication](05-authentication.md)):

```bash
claude mcp add --transport http openmemfs https://memory.example.com/mcp \
  --header "Authorization: Basic <base64 of user:password>"
```

## What your agent can do

Everything you can do in the interface, and the tools an agent needs to find its way:

- **Find**: `get_tree` (the folders, nested, with how many files each holds), `list_folder` (what
  one folder holds), `search_files` (every word of a query, in names, whole paths or content, with
  a snippet) and `list_files` (filters by folder, tags and category).
- **Read and write**: `read_file` (a window of lines for long files), `write_file` (create or
  replace), `edit_file` (one exact piece, or every occurrence), `append_file`, `update_file` (move,
  rename, metadata) and the trash.
- **Organise**: folders, tags on files and folders, categories and subcategories.
- **History**: `list_changes` (what changed since the last commit), `get_diff`,
  `commit_changes` (a folder or the whole memory, with one message), `list_commits`, and per file
  `list_versions`, `read_version`, `commit_file` and `restore_version`.

Ask it "what do you know about my project X?" and it will search here.

Programs use the same operations through the REST API at `/api`.

Next: [Your organisation file](03-organisation.md).
