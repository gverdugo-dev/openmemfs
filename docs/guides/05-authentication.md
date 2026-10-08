# Add authentication

openmemfs has no login: whoever reaches the server reads and writes everything. On your own
machine that is fine. **Before it is reachable from anywhere else, close it.**

## The simplest: keep it private

- Run it on your machine only (`docker compose` publishes it on `127.0.0.1`).
- Or reach it through a private network such as Tailscale, so only your devices see it.

## One password for everything

Ask the browser and every agent for the same password with HTTP Basic authentication. Add a
middleware to `src/start.ts`:

```ts
const password = createMiddleware().server(async ({ request, next }) => {
  const expected = process.env.OPENMEMFS_PASSWORD
  if (!expected) return next()
  const [, encoded = ''] = (request.headers.get('authorization') ?? '').split(' ')
  const [, given] = Buffer.from(encoded, 'base64').toString().split(':')
  if (given === expected) return next()
  return new Response('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="openmemfs"' },
  })
})

export const startInstance = createStart(() => ({ requestMiddleware: [password, securityHeaders] }))
```

Set `OPENMEMFS_PASSWORD` where it runs. The browser asks for it once. Agents send it as a header:

```bash
claude mcp add --transport http openmemfs https://memory.example.com/mcp \
  --header "Authorization: Basic $(printf 'me:%s' "$OPENMEMFS_PASSWORD" | base64)"
```

Only use it over HTTPS: Basic authentication sends the password with every request.

## More than a password

For a sign-in with Google, per-agent keys or OAuth (which claude.ai connectors need), add an auth
library as a module and check the session in the same middleware. Keep it about you and your
agents: openmemfs is personal software, not a service for many users.

Next: [Deploy it](06-deploy.md).
