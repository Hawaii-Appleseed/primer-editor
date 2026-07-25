// Tables (docsync/editor/edit.html + layout.py tables_html): a placed,
// draggable, editable grid. The "Table" button creates one; cells edit in
// place on double-click; right-click a cell for rows & columns. Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

async function addTable(page) {
  // Create on a CONTENT page — the cover (page 1) has a full-bleed overlay
  // that would sit over the cells. Scroll a content page into view first so
  // visiblePageId() targets it.
  const frame = page.frameLocator('#out');
  await frame.locator('section.page').nth(3).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.click('#table');
  const tbl = frame.locator('table.ds-table[data-el]').first();
  await tbl.waitFor({ state: 'attached', timeout: 20000 });
  await tbl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  return tbl;
}

test.describe('tables', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('the Table button creates a header table with rows and cells', async ({ page }) => {
    const tbl = await addTable(page);
    await expect(tbl.locator('th')).toHaveCount(2);        // header row
    await expect(tbl.locator('tr')).toHaveCount(3);        // 1 header + 2 body
    // Selected on create, so it's deletable from the toolbar.
    await expect(page.locator('#ar-del')).toBeEnabled();
  });

  test('double-clicking a cell edits it in place', async ({ page }) => {
    const tbl = await addTable(page);
    const frame = page.frameLocator('#out');
    // Edit a body cell (row 1, col 0).
    const cell = tbl.locator('td[data-cell="1,0"]');
    await cell.dblclick();
    const editor = frame.locator('.ds-cell-edit');
    await editor.waitFor({ state: 'visible' });
    await editor.fill('Human Services');
    await editor.evaluate(el => el.blur());

    // The cell text (and the underlying model) now hold the new value.
    await expect(page.evaluate(() => layout.tables[0].rows[1][0])).resolves.toBe('Human Services');
    await expect(frame.locator('table.ds-table td', { hasText: 'Human Services' })).toHaveCount(1);
  });

  test('right-click inserts a row via the rows & columns menu', async ({ page }) => {
    const tbl = await addTable(page);
    const frame = page.frameLocator('#out');
    const before = await page.evaluate(() => layout.tables[0].rows.length);

    await tbl.locator('td[data-cell="1,0"]').click({ button: 'right' });
    const menu = frame.locator('.ds-menu');
    await expect(menu).toBeVisible();
    await menu.locator('button', { hasText: 'Insert row below' }).click();

    await expect(page.evaluate(() => layout.tables[0].rows.length)).resolves.toBe(before + 1);
  });

  test('right-click inserts a column across every row', async ({ page }) => {
    const tbl = await addTable(page);
    const frame = page.frameLocator('#out');

    await tbl.locator('th[data-cell="0,0"]').click({ button: 'right' });
    await frame.locator('.ds-menu button', { hasText: 'Insert column right' }).click();

    const widths = await page.evaluate(() => layout.tables[0].rows.map(r => r.length));
    expect(widths.every(w => w === 3)).toBe(true);   // every row gained a cell
  });

  // Regression: layout.py validates shapes, boxes AND tables against ONE id
  // namespace, but the editor had two allocators that each saw only part of
  // it — freeBoxId skipped tables, freeTableId skipped boxes and shapes. So a
  // text box took 't1', the next table took 't1' too, and the render that
  // followed died in the validator: the whole canvas went to "This draft does
  // not build: duplicate id 't1' — already a shape or box".
  test('a table added after a text box gets its own id, and the draft still builds', async ({ page }) => {
    const frame = page.frameLocator('#out');
    await frame.locator('section.page').nth(3).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.click('#text');
    await page.click('#textpop .txtpreset[data-k="body"]');
    await frame.locator('.ds-textbox').first().waitFor({ state: 'attached', timeout: 20000 });
    await page.waitForTimeout(600);

    await page.click('#table');
    await frame.locator('table.ds-table[data-el]').first()
      .waitFor({ state: 'attached', timeout: 20000 });
    await page.waitForTimeout(800);

    const ids = await page.evaluate(() => ({
      boxes: (layout.boxes || []).map(b => b.id),
      tables: (layout.tables || []).map(t => t.id),
      shapes: (layout.shapes || []).map(s => s.id),
    }));
    const all = [...ids.boxes, ...ids.tables, ...ids.shapes];
    expect(ids.tables).toHaveLength(1);
    expect(new Set(all).size).toBe(all.length);          // no id used twice

    // The validator ran and passed: the report is on screen, not the error page.
    await expect(frame.locator('section.page').first()).toBeVisible();
    await expect(page.locator('#stat')).not.toContainText('does not build');
  });
});
