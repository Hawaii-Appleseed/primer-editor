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

test.describe('charts', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('the Chart tool places a bar chart and opens its panel', async ({ page }) => {
    const id = await addChart(page);
    expect(id).toBeTruthy();
    await expect(page.locator('#side-title')).toHaveText('Chart');
    await expect(page.locator('#chartpop .ch-type')).toHaveCount(4);

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

    await page.locator('#chartpop .ch-type', { hasText: 'Pie' }).click();
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
    await page.locator('#chartpop .ch-type', { hasText: 'Pie' }).click();
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

    await page.locator('#chartpop .tp-btn', { hasText: 'Legend' }).click();
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
    const ti = page.locator('#chartpop .ch-title');
    await ti.fill('Budget');
    await ti.blur();
    await page.waitForTimeout(1300);

    // Set the ink through the control, not by poking layout — that is the path
    // a person takes, and it is what keeps the panel's own state in step.
    const setInk = async (label, hex) => {
      await page.locator('#chartpop .ch-colrow', { hasText: label })
        .locator('.ch-colsw').evaluate((el, v) => {
          el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }));
        }, hex);
      await page.waitForTimeout(1300);
    };
    await setInk('Title', '#123456');
    await setInk('Labels', '#B23A48');

    await expect(frame.locator(`g[data-shape="${id}"] [data-ch="title"]`))
      .toHaveAttribute('fill', '#123456');
    await expect(frame.locator(`g[data-shape="${id}"] [data-ch="label:0"]`))
      .toHaveAttribute('fill', '#B23A48');

    // The reset arrow drops the override back to the report default.
    await page.locator('#chartpop .ch-colrow', { hasText: 'Title' })
      .locator('.ch-reset').click();
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
    const row = page.locator('#chartpop .ch-colrow', { hasText: 'Background' });
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
