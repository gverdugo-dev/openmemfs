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

Everything you can do in the interface: list and search files, read, create, edit, move and
delete them, create and move folders, tag files and folders, manage categories, commit and restore
versions. Ask it "what do you know about my project X?" and it will search here.

Programs use the same operations through the REST API at `/api`.

Next: [Give your agent an organisation](03-organisation.md).
