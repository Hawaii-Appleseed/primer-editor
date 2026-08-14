// The two pieces of chrome that used to hold window height open now float over
// the canvas: the contextual card (#context, an overlay inside #work) and the
// FOLDED page strip (#rail.folded, which leaves the flex column). Expanded, the
// strip goes back in the column and the canvas stops above it. Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const geo = (page) => page.evaluate(() => {
  const r = id => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom };
  };
  const railCs = getComputedStyle(document.getElementById('rail'));
  return { bar: r('bar'), work: r('work'), rail: r('rail'), arrange: r('arrange'),
           ctx: r('context'), winH: window.innerHeight,
           railPos: railCs.position, railBg: railCs.backgroundColor,
           ctxEvents: getComputedStyle(document.getElementById('context')).pointerEvents };
});

const fold = async (page, want) => {
  const has = await page.locator('#rail').evaluate(el => el.classList.contains('folded'));
  if (has !== want) { await page.click('#rail-fold'); await page.waitForTimeout(450); }
};

test.describe('floating chrome', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await page.waitForTimeout(600);
  });

  test('the folded page strip floats: no ground, no clicks, canvas underneath',
    async ({ page }) => {
      await fold(page, true);
      const g = await geo(page);
      expect(g.railPos).toBe('absolute');
      // rgba(…, 0) — transparent, so the canvas shows through rather than a bar
      expect(g.railBg).toMatch(/, 0\)$|^transparent$/);
      // the document runs all the way to the bottom of the window
      expect(g.work.bottom).toBeCloseTo(g.winH, 0);
      // The control sits in the window's bottom-left CORNER. It only ever sat
      // inboard of that because the tool rail used to run the full height;
      // the rail stops after its last button now, so the corner is free.
      const foldX = await page.locator('#rail-fold').evaluate(el =>
        el.getBoundingClientRect().x);
      expect(foldX).toBeLessThan(30);
      // the chevron is still reachable through the pass-through strip
      await page.click('#rail-fold');
      await expect(page.locator('#rail')).not.toHaveClass(/folded/);
    });

  test('expanded, the strip is back in the column and the canvas stops above it',
    async ({ page }) => {
      await fold(page, false);
      const g = await geo(page);
      expect(g.railPos).toBe('static');
      expect(g.work.bottom).toBeCloseTo(g.rail.y, 0);
    });

  test('the contextual card overlays the canvas, just under the top bar',
    async ({ page }) => {
      const g = await geo(page);
      // an overlay inside #work, not a band between #bar and #work
      expect(g.ctx.y).toBeGreaterThan(g.bar.bottom);
      expect(g.ctx.y).toBeLessThan(g.bar.bottom + 12);   // close, not welded
      expect(g.work.y).toBeCloseTo(g.bar.bottom, 0);     // #work starts at the bar
      // the overlay passes clicks through everywhere the card itself is not
      expect(g.ctxEvents).toBe('none');
    });

  // NB: this one passes against the pre-float code too — there was no card to
  // park under. What it discriminates is the float WITHOUT applyZoom's
  // scroll-padding on the iframe document: drop that and #arrange is what
  // answers the hit test here.
  test('scrolling an object into view does not park it under the card',
    async ({ page }) => {
      const frame = page.frameLocator('#out');
      await frame.locator('section.page').nth(3).scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.click('#chart');
      await frame.locator('g[data-shape]').first().waitFor({ state: 'attached', timeout: 20000 });
      await page.waitForTimeout(1200);
      const id = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').id);
      await frame.locator(`g[data-shape="${id}"]`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const b = await frame.locator(`g[data-shape="${id}"]`).boundingBox();
      // Whatever answers a hit test at the top of the object must be the report,
      // not the editor's own toolbar — the exact failure charts.spec.js guards
      // against for the REPORT's sticky bar.
      const top = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.id || el.tagName : null;
      }, [b.x + b.width / 2, b.y + 6]);
      expect(top).toBe('out');
    });
});

