import { caller, runAs } from '../caller'
import { type Files, ORGANISATION_PATH } from './files'
import { ORGANISATION_TEMPLATE } from './organisation-template'

export interface Organisation {
  path: string
  /** The rules, as the owner left them. */
  content: string
  revision: number
  /** The server's clock, for the timestamps an agent writes: it has no clock of its own. */
  now: string
  /** True when the file did not exist and was just written from the template. */
  seeded: boolean
}

/**
 * The rules of the memory live in the memory, at `/organisation.md`, so every harness reads the
 * same ones and the owner changes them like any file. It always exists: whoever asks first
 * writes it from the template, and `files` refuses to move or delete it.
 */
export function createOrganisation(files: Files) {
  async function read(): Promise<Organisation> {
    const now = new Date().toISOString()
    const found = await files.getByPath(ORGANISATION_PATH).catch(() => null)
    if (found) return { path: found.path, content: found.content, revision: found.revision, now, seeded: false }
    const file = await files
      .create({ path: ORGANISATION_PATH, content: ORGANISATION_TEMPLATE.replace('{{now}}', now) }, { author: 'agent' })
      // Two first readers at once: the other one wrote it.
      .catch(() => files.getByPath(ORGANISATION_PATH))
    return { path: file.path, content: file.content, revision: file.revision, now, seeded: true }
  }

  const organisation = {
    /** Everyone reads the rules, whatever folders they reach. */
    get(): Promise<Organisation> {
      return runAs({ ...caller(), reach: null }, read)
    },
  }
  return organisation
}
