import { app, BrowserWindow, dialog, ipcMain, Menu, shell, session } from 'electron';
import { promises as fs, watch, existsSync, type FSWatcher } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { atomicSave, ConflictError, decode, decodePath, hash, inside } from './files.js';
import { relocateAssets } from './assets.js';
import updater from 'electron-updater';
import { parse as parseYAML } from 'yaml';
import { Worker } from 'node:worker_threads';

const here = path.dirname(fileURLToPath(import.meta.url));
const containerDirectory =
  process.platform === 'darwin'
    ? path.resolve(path.dirname(process.execPath), '../../..')
    : path.dirname(process.execPath);
const portable =
  process.env.PORTABLE_EXECUTABLE_DIR ||
  (app.isPackaged && existsSync(path.join(containerDirectory, 'portable.json'))
    ? containerDirectory
    : undefined);
if (portable) app.setPath('userData', path.join(portable, 'data'));
else if (process.env.FOLIO_DATA_DIR)
  app.setPath('userData', path.resolve(process.env.FOLIO_DATA_DIR));
else if (!app.isPackaged && process.env.FOLIO_TEST_DATA)
  app.setPath('userData', process.env.FOLIO_TEST_DATA);
let win: BrowserWindow;
let drawingWindow: BrowserWindow | null = null,
  diagramQueue: Promise<unknown> = Promise.resolve();
let closing = false,
  rendererReady = false;
const pendingPaths: string[] = [];
const caps = new Map<string, string>(),
  watchers = new Map<string, FSWatcher>();
const encodings = new Map<string, string>(),
  draftTombstones = new Map<string, number>();
let workspaceRoot: string | undefined,
  searchGeneration = 0;
const updateOrigins = new Set<string>();
let updateFeed = '',
  updateDownloaded = false;
