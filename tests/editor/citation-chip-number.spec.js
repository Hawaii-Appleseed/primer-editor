// Opening a citation for editing must show the NUMBER the reader already
// sees, not the raw [^source-id] token.
//
// mdInlineToHtml renders every [^id] as a non-editable chip (so it can't be
// typed into or split by accident), but until now the chip's own label was
// always `[^${id}]` — the literal token, brackets, caret and all. A source id
// is a descriptive slug ("workforce-profile", "nhpi-poverty"), often much
// longer than the one- or two-digit superscript it resolves to everywhere
// else in the report. So double-clicking a sentence that had been reading as
// a quiet superscript "5" replaced it with the literal text "[^workforce-
// profile]" sitting inline — reflowing the paragraph around a chip several
// times wider than the number it stands for, exactly while you're trying to
// read and edit the words around it.
//
// The fix reads the number the citation is ALREADY rendered as (the <sup>
// sitting in the element right before editing replaces it) and uses that as
// the chip's label instead — everywhere a citation can be edited: a slot
// (edit()), a table cell (editCell()), and a text box (editBox(), the report
// this was filed against). This spec covers the text-box case.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const SOURCE_ID = 'workforce-profile';   // declared under [[sources]] in the fixture

async function addCitedTextBox(page) {
  await page.evaluate(async (sid) => {
    pushHistory();
    boxes().push({
      id: 'fnbox', page: 3, x: 1, y: 1, w: 3, z: 5,
      md: `See the workforce data.[^${sid}] More context follows.`,
    });
    markDirty();
    await render();
  }, SOURCE_ID);
  await page.waitForTimeout(400);
}

test.describe('a citation opened for editing', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await page.waitForTimeout(900);
  });

  test('shows its rendered number, not the raw source id', async ({ page }) => {
    await addCitedTextBox(page);

    const frame = page.frameLocator('#out');
    const box = frame.locator('[data-el="text.fnbox"]');
    await expect(box.locator('sup')).toBeVisible();
    const renderedNumber = (await box.locator('sup').textContent()).trim();
    expect(renderedNumber).toMatch(/^\d+$/);   // sanity: it really did resolve

    await page.evaluate(() => {
      const d = $('out').contentDocument;
      editBox(d, d.querySelector('[data-el="text.fnbox"]'));
    });
    await page.waitForTimeout(300);

    const chip = frame.locator('.ds-edit .ds-fnchip');
    await expect(chip).toBeVisible();
    // The bug: this used to read "[^workforce-profile]".
    await expect(chip).toHaveText(renderedNumber);
    await expect(chip).toHaveAttribute('data-fn-id', SOURCE_ID);
  });

  test('still round-trips to the exact [^id] token, whatever label the chip shows',
    async ({ page }) => {
      await addCitedTextBox(page);
      await page.evaluate(() => {
        const d = $('out').contentDocument;
        editBox(d, d.querySelector('[data-el="text.fnbox"]'));
      });
      await page.waitForTimeout(300);

      // htmlToMd keys off data-fn-id, never the chip's visible text — so this
      // must hold regardless of what fnRenderedLabels decided to display.
      const md = await page.evaluate(() => htmlToMd(richHost, { allowLists: true }));
      expect(md).toContain(`[^${SOURCE_ID}]`);
      expect(md).toContain('See the workforce data.');
      expect(md).toContain('More context follows.');
    });
});
