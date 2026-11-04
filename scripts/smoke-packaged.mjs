import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipSync, strToU8 } from 'fflate';
const executablePath =
  process.argv[2] || path.resolve('release/mac-arm64/Folio.app/Contents/MacOS/Folio');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-packaged-'));
const fixture = path.join(directory, 'Test.md'),
  zip = path.join(directory, 'test.zip');
await fs.writeFile(fixture, '# Paket testi\n\nTürkçe içerik.\n');
await fs.writeFile(zip, zipSync({ 'Arsiv.md': strToU8('# Arşiv testi') }));
const env = { ...process.env, FOLIO_DATA_DIR: path.join(directory, 'profile') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath,
  args: [`--user-data-dir=${directory}/profile`, fixture],
  env,
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.desktop);
  const dataDirectory = await app.evaluate(({ app }) => app.getPath('userData'));
  if (!dataDirectory.startsWith(directory))
    throw new Error('Packaged test profile was not isolated');
  const info = await page.evaluate(() => window.desktop.info());
  if (!info.packaged) throw new Error('Packaged app expected');
  await page.getByRole('heading', { name: 'Paket testi', exact: true }).waitFor();
  const width = await page
    .locator('.document-sheet')
    .evaluate((sheet) => sheet.getBoundingClientRect().width);
  await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).fill('200');
  const zoomedWidth = await page
    .locator('.document-sheet')
    .evaluate((sheet) => sheet.getBoundingClientRect().width);
  if (Math.abs(zoomedWidth - width * 2) > 1) throw new Error('Packaged page zoom failed');
  await page.getByRole('button', { name: 'Sayfayı %100 göster' }).click();
  const drawing = await page.evaluate(() =>
    window.desktop.renderDiagram('flowchart LR\n n1["Paket"] --> n2["Çalışıyor"]', 'diagram-8000'),
  );
  if (!drawing.includes('Çalışıyor')) throw new Error('Packaged diagram render failed');
  await app.evaluate(
    ({ dialog }, values) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showOpenDialog = async (...args) => ({
        canceled: false,
        filePaths: args.at(-1)?.properties?.includes('openFile')
          ? [values.zip]
          : [values.directory],
      });
    },
    { zip, directory },
  );
  const imported = await page.evaluate(() => window.desktop.importPackage());
  if (imported[0]?.source !== '# Arşiv testi') throw new Error('Packaged ZIP import failed');
  const file = await page.evaluate(async () => {
    const r = await window.desktop.recents();
    return window.desktop.read(r.find((f) => f.name === 'Test.md').id);
  });
  const saved = await page.evaluate(
    (f) => window.desktop.save({ ...f, source: f.source + '\nKaydedildi.\n' }),
    file,
  );
  if (!saved.ok || !(await fs.readFile(fixture, 'utf8')).includes('Kaydedildi.'))
    throw new Error('Packaged save failed');
  await page.getByRole('tab', { name: /Folio/ }).first().click();
  await page.locator('.document-scroll .mermaid-drawing svg').waitFor();
  await page.screenshot({ path: 'docs/screenshots/folio-packaged.png' });
  await app.evaluate(({ dialog }, directory) => {
    dialog.showSaveDialog = async (...args) => ({
      canceled: false,
      filePath: directory + '/formula.' + args.at(-1).filters[0].extensions[0],
    });
  }, directory);
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await page.getByRole('button', { name: 'Matematik formülü' }).click();
  await page.getByRole('button', { name: 'SVG indir' }).click();
  await page
    .locator('.formula-export [role=status]')
    .filter({ hasText: 'Formül dışa aktarıldı.' })
    .waitFor();
  const formulaSVG = await fs.readFile(path.join(directory, 'formula.svg'), 'utf8');
  if (!formulaSVG.includes('<path') || !formulaSVG.includes('<use'))
    throw new Error('Packaged formula SVG failed');
  await page.getByRole('button', { name: 'PNG indir' }).click();
  await page
    .locator('.formula-export [role=status]')
    .filter({ hasText: 'Formül dışa aktarıldı.' })
    .waitFor();
  const formulaPNG = await fs.readFile(path.join(directory, 'formula.png'));
  if (formulaPNG.subarray(1, 4).toString() !== 'PNG')
    throw new Error('Packaged formula PNG failed');
  console.log(
    JSON.stringify(
      {
        ...info,
        tests: [
          'real-file-open',
          'whole-page-zoom',
          'isolated-diagram',
          'worker-zip-import',
          'atomic-save',
          'welcome-render',
          'offline-formula-svg',
          'offline-formula-png',
        ],
        isolatedProfile: dataDirectory.startsWith(directory),
      },
      null,
      2,
    ),
  );
} finally {
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
    })
    .catch(() => {});
  await app.close().catch(() => {});
  await fs.rm(directory, { recursive: true, force: true });
}
