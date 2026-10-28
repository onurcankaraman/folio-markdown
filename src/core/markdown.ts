import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import type { JSONContent } from '@tiptap/core';

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml']);
const printer = unified()
  .use(remarkStringify, { bullet: '-', fences: true, listItemIndent: 'one' })
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml']);
export function parse(source: string): any {
  const tree: any = parser.parse(source),
    result: any[] = [];
  const point = (offset: number) => {
    const prefix = source.slice(0, offset),
      line = prefix.split('\n').length;
    return { offset, line, column: offset - prefix.lastIndexOf('\n') };
  };
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type !== 'html' || !/^<details(?:\s|>)/i.test(node.value)) {
      result.push(node);
      continue;
    }
    const tags = /<\/?details(?:\s[^>]*|)>/gi;
    tags.lastIndex = node.position.start.offset;
    let depth = 0,
      end = -1,
      match: RegExpExecArray | null;
    while ((match = tags.exec(source))) {
      if (match[0].startsWith('</')) depth--;
      else depth++;
      if (!depth) {
        end = tags.lastIndex;
        break;
      }
    }
    if (end < 0) {
      result.push(node);
      continue;
    }
    result.push({
      type: 'html',
      value: source.slice(node.position.start.offset, end),
      position: { start: node.position.start, end: point(end) },
    });
    while (tree.children[i + 1]?.position.start.offset < end) i++;
    const last = tree.children[i];
    if (last.position.end.offset > end && source.slice(end, last.position.end.offset).trim())
      result.push({
        type: 'html',
        value: source.slice(end, last.position.end.offset),
        position: { start: point(end), end: last.position.end },
      });
  }
  tree.children = result;
  return tree;
}
export const print = (node: any): string => printer.stringify(node);
export type Ledger = {
  prefix: string;
  eol: string;
  blocks: Map<string, { raw: string; gap: string; signature: string }>;
};
const paragraph = (content: JSONContent[] = []): JSONContent => ({ type: 'paragraph', content });
const text = (value: string, marks: any[] = []): JSONContent[] =>
  value ? [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }] : [];

