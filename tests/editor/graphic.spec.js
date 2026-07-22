// Free-standing SVG graphics (render_report.graphic() + docsync/layout.py
// positions). An SVG added via graphic() carries the same data-el hook as an
// image, so the editor moves, resizes and rotates it — a bare <svg> in the
// markup would be frozen. The fixture report puts one on page 8
// (onetime.demo.graphic). Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const GID = 'onetime.demo.graphic';

test.describe('editor-movable SVG graphics', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('a graphic is present and renders as inline SVG', async ({ page }) => {
    const frame = page.frameLocator('#out');
    const g = frame.locator(`[data-el="${GID}"]`);
    await g.scrollIntoViewIfNeeded();
    await expect(g).toHaveCount(1);
    await expect(g).toHaveClass(/ds-graphic/);
    await expect(g.locator('svg')).toHaveCount(1);
  });

  test('a single click selects it and shows CORNER handles, not width-only', async ({ page }) => {
    const frame = page.frameLocator('#out');
    const g = frame.locator(`[data-el="${GID}"]`);
    await g.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await g.click();

    // Not a text edit, and the arrange toolbar (not the type toolbar) is up.
    await expect(frame.locator('.ds-edit')).toHaveCount(0);
    await expect(page.locator('#arrange')).toBeVisible();

    // A graphic scales as a whole: four corners, no width-only edges.
    await expect(frame.locator('.ds-handles .ds-h-ne')).toHaveCount(1);
    await expect(frame.locator('.ds-handles .ds-h-nw')).toHaveCount(1);
    await expect(frame.locator('.ds-handles .ds-h-se')).toHaveCount(1);
    await expect(frame.locator('.ds-handles .ds-h-sw')).toHaveCount(1);
    await expect(frame.locator('.ds-handles .ds-h-e')).toHaveCount(0);
    await expect(frame.locator('.ds-handles .ds-h-n')).toHaveCount(0);
  });

  test('dragging the graphic records a position', async ({ page }) => {
    const frame = page.frameLocator('#out');
    const g = frame.locator(`[data-el="${GID}"]`);
    await g.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await g.click();

    const box = await g.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 45, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const pos = await page.evaluate(k => layout.positions[k], GID);
    expect(pos).toBeTruthy();
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
  });

  test('a corner resize writes a width override (proportional scaling)', async ({ page }) => {
    const frame = page.frameLocator('#out');
    const g = frame.locator(`[data-el="${GID}"]`);
    await g.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await g.click();

    const handle = frame.locator('.ds-handles .ds-h-se');
    const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 70, hb.y + 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const pos = await page.evaluate(k => layout.positions[k], GID);
    expect(pos.w).toBeGreaterThan(0);
  });
});
