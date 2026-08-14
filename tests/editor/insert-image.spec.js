// Insert image (#ar-img in the arrange strip). One flow: the upload posts
// /__upload to the dev server in local mode (no GitHub token), which writes
// the file into the BINDING's own assets dir on disk; the image is then
// placed as a floating box whose markdown is just the image, so it moves,
// resizes and layers like any placed thing and persists through layout.json.
//
// The endpoint itself is MOCKED here (fixtures/editor-test.js) for the same
// reason __save/__push are: the default project's binding roots in a real
// checkout on this machine. The mock honours the real response contract, so
// everything editor-side — payload, box, preview, markdown path, movability
// — is exercised for real; the server's disk write is serve.py's _upload,
// small enough to read.
const path = require('path');
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const PIXEL = path.join(__dirname, 'fixtures', 'spec-pixel.png');

test.describe('insert image', () => {
  test('button is present and enabled with nothing selected', async ({ page }) => {
    await gotoEditor(page);
    await expect(page.locator('#ar-img')).toBeVisible();
    await expect(page.locator('#ar-img')).toBeEnabled();
  });

  test('uploads and places a movable image box', async ({ page }) => {
    await gotoEditor(page);
    const uploaded = page.waitForRequest('**/__upload');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#ar-img');
    // Insert Image goes straight to the file dialog only for a project with
    // NOTHING bundled. This fixture's project carries images (the template
    // logos in its assets), so the button opens the picker first and "Upload
    // from computer…" is what reaches the dialog — without this the chooser
    // simply never fired and the spec timed out at 90s.
    if (await page.locator('#imgpop').isVisible()) await page.click('#img-upload');
    await (await chooser).setFiles(PIXEL);
    // the editor posted real image bytes with the sanitised name
    const req = JSON.parse((await uploaded).postData());
    expect(req.name).toBe('spec-pixel.png');
    expect(req.data.length).toBeGreaterThan(20);          // base64 payload
    // the box appears once the upload lands and render() returns
    const img = page.frameLocator('#out').locator('[data-el^="text."] img.inline-img');
    await expect(img).toBeVisible({ timeout: 20000 });
    // its markdown is the image at the path the server answered with,
    // stored in layout.json like any box — that is the persistence hook
    const box = await page.evaluate(() =>
      (layout.boxes || []).find(b => /^!\[/.test(b.md)));
    expect(box.md).toMatch(/^!\[.*\]\(assets\/spec-pixel\.png\)$/);
    // movable: drag it and the stored position follows. Two fixture-hygiene
    // steps first: settle the insert's own iframe swap (same race gotoEditor
    // settles after boot), and lift the box above the cover's logo — the
    // default drop spot overlaps it, and the topmost element takes the grab.
    await page.evaluate(id => {
      layout.boxes.find(b => b.id === id).z = 99;
      return render();
    }, box.id);
    await page.waitForTimeout(800);
    const el = page.frameLocator('#out')
      .locator(`[data-el="text.${box.id}"]`);
    const b0 = await el.boundingBox();
    await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
    await page.mouse.down();
    await page.mouse.move(b0.x + b0.width / 2 + 80, b0.y + b0.height / 2 + 50, { steps: 4 });
    await page.mouse.up();
    const moved = await page.evaluate(id =>
      (layout.boxes || []).find(b => b.id === id), box.id);
    expect(moved.x).toBeGreaterThan(box.x + 0.3);
  });
});
