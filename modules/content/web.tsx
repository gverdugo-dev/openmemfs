import { Markdown } from '@tiptap/markdown'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import type { TabProps, WebModule } from '../../web/module'

const AUTOSAVE_MS = 700

/**
 * Content: the file as a Notion-style document. The file stays markdown: TipTap reads it
 * and writes it back with @tiptap/markdown, so an agent reads and writes the same text
 * through the API without ever going through the editor.
 */
function ContentTab({ file, write }: TabProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saved = useRef(file.content)

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: file.content,
    contentType: 'markdown',
    immediatelyRender: true,
    editorProps: { attributes: { class: 'prose-openmemfs min-h-[50vh]', 'aria-label': 'Content' } },
    onUpdate: () => schedule(),
  })

  function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!editor) return
    const markdown = editor.getMarkdown()
    if (markdown === saved.current) return
    saved.current = markdown
    void write({ content: markdown })
  }

  function schedule() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, AUTOSAVE_MS)
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

  return <EditorContent editor={editor} />
}

export const content: WebModule = {
  id: 'content',
  tabs: [{ id: 'content', label: 'Content', order: 10, Component: ContentTab }],
}
