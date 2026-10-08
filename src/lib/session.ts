import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { SESSION_COOKIE } from '#/server/auth'
import { getServer } from '#/server/instance'

/** Whether this browser has signed in. Pages ask it before they render. */
export const isSignedIn = createServerFn({ method: 'GET' }).handler(async () =>
  (await getServer()).auth.isSession(getCookie(SESSION_COOKIE)),
)
