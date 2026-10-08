import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { type Category, categories, tags } from '#/lib/api'
import { categoriesQuery, tagsQuery } from '#/lib/queries'
import { Page } from './Page'

/** Tags and categories in one place: create, rename and delete them. */
export function Organize() {
  const queryClient = useQueryClient()
  const { data: tagList = [] } = useQuery(tagsQuery)
  const { data: categoryList = [] } = useQuery(categoriesQuery)
  const [error, setError] = useState('')

  async function run(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
      return
    }
    // A rename or a delete changes what every file shows.
    await Promise.all(
      [['tags'], ['categories'], ['files'], ['file'], ['folder-tags']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  }

  const top = categoryList.filter((c) => !c.parent_id)

  return (
    <Page>
      <h1 className="text-4xl md:text-5xl">Tags & categories</h1>
      {error && <p className="mt-4 rounded-lg border-2 border-black bg-wash px-4 py-3 text-sm text-black">{error}</p>}

      <section className="mt-10">
        <h2 className="text-2xl">Categories</h2>
        <p className="mt-1 text-sm text-ink-2">A file is in one category or subcategory. Deleting one leaves its files without it.</p>
        <AddForm label="New category" onAdd={(name) => run(() => categories.create(name))} />
        <ul className="mt-4 border-t border-line">
          {top.map((category) => (
            <li key={category.id} className="border-b border-line">
              <CategoryRow category={category} run={run} />
              <ul className="pb-2 pl-6">
                {categoryList
                  .filter((c) => c.parent_id === category.id)
                  .map((sub) => (
                    <li key={sub.id}>
                      <CategoryRow category={sub} run={run} />
                    </li>
                  ))}
                <li>
                  <AddForm
                    label={`New subcategory of ${category.name}`}
                    small
                    onAdd={(name) => run(() => categories.create(name, category.id))}
                  />
                </li>
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 pb-24">
        <h2 className="text-2xl">Tags</h2>
        <p className="mt-1 text-sm text-ink-2">A file carries its own tags and the tags of its folders. Renaming a tag renames it everywhere.</p>
        <AddForm label="New tag" onAdd={(name) => run(() => tags.create(name))} />
        <ul className="mt-4 border-t border-line">
          {tagList.map((tag) => (
            <li key={tag.id} className="border-b border-line">
              <EditableRow
                name={tag.name}
                detail={[`${tag.files} ${tag.files === 1 ? 'file' : 'files'}`, ...tag.folders].join(' · ')}
                link={{ view: 'search', tag: [tag.name] }}
                onRename={(name) => run(() => tags.rename(tag.name, name))}
                onDelete={() =>
                  window.confirm(`Delete the tag ${tag.name}? It comes off every file and folder.`) &&
                  void run(() => tags.remove(tag.name))
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}

type Run = (action: () => Promise<unknown>) => Promise<void>

function CategoryRow({ category, run }: { category: Category; run: Run }) {
  return (
    <EditableRow
      name={category.name}
      detail={`${category.files} ${category.files === 1 ? 'file' : 'files'}`}
      link={{ view: 'search', category: category.id }}
      onRename={(name) => run(() => categories.rename(category.id, name))}
      onDelete={() =>
        window.confirm(
          `Delete ${category.name}${category.parent_id ? '' : ' and its subcategories'}? Their files stay, without a category.`,
        ) && void run(() => categories.remove(category.id))
      }
    />
  )
}

interface RowProps {
  name: string
  detail: string
  link: { view: 'search'; tag?: string[]; category?: string }
  onRename: (name: string) => Promise<void>
  onDelete: () => void
}

/** A name that turns into a field to rename it, how many files use it, and delete. */
function EditableRow({ name, detail, link, onRename, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim() && value.trim() !== name) await onRename(value.trim())
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {editing ? (
        <form onSubmit={submit} className="flex flex-1 gap-2">
          <input
            aria-label={`New name for ${name}`}
            className="field h-8 flex-1 py-0"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          />
          <button type="submit" className="btn btn-primary h-8 px-3">
            Save
          </button>
        </form>
      ) : (
        <>
          <Link to="/" search={link} className="font-medium text-black hover:underline">
            {name}
          </Link>
          <span className="flex-1 truncate text-xs text-ink-3">{detail}</span>
          <button
            type="button"
            className="btn btn-ghost h-8 px-2 text-xs"
            onClick={() => {
              setValue(name)
              setEditing(true)
            }}
          >
            Rename
          </button>
          <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={onDelete}>
            Delete
          </button>
        </>
      )}
    </div>
  )
}

/** One field and a button that creates something by name. */
function AddForm({ label, onAdd, small = false }: { label: string; onAdd: (name: string) => Promise<void>; small?: boolean }) {
  const [value, setValue] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim()) return
    await onAdd(value.trim())
    setValue('')
  }
  return (
    <form onSubmit={submit} className={`flex gap-2 ${small ? 'py-1' : 'mt-4'}`}>
      <input
        aria-label={label}
        className={`field flex-1 ${small ? 'h-8 py-0 text-sm' : ''}`}
        placeholder={small ? '+ subcategory' : label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className={`btn btn-outline ${small ? 'h-8 px-2 text-xs' : ''}`}>
        Add
      </button>
    </form>
  )
}
