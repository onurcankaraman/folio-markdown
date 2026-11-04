import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.document-sheet h1')).toBeVisible();
});

test('paper zoom scales the complete sheet without reflow or changing text size settings', async ({
  page,
}) => {
  const geometry = () =>
    page.locator('.document-sheet').evaluate((sheet) => ({
      width: sheet.getBoundingClientRect().width,
      heading: sheet.querySelector('h1')!.getBoundingClientRect().width,
      font: getComputedStyle(sheet.querySelector('h1')!).fontSize,
      toolbar: document.querySelector('.document-toolbar')!.getBoundingClientRect().height,
    }));
  const before = await geometry();
  await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).fill('200');
  const after = await geometry();
  await page.screenshot({ path: '/tmp/folio-page-zoom-200.png' });
  expect(after.width).toBeCloseTo(before.width * 2, 0);
  expect(after.heading).toBeCloseTo(before.heading * 2, 0);
  expect(after.font).toBe(before.font);
  expect(after.toolbar).toBe(before.toolbar);
  await expect(page.getByRole('slider', { name: 'Yazı boyutu ölçeği' })).toHaveValue('100');
  await page.getByRole('slider', { name: 'Yazı boyutu ölçeği' }).fill('150');
  expect((await geometry()).width).toBe(after.width);
  await page.getByRole('button', { name: 'Sayfayı %100 göster' }).click();
  expect((await geometry()).width).toBe(before.width);
});

test('trackpad pinch keeps the paper point under the pointer and native two-axis pan works', async ({
  page,
}) => {
  await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).fill('150');
  await page.locator('.document-scroll').evaluate((view) => {
    view.scrollTop = 300;
    view.scrollLeft = 120;
  });
  const anchor = await page.locator('.document-scroll').evaluate((view) => {
    const r = view.getBoundingClientRect(),
      s = view.querySelector('.document-sheet')!.getBoundingClientRect();
    const x = r.left + r.width * 0.6,
      y = r.top + r.height * 0.4;
    return { x, y, paperX: (x - s.left) / s.width, paperY: (y - s.top) / s.height };
  });
  await page.locator('.document-scroll').evaluate((view, p) => {
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -40,
      clientX: p.x,
      clientY: p.y,
    });
    view.dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error('Pinch must not zoom the app');
  }, anchor);
  await expect
    .poll(async () =>
      Number(
        await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).inputValue(),
      ),
    )
    .toBeGreaterThan(150);
  const error = await page.locator('.document-sheet').evaluate((sheet, p) => {
    const r = sheet.getBoundingClientRect();
    return {
      x: Math.abs(r.left + p.paperX * r.width - p.x),
      y: Math.abs(r.top + p.paperY * r.height - p.y),
    };
  }, anchor);
  expect(error.x).toBeLessThan(2);
  expect(error.y).toBeLessThan(2);
  await page.mouse.move(anchor.x, anchor.y);
  const before = await page
    .locator('.document-scroll')
    .evaluate((view) => ({ x: view.scrollLeft, y: view.scrollTop }));
  await page.mouse.wheel(90, 120);
  await expect
    .poll(() => page.locator('.document-scroll').evaluate((view) => view.scrollLeft))
    .toBeGreaterThan(before.x);
  await expect
    .poll(() => page.locator('.document-scroll').evaluate((view) => view.scrollTop))
    .toBeGreaterThan(before.y);
});

test('fit follows viewport changes and zoom shortcuts have limits', async ({ page }) => {
  await page.getByRole('button', { name: 'Genişliğe sığdır', exact: true }).click();
  const fits = () =>
    page.locator('.document-scroll').evaluate((view) => view.scrollWidth <= view.clientWidth + 1);
  await expect.poll(fits).toBe(true);
  const first = Number(
    await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).inputValue(),
  );
  await page.setViewportSize({ width: 1050, height: 800 });
  await expect
    .poll(async () =>
      Number(
        await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).inputValue(),
      ),
    )
    .toBeLessThan(first);
  await expect.poll(fits).toBe(true);
  await page.keyboard.press('Control+0');
  await expect(page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true })).toHaveValue(
    '100',
  );
  await page.keyboard.press('Control+=');
  await expect(page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true })).toHaveValue(
    '110',
  );
  await page.keyboard.press('Control+-');
  await expect(page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true })).toHaveValue(
    '100',
  );
  await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).fill('300');
  await page.keyboard.press('Control+=');
  await expect(
    page.getByRole('button', { name: 'Sayfayı yakınlaştır', exact: true }),
  ).toBeDisabled();
  await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).fill('25');
  await page.keyboard.press('Control+-');
  await expect(
    page.getByRole('button', { name: 'Sayfayı uzaklaştır', exact: true }),
  ).toBeDisabled();
});

test('zoomed visual editing preserves text and source mode disables paper controls', async ({
  page,
}) => {
  await page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }).fill('175');
  await page.getByRole('button', { name: 'Düzenle', exact: true }).first().click();
  await page.locator('.tiptap h1').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Yakınlaştırma testi.');
  await page.getByRole('button', { name: 'Kaynak', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Yakınlaştırma testi.');
  await expect(
    page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Bölünmüş', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Sayfa yakınlaştırma', exact: true })).toHaveValue(
    '175',
  );
  await page.getByRole('button', { name: 'Genişliğe sığdır', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('.document-scroll').evaluate((v) => v.scrollWidth <= v.clientWidth + 1),
    )
    .toBe(true);
});
