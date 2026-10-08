import { useEffect, useState } from 'react'
import type { Metadata } from '#/lib/api'
import type { TabProps, WebModule } from '#/lib/module'

const pretty = (metadata: Metadata) => JSON.stringify(metadata, null, 2)

/**
 * Metadata: a JSON object kept next to the content. It is where an agent writes for itself
 * about the file (what it is, what is left to do, when it last checked it). Saved on
 * demand, never while typing, because half-typed JSON is not JSON.
 */
function MetadataTab({ file, write }: TabProps) {
  const [text, setText] = useState(() => pretty(file.metadata))
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  // A write from elsewhere shows up here, unless there is an edit in progress.
  useEffect(() => {
    if (!dirty) setText(pretty(file.metadata))
  }, [file.metadata, dirty])

  async function save() {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setError(`Not valid JSON: ${(e as Error).message}`)
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError('Metadata must be a JSON object: { … }')
      return
    }
    setError('')
    const written = await write({ metadata: parsed as Metadata })
    if (written) {
      setDirty(false)
      setText(pretty(written.metadata))
    }
  }

  return (
    <div>
      <p className="text-sm text-ink-2">
        Notes about this file as a JSON object. Agents write here for themselves; the content stays for people.
      </p>
      <textarea
        aria-label="Metadata"
        spellCheck={false}
        className="field mt-4 min-h-80 resize-y font-mono text-[13.5px] leading-relaxed"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setDirty(true)
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault()
            void save()
          }
        }}
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => void save()}>
          Save metadata
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setText(pretty(file.metadata))
              setDirty(false)
              setError('')
            }}
          >
            Discard
          </button>
        )}
      </div>
    </div>
  )
}

export const metadata: WebModule = {
  id: 'metadata',
  tabs: [{ id: 'metadata', label: 'Metadata', order: 20, Component: MetadataTab }],
}
