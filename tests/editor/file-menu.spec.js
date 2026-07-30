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
  test('collects Open, New window, Resize, Download, Restore and Token', async ({ page }) => {
    await gotoEditor(page);
    // Closed until asked for — it is a menu, not a panel.
    await expect(page.locator('#filepop')).toBeHidden();
    await openFileMenu(page);
    // New window is local-only (see new-window.spec.js) and Restore deleted
    // only shows when something IS deleted (see hidden.spec.js) — both are
    // always in the DOM, so they belong in this list either way.
    await expect(page.locator('#filepop button')).toHaveText(
      ['Open…', 'New window', 'Resize…', 'Download…', 'Restore deleted…', 'Token…']);
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

  /** The rendered sheet, as the browser computes it. The assertion that
   *  matters: not what the editor stored, but what the document became. */
  const sheet = (page) => page.evaluate(() => {
    const d = document.getElementById('out').contentDocument;
    const p = d.querySelector('.page');
    const cs = d.defaultView.getComputedStyle(p);
    return { width: cs.width, minHeight: cs.minHeight };
  });

  const pickSize = async (page, id) => {
    await openFileMenu(page);
    await page.click('#file-resize');
    await page.click(`#size-list button[data-size="${id}"]`);
    await expect(page.locator('#stat')).toContainText('page is now');
  };

  test('picking a size re-renders the document at it', async ({ page }) => {
    await gotoEditor(page);
    expect(await sheet(page)).toEqual({ width: '816px', minHeight: '1056px' });   // 8.5 x 11in

    await pickSize(page, 'a3');
    // 11.69 x 16.54in at 96dpi. Asserted on the RENDERED page, not on
    // layout.page — the editor storing a number the renderer ignores is
    // exactly the failure this feature has to avoid.
    await expect.poll(() => sheet(page), { timeout: 20000 })
      .toEqual({ width: '1122.24px', minHeight: '1587.84px' });
    expect(await page.evaluate(() => layout.page)).toEqual({ w: 11.69, h: 16.54 });
    // And it counts as an edit, because it changes what Save would write.
    expect(await page.evaluate(() => dirty)).toBe(true);
  });

  test('the size in use is re-marked after a change', async ({ page }) => {
    await gotoEditor(page);
    await pickSize(page, 'legal');
    await openFileMenu(page);
    await page.click('#file-resize');
    await expect(page.locator('#size-list button[aria-current="true"]')).toContainText('Legal');
  });

  test('pageless drops the fixed height instead of picking a large one', async ({ page }) => {
    await gotoEditor(page);
    await pickSize(page, 'pageless');
    // A pageless document has no bottom: the sheet keeps its width and grows
    // with its content.
    await expect.poll(() => sheet(page), { timeout: 20000 })
      .toEqual({ width: '816px', minHeight: '0px' });
    expect(await page.evaluate(() => layout.page)).toEqual({ w: 8.5, h: null });
    // The height every clamp measures against becomes a number no report
    // reaches, rather than a special case in each of them.
    expect(await page.evaluate(() => PAGE_H_IN)).toBe(200);
  });

  test('going back to the built size removes the override, not restates it', async ({ page }) => {
    await gotoEditor(page);
    await pickSize(page, 'a3');
    expect(await page.evaluate(() => layout.page)).toBeTruthy();

    await pickSize(page, 'letter');       // what this fixture was built at
    // A layout that was resized and put back must be byte-identical to one
    // that was never resized, or every round trip leaves a trace in the file.
    expect(await page.evaluate(() => 'page' in layout)).toBe(false);
    await expect.poll(() => sheet(page), { timeout: 20000 })
      .toEqual({ width: '816px', minHeight: '1056px' });
  });

  test('a wider sheet grows the canvas rather than being cut off', async ({ page }) => {
    await gotoEditor(page);
    const before = await page.evaluate(() => VIEW_W);
    await pickSize(page, 'digital');       // 13.33in — wider than the old fixed canvas
    // The canvas had a fixed design width from when every report was Letter.
    // A page wider than it disappeared behind the IFRAME's own scrollbar.
    await expect.poll(() => page.evaluate(() => VIEW_W), { timeout: 20000 })
      .toBeGreaterThan(Math.round(13.33 * 96));
    expect(before).toBe(1200);
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

// The chrome's two folding surfaces and what the contextual strip says about
// a selection. Grouped here because all three are about how much room the
// editor takes from the report, and what it spends that room saying.
test.describe('chrome', () => {
  test('the page strip folds, and remembers', async ({ page }) => {
    await gotoEditor(page);
    const height = () => page.locator('#rail').evaluate(el => Math.round(el.getBoundingClientRect().height));
    const open = await height();
    expect(open).toBeGreaterThan(80);

    await page.click('#rail-fold');
    await expect(page.locator('#rail')).toHaveClass(/folded/);
    await expect(page.locator('#rail-list')).toBeHidden();
    expect(await height()).toBeLessThan(open / 2);
    // Its label stays, so what is left says what bringing it back would give.
    await expect(page.locator('#rail-head')).toBeVisible();
    await expect(page.locator('#rail-fold')).toHaveAttribute('aria-expanded', 'false');

    // Whether you want thumbnails is a standing preference about how you work,
    // not a decision to retake every time the editor opens.
    await page.reload();
    await page.frameLocator('#out').locator('.page').first().waitFor({ state: 'visible', timeout: 75_000 });
    await expect(page.locator('#rail')).toHaveClass(/folded/);

    await page.click('#rail-fold');
    await expect(page.locator('#rail')).not.toHaveClass(/folded/);
  });

  test('the contextual strip never shows an element’s internal id', async ({ page }) => {
    await gotoEditor(page);
    const el = page.frameLocator('#out').locator('[data-el]').first();
    await el.click({ force: true });
    await expect(page.locator('#arrange')).toBeVisible();

    // "cover.logo" is the name a slot has inside content.md — noise on screen,
    // and on a designed element a name the person never chose. The id stays on
    // hover, where it costs nothing and still answers "which slot is this?".
    const id = await el.getAttribute('data-el');
    await expect(page.locator('#ar-count')).toBeHidden();
    await expect(page.locator('#ar-count')).toHaveAttribute('title', id);
    await expect(page.locator('#arrange')).not.toContainText(id);
  });
});
