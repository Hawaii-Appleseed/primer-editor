// An inline text editor must SURVIVE a render that lands mid-edit.
//
// finish() runs render() after every editor close, and SSE bumps re-render a
// live tab at any time — so a swap arriving while someone is typing was easy
// to hit. The swap removed the old document, which destroyed the open editor,
// ate whatever was typed, and — because a removed contenteditable fires no
// blur — left `editing` stuck true. From then on every dblclick was silently
// ignored (edit() refuses while `editing`), the iframe's keydown ignored
// Delete, and clicks were swallowed by the commit-the-editor path whose host
// no longer existed: "takes several clicks to start editing", "still can't
// delete text boxes". renderOnce() now defers the swap while `editing`; the
// editor's own finish() renders again and supersedes the deferred twin, so
// nothing is ever lost and the flag cannot strand.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const SLOT = 'basics.h1';

async function openEditorOn(page, frame) {
  await frame.locator('section.page').nth(2).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await frame.locator(`[data-slot="${SLOT}"]`).dblclick({ force: true });
  await frame.locator('.ds-edit').waitFor({ state: 'visible' });
}

test.describe('a render landing mid-edit', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('does not destroy the open editor or what was typed', async ({ page }) => {
    const frame = page.frameLocator('#out');
    await openEditorOn(page, frame);
    await page.keyboard.type('XYZPROBE ');

    // The race: a render fires while the editor is open (the tail of a
    // previous commit, or a live-server bump). Pre-fix, the swap removed the
    // document under the caret.
    await page.evaluate(() => { render(); });
    await page.waitForTimeout(3500);

    const host = frame.locator('.ds-edit');
    await expect(host).toHaveCount(1);          // still open
    await expect(host).toContainText('XYZPROBE');   // nothing eaten
    expect(await page.evaluate(() => editing)).toBe(true);

    // Escape discards; finish()'s own render supersedes the deferred twin and
    // the flag comes back down — the editor is not stranded.
    await page.keyboard.press('Escape');
    await expect(frame.locator('.ds-edit')).toHaveCount(0, { timeout: 15000 });
    await expect.poll(() => page.evaluate(() => editing)).toBe(false);

    // And text editing still works afterwards — the pre-fix state killed it.
    await openEditorOn(page, frame);
    await expect(frame.locator('.ds-edit')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(frame.locator('.ds-edit')).toHaveCount(0, { timeout: 15000 });
  });

  test('a single selected text object shows a working Delete button', async ({ page }) => {
    // The arrange strip (and its #ar-del) is not shown for a single text
    // object — the type row is. Delete therefore lives there too; keyboard
    // Delete remains, but a control people look for must exist.
    const frame = page.frameLocator('#out');
    await frame.locator('section.page').nth(2).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await frame.locator(`[data-el="${SLOT}"]`).click();

    const del = page.locator('#ty-del');
    await expect(del).toBeVisible();
    await expect(del).toBeEnabled();
    await del.click();
    await expect.poll(() => page.evaluate(() => layout.hidden)).toEqual([SLOT]);

    // Bring it back (File > Restore deleted), so the spec leaves no state.
    await page.click('#file');
    await page.click('#file-restore');
    const dlg = page.locator('dialog[open]');
    await dlg.getByRole('button', { name: 'Restore' }).click();
    await expect.poll(() => page.evaluate(() => layout.hidden)).toBeUndefined();

    // While a text editor is open, the button hides — Delete there is typing.
    await openEditorOn(page, frame);
    await expect(del).toBeHidden();
    await page.keyboard.press('Escape');
  });
});
