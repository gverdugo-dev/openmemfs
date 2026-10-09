import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { caller } from './caller'
import { DomainError } from './errors'
import type { Services } from './services'
import { SEARCH_IN } from './services'
import { COLORS } from './services/shared'

const INSTRUCTIONS = `Call get_organisation before anything else: it returns /organisation.md, the owner's
rules for this memory (where things go, how files are named and labelled in the Open Knowledge
Format), and the current time. Those rules win over your habits.

A memory made of text files (mostly Markdown) that a person also reads and edits in a
Notion-style editor. Paths are absolute, like /notes/today.md; a folder exists while some file is in
it, or because it was created empty (create_folder).

Find your way: get_tree shows the folders with how many files each holds, list_folder what one
folder holds, and search_files finds files by the words in their path or content (with a snippet).
Search before writing: a second file on a subject that already has one is the mistake to avoid.

Read with read_file (offset and limit read a long file a piece at a time). Prefer edit_file to
rewriting a whole file, append_file to add at the end, and write_file to create or replace one.
Pass if_revision (from read_file) when you write over something you read, so you never overwrite
a change the person just made. Metadata is a JSON object per file for your own notes. Files can
carry tags (on the file or on a folder above it) and one category or subcategory; search_files
and list_files filter by both.

Every save leaves a version: list_changes says what changed since the last commit, get_diff shows
how, and commit_changes names those changes with a message when a piece of work is done.`

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
      console.error(`mcp ${name}: ${describe(error)}`)
      return { isError: true, content: [{ type: 'text', text: 'internal error' }] }
    }
  }
  mcp.registerTool(name, { description, inputSchema: shape, annotations: annotationsOf(name) }, handler as never)
}

/**
 * What a client may assume about a tool, read from its name: `list_`, `read_`, `get_` and
 * `search_` only read; `create_`, `tag_`, `commit_`, `restore_` and `append_` only add; anything else may change or
 * remove what is there. A module tool named otherwise gets that cautious default.
 */
function annotationsOf(name: string) {
  if (/^(list|read|get|search)_/.test(name)) return { readOnlyHint: true, openWorldHint: false }
  const removes = !/^(create|tag|commit|restore|append)_/.test(name)
  return { readOnlyHint: false, destructiveHint: removes, openWorldHint: false }
}

/** An error for the log: its class, its Postgres code if any, and its message. */
export function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as { code?: unknown }).code
  return `${error.name}${typeof code === 'string' ? ` ${code}` : ''}: ${error.message}`
}

/** The file a tool acts on: by path (what agents usually know) or by id. */
export const fileRef = {
  path: z.string().optional().describe('absolute path, like /notes/today.md'),
  id: z.string().optional().describe('the file id, instead of the path'),
}

const color = z.enum(COLORS).optional().describe('a colour for the interface; one is picked from the name when left out')

const ifRevision = z.number().int().optional().describe('write only if the file is still at this revision')

/** Who a tool writes as: `agent`, unless a module's middleware named the caller. */
export function writer() {
  return { author: caller().author }
}

