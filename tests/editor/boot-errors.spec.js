// Boot failures that name their cause (docsync/editor/edit.html boot().catch).
// "Failed to fetch" is what the browser says for every network failure and it
// names none of them. Locally the usual cause is that the dev server is not
// running — and the service worker makes that genuinely confusing, because
// edit.html comes from cache so the page DRAWS and only its engine files
// (network-only, deliberately) fail.
const { test, expect, blockDangerousLocalEndpoints } = require('./fixtures/editor-test');

test.describe('boot errors', () => {
  test('a dead dev server is named, not reported as "Failed to fetch"', async ({ page, context }) => {
    await blockDangerousLocalEndpoints(context);
    // The shape of the real failure: the page itself loads, everything it
    // needs afterwards does not.
    await context.route('**/engine/**', route => route.abort());
    await context.route('**/__ping', route => route.abort());

    await page.goto('edit.html');
    const stat = page.locator('#stat');
    await expect(stat).toHaveClass(/\berr\b/, { timeout: 30_000 });
    await expect(stat).toContainText('dev server is not running');
    await expect(stat).toContainText('make -C report2027 live');
    // The row ellipsises, so the whole sentence has to survive on hover.
    expect(await stat.getAttribute('title')).toContain('offline cache');
  });

  test('with the server up, boot says nothing about being broken', async ({ page, context }) => {
    await blockDangerousLocalEndpoints(context);
    await page.goto('edit.html');
    await page.frameLocator('#out').locator('.page').first()
      .waitFor({ state: 'visible', timeout: 75_000 });
    await expect(page.locator('#stat')).not.toHaveClass(/\berr\b/);
  });

  // Pyodide is a ~30MB CDN download and the first thing a new user needs. When
  // that script does not load — offline, a proxy, a network that blocks
  // jsdelivr — loadPyodide is simply undefined, and the failure read as an
  // anonymous ReferenceError at the moment someone is least able to guess why.
  // It is cached after one success, so this is a first-run cliff.
  test('a blocked Pyodide CDN is named, not an anonymous ReferenceError', async ({ page, context }) => {
    await blockDangerousLocalEndpoints(context);
    await context.route('**/cdn.jsdelivr.net/**', route => route.abort());

    await page.goto('edit.html');
    const stat = page.locator('#stat');
    await expect(stat).toHaveClass(/\berr\b/, { timeout: 30_000 });
    await expect(stat).toContainText('render engine');
    await expect(stat).toContainText('cdn.jsdelivr.net');
    // The row ellipsises, so the whole sentence has to survive on hover.
    expect(await stat.getAttribute('title')).toContain('cached after the first');
  });
});
