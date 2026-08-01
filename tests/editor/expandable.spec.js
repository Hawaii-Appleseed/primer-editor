// Expandable sections: a toggle button box (act:'toggle') and the content box
// it reveals — rxkids' hand-built tfc-expand-btn pattern, as a native editor
// capability. Engine faces are pinned in docsync/test_docsync.py; here the
// editor lifecycle (insert as a wired grouped pair, delete-orphan cleanup,
// paste rewiring), the rxkids report as the working host, and the REAL disk
// build clicked open and closed. Local mode.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const REPO = path.resolve(__dirname, '..', '..');
const YML = path.join(REPO, 'docsync.yml');
const SLUG = 'zz-spec-expand';

// One worker, in order: the publish test snapshots and restores docsync.yml.
test.describe.configure({ mode: 'serial' });

async function addPair(page) {
  const frame = page.frameLocator('#out');
  await frame.locator('section.page').nth(3).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.click('#text');
  await page.click('#textpop .txtpreset[data-k="expand"]');
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const btn = boxes().find(b => b.act === 'toggle');
    return { btn, content: boxes().find(b => b.id === btn.target) };
  });
}

test.describe('expandable sections', () => {
  test.beforeEach(async ({ page }) => {
    await gotoEditor(page);
  });

  test('inserts as a wired pair — grouped, both visible, both movable',
    async ({ page }) => {
      const { btn, content } = await addPair(page);
      expect(btn.act).toBe('toggle');
      expect(content).toBeTruthy();
      // grouped, so it moves as one until the person ungroups it
      const grouped = await page.evaluate(([b, c]) =>
        (layout.groups || []).some(g =>
          g.includes('text.' + b) && g.includes('text.' + c)), [btn.id, content.id]);
      expect(grouped).toBe(true);
      // BOTH render on the artboard — the target is not collapsed here,
      // because collapsed content cannot be edited.
      const frame = page.frameLocator('#out');
      await expect(frame.locator(`[data-el="text.${btn.id}"]`)).toBeVisible();
      await expect(frame.locator(`[data-el="text.${content.id}"]`)).toBeVisible();
      await expect(frame.locator(`[data-el="text.${content.id}"]`))
        .toContainText('starts hidden');
      // and neither is a live control on the artboard
      const tags = await page.evaluate(([b, c]) => {
        const d = document.getElementById('out').contentDocument;
        return [d.querySelector(`[data-el="text.${b}"]`).tagName,
                d.querySelector(`[data-el="text.${c}"]`).tagName];
      }, [btn.id, content.id]);
      expect(tags).toEqual(['DIV', 'DIV']);
    });

  test('deleting the content demotes the button to a plain box instead of '
       + 'wedging the build', async ({ page }) => {
    const { btn, content } = await addPair(page);
    await page.evaluate(async cid => {
      const d = $('out').contentDocument;
      setSel(d, ['text.' + cid]);
      await deleteSel(d);
    }, content.id);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(id => boxes().find(b => b.id === id), btn.id);
    expect(after.act).toBeUndefined();
    expect(after.target).toBeUndefined();
    await expect(page.locator('#stat')).toContainText('plain text box now');
    // the draft still renders — the whole point of the demotion
    await expect(page.frameLocator('#out').locator(`[data-el="text.${btn.id}"]`))
      .toBeVisible();
  });

  test('duplicating the pair rewires the copy to its own content',
    async ({ page }) => {
      const { btn, content } = await addPair(page);
      await page.evaluate(async ([b, c]) => {
        const d = $('out').contentDocument;
        setSel(d, ['text.' + b, 'text.' + c]);
        copySel(d);
        await pasteClip(d);
      }, [btn.id, content.id]);
      await page.waitForTimeout(1500);
      const wiring = await page.evaluate(() => {
        const togglers = boxes().filter(b => b.act === 'toggle');
        return togglers.map(t => ({ id: t.id, target: t.target,
          targetExists: boxes().some(b => b.id === t.target) }));
      });
      expect(wiring).toHaveLength(2);
      // two buttons, two DIFFERENT targets, both real
      expect(new Set(wiring.map(w => w.target)).size).toBe(2);
      expect(wiring.every(w => w.targetExists)).toBe(true);
    });

  test('lives happily inside the rxkids report, beside its hand-built buttons',
    async ({ page }) => {
      await gotoEditor(page, '?project=rxkids');
      const frame = page.frameLocator('#out');
      await frame.locator('section.page').first()
        .waitFor({ state: 'visible', timeout: 75000 });
      await page.waitForTimeout(800);

      // rxkids' own bespoke expandables are intact in the editor preview —
      // however many it has; the invariant is that each keeps its handler.
      const bespoke = await page.evaluate(() => {
        const d = document.getElementById('out').contentDocument;
        return [...d.querySelectorAll('.tfc-expand-btn')]
          .map(b => b.getAttribute('onclick') || '');
      });
      expect(bespoke.length).toBeGreaterThanOrEqual(1);
      expect(bespoke.every(h => /toggle/i.test(h))).toBe(true);

      // …and a NATIVE pair drops in beside it, in memory only (no save).
      const ids = await page.evaluate(async () => {
        pushHistory();
        const c = freeTId();
        boxes().push({ id: c, page: 1, x: 1, y: 3.4, w: 4,
                       md: 'Native expandable content, on rxkids.' });
        const b = freeTId();
        boxes().push({ id: b, page: 1, x: 1, y: 2.9, w: 2.6, md: 'Show more',
                       style: { color: '#FFFFFF', weight: 700 },
                       fill: '#52796F', act: 'toggle', target: c });
        markDirty(); await render();
        return { b, c };
      });
      await page.waitForTimeout(1200);
      await expect(frame.locator(`[data-el="text.${ids.b}"]`)).toBeVisible();
      await expect(frame.locator(`[data-el="text.${ids.c}"]`)).toBeVisible();
    });
});

