import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../electron/mcp';

describe('MCP server', () => {
  let dir: string, workspace: string, client: Client;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result: any = await client.callTool({ name, arguments: args });
    return {
      error: result.isError ? result.content[0].text : undefined,
      ...result.structuredContent,
    };
  };
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-mcp-'));
    workspace = path.join(dir, 'notes');
    await fs.mkdir(path.join(workspace, 'sub'), { recursive: true });
    await fs.mkdir(path.join(workspace, 'node_modules'));
    await fs.writeFile(path.join(workspace, 'a.md'), '# Başlık\r\n\r\nFolio notları\r\n');
    await fs.writeFile(path.join(workspace, 'sub', 'b.markdown'), 'ikinci folio\n');
    await fs.writeFile(path.join(workspace, 'node_modules', 'c.md'), 'folio');
    await fs.writeFile(path.join(workspace, 'image.png'), 'x');
    await fs.writeFile(path.join(dir, 'secret.md'), 'gizli');
    const [a, b] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([createServer(workspace).connect(a), client.connect(b)]);
  });
  afterEach(async () => {
    await client.close();
    await fs.rm(dir, { recursive: true });
  });

  it('lists only workspace Markdown files', async () => {
    const { documents } = await call('list_documents');
    expect(documents.map((d: any) => d.path).sort()).toEqual(['a.md', 'sub/b.markdown']);
  });

  it('reads and searches documents', async () => {
    const read = await call('read_document', { path: 'a.md' });
    expect(read).toMatchObject({ path: 'a.md', encoding: 'utf8' });
    expect(read.source).toContain('Folio notları');
    const { matches } = await call('search_documents', { query: 'FOLIO' });
    expect(matches).toEqual([
      { path: 'a.md', line: 3, text: 'Folio notları' },
      { path: 'sub/b.markdown', line: 1, text: 'ikinci folio' },
    ]);
  });

  it('keeps paths inside the workspace', async () => {
    expect((await call('read_document', { path: '../secret.md' })).error).toContain('outside');
    expect((await call('read_document', { path: 'image.png' })).error).toContain('.md');
    await fs.symlink(path.join(dir, 'secret.md'), path.join(workspace, 'link.md'));
    expect((await call('read_document', { path: 'link.md' })).error).toContain('outside');
  });

  it('needs a fresh hash to change an existing file and keeps CRLF', async () => {
    const file = path.join(workspace, 'a.md');
    expect((await call('write_document', { path: 'a.md', content: 'x' })).error).toContain(
      'baseHash',
    );
    const { hash } = await call('read_document', { path: 'a.md' });
    await fs.writeFile(file, '# Başka bir yerde değişti\r\n');
    const stale = await call('write_document', { path: 'a.md', content: 'x', baseHash: hash });
    expect(stale.error).toContain('changed on disk');
    const fresh = await call('read_document', { path: 'a.md' });
    const written = await call('write_document', {
      path: 'a.md',
      content: '# Yeni\n\nmetin\n',
      baseHash: fresh.hash,
    });
    expect(written.error).toBeUndefined();
    expect(await fs.readFile(file, 'utf8')).toBe('# Yeni\r\n\r\nmetin\r\n');
  });

  it('creates new files without overwriting', async () => {
    const created = await call('write_document', { path: 'sub/new.md', content: '# Yeni\n' });
    expect(created).toMatchObject({ path: 'sub/new.md', created: true });
    expect(await fs.readFile(path.join(workspace, 'sub', 'new.md'), 'utf8')).toBe('# Yeni\n');
  });
});
