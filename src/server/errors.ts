/**
 * The only errors a caller may see. Anything else is internal: it is logged and the caller
 * gets "internal error". The HTTP status of each code lives in `statusOf`.
 */
export type ErrorCode = 'invalid' | 'not_found' | 'conflict' | 'stale'

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export function statusOf(code: ErrorCode): 400 | 404 | 409 {
  switch (code) {
    case 'invalid':
      return 400
    case 'not_found':
      return 404
    case 'conflict':
    case 'stale':
      return 409
  }
}

export const invalid = (message: string) => new DomainError('invalid', message)
export const notFound = (message: string) => new DomainError('not_found', message)