// The two things present in BOTH fold states must not move when it toggles,
// and a render that happened while folded must not leave blank previews.
test.describe('page strip fold', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await page.waitForTimeout(1000);
  });

  const marks = (page) => page.evaluate(() => {
    const b = id => { const r = document.getElementById(id).getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) }; };
    return { head: b('rail-head'), fold: b('rail-fold') };
  });
  const thumbScale = (page) => page.evaluate(() => {
    const v = document.querySelector('.chip .chip-view');
    const w = v && v.shadowRoot && v.shadowRoot.firstElementChild;
    return w ? parseFloat((w.style.transform.match(/scale\(([\d.]+)\)/) || [])[1]) : null;
  });

  test('the label and chevron stay on the same pixel through a fold',
    async ({ page }) => {
      await fold(page, false);
      const open = await marks(page);
      await fold(page, true);
      const closed = await marks(page);
      // They used to jump 67px across and ~40 down — the control running away
      // from the click that just hit it.
      expect(closed.head).toEqual(open.head);
      expect(closed.fold).toEqual(open.fold);
    });

  test('previews survive a render that happens while the strip is folded',
    async ({ page }) => {
      await fold(page, true);
      await page.evaluate(() => render());
      await page.waitForTimeout(2500);
      await fold(page, false);
      await page.waitForTimeout(600);
      // A folded strip hides #rail-list, so every preview host measures 0 wide.
      // Baking that in gave scale(0) — twelve blank chips on unfolding.
      const s = await thumbScale(page);
      expect(s).not.toBeNull();
      expect(s).toBeGreaterThan(0.01);
      await expect(page.locator('.chip-thumb.empty')).toHaveCount(0);
    });
});

// The arrange strip describes a SELECTION, so with nothing selected there is
// nothing for it to say and it stays away entirely. Insert Image moved to the
// left tool rail precisely so that hiding it costs nothing.
test.describe('selection-contextual arrange strip', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
    await page.waitForTimeout(700);
  });

  test('no selection, no card', async ({ page }) => {
    await expect(page.locator('#arrange')).toBeHidden();
    await expect(page.locator('#ar-pos')).toBeHidden();
    await page.evaluate(() => setSel($('out').contentDocument, ['cover.logo']));
    await page.waitForTimeout(400);
    await expect(page.locator('#arrange')).toBeVisible();
    await expect(page.locator('#ar-pos')).toBeVisible();
  });

  test('Insert Image lives in the left rail, reachable with nothing selected',
    async ({ page }) => {
      await expect(page.locator('#arrange')).toBeHidden();
      await expect(page.locator('#leftrail #ar-img')).toBeVisible();
      await expect(page.locator('#leftrail #ar-img')).toBeEnabled();
    });

  test('the tool rail ends after its last button, with nothing below it',
    async ({ page }) => {
      const g = await page.evaluate(() => {
        const rail = document.getElementById('leftrail');
        const r = rail.getBoundingClientRect();
        // :scope > — the rail also CONTAINS buttons that are not tools: the
        // Insert Image picker (#imgpop) is a child div holding an upload
        // button, and a bare `button:last-of-type` matched THAT first (it is
        // the last button of its own parent, and earlier in document order
        // than the last tool). Hidden, so its rect read all zeros and the
        // "nothing below the last tool" gap came back as the rail's own
        // bottom — 454px of imaginary emptiness under a rail that was fine.
        const last = rail.querySelector(':scope > button:last-of-type').getBoundingClientRect();
        const work = document.getElementById('work').getBoundingClientRect();
        const stage = document.getElementById('stage').getBoundingClientRect();
        return { railBottom: r.bottom, lastBottom: last.bottom, workBottom: work.bottom,
                 stageX: stage.x, workX: work.x,
                 after: getComputedStyle(rail, '::after').content };
      });
      // solid only as far as the tools go — not a full-height wall
      expect(g.railBottom).toBeLessThan(g.workBottom - 40);
      expect(g.railBottom - g.lastBottom).toBeLessThan(20);
      // the canvas runs underneath rather than starting where the rail ends
      expect(g.stageX).toBeCloseTo(g.workX, 0);
      // and nothing continues below the tools — no veil, no tint
      expect(g.after).toBe('none');
    });
});