/** The core tools: the twin of every route in `api.ts`. */
export function coreTools(mcp: McpServer, { files, folders, tags, categories, organisation }: Services) {

  tool(
    mcp,
    'get_organisation',
    "Call this first. Returns /organisation.md, the owner's rules for this memory (folders, names, Open Knowledge Format labels, how to work), and the current time to use in timestamps. Edit the file with edit_file to change the rules.",
    {},
    () => organisation.get(),
  )
  tool(
    mcp,
    'get_tree',
    'The layout of the memory: the folders under a folder, nested, each with how many files it holds at any depth. Start here to know where things are.',
    {
      folder: z.string().optional().describe('the folder to start from, like /notes/; the root by default'),
      depth: z.number().int().min(0).optional().describe('levels of folders to show; 0 or left out is every level'),
    },
    (i) => folders.tree(i.folder, i.depth),
  )
  tool(
    mcp,
    'list_folder',
    'What one folder holds: the folders right under it (with how many files each) and its own files, without their content.',
    {
      folder: z.string().optional().describe('like /notes/; the root by default'),
      with_metadata: z.boolean().optional().describe('give each file its metadata too'),
    },
    (i) => folders.contents(i.folder, { withMetadata: i.with_metadata }),
  )
  tool(
    mcp,
    'search_files',
    'Find files by words: every word of the query must appear, in any order, ignoring case. By default in the file name or the content; in: "path" also matches folder names, "content" only the text. Content hits carry a snippet. Narrow it by folder, tags or category.',
    {
      query: z.string().describe('the words to find'),
      folder: z.string().optional().describe('only files under this folder, like /notes/'),
      in: z.enum(SEARCH_IN).optional().describe('name, path (folders included), content, or all (name and content, the default)'),
      exact: z.boolean().optional().describe('find the query as one literal piece instead of word by word'),
      tags: z.array(z.string()).optional().describe('tag names the file must all carry'),
      category_id: z.string().optional().describe('a category or subcategory id, from list_categories'),
      limit: z.number().int().min(1).max(1000).optional().describe('at most this many files; 50 by default'),
      with_metadata: z.boolean().optional().describe('give each file its metadata too'),
    },
    (i) =>
      files.search({
        prefix: i.folder,
        query: i.query.trim() ? i.query : undefined,
        in: i.in,
        words: !i.exact,
        tags: i.tags,
        categoryId: i.category_id,
        limit: i.limit ?? 50,
        withMetadata: i.with_metadata,
      }),
  )
  tool(
    mcp,
    'list_files',
    'List files, without their content, everything under a folder at any depth. Every argument narrows the list: a folder, a text to find as one literal piece, tags the file must all carry, a category (which includes its subcategories). To find files by words, use search_files.',
    {
      folder: z.string().optional().describe('only files under this folder, like /notes/'),
      query: z.string().optional().describe('text to find, ignoring case'),
      in: z.enum(SEARCH_IN).optional().describe('where to find it: name, path, content, or all (name and content, the default)'),
      tags: z.array(z.string()).optional().describe('tag names the file must all carry'),
      category_id: z.string().optional().describe('a category or subcategory id, from list_categories'),
      limit: z.number().int().min(1).max(1000).optional().describe('at most this many files'),
      with_metadata: z.boolean().optional().describe('give each file its metadata too'),
    },
    (i) =>
      files.search({
        prefix: i.folder,
        query: i.query,
        in: i.in,
        tags: i.tags,
        categoryId: i.category_id,
        limit: i.limit,
        withMetadata: i.with_metadata,
      }),
  )
  tool(
    mcp,
    'read_file',
    'Read a file: content, metadata, revision, category and tags. offset (the first line, from 1) and limit read only some lines of a long file, and say how many it has in total_lines.',
    {
      ...fileRef,
      offset: z.number().int().min(1).optional().describe('the first line to read, from 1'),
      limit: z.number().int().min(1).optional().describe('how many lines to read'),
    },
    async (i) => files.lines(await files.find(i), { offset: i.offset, limit: i.limit }),
  )
  tool(
    mcp,
    'create_file',
    'Create a file. Its folders need no creating. Fails if the path is taken.',
    {
      path: z.string().describe('absolute path, like /notes/today.md'),
      content: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional().describe('a JSON object for your own notes'),
    },
    (i) => files.create(i, writer()),
  )
  tool(
    mcp,
    'write_file',
    'Write a whole file: create it at its path (its folders need no creating), or replace the content of the one there. Metadata, when given, replaces the old; left out, it stays. if_absent only creates; if_revision only replaces that revision.',
    {
      path: z.string().describe('absolute path, like /notes/today.md'),
      content: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional().describe('a JSON object for your own notes'),
      if_absent: z.boolean().optional().describe('only create; fail if the path is taken'),
      if_revision: ifRevision,
    },
    (i) =>
      files.write(
        { path: i.path, content: i.content, metadata: i.metadata, ifAbsent: i.if_absent, ifRevision: i.if_revision },
        writer(),
      ),
  )
  tool(
    mcp,
    'append_file',
    'Add text at the end of a file, creating it when missing. Nothing is put in between: start the text with a newline if it needs one. Safe while others write the same file.',
    { path: z.string().describe('absolute path, like /notes/log.md'), content: z.string() },
    (i) => files.append(i.path, i.content, writer()),
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
        writer(),
      )
    },
  )
  tool(
    mcp,
    'edit_file',
    'Replace one exact piece of a file content with another. old_string must appear exactly once, unless replace_all replaces every time it appears.',
    {
      ...fileRef,
      old_string: z.string(),
      new_string: z.string(),
      replace_all: z.boolean().optional().describe('replace every occurrence'),
      if_revision: ifRevision,
    },
    async (i) => {
      const file = await files.find(i)
      return files.edit(
        file.id,
        { oldString: i.old_string, newString: i.new_string, replaceAll: i.replace_all, ifRevision: i.if_revision },
        writer(),
      )
    },
  )
  tool(mcp, 'delete_file', 'Move a file to the trash. It keeps its history and tags, and restore_file brings it back.', fileRef, async (i) => {
    await files.remove((await files.find(i)).id)
  })
  tool(mcp, 'list_trash', 'List the files in the trash, most recently deleted first, with their ids.', {}, () => files.trash())
  tool(
    mcp,
    'restore_file',
    'Take a file out of the trash, by its id from list_trash, back to its path or to a new one when that path is taken.',
    { id: z.string(), path: z.string().optional().describe('restore it here instead of its old path') },
    (i) => files.restore(i.id, { path: i.path }, writer()),
  )
  tool(
    mcp,
    'empty_trash',
    'Delete for good one file of the trash (by id), or the whole trash. It cannot be undone: only when the person asks.',
    { id: z.string().optional().describe('only this file of the trash') },
    (i) => files.emptyTrash(i.id),
  )

  tool(mcp, 'list_folders', 'List every folder as a flat list of paths, empty ones included, like /notes/. get_tree shows them nested, with file counts.', {}, () => folders.list())
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
    async (i) => ({ path: await files.moveFolder(i.from, i.to, writer()) }),
  )
  tool(
    mcp,
    'delete_folder',
    'Delete a folder. Without recursive it must be empty; with recursive its files go to the trash too, where they keep their history and restore_file brings them back.',
    { path: z.string().describe('like /notes/old/'), recursive: z.boolean().optional() },
    (i) => folders.remove(i.path, { recursive: i.recursive }),
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
