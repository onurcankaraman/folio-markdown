import { promises as fs, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { atomicSave, ConflictError, decode, hash, inside } from './files.js';

const MAX_FILE = 5 * 1024 * 1024,
  MAX_FILES = 2000,
  MAX_SCAN = 50 * 1024 * 1024,
  MAX_MATCHES = 500;
const markdown = /\.(md|markdown)$/i;
const skipped = (name: string) =>
  name.startsWith('.') || ['node_modules', 'dist', 'release'].includes(name);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const json = (value: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});
const failure = (e: any) => ({
  content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }],
  isError: true,
});

export function createServer(workspace: string) {
  const root = realpathSync(workspace);
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  async function resolve(name: string) {
    if (!markdown.test(name)) throw new Error('Only .md and .markdown files are supported.');
    const target = path.resolve(root, name);
    let file: string;
    try {
      file = await fs.realpath(target);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
      file = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
    }
    if (!inside(root, file)) throw new Error('The path is outside the workspace.');
    return file;
  }
  async function read(file: string) {
    if ((await fs.stat(file)).size > MAX_FILE) throw new Error('The file is larger than 5 MiB.');
    const bytes = await fs.readFile(file);
    return { ...decode(bytes), hash: hash(bytes) };
  }
  async function walk(visit: (file: string, size: number) => Promise<boolean | void>) {
    let count = 0,
      truncated = false;
    const step = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (truncated) return;
        if (skipped(entry.name) || entry.isSymbolicLink()) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await step(file);
        else if (markdown.test(entry.name)) {
          if (++count > MAX_FILES || (await visit(file, (await fs.stat(file)).size)) === false)
            truncated = true;
        }
      }
    };
    await step(root);
    return truncated;
  }

  const server = new McpServer({ name: 'folio', version });
  server.registerTool(
    'list_documents',
    {
      title: 'List documents',
      description: 'List Markdown files in the Folio workspace with their sizes.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const documents: { path: string; size: number }[] = [];
        const truncated = await walk(async (file, size) => {
          documents.push({ path: relative(file), size });
        });
        return json({ documents, truncated });
      } catch (e) {
        return failure(e);
      }
    },
  );
  server.registerTool(
    'read_document',
    {
      title: 'Read document',
      description:
        'Read a Markdown file. The returned hash must be passed as baseHash when writing the file back.',
      inputSchema: { path: z.string().min(1).describe('Path relative to the workspace') },
      annotations: { readOnlyHint: true },
    },
    async ({ path: name }) => {
      try {
        const file = await resolve(name),
          value = await read(file);
        return json({ path: relative(file), ...value });
      } catch (e) {
        return failure(e);
      }
    },
  );
  server.registerTool(
    'search_documents',
    {
      title: 'Search documents',
      description: 'Search plain text in every Markdown file of the workspace.',
      inputSchema: {
        query: z.string().min(1).max(1000),
        caseSensitive: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, caseSensitive }) => {
      try {
        const needle = caseSensitive ? query : query.toLocaleLowerCase(),
          matches: { path: string; line: number; text: string }[] = [];
        let scanned = 0;
        const truncated = await walk(async (file, size) => {
          if (size > MAX_FILE) return;
          if ((scanned += size) > MAX_SCAN) return false;
          const { source } = await read(file).catch(() => ({ source: '' }));
          const lines = source.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (!(caseSensitive ? lines[i] : lines[i].toLocaleLowerCase()).includes(needle))
              continue;
            if (matches.length === MAX_MATCHES) return false;
            matches.push({ path: relative(file), line: i + 1, text: lines[i].slice(0, 300) });
          }
        });
        return json({ matches, truncated });
      } catch (e) {
        return failure(e);
      }
    },
  );
  server.registerTool(
    'write_document',
    {
      title: 'Write document',
      description:
        'Create a Markdown file or replace the content of an existing one. Existing files need the baseHash from read_document and are not written if they changed on disk since then.',
      inputSchema: {
        path: z.string().min(1).describe('Path relative to the workspace'),
        content: z.string().max(MAX_FILE),
        baseHash: z
          .string()
          .optional()
          .describe('Hash from read_document, required for existing files'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ path: name, content, baseHash }) => {
      try {
        const file = await resolve(name),
          current = await read(file).catch((e) => {
            if (e.code === 'ENOENT') return undefined;
            throw e;
          });
        if (current && !baseHash)
          throw new Error('The file already exists. Read it first and pass its hash as baseHash.');
        const source =
          current?.source.includes('\r\n') && !content.includes('\r\n')
            ? content.replace(/\n/g, '\r\n')
            : content;
        const next = await atomicSave(file, source, baseHash, current?.encoding).catch((e) => {
          if (e instanceof ConflictError)
            throw new Error('The file changed on disk. Read it again before writing.');
          throw e;
        });
        return json({ path: relative(file), hash: next, created: !current });
      } catch (e) {
        return failure(e);
      }
    },
  );
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const workspace = process.argv[2] || process.env.FOLIO_MCP_ROOT;
  if (!workspace) {
    console.error('Usage: node dist-electron/mcp.js <workspace folder>');
    process.exit(1);
  }
  await createServer(workspace).connect(new StdioServerTransport());
}
