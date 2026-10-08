import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { folders } from '#/lib/api'
import { folderTagsQuery, searchQuery } from '#/lib/queries'
import { FileList } from './FileList'
import { NewFile } from './NewFile'
import { Page } from './Page'
import { TagEditor } from './Tags'

/** A folder: its tags (every file under it carries them when filtering) and its files. */
export function FolderPage({ folder }: { folder: string }) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const { data: tags = [] } = useQuery(folderTagsQuery(folder))
  const { data: entries } = useQuery(searchQuery({ prefix: folder }))

  async function change(action: () => Promise<unknown>) {
    await action()
    await Promise.all([
      queryClient.invalidateQueries(folderTagsQuery(folder)),
      queryClient.invalidateQueries({ queryKey: ['files'] }),
      queryClient.invalidateQueries({ queryKey: ['tags'] }),
    ])
  }

  const segments = folder.slice(1, -1).split('/')

  return (
    <Page>
      <p className="truncate font-mono text-xs text-ink-3">/{segments.slice(0, -1).map((s) => `${s}/`).join('')}</p>
      <h1 className="mt-2 text-4xl md:text-5xl">{segments.at(-1)}</h1>

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-ink-3 uppercase">Folder tags</p>
        <TagEditor
          tags={tags}
          onAdd={(tag) => change(() => folders.tag(folder, tag))}
          onRemove={(tag) => change(() => folders.untag(folder, tag))}
        />
        <p className="mt-2 text-xs text-ink-3">Every file in this folder and below carries these tags when you filter.</p>
      </div>

      <div className="mt-10 mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-3 uppercase">Files</p>
        <button type="button" className="btn btn-outline h-8 px-3" onClick={() => setCreating(true)}>
          New file here
        </button>
      </div>
      {creating && <NewFile folder={folder} onClose={() => setCreating(false)} />}
      {entries && <FileList entries={entries} empty="No files." />}
    </Page>
  )
}
