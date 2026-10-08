import type { ComponentType } from 'react'
import type { FileData, Metadata } from './api'

export interface WritePatch {
  content?: string
  metadata?: Metadata
  /** Keep this write as a version of its own in the history. */
  checkpoint?: boolean
}

export interface TabProps {
  file: FileData
  /**
   * Writes to the open file, one write at a time and only over the revision on screen.
   * Resolves to the file as written, or to null when it was not written (a conflict or an
   * error, which the page already shows).
   */
  write: (patch: WritePatch) => Promise<FileData | null>
  /** Puts a file the tab got from the server (a restore, say) on screen in every tab. */
  replace: (file: FileData) => void
}

/** A tab on the page of a file, next to Content and History. */
export interface FileTab {
  /** Unique; it goes in the URL as `?tab=`. */
  id: string
  label: string
  /** Tabs are sorted by it. Content is 10, History 30. */
  order: number
  /** Show the tab only for the files this returns true for, e.g. `metadata.category === 'linkedin'`. */
  when?: (file: FileData) => boolean
  Component: ComponentType<TabProps>
}

/** A page of its own, linked from the sidebar and opened as `?page=<id>`. */
export interface ModulePage {
  id: string
  label: string
  Component: ComponentType
}

/** The front side of a module. Listed in `modules/web.ts`, with the same id as its server side. */
export interface WebModule {
  id: string
  tabs?: FileTab[]
  pages?: ModulePage[]
}
