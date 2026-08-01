// Cold-start work (edit.html): the engine compiles from parse time, its CDN
// assets are preloaded from the head, and the LAST successful render paints
// into #out read-only while Pyodide warms (showWarmPreview / the ds-preview
// cache), arming when the real first render swaps in. Local mode.
//
// Service workers are BLOCKED here: these tests interpose on the CDN with
// page.route to hold the wasm back, and a route never sees a request a
// worker answered from its cache. Blocking also keeps the fetch counts
// honest — every request in the log went to the network layer exactly once.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

test.use({ serviceWorkers: 'block' });

const DEMO = '?project=demo-report';
const previewCount = (page) => page.evaluate(async () => {
  const c = await caches.open('ds-preview-v1');
  return (await c.keys()).length;
});

test.describe('cold start', () => {
  test('every engine asset is fetched exactly once — a mismatched preload doubles one',
    async ({ page }) => {
      await gotoEditor(page, DEMO);
      const counts = await page.evaluate(() => {
        const c = {};
        performance.getEntriesByType('resource')
          .map(r => r.name.split('/').pop().split('?')[0])
          .filter(n => /^pyodide|^python_stdlib/.test(n))
          .forEach(n => { c[n] = (c[n] || 0) + 1; });
        return c;
      });
      expect(counts).toEqual({
        'pyodide.js': 1, 'pyodide.asm.js': 1, 'pyodide.asm.wasm': 1,
        'python_stdlib.zip': 1, 'pyodide-lock.json': 1,
      });
    });

  test('a boot stores its render as the next boot\'s preview', async ({ page }) => {
    await gotoEditor(page, DEMO);
    await page.waitForTimeout(4000);        // past the store's debounce
    expect(await previewCount(page)).toBeGreaterThanOrEqual(1);
    const html = await page.evaluate(async () => {
      const c = await caches.open('ds-preview-v1');
      const r = await c.match('/__preview/demo-report');
      return r ? (await r.text()).slice(0, 400) : null;
    });
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('the canvas paints the last render while the engine warms, then arms',
    async ({ page, context }) => {
      // Visit one: boot normally so a preview exists for the next boot.
      await gotoEditor(page, DEMO);
      await page.waitForTimeout(4000);
      expect(await previewCount(page)).toBeGreaterThanOrEqual(1);

      // Visit two, with the wasm held back: the warm-up window, stretched
      // wide enough to look inside it.
      await context.route('**/pyodide.asm.wasm', async route => {
        await new Promise(r => setTimeout(r, 5000));
        await route.continue();
      });
      await page.goto('edit.html' + DEMO);
      // The preview needs only the registry + manifest (a few ms); the engine
      // needs the wasm we are sitting on. It paints in its OWN overlay frame:
      // #out stays empty until a real render fills it, so nothing that waits
      // on "#out has pages" is ever satisfied by a read-only stand-in.
      await expect(page.frameLocator('#ds-warm').locator('section.page').first())
        .toBeVisible({ timeout: 4000 });
      const during = await page.evaluate(() => ({
        engineReady: typeof py !== 'undefined' && !!py,
        text: document.getElementById('ds-warm').contentDocument.body.textContent.slice(0, 2000),
        outEmpty: !document.getElementById('out').contentDocument
          .querySelector('section.page'),
      }));
      expect(during.engineReady).toBe(false);       // still inside the warm-up
      expect(during.text).toContain('A SECOND REPORT');
      expect(during.outEmpty).toBe(true);           // the live frame made no promises
      // the note rides the canvas as a chip — the status row belongs to
      // detectLocal, whose own message lands moments later
      await expect(page.locator('#ds-warmchip')).toBeVisible();
      await expect(page.locator('#ds-warmchip')).toContainText('warming up');

      // The wasm lands, the real render replaces the preview, editing arms.
      await page.waitForFunction(() => typeof py !== 'undefined' && !!py,
        null, { timeout: 60000 });
      await page.frameLocator('#out').locator('[data-el="page1.h1"]')
        .waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(800);
      // preview frame and chip both died with the swap
      await expect(page.locator('#ds-warm')).toHaveCount(0);
      await expect(page.locator('#ds-warmchip')).toHaveCount(0);
      await page.frameLocator('#out').locator('[data-el="page1.h1"]').click();
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => selIds.size)).toBeGreaterThan(0);
    });

  test('a draft link never flashes the live copy', async ({ page, context }) => {
    // Store a preview first, so skipping is a choice rather than an absence.
    await gotoEditor(page, DEMO);
    await page.waitForTimeout(4000);
    expect(await previewCount(page)).toBeGreaterThanOrEqual(1);

    await context.route('**/pyodide.asm.wasm', async route => {
      await new Promise(r => setTimeout(r, 4000));
      await route.continue();
    });
    await page.goto('edit.html' + DEMO + '&draft=zz-nobody');
    await page.waitForTimeout(1500);        // well inside the warm-up window
    const during = await page.evaluate(() => ({
      engineReady: typeof py !== 'undefined' && !!py,
      warmFrames: document.querySelectorAll('#ds-warm').length,
    }));
    expect(during.engineReady).toBe(false);
    expect(during.warmFrames).toBe(0);      // no preview at all on a draft link
    // Local mode discards the draft param and still boots to a live canvas.
    await page.frameLocator('#out').locator('section.page').first()
      .waitFor({ state: 'visible', timeout: 60000 });
  });
});
