import type { MiddlewareHandler } from 'hono'

/** The largest request body /api and /mcp read: room for 1 MiB of content written as JSON. */
export const MAX_BODY_BYTES = 4 * 1024 * 1024

/** The names a local server answers to when ALLOWED_HOSTS is not set. */
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * There is no login, so the browser is the one thing that must not write on your behalf.
 * Every request to /api and /mcp has to:
 * - name an allowed host, so a page that points its own domain at your machine (DNS
 *   rebinding) is refused;
 * - come from this site or from no browser at all (`Origin`, `Sec-Fetch-Site`), so another
 *   page open in the same browser cannot write;
 * - send JSON when it has a body, which a plain HTML form cannot do;
 * - keep its body under MAX_BODY_BYTES.
 * Agents and scripts send no `Origin` and pass. This is not access control: whoever reaches
 * the server still reads and writes everything (docs/guides/05-authentication.md).
 */
export function requestGuard(allowedHosts: string[] | '*'): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host
    if (allowedHosts !== '*' && !allowedHosts.includes(hostname(host))) {
      return refuse(c, 403, `this server does not answer to ${hostname(host)}: add it to ALLOWED_HOSTS`)
    }
    const origin = c.req.header('origin')
    if (c.req.header('sec-fetch-site') === 'cross-site' || (origin !== undefined && !sameHost(origin, host))) {
      return refuse(c, 403, 'requests from another site are refused')
    }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const length = Number(c.req.header('content-length') ?? '0')
      if (length > MAX_BODY_BYTES) return refuse(c, 413, `the body is larger than ${MAX_BODY_BYTES / 1024 / 1024} MiB`)
      const hasBody = length > 0 || c.req.raw.body !== null
      const type = c.req.header('content-type') ?? ''
      if (hasBody && !/^application\/json\b/i.test(type)) return refuse(c, 415, 'send the body as application/json')
    }
    return next()
  }
}

function refuse(c: Parameters<MiddlewareHandler>[0], status: 403 | 413 | 415, error: string) {
  return c.json({ error, code: 'refused' }, status)
}

/** The host without its port: `example.com:8080` is `example.com`, `[::1]:3000` is `[::1]`. */
function hostname(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, '')
}

function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}
