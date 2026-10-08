import { invalid } from './errors'

/** Reads a JSON object body. An empty body reads as `{}`; anything else that is not an object is a 400. */
export async function body<T extends object>(request: Request): Promise<T> {
  const text = await request.text()
  if (text.trim() === '') return {} as T
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw invalid('the body must be JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid('the body must be a JSON object')
  return value as T
}
