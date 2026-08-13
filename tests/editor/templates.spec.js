// Report templates ("+ New report" ▸ Start from): docsync/templates scaffolded
// through the REAL /__scaffold, so these write real files into this checkout —
// cleaned up surgically after, pass or fail (see fixtures/host-state.js for
// why whole-file snapshots are banned here).
//
// The templates are digested from Hawaiʻi Appleseed's published 2025–26
// reports (hiappleseed.org/research — "A Fairer Tax Code", "Keiki Ride
// Free", "Pedestrian Head Start", "Stalled") plus the cycle's web
// one-pagers, so what is held here is the CONTRACT, not the art: a template
// scaffolds a working editor with its layout placed, its palette on the
// binding, its logos in the project's assets — and the blank canvas stays
// exactly what it was.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { removeYmlBindings, YML } = require('./fixtures/host-state');

const REPO = path.resolve(__dirname, '..', '..');
const SLUG = 'zz-spec-template';

test.describe.configure({ mode: 'serial' });

test.describe('report templates', () => {
  test.afterEach(() => {
    removeYmlBindings(SLUG);
    for (const dir of [`projects/${SLUG}`, `docs/${SLUG}`]) {
      execSync(`rm -rf ${JSON.stringify(path.join(REPO, dir))}`);
    }
  });

  test('the server lists them, blank first everywhere they are offered',
    async ({ request }) => {
    const j = await (await request.get('/__templates')).json();
    expect(j.ok).toBe(true);
    const ids = j.templates.map(t => t.id);
    expect(ids).toContain('appleseed-report');
    expect(ids).toContain('appleseed-brief');
    expect(ids).toContain('appleseed-onepager');
    for (const t of j.templates) {
      expect(t.name).toBeTruthy();
      expect(t.blurb).toBeTruthy();
      expect(t.page.w).toBeGreaterThan(0);
    }
    // The listing carries each template's colour schemes resolved — id, a
    // human name, a swatch colour — with the template's own default first.
    const report = j.templates.find(t => t.id === 'appleseed-report');
    expect(report.schemes[0]).toEqual(
      { id: 'blue', name: 'Tax blue', color: '#1E6194' });
    const brief = j.templates.find(t => t.id === 'appleseed-brief');
    expect(brief.schemes[0].id).toBe('charcoal');
  });

  test('a scheme recolours the scaffold; a bad one is refused before files land',
    async ({ request }) => {
    const j = await (await request.post('/__scaffold', { data: {
      name: 'Spec Slate Report', slug: SLUG,
      template: 'appleseed-report', scheme: 'slate',
    } })).json();
    expect(j.ok, j.error).toBe(true);
    const lay = JSON.parse(fs.readFileSync(
      path.join(REPO, 'projects', SLUG, 'layout.json'), 'utf8'));
    // The cover fields and the accents that echo them took the slate; the
    // brand accents (gold TOC rule) did not.
    expect(lay.fill['page.1']).toBe('#354F52');
    expect(lay.fill['page.2']).toBe('#354F52');
    expect(lay.shapes.find(s => s.id === 'tpl-rule3').fill).toBe('#354F52');
    expect(lay.shapes.find(s => s.id === 'tpl-tocrule2').fill).toBe('#FDCF21');
    // And the scheme's colour leads the binding's swatches.
    const yml = fs.readFileSync(YML, 'utf8');
    const block = yml.slice(yml.indexOf(`id: ${SLUG}`));
    expect(block).toContain('palette: ["#354F52"');

    // A scheme the template does not offer is refused, naming the real ones,
    // with nothing written.
    const bad = await (await request.post('/__scaffold', { data: {
      name: 'Nope', slug: SLUG + '-bad',
      template: 'appleseed-report', scheme: 'mauve',
    } })).json();
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('slate');
    expect(fs.existsSync(path.join(REPO, 'projects', SLUG + '-bad'))).toBe(false);
  });

  test('a template scaffolds placed content, its palette and the logos',
    async ({ page, request }) => {
    const j = await (await request.post('/__scaffold', { data: {
      name: 'Spec Template Report', slug: SLUG,
      template: 'appleseed-report',
      // A template brings its own sheet; this size must NOT win.
      size: { w: 13.333, h: 7.5 },
    } })).json();
    expect(j.ok, j.error).toBe(true);

    // The scaffold really is the template: placed boxes and shapes, the
    // Appleseed palette on the binding, the logo files beside the output.
    const lay = JSON.parse(fs.readFileSync(
      path.join(REPO, 'projects', SLUG, 'layout.json'), 'utf8'));
    expect(lay.boxes.length).toBeGreaterThan(10);    // cover + contents + body
    expect(lay.shapes.length).toBeGreaterThan(0);
    expect(lay.fill['page.1']).toBe('#1E6194');      // the published cover field
    expect(JSON.stringify(lay)).toContain('appleseed-logo-white.svg');
    const yml = fs.readFileSync(YML, 'utf8');
    const block = yml.slice(yml.indexOf(`id: ${SLUG}`));
    expect(block).toContain('"#1E6194"');            // the house tax blue
    expect(block).toContain('"#FDCF21"');            // the gold accent
    expect(block).toContain('page: [8.5, 11.0]');    // the template's sheet won
    for (const a of ['appleseed-logo.svg', 'appleseed-logo-white.svg']) {
      expect(fs.existsSync(path.join(REPO, 'projects', SLUG, 'web', 'assets', a)),
             a).toBe(true);
      // And staged where the editor's iframe resolves "assets/…" from.
      expect(fs.existsSync(path.join(REPO, 'docs', SLUG, 'assets', a)),
             'staged ' + a).toBe(true);
    }

    // It opens as a WORKING editor showing the design: the logo image and the
    // display title are on the canvas, and the swatch palette is the brand's.
    await gotoEditor(page, `?project=${SLUG}`);
    const frame = page.frameLocator('#out');
    await expect(frame.locator('img[src*="appleseed-logo"]').first())
      .toBeVisible({ timeout: 30000 });
    await expect(frame.locator('[data-el="text.tpl-title"]')).toBeVisible();

    // The logos are one click away for EVERY page of the report: Insert
    // image opens the bundled-images menu instead of going straight to the
    // file dialog, and placing one needs no upload.
    await page.click('#ar-img');
    await expect(page.locator('#imgpop')).toBeVisible();
    const rows = page.locator('#img-list .shp');
    await expect(rows.filter({ hasText: 'appleseed-logo-white.svg' })).toHaveCount(1);
    // Count, not existence — the template's own cover already carries this
    // logo, so only one MORE of it proves the menu placed anything.
    const before = await frame.locator('img[src*="appleseed-logo-white"]').count();
    await rows.filter({ hasText: 'appleseed-logo-white.svg' }).click();
    await expect(frame.locator('img[src*="appleseed-logo-white"]'))
      .toHaveCount(before + 1, { timeout: 30000 });
  });

  test('the blank canvas is untouched by all of this', async ({ request }) => {
    const j = await (await request.post('/__scaffold', { data: {
      name: 'Spec Blank Still Works', slug: SLUG, size: { w: 8.5, h: 11 },
    } })).json();
    expect(j.ok, j.error).toBe(true);
    const lay = JSON.parse(fs.readFileSync(
      path.join(REPO, 'projects', SLUG, 'layout.json'), 'utf8'));
    expect(lay).toEqual({ positions: {} });
    const yml = fs.readFileSync(YML, 'utf8');
    const block = yml.slice(yml.indexOf(`id: ${SLUG}`));
    expect(block).toContain('"#6B9E78", "#95B7A2"');   // the old default palette
  });

  test('an unknown template is refused with the list, before any file lands',
    async ({ request }) => {
    const j = await (await request.post('/__scaffold', { data: {
      name: 'Nope', slug: SLUG, template: 'not-a-template',
    } })).json();
    expect(j.ok).toBe(false);
    expect(j.error).toContain('appleseed-report');
    expect(fs.existsSync(path.join(REPO, 'projects', SLUG))).toBe(false);
  });
});