// The other face, end to end: a scaffolded project built by the REAL renderer
// on disk, its published page opened and the button actually clicked — closed,
// open, closed again, aria tracking all the way.
test('the published page expands and collapses for real', async ({ page }) => {
  const ymlBefore = fs.readFileSync(YML, 'utf8');
  try {
    await page.goto('start.html');
    await page.waitForTimeout(600);
    await page.click('#new');
    await page.fill('#np-name', 'Expand Report');
    await page.fill('#np-slug', SLUG);
    await page.click('#np-create');
    await page.waitForURL(`**/edit.html?project=${SLUG}`, { timeout: 30000 });
    await page.frameLocator('#out').locator('section.page[data-page="1"]')
      .waitFor({ state: 'visible', timeout: 75000 });

    const lj = path.join(REPO, 'projects', SLUG, 'layout.json');
    const d = JSON.parse(fs.readFileSync(lj, 'utf8'));
    d.boxes = [
      { id: 't1', page: 1, x: 1, y: 1, w: 2.6, md: 'Show details',
        fill: '#52796F', style: { color: '#FFFFFF', weight: 700 },
        act: 'toggle', target: 't2' },
      { id: 't2', page: 1, x: 1, y: 1.6, w: 5, md: 'The hidden half.' },
    ];
    fs.writeFileSync(lj, JSON.stringify(d, null, 2));
    execSync(`python3 ${JSON.stringify(path.join(REPO, 'projects', SLUG, 'render_report.py'))}`,
      { cwd: REPO });
    const html = fs.readFileSync(
      path.join(REPO, 'projects', SLUG, 'web', 'index.html'), 'utf8');

    const run = await page.evaluate(async raw => {
      const w = window.open('', '_blank');
      w.document.write(raw); w.document.close();
      const btn = w.document.querySelector('.ds-tglbtn');
      const tgt = w.document.getElementById('ds-x-t2');
      const vis = () => w.getComputedStyle(tgt).display !== 'none';
      const out = { start: vis(), aria0: btn.getAttribute('aria-expanded') };
      btn.click();
      out.open = vis(); out.aria1 = btn.getAttribute('aria-expanded');
      out.arrowTurned = btn.classList.contains('ds-tgl-on');
      btn.click();
      out.closed = vis(); out.aria2 = btn.getAttribute('aria-expanded');
      w.close();
      return out;
    }, html);
    expect(run.start).toBe(false);          // collapsed until asked for
    expect(run.aria0).toBe('false');
    expect(run.open).toBe(true);            // one click reveals it
    expect(run.aria1).toBe('true');
    expect(run.arrowTurned).toBe(true);
    expect(run.closed).toBe(false);         // and a second puts it away
    expect(run.aria2).toBe('false');
  } finally {
    fs.writeFileSync(YML, ymlBefore);
    for (const dir of [`projects/${SLUG}`, `docs/${SLUG}`]) {
      execSync(`rm -rf ${JSON.stringify(path.join(REPO, dir))}`);
    }
  }
});