function inline(n: any, marks: any[] = []): JSONContent[] {
  switch (n.type) {
    case 'text':
      return text(n.value, marks);
    case 'strong':
      return n.children.flatMap((c: any) => inline(c, [...marks, { type: 'bold' }]));
    case 'emphasis':
      return n.children.flatMap((c: any) => inline(c, [...marks, { type: 'italic' }]));
    case 'delete':
      return n.children.flatMap((c: any) => inline(c, [...marks, { type: 'strike' }]));
    case 'inlineCode':
      return text(n.value, [...marks, { type: 'code' }]);
    case 'break':
      return [{ type: 'hardBreak' }];
    case 'link':
      return n.children.flatMap((c: any) =>
        inline(c, [...marks, { type: 'link', attrs: { href: n.url, title: n.title } }]),
      );
    case 'inlineMath':
      return [{ type: 'formulaInline', attrs: { value: n.value } }];
    case 'image':
      return [{ type: 'inlineAsset', attrs: { src: n.url, alt: n.alt || '', title: n.title } }];
    default:
      return [
        {
          type: 'sourceInline',
          attrs: {
            value:
              n._raw ||
              (n.type === 'footnoteReference' ? `[^${n.identifier}]` : n.value || n.label || ''),
          },
        },
      ];
  }
}
function toEditor(n: any, source: string): JSONContent {
  const kids = () => (n.children || []).map((c: any) => toEditor(c, source));
  const ins = () =>
    (n.children || []).flatMap((c: any) => {
      c._raw = source.slice(c.position?.start.offset, c.position?.end.offset);
      return inline(c);
    });
  switch (n.type) {
    case 'paragraph':
      return paragraph(ins());
    case 'heading':
      return { type: 'heading', attrs: { level: n.depth }, content: ins() };
    case 'blockquote': {
      const raw = source.slice(n.position.start.offset, n.position.end.offset);
      if (/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/.test(raw))
        return { type: 'specialBlock', attrs: { kind: 'alert', value: raw } };
      return { type: 'blockquote', content: kids() };
    }
    case 'list':
      return {
        type: n.children.some((c: any) => typeof c.checked === 'boolean')
          ? 'taskList'
          : n.ordered
            ? 'orderedList'
            : 'bulletList',
        attrs: n.ordered ? { start: n.start || 1 } : {},
        content: kids(),
      };
    case 'listItem': {
      const content = kids();
      return {
        type: typeof n.checked === 'boolean' ? 'taskItem' : 'listItem',
        ...(typeof n.checked === 'boolean' ? { attrs: { checked: n.checked } } : {}),
        content: content.length ? content : [paragraph()],
      };
    }
    case 'thematicBreak':
      return { type: 'horizontalRule' };
    case 'code':
      return n.lang === 'mermaid'
        ? { type: 'specialBlock', attrs: { kind: 'diagram', value: n.value } }
        : { type: 'codeBlock', attrs: { language: n.lang || null }, content: text(n.value) };
    case 'math':
      return { type: 'specialBlock', attrs: { kind: 'math', value: n.value } };
    case 'table':
      return {
        type: 'table',
        content: n.children.map((row: any, i: number) => ({
          type: 'tableRow',
          content: row.children.map((cell: any, j: number) => ({
            type: i === 0 ? 'tableHeader' : 'tableCell',
            attrs: { align: n.align[j] || null },
            content: [paragraph(cell.children.flatMap((c: any) => inline(c)))],
          })),
        })),
      };
    default:
      return {
        type: 'specialBlock',
        attrs: {
          kind:
            n.type === 'yaml'
              ? 'yaml'
              : n.type === 'footnoteDefinition'
                ? 'footnote'
                : n.type === 'html' && /^<details[\s>]/i.test(n.value)
                  ? 'details'
                  : 'protected',
          value: source.slice(n.position.start.offset, n.position.end.offset),
        },
      };
  }
}
function canonical(n: any): any {
  if (Array.isArray(n)) return n.map(canonical);
  if (!n || typeof n !== 'object') return n;
  return Object.fromEntries(
    Object.entries(n)
      .filter(
        ([k, v]) =>
          k !== 'origin' &&
          v !== null &&
          v !== undefined &&
          !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as any).length),
      )
      .map(([k, v]) => [k, canonical(v)]),
  );
}
export const signature = (n: JSONContent) => JSON.stringify(canonical(n));
export function project(source: string): { doc: JSONContent; ledger: Ledger } {
  const tree = parse(source);
  const annotate = (n: any) => {
    if (n.position) n._raw = source.slice(n.position.start.offset, n.position.end.offset);
    n.children?.forEach(annotate);
  };
  annotate(tree);
  const blocks: Ledger['blocks'] = new Map();
  const children = tree.children.map((n: any, i: number) => {
    const id = `s${i}`;
    const node = toEditor(n, source);
    node.attrs = { ...node.attrs, origin: id };
    blocks.set(id, {
      raw: source.slice(n.position.start.offset, n.position.end.offset),
      gap: source.slice(
        n.position.end.offset,
        tree.children[i + 1]?.position.start.offset ?? source.length,
      ),
      signature: signature(node),
    });
    return node;
  });
  return {
    doc: { type: 'doc', content: children.length ? children : [paragraph()] },
    ledger: {
      blocks,
      prefix: source.slice(0, tree.children[0]?.position.start.offset ?? source.length),
      eol: source.includes('\r\n') ? '\r\n' : '\n',
    },
  };
}
export function bindLedger(doc: JSONContent, ledger: Ledger) {
  for (const n of doc.content || []) {
    const entry = ledger.blocks.get(n.attrs?.origin);
    if (entry) entry.signature = signature(n);
  }
}
function inlineAst(n: JSONContent): any[] {
  if (n.type === 'hardBreak') return [{ type: 'break' }];
  if (n.type === 'formulaInline') return [{ type: 'inlineMath', value: n.attrs?.value || '' }];
  if (n.type === 'sourceInline') return [{ type: 'html', value: n.attrs?.value || '' }];
  if (n.type === 'inlineAsset')
    return [{ type: 'image', url: n.attrs?.src, alt: n.attrs?.alt, title: n.attrs?.title }];
  let a: any = { type: 'text', value: n.text || '' };
  for (const m of n.marks || []) {
    if (m.type === 'code') a = { type: 'inlineCode', value: n.text || '' };
    else if (['bold', 'italic', 'strike', 'link'].includes(m.type))
      a = {
        type: ({ bold: 'strong', italic: 'emphasis', strike: 'delete', link: 'link' } as any)[
          m.type
        ],
        children: [a],
        ...(m.type === 'link' ? { url: m.attrs?.href, title: m.attrs?.title } : {}),
      };
  }
  return [a];
}
function ast(n: JSONContent): any {
  const children = () => (n.content || []).map(ast);
  const ins = () => (n.content || []).flatMap(inlineAst);
  switch (n.type) {
    case 'paragraph':
      return { type: 'paragraph', children: ins() };
    case 'heading':
      return { type: 'heading', depth: n.attrs?.level || 1, children: ins() };
    case 'blockquote':
      return { type: 'blockquote', children: children() };
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return {
        type: 'list',
        ordered: n.type === 'orderedList',
        start: n.attrs?.start || 1,
        spread: false,
        children: children(),
      };
    case 'listItem':
    case 'taskItem':
      return {
        type: 'listItem',
        spread: false,
        ...(n.type === 'taskItem' ? { checked: !!n.attrs?.checked } : {}),
        children: children(),
      };
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'codeBlock':
      return {
        type: 'code',
        lang: n.attrs?.language || null,
        value: (n.content || []).map((c) => c.text).join(''),
      };
    case 'table':
      return {
        type: 'table',
        align: n.content?.[0]?.content?.map((c) => c.attrs?.align || null) || [],
        children: (n.content || []).map((row) => ({
          type: 'tableRow',
          children: (row.content || []).map((cell) => ({
            type: 'tableCell',
            children: (cell.content || []).flatMap((p) => (p.content || []).flatMap(inlineAst)),
          })),
        })),
      };
    case 'specialBlock': {
      const { kind, value } = n.attrs || {};
      if (kind === 'diagram') return { type: 'code', lang: 'mermaid', value };
      if (kind === 'math') return { type: 'math', value };
      return { type: 'html', value };
    }
    default:
      return { type: 'paragraph', children: ins() };
  }
}
export function serialize(doc: JSONContent, ledger: Ledger): string {
  const used = new Set<string>();
  const nodes = doc.content || [];
  const chunks = nodes.map((n, i) => {
    const id = n.attrs?.origin;
    const old = !used.has(id) ? ledger.blocks.get(id) : undefined;
    used.add(id);
    const raw =
      old && old.signature === signature(n)
        ? old.raw
        : print({ type: 'root', children: [ast(n)] })
            .trimEnd()
            .replace(/\r?\n/g, ledger.eol);
    const gap = old ? old.gap : i < nodes.length - 1 ? ledger.eol.repeat(2) : ledger.eol;
    return raw + (i < nodes.length - 1 && !gap ? ledger.eol.repeat(2) : gap);
  });
  return ledger.prefix + chunks.join('');
}
export function headings(
  source: string,
): { text: string; depth: number; offset: number; id: string }[] {
  const seen = new Map<string, number>();
  const label = (n: any): string => n.value || (n.children || []).map(label).join('');
  return parse(source)
    .children.filter((n: any) => n.type === 'heading')
    .map((n: any) => {
      const text = label(n),
        slug = text
          .toLocaleLowerCase('tr')
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .replace(/\s+/g, '-');
      const index = seen.get(slug) || 0;
      seen.set(slug, index + 1);
      return {
        text,
        depth: n.depth,
        offset: n.position.start.offset,
        id: slug + (index ? `-${index}` : ''),
      };
    });
}
export const countWords = (source: string) =>
  (source.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
