import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { atomicSave, hash, ConflictError, decode, decodePath, inside } from '../electron/files';
import iconv from 'iconv-lite';
describe('safe file persistence', () => {
  it('atomically saves and rejects external edits without touching disk', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-test-'));
    try {
      const file = path.join(dir, 'test.md');
      await atomicSave(file, 'İlk');
      const baseline = hash(await fs.readFile(file));
      await fs.writeFile(file, 'Harici');
      await expect(atomicSave(file, 'Yerel', baseline)).rejects.toBeInstanceOf(ConflictError);
      expect(await fs.readFile(file, 'utf8')).toBe('Harici');
      expect(await fs.readdir(dir)).toEqual(['test.md']);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
  it('does not rewrite unchanged content', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-test-'));
    try {
      const file = path.join(dir, 'test.md');
      await fs.writeFile(file, '\uFEFF# Not\r\n');
      const before = await fs.stat(file);
      await atomicSave(file, '\uFEFF# Not\r\n', hash(await fs.readFile(file)));
      expect((await fs.stat(file)).mtimeMs).toBe(before.mtimeMs);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
  it('rejects invalid UTF-8 instead of replacing characters', () =>
    expect(() => decode(Buffer.from([0xc3, 0x28]))).toThrow('ENCODING_ERROR'));
  it('rejects deleted baseline targets', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-test-'));
    try {
      await expect(
        atomicSave(path.join(dir, 'missing.md'), 'new', hash('old')),
      ).rejects.toBeInstanceOf(ConflictError);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
  it('contains path traversal', () => {
    expect(inside('/docs', '/docs/a.png')).toBe(true);
    expect(inside('/docs', '/docs-other/a.png')).toBe(false);
    expect(inside('/docs', '/secret')).toBe(false);
  });
  it('decodes link paths and keeps a literal percent sign', () => {
    expect(decodePath('my%20image.png')).toBe('my image.png');
    expect(decodePath('100%.png')).toBe('100%.png');
  });
  it('preserves UTF-16 BOM during a no-op save', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-test-'));
    try {
      const file = path.join(dir, 'test.md'),
        bytes = iconv.encode('\uFEFF# Türkçe\r\n', 'utf16-le');
      await fs.writeFile(file, bytes);
      const f = decode(bytes);
      await atomicSave(file, f.source, hash(bytes), f.encoding);
      expect(await fs.readFile(file)).toEqual(bytes);
    } finally {
      await fs.rm(dir, { recursive: true });
    }
  });
});
