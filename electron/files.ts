import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import iconv from 'iconv-lite';

export const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
export function decode(
  bytes: Buffer,
  selectedEncoding?: string,
): { source: string; encoding: string } {
  if (selectedEncoding && selectedEncoding !== 'utf8')
    return {
      source: iconv.decode(bytes, selectedEncoding, { stripBOM: false }),
      encoding: selectedEncoding,
    };
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { source: iconv.decode(bytes, 'utf16-le', { stripBOM: false }), encoding: 'utf16-le' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { source: iconv.decode(bytes, 'utf16-be', { stripBOM: false }), encoding: 'utf16-be' };
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('ENCODING_ERROR: Dosya UTF-8 değil. Veri kaybını önlemek için açılmadı.');
  }
  return { source: bytes.toString('utf8'), encoding: 'utf8' };
}
export class ConflictError extends Error {
  constructor() {
    super('EXTERNAL_CONFLICT');
  }
}
export async function atomicSave(
  target: string,
  source: string,
  baseline?: string,
  encoding = 'utf8',
) {
  let before: Buffer | undefined;
  try {
    before = await fs.readFile(target);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
  const bytes = iconv.encode(source, encoding);
  if (iconv.decode(bytes, encoding).replace(/^\uFEFF/, '') !== source.replace(/^\uFEFF/, ''))
    throw new Error('ENCODING_ERROR: Bu karakterler mevcut kodlamada saklanamıyor.');
  if (before?.equals(bytes)) return hash(bytes);
  if (baseline && (!before || hash(before) !== baseline)) throw new ConflictError();
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    const mode = before ? (await fs.stat(target)).mode : 0o600;
    const handle = await fs.open(temp, 'wx', mode);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    let current: Buffer | undefined;
    try {
      current = await fs.readFile(target);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (before ? !current || hash(current) !== hash(before) : current !== undefined)
      throw new ConflictError();
    await fs.rename(temp, target);
    if (process.platform !== 'win32') {
      const dir = await fs.open(path.dirname(target), 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    }
    return hash(bytes);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}
// Markdown paths may contain a literal % that is not a valid escape, so fall back to the raw value.
export const decodePath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
export const inside = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
};
