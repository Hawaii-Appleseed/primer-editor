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
    await expect(page.locator('#chartpop .ch-typesel option')).toHaveCount(13);

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

/** Where the chart's drawing actually IS on screen. Asserting on
 *  layout.shapes[].x/y is not enough and was the blind spot that let a real
 *  bug ship: a chart's x/y updated on every drag (the status bar even
 *  reported the new inches) while the drawing never moved, because paintShape
 *  had no branch for it and fell through to the line branch, setting
 *  x1/y1/x2/y2 on a <g> that ignores them. Same failure the icon branch was
 *  written to fix, one kind further on. Tests must read the VIEW. */
async function chartScreenPos(page, id) {
  return page.evaluate((cid) => {
    const d = document.getElementById('out').contentDocument;
    const r = d.querySelector(`g[data-shape="${cid}"]`).getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y) };
  }, id);
}

async function dragChart(page, id, dx, dy) {
  const frame = page.frameLocator('#out');
  const g = frame.locator(`g[data-shape="${id}"]`);
  await g.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const b = await g.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1400);
}

test('dragging a chart moves the DRAWING, not just its stored x/y', async ({ page }) => {
  await gotoEditor(page);
  const id = await addChart(page);
  const before = await chartScreenPos(page, id);
  await dragChart(page, id, 90, 50);
  const after = await chartScreenPos(page, id);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
});