const revisions = new Map<string, string>();
const writeJobs = new Map<string, Promise<unknown>>();
function serializeWrites<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return (raw: any, ...args: any[]) => {
    const id = idSchema.parse(raw?.id),
      previous = writeJobs.get(id) || Promise.resolve();
    const job = previous.catch(() => {}).then(() => fn(raw, ...args));
    writeJobs.set(id, job);
    return job.finally(() => {
      if (writeJobs.get(id) === job) writeJobs.delete(id);
    });
  };
}
const idSchema = z.string().regex(/^[\w-]{1,100}$/);
const sourceSchema = z.string().max(60 * 1024 * 1024);
const dataRoot = () => app.getPath('userData');
const jsonJobs = new Map<string, Promise<void>>();
async function jsonRead(name: string, fallback: any) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataRoot(), name), 'utf8'));
  } catch (error) {
    if (name === 'settings.json' && error instanceof SyntaxError)
      await fs
        .rename(
          path.join(dataRoot(), name),
          path.join(dataRoot(), `settings.corrupt-${Date.now()}.json`),
        )
        .catch(() => {});
    return fallback;
  }
}
function jsonWrite(name: string, value: any): Promise<void> {
  const text = JSON.stringify(value, null, 2),
    previous = jsonJobs.get(name) || Promise.resolve();
  const job = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(path.join(dataRoot(), name)), { recursive: true });
      await atomicSave(path.join(dataRoot(), name), text);
    });
  jsonJobs.set(name, job);
  return job.finally(() => {
    if (jsonJobs.get(name) === job) jsonJobs.delete(name);
  });
}
async function pruneHistory() {
  const root = path.join(dataRoot(), 'history'),
    records: { file: string; size: number; time: number }[] = [];
  for (const dir of await fs.readdir(root).catch(() => [])) {
    const parent = path.join(root, dir);
    for (const name of await fs.readdir(parent).catch(() => [])) {
      const file = path.join(parent, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat?.isFile()) records.push({ file, size: stat.size, time: stat.mtimeMs });
    }
  }
  records.sort((a, b) => a.time - b.time);
  let total = records.reduce((sum, r) => sum + r.size, 0);
  for (const record of records)
    if (total > 500 * 1024 * 1024 || record.time < Date.now() - 30 * 86400000) {
      await fs.unlink(record.file).catch(() => {});
      total -= record.size;
    }
}
function authorize(id: unknown) {
  const key = idSchema.parse(id),
    file = caps.get(key);
  if (!file) throw new Error('ACCESS_DENIED');
  return file;
}
function grant(file: string) {
  const old = [...caps.entries()].find(([, p]) => p === file);
  if (old) return old[0];
  const id = randomUUID();
  caps.set(id, file);
  return id;
}
async function readFile(file: string) {
  const resolved = await fs.realpath(file);
  if ((await fs.stat(resolved)).size > 60 * 1024 * 1024)
    throw new Error('Dosya 60 MiB sınırını aşıyor.');
  const bytes = await fs.readFile(resolved);
  const id = grant(resolved),
    decoded = decode(bytes, encodings.get(resolved));
  return {
    id,
    name: path.basename(resolved),
    path: resolved,
    ...decoded,
    hash: hash(bytes),
    eol: decoded.source.includes('\r\n') ? 'CRLF' : 'LF',
    readonly: await fs
      .access(resolved, fs.constants?.W_OK ?? 2)
      .then(() => false)
      .catch(() => true),
  };
}
async function remember(file: any) {
  const recent = await jsonRead('recent.json', []);
  await jsonWrite(
    'recent.json',
    [
      { path: file.path, name: file.name },
      ...recent.filter((r: any) => r.path !== file.path),
    ].slice(0, 20),
  );
}
function track(file: any) {
  revisions.set(file.id, file.hash);
  if (watchers.has(file.id)) return;
  let timer: ReturnType<typeof setTimeout>;
  try {
    const watcher = watch(path.dirname(file.path), () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const next = await readFile(file.path);
          if (next.hash !== revisions.get(file.id)) {
            revisions.set(file.id, next.hash);
            win?.webContents.send('files:changed', next);
          }
        } catch {
          win?.webContents.send('files:changed', { ...file, missing: true });
        }
      }, 350);
    });
    watchers.set(file.id, watcher);
  } catch {
    /* Baseline validation still runs on every save. */
  }
}
async function openPaths(paths: string[]) {
  const files = [];
  for (const p of paths) {
    try {
      const f = await readFile(p);
      await remember(f);
      track(f);
      files.push(f);
    } catch (e: any) {
      if (e.message.startsWith('ENCODING_ERROR')) {
        const bytes = await fs.readFile(p),
          choices = ['windows-1254', 'windows-1252', 'utf16-le', 'utf16-be'];
        const preview = choices
          .map(
            (encoding) =>
              `${encoding}: ${decode(bytes.subarray(0, 160), encoding).source.replace(/[\x00-\x08]/g, '·')}`,
          )
          .join('\n\n');
        const result = await dialog.showMessageBox(win, {
          type: 'question',
          message: 'Dosyanın metin kodlamasını seçin.',
          detail: 'UTF-8 olarak açmak veri kaybına yol açabilir. Önizlemeler:\n\n' + preview,
          buttons: [...choices, 'İptal'],
          cancelId: 4,
          defaultId: 0,
        });
        if (result.response < choices.length) {
          encodings.set(await fs.realpath(p), choices[result.response]);
          const f = await readFile(p);
          await remember(f);
          track(f);
          files.push(f);
        }
      } else
        await dialog.showMessageBox(win, {
          type: 'error',
          message: `Dosya açılamadı: ${path.basename(p)}`,
          detail: e.message,
        });
    }
  }
  return files;
}
async function entries(dir: string) {
  return (await fs.readdir(dir, { withFileTypes: true }))
    .filter(
      (f) =>
        !f.name.startsWith('.') &&
        !['node_modules', 'dist', 'release'].includes(f.name) &&
        !f.isSymbolicLink() &&
        (f.isDirectory() || /\.(md|markdown)$/i.test(f.name)),
    )
    .sort(
      (a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name),
    )
    .map((f) => ({ id: grant(path.join(dir, f.name)), name: f.name, directory: f.isDirectory() }));
}
function handlers() {
  const handle = (channel: string, fn: (...args: any[]) => any) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== win.webContents) throw new Error('ACCESS_DENIED');
      return fn(...args);
    });
  handle('files:open', async () => {
    const d = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    });
    return d.canceled ? [] : openPaths(d.filePaths);
  });
  handle('files:drop', (paths) =>
    openPaths(
      z
        .array(z.string().max(4096))
        .max(50)
        .parse(paths)
        .filter((p) => /\.(md|markdown|txt)$/i.test(p)),
    ),
  );
  handle('files:navigate', async (id, rawReference) => {
    const original = authorize(id),
      reference = z.string().max(4096).parse(rawReference).split('#')[0];
    if (/^(?!file:)[a-z]+:/i.test(reference) || reference.startsWith('//'))
      throw new Error('UNSAFE_CONTENT');
    const full = await fs.realpath(
      reference.startsWith('file:')
        ? fileURLToPath(reference)
        : path.resolve(path.dirname(original), decodePath(reference)),
    );
    if (!inside(path.dirname(original), full)) {
      const choice = await dialog.showMessageBox(win, {
        type: 'question',
        message: 'Bağlantı belge klasörünün dışında.',
        detail: full,
        buttons: ['İptal', 'Dosyayı aç'],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice.response !== 1) return;
    }
    if (/\.(md|markdown|txt)$/i.test(full)) {
      win.webContents.send('files:opened', await openPaths([full]));
      return;
    }
    if (!/\.(pdf|png|jpg|jpeg|webp|gif|svg)$/i.test(full))
      throw new Error('Bu dosya türü uygulama içinden başlatılamaz.');
    const error = await shell.openPath(full);
    if (error) throw new Error(error);
  });
  handle('package:open', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown paketi', extensions: ['zip'] }],
    });
    if (result.canceled) return [];
    const file = result.filePaths[0];
    const unpack = (destination?: string) =>
      new Promise<{ list: { name: string; size: number }[]; total: number }>((resolve, reject) => {
        const worker = new Worker(new URL('./archive-worker.js', import.meta.url), {
          workerData: { file, destination },
        });
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new Error('Arşiv işlemi süre sınırını aştı.'));
        }, 30000);
        worker.on('message', (data) => {
          clearTimeout(timer);
          void worker.terminate();
          if (data.error) reject(new Error(data.error));
          else resolve(data);
        });
        worker.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    const preview = await unpack();
    if (!preview.list.some((f) => /\.(md|markdown)$/i.test(f.name)))
      throw new Error('Pakette Markdown belgesi bulunamadı.');
    const decision = await dialog.showMessageBox(win, {
      type: 'question',
      message: `${preview.list.length} dosya içe aktarılsın mı?`,
      detail:
        `${Math.ceil(preview.total / 1024)} KiB açılmış içerik. Yeni bir klasör oluşturulur; mevcut dosyalar ezilmez.\n\n` +
        preview.list
          .slice(0, 30)
          .map((f) => f.name)
          .join('\n'),
      buttons: ['İptal', 'Hedef klasörü seç'],
      cancelId: 0,
      defaultId: 1,
    });
    if (decision.response !== 1) return [];
    const target = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (target.canceled) return [];
    const directory = await fs.mkdtemp(path.join(target.filePaths[0], 'Folio-import-'));
    try {
      await unpack(directory);
      let document = preview.list.find((f) => /\.(md|markdown)$/i.test(f.name))!.name;
      try {
        const manifest = JSON.parse(
          await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
        );
        if (
          preview.list.some((f) => f.name === manifest.document && /\.(md|markdown)$/i.test(f.name))
        )
          document = manifest.document;
      } catch {
        /* Ordinary ZIP packages do not require a manifest. */
      }
      return openPaths([path.join(directory, document)]);
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  });
  handle('files:read', async (id) => {
    const f = await readFile(authorize(id));
    track(f);
    return f;
  });
  handle('files:recents', async () =>
    (await jsonRead('recent.json', [])).map((r: any) => ({ ...r, id: grant(r.path) })),
  );
  handle(
    'files:save',
    serializeWrites(async (raw, saveAs) => {
      const f = z
        .object({
          id: idSchema,
          name: z.string().max(255),
          source: sourceSchema,
          hash: z.string().optional(),
          encoding: z.string().optional(),
        })
        .parse(raw);
      let target = caps.get(f.id),
        newTarget = !target || !!saveAs;
      try {
        if (newTarget) {
          const result = await dialog.showSaveDialog(win, {
            defaultPath: f.name,
            filters: [{ name: 'Markdown', extensions: ['md'] }],
          });
          if (result.canceled || !result.filePath) return { ok: false, canceled: true };
          target = result.filePath;
        }
        if (!target) return { ok: false, error: 'Hedef dosya seçilmedi.' };
        if (newTarget && target !== caps.get(f.id)) {
          const refs = [...f.source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)]
            .map((m) => m[1])
            .filter((r) => !/^[a-z]+:|^#|^\//i.test(r));
          const original = caps.get(f.id);
          if (original && path.dirname(original) !== path.dirname(target) && refs.length) {
            const response = await dialog.showMessageBox(win, {
              type: 'question',
              message: 'Görseller yeni belgeyle birlikte kopyalansın mı?',
              detail:
                'Görseller yeni varlık klasörüne kopyalanır. Diğer göreli bağlantılar özgün hedeflerine göre güncellenir.',
              buttons: ['Bağımlılıkları kopyala', 'İptal'],
              defaultId: 0,
              cancelId: 1,
            });
            if (response.response === 1) return { ok: false, canceled: true };
            f.source = await relocateAssets(f.source, original, target);
          }
        }
        const old = await fs.readFile(target).catch(() => undefined);
        if (old) {
          const hdir = `history/${hash(target).slice(0, 24)}`;
          await jsonWrite(`${hdir}/${Date.now()}.json`, {
            id: f.id,
            name: path.basename(target),
            path: target,
            source: decode(old, f.encoding).source,
            date: new Date().toISOString(),
          });
          const items = (await fs.readdir(path.join(dataRoot(), hdir))).sort().reverse();
          await Promise.all(items.slice(20).map((x) => fs.unlink(path.join(dataRoot(), hdir, x))));
        }
        if (!newTarget && !f.hash) throw new ConflictError();
        const baseline = newTarget ? (old ? hash(old) : undefined) : f.hash;
        await atomicSave(target, f.source, baseline, f.encoding || 'utf8');
        encodings.set(target, f.encoding || 'utf8');
        caps.set(f.id, target);
        const result = await readFile(target);
        revisions.set(result.id, result.hash);
        await remember(result);
        track(result);
        void pruneHistory().catch(() => {});
        return { ok: true, file: result };
      } catch (e: any) {
        return { ok: false, conflict: e instanceof ConflictError, error: e.message };
      }
    }),
  );
  handle('folder:open', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled) return [];
    workspaceRoot = await fs.realpath(result.filePaths[0]);
    return [{ id: 'workspace', name: path.basename(workspaceRoot), directory: true }];
  });
  const directoryOf = (id: string) => {
    if (id === 'workspace') {
      if (!workspaceRoot) throw new Error('Önce klasör açın.');
      return workspaceRoot;
    }
    return authorize(id);
  };
  handle('folder:children', (id) => entries(directoryOf(idSchema.parse(id))));
  handle('files:action', async (action, id, rawName) => {
    z.enum(['rename', 'trash', 'reveal', 'create-file', 'create-folder']).parse(action);
    const original = directoryOf(idSchema.parse(id));
    if (action === 'reveal') {
      shell.showItemInFolder(original);
      return {};
    }
    if (action === 'trash') {
      if (original === workspaceRoot) throw new Error('Çalışma alanı kökü silinemez.');
      await shell.trashItem(original);
      return {};
    }
    const name = z.string().min(1).max(200).parse(rawName);
    if (
      /[<>:"/\\|?*\x00-\x1F]/.test(name) ||
      name === '.' ||
      name === '..' ||
      /[.\s]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
    )
      throw new Error('Geçerli, taşınabilir bir dosya adı girin.');
    if (action === 'create-folder') {
      await fs.mkdir(path.join(original, name));
      return { entries: await entries(original) };
    }
    if (action === 'create-file') {
      const filename = /\.(md|markdown)$/i.test(name) ? name : name + '.md';
      const file = path.join(original, filename);
      await fs.writeFile(file, '', { flag: 'wx' });
      const result = await readFile(file);
      await remember(result);
      track(result);
      return { file: result, entries: await entries(original) };
    }
    if (original === workspaceRoot) throw new Error('Çalışma alanı kökü yeniden adlandırılamaz.');
    const target = path.join(path.dirname(original), name);
    if (target === original) return { file: await readFile(original) };
    if ((await fs.stat(original)).isDirectory()) {
      if (
        await fs
          .access(target)
          .then(() => true)
          .catch(() => false)
      )
        throw new Error('Hedef zaten var.');
      await fs.rename(original, target);
      for (const [key, value] of caps)
        if (inside(original, value))
          caps.set(key, path.join(target, path.relative(original, value)));
      return {};
    }
    await fs.copyFile(original, target, 1);
    await fs.unlink(original);
    caps.set(id, target);
    watchers.get(id)?.close();
    watchers.delete(id);
    const result = await readFile(target);
    track(result);
    await remember(result);
    return { file: result };
  });
  handle('folder:search', async (rawQuery, sensitive) => {
    if (!workspaceRoot) throw new Error('Önce bir klasör açın.');
    const query = z.string().min(1).max(1000).parse(rawQuery),
      generation = ++searchGeneration;
    const needle = sensitive ? query : query.toLocaleLowerCase(),
      results: any[] = [];
    let scanned = 0,
      bytes = 0,
      truncated = false;
    const visit = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (generation !== searchGeneration || scanned >= 2000 || bytes > 50 * 1024 * 1024) {
          truncated = true;
          return;
        }
        if (
          entry.name.startsWith('.') ||
          ['node_modules', 'dist', 'release'].includes(entry.name) ||
          entry.isSymbolicLink()
        )
          continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(file);
          continue;
        }
        if (!/\.(md|markdown)$/i.test(entry.name)) continue;
        const stat = await fs.stat(file);
        if (stat.size > 5 * 1024 * 1024) {
          truncated = true;
          continue;
        }
        scanned++;
        bytes += stat.size;
        const value = await readFile(file).catch(() => null);
        if (!value) continue;
        const lines = value.source.split(/\r?\n/),
          matches = [],
          text = sensitive ? value.source : value.source.toLocaleLowerCase();
        let index = 0,
          count = 0;
        while ((index = text.indexOf(needle, index)) >= 0) {
          count++;
          index += needle.length;
          if (count > 10000) break;
        }
        if (!count) continue;
        for (let line = 0; line < lines.length && matches.length < 100; line++)
          if ((sensitive ? lines[line] : lines[line].toLocaleLowerCase()).includes(needle))
            matches.push({ line: line + 1, excerpt: lines[line].slice(0, 300) });
        results.push({
          id: value.id,
          name: path.relative(workspaceRoot!, file),
          hash: value.hash,
          count,
          matches,
        });
      }
    };
    await visit(workspaceRoot);
    return { results, truncated };
  });
  handle('folder:replace', async (rawQuery, rawReplacement, sensitive, rawFiles) => {
    const query = z.string().min(1).max(1000).parse(rawQuery),
      replacement = z.string().max(100000).parse(rawReplacement),
      files = z
        .array(z.object({ id: idSchema, hash: z.string() }))
        .max(2000)
        .parse(rawFiles);
    const expression = new RegExp(
        query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        sensitive ? 'gu' : 'giu',
      ),
      results = [];
    for (const f of files) {
      try {
        const file = authorize(f.id);
        if (!workspaceRoot || !inside(workspaceRoot, file)) throw new Error('ACCESS_DENIED');
        const current = await readFile(file);
        if (current.hash !== f.hash) throw new ConflictError();
        const next = current.source.replace(expression, () => replacement);
        await jsonWrite(`history/${hash(file).slice(0, 24)}/${Date.now()}.json`, {
          id: f.id,
          name: current.name,
          path: file,
          source: current.source,
          date: new Date().toISOString(),
        });
        await atomicSave(file, next, f.hash, current.encoding);
        results.push({ id: f.id });
      } catch (e: any) {
        results.push({ id: f.id, error: e.message });
      }
    }
    return results;
  });
  handle('drafts:list', async () => {
    const dir = path.join(dataRoot(), 'drafts');
    await fs.mkdir(dir, { recursive: true });
    return (
      await Promise.all(
        (await fs.readdir(dir))
          .filter((n) => n.endsWith('.json') && !n.endsWith('.previous.json'))
          .map(async (n) => {
            for (const filename of [n, n.replace(/\.json$/, '.previous.json')]) {
              try {
                const draft = JSON.parse(await fs.readFile(path.join(dir, filename), 'utf8'));
                if (
                  typeof draft.source === 'string' &&
                  (!draft.checksum || draft.checksum === hash(draft.source))
                )
                  return draft;
              } catch {
                /* Try the previous durable snapshot. */
              }
            }
            return null;
          }),
      )
    ).filter(Boolean);
  });
  handle(
    'drafts:write',
    serializeWrites(async (raw) => {
      const d = z
        .object({
          id: idSchema,
          name: z.string(),
          path: z.string().optional(),
          source: sourceSchema,
          date: z.string().datetime(),
        })
        .parse(raw);
      const time = Date.parse(d.date);
      if ((draftTombstones.get(d.id) || 0) >= time) return;
      const old = await jsonRead(`drafts/${d.id}.json`, null);
      if (old?.source && (!old.checksum || old.checksum === hash(old.source)))
        await jsonWrite(`drafts/${d.id}.previous.json`, old);
      await jsonWrite(`drafts/${d.id}.json`, { ...d, checksum: hash(d.source) });
      if ((draftTombstones.get(d.id) || 0) >= time)
        await fs.unlink(path.join(dataRoot(), `drafts/${d.id}.json`)).catch(() => {});
    }),
  );
  handle('drafts:remove', async (value) => {
    const id = idSchema.parse(value);
    draftTombstones.set(id, Date.now());
    await fs.unlink(path.join(dataRoot(), 'drafts', `${id}.json`)).catch(() => {});
    await fs.unlink(path.join(dataRoot(), 'drafts', `${id}.previous.json`)).catch(() => {});
  });
  handle('history:list', async (id) => {
    const dir = path.join(dataRoot(), 'history', hash(authorize(id)).slice(0, 24));
    try {
      return await Promise.all(
        (await fs.readdir(dir))
          .sort()
          .reverse()
          .map(async (n) => JSON.parse(await fs.readFile(path.join(dir, n), 'utf8'))),
      );
    } catch {
      return [];
    }
  });
  handle('settings', async (value) => {
    if (value) {
      const checked = z.record(z.string(), z.unknown()).parse(value);
      if (JSON.stringify(checked).length > 100000) throw new Error('Ayar boyutu aşıldı.');
      await jsonWrite('settings.json', checked);
    }
    return jsonRead('settings.json', {});
  });
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    portable: !!portable,
    packaged: app.isPackaged,
  }));
  handle('app:maintenance', async (value) => {
    const action = z.enum(['show-data', 'clear-recents', 'clear-history']).parse(value);
    if (action === 'show-data') {
      await shell.openPath(dataRoot());
      return;
    }
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      message:
        action === 'clear-recents'
          ? 'Son açılan dosyalar listesi temizlensin mi?'
          : 'Yerel kayıt geçmişi silinsin mi?',
      detail: 'Markdown belgeleri ve kurtarılmamış taslaklar silinmez.',
      buttons: ['İptal', 'Temizle'],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response !== 1) return;
    if (action === 'clear-recents') await jsonWrite('recent.json', []);
    else await fs.rm(path.join(dataRoot(), 'history'), { recursive: true, force: true });
  });
  handle('app:updates', async (rawAction, rawURL) => {
    const action = z.enum(['check', 'download', 'install']).parse(rawAction),
      { autoUpdater } = updater;
    try {
      if (!app.isPackaged)
        return { state: 'error', message: 'Güncelleme denetimi kurulu üretim paketinde çalışır.' };
      if (portable || process.platform === 'linux')
        return {
          state: 'error',
          message:
            'Bu dağıtımda güncelleme yeni paketin indirilmesiyle yapılır. Veri klasörünü koruyarak paketi değiştirin.',
        };
      if (!rawURL && !process.env.FOLIO_UPDATE_URL)
        return {
          state: 'error',
          message:
            'Bu yerel paketin yayın kanalı yapılandırılmamış. Yayıncıya ait HTTPS güncelleme adresi gerekli.',
        };
      const url = z
        .string()
        .url()
        .parse(rawURL || process.env.FOLIO_UPDATE_URL || '');
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error('Yayın adresi HTTPS kullanmalı.');
      const configuration = path.join(process.resourcesPath, 'app-update.yml');
      if (!existsSync(configuration))
        return {
          state: 'error',
          message:
            'Bu yerel pakette imzalı yayın kanalı yapılandırılmamış. Yayıncı sertifikaları ve güncelleme adresi gerekli.',
        };
      if (process.platform === 'win32') {
        const config = parseYAML(await fs.readFile(configuration, 'utf8'));
        if (!config.publisherName)
          throw new Error('İmzalı Windows yayıncı kimliği eksik. Güncelleme engellendi.');
      }
      if (updateFeed !== url) {
        updateOrigins.clear();
        updateOrigins.add(parsed.origin);
        updateFeed = url;
        autoUpdater.setFeedURL({ provider: 'generic', url });
        updateDownloaded = false;
      }
      autoUpdater.logger = null;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.removeAllListeners('error');
      autoUpdater.on('error', () => {});
      if (action === 'install') {
        if (!updateDownloaded) throw new Error('Doğrulanmış güncelleme henüz indirilmedi.');
        closing = true;
        autoUpdater.quitAndInstall(false, true);
        return { state: 'downloaded', message: 'Güncelleme kuruluyor.' };
      }
      if (action === 'download') {
        await autoUpdater.downloadUpdate();
        updateDownloaded = true;
        return {
          state: 'downloaded',
          message:
            'Güncelleme indirildi ve doğrulandı. Açık belgeleri kaydedip uygulamayı kapatarak kurulumu tamamlayın.',
        };
      }
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo.version !== app.getVersion())
        return {
          state: 'available',
          version: result.updateInfo.version,
          message: 'Yeni sürüm indirilmeye hazır.',
        };
      return { state: 'current', message: 'Yayın kanalındaki güncel sürümü kullanıyorsunuz.' };
    } catch (e: any) {
      return { state: 'error', message: e.message || 'Güncelleme denetimi tamamlanamadı.' };
    }
  });
  handle('session', async (value) => {
    if (value) {
      const s = z
        .object({
          documents: z.array(z.object({ id: idSchema, pinned: z.boolean().optional() })).max(100),
          activeId: idSchema,
          mode: z.enum(['read', 'edit', 'source', 'split']),
        })
        .parse(value);
      const documents = s.documents
        .filter((d) => caps.has(d.id))
        .map((d) => ({
          path: caps.get(d.id),
          pinned: !!d.pinned,
          encoding: encodings.get(caps.get(d.id)!),
        }));
      await jsonWrite('session.json', {
        documents,
        activePath: caps.get(s.activeId),
        mode: s.mode,
      });
      return { files: [] };
    }
    const settings = await jsonRead('settings.json', {});
    if (settings.restore === false || pendingPaths.length) return { files: [] };
    const saved = await jsonRead('session.json', {}),
      files = [];
    for (const document of (saved.documents || []).slice(0, 100)) {
      try {
        if (document.encoding) encodings.set(document.path, document.encoding);
        const file = await readFile(document.path);
        track(file);
        files.push({ ...file, pinned: !!document.pinned });
      } catch {
        /* Missing files remain in recent files, without preventing startup. */
      }
    }
    return {
      files,
      activeId: files.find((f) => f.path === saved.activePath)?.id,
      mode: saved.mode,
    };
  });
  handle('assets:add', async (id, data, name) => {
    const doc = authorize(id),
      b64 = z
        .string()
        .max(40 * 1024 * 1024)
        .parse(data),
      filename = z.string().max(255).parse(name);
    const ext = path.extname(filename).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext))
      throw new Error('Desteklenmeyen görsel türü.');
    const dirName = path.basename(doc, path.extname(doc)) + '.assets',
      dir = path.join(path.dirname(doc), dirName);
    await fs.mkdir(dir, { recursive: true });
    const safe = `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    await fs.writeFile(path.join(dir, safe), Buffer.from(b64, 'base64'), { flag: 'wx' });
    return `${dirName}/${safe}`;
  });
  handle('assets:read', async (id, reference) => {
    const doc = authorize(id),
      ref = z.string().max(4096).parse(reference);
    if (/^[a-z]+:|^\/\//i.test(ref)) throw new Error('Harici görsel için izin gerekli.');
    const root = path.dirname(doc),
      full = await fs.realpath(path.resolve(root, decodePath(ref)));
    if (!inside(root, full)) throw new Error('ACCESS_DENIED: Görsel belge klasörünün dışında.');
    const stat = await fs.stat(full);
    if (stat.size > 25 * 1024 * 1024) throw new Error('Görsel 25 MiB sınırını aşıyor.');
    const ext = path.extname(full).toLowerCase();
    const mime: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    if (!mime[ext]) throw new Error('Görsel türü desteklenmiyor.');
    return `data:${mime[ext]};base64,${(await fs.readFile(full)).toString('base64')}`;
  });
  handle('assets:resource', async (value) => {
    const url = new URL(z.string().max(4096).parse(value));
    if (url.protocol !== 'file:') throw new Error('ACCESS_DENIED');
    const root = await fs.realpath(path.join(here, '../dist')),
      file = await fs.realpath(fileURLToPath(url));
    if (!inside(root, file) || !/\.(woff2?|ttf)$/i.test(file)) throw new Error('ACCESS_DENIED');
    const bytes = await fs.readFile(file);
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Kaynak boyutu aşıldı.');
    return `data:font/${path.extname(file).slice(1)};base64,${bytes.toString('base64')}`;
  });
  handle('diagrams:render', (source, id) => {
    z.string().max(262144).parse(source);
    z.string()
      .regex(/^diagram-\d+$/)
      .parse(id);
    const job = diagramQueue
      .catch(() => {})
      .then(async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const render = (async () => {
            if (!drawingWindow || drawingWindow.isDestroyed()) {
              drawingWindow = new BrowserWindow({
                show: false,
                width: 1400,
                height: 900,
                webPreferences: {
                  sandbox: true,
                  contextIsolation: true,
                  nodeIntegration: false,
                  backgroundThrottling: false,
                },
              });
              drawingWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
              drawingWindow.webContents.on('will-navigate', (event) => event.preventDefault());
              if (process.env.VITE_DEV_SERVER_URL)
                await drawingWindow.loadURL(process.env.VITE_DEV_SERVER_URL + '/diagram.html');
              else await drawingWindow.loadFile(path.join(here, '../dist/diagram.html'));
            }
            const svg = await drawingWindow.webContents.executeJavaScript(
              `window.renderDiagram(${JSON.stringify(source)}, ${JSON.stringify(id)})`,
            );
            return z
              .string()
              .max(8 * 1024 * 1024)
              .parse(svg);
          })();
          return await Promise.race([
            render,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                drawingWindow?.destroy();
                drawingWindow = null;
                reject(
                  new Error('RENDER_TIMEOUT: Diyagram 5 saniyede çizilemedi. Kaynağı korunuyor.'),
                );
              }, 5000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      });
    diagramQueue = job;
    return job;
  });
  handle('export:file', async (name, data, format) => {
    const ext = z.enum(['md', 'html', 'zip', 'svg', 'png', 'csv', 'tsv', 'json']).parse(format);
    sourceSchema.parse(data);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.basename(z.string().parse(name)),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return false;
    const bytes = Buffer.from(data, 'base64'),
      temp = `${result.filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp, bytes, { flag: 'wx' });
      await fs.rename(temp, result.filePath);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
    return true;
  });
  handle('export:pdf', async (html, landscape) => {
    sourceSchema.parse(html);
    const result = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return false;
    const print = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        partition: 'folio-print-' + randomUUID(),
      },
    });
    print.webContents.session.webRequest.onBeforeRequest((details, cb) =>
      cb({ cancel: !details.url.startsWith('data:') && !details.url.startsWith('blob:') }),
    );
    print.webContents.session.setPermissionRequestHandler((_a, _b, callback) => callback(false));
    print.webContents.on('will-navigate', (e) => e.preventDefault());
    try {
      await print.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const bytes = await print.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        landscape: !!landscape,
        margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      });
      const temp = `${result.filePath}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temp, bytes);
        await fs.rename(temp, result.filePath);
      } finally {
        await fs.unlink(temp).catch(() => {});
      }
      return true;
    } finally {
      print.destroy();
    }
  });
  handle('external', async (url) => {
    const parsed = new URL(z.string().max(4096).parse(url));
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol))
      throw new Error('UNSAFE_CONTENT');
    await shell.openExternal(parsed.toString());
  });
  ipcMain.on('renderer:ready', async (event) => {
    if (event.sender !== win.webContents) return;
    rendererReady = true;
    const paths = pendingPaths.splice(0);
    if (paths.length) win.webContents.send('files:opened', await openPaths(paths));
  });
  ipcMain.on('window:close-approved', (event) => {
    if (event.sender === win.webContents) {
      closing = true;
      win.close();
    }
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f6f5f1',
    title: 'Folio',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (!closing) {
      e.preventDefault();
      win.webContents.send('menu', 'close-app');
    }
  });
  win.on('closed', () => {
    drawingWindow?.destroy();
    drawingWindow = null;
    app.quit();
  });
  const send = (a: string) => () => win.webContents.send('menu', a);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'Folio',
              submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: 'Dosya',
        submenu: [
          { label: 'Yeni belge', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Aç…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { label: 'Kaydet', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { label: 'Farklı kaydet…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
          { label: 'PDF dışa aktar…', accelerator: 'CmdOrCtrl+P', click: send('pdf') },
        ],
      },
      {
        label: 'Düzenle',
        submenu: [
          { label: 'Geri al', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'İleri al', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Görünüm',
        submenu: [
          { label: 'Oku', click: send('read') },
          { label: 'Düzenle', click: send('edit') },
          { label: 'Kaynak', click: send('source') },
          { label: 'Bölünmüş', click: send('split') },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { role: 'toggleDevTools' },
        ],
      },
    ]),
  );
  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(here, '../dist/index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('open-file', (e, file) => {
    e.preventDefault();
    if (rendererReady) void openPaths([file]).then((f) => win.webContents.send('files:opened', f));
    else pendingPaths.push(file);
  });
  app.on('second-instance', (_, argv) => {
    win?.show();
    win?.focus();
    void openPaths(argv.filter((p) => /\.(md|markdown)$/i.test(p))).then((f) =>
      win.webContents.send('files:opened', f),
    );
  });
  app
    .whenReady()
    .then(async () => {
      try {
        await fs.mkdir(dataRoot(), { recursive: true });
        await fs.access(dataRoot(), 2);
      } catch {
        const result = await dialog.showMessageBox({
          type: 'warning',
          message: 'Uygulama veri klasörüne yazılamıyor.',
          detail:
            'Ayarlar ve kurtarma taslakları için yazılabilir bir konum gerekli. Geçici oturum verileri taşınabilir klasöre kaydedilmez.',
          buttons: ['Veri klasörü seç', 'Geçici oturum', 'Çık'],
          cancelId: 2,
        });
        if (result.response === 2) {
          app.quit();
          return;
        }
        if (result.response === 1)
          app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'folio-session-')));
        else {
          const directory = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
          });
          if (directory.canceled) {
            app.quit();
            return;
          }
          const selected = path.join(directory.filePaths[0], 'Folio-data');
          await fs.mkdir(selected, { recursive: true });
          app.setPath('userData', selected);
        }
      }
      session.defaultSession.setPermissionRequestHandler((_a, _b, cb) => cb(false));
      session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
        const url = new URL(details.url);
        const localDev =
          !!process.env.VITE_DEV_SERVER_URL && ['127.0.0.1', 'localhost'].includes(url.hostname);
        cb({
          cancel:
            ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
            !localDev &&
            !updateOrigins.has(url.origin),
        });
      });
      handlers();
      createWindow();
      pendingPaths.push(...process.argv.slice(1).filter((p) => /\.(md|markdown)$/i.test(p)));
    })
    .catch((error) => {
      dialog.showErrorBox('Folio başlatılamadı', String(error));
      app.quit();
    });
  app.on('window-all-closed', () => {
    for (const watcher of watchers.values()) watcher.close();
    app.quit();
  });
}
