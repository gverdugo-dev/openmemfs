import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TabProps, WebModule } from '#/lib/module'
import { joinFrontmatter, type Property, readProperties, splitFrontmatter, type Value } from './frontmatter'

const AUTOSAVE_MS = 700
const MODE_KEY = 'content-mode'
const SOFT_BREAKS = 'openmemfs-soft-breaks'

type Mode = 'visual' | 'markdown'

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'visual'
  } catch {
    return 'visual'
  }
}

/**
 * Content: the file as a Notion-style document, or as its Markdown. The file stays markdown:
 * TipTap reads the body and writes it back with @tiptap/markdown, and the frontmatter is shown
 * as properties and kept as written, so an agent reads and writes the same text through the API
 * without ever going through the editor.
 */
function ContentTab({ file, write }: TabProps) {
  const [mode, setMode] = useState<Mode>('visual')
  useEffect(() => setMode(loadMode()), [])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What was last sent, and what is on screen and not sent yet.
  const saved = useRef(file.content)
  const pending = useRef<string | null>(null)

  function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next === null || next === saved.current) return
    saved.current = next
    void write({ content: next })
  }

  function change(next: string) {
    pending.current = next
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, AUTOSAVE_MS)
  }

  const current = () => pending.current ?? saved.current

  function switchTo(next: Mode) {
    if (next === mode) return
    flush()
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // Not remembered, still switched.
    }
  }

  // Save what is pending when the tab closes, the page hides or the person presses Cmd+S.
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        flushRef.current()
      }
    }
    const onHide = () => document.visibilityState === 'hidden' && flushRef.current()
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onHide)
      flushRef.current()
    }
  }, [])

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        <CopyButton text={current} />
        <ModeSwitch mode={mode} onChange={switchTo} />
      </div>
      {mode === 'visual' ? (
        <Visual
          initial={current()}
          onChange={change}
          onEditProperties={() => switchTo('markdown')}
        />
      ) : (
        <Raw initial={current()} onChange={change} />
      )}
    </div>
  )
}

/** The properties of the frontmatter above the document, and the body in TipTap. */
function Visual({ initial, onChange, onEditProperties }: { initial: string; onChange: (text: string) => void; onEditProperties: () => void }) {
  const [split] = useState(() => splitFrontmatter(initial))
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: split.body,
    contentType: 'markdown',
    immediatelyRender: true,
    editorProps: { attributes: { class: 'prose-openmemfs min-h-[50vh]', 'aria-label': 'Content' } },
    // A line break inside a paragraph is a soft break in Markdown, read as a space; ProseMirror
    // would draw it as a new line. It is joined on screen only, and saved only after an edit.
    onCreate: ({ editor }) => {
      const tr = editor.state.tr
      editor.state.doc.descendants((node, pos, parent) => {
        if (node.isText && node.text?.includes('\n') && !parent?.type.spec.code) {
          const text = editor.schema.text(node.text.replace(/[ \t]*\n[ \t]*/g, ' '), node.marks)
          tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), text)
        }
      })
      if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta(SOFT_BREAKS, true))
    },
    onUpdate: ({ editor, transaction }) => {
      if (transaction.getMeta(SOFT_BREAKS)) return
      onChange(joinFrontmatter({ frontmatter: split.frontmatter, body: editor.getMarkdown() }))
    },
  })
  return (
    <>
      {split.frontmatter !== null && <Properties yaml={split.frontmatter} onEdit={onEditProperties} />}
      <EditorContent editor={editor} />
    </>
  )
}

