import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { DomainError } from './errors'
import type { Services } from './services'
import { COLORS } from './services/shared'

const INSTRUCTIONS = `A memory made of text files (mostly Markdown) that a person also reads and edits in a
Notion-style editor. Paths are absolute, like /notes/today.md; a folder exists while some file is in
it, or because it was created empty (create_folder). Look before writing: list_files to find what exists, then
read_file. Prefer edit_file over rewriting a whole file. Pass if_revision (from read_file) when
you write over something you read, so you never overwrite a change the person just made.
Metadata is a JSON object per file for your own notes. Files can carry tags (on the file or
on a folder above it) and one category or subcategory; list_files filters by both.`

/** The answer of a tool: the result as JSON, or the message of a domain error. */
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }

/**
 * Registers one MCP tool that calls one service. Every tool of the core and of the modules
 * goes through here, so they all answer the same way: JSON on success, the error message
 * (written for a model) on a domain error, "internal error" on anything else.
 */
export function tool<Shape extends z.ZodRawShape>(
  mcp: McpServer,
  name: string,
  description: string,
  shape: Shape,
  run: (input: z.infer<z.ZodObject<Shape>>) => Promise<unknown>,
) {
  const handler = async (input: z.infer<z.ZodObject<Shape>>): Promise<Result> => {
    try {
      const result = await run(input)
      return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }, null, 2) }] }
    } catch (error) {
      if (error instanceof DomainError) return { isError: true, content: [{ type: 'text', text: error.message }] }
      console.error(`mcp ${name}:`, error)
      return { isError: true, content: [{ type: 'text', text: 'internal error' }] }
    }
  }
  mcp.registerTool(name, { description, inputSchema: shape }, handler as never)
}

/** The file a tool acts on: by path (what agents usually know) or by id. */
export const fileRef = {
  path: z.string().optional().describe('absolute path, like /notes/today.md'),
  id: z.string().optional().describe('the file id, instead of the path'),
}

const color = z.enum(COLORS).optional().describe('a colour for the interface; one is picked from the name when left out')

const ifRevision = z.number().int().optional().describe('write only if the file is still at this revision')

