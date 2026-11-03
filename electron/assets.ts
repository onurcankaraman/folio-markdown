import { promises as fs } from 'node:fs';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { decodePath, hash, inside } from './files.js';

export async function relocateAssets(source: string, original: string, target: string) {
  const root = await fs.realpath(path.dirname(original)),
    destination = await fs.realpath(path.dirname(target));
  const tree: any = unified().use(remarkParse).use(remarkGfm).parse(source);
  const nodes: any[] = [];
  const collect = (node: any) => {
    if (
      ['image', 'link', 'definition'].includes(node.type) &&
      node.url &&
      !/^[a-z]+:|^#|^\//i.test(node.url)
    )
      nodes.push(node);
    node.children?.forEach(collect);
  };
  collect(tree);
  const replacements: { start: number; end: number; value: string }[] = [];
  const migrated = new Map<string, string>();
  for (const node of nodes) {
    let next = migrated.get(node.url);
    if (!next) {
      const fragment = node.url.includes('#') ? '#' + node.url.split('#').slice(1).join('#') : '';
      const reference = node.url.split('#')[0],
        resolved = path.resolve(root, decodePath(reference));
      const image = /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(reference);
      if (image) {
        const real = await fs.realpath(resolved);
        if (!inside(root, real))
          throw new Error(
            'Görsel belge klasörü dışında: ' +
              reference +
              '. Bağımlılığı önce belge klasörüne kopyalayın.',
          );
        const bytes = await fs.readFile(real);
        if (bytes.length > 25 * 1024 * 1024)
          throw new Error('Görsel boyutu sınırı aşıldı: ' + reference);
        const name = path.basename(target, path.extname(target)) + '.assets';
        const filename =
          path.basename(real, path.extname(real)).replace(/[^\p{L}\p{N}_-]/gu, '_') +
          '-' +
          hash(bytes).slice(0, 8) +
          path.extname(real);
        const dir = path.join(destination, name);
        await fs.mkdir(dir, { recursive: true });
        const output = path.join(dir, filename);
        try {
          await fs.writeFile(output, bytes, { flag: 'wx' });
        } catch (e: any) {
          if (e.code !== 'EEXIST') throw e;
          if (hash(await fs.readFile(output)) !== hash(bytes))
            throw new Error('Varlık dosyası çakışması: ' + filename);
        }
        next = `${name}/${filename}`.split(path.sep).join('/') + fragment;
      } else next = path.relative(destination, resolved).split(path.sep).join('/') + fragment;
      next = next.replaceAll(' ', '%20');
      migrated.set(node.url, next);
    }
    const raw = source.slice(node.position.start.offset, node.position.end.offset),
      offset = raw.indexOf(node.url);
    if (offset >= 0)
      replacements.push({
        start: node.position.start.offset + offset,
        end: node.position.start.offset + offset + node.url.length,
        value: next,
      });
  }
  let result = source;
  for (const r of replacements.sort((a, b) => b.start - a.start))
    result = result.slice(0, r.start) + r.value + result.slice(r.end);
  return result;
}