test('a chart tracks the cursor mid-drag, with its ring on it', async ({ page }) => {
  await gotoEditor(page);
  const id = await addChart(page);
  const frame = page.frameLocator('#out');
  await frame.locator(`g[data-shape="${id}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  // Read the chart's OWN box (its background rect), not the <g> bbox — the
  // bbox includes axis labels that sit outside the declared box.
  const read = () => page.evaluate((cid) => {
    const d = document.getElementById('out').contentDocument;
    const r = d.querySelector(`g[data-shape="${cid}"] rect`).getBoundingClientRect();
    const ring = d.querySelector('.ds-selbox');
    const rr = ring && ring.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
             ringX: rr ? Math.round(rr.x) : null, ringW: rr ? Math.round(rr.width) : null };
  }, id);

  const b = await frame.locator(`g[data-shape="${id}"]`).boundingBox();
  const start = await read();
  expect(start.ringX).toBe(start.x);            // ring sits ON the chart's box
  expect(start.ringW).toBe(start.w);

  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 100, b.y + b.height / 2 + 50, { steps: 8 });
  await page.waitForTimeout(150);
  const mid = await read();
  // It must travel WITH the cursor, not freeze and teleport on drop — and it
  // must not wear the lift's scale instead of its own translate.
  expect(mid.x).toBeGreaterThan(start.x + 50);
  expect(mid.w).toBe(start.w);
  expect(mid.ringX).toBe(mid.x);                // ...and the ring comes along

  await page.mouse.up();
  await page.waitForTimeout(1400);
  const end = await read();
  expect(end.ringX).toBe(end.x);
  expect(end.ringW).toBe(end.w);
});

test('a chart on a BLANK page moves too', async ({ page }) => {
  await gotoEditor(page);
  const frame = page.frameLocator('#out');
  await page.click('#rail-add');
  await page.waitForTimeout(1500);
  const bid = await page.evaluate(() => layout.pages.blanks[0].id);
  await frame.locator(`section[data-page="${bid}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.click('#chart');
  await frame.locator('g[data-shape]').first().waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  const id = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').id);
  expect(await page.evaluate(() =>
    layout.shapes.find(s => s.kind === 'chart').page)).toBe(bid);

  const before = await chartScreenPos(page, id);
  await dragChart(page, id, 90, 50);
  const after = await chartScreenPos(page, id);
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
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

// --- the full type list -----------------------------------------------------
// Every option in the dropdown has to actually draw. A type that stores fine
// but renders an empty <g> is worse than one that isn't offered — and packed
// circles did exactly that at first (the radius formula counted pi twice, so
// the largest circle was wider than the box and the layout loop bailed on the
// first item). Deliberately NOT offered: an animated bar-chart race, which
// cannot mean anything in a report that gets printed.
test('every chart type in the dropdown renders something', async ({ page }) => {
  test.setTimeout(240_000);
  await gotoEditor(page);
  const frame = page.frameLocator('#out');
  const id = await addChart(page);
  await page.evaluate(() => {
    const c = layout.shapes.find(s => s.kind === 'chart').chart;
    c.labels = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    c.series = [{ name: 'FY26', data: [12, 19, 8, 15, 6] },
                { name: 'FY27', data: [9, 14, 11, 7, 10] }];
    c.legend = true; c.values = true;
  });
  await page.evaluate(() => render());
  await page.waitForTimeout(1400);

  const opts = await page.locator('#chartpop .ch-typesel option')
    .evaluateAll(o => o.map(x => x.value));
  expect(opts).toHaveLength(13);

  for (const val of opts) {
    await page.selectOption('#chartpop .ch-typesel', val);
    await page.waitForTimeout(1500);
    const r = await page.evaluate((cid) => {
      const d = document.getElementById('out').contentDocument;
      const g = d.querySelector(`g[data-shape="${cid}"]`);
      return {
        marks: g ? g.querySelectorAll('rect,circle,path,polygon,polyline,line').length : -1,
        type: layout.shapes.find(s => s.kind === 'chart').chart.type,
        stat: document.getElementById('stat').textContent,
      };
    }, id);
    expect(r.type, `${val} stored`).toBe(val);
    expect(r.marks, `${val} drew marks`).toBeGreaterThan(2);
    expect(r.stat, `${val} built`).not.toContain('does not build');
  }
});

test('the panel adapts to what a type can actually do', async ({ page }) => {
  await gotoEditor(page);
  await addChart(page);

  // A bar chart takes several series and has axes to configure.
  await expect(page.locator('#chartpop .tp-btn', { hasText: '+ Series' })).toHaveCount(1);
  await customize(page, 'Text');
  await expect(page.locator('#chartpop .ch-sec', { hasText: 'Axis & grid' })).toHaveCount(1);

  // A treemap reads one value per label, and has no axes to speak of.
  await page.locator('#chartpop .ch-tab', { hasText: 'Data' }).click();
  await page.selectOption('#chartpop .ch-typesel', 'treemap');
  await page.waitForTimeout(1500);
  await expect(page.locator('#chartpop .tp-btn', { hasText: '+ Series' })).toHaveCount(0);
  await page.locator('#chartpop .ch-tab', { hasText: 'Customize' }).click();
  await page.waitForTimeout(200);
  await expect(page.locator('#chartpop .ch-sec', { hasText: 'Axis & grid' })).toHaveCount(0);
  await expect(page.locator('#chartpop .ch-sec', { hasText: 'Slice colours' })).toHaveCount(1);
});

// Regression: a tab still running an OLDER engine has no data-ox stamp on the
// chart (the renderer adds it), and paintShape translates from that stamp — so
// the chart sat perfectly still while its selection ring slid away, and every
// new chart type was rejected by the stale validator. The drag must not depend
// on which engine build painted the page.
test('a chart with no renderer stamp still drags, ring and all', async ({ page }) => {
  await gotoEditor(page);
  const frame = page.frameLocator('#out');
  await page.click('#rail-add');                        // a blank page, as reported
  await page.waitForTimeout(1500);
  const bid = await page.evaluate(() => layout.pages.blanks[0].id);
  await frame.locator(`section[data-page="${bid}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.click('#chart');
  await frame.locator('g[data-shape]').first().waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForTimeout(1200);
  const id = await page.evaluate(() => layout.shapes.find(s => s.kind === 'chart').id);
  await frame.locator(`g[data-shape="${id}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  // Strip the stamp: this is exactly what an older engine renders.
  await page.evaluate((cid) => {
    const g = document.getElementById('out').contentDocument
      .querySelector(`g[data-shape="${cid}"]`);
    ['ox', 'oy', 'ow', 'oh'].forEach(k => delete g.dataset[k]);
  }, id);

  const read = () => page.evaluate((cid) => {
    const d = document.getElementById('out').contentDocument;
    const r = d.querySelector(`g[data-shape="${cid}"] rect`).getBoundingClientRect();
    const ring = d.querySelector('.ds-selbox');
    return { x: Math.round(r.x),
             ringX: ring ? Math.round(ring.getBoundingClientRect().x) : null };
  }, id);

  const b = await frame.locator(`g[data-shape="${id}"]`).boundingBox();
  const before = await read();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 100, b.y + b.height / 2 + 40, { steps: 8 });
  await page.waitForTimeout(150);
  const mid = await read();
  await page.mouse.up();
  await page.waitForTimeout(1300);
  const after = await read();

  expect(mid.x).toBeGreaterThan(before.x + 50);      // the DRAWING travelled
  expect(mid.ringX).toBe(mid.x);                     // ...with its ring
  expect(after.x).toBeGreaterThan(before.x + 50);
});

// The other half of the same failure: a tab open across a rebuild it never saw
// keeps running old Python, and the first sign of it was a cryptic validator
// error about chart types. It has to announce itself instead.
test('a stale engine on disk announces itself', async ({ page }) => {
  const fs = require('fs');
  const path = require('path');
  await gotoEditor(page);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => buildStamp !== null)).toBe(true);
  expect(await page.evaluate(() => buildChangedOnDisk())).toBe(false);

  const f = path.join(__dirname, '../../docs/primer/engine/docsync/layout.py');
  const was = fs.statSync(f).mtime;
  try {
    fs.utimesSync(f, new Date(), new Date(Date.now() + 60_000));
    expect(await page.evaluate(() => buildChangedOnDisk())).toBe(true);
    await page.evaluate(() => offerEditorReload());
    await expect(page.locator('#stat')).toContainText('updated on disk');
    await expect(page.locator('#stat')).toHaveClass(/err/);
  } finally {
    fs.utimesSync(f, was, was);
  }
});

// The server's file watcher is what turns an edit on disk into a reload here.
// When that thread dies the server keeps serving perfectly, so nothing looks
// wrong while every edit silently stops arriving — and the first symptom
// surfaces far away (a stale engine rejecting values the new one accepts).
// Found live: two days' uptime with the version frozen and no file change
// producing a rebuild.
test('a dead server watcher is reported, and an old server is not judged', async ({ page }) => {
  await gotoEditor(page);
  await page.waitForTimeout(600);

  await page.evaluate(() => watchHealth({ watchAge: 0.4 }));
  await expect(page.locator('#stat')).not.toContainText('live reload has stopped');

  await page.evaluate(() => watchHealth({ watchAge: 40 }));
  await expect(page.locator('#stat')).toContainText('live reload has stopped');
  await expect(page.locator('#stat')).toHaveClass(/err/);

  // A server too old to publish watchAge must not be accused of anything.
  await page.evaluate(() => {
    $('stat').dataset.watchdead = ''; $('stat').textContent = 'untouched';
  });
  await page.evaluate(() => watchHealth({ ahead: 0, v: 1 }));
  await expect(page.locator('#stat')).toHaveText('untouched');
});

// --- panel polish -----------------------------------------------------------
test('swatch rows come out even, not orphaned', async ({ page }) => {
  await gotoEditor(page);
  await addChart(page);
  await customize(page, 'Series colours');
  const rows = await page.locator('#chartpop .tp-sw').first().evaluate(el => {
    const ys = [...el.children].map(k => Math.round(k.getBoundingClientRect().y));
    const byRow = {};
    ys.forEach(y => { byRow[y] = (byRow[y] || 0) + 1; });
    return Object.values(byRow);
  });
  // Greedy wrapping packed 7 and stranded 2. Even rows differ by at most one.
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1);
});

test('a reset arrow appears only where there is something to reset', async ({ page }) => {
  await gotoEditor(page);
  await addChart(page);
  await customize(page, 'Text');

  const vis = label => page.locator('#chartpop .ch-colrow', { hasText: label })
    .locator('.ch-reset').evaluate(el => getComputedStyle(el).visibility);
  expect(await vis('Title colour')).toBe('hidden');       // nothing overridden yet

  await page.locator('#chartpop .ch-colrow', { hasText: 'Title colour' })
    .locator('.ch-colsw').evaluate(el => {
      el.value = '#B23A48'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  await page.waitForTimeout(1300);
  expect(await vis('Title colour')).toBe('visible');
  expect(await vis('Label colour')).toBe('hidden');       // still untouched
});

test('"no background" does not look like a white background', async ({ page }) => {
  await gotoEditor(page);
  await addChart(page);
  await customize(page, 'Series colours');
  const row = page.locator('#chartpop .ch-colrow', { hasText: 'Background' });
  const sw = row.locator('.ch-colsw');
  // Unset: marked, and says so on hover — a bare white chip on a white panel
  // was indistinguishable from an actual white fill.
  await expect(sw).toHaveClass(/unset/);
  expect(await sw.getAttribute('title')).toBe('No background');

  await sw.evaluate(el => {
    el.value = '#EEF4EF'; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1300);
  await expect(sw).not.toHaveClass(/unset/);
  expect(await sw.getAttribute('title')).toContain('#EEF4EF');
});