/** The core tools: the twin of every route in `api.ts`. Agents always write as `agent`. */
export function coreTools(mcp: McpServer, { files, folders, tags, categories }: Services) {
  const agent = { author: 'agent' as const }

  tool(
    mcp,
    'list_files',
    'List files, without their content. Every argument narrows the list: a folder, a text to find in the file name or the content, tags the file must all carry, a category (which includes its subcategories).',
    {
      folder: z.string().optional().describe('only files under this folder, like /notes/'),
      query: z.string().optional().describe('text to find, ignoring case'),
      in: z.enum(['name', 'content', 'all']).optional().describe('where to find it; both by default'),
      tags: z.array(z.string()).optional().describe('tag names the file must all carry'),
      category_id: z.string().optional().describe('a category or subcategory id, from list_categories'),
    },
    (i) => files.search({ prefix: i.folder, query: i.query, in: i.in, tags: i.tags, categoryId: i.category_id }),
  )
  tool(mcp, 'read_file', 'Read a file: content, metadata, revision, category and tags.', fileRef, (i) => files.find(i))
  tool(
    mcp,
    'create_file',
    'Create a file. Its folders need no creating. Fails if the path is taken.',
    {
      path: z.string().describe('absolute path, like /notes/today.md'),
      content: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional().describe('a JSON object for your own notes'),
    },
    (i) => files.create(i, agent),
  )
  tool(
    mcp,
    'update_file',
    'Rename or move a file (new_path), or replace its whole content or metadata. Fields left out stay as they are.',
    {
      ...fileRef,
      new_path: z.string().optional(),
      content: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      if_revision: ifRevision,
    },
    async (i) => {
      const file = await files.find(i)
      return files.update(
        file.id,
        { path: i.new_path, content: i.content, metadata: i.metadata, ifRevision: i.if_revision },
        agent,
      )
    },
  )
  tool(
    mcp,
    'edit_file',
    'Replace one exact piece of a file content with another. old_string must appear exactly once.',
    { ...fileRef, old_string: z.string(), new_string: z.string(), if_revision: ifRevision },
    async (i) => {
      const file = await files.find(i)
      return files.edit(file.id, { oldString: i.old_string, newString: i.new_string, ifRevision: i.if_revision }, agent)
    },
  )
  tool(mcp, 'delete_file', 'Delete a file, with its history and its tags.', fileRef, async (i) => {
    await files.remove((await files.find(i)).id)
  })

  tool(mcp, 'list_folders', 'List every folder, empty ones included, like /notes/.', {}, () => folders.list())
  tool(
    mcp,
    'create_folder',
    'Create an empty folder, like /notes/ideas/. Not needed before writing a file: its folders exist with it.',
    { path: z.string() },
    async (i) => ({ path: await folders.create(i.path) }),
  )
  tool(
    mcp,
    'move_folder',
    'Move or rename a folder with everything in it, like /notes/old/ to /archive/old/. The destination must be free.',
    { from: z.string(), to: z.string() },
    async (i) => ({ path: await files.moveFolder(i.from, i.to, agent) }),
  )
  tool(mcp, 'delete_folder', 'Delete an empty folder. A folder with files keeps them: delete or move them first.', { path: z.string() }, (i) =>
    folders.remove(i.path),
  )
  tool(
    mcp,
    'set_file_category',
    'Put a file in a category or subcategory, or take it out of any with null.',
    { ...fileRef, category_id: z.string().nullable() },
    async (i) => files.setCategory((await files.find(i)).id, i.category_id),
  )
  tool(
    mcp,
    'tag_file',
    'Put a tag on a file. The tag is created if it does not exist.',
    { ...fileRef, tag: z.string() },
    async (i) => {
      const file = await files.find(i)
      await tags.tagFile(file.id, i.tag)
      return files.get(file.id)
    },
  )
  tool(mcp, 'untag_file', 'Take a tag off a file.', { ...fileRef, tag: z.string() }, async (i) => {
    const file = await files.find(i)
    await tags.untagFile(file.id, i.tag)
    return files.get(file.id)
  })
  tool(
    mcp,
    'tag_folder',
    'Put a tag on a folder: every file under it carries it when filtering. Creates the tag if needed.',
    { folder: z.string().describe('like /notes/'), tag: z.string() },
    (i) => tags.tagFolder(i.folder, i.tag),
  )
  tool(mcp, 'untag_folder', 'Take a tag off a folder.', { folder: z.string(), tag: z.string() }, (i) =>
    tags.untagFolder(i.folder, i.tag),
  )

  tool(mcp, 'list_tags', 'List every tag, with its colour, how many files and which folders carry it.', {}, () => tags.list())
  tool(mcp, 'create_tag', 'Create a tag, with a colour.', { name: z.string(), color }, (i) => tags.create(i.name, i.color))
  tool(
    mcp,
    'update_tag',
    'Rename a tag everywhere it is used, change its colour, or both.',
    { name: z.string(), new_name: z.string().optional(), color },
    (i) => tags.update(i.name, { name: i.new_name, color: i.color }),
  )
  tool(mcp, 'delete_tag', 'Delete a tag and take it off every file and folder.', { name: z.string() }, (i) =>
    tags.remove(i.name),
  )

  tool(
    mcp,
    'list_categories',
    'List the categories and subcategories (a subcategory has a parent_id), with their colour and how many files each has.',
    {},
    () => categories.list(),
  )
  tool(
    mcp,
    'create_category',
    'Create a category, or a subcategory when parent_id names a category. Two levels at most. Each has its own colour.',
    { name: z.string(), parent_id: z.string().optional(), color },
    (i) => categories.create({ name: i.name, parentId: i.parent_id, color: i.color }),
  )
  tool(
    mcp,
    'update_category',
    'Rename a category or subcategory, change its colour, or both.',
    { id: z.string(), name: z.string().optional(), color },
    (i) => categories.update(i.id, { name: i.name, color: i.color }),
  )
  tool(
    mcp,
    'delete_category',
    'Delete a category with its subcategories. Their files stay, without a category.',
    { id: z.string() },
    (i) => categories.remove(i.id),
  )
}

/**
 * Serves MCP over Streamable HTTP, without sessions: every request builds its server and
 * answers on its own, so it works the same on any instance behind a load balancer.
 */
export function createMcpHandler(register: (mcp: McpServer) => void) {
  return async (request: Request): Promise<Response> => {
    const mcp = new McpServer({ name: 'openmemfs', version: '0.1.0' }, { instructions: INSTRUCTIONS })
    register(mcp)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await mcp.connect(transport)
    return transport.handleRequest(request)
  }
}
