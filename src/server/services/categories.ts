import { type Sql, type Tables, tablesOf } from '../db'
import { DomainError, invalid, notFound } from '../errors'
import { type Color, checkColor, checkId, checkName, colorFor, isUniqueViolation } from './shared'

export interface Category {
  id: string
  name: string
  color: Color
  /** The category it belongs to, when it is a subcategory. */
  parent_id: string | null
  /** How many files are in it directly (a category does not count its subcategories' files). */
  files: number
}

export interface CreateCategory {
  name: string
  /** Makes it a subcategory of this category. */
  parentId?: string | null
  /** One of the palette; without it, one taken from the name. */
  color?: unknown
}

export type Categories = ReturnType<typeof createCategories>

/**
 * Categories and subcategories: two levels, no more. A file is put in one with
 * `files.setCategory`; filtering by a category also finds the files of its subcategories.
 */
export function createCategories(sql: Sql, tb: Tables = tablesOf(sql)) {
  const categories = {
    /** Every category, each followed by its subcategories, by name. */
    async list(): Promise<Category[]> {
      return sql<Category[]>`
        select c.id, c.name, c.color, c.parent_id,
          (select count(*)::int from ${tb.files} f where f.category_id = c.id and f.deleted_at is null) as files
        from ${tb.categories} c
        left join ${tb.categories} p on p.id = c.parent_id
        order by lower(coalesce(p.name, c.name)), c.parent_id is not null, lower(c.name)`
    },

    async get(id: string): Promise<Category> {
      checkId(id, 'category')
      const found = (await categories.list()).find((c) => c.id === id)
      if (!found) throw notFound(`no category with id ${id}`)
      return found
    },

    async create(input: CreateCategory): Promise<Category> {
      const name = checkName(input.name, 'category')
      const parentId = input.parentId ?? null
      if (parentId !== null) {
        const parent = await categories.get(parentId)
        if (parent.parent_id !== null) {
          throw invalid(`${parent.name} is a subcategory: a subcategory cannot have subcategories`)
        }
      }
      const color = input.color === undefined || input.color === null ? colorFor(name) : checkColor(input.color)
      const [row] = await sql<{ id: string }[]>`
        insert into ${tb.categories} (name, parent_id, color) values (${name}, ${parentId}, ${color}) returning id`.catch(clash(name))
      return categories.get(row!.id)
    },

    /** Renames a category, changes its colour, or both. What is left out stays. */
    async update(id: string, change: { name?: unknown; color?: unknown }): Promise<Category> {
      const current = await categories.get(id)
      const name = change.name === undefined || change.name === null ? current.name : checkName(change.name, 'category')
      const color = change.color === undefined || change.color === null ? current.color : checkColor(change.color)
      await sql`update ${tb.categories} set name = ${name}, color = ${color} where id = ${id}`.catch(clash(name))
      return categories.get(id)
    },

    /** Deletes it with its subcategories. Their files stay, without a category. */
    async remove(id: string): Promise<void> {
      const deleted = await sql`delete from ${tb.categories} where id = ${checkId(id, 'category')} returning id`
      if (deleted.length === 0) throw notFound(`no category with id ${id}`)
    },
  }
  return categories
}

function clash(name: string) {
  return (error: unknown): never => {
    if (isUniqueViolation(error)) throw new DomainError('conflict', `there is already a category called ${name} there`)
    throw error
  }
}
