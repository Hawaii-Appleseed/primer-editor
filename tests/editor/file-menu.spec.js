// The File menu: report-level actions collected where a document app puts them.
//
// Download and Token MOVED here from the top bar, keeping their ids and their
// handlers — the flows themselves are covered by download.spec.js and
// oauth.spec.js, which now reach them through this menu. What is asserted here
// is the menu itself: that it holds what it should, that the two new entries
// (Open, Resize) work, and that the window title names the report rather than
// the tool.
const { test, expect, gotoEditor, openFileMenu } = require('./fixtures/editor-test');

test.describe('File menu', () => {
  test('collects Open, Resize, Download and Token', async ({ page }) => {
    await gotoEditor(page);
    // Closed until asked for — it is a menu, not a panel.
    await expect(page.locator('#filepop')).toBeHidden();
    await openFileMenu(page);
    await expect(page.locator('#filepop button')).toHaveText(
      ['Open…', 'Resize…', 'Download…', 'Token…']);
  });

  test('Download and Token are no longer loose in the toolbar', async ({ page }) => {
    await gotoEditor(page);
    // Moved, not duplicated: exactly one of each, and neither is a direct
    // child of the bar any more.
    await expect(page.locator('#download')).toHaveCount(1);
    await expect(page.locator('#tok')).toHaveCount(1);
    await expect(page.locator('#bar > #download')).toHaveCount(0);
    await expect(page.locator('#bar > #tok')).toHaveCount(0);
    await expect(page.locator('#filepop #download')).toHaveCount(1);
    await expect(page.locator('#filepop #tok')).toHaveCount(1);
  });

  test('+ Section is hidden, but still wired', async ({ page }) => {
    await gotoEditor(page);
    await expect(page.locator('#add')).toBeHidden();
    // Hidden is a presentation decision. The control and its handler stay, so
    // bringing it back is one CSS line rather than rebuilding a feature —
    // and clickAddSection() in the fixtures still drives every section test.
    expect(await page.evaluate(() => typeof document.getElementById('add').onclick))
      .toBe('function');
  });

  test('the window title names the report, not the editor', async ({ page }) => {
    await gotoEditor(page);
    // Several of these are open at once in normal use; "Draft editor" on all
    // of them named what they had in common instead of what told them apart.
    await expect(page).not.toHaveTitle('Draft editor');
    const expected = await page.evaluate(async () => {
      const m = await (await fetch('engine/manifest.json', { cache: 'no-store' })).json();
      return m.id;
    });
    await expect(page).toHaveTitle(new RegExp(expected, 'i'));
  });
});

test.describe('File ▸ Resize', () => {
  test('offers the six doc sizes and marks the one in use', async ({ page }) => {
    await gotoEditor(page);
    await openFileMenu(page);
    await page.click('#file-resize');
    await expect(page.locator('#resizepop')).toBeVisible();

    const tiles = page.locator('#size-list button');
    await expect(tiles).toHaveCount(6);
    await expect(tiles).toHaveText([
      /Doc \(Digital\)/, /Doc \(Pageless\)/, /Doc \(A4\)/,
      /Doc \(A3\)/, /Doc \(Legal\)/, /Doc \(Letter\)/,
    ]);
    // The fixture report is 8.5x11, so Letter — and only Letter — is current.
    // Matched on the page's real geometry, not a stored name, so this stays
    // honest if the size is ever changed somewhere else.
    await expect(page.locator('#size-list button[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('#size-list button[aria-current="true"]')).toContainText('Letter');
  });

  test('every size carries its dimensions, and each sheet is drawn to its own shape', async ({ page }) => {
    await gotoEditor(page);
    await openFileMenu(page);
    await page.click('#file-resize');
    // The whole reason to choose a size is the proportion, which a name cannot
    // show — so a row of identically-shaped rectangles would be decoration.
    const shapes = await page.locator('#size-list .size-art i').evaluateAll(
      els => els.map(e => (parseFloat(e.style.height) / parseFloat(e.style.width)).toFixed(2)));
    expect(new Set(shapes).size).toBeGreaterThan(2);
    // Digital is the only landscape one.
    expect(Number(shapes[0])).toBeLessThan(1);
    await expect(page.locator('#size-list .size-dim').first()).toHaveText(/13\.33 × 7\.5 in/);
  });

  test('picking a size that is not wired up yet says so instead of pretending', async ({ page }) => {
    await gotoEditor(page);
    await openFileMenu(page);
    await page.click('#file-resize');
    await page.click('#size-list button[data-size="a3"]');
    // Page size is set when the report is BUILT (the report's own stylesheet
    // and docsync.yml's editor.page), so the editor cannot flip it alone. A
    // control that looked like it worked would be the worse answer.
    await expect(page.locator('#stat')).toContainText('not wired up yet');
    await expect(page.locator('#resizepop')).toBeHidden();
  });
});

test.describe('File ▸ Open', () => {
  test('lists the reports on this server and marks the open one', async ({ page }) => {
    await gotoEditor(page);
    await openFileMenu(page);
    await page.click('#file-open');
    await expect(page.locator('#openpop')).toBeVisible();
    const items = page.locator('#open-list button');
    expect(await items.count()).toBeGreaterThan(0);
    await expect(page.locator('#open-list button[aria-current="true"]')).toHaveCount(1);
  });

  test('choosing another report opens it', async ({ page }) => {
    await gotoEditor(page);
    await openFileMenu(page);
    await page.click('#file-open');
    const other = page.locator('#open-list button:not([aria-current="true"])').first();
    test.skip(await other.count() === 0, 'only one report registered on this server');
    const id = await other.getAttribute('data-open');
    await other.click();
    await page.waitForURL(new RegExp('project=' + id));
  });
});
