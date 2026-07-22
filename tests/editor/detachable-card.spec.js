// Detachable content cards (render_report.card(detachable=True)). A designed
// tile whose title and bullets are laid out inside it by default but are their
// OWN movable objects (data-el + ds-detachable), grouped so the tile moves as
// one — until the user Ungroups and pulls a piece out. The text still comes
// from content.md. The fixture's Operating Budget card (page 5) is detachable.
// Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const TILE = 'card.spent.cards.operating.bullets';
const TITLE = 'spent.cards.operating.title';
const BULLETS = 'spent.cards.operating.bullets';

test.describe('detachable content card', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    const frame = page.frameLocator('#out');
    await frame.locator(`[data-el="${TILE}"]`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  });

  test('renders the tile, title and bullets as three hooked, grouped pieces', async ({ page }) => {
    const frame = page.frameLocator('#out');
    await expect(frame.locator(`[data-el="${TILE}"]`)).toHaveCount(1);
    await expect(frame.locator(`[data-el="${TITLE}"]`)).toHaveClass(/ds-detachable/);
    await expect(frame.locator(`[data-el="${BULLETS}"]`)).toHaveClass(/ds-detachable/);
    // title text still comes from content.md (its slot lives inside)
    await expect(frame.locator(`[data-el="${TITLE}"] [data-slot="${TITLE}"]`)).toHaveCount(1);
    // grouped by default
    const grouped = await page.evaluate(([a, b]) =>
      (layout.groups || []).some(g => g.includes(a) && g.includes(b)), [TITLE, BULLETS]);
    expect(grouped).toBe(true);
  });

  test('clicking the tile selects the whole group of three', async ({ page }) => {
    const frame = page.frameLocator('#out');
    // click the tile background, below the bullets, not on a child element
    const box = await frame.locator(`[data-el="${TILE}"]`).boundingBox();
    const bul = await frame.locator(`[data-el="${BULLETS}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, bul.y + bul.height + (box.y + box.height - bul.y - bul.height) / 2);
    const sel = await page.evaluate(() => [...selIds]);
    expect(sel.sort()).toEqual([TILE, TITLE, BULLETS].sort());
    await expect(page.locator('#ar-count')).toHaveText(/group of 3/);
  });

  test('Ungroup lets the title be grabbed and moved on its own', async ({ page }) => {
    const frame = page.frameLocator('#out');
    // select the group via the tile, then ungroup
    const box = await frame.locator(`[data-el="${TILE}"]`).boundingBox();
    const bul = await frame.locator(`[data-el="${BULLETS}"]`).boundingBox();
    await page.mouse.click(box.x + box.width / 2, bul.y + bul.height + 6);
    await page.locator('#ar-ungroup').click();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => layout.groups || null)).toBeFalsy();

    // now the title alone drags to its own position
    await page.keyboard.press('Escape');
    const t = frame.locator(`[data-el="${TITLE}"]`);
    await t.click();
    expect(await page.evaluate(() => [...selIds])).toEqual([TITLE]);
    const tb = await t.boundingBox();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2 + 40, tb.y + tb.height / 2 + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const pos = await page.evaluate(k => layout.positions[k], TITLE);
    expect(pos).toBeTruthy();
    expect(pos.y).toBeGreaterThan(0);   // moved down, out of the tile
  });
});
