import type { Sql } from '../db'
import { DomainError, invalid, notFound } from '../errors'
import { checkId, checkName, isUniqueViolation } from './shared'

export interface Category {
  id: string
  name: string
  /** The category it belongs to, when it is a subcategory. */
  parent_id: string | null
  /** How many files are in it directly (a category does not count its subcategories' files). */
  files: number
}

export interface CreateCategory {
  name: string
  /** Makes it a subcategory of this category. */
  parentId?: string | null
}

export type Categories = ReturnType<typeof createCategories>

/**
 * Categories and subcategories: two levels, no more. A file is put in one with
 * `files.setCategory`; filtering by a category also finds the files of its subcategories.
 */
export function createCategories(sql: Sql) {
  const categories = {
    /** Every category, each followed by its subcategories, by name. */
    async list(): Promise<Category[]> {
      return sql<Category[]>`
        select c.id, c.name, c.parent_id,
          (select count(*)::int from files f where f.category_id = c.id) as files
        from categories c
        left join categories p on p.id = c.parent_id
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
      const [row] = await sql<{ id: string }[]>`
        insert into categories (name, parent_id) values (${name}, ${parentId}) returning id`.catch(clash(name))
      return categories.get(row!.id)
    },

    async rename(id: string, name: string): Promise<Category> {
      checkId(id, 'category')
      const checked = checkName(name, 'category')
      const updated = await sql`update categories set name = ${checked} where id = ${id} returning id`.catch(clash(checked))
      if (updated.length === 0) throw notFound(`no category with id ${id}`)
      return categories.get(id)
    },

    /** Deletes it with its subcategories. Their files stay, without a category. */
    async remove(id: string): Promise<void> {
      const deleted = await sql`delete from categories where id = ${checkId(id, 'category')} returning id`
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
