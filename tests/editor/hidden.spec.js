// Delete on a DESIGNED element (renderer-emitted, no layout.json entry) used
// to be a silent no-op: deleteSel matched shapes, boxes, tables and position
// overrides, and a designed element in its designed place is none of those —
// touched stayed false and the history entry was popped. Now Delete stages:
//   moved element   -> back to its designed spot (the old behavior, kept)
//   designed spot   -> hidden (layout.hidden; ghost in the editor,
//                      display:none when published)
//   ghost           -> restored
// Local mode; basics.h1 is the same guinea pig movable-headings.spec.js uses.
// Delete goes through the KEYBOARD: for a single text object the toolbar row
// shows the type controls, not the arrange strip, so #ar-del isn't on screen
// — which is exactly the path a person deleting a heading takes.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const ID = 'basics.h1';

async function selectH1(page, frame) {
  await frame.locator('section.page').nth(2).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await frame.locator(`[data-el="${ID}"]`).click();
}

test.describe('deleting a designed element hides it, reversibly', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('delete hides, the ghost is marked, delete again restores', async ({ page }) => {
    const frame = page.frameLocator('#out');
    await selectH1(page, frame);

    // Pre-fix this exact step left layout.hidden undefined — the no-op path.
    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(() => layout.hidden)).toEqual([ID]);

    // The re-render ghosts it: still present, still selectable, marked.
    const ghost = frame.locator(`[data-el="${ID}"]`);
    await expect(ghost).toHaveAttribute('data-hidden', '1');
    await expect(ghost).toHaveCount(1);

    // Deleting the ghost restores — hidden clears, marker gone.
    await ghost.click();
    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(() => layout.hidden)).toBeUndefined();
    await expect(frame.locator(`[data-el="${ID}"]`)).not.toHaveAttribute('data-hidden', '1');
  });

  test('a moved element resets first, hides second — the old behavior survives', async ({ page }) => {
    const frame = page.frameLocator('#out');
    await selectH1(page, frame);

    // Seed a position override the way a drag would.
    await page.evaluate(id => {
      layout.positions[id] = { x: 1.2, y: 3.4, w: 3 };
      markDirty();
    }, ID);

    // First delete: reset the move, do NOT hide.
    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(id => layout.positions[id], ID)).toBeUndefined();
    expect(await page.evaluate(() => layout.hidden)).toBeUndefined();

    // Second delete: now it hides.
    await selectH1(page, frame);
    await page.keyboard.press('Delete');
    await expect.poll(() => page.evaluate(() => layout.hidden)).toEqual([ID]);

    // Restore so this spec leaves no state behind for the next one.
    await frame.locator(`[data-el="${ID}"]`).click();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(400);
  });

  test('a hidden element publishes as display:none and gives back its flow slot', async ({ page }) => {
    const frame = page.frameLocator('#out');
    await selectH1(page, frame);
    await page.keyboard.press('Delete');

    // The editor's own render runs with DOCSYNC_EDIT, so published bytes are
    // asserted engine-side (test_docsync.py). Here: the ghost must not
    // actually vanish from the editor canvas...
    const ghost = frame.locator(`[data-el="${ID}"]`);
    // The re-render swaps documents in when Pyodide finishes — under a loaded
    // suite that can outlast any fixed sleep, so wait for the marker itself.
    await expect(ghost).toHaveAttribute('data-hidden', '1', { timeout: 30000 });
    await expect(ghost).toBeVisible();
    // ...while carrying the ghost treatment, not the published hiding.
    const style = await ghost.getAttribute('style');
    expect(style).toContain('opacity:.35');
    expect(style).not.toContain('display:none');
  });
});
