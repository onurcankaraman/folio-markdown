import { test, expect, _electron as electron } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { zipSync, strToU8 } from 'fflate';

test('native desktop opens real files, saves atomically and rejects stale writes', async () => {
  test.setTimeout(60000);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-desktop-'));
  const fixture = path.join(dir, 'Belge.md'),
    original = '# Masaüstü\r\n\r\nİlk metin.\r\n\r\n<!-- korunacak -->\r\n';
  await fs.writeFile(fixture, original);
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    FOLIO_TEST_DATA: path.join(dir, 'profile'),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [path.resolve('.'), fixture], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.document-scroll h1:visible')).toHaveText('Masaüstü');
    const native = await page.evaluate(() => !!window.desktop);
    expect(native).toBe(true);
    // Exercise real Electron wheel delivery, not just a synthetic DOM event.
    const viewport = await page.locator('.document-scroll').boundingBox();
    const paperWidth = await page
      .locator('.document-sheet')
      .evaluate((el) => el.getBoundingClientRect().width);
    await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + 150);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -60);
    await page.keyboard.up('Control');
    await expect
      .poll(() =>
        page.locator('.document-sheet').evaluate((el) => el.getBoundingClientRect().width),
      )
      .toBeGreaterThan(paperWidth);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      ),
    ).toBe(1);
    await page.getByRole('button', { name: 'Sayfayı %100 göster' }).click();

    const result = await page.evaluate(async () => {
      const recent = await window.desktop!.recents();
      const file = await window.desktop!.read(recent.find((r) => r.name === 'Belge.md')!.id);
      return window.desktop!.save({
        ...file,
        source: file.source.replace('İlk metin.', 'Yeni metin.'),
      });
    });
    expect(result.ok, result.error).toBe(true);
    expect(await fs.readFile(fixture, 'utf8')).toBe(original.replace('İlk metin.', 'Yeni metin.'));
    await fs.writeFile(fixture, '# Harici değişiklik\n');
    const conflict = await page.evaluate(
      async (file) => window.desktop!.save({ ...file!, source: '# Yerel değişiklik\n' }),
      result.file,
    );
    expect(conflict.conflict).toBe(true);
    expect(await fs.readFile(fixture, 'utf8')).toBe('# Harici değişiklik\n');
    const intrusion = await page.evaluate(async () => {
      try {
        await window.desktop!.read('../../etc/passwd');
        return false;
      } catch {
        return true;
      }
    });
    expect(intrusion).toBe(true);
    const drawing = await page.evaluate(() =>
      window.desktop!.renderDiagram('flowchart LR\n  n1["Güvenli çizim"]', 'diagram-9000'),
    );
    expect(
      await page.evaluate(
        (svg) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.textContent,
        drawing,
      ),
    ).toContain('Güvenli çizim');
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, dir);
    const operations = await page.evaluate(async () => {
      const root = await window.desktop!.folder();
      const created = await window.desktop!.fileAction('create-file', root[0].id, 'Yeni belge');
      const renamed = await window.desktop!.fileAction('rename', created.file!.id, 'Düzenli.md');
      await window.desktop!.save({ ...renamed.file!, source: '# Bir fikir\n\nBir fikir daha.\n' });
      const found = await window.desktop!.searchFolder('fikir', true);
      const changes = await window.desktop!.replaceFiles(
        'fikir',
        'düşünce',
        true,
        found.results.map((f) => ({ id: f.id, hash: f.hash })),
      );
      await window.desktop!.session({
        documents: [{ id: renamed.file!.id, pinned: true }],
        activeId: renamed.file!.id,
        mode: 'read',
      });
      const restored = await window.desktop!.session();
      return { found: found.results.length, changes, restored: restored.files[0] };
    });
    expect(operations.found).toBe(1);
    expect(operations.changes.every((r) => !r.error)).toBe(true);
    expect(operations.restored.source).toContain('düşünce');
    expect(operations.restored.pinned).toBe(true);
    expect(await fs.readFile(path.join(dir, 'Düzenli.md'), 'utf8')).toContain('Bir düşünce daha.');
    const zip = path.join(dir, 'paket.zip');
    await fs.writeFile(
      zip,
      zipSync({
        'Paket.md': strToU8('# Paket belgesi'),
        'manifest.json': strToU8('{"document":"Paket.md"}'),
      }),
    );
    await app.evaluate(
      ({ dialog }, value) => {
        dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
        dialog.showOpenDialog = async (...args: any[]) => ({
          canceled: false,
          filePaths: args.at(-1)?.properties?.includes('openFile') ? [value.zip] : [value.dir],
        });
      },
      { zip, dir },
    );
    const imported = await page.evaluate(() => window.desktop!.importPackage());
    expect(imported[0].source).toBe('# Paket belgesi');
    await page.evaluate(async () => {
      await window.desktop!.draft({
        id: 'draft-fixture',
        name: 'Taslak.md',
        source: 'Kurtarılabilir',
        date: new Date().toISOString(),
      });
    });
    expect(
      await page.evaluate(async () =>
        (await window.desktop!.drafts()).some((d) => d.id === 'draft-fixture'),
      ),
    ).toBe(true);
    await page.evaluate(() => window.desktop!.removeDraft('draft-fixture'));
    const output = path.join(dir, 'test.pdf');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, output);
    const printed = await page.evaluate(() =>
      window.desktop!.pdf(
        '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>PDF çıktısı</h1><p>Türkçe içerik.</p></body></html>',
        false,
      ),
    );
    expect(printed).toBe(true);
    expect((await fs.readFile(output)).subarray(0, 4).toString()).toBe('%PDF');
    await page.screenshot({ path: 'docs/screenshots/folio-desktop.png' });
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.destroy();
      })
      .catch(() => {});
    await app.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
});
