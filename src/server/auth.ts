import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from './module'

export const SESSION_COOKIE = 'openmemfs_session'
/** Writes from the browser must carry it: a form or a fetch from another site cannot add it. */
export const WRITE_HEADER = 'X-Openmemfs'
const SESSION_DAYS = 30

const sha256 = (value: string) => createHash('sha256').update(value).digest()

function same(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Two ways in, one token. An agent sends `Authorization: Bearer <token>` and writes as
 * `agent`. A person types the token once on the sign-in page and gets an HttpOnly cookie
 * holding a hash derived from it, and writes as `user`. Changing the token signs everyone out.
 */
export function createAuth(token: string) {
  const tokenHash = sha256(token)
  const sessionValue = sha256(`openmemfs-session:${token}`).toString('hex')

  const isSession = (cookie: string | undefined) => !!cookie && same(Buffer.from(cookie), Buffer.from(sessionValue))

  const require: MiddlewareHandler<AppEnv> = async (c, next) => {
    const header = c.req.header('Authorization')
    if (header?.startsWith('Bearer ')) {
      if (!same(sha256(header.slice(7)), tokenHash)) return c.json({ error: 'invalid token' }, 401)
      c.set('author', 'agent')
      return next()
    }
    if (isSession(getCookie(c, SESSION_COOKIE))) {
      const reads = c.req.method === 'GET' || c.req.method === 'HEAD'
      if (!reads && c.req.header(WRITE_HEADER) !== '1') {
        return c.json({ error: `writes from the browser need the ${WRITE_HEADER}: 1 header` }, 403)
      }
      c.set('author', 'user')
      return next()
    }
    return c.json({ error: 'sign in, or send Authorization: Bearer <token>' }, 401)
  }

  /**
   * The MCP endpoint: only the Bearer token. A missing or wrong one is a 403, not a 401: on a
   * 401 MCP clients start an OAuth discovery this server does not offer, and the person sees
   * that failure instead of the real one.
   */
  const requireAgent: MiddlewareHandler<AppEnv> = async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ') || !same(sha256(header.slice(7)), tokenHash)) {
      return c.json({ error: 'send Authorization: Bearer <OPENMEMFS_TOKEN>' }, 403)
    }
    c.set('author', 'agent')
    return next()
  }

  return {
    require,
    requireAgent,
    /** Whether a session cookie value opens this memory. The pages ask before they render. */
    isSession,
    /** Checks a typed token and opens a session. */
    signIn(c: Context, typed: string): boolean {
      if (!same(sha256(typed), tokenHash)) return false
      setCookie(c, SESSION_COOKIE, sessionValue, {
        httpOnly: true,
        sameSite: 'Strict',
        secure: new URL(c.req.url).protocol === 'https:' || c.req.header('X-Forwarded-Proto') === 'https',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60,
      })
      return true
    },
    signOut(c: Context) {
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
    },
  }
}
