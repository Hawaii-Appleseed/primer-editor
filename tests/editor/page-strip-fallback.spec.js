// The page strip for reports whose renderer does NOT declare its pages.
//
// The strip was built for the Primer, and it showed: `designedPages` came only
// from the ds-pagemeta script that report's renderer emits, so for every other
// report the list was empty and railRender() hid the whole strip — no
// thumbnails, no page numbers, no click-to-scroll. Even where a strip did
// appear, each preview was found with section[data-page="<id>"], another thing
// only that renderer stamps, so the chips fell back to the empty hatch.
//
// Two halves, and this file pins both:
//   * declared (L.pagemeta / the Primer) — thumbnails AND order editing;
//   * undeclared (demo-report and every hand-written renderer) — thumbnails and
//     navigation, with the order-editing controls deliberately absent, because
//     layout.pages means nothing to a renderer that never reads page_order().
// Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

/** How many chips show a real preview rather than the empty hatch. Reads the
 *  shadow root, which is where the cloned page actually lands — asserting on
 *  the absence of .empty alone would pass on a chip whose shadow tree is there
 *  but built to nothing (a scale(0) preview is exactly how this broke once). */
const previewCount = page => page.evaluate(() =>
  [...document.querySelectorAll('#rail-list .chip')]
    .filter(c => c.querySelector('.chip-view')?.shadowRoot?.childElementCount).length);

test.describe('page strip: renderer declares no pages', () => {
  test.beforeEach(async ({ page }) => {
    // demo-report's renderer emits no ds-pagemeta and no data-page — the case
    // the whole strip used to be invisible for. A tracked binding in this
    // repo's docsync.yml, so it is here in every clone, and kept unstamped on
    // purpose now that our-mission, rxkids and docsync.scaffold's output all
    // declare their pages (see insert-page-target.spec.js, which relies on the
    // same thing).
    await gotoEditor(page, '?project=demo-report');
    await page.waitForTimeout(800);
    // The premise, asserted rather than assumed: every check below is about
    // what the editor does with NO declaration, so a converted subject would
    // quietly turn this file into a test of the other branch.
    expect(await page.evaluate(() => pagesDeclared),
      'demo-report is the designated undeclared renderer; it now declares its '
      + 'pages, so this file needs a different subject').toBe(false);
  });

  test('the strip appears, with a real preview for every sheet', async ({ page }) => {
    await expect(page.locator('#rail')).toBeVisible();
    const sheets = await page.frameLocator('#out').locator('section.page').count();
    expect(sheets).toBeGreaterThan(1);          // a one-page report proves nothing

    // A chip per sheet, every one of them drawn.
    await expect(page.locator('#rail-list .chip')).toHaveCount(sheets);
    await expect.poll(() => previewCount(page)).toBe(sheets);
    await expect(page.locator('#rail-list .chip-thumb.empty')).toHaveCount(0);

    // Pages this report never named still get their ordinal, which is what a
    // report with no page identity means by "page 2".
    expect(await page.locator('#rail-list .chip').first().getAttribute('data-pid')).toBe('1');
  });

  test('clicking a chip scrolls to that page', async ({ page }) => {
    const frame = page.frameLocator('#out');
    const second = frame.locator('section.page').nth(1);
    const top = () => second.evaluate(el => el.getBoundingClientRect().top);
    const before = await top();

    await page.locator('#rail-list .chip').nth(1).click();
    await page.waitForTimeout(900);            // smooth scroll

    // The lookup used to be by data-page, which this report does not stamp, so
    // the click found nothing and scrolled nowhere.
    expect(await top()).toBeLessThan(before);
    await expect(page.locator('#rail-list .chip').nth(1)).toHaveClass(/\bon\b/);
  });

  test('the order-editing controls are absent, not inert', async ({ page }) => {
    // Reordering, hiding and blank pages all need a renderer that reads
    // L.page_order(); this one does not, so writing an order would change
    // layout.json and nothing on the page. Offering the control and doing
    // nothing is the one outcome worse than not offering it.
    await expect(page.locator('#rail-list .rail-ins')).toHaveCount(0);
    const draggable = await page.locator('#rail-list .chip').first()
      .evaluate(c => c.draggable);
    expect(draggable).toBe(false);

    // display:flex beats [hidden]'s display:none, so this needs the real
    // computed value — the same trap as #bar > button[hidden] and .pop .shp.
    await expect(page.locator('#rail-add')).toBeHidden();
    expect(await page.locator('#rail-add').evaluate(b => getComputedStyle(b).display))
      .toBe('none');
  });
});

test.describe('page strip: renderer declares its pages', () => {
  test('the Primer keeps thumbnails AND the full order editor', async ({ page }) => {
    await gotoEditor(page);                     // default project: budget-primer
    await page.waitForTimeout(800);

    const chips = page.locator('#rail-list .chip');
    const n = await chips.count();
    expect(n).toBeGreaterThan(1);
    await expect.poll(() => previewCount(page)).toBe(n);

    // Declared pages carry their names, which is what the fallback cannot know.
    await expect(chips.first().locator('.chip-lab')).toHaveText('Cover');

    // Everything the undeclared case withholds is present here. Hiding is not
    // on that list — it is gone for every report (see pages.spec.js).
    await expect(page.locator('#rail-list .rail-ins')).toHaveCount(n + 1);
    await expect(page.locator('#rail-list .chip-eye')).toHaveCount(0);
    await expect(page.locator('#rail-add')).toBeVisible();
    expect(await chips.first().evaluate(c => c.draggable)).toBe(true);
  });
});
