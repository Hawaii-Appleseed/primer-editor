// Charts (docsync/layout.py chart_svg + edit.html's chart panel). A chart is a
// SHAPE (kind:"chart"), which is the whole design: it inherits placement,
// z-order, drag, resize, duplicate and delete from the shape pipeline, and it
// renders inside the per-page <svg> layer every report renderer already emits,
// so no report had to add a call to show one. Drawn as plain SVG with no
// library, so the same markup serves the browser preview and the offline PDF.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

async function addChart(page) {
  const frame = page.frameLocator('#out');
  await frame.locator('section.page').nth(3).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.click('#chart');
  await frame.locator('[data-shape] rect').first()
    .waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').id);
}


/** The panel's Customize tab, with a named section expanded. "Text" is open by
 *  default; the others start collapsed, so opening is idempotent-by-intent
 *  rather than assumed. */
async function customize(page, sectionLabel) {
  await page.locator('#chartpop .ch-tab', { hasText: 'Customize' }).click();
  await page.waitForTimeout(200);
  const head = page.locator('#chartpop .ch-sec', { hasText: sectionLabel });
  if (!(await head.evaluate(el => el.classList.contains('open')))) {
    await head.click();
    await page.waitForTimeout(200);
  }
}

/** A labelled switch inside the currently-open Customize section. */
const switchFor = (page, label) =>
  page.locator('#chartpop .ch-switchrow', { hasText: label }).locator('.ch-switch');

/** A labelled colour row inside the currently-open Customize section. */
const colorRow = (page, label) =>
  page.locator('#chartpop .ch-colrow', { hasText: label });

test.describe('charts', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('the Chart tool places a bar chart and opens its panel', async ({ page }) => {
    const id = await addChart(page);
    expect(id).toBeTruthy();
    await expect(page.locator('#side-title')).toHaveText('Chart');
    await expect(page.locator('#chartpop .ch-typesel option')).toHaveCount(4);

    const c = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').chart);
    expect(c.type).toBe('bar');
    expect(c.series).toHaveLength(1);
    expect(c.labels).toHaveLength(3);
    // Rendered as real SVG bars inside the shape layer.
    const bars = page.frameLocator('#out').locator(`g[data-shape="${id}"] rect`);
    expect(await bars.count()).toBeGreaterThan(3);   // 1 hit-area + 3 bars
  });

  test('switching type keeps the data, as Canva does', async ({ page }) => {
    const id = await addChart(page);
    await page.evaluate(() => {
      const c = layout.shapes.find(s => s.kind === 'chart').chart;
      c.labels = ['A', 'B']; c.series = [{ name: 'S', data: [30, 70] }];
    });
    await page.evaluate(() => render());
    await page.waitForTimeout(1200);

    await page.selectOption('#chartpop .ch-typesel', 'pie');
    await page.waitForTimeout(1300);
    const c = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').chart);
    expect(c.type).toBe('pie');
    expect(c.series[0].data).toEqual([30, 70]);      // data survived the switch
    // A pie draws slices as paths, not bars.
    const paths = page.frameLocator('#out').locator(`g[data-shape="${id}"] path`);
    expect(await paths.count()).toBe(2);
  });

  test('editing a value in the data grid redraws the chart', async ({ page }) => {
    await addChart(page);
    const firstVal = page.locator('#chartpop .ch-grid input[type="number"]').first();
    await firstVal.fill('99');
    await firstVal.blur();
    await page.waitForTimeout(1300);
    const data = await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.series[0].data);
    expect(data[0]).toBe(99);
  });

  test('rows and series can be added, and a pie hides series controls', async ({ page }) => {
    await addChart(page);
    await page.locator('#chartpop .tp-btn', { hasText: '+ Row' }).click();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.labels.length)).toBe(4);

    await page.locator('#chartpop .tp-btn', { hasText: '+ Series' }).click();
    await page.waitForTimeout(1200);
    const c = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').chart);
    expect(c.series).toHaveLength(2);
    expect(c.series[1].data).toHaveLength(4);        // padded to the label count

    // A pie reads one series, so offering "+ Series" there would be a lie.
    await page.selectOption('#chartpop .ch-typesel', 'pie');
    await page.waitForTimeout(1300);
    await expect(page.locator('#chartpop .tp-btn', { hasText: '+ Series' })).toHaveCount(0);
  });

  test('a chart is a shape: it drags, duplicates and deletes like one', async ({ page }) => {
    const id = await addChart(page);
    // Duplicate is the shape toolbar's, not anything chart-specific.
    await expect(page.locator('#ar-dup')).toBeEnabled();
    await page.click('#ar-dup');
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() =>
      layout.shapes.filter(s => s.kind === 'chart').length)).toBe(2);

    await page.click('#ar-del');
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() =>
      layout.shapes.filter(s => s.kind === 'chart').length)).toBe(1);
    // ...and the survivor still renders.
    await expect(page.frameLocator('#out').locator('g[data-shape]')).toHaveCount(1);
  });

  test('settings toggles reach the rendered SVG', async ({ page }) => {
    const id = await addChart(page);
    const frame = page.frameLocator('#out');
    const texts = () => frame.locator(`g[data-shape="${id}"] text`).count();
    const before = await texts();

    await customize(page, 'Text');
    await switchFor(page, 'Legend').click();
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.legend)).toBe(true);
    expect(await texts()).toBeGreaterThan(before);   // legend added labels
  });
});

