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
import { timingSafeEqual } from 'node:crypto'

const password = createMiddleware().server(async ({ request, next }) => {
  const expected = process.env.OPENMEMFS_PASSWORD
  // Without a password the server refuses everything rather than opening up.
  if (!expected) return new Response('OPENMEMFS_PASSWORD is not set', { status: 503 })
  const [scheme, encoded = ''] = (request.headers.get('authorization') ?? '').split(' ')
  const decoded = scheme === 'Basic' ? Buffer.from(encoded, 'base64').toString() : ''
  const given = decoded.slice(decoded.indexOf(':') + 1) // the password may contain ':'
  if (decoded.includes(':') && same(given, expected)) return next()
  return new Response('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="openmemfs"' },
  })
})

/** Compares in constant time, so the answer time does not tell how much of it was right. */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const startInstance = createStart(() => ({ requestMiddleware: [password, securityHeaders] }))
```

Set `OPENMEMFS_PASSWORD` where it runs. The browser asks for it once. Agents send it as a header:

```bash
claude mcp add --transport http openmemfs https://memory.example.com/mcp \
  --header "Authorization: Basic $(printf 'me:%s' "$OPENMEMFS_PASSWORD" | base64)"
```

Only use it over HTTPS: Basic authentication sends the password with every request. Use a long
random one (`openssl rand -base64 24`): nothing limits how many times someone can try.

## What openmemfs already refuses

Even without a password, `/api` and `/mcp` refuse what a web page open in your browser could
send them: requests from another site, bodies that are not JSON, and host names that are not
in `ALLOWED_HOSTS` (loopback names only by default). That keeps a page you visit from writing
to the memory on your own machine. It does not stop anyone who reaches the server directly.

## More than a password

For a sign-in with Google, per-agent keys or OAuth (which claude.ai connectors need), add an auth
library as a module and check the session in the same middleware. Keep it about you and your
agents: openmemfs is personal software, not a service for many users.

Next: [Deploy it](06-deploy.md).
