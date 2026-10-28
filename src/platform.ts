import { zipSync, strToU8 } from 'fflate';
import type { DesktopAPI } from './types';
import { getMermaid } from './core/mermaid';
import { parse } from './core/markdown';

const uuid = () => crypto.randomUUID();
function download(name: string, data: string | Uint8Array, type: string) {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const localFiles = new Map<string, File>();
const web: DesktopAPI = {
  drop: async (files) =>
    Promise.all(files.map(async (f) => ({ id: uuid(), name: f.name, source: await f.text() }))),
  importPackage: async () => {
    throw new Error('ZIP içe aktarma masaüstü uygulamasında kullanılabilir.');
  },
  open: () =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt';
      input.multiple = true;
      input.oncancel = () => resolve([]);
      input.onchange = async () => {
        const result = [];
        for (const file of input.files || []) {
          const id = uuid();
          localFiles.set(id, file);
          result.push({ id, name: file.name, source: await file.text() });
        }
        resolve(result);
      };
      input.click();
    }),
  read: async (id) => {
    const f = localFiles.get(id);
    if (!f) throw new Error('Dosya tekrar seçilmeli.');
    return { id, name: f.name, source: await f.text() };
  },
  save: async (file) => {
    download(file.name, file.source, 'text/markdown;charset=utf-8');
    return { ok: true, file };
  },
  drafts: async () => {
    try {
      return JSON.parse(localStorage.getItem('folio-drafts') || '[]');
    } catch {
      return [];
    }
  },
  draft: async (d) => {
    const all = await web.drafts();
    localStorage.setItem('folio-drafts', JSON.stringify([d, ...all.filter((x) => x.id !== d.id)]));
  },
  removeDraft: async (id) => {
    localStorage.setItem(
      'folio-drafts',
      JSON.stringify((await web.drafts()).filter((x) => x.id !== id)),
    );
  },
  recents: async () => [],
  folder: async () => [],
  children: async () => [],
  fileAction: async () => {
    throw new Error('Dosya yönetimi masaüstü uygulamasında kullanılabilir.');
  },
  searchFolder: async () => ({ results: [], truncated: false }),
  replaceFiles: async () => [],
  addAsset: async (_, data, name) => {
    const ext = name.split('.').pop()!.toLowerCase();
    return `data:image/${{ jpg: 'jpeg', svg: 'svg+xml' }[ext] || ext};base64,${data}`;
  },
  asset: async (_, reference) => {
    if (reference.startsWith('data:image/')) return reference;
    throw new Error('Tarayıcıda yerel görsel için masaüstü uygulamasını kullanın.');
  },
  resource: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Kaynak yüklenemedi.');
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
  renderDiagram: async (source, id) => {
    const engine = await getMermaid();
    return (await engine.render(id, source)).svg;
  },
  exportFile: async (name, data, format) => {
    download(
      name,
      format === 'zip' || format === 'png'
        ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        : data,
      ({ html: 'text/html', svg: 'image/svg+xml', zip: 'application/zip' } as any)[format] ||
        'text/plain',
    );
    return true;
  },
  pdf: async (html) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
    await new Promise((r) => {
      iframe.onload = r;
    });
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 30000);
    return true;
  },
  external: async (url) => {
    const u = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(u.protocol))
      window.open(url, '_blank', 'noopener,noreferrer');
  },
  navigate: async () => {
    throw new Error('Yerel dosya bağlantıları masaüstü uygulamasında açılır.');
  },
  history: async () => [],
  settings: async (value) => {
    if (value) localStorage.setItem('folio-settings', JSON.stringify(value));
    try {
      return JSON.parse(localStorage.getItem('folio-settings') || '{}');
    } catch {
      return {};
    }
  },
  session: async () => ({ files: [] }),
  info: async () => ({
    version: '1.0.0',
    platform: 'browser',
    arch: '-',
    portable: false,
    packaged: false,
  }),
  maintenance: async (action) => {
    if (action === 'clear-recents') return;
    throw new Error('Bu araç masaüstü uygulamasında kullanılabilir.');
  },
  updates: async () => ({
    state: 'error',
    message: 'Güncelleme denetimi masaüstü uygulamasında kullanılabilir.',
  }),
  ready() {},
  onOpen: () => () => {},
  onMenu: () => () => {},
  onDiskChange: () => () => {},
  approveClose() {},
};
const base = window.desktop || web;
export const isDesktop = !!window.desktop;
export const api: DesktopAPI = {
  ...base,
  exportFile: async (name, data, format) => {
    if (!isDesktop || ['zip', 'png'].includes(format)) return base.exportFile(name, data, format);
    const bytes = new TextEncoder().encode(data);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return base.exportFile(name, btoa(binary), format);
  },
};
export async function exportZip(name: string, source: string, documentId: string) {
  const files: Record<string, Uint8Array> = { [name]: strToU8(source) };
  const refs: string[] = [];
  const collect = (text: string, depth = 0) => {
    if (depth > 32) throw new Error('İç içe belge sınırı aşıldı.');
    const tree = parse(text),
      definitions = new Map<string, string>();
    const find = (n: any) => {
      if (n.type === 'definition') definitions.set(n.identifier, n.url);
      n.children?.forEach(find);
    };
    find(tree);
    const walk = (n: any) => {
      if (n.type === 'image') refs.push(n.url);
      if (n.type === 'imageReference') {
        const target = definitions.get(n.identifier);
        if (target) refs.push(target);
      }
      if (n.type === 'html' && /^<details/i.test(n.value)) {
        const body = n.value.match(/<\/summary>\s*([\s\S]*?)<\/details>\s*$/i);
        if (body) collect(body[1], depth + 1);
      }
      n.children?.forEach(walk);
    };
    walk(tree);
  };
  collect(source);
  let packageBytes = files[name].length;
  const missing: string[] = [];
  for (const ref of new Set(refs)) {
    if (ref.startsWith('data:')) continue;
    if (/^https?:|^\/|(^|\/)\.\.(\/|$)/.test(ref)) {
      missing.push(ref);
      continue;
    }
    try {
      const data = await api.asset(documentId, ref);
      files[decodeURIComponent(ref)] = Uint8Array.from(atob(data.split(',')[1]), (c) =>
        c.charCodeAt(0),
      );
      packageBytes += files[decodeURIComponent(ref)].length;
    } catch {
      missing.push(ref);
    }
  }
  if (packageBytes > 40 * 1024 * 1024) throw new Error('Paket 40 MiB çıktı sınırını aşıyor.');
  if (missing.length) throw new Error('Paketlenemeyen bağımlılıklar: ' + missing.join(', '));
  files['manifest.json'] = strToU8(
    JSON.stringify(
      { application: 'Folio', version: 1, document: name, files: Object.keys(files) },
      null,
      2,
    ),
  );
  const zip = zipSync(files);
  let binary = '';
  for (let offset = 0; offset < zip.length; offset += 32768)
    binary += String.fromCharCode(...zip.subarray(offset, offset + 32768));
  return api.exportFile(name.replace(/\.[^.]+$/, '') + '.zip', btoa(binary), 'zip');
}