/** The file as it is stored: frontmatter and Markdown, in a monospace field that grows with it. */
function Raw({ initial, onChange }: { initial: string; onChange: (text: string) => void }) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 4}px`
  }, [text])
  return (
    <textarea
      ref={ref}
      aria-label="Markdown"
      spellCheck={false}
      className="block min-h-[50vh] w-full resize-none rounded-md border-2 border-line bg-wash p-4 font-mono text-[13.5px] leading-relaxed text-ink outline-none focus:border-ink"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(e.target.value)
      }}
      onKeyDown={(e) => {
        // Tab indents instead of leaving the field; Escape leaves it.
        if (e.key !== 'Tab' || e.shiftKey) return
        e.preventDefault()
        const el = e.currentTarget
        const { selectionStart: start, selectionEnd: end } = el
        const next = `${text.slice(0, start)}  ${text.slice(end)}`
        setText(next)
        onChange(next)
        requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
      }}
    />
  )
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

/** A date written by an agent, shown in the reader's own words, with the exact text on hover. */
function DateText({ text }: { text: string }) {
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return <>{text}</>
  const dateOnly = text.length === 10
  return (
    <time dateTime={text} title={text}>
      {date.toLocaleString(undefined, dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' })}
    </time>
  )
}

function Scalar({ name, text }: { name: string; text: string }) {
  if (!text) return <span className="text-ink-3">Empty</span>
  if (ISO_DATE.test(text)) return <DateText text={text} />
  if (/^https?:\/\//.test(text)) {
    return (
      <a href={text} target="_blank" rel="noreferrer" className="break-all underline decoration-line-strong underline-offset-2 hover:decoration-ink">
        {text}
      </a>
    )
  }
  if (name === 'type') return <span className="chip chip-on">{text}</span>
  if (name === 'status') return <span className="chip">{text}</span>
  if (text.includes('\n')) return <pre className="font-mono text-[12.5px] whitespace-pre-wrap text-ink-2">{text}</pre>
  return <>{text}</>
}

function ValueView({ name, value }: { name: string; value: Value }): ReactNode {
  if (typeof value === 'string') return <Scalar name={name} text={value} />
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3">Empty</span>
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((item) => (
          <span key={item} className="chip chip-muted">
            {item}
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {Object.entries(value).map(([key, text]) => (
        <span key={key}>
          <span className="text-ink-3">{key} </span>
          <Scalar name={key} text={text} />
        </span>
      ))}
    </span>
  )
}

/**
 * The frontmatter as a table of properties, like a Notion page's. The title and description
 * lead, the rest follow in the file's order. Editing goes to the Markdown view, where the YAML
 * is changed as text, so nothing is rewritten that the person did not touch.
 */
function Properties({ yaml, onEdit }: { yaml: string; onEdit: () => void }) {
  const properties: Property[] = readProperties(yaml)
  const [open, setOpen] = useState(true)
  return (
    <section aria-label="Properties" className="mb-6 border-y border-line py-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1.5 py-1 text-xs font-bold tracking-wide text-ink-3 uppercase hover:text-ink"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`}>
            <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Properties
          <span className="font-medium normal-case tracking-normal">· {properties.length}</span>
        </button>
        <button type="button" className="btn btn-ghost h-7 px-2 text-xs" onClick={onEdit} title="Edit the frontmatter in the Markdown view">
          Edit
        </button>
      </div>
      {open && (
        <dl className="mt-1 grid grid-cols-[minmax(6rem,9rem)_1fr] gap-x-4 text-sm">
          {properties.map(({ key, value }) => (
            <div key={key} className="contents">
              <dt className="truncate py-1.5 font-mono text-[12.5px] text-ink-3" title={key}>
                {key}
              </dt>
              <dd className={`min-w-0 py-1.5 text-ink ${key === 'title' ? 'font-bold' : ''}`}>
                <ValueView name={key} value={value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

/** Visual or Markdown, the same control as the folder page's Blocks or List. */
function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const option = (value: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => onChange(value)}
      className={`h-8 px-3 text-xs font-bold uppercase ${mode === value ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-hover'}`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex overflow-hidden rounded-md border-2 border-ink" role="group" aria-label="View">
      {option('visual', 'Visual')}
      {option('markdown', 'Markdown')}
    </div>
  )
}

/** Copies the whole file as it is stored, frontmatter included. */
function CopyButton({ text }: { text: () => string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1600)
    return () => clearTimeout(t)
  }, [state])
  return (
    <button
      type="button"
      className="btn btn-outline h-8 px-3 text-xs"
      aria-live="polite"
      onClick={() =>
        navigator.clipboard.writeText(text()).then(
          () => setState('copied'),
          () => setState('failed'),
        )
      }
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy file'}
    </button>
  )
}

export const content: WebModule = {
  id: 'content',
  tabs: [{ id: 'content', label: 'Content', order: 10, Component: ContentTab }],
}
