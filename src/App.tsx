import { useDocumentZoom } from './hooks/useDocumentZoom';
import { useT, setUILanguage, translate } from './ui';
import { useCallback, useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react';
import { EditorView as CodeMirrorView } from '@codemirror/view';
import type { Editor } from '@tiptap/core';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Code2,
  Command,
  FileText,
  FolderOpen,
  Search,
  Settings2,
  Plus,
  MoreHorizontal,
  PanelLeft,
  ArrowUpRight,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Undo2,
  Redo2,
  Link2,
  ImagePlus,
  Table2,
  Sigma,
  Shapes,
  Download,
  Check,
  X,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  CircleHelp,
  Clock3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  FileArchive,
  Printer,
  AlertCircle,
  Sparkles,
  Bookmark,
  ListTree,
} from 'lucide-react';
import { api, exportZip, isDesktop } from './platform';
import { countWords, headings, parse, project } from './core/markdown';
import { DocumentHistory } from './core/history';
import { parseCSV, tableMarkdown, stringifyCSV } from './core/csv';
import { selectedRect, moveTableRow, moveTableColumn } from '@tiptap/pm/tables';
import { CSVDialog } from './components/CSVDialog';
import { AboutDialog } from './components/AboutDialog';
import { Preview } from './components/Preview';
import type { BlockEdit } from './components/VisualEditor';
const VisualEditor = lazy(() =>
  import('./components/VisualEditor').then((module) => ({ default: module.VisualEditor })),
);
import { SourceEditor } from './components/SourceEditor';
import { Modal } from './components/Modal';
import { MergeDialog } from './components/MergeDialog';
import { SearchDialog } from './components/SearchDialog';
import { FolderSearchDialog } from './components/FolderSearchDialog';
import { MathDialog } from './components/MathDialog';
import { DiagramDialog } from './components/DiagramDialog';
import { BlockDialog } from './components/BlockDialog';
import { welcome } from './sample';
import type { DiskFile, Draft, FileEntry, Tab } from './types';
import { parseSettings, storedSettingsSchema, type Settings } from './core/settings';