// --- colouring and in-place label editing -----------------------------------
test.describe('chart colours and labels', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('a palette swatch recolours the whole chart in one click', async ({ page }) => {
    await addChart(page);
    await page.locator('#chartpop .tp-btn', { hasText: '+ Series' }).click();
    await page.waitForTimeout(1200);
    // The ramp is the swatch row directly under "Series colours".
    await customize(page, 'Series colours');
    await page.locator('#chartpop .tp-sw .tp-swatch').first().click();
    await page.waitForTimeout(1300);

    const cols = await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.series.map(s2 => s2.color));
    expect(cols).toHaveLength(2);
    expect(cols.every(c => /^#[0-9A-F]{6}$/.test(c))).toBe(true);
    expect(cols[0]).not.toBe(cols[1]);          // stepped, not one flat colour
  });

  test('text and line colours reach the rendered SVG and reset', async ({ page }) => {
    const id = await addChart(page);
    const frame = page.frameLocator('#out');
    // Give it a title so the title row exists, through the panel's own field.
    await customize(page, 'Text');
    const ti = page.locator('#chartpop .ch-title');
    await ti.fill('Budget');
    await ti.blur();
    await page.waitForTimeout(1300);

    // Set the ink through the control, not by poking layout — that is the path
    // a person takes, and it is what keeps the panel's own state in step.
    const setInk = async (label, hex) => {
      await colorRow(page, label)
        .locator('.ch-colsw').evaluate((el, v) => {
          el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
        }, hex);
      await page.waitForTimeout(1300);
    };
    await setInk('Title colour', '#123456');
    await setInk('Label colour', '#B23A48');

    await expect(frame.locator(`g[data-shape="${id}"] [data-ch="title"]`))
      .toHaveAttribute('fill', '#123456');
    await expect(frame.locator(`g[data-shape="${id}"] [data-ch="label:0"]`))
      .toHaveAttribute('fill', '#B23A48');

    // The reset arrow drops the override back to the report default.
    await colorRow(page, 'Title colour').locator('.ch-reset').click();
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.titleColor)).toBeUndefined();
    await expect(frame.locator(`g[data-shape="${id}"] [data-ch="title"]`))
      .toHaveAttribute('fill', '#2F3E46');
  });

  test('double-clicking a label on the page renames it', async ({ page }) => {
    const id = await addChart(page);
    const frame = page.frameLocator('#out');
    const lab = frame.locator(`g[data-shape="${id}"] [data-ch="label:1"]`);
    await expect(lab).toHaveText('Second');

    await lab.dblclick();
    const inp = frame.locator('.ds-ch-edit');
    await expect(inp).toBeVisible();
    await inp.fill('Renamed');
    await inp.press('Enter');
    await page.waitForTimeout(1400);

    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.labels[1])).toBe('Renamed');
    await expect(frame.locator(`g[data-shape="${id}"] [data-ch="label:1"]`))
      .toHaveText('Renamed');
  });

  test('Escape while renaming a label discards, leaving the chart alone', async ({ page }) => {
    const id = await addChart(page);
    const frame = page.frameLocator('#out');
    await frame.locator(`g[data-shape="${id}"] [data-ch="label:0"]`).dblclick();
    const inp = frame.locator('.ds-ch-edit');
    await inp.fill('Nope');
    await inp.press('Escape');
    await page.waitForTimeout(700);
    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').chart.labels[0])).toBe('First');
    expect(await page.evaluate(() => editing)).toBe(false);
  });

  test('the chart background is settable and clearable', async ({ page }) => {
    await addChart(page);
    await customize(page, 'Series colours');
    const row = colorRow(page, 'Background');
    await row.locator('.ch-colsw').evaluate(el => {
      el.value = '#EEF4EF'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').fill)).toBe('#EEF4EF');

    await row.locator('.ch-reset').click();
    await page.waitForTimeout(1300);
    expect(await page.evaluate(() =>
      layout.shapes.find(s => s.kind === 'chart').fill)).toBe('none');
  });
});

// Regression: a report's own STICKY chrome floats over the canvas and took
// every click that landed on it. The primer's `.toolbar` is
// position:sticky; z-index:50 — above the shape layer — so any object scrolled
// under it could not be grabbed at all. Charts hit it hardest: one is big
// enough that its top sits under the bar by the time the rest is on screen.
test('a chart under the report\'s sticky toolbar is still grabbable', async ({ page }) => {
  await gotoEditor(page);
  const frame = page.frameLocator('#out');
  await frame.locator('section.page').nth(3).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.click('#chart');
  await frame.locator('g[data-shape]').first().waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    layout.shapes.find(s => s.kind === 'chart').chart.title = 'Title';
  });
  await page.evaluate(() => render());
  await page.waitForTimeout(1400);

  const id = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').id);
  const g = frame.locator(`g[data-shape="${id}"]`);
  await g.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  // The chrome must not be what answers a hit test over the chart.
  const hit = await page.evaluate(() => {
    const d = document.getElementById('out').contentDocument;
    const t = d.querySelector('[data-ch="title"]');
    const r = t.getBoundingClientRect();
    const h = d.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return h && h.tagName.toLowerCase();
  });
  expect(hit).toBe('text');

  const before = await page.evaluate(() => {
    const s = layout.shapes.find(x => x.kind === 'chart');
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  });
  const tb = await frame.locator(`g[data-shape="${id}"] [data-ch="title"]`).boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 40, tb.y + tb.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1300);

  const after = await page.evaluate(() => {
    const s = layout.shapes.find(x => x.kind === 'chart');
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  });
  expect(after.x).toBeGreaterThan(before.x);       // it MOVED...
  expect(after.y).toBeGreaterThan(before.y);
  expect(after.w).toBe(before.w);                  // ...rather than resizing
  expect(after.h).toBe(before.h);
});
