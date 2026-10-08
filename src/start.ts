import { createMiddleware, createStart } from '@tanstack/react-start'

/**
 * Headers on every page and every /api answer. DENY matters most: the page writes, so no
 * other site may frame it and steer its clicks.
 */
const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next()
  result.response.headers.set('X-Content-Type-Options', 'nosniff')
  result.response.headers.set('Referrer-Policy', 'no-referrer')
  result.response.headers.set('X-Frame-Options', 'DENY')
  return result
})

export const startInstance = createStart(() => ({ requestMiddleware: [securityHeaders] }))