type Mode = 'read' | 'edit' | 'source' | 'split';
const defaults: Settings = {
  theme: 'light',
  font: 'sans',
  width: 780,
  fontSize: 15,
  autosave: false,
  restore: true,
  language: 'tr',
};
const tabOf = (f: DiskFile): Tab => ({ ...f, saved: f.source, revision: 0 });
const demo: Tab = tabOf({ id: 'welcome', name: 'Folio’ya hoş geldin.md', source: welcome });
const modeLabels: Record<Mode, string> = {
  read: 'Oku',
  edit: 'Düzenle',
  source: 'Kaynak',
  split: 'Bölünmüş',
};
const now = () => new Date().toISOString();
function IconButton({
  title,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`icon-button ${active ? 'active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
type FileAction = 'rename' | 'trash' | 'reveal' | 'create-file' | 'create-folder';
function FolderItem({
  entry,
  onOpen,
  onAction,
}: {
  entry: FileEntry;
  onOpen: (id: string) => void;
  onAction: (action: FileAction, id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(entry.id === 'workspace'),
    [kids, setKids] = useState<FileEntry[]>([]),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    if (open && entry.directory) void api.children(entry.id).then(setKids);
  }, [open, entry.id]);
  return (
    <div className="folder-item">
      <div className="folder-row">
        <button
          onClick={() => {
            if (!entry.directory) onOpen(entry.id);
            else setOpen(!open);
          }}
        >
          {entry.directory ? (
            <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : '' }} />
          ) : (
            <FileText size={14} />
          )}
          <span>{entry.name}</span>
        </button>
        <button aria-label={entry.name + ' dosya işlemleri'} onClick={() => setMenu(!menu)}>
          <MoreHorizontal size={13} />
        </button>
      </div>
      {menu && (
        <div className="folder-inline-menu">
          {(entry.directory
            ? [
                ['create-file', 'Yeni dosya'],
                ['create-folder', 'Yeni klasör'],
              ]
            : []
          )
            .concat(
              entry.id !== 'workspace'
                ? [
                    ['rename', 'Yeniden adlandır'],
                    ['trash', 'Çöp kutusuna taşı'],
                  ]
                : [],
              [['reveal', 'Sistemde göster']],
            )
            .map(([action, label]) => (
              <button
                key={action}
                onClick={() => {
                  onAction(action as FileAction, entry.id, entry.name);
                  setMenu(false);
                }}
              >
                {label}
              </button>
            ))}
        </div>
      )}
      {open && (
        <div className="folder-children">
          {kids.map((e) => (
            <FolderItem key={e.id} entry={e} onOpen={onOpen} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}
export default function App() {
  const ui = useT();

  const [tabs, setTabs] = useState<Tab[]>([demo]),
    [activeId, setActiveId] = useState('welcome'),
    [mode, setMode] = useState<Mode>('read');
  const [sidebar, setSidebar] = useState(true),
    [sideTab, setSideTab] = useState<'outline' | 'files'>('outline'),
    [settings, setSettings] = useState<Settings>(defaults),
    [zoom, setZoom] = useState(100),
    [focus, setFocus] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null),
    [block, setBlock] = useState<BlockEdit | null>(null),
    [dropdown, setDropdown] = useState<string | null>(null),
    [toast, setToast] = useState(''),
    [saving, setSaving] = useState(false),
    [draftState, setDraftState] = useState('');
  const [recents, setRecents] = useState<{ id: string; name: string; path: string }[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [history, setHistory] = useState<Draft[]>([]),
    [folder, setFolder] = useState<FileEntry[]>([]),
    [diskConflict, setDiskConflict] = useState<DiskFile | null>(null);
  const [tableRows, setTableRows] = useState(3),
    [tableCols, setTableCols] = useState(3),
    [landscape, setLandscape] = useState(false);
  const [confirm, setConfirm] = useState<{
      name: string;
      resolve: (v: 'save' | 'discard' | 'cancel') => void;
    } | null>(null),
    [, forceRender] = useState(0);
  const [sessionReady, setSessionReady] = useState(false),
    [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const settingsFile = useRef<HTMLInputElement>(null);
  const [importedSettings, setImportedSettings] = useState<Settings | null>(null);
  const [fileRequest, setFileRequest] = useState<{
      action: FileAction;
      id: string;
      name: string;
    } | null>(null),
    [fileName, setFileName] = useState(''),
    [treeRevision, setTreeRevision] = useState(0);
  const pageZoom = useDocumentZoom(
    mode !== 'source',
    settings.width + 100,
    !!dialog || !!block || !!confirm,
  );
  const closedTabs = useRef<Tab[]>([]);
  const histories = useRef(new Map<string, DocumentHistory>());
  const sourceView = useRef<CodeMirrorView | null>(null),
    sourceCursors = useRef(new Map<string, number>()),
    visualSelections = useRef(new Map<string, { from: number; to: number }>()),
    syncBusy = useRef(false);
  const editor = useRef<Editor | null>(null),
    tabsRef = useRef(tabs),
    activeRef = useRef(activeId),
    appAction = useRef<(a: string) => void>(() => {}),
    draftError = useRef(false);
  const workspace = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    csvInput = useRef<HTMLInputElement>(null);
  tabsRef.current = tabs;
  activeRef.current = activeId;
  const active = tabs.find((t) => t.id === activeId) || tabs[0];
  const outline = headings(active.source),
    dirty = active.source !== active.saved;
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const notify = useCallback((message: string) => {
    setToast(translate(message));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setUILanguage(settings.language);
  }, [settings.language]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  const update = useCallback((id: string, source: string) => {
    const previous = tabsRef.current.find((t) => t.id === id);
    if (!previous) return;
    if (!histories.current.has(id)) histories.current.set(id, new DocumentHistory(previous.source));
    histories.current.get(id)!.record(source);
    setTabs((all) =>
      all.map((t) =>
        t.id === id && t.source !== source ? { ...t, source, revision: t.revision + 1 } : t,
      ),
    );
    setDraftState('');
  }, []);
  const addFiles = useCallback((files: DiskFile[]) => {
    if (!files.length) return;
    setTabs((old) => {
      const next = [...old];
      files.forEach((f) => {
        const found = next.findIndex((t) => t.id === f.id);
        if (found < 0) next.push(tabOf(f));
      });
      return next;
    });
    setActiveId(files.at(-1)!.id);
    setMode('read');
    void api.recents().then(setRecents);
  }, []);
  const newFile = useCallback(() => {
    const id = crypto.randomUUID();
    const n = tabsRef.current.filter((t) => /^Adsız/.test(t.name)).length + 1;
    setTabs((old) => [...old, tabOf({ id, name: `Adsız ${n}.md`, source: '' })]);
    setActiveId(id);
    setMode('edit');
    editor.current = null;
  }, []);
  const openFile = useCallback(async () => {
    try {
      addFiles(await api.open());
    } catch (e: any) {
      notify(e.message);
    }
  }, [addFiles, notify]);
  const saveTab = useCallback(
    async (id: string, saveAs = false) => {
      const file = tabsRef.current.find((t) => t.id === id);
      if (!file) return false;
      setSaving(true);
      try {
        const result = await api.save(file, saveAs);
        if (!result.ok) {
          if (result.conflict) {
            try {
              setDiskConflict(await api.read(id));
            } catch {
              notify('Dosya diskte bulunamadı. Farklı kaydetmeyi kullanın.');
            }
          } else if (!result.canceled) notify(result.error || 'Kaydetme başarısız.');
          return false;
        }
        const saved = result.file!;
        setTabs((all) =>
          all.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...saved,
                  source: t.source === file.source ? saved.source : t.source,
                  saved: saved.source,
                  revision: t.revision,
                }
              : t,
          ),
        );
        if (tabsRef.current.find((t) => t.id === id)?.source === file.source)
          await api.removeDraft(id);
        setDraftState('');
        void api.recents().then(setRecents);
        notify(isDesktop ? 'Belge güvenle kaydedildi.' : 'Markdown dosyası indirildi.');
        return true;
      } catch (e: any) {
        notify(e.message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [notify],
  );
  const closeTab = useCallback(
    async (id: string, remove = true) => {
      const file = tabsRef.current.find((t) => t.id === id);
      if (!file) return true;
      if (file.source !== file.saved) {
        const choice = await new Promise<'save' | 'discard' | 'cancel'>((resolve) =>
          setConfirm({ name: file.name, resolve }),
        );
        setConfirm(null);
        if (choice === 'cancel') return false;
        if (choice === 'save' && !(await saveTab(id))) return false;
        if (choice === 'discard') await api.removeDraft(id);
      }
      if (!remove) return true;
      closedTabs.current = [...closedTabs.current.slice(-9), file];
      setTabs((all) => {
        const rest = all.filter((t) => t.id !== id);
        if (rest.length) {
          if (activeRef.current === id) setActiveId(rest.at(-1)!.id);
          return rest;
        }
        const fresh = tabOf({ id: crypto.randomUUID(), name: 'Adsız 1.md', source: '' });
        setActiveId(fresh.id);
        setMode('edit');
        return [fresh];
      });
      return true;
    },
    [saveTab],
  );
  useEffect(() => {
    void Promise.all([api.settings(), api.recents(), api.drafts(), api.session()])
      .then(([s, r, d, restored]) => {
        const checked = storedSettingsSchema.safeParse({ ...defaults, ...s });
        setSettings(checked.success ? checked.data : defaults);
        if (!checked.success) notify('Kayıtlı ayarlar geçersiz; varsayılan görünüm kullanılıyor.');
        setRecents(r);
        setDrafts(d);
        if (restored.files.length && tabsRef.current.every((t) => t.id === 'welcome')) {
          setTabs(restored.files.map(tabOf));
          setActiveId(restored.activeId || restored.files[0].id);
          if (['read', 'edit', 'source', 'split'].includes(restored.mode || ''))
            setMode(restored.mode as Mode);
        }
        setSessionReady(true);
        if (d.length) setDialog('recovery');
      })
      .catch((e) => notify(e.message));
    const offOpen = api.onOpen(addFiles),
      offMenu = api.onMenu((action) => appAction.current(action));
    const offDisk = api.onDiskChange((file) => {
      const current = tabsRef.current.find((t) => t.id === file.id);
      if (!current) return;
      if ((file as any).missing) {
        notify(`${file.name} diskten taşındı veya silindi. İçeriğiniz açık tutuluyor.`);
        return;
      }
      if (file.hash === current.hash) return;
      if (current.source === current.saved)
        setTabs((all) => all.map((t) => (t.id === file.id ? tabOf(file) : t)));
      else setDiskConflict(file);
    });
    const edit = (e: Event) => {
      setBlock((e as CustomEvent<BlockEdit>).detail);
      setDialog('block');
    };
    const notification = (event: Event) => notify((event as CustomEvent<string>).detail);
    window.addEventListener('folio-notify', notification);
    window.addEventListener('folio-edit-block', edit);
    api.ready();
    return () => {
      offOpen();
      offMenu();
      offDisk();
      window.removeEventListener('folio-edit-block', edit);
      window.removeEventListener('folio-notify', notification);
    };
  }, []);
  const sessionKey = JSON.stringify({
    documents: tabs.map((t) => ({ id: t.id, pinned: t.pinned, path: t.path })),
    activeId,
    mode,
  });
  useEffect(() => {
    if (!sessionReady) return;
    const timer = setTimeout(() => {
      void api.session(JSON.parse(sessionKey)).catch((e) => notify(e.message));
    }, 350);
    return () => clearTimeout(timer);
  }, [sessionKey, sessionReady]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (tabsRef.current.some((t) => t.source !== t.saved)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  useEffect(() => {
    const persist = async () => {
      for (const tab of tabsRef.current.filter((t) => t.source !== t.saved)) {
        try {
          await api.draft({
            id: tab.id,
            name: tab.name,
            path: tab.path,
            source: tab.source,
            date: now(),
          });
          setDraftState('Taslak korundu');
          draftError.current = false;
        } catch {
          if (!draftError.current) notify('Kurtarma taslağı yazılamadı. Belgenizi kaydedin.');
          draftError.current = true;
        }
      }
    };
    const idle = setTimeout(persist, 2000);
    return () => clearTimeout(idle);
  }, [tabs]);
  useEffect(() => {
    const timer = setInterval(() => {
      void Promise.all(
        tabsRef.current
          .filter((t) => t.source !== t.saved)
          .map((t) =>
            api
              .draft({ id: t.id, name: t.name, path: t.path, source: t.source, date: now() })
              .catch(() => notify('Taslak kaydı başarısız.')),
          ),
      );
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!settings.autosave || !dirty || !active.path) return;
    const timer = setTimeout(() => void saveTab(active.id), 2000);
    return () => clearTimeout(timer);
  }, [active.source, settings.autosave]);
  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${active.name} — Folio`;
  }, [active.name, dirty]);
  const changeSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void api.settings(next).catch((e) => notify(e.message));
  };
  function switchMode(next: Mode) {
    if (editor.current && !editor.current.isDestroyed && mode === 'edit') {
      visualSelections.current.set(active.id, editor.current.state.selection);
      const index = editor.current.state.selection.$from.index(0);
      const node = parse(active.source).children[index];
      if (node) sourceCursors.current.set(active.id, node.position.start.offset);
    }
    if (sourceView.current && ['source', 'split'].includes(mode)) {
      sourceCursors.current.set(active.id, sourceView.current.state.selection.main.head);
      sourceView.current = null;
    }
    setMode(next);
  }
  function sourceScrolled(offset: number) {
    if (mode !== 'split' || syncBusy.current) return;
    const elements = [
      ...workspace.current!.querySelectorAll<HTMLElement>(
        '.document-sheet > .markdown-body > [data-offset]',
      ),
    ];
    const target =
      elements.filter((el) => Number(el.dataset.offset) <= offset).at(-1) || elements[0];
    const scroller = workspace.current?.querySelector('.document-scroll');
    if (target && scroller) {
      syncBusy.current = true;
      scroller.scrollTop +=
        target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 20;
      setTimeout(() => {
        syncBusy.current = false;
      }, 120);
    }
  }
  function previewScrolled() {
    if (mode !== 'split' || syncBusy.current || !sourceView.current || !workspace.current) return;
    const scroller = workspace.current.querySelector('.document-scroll')!;
    const elements = [
      ...workspace.current.querySelectorAll<HTMLElement>(
        '.document-sheet > .markdown-body > [data-offset]',
      ),
    ];
    const target = elements.find(
      (el) => el.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top + 20,
    );
    if (target) {
      syncBusy.current = true;
      sourceView.current.dispatch({
        effects: CodeMirrorView.scrollIntoView(
          Math.min(Number(target.dataset.offset), sourceView.current.state.doc.length),
          { y: 'start' },
        ),
      });
      setTimeout(() => {
        syncBusy.current = false;
      }, 120);
    }
  }
  function navigateHistory(redo = false) {
    const id = activeRef.current;
    const source = redo ? histories.current.get(id)?.redo() : histories.current.get(id)?.undo();
    if (source !== null && source !== undefined) {
      setTabs((all) =>
        all.map((t) => (t.id === id ? { ...t, source, revision: t.revision + 1 } : t)),
      );
    }
  }
  function insertMarkdown(markdown: string) {
    histories.current.get(activeRef.current)?.isolate();
    const current = tabsRef.current.find((t) => t.id === activeRef.current)!;
    if (mode === 'edit' && editor.current && !editor.current.isDestroyed) {
      const json = project(markdown).doc.content || [];
      json.forEach((n) => {
        if (n.attrs) n.attrs.origin = null;
      });
      editor.current.chain().focus().insertContent(json).run();
    } else {
      update(
        current.id,
        current.source +
          (current.source.endsWith('\n\n') || !current.source ? '' : '\n\n') +
          markdown +
          '\n',
      );
      setMode('edit');
    }
  }
  function insertSpecial(kind: string) {
    setBlock({ kind, value: '', apply: (value) => insertMarkdown(value) });
    setDialog('block');
    setDropdown(null);
  }
  function command(fn: (e: Editor) => void) {
    if (mode !== 'edit') {
      setMode('edit');
      notify('Düzenleme görünümü açıldı. Metni seçip biçim uygulayabilirsin.');
      return;
    }
    if (editor.current) {
      fn(editor.current);
      forceRender((x) => x + 1);
    }
  }
  function insertFormula() {
    setBlock({ kind: 'math', value: '', apply: (v) => insertMarkdown('$$\n' + v + '\n$$') });
    setDialog('block');
    setDropdown(null);
  }
  function insertDiagram() {
    setBlock({
      kind: 'diagram',
      value: '',
      apply: (v) => insertMarkdown('```mermaid\n' + v + '\n```'),
    });
    setDialog('block');
    setDropdown(null);
  }
  function editDiagram(value: string, offset: number, end: number) {
    const current = active;
    setBlock({
      kind: 'diagram',
      value,
      apply: (v) => {
        const latest = tabsRef.current.find((t) => t.id === current.id);
        if (latest?.source !== current.source) {
          notify('Belge değişti. Diyagramı yeniden açın.');
          return;
        }
        update(
          current.id,
          current.source.slice(0, offset) +
            '```mermaid\n' +
            v +
            '\n```' +
            current.source.slice(end),
        );
      },
    });
    setDialog('block');
  }
  async function addImage(file: File) {
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Görsel 25 MiB sınırını aşıyor.');
      const current = tabsRef.current.find((t) => t.id === activeRef.current)!;
      if (isDesktop && !current.path && !(await saveTab(current.id))) return;
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const reference = await api.addAsset(current.id, data, file.name);
      insertMarkdown(`![${file.name.replace(/\.[^.]+$/, '')}](${reference})`);
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function performFileAction(action: FileAction, id: string, name: string) {
    if (action === 'reveal') {
      await api.fileAction(action, id);
      return;
    }
    if (action === 'trash') {
      if (!window.confirm(`${name} ${ui('çöp kutusuna taşınsın mı?')}`)) return;
      try {
        await api.fileAction(action, id);
        setTreeRevision((n) => n + 1);
      } catch (e: any) {
        notify(e.message);
      }
      return;
    }
    setFileRequest({ action, id, name });
    setFileName(action === 'rename' ? name : '');
    setDialog('file-operation');
  }
  async function applyFileOperation() {
    if (!fileRequest) return;
    try {
      const result = await api.fileAction(fileRequest.action, fileRequest.id, fileName);
      if (result.file) {
        if (fileRequest.action === 'rename')
          setTabs((all) =>
            all.map((t) =>
              t.id === fileRequest.id
                ? {
                    ...t,
                    path: result.file!.path,
                    name: result.file!.name,
                    hash: result.file!.hash,
                  }
                : t,
            ),
          );
        else addFiles([result.file]);
      }
      setTreeRevision((n) => n + 1);
      setDialog(null);
      setFileRequest(null);
    } catch (e: any) {
      notify(e.message);
    }
  }
  async function importCSV(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      notify('Tablo dosyası boyutu sınırını aşıyor.');
      return;
    }
    setCSVFile(file);
    setDialog('csv-import');
  }
  function moveTable(axis: 'row' | 'column', delta: number) {
    const ed = editor.current;
    if (!ed || !ed.isActive('table')) return;
    const rect = selectedRect(ed.state),
      from = axis === 'row' ? rect.top : rect.left,
      to = from + delta;
    if (
      (axis === 'row' && (from === 0 || to < 1 || to >= rect.map.height)) ||
      (axis === 'column' && (to < 0 || to >= rect.map.width))
    )
      return;
    histories.current.get(active.id)?.isolate();
    (axis === 'row' ? moveTableRow({ from, to }) : moveTableColumn({ from, to }))(
      ed.state,
      ed.view.dispatch,
    );
  }
  async function exportTable(format: 'csv' | 'tsv') {
    const ed = editor.current;
    if (!ed || !ed.isActive('table')) return;
    const table = selectedRect(ed.state).table,
      rows: string[][] = [];
    table.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => cells.push(cell.textContent));
      rows.push(cells);
    });
    await api.exportFile(
      'tablo.' + format,
      stringifyCSV(rows, format === 'tsv' ? '\t' : ',', true),
      format,
    );
  }

  async function snapshotHTML() {
    setDropdown(null);
    const old = mode;
    setMode('read');
    await new Promise((r) => setTimeout(r, 120));
    const root = workspace.current?.querySelector('.document-sheet > .markdown-body');
    if (!root) throw new Error('Belge görünümü hazırlanamadı.');
    const timeout = Date.now() + 12000;
    while (root.querySelector('.loading-diagram') && Date.now() < timeout)
      await new Promise((r) => setTimeout(r, 100));
    if (root.querySelector('.loading-diagram,.render-error'))
      throw new Error('Bazı diyagramlar hazır değil. Çizim hatalarını giderip yeniden deneyin.');
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button,.diagram-caption').forEach((n) => n.remove());
    clone.querySelectorAll('details').forEach((n) => (n.open = true));
    clone.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const el = input as HTMLInputElement;
      el.replaceWith(document.createTextNode(el.checked ? '☑ ' : '☐ '));
    });
    const styles = await Promise.all(
      [...document.styleSheets].map(async (sheet) => {
        try {
          return [...sheet.cssRules]
            .map((rule) =>
              rule.cssText.replace(/url\(["']?([^)'"\s]+)["']?\)/g, (match, url) =>
                url.startsWith('data:') || url.startsWith('#')
                  ? match
                  : `url("${new URL(url, sheet.href || location.href).href}")`,
              ),
            )
            .join('\n');
        } catch {
          return '';
        }
      }),
    );
    let css = styles.join('\n');
    const fontUrls = [
      ...new Set(
        [...css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)]
          .map((m) => m[1])
          .filter((url) => !url.startsWith('data:') && /\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(url)),
      ),
    ];
    for (const fontUrl of fontUrls) {
      try {
        const url = new URL(fontUrl, location.href).href;
        const data =
          isDesktop && url.startsWith('file:')
            ? await api.resource(url)
            : await (async () => {
                const response = await fetch(url);
                const blob = await response.blob();
                return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.readAsDataURL(blob);
                });
              })();
        css = css.split(fontUrl).join(data);
      } catch {
        /* System fallback remains available. */
      }
    }
    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${active.name.replace(/[<>&"']/g, '')}</title><style>${css}\nbody{background:white!important;color:#242b21!important;padding:40px;margin:auto;max-width:850px}.markdown-body{color:#242b21;font-size:15px}.diagram-preview{break-inside:avoid}.markdown-body h2,.markdown-body h3{break-after:avoid}.markdown-body table{width:100%}thead{display:table-header-group}img{max-width:100%}@media print{body{padding:0;max-width:none}.code-wrap{break-inside:avoid}}</style></head><body>${clone.outerHTML}</body></html>`;
    setMode(old);
    return html;
  }
  async function exportDocument(format: 'pdf' | 'html' | 'zip' | 'md') {
    try {
      setDropdown(null);
      setToast('Çıktı hazırlanıyor…');
      if (format === 'zip') await exportZip(active.name, active.source, active.id);
      else if (format === 'md') await api.exportFile(active.name, active.source, 'md');
      else {
        const html = await snapshotHTML();
        if (format === 'pdf') await api.pdf(html, landscape);
        else await api.exportFile(active.name.replace(/\.[^.]+$/, '') + '.html', html, 'html');
      }
      setToast('Çıktı işlemi tamamlandı.');
    } catch (e: any) {
      notify(e.message);
    }
  }
  appAction.current = (action) => {
    if (action === 'undo' || action === 'redo') navigateHistory(action === 'redo');
    else if (action === 'reopen') {
      const previous = closedTabs.current.pop();
      if (previous) {
        setTabs((all) => [...all.filter((t) => t.id !== previous.id), previous]);
        setActiveId(previous.id);
      }
    } else if (action === 'new') newFile();
    else if (action === 'open') void openFile();
    else if (action === 'save') void saveTab(activeRef.current);
    else if (action === 'save-as') void saveTab(activeRef.current, true);
    else if (action === 'pdf') void exportDocument('pdf');
    else if (['read', 'edit', 'source', 'split'].includes(action)) setMode(action as Mode);
    else if (action === 'close-app')
      void (async () => {
        for (const t of [...tabsRef.current]) if (!(await closeTab(t.id, false))) return;
        await api.session({
          documents: tabsRef.current.map((t) => ({ id: t.id, pinned: t.pinned })),
          activeId: activeRef.current,
          mode,
        });
        api.approveClose();
      })();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdown(null);
        if (focus) setFocus(false);
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !dialog) {
        e.preventDefault();
        e.stopImmediatePropagation();
        navigateHistory(e.shiftKey);
        return;
      }
      if (k === 's') {
        e.preventDefault();
        void saveTab(activeRef.current, e.shiftKey);
      }
      if (k === 'o') {
        e.preventDefault();
        void openFile();
      }
      if (k === 'n' && !e.shiftKey) {
        e.preventDefault();
        newFile();
      }
      if (k === 'f') {
        e.preventDefault();
        setDialog('find');
      }
      if (k === 'p') {
        e.preventDefault();
        setDialog(e.shiftKey ? 'commands' : 'export');
      }
      if (k === 't' && e.shiftKey) {
        e.preventDefault();
        appAction.current('reopen');
      }
      if (k === 'w') {
        e.preventDefault();
        void closeTab(activeRef.current);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [focus, saveTab, openFile, newFile, closeTab, dialog]);
  useEffect(() => {
    if (!dropdown) return;
    const click = () => setDropdown(null);
    setTimeout(() => window.addEventListener('click', click), 0);
    return () => window.removeEventListener('click', click);
  }, [dropdown]);

  const words = countWords(active.source),
    readMinutes = Math.max(1, Math.ceil(words / 220));
  const openBlock = (next: string) => {
    if (next === 'math') insertFormula();
    else if (next === 'diagram') insertDiagram();
    else if (next === 'table') {
      setDialog('table');
      setDropdown(null);
    } else insertSpecial(next);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (image) {
      e.preventDefault();
      e.stopPropagation();
      void addImage(image);
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (
      mode === 'edit' &&
      editor.current?.isActive('table') &&
      text.includes('\t') &&
      !e.clipboardData.getData('text/html').includes('<table')
    ) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const rows = parseCSV(text, '\t');
        if (rows.length * Math.max(...rows.map((r) => r.length)) > 5000)
          throw new Error('Tablo boyutu sınırı aşıldı.');
        const escape = (s: string) =>
          s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        editor.current.view.pasteHTML(
          '<table>' +
            rows
              .map(
                (row) =>
                  '<tr>' + row.map((cell) => '<td>' + escape(cell) + '</td>').join('') + '</tr>',
              )
              .join('') +
            '</table>',
        );
      } catch (error: any) {
        notify(error.message);
      }
    }
  };

  return (
    <div className={`app-shell ${focus ? 'focus-mode' : ''}`} onPasteCapture={onPaste}>
      <input
        type="file"
        ref={fileInput}
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addImage(f);
          e.target.value = '';
        }}
      />
      <input
        type="file"
        ref={csvInput}
        accept=".csv,.tsv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importCSV(f);
          e.target.value = '';
        }}
      />
      <div className="titlebar">
        <span className="titlebar-center">
          {ui('Folio')}
          <span>{ui('—')}</span>
          {ui('düşüncelerine yer aç.')}
        </span>
        <span className="titlebar-local">
          <span className="tiny-dot" />
          {ui('YEREL ÇALIŞMA ALANI')}
        </span>
      </div>
      <div className="app-content">
        {sidebar && !focus && (
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">
                <BookOpen size={23} strokeWidth={1.7} />
              </div>
              <span>
                {ui('folio')}
                <span className="brand-period">{ui('.')}</span>
              </span>
              <button
                title={ui('Paneli gizle')}
                aria-label={ui('Paneli gizle')}
                onClick={() => setSidebar(false)}
              >
                <ChevronsLeft size={16} />
              </button>
            </div>
            <button aria-label={ui('Yeni belge')} className="new-document" onClick={newFile}>
              <Plus size={16} />
              {ui('Yeni belge')}
              <span>{ui('⌘ N')}</span>
            </button>
            <div className="sidebar-actions">
              <button aria-label={ui('Dosya aç')} onClick={openFile}>
                <FolderOpen size={16} />
                {ui('Dosya aç')}
                <span>{ui('⌘ O')}</span>
              </button>
              <button aria-label={ui('Belgede ara')} onClick={() => setDialog('find')}>
                <Search size={16} />
                {ui('Belgede ara')}
                <span>{ui('⌘ F')}</span>
              </button>
            </div>
            <div className="sidebar-section-title">
              {ui('ÇALIŞMA ALANI')}
              <button
                title={ui('Klasör aç')}
                aria-label={ui('Klasör aç')}
                onClick={async () => {
                  try {
                    const files = await api.folder();
                    if (!isDesktop) notify('Klasör gezgini masaüstü uygulamasında kullanılabilir.');
                    setFolder(files);
                    setSideTab('files');
                  } catch (e: any) {
                    notify(e.message);
                  }
                }}
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="document-list">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className={t.id === activeId ? 'selected' : ''}
                  onClick={() => {
                    setActiveId(t.id);
                    editor.current = null;
                  }}
                >
                  <FileText size={15} />
                  <span>{t.name.replace(/\.md$/, '')}</span>
                  {t.source !== t.saved && <span className="unsaved-dot" />}
                </button>
              ))}
            </div>
            <div className="sidebar-divider" />
            <div className="sidebar-switch">
              <button
                className={sideTab === 'outline' ? 'active' : ''}
                onClick={() => setSideTab('outline')}
              >
                <ListTree size={13} />
                {ui('İçindekiler')}
              </button>
              <button
                className={sideTab === 'files' ? 'active' : ''}
                onClick={() => setSideTab('files')}
              >
                <FolderOpen size={13} />
                {ui('Dosyalar')}
              </button>
            </div>
            {sideTab === 'files' && folder.length > 0 && (
              <button className="folder-search-button" onClick={() => setDialog('folder-search')}>
                <Search size={13} />
                {ui('Klasörde ara ve değiştir')}
              </button>
            )}
            <div className="sidebar-scroll">
              {sideTab === 'outline' ? (
                <nav className="outline" aria-label={ui('Belge içindekiler')}>
                  {outline.length ? (
                    outline.map((h, i) => (
                      <button
                        className={i === 0 ? 'first-heading' : ''}
                        style={{ paddingLeft: `${Math.max(0, h.depth - 1) * 12 + 12}px` }}
                        key={h.id}
                        onClick={() => {
                          const element = document.getElementById(h.id);
                          if (element)
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          else if (mode === 'edit' && editor.current) {
                            let found = -1;
                            editor.current.state.doc.descendants((node, pos) => {
                              if (
                                node.type.name === 'heading' &&
                                node.textContent === h.text &&
                                found < 0
                              )
                                found = pos;
                            });
                            if (found >= 0)
                              editor.current
                                .chain()
                                .focus()
                                .setTextSelection(found + 1)
                                .scrollIntoView()
                                .run();
                          }
                        }}
                      >
                        <span className="outline-line" />
                        <span>{h.text}</span>
                      </button>
                    ))
                  ) : (
                    <p className="sidebar-empty">
                      {ui('Başlık eklediğinde belge yapısı burada görünecek.')}
                    </p>
                  )}
                </nav>
              ) : folder.length ? (
                <div>
                  {folder.map((f) => (
                    <FolderItem
                      key={f.id + treeRevision}
                      entry={f}
                      onAction={performFileAction}
                      onOpen={async (id) => {
                        try {
                          addFiles([await api.read(id)]);
                        } catch (e: any) {
                          notify(e.message);
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="sidebar-empty">
                  <FolderOpen size={24} />
                  <p>{ui('Bir klasörle çalış')}</p>
                  <button
                    className="text-button"
                    onClick={async () => {
                      if (!isDesktop) {
                        notify('Klasör erişimi için masaüstü uygulamasını açın.');
                        return;
                      }
                      setFolder(await api.folder());
                    }}
                  >
                    {ui('Klasör seç')}
                  </button>
                  {recents.length > 0 && (
                    <>
                      <div className="sidebar-section-title">{ui('SON AÇILANLAR')}</div>
                      {recents.map((r) => (
                        <button
                          className="recent-file"
                          key={r.id}
                          onClick={async () => {
                            try {
                              addFiles([await api.read(r.id)]);
                            } catch (e: any) {
                              notify(e.message);
                            }
                          }}
                        >
                          {r.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="local-note">
              <div className="local-note-icon">
                <ShieldCheck size={17} />
              </div>
              <div>
                <strong>{ui('Sadece senin bilgisayarında.')}</strong>
                <span>{ui('Dosyaların her zaman sana ait.')}</span>
              </div>
            </div>
            <div className="sidebar-bottom">
              <button onClick={() => setDialog('settings')}>
                <Settings2 size={16} />
                {ui('Ayarlar')}
              </button>
              <button
                title={ui('Yardım ve kısayollar')}
                aria-label={ui('Yardım ve kısayollar')}
                onClick={() => setDialog('help')}
              >
                <CircleHelp size={17} />
              </button>
            </div>
          </aside>
        )}
        <main className="main-panel">
          {!focus && (
            <>
              <div className="tabbar">
                {!sidebar && (
                  <IconButton title={ui('Yan paneli aç')} onClick={() => setSidebar(true)}>
                    <PanelLeft size={16} />
                  </IconButton>
                )}
                <div className="tabs" role="tablist">
                  {tabs.map((t) => (
                    <div
                      className={`tab ${t.id === activeId ? 'active' : ''} ${t.pinned ? 'pinned' : ''}`}
                      key={t.id}
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData('application/folio-tab', t.id)
                      }
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = event.dataTransfer.getData('application/folio-tab');
                        setTabs((all) => {
                          const moving = all.find((x) => x.id === from);
                          if (!moving || moving.pinned !== t.pinned) return all;
                          const rest = all.filter((x) => x.id !== from),
                            index = rest.findIndex((x) => x.id === t.id);
                          rest.splice(index, 0, moving);
                          return rest;
                        });
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setTabMenu({ id: t.id, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <button
                        role="tab"
                        aria-selected={t.id === activeId}
                        onClick={() => {
                          setActiveId(t.id);
                          editor.current = null;
                        }}
                      >
                        <FileText size={14} />
                        {t.pinned && <Bookmark size={10} />}
                        <span>{t.name}</span>
                        {t.source !== t.saved && <span className="unsaved-dot" />}
                      </button>
                      <button
                        className="tab-close"
                        title={ui('Sekmeyi kapat')}
                        aria-label={`${t.name} sekmesini kapat`}
                        onClick={() => void closeTab(t.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <IconButton title={ui('Yeni sekme')} onClick={newFile}>
                  <Plus size={16} />
                </IconButton>
                <div className="tabbar-end">
                  <IconButton title={ui('Odak modu')} onClick={() => setFocus(true)}>
                    <Maximize2 size={15} />
                  </IconButton>
                  <IconButton title={ui('Komutlar')} onClick={() => setDialog('commands')}>
                    <MoreHorizontal size={18} />
                  </IconButton>
                </div>
              </div>
              <div className="document-toolbar">
                <div className="breadcrumb">
                  <BookOpen size={14} />
                  <span>{ui('Belgelerim')}</span>
                  <ChevronRight size={12} />
                  <strong>{active.name}</strong>
                </div>
                <div className="document-actions">
                  <span className="saved-label">
                    <span className={`tiny-dot ${dirty ? 'amber' : ''}`} />
                    {ui(
                      saving
                        ? 'Kaydediliyor…'
                        : dirty
                          ? 'Değişiklikler var'
                          : active.path
                            ? 'Kaydedildi'
                            : 'Yerel belge',
                    )}
                  </span>
                  <button className="button small" onClick={() => void saveTab(active.id)}>
                    <Download size={14} />
                    {ui('Kaydet')}
                  </button>
                  <div className="dropdown-anchor">
                    <button
                      className="button small primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdown(dropdown === 'export' ? null : 'export');
                      }}
                    >
                      <ArrowUpRight size={14} />
                      {ui('Dışa aktar')}
                      <ChevronDown size={12} />
                    </button>
                    {dropdown === 'export' && (
                      <div className="dropdown-menu right" onClick={(e) => e.stopPropagation()}>
                        <span className="menu-heading">{ui('BELGENİ PAYLAŞ')}</span>
                        <button onClick={() => void exportDocument('pdf')}>
                          <Printer size={15} />
                          {ui('PDF belgesi')}
                        </button>
                        <button onClick={() => void exportDocument('html')}>
                          <Code2 size={15} />
                          {ui('Bağımsız HTML')}
                        </button>
                        <button onClick={() => void exportDocument('zip')}>
                          <FileArchive size={15} />
                          {ui('Belge + görseller (ZIP)')}
                        </button>
                        <button onClick={() => void exportDocument('md')}>
                          <FileText size={15} />
                          {ui('Markdown dosyası')}
                        </button>
                        <div className="menu-separator" />
                        <button
                          onClick={() => {
                            setDropdown(null);
                            setDialog('export');
                          }}
                        >
                          {ui('Çıktı ayarları…')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="formatbar">
            <div className="view-switch" aria-label={ui('Belge görünümü')}>
              {(['read', 'edit', 'source', 'split'] as Mode[]).map((m) => (
                <button
                  key={m}
                  className={mode === m ? 'active' : ''}
                  onClick={() => switchMode(m)}
                >
                  {m === 'read' ? (
                    <BookOpen size={13} />
                  ) : m === 'edit' ? (
                    <FileText size={13} />
                  ) : (
                    <Code2 size={13} />
                  )}
                  {ui(modeLabels[m])}
                </button>
              ))}
            </div>
            <div className="format-divider" />
            <select
              aria-label={ui('Paragraf biçimi')}
              className="heading-select"
              value={
                editor.current?.isActive('heading')
                  ? String(editor.current.getAttributes('heading').level)
                  : 'p'
              }
              onChange={(e) =>
                command((ed) => {
                  if (e.target.value === 'p') ed.chain().focus().setParagraph().run();
                  else
                    ed.chain()
                      .focus()
                      .toggleHeading({ level: +e.target.value as 1 | 2 | 3 })
                      .run();
                })
              }
            >
              <option value="p">{ui('Normal metin')}</option>
              {[1, 2, 3, 4, 5, 6].map((v) => (
                <option value={v} key={v}>
                  {ui('Başlık')} {v}
                </option>
              ))}
            </select>
            <div className="format-divider" />
            <div className="format-group">
              <IconButton
                title={ui('Kalın (⌘ B)')}
                active={editor.current?.isActive('bold')}
                onClick={() => command((e) => e.chain().focus().toggleBold().run())}
              >
                <Bold size={15} />
              </IconButton>
              <IconButton
                title={ui('İtalik (⌘ I)')}
                active={editor.current?.isActive('italic')}
                onClick={() => command((e) => e.chain().focus().toggleItalic().run())}
              >
                <Italic size={15} />
              </IconButton>
              <IconButton
                title={ui('Üstü çizili')}
                active={editor.current?.isActive('strike')}
                onClick={() => command((e) => e.chain().focus().toggleStrike().run())}
              >
                <Strikethrough size={15} />
              </IconButton>
              <IconButton
                title={ui('Satır içi kod')}
                onClick={() => command((e) => e.chain().focus().toggleCode().run())}
              >
                <Code2 size={15} />
              </IconButton>
            </div>
            <div className="format-divider" />
            <div className="format-group secondary-format">
              <IconButton
                title={ui('Madde listesi')}
                onClick={() => command((e) => e.chain().focus().toggleBulletList().run())}
              >
                <List size={16} />
              </IconButton>
              <IconButton
                title={ui('Numaralı liste')}
                onClick={() => command((e) => e.chain().focus().toggleOrderedList().run())}
              >
                <ListOrdered size={16} />
              </IconButton>
              <IconButton
                title={ui('Görev listesi')}
                onClick={() => command((e) => e.chain().focus().toggleTaskList().run())}
              >
                <ListTodo size={16} />
              </IconButton>
              <IconButton
                title={ui('Alıntı')}
                onClick={() => command((e) => e.chain().focus().toggleBlockquote().run())}
              >
                <Quote size={15} />
              </IconButton>
            </div>
            <div className="format-divider" />
            <div className="dropdown-anchor">
              <button
                className="insert-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdown(dropdown === 'insert' ? null : 'insert');
                }}
              >
                <Plus size={15} />
                {ui('Ekle')}
                <ChevronDown size={12} />
              </button>
              {dropdown === 'insert' && (
                <div className="dropdown-menu insert-menu" onClick={(e) => e.stopPropagation()}>
                  <span className="menu-heading">{ui('BELGENİ ZENGİNLEŞTİR')}</span>
                  {[
                    [Table2, 'Tablo', 'table'],
                    [Sigma, 'Matematik formülü', 'math'],
                    [Shapes, 'Diyagram · 16 tür', 'diagram'],
                    [Link2, 'Bağlantı', 'link'],
                    [Code2, 'Kod bloğu', 'code'],
                    [AlertCircle, 'Bilgi kutusu', 'alert'],
                    [BookOpen, 'Dipnot', 'footnote'],
                    [ChevronDown, 'Açılır bölüm', 'details'],
                    [Settings2, 'Belge özellikleri', 'yaml'],
                  ].map(([Icon, label, key]: any) => (
                    <button key={key} onClick={() => openBlock(key)}>
                      <Icon size={15} />
                      {ui(label)}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setDropdown(null);
                      fileInput.current?.click();
                    }}
                  >
                    <ImagePlus size={15} />
                    {ui('Dosyadan görsel')}
                  </button>
                  <button
                    onClick={() => {
                      setDropdown(null);
                      csvInput.current?.click();
                    }}
                  >
                    <Table2 size={15} />
                    {ui('CSV / TSV tablosu')}
                  </button>
                  <button
                    onClick={() => {
                      insertMarkdown('---');
                      setDropdown(null);
                    }}
                  >
                    <Minus size={15} />
                    {ui('Ayırıcı')}
                  </button>
                </div>
              )}
            </div>
            <div className="formatbar-end">
              <IconButton title={ui('Geri al')} onClick={() => navigateHistory()}>
                <Undo2 size={15} />
              </IconButton>
              <IconButton title={ui('İleri al')} onClick={() => navigateHistory(true)}>
                <Redo2 size={15} />
              </IconButton>
            </div>
          </div>
          {mode === 'edit' && editor.current?.isActive('table') && (
            <div className="table-context">
              <span>
                <Table2 size={14} />
                {ui('Tablo araçları')}
              </span>
              {[
                ['Önüne satır', 'addRowBefore'],
                ['Sonuna satır', 'addRowAfter'],
                ['Önüne sütun', 'addColumnBefore'],
                ['Sonuna sütun', 'addColumnAfter'],
                ['Satırı sil', 'deleteRow'],
                ['Sütunu sil', 'deleteColumn'],
                ['Tabloyu sil', 'deleteTable'],
              ].map(([label, action]) => (
                <button
                  key={action}
                  onClick={() => command((e) => (e.chain().focus() as any)[action]().run())}
                >
                  {ui(label)}
                </button>
              ))}
              <button onClick={() => moveTable('row', -1)}>{ui('Satır ↑')}</button>
              <button onClick={() => moveTable('row', 1)}>{ui('Satır ↓')}</button>
              <button onClick={() => moveTable('column', -1)}>{ui('Sütun ←')}</button>
              <button onClick={() => moveTable('column', 1)}>{ui('Sütun →')}</button>
              <button onClick={() => void exportTable('csv')}>{ui('CSV')}</button>
              <button onClick={() => void exportTable('tsv')}>{ui('TSV')}</button>
              {[AlignLeft, AlignCenter, AlignRight].map((I, i) => (
                <IconButton
                  key={i}
                  title={['Sola hizala', 'Ortala', 'Sağa hizala'][i]}
                  onClick={() =>
                    command((e) =>
                      e
                        .chain()
                        .focus()
                        .setCellAttribute('align', ['left', 'center', 'right'][i])
                        .run(),
                    )
                  }
                >
                  <I size={14} />
                </IconButton>
              ))}
            </div>
          )}
          <div
            className={`workspace mode-${mode} font-${settings.font}`}
            ref={workspace}
            style={
              {
                '--document-width': `${settings.width}px`,
                '--document-font-size': `${(settings.fontSize * zoom) / 100}px`,
              } as React.CSSProperties
            }
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              for (const file of e.dataTransfer.files) {
                if (file.type.startsWith('image/')) await addImage(file);
                else if (/\.(md|markdown|txt)$/i.test(file.name)) addFiles(await api.drop([file]));
              }
            }}
          >
            {(mode === 'source' || mode === 'split') && (
              <div className="source-pane">
                <div className="pane-label">
                  <Code2 size={12} />
                  {ui('MARKDOWN')}
                  <span>
                    {active.eol || 'LF'}
                    {ui('·')}
                    {active.encoding?.toUpperCase() || 'UTF-8'}
                  </span>
                </div>
                <SourceEditor
                  key={active.id}
                  value={active.source}
                  onChange={(s) => update(active.id, s)}
                  dark={dark}
                  onScroll={sourceScrolled}
                  onView={(view) => {
                    sourceView.current = view;
                    const cursor = Math.min(
                      sourceCursors.current.get(active.id) || 0,
                      view.state.doc.length,
                    );
                    view.dispatch({
                      selection: { anchor: cursor },
                      effects: CodeMirrorView.scrollIntoView(cursor),
                    });
                  }}
                />
              </div>
            )}
            <div
              className="document-scroll"
              ref={pageZoom.viewport}
              onScroll={previewScrolled}
              style={{ display: mode === 'source' ? 'none' : undefined }}
            >
              <div className="document-canvas">
                <div className="document-sheet" style={{ zoom: pageZoom.percent / 100 }}>
                  <div className="document-meta">
                    <span className="document-tag">
                      <span className="tiny-dot" />{' '}
                      {active.id === 'welcome' ? 'BAŞLANGIÇ REHBERİ' : 'MARKDOWN BELGESİ'}
                    </span>
                    <span>
                      <Clock3 size={12} /> {readMinutes} {ui('dk okuma')}
                    </span>
                  </div>
                  <Suspense fallback={<p className="muted">{ui('Editör hazırlanıyor…')}</p>}>
                    {mode === 'edit' && (
                      <VisualEditor
                        key={active.id}
                        source={active.source}
                        documentId={active.id}
                        onChange={(s) => update(active.id, s)}
                        onReady={(e) => {
                          if (editor.current !== e) {
                            editor.current = e;
                            const selection = visualSelections.current.get(active.id);
                            if (selection)
                              requestAnimationFrame(() => {
                                if (!e.isDestroyed)
                                  e.commands.setTextSelection({
                                    from: Math.min(selection.from, e.state.doc.content.size),
                                    to: Math.min(selection.to, e.state.doc.content.size),
                                  });
                              });
                          }
                          forceRender((n) => n + 1);
                        }}
                      />
                    )}
                  </Suspense>
                  {mode !== 'edit' && (
                    <Preview
                      source={active.source}
                      documentId={active.id}
                      onDiagramEdit={editDiagram}
                    />
                  )}
                  {!active.source && (
                    <div className="empty-document">
                      <Sparkles size={27} />
                      <p>{ui('Yeni bir düşünceye yer aç.')}</p>
                      <span>{ui('Yazmaya başla veya Ekle menüsünden bir blok seç.')}</span>
                    </div>
                  )}
                  <div className="document-end">
                    <span /> <BookOpen size={13} /> <span />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <footer className="statusbar">
            <div>
              <span className="status-dot" />
              <span>
                {ui(
                  saving
                    ? 'Kaydediliyor…'
                    : dirty
                      ? draftState || 'Kaydedilmemiş değişiklikler'
                      : 'Tüm düşüncelerine yer var.',
                )}
              </span>
              {!isDesktop && <span className="browser-badge">{ui('Tarayıcı önizlemesi')}</span>}
            </div>
            <div>
              <span>
                {words.toLocaleString(settings.language)} {ui('kelime')}
              </span>
              <span className="status-separator" />
              <span>
                {active.source.length.toLocaleString(settings.language)} {ui('karakter')}
              </span>
              <span className="status-separator" />
              <span>{ui('Markdown')}</span>
              <span aria-hidden="true" title={ui('Yazı boyutu ölçeği')}>
                Aa
              </span>
              <button title={ui('Yazı boyutunu sıfırla')} onClick={() => setZoom(100)}>
                {zoom}
                {ui('%')}
              </button>
              <input
                aria-label={ui('Yazı boyutu ölçeği')}
                type="range"
                min="50"
                max="200"
                step="10"
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
              />
              <span className="status-separator" />
              <div
                className="page-zoom-controls"
                role="group"
                aria-label={ui('Sayfa yakınlaştırma')}
              >
                <button
                  disabled={mode === 'source'}
                  title={ui('Genişliğe sığdır')}
                  aria-pressed={pageZoom.fitted}
                  onClick={pageZoom.fit}
                >
                  <Maximize2 size={12} />
                </button>
                <button
                  disabled={mode === 'source' || pageZoom.percent <= 25}
                  aria-label={ui('Sayfayı uzaklaştır')}
                  onClick={() => pageZoom.zoom(pageZoom.percent - 10)}
                >
                  <Minus size={12} />
                </button>
                <input
                  aria-label={ui('Sayfa yakınlaştırma')}
                  type="range"
                  min="25"
                  max="300"
                  step="1"
                  disabled={mode === 'source'}
                  value={pageZoom.percent}
                  onChange={(e) => pageZoom.zoom(+e.target.value)}
                />
                <button
                  disabled={mode === 'source' || pageZoom.percent >= 300}
                  aria-label={ui('Sayfayı yakınlaştır')}
                  onClick={() => pageZoom.zoom(pageZoom.percent + 10)}
                >
                  <Plus size={12} />
                </button>
                <button
                  disabled={mode === 'source'}
                  className="page-zoom-value"
                  title={ui('Sayfayı %100 göster')}
                  aria-label={ui('Sayfayı %100 göster')}
                  onClick={() => pageZoom.zoom(100)}
                >
                  {Math.round(pageZoom.percent)}%
                </button>
              </div>
              <button title={ui('Görünümü genişlet')} onClick={() => setFocus(!focus)}>
                <Maximize2 size={12} />
              </button>
            </div>
          </footer>
        </main>
      </div>
      {focus && (
        <button className="exit-focus button" onClick={() => setFocus(false)}>
          {ui('Odak modundan çık')}
          <kbd>{ui('Esc')}</kbd>
        </button>
      )}
      {tabMenu && (
        <div className="context-dismiss" onMouseDown={() => setTabMenu(null)}>
          <div
            className="dropdown-menu context-menu"
            style={{
              top: Math.min(tabMenu.y, window.innerHeight - 190),
              left: Math.min(tabMenu.x, window.innerWidth - 240),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setTabs((all) =>
                  all
                    .map((t) => (t.id === tabMenu.id ? { ...t, pinned: !t.pinned } : t))
                    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)),
                );
                setTabMenu(null);
              }}
            >
              {tabs.find((t) => t.id === tabMenu.id)?.pinned
                ? 'Sabitlemeyi kaldır'
                : 'Sekmeyi sabitle'}
            </button>
            <button
              onClick={() => {
                void closeTab(tabMenu.id);
                setTabMenu(null);
              }}
            >
              {ui('Sekmeyi kapat')}
            </button>
            <button
              onClick={async () => {
                const id = tabMenu.id;
                setTabMenu(null);
                for (const tab of [...tabsRef.current].filter((t) => t.id !== id && !t.pinned))
                  if (!(await closeTab(tab.id))) break;
              }}
            >
              {ui('Diğer sekmeleri kapat')}
            </button>
            <button
              onClick={() => {
                appAction.current('reopen');
                setTabMenu(null);
              }}
            >
              {ui('Kapatılan sekmeyi geri aç')}
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label={ui('Bildirimi kapat')} onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {dialog === 'block' &&
        block &&
        (['math', 'inlineMath'].includes(block.kind) ? (
          <MathDialog
            value={block.value}
            inline={block.kind === 'inlineMath'}
            onClose={() => setDialog(null)}
            onApply={(value, inline) => {
              if (block.value) block.apply(value);
              else if (inline && mode === 'edit' && editor.current)
                editor.current
                  .chain()
                  .focus()
                  .insertContent({ type: 'formulaInline', attrs: { value } })
                  .run();
              else insertMarkdown(inline ? `$${value}$` : `$$\n${value}\n$$`);
              setDialog(null);
            }}
          />
        ) : block.kind === 'diagram' ? (
          <DiagramDialog
            value={block.value}
            onClose={() => setDialog(null)}
            onApply={(value) => {
              block.apply(value);
              setDialog(null);
            }}
          />
        ) : (
          <BlockDialog
            kind={block.kind}
            value={block.value}
            documentId={active.id}
            onClose={() => setDialog(null)}
            onApply={(value) => {
              if (block.kind === 'yaml' && !block.value) {
                update(active.id, value + '\n\n' + active.source);
              } else if (block.kind === 'footnote' && !block.value) {
                const id = value.match(/^\[\^([^\]]+)\]/)?.[1];
                update(active.id, active.source + `[^${id}]\n\n` + value + '\n');
              } else block.apply(value);
              setDialog(null);
            }}
          />
        ))}
      {dialog === 'folder-search' && (
        <FolderSearchDialog
          dirtyIds={tabs.filter((t) => t.source !== t.saved).map((t) => t.id)}
          onClose={() => setDialog(null)}
          onOpen={async (id) => {
            try {
              addFiles([await api.read(id)]);
            } catch (e: any) {
              notify(e.message);
            }
          }}
        />
      )}
      {dialog === 'file-operation' && fileRequest && (
        <Modal
          title={
            fileRequest.action === 'rename'
              ? 'Yeniden adlandır'
              : fileRequest.action === 'create-file'
                ? 'Yeni Markdown dosyası'
                : 'Yeni klasör'
          }
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="button" onClick={() => setDialog(null)}>
                {ui('İptal')}
              </button>
              <button
                className="button primary"
                disabled={!fileName.trim()}
                onClick={applyFileOperation}
              >
                {ui('Uygula')}
              </button>
            </>
          }
        >
          <label className="form-stack">
            {ui('Ad')}
            <input
              autoFocus
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && fileName.trim()) void applyFileOperation();
              }}
            />
          </label>
          <p className="muted">{ui('Var olan dosyaların üzerine yazılmaz.')}</p>
        </Modal>
      )}
      {dialog === 'csv-import' && csvFile && (
        <CSVDialog
          file={csvFile}
          onClose={() => setDialog(null)}
          onApply={(value) => {
            insertMarkdown(value);
            setDialog(null);
            setCSVFile(null);
          }}
        />
      )}
      {dialog === 'table' && (
        <Modal
          title={ui('Bir tablo ekle')}
          eyebrow={ui('TABLO OLUŞTURUCU')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button
                className="text-button"
                onClick={() => {
                  setDialog(null);
                  csvInput.current?.click();
                }}
              >
                {ui('CSV / TSV içe aktar')}
              </button>
              <span className="spacer" />
              <button className="button" onClick={() => setDialog(null)}>
                {ui('İptal')}
              </button>
              <button
                className="button primary"
                onClick={() => {
                  const rows = [
                    Array.from({ length: tableCols }, (_, i) => `Sütun ${i + 1}`),
                    ...Array.from({ length: tableRows }, () => Array(tableCols).fill('')),
                  ];
                  insertMarkdown(tableMarkdown(rows));
                  setDialog(null);
                }}
              >
                {ui('Tabloyu ekle')}
              </button>
            </>
          }
        >
          <p className="muted">
            {ui('Hücreleri tıklayarak düzenle. Tab ile bir sonraki hücreye geç.')}
          </p>
          <div className="table-size">
            <label>
              {ui('Sütun')}
              <input
                type="number"
                min={1}
                max={20}
                value={tableCols}
                onChange={(e) => setTableCols(Math.max(1, Math.min(20, +e.target.value)))}
              />
            </label>
            <span>{ui('×')}</span>
            <label>
              {ui('Gövde satırı')}
              <input
                type="number"
                min={1}
                max={100}
                value={tableRows}
                onChange={(e) => setTableRows(Math.max(1, Math.min(100, +e.target.value)))}
              />
            </label>
          </div>
          <div className="table-grid" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
            {Array.from({ length: 60 }, (_, i) => (
              <button
                key={i}
                aria-label={`${(i % 10) + 1} sütun, ${Math.floor(i / 10) + 1} satır`}
                className={i % 10 < tableCols && Math.floor(i / 10) < tableRows ? 'selected' : ''}
                onMouseEnter={() => {
                  setTableCols((i % 10) + 1);
                  setTableRows(Math.floor(i / 10) + 1);
                }}
                onClick={() => {
                  setTableCols((i % 10) + 1);
                  setTableRows(Math.floor(i / 10) + 1);
                }}
              />
            ))}
          </div>
          <p className="muted">
            {ui(
              'Başlık satırı ayrıca eklenir. Standart Markdown tabloları hücre birleştirme ve kalıcı sütun genişliğini desteklemez.',
            )}
          </p>
        </Modal>
      )}
      {dialog === 'find' && (
        <SearchDialog
          source={active.source}
          onApply={(s) => update(active.id, s)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'settings' && (
        <Modal
          title={ui('Kendine göre bir alan')}
          eyebrow={ui('AYARLAR')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <span className="footer-hint">{ui('Tercihlerin bu bilgisayarda saklanır.')}</span>
              <button className="button primary" onClick={() => setDialog(null)}>
                {ui('Tamam')}
              </button>
            </>
          }
        >
          <div className="settings-sections">
            <section>
              <h3>{ui('Görünüm')}</h3>
              <label className="language-setting">
                {ui('Dil')}
                <select
                  aria-label={ui('Interface language')}
                  value={settings.language}
                  onChange={(e) => changeSettings({ language: e.target.value as 'tr' | 'en' })}
                >
                  <option value="tr">{ui('Türkçe')}</option>
                  <option value="en">{ui('English')}</option>
                </select>
              </label>
              <div className="theme-picker">
                {(
                  [
                    [Sun, 'light', 'Açık'],
                    [Moon, 'dark', 'Koyu'],
                    [Monitor, 'system', 'Sistem'],
                  ] as const
                ).map(([I, key, label]) => (
                  <button
                    className={settings.theme === key ? 'selected' : ''}
                    key={key}
                    onClick={() => changeSettings({ theme: key })}
                  >
                    <I size={21} />
                    {ui(label)}
                  </button>
                ))}
              </div>
              <div className="option-grid">
                <label>
                  {ui('Belge yazı tipi')}
                  <select
                    value={settings.font}
                    onChange={(e) => changeSettings({ font: e.target.value as Settings['font'] })}
                  >
                    <option value="sans">{ui('Sade · Sans serif')}</option>
                    <option value="serif">{ui('Kitap · Serif')}</option>
                  </select>
                </label>
                <label>
                  {ui('Yazı boyutu')}
                  <input
                    type="number"
                    min={12}
                    max={24}
                    value={settings.fontSize}
                    onChange={(e) =>
                      changeSettings({ fontSize: Math.min(24, Math.max(12, +e.target.value)) })
                    }
                  />
                </label>
              </div>
              <label>
                {ui('Belge genişliği ·')}
                {settings.width}
                {ui('px')}
                <input
                  type="range"
                  min="600"
                  max="1100"
                  step="20"
                  value={settings.width}
                  onChange={(e) => changeSettings({ width: +e.target.value })}
                />
              </label>
            </section>
            <section>
              <h3>{ui('Dosyalar ve güvenlik')}</h3>
              <label className="setting-toggle">
                <span>
                  <strong>{ui('Son oturumu geri aç')}</strong>
                  <small>{ui('Kaydedilmiş dosyaları ve sekme sırasını hatırla.')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.restore}
                  onChange={(e) => changeSettings({ restore: e.target.checked })}
                />
              </label>
              <label className="setting-toggle">
                <span>
                  <strong>{ui('Otomatik kaydet')}</strong>
                  <small>
                    {ui('Yalnız diskte konumu olan dosyalara, yazmayı bıraktıktan sonra kaydet.')}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.autosave}
                  onChange={(e) => changeSettings({ autosave: e.target.checked })}
                />
              </label>
              <div className="privacy-note">
                <ShieldCheck size={18} />
                <span>
                  {ui(
                    'Kurtarma taslakları otomatik korunur. Belge içeriğin hiçbir sunucuya gönderilmez.',
                  )}
                </span>
              </div>
              <div className="settings-actions">
                <button className="button" onClick={() => setDialog('about')}>
                  {ui('Hakkında ve güncellemeler')}
                </button>
                <button
                  className="button"
                  onClick={async () => {
                    setDrafts(await api.drafts());
                    setDialog('recovery');
                  }}
                >
                  {ui('Taslakları yönet')}
                </button>
                <button
                  className="button"
                  onClick={async () => {
                    setHistory(await api.history(active.id));
                    setDialog('history');
                  }}
                >
                  {ui('Sürüm geçmişi')}
                </button>
                <button
                  className="button"
                  onClick={() =>
                    api.exportFile('folio-ayarlar.json', JSON.stringify(settings, null, 2), 'json')
                  }
                >
                  {ui('Ayarları dışa aktar')}
                </button>
                <button className="button" onClick={() => settingsFile.current?.click()}>
                  {ui('Ayarları içe aktar')}
                </button>
                <input
                  ref={settingsFile}
                  type="file"
                  accept=".json,application/json"
                  aria-label={ui('Ayar dosyası')}
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      if (file.size > 32768)
                        throw new Error('Ayar dosyası 32 KiB sınırını aşıyor.');
                      setImportedSettings(parseSettings(await file.text()));
                    } catch (error) {
                      notify((error as Error).message);
                    }
                  }}
                />
              </div>
              {importedSettings && (
                <div className="privacy-note settings-import-preview">
                  <div>
                    <h3>{ui('Ayar önizlemesi')}</h3>
                    <dl>
                      {[
                        [
                          ui('Görünüm'),
                          ui(
                            { light: 'Açık', dark: 'Koyu', system: 'Sistem' }[
                              importedSettings.theme
                            ],
                          ),
                        ],
                        [
                          ui('Belge yazı tipi'),
                          importedSettings.font === 'sans' ? 'Sans serif' : 'Serif',
                        ],
                        [ui('Yazı boyutu'), String(importedSettings.fontSize)],
                        [ui('Belge genişliği'), `${importedSettings.width} px`],
                        [ui('Dil'), importedSettings.language === 'tr' ? 'Türkçe' : 'English'],
                        [ui('Otomatik kaydet'), ui(importedSettings.autosave ? 'Açık' : 'Kapalı')],
                        [
                          ui('Son oturumu geri aç'),
                          ui(importedSettings.restore ? 'Açık' : 'Kapalı'),
                        ],
                        [ui('Güncelleme adresi'), importedSettings.updateURL || '—'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {importedSettings.autosave && (
                      <p>
                        {ui(
                          'Otomatik kaydet açık: uyguladıktan sonra konumu olan belgeler diske kaydedilebilir.',
                        )}
                      </p>
                    )}
                    <div className="settings-actions">
                      <button className="button" onClick={() => setImportedSettings(null)}>
                        {ui('İptal')}
                      </button>
                      <button
                        className="button primary"
                        onClick={() => {
                          setSettings(importedSettings);
                          void api
                            .settings(importedSettings)
                            .catch((error) => notify(error.message));
                          setImportedSettings(null);
                          notify('Ayarlar uygulandı.');
                        }}
                      >
                        {ui('Ayarları uygula')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </Modal>
      )}
      {dialog === 'export' && (
        <Modal
          title={ui('Belgeni yanında götür')}
          eyebrow={ui('DIŞA AKTAR')}
          onClose={() => setDialog(null)}
        >
          <p className="muted">
            {ui(
              'Bir paylaşım biçimi seç. Yerel görseller, formüller ve diyagramlar çıktıda korunur.',
            )}
          </p>
          <div className="export-options">
            {(
              [
                [Printer, 'pdf', 'PDF belgesi', 'Okumak, yazdırmak ve paylaşmak için'],
                [Code2, 'html', 'Bağımsız HTML', 'İnternet gerektirmeyen bir web belgesi'],
                [FileArchive, 'zip', 'Taşınabilir ZIP', 'Markdown ve kullanılan yerel görseller'],
                [FileText, 'md', 'Markdown', 'Açık, sade ve sana ait'],
              ] as const
            ).map(([I, f, label, desc]) => (
              <button
                key={f}
                onClick={() => {
                  setDialog(null);
                  void exportDocument(f);
                }}
              >
                <I size={23} />
                <span>
                  <strong>{ui(label)}</strong>
                  <small>{desc}</small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
          <label className="setting-toggle">
            <span>{ui('PDF yönü: yatay')}</span>
            <input
              type="checkbox"
              checked={landscape}
              onChange={(e) => setLandscape(e.target.checked)}
            />
          </label>
        </Modal>
      )}
      {(dialog === 'recovery' || dialog === 'history') && (
        <Modal
          title={dialog === 'recovery' ? 'Düşüncelerin burada güvende' : 'Belgenin geçmişi'}
          eyebrow={dialog === 'recovery' ? 'KURTARMA TASLAKLARI' : 'YEREL SÜRÜMLER'}
          onClose={() => setDialog(null)}
        >
          <p className="muted">
            {ui('Bir sürümü ayrı taslak olarak aç. Diskteki dosyanın üzerine otomatik yazılmaz.')}
          </p>
          <div className="recovery-list">
            {(dialog === 'recovery' ? drafts : history).map((d, i) => (
              <div key={d.id + i}>
                <FileText size={21} />
                <span>
                  <strong>{d.name}</strong>
                  <small>
                    {new Date(d.date).toLocaleString('tr')}
                    {ui('·')}
                    {countWords(d.source)}
                    {ui('kelime')}
                  </small>
                </span>
                <button
                  className="button"
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setTabs((all) => [
                      ...all,
                      {
                        ...tabOf({
                          id,
                          name: d.name.replace(/\.md$/, '') + ' — kurtarıldı.md',
                          source: d.source,
                        }),
                        saved: '',
                        recovered: true,
                      },
                    ]);
                    setActiveId(id);
                    setMode('edit');
                    setDialog(null);
                  }}
                >
                  {ui('Aç')}
                </button>
                {dialog === 'recovery' && (
                  <button
                    className="icon-button"
                    aria-label={ui('Taslağı sil')}
                    onClick={async () => {
                      if (window.confirm(ui('Bu kurtarma taslağı silinsin mi?'))) {
                        await api.removeDraft(d.id);
                        setDrafts(await api.drafts());
                      }
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {!(dialog === 'recovery' ? drafts : history).length && (
              <div className="empty-state">
                <ShieldCheck size={32} />
                <p>
                  {dialog === 'recovery'
                    ? 'Kurtarılmayı bekleyen taslak yok.'
                    : 'Bu belge için kayıt geçmişi yok.'}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {dialog === 'about' && (
        <AboutDialog
          updateURL={settings.updateURL || ''}
          onURL={(updateURL) => changeSettings({ updateURL })}
          onClose={() => setDialog(null)}
          onInstall={async () => {
            for (const tab of tabsRef.current.filter((t) => t.source !== t.saved))
              if (!(await saveTab(tab.id))) return;
            const result = await api.updates('install', settings.updateURL);
            notify(result.message);
          }}
        />
      )}
      {dialog === 'help' && (
        <Modal
          title={ui('Folio ile tanış')}
          eyebrow={ui('KÜÇÜK BİR REHBER')}
          onClose={() => setDialog(null)}
        >
          <div className="help-content">
            <p>
              {ui(
                'Markdown kodu yazmadan belgelerini oku, düzenle ve paylaş. Dosyaların bilgisayarında kalır.',
              )}
            </p>
            <h3>{ui('Dört görünüm, tek belge')}</h3>
            <p>
              <strong>{ui('Oku')}</strong>
              {ui('ile belgeyi incele.')}
              <strong>{ui('Düzenle')}</strong>
              {ui('ile metne tıkla ve yaz.')}
              <strong>{ui('Kaynak')}</strong>
              {ui("ile gerçek Markdown'a ulaş.")}
              <strong>{ui('Bölünmüş')}</strong>
              {ui('ile ikisini birlikte gör.')}
            </p>
            <h3>{ui('İçerik ekle')}</h3>
            <p>
              {ui(
                'Ekle menüsünde tablolar, sembollerle oluşturulan formüller, 16 diyagram türü, dipnotlar ve bilgi kutuları var. Formül veya diyagrama çift tıklayarak yeniden düzenleyebilirsin.',
              )}
            </p>
            <h3>{ui('Sayfa yakınlaştırma')}</h3>
            <p>
              {ui(
                'İki parmakla sıkıştırıp açarak sayfayı yakınlaştır. İki parmakla yatay ve dikey kaydır. Ctrl veya ⌘ ile tekerlek de yakınlaştırır. Alt çubukta yazı boyutu ve sayfa ölçeği ayrıdır; genişliğe sığdırabilir veya %100’e dönebilirsin.',
              )}
            </p>
            <div className="shortcut-list">
              {[
                ['Sayfayı yakınlaştır', '⌘ / Ctrl + +'],
                ['Sayfayı uzaklaştır', '⌘ / Ctrl + −'],
                ['Sayfayı %100 göster', '⌘ / Ctrl + 0'],
                ['Yeni belge', '⌘ / Ctrl + N'],
                ['Dosya aç', '⌘ / Ctrl + O'],
                ['Kaydet', '⌘ / Ctrl + S'],
                ['Farklı kaydet', '⌘ / Ctrl + ⇧ + S'],
                ['Ara ve değiştir', '⌘ / Ctrl + F'],
                ['Komutlar', '⌘ / Ctrl + ⇧ + P'],
                ['Sekmeyi kapat', '⌘ / Ctrl + W'],
              ].map(([l, k]) => (
                <div key={l}>
                  <span>{ui(l)}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
            <p className="muted">
              {ui('Folio 1.0.0 · Yerel Markdown atölyesi')}
              <br />
              {ui('Görsel olarak desteklenmeyen içerikler kaynağı korunarak açılır.')}
            </p>
          </div>
        </Modal>
      )}
      {dialog === 'commands' && (
        <Modal
          title={ui('Ne yapmak istersin?')}
          eyebrow={ui('KOMUT MENÜSÜ')}
          onClose={() => setDialog(null)}
        >
          <div className="command-list">
            {[
              ['Yeni belge', () => newFile()],
              ['Dosya aç', () => void openFile()],
              [
                'ZIP paketi aç',
                () =>
                  void api
                    .importPackage()
                    .then(addFiles)
                    .catch((e) => notify(e.message)),
              ],
              [
                'Tümünü kaydet',
                () =>
                  void (async () => {
                    for (const t of tabsRef.current.filter((t) => t.source !== t.saved))
                      await saveTab(t.id);
                  })(),
              ],
              ['Farklı kaydet', () => void saveTab(active.id, true)],
              ['Tablo ekle', () => setDialog('table')],
              ['Formül ekle', insertFormula],
              ['Diyagram ekle', insertDiagram],
              ['Dışa aktar', () => setDialog('export')],
              ['Ayarlar', () => setDialog('settings')],
              ['Yardım', () => setDialog('help')],
            ].map(([label, action]: any) => (
              <button
                key={label}
                onClick={() => {
                  setDialog(null);
                  action();
                }}
              >
                <Command size={15} />
                {label}
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={ui('Değişikliklerini kaydedelim mi?')}
          onClose={() => {
            confirm.resolve('cancel');
            setConfirm(null);
          }}
          footer={
            <>
              <button className="button danger" onClick={() => confirm.resolve('discard')}>
                {ui('Kaydetme')}
              </button>
              <span className="spacer" />
              <button className="button" onClick={() => confirm.resolve('cancel')}>
                {ui('İptal')}
              </button>
              <button className="button primary" onClick={() => confirm.resolve('save')}>
                {ui('Kaydet')}
              </button>
            </>
          }
        >
          <p>
            <strong>{confirm.name}</strong>
            {ui('dosyasında kaydedilmemiş değişiklikler var.')}
          </p>
        </Modal>
      )}
      {diskConflict && dialog === 'merge' && (
        <MergeDialog
          base={tabs.find((t) => t.id === diskConflict.id)?.saved || ''}
          local={tabs.find((t) => t.id === diskConflict.id)?.source || ''}
          disk={diskConflict.source}
          onClose={() => setDialog(null)}
          onApply={(source) => {
            setTabs((all) =>
              all.map((t) =>
                t.id === diskConflict.id
                  ? {
                      ...t,
                      hash: diskConflict.hash,
                      saved: diskConflict.source,
                      source,
                      revision: t.revision + 1,
                    }
                  : t,
              ),
            );
            setDiskConflict(null);
            setDialog(null);
            notify('Birleşim hazır. Değişiklikleri kaydedebilirsiniz.');
          }}
        />
      )}
      {diskConflict && dialog !== 'merge' && (
        <Modal
          title={ui('Dosya başka bir yerde değişti')}
          eyebrow={ui('ÇAKIŞMA KORUMASI')}
          onClose={() => setDiskConflict(null)}
          wide
          footer={
            <>
              <button
                className="button"
                onClick={() => {
                  const id = crypto.randomUUID();
                  setTabs((all) => [
                    ...all,
                    tabOf({
                      id,
                      name: diskConflict.name.replace(/\.md$/, '') + ' — disk sürümü.md',
                      source: diskConflict.source,
                    }),
                  ]);
                  setActiveId(id);
                  setDiskConflict(null);
                }}
              >
                {ui('Disk sürümünü ayrı aç')}
              </button>
              <button className="button primary" onClick={() => setDialog('merge')}>
                {ui('Birleştir…')}
              </button>
              <button
                className="button"
                onClick={() => {
                  const local = tabsRef.current.find((t) => t.id === diskConflict.id);
                  if (local) void saveTab(local.id, true);
                  setDiskConflict(null);
                }}
              >
                {ui('Benimkini farklı kaydet')}
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (
                    window.confirm(
                      ui(
                        'Yerel değişiklikler yerine disk sürümü yüklensin mi? Yerel içerik kurtarma taslağında kalır.',
                      ),
                    )
                  ) {
                    setTabs((all) =>
                      all.map((t) => (t.id === diskConflict.id ? tabOf(diskConflict) : t)),
                    );
                    setDiskConflict(null);
                  }
                }}
              >
                {ui('Disk sürümünü yükle')}
              </button>
            </>
          }
        >
          <p className="muted">
            {ui('Değişikliklerin sessizce ezilmedi. İki sürümü inceleyip korumak istediğini seç.')}
          </p>
          <div className="conflict-columns">
            <div>
              <h4>{ui('Senin değişikliklerin')}</h4>
              <pre>{tabs.find((t) => t.id === diskConflict.id)?.source}</pre>
            </div>
            <div>
              <h4>{ui('Diskteki içerik')}</h4>
              <pre>{diskConflict.source}</pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
