// Converting a document into a project (docsync.ingest), and the piece of it
// that lives in the editor: the notices a conversion leaves behind.
//
// A conversion decides things the person who asked for it may want to revisit —
// a page size taken from page 1 when later pages differ, artwork it could not
// bring across, fonts it could not carry. Terminal output from a command run
// once is the wrong place to say so, so the renderer DECLARES them (L.notices())
// and the editor shows a dismissable strip.
//
// Split in two on purpose, because of how the server learns about projects:
// PROJECTS is only ever added to by /__scaffold and /__adopt, so a project
// created on disk while the suite's shared server is already running is
// invisible to it — the editor falls back to the default report. (A first pass
// at this asserted "3 sheets" and got 12: the Budget Primer.) So:
//   · the CONVERSION is checked against the files it writes, no browser;
//   · the NOTICES UI is checked in the browser against a declaration injected
//     into a real rendered document — byte-for-byte what a converted project's
//     renderer emits.
// The conversion test writes a project, so it cleans up under the host lock:
// see fixtures/host-state.js for why only-your-own-keys matters.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');
const { removeYmlBindings, removeRegistryKeys } = require('./fixtures/host-state');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..');
const SLUG = 'zz-spec-ingest';
const PDF = path.join(os.tmpdir(), `${SLUG}.pdf`);
const PROJ = path.join(REPO, 'projects', SLUG);

// Page 1 letter, page 2 LEGAL, page 3 landscape with a drawing on it: one
// document that raises every notice the converter can.
const MAKE_PDF = `
import fitz
d = fitz.open()
p1 = d.new_page(width=612, height=792)
p1.insert_text((72, 100), "Page one heading", fontsize=18)
p2 = d.new_page(width=612, height=1008)
p2.insert_text((72, 100), "Page two body text", fontsize=11)
p3 = d.new_page(width=792, height=612)
p3.insert_text((72, 100), "Page three", fontsize=11)
p3.draw_rect(fitz.Rect(100, 200, 300, 320), color=(0.2, 0.4, 0.3), width=2)
d.save(${JSON.stringify(PDF)})
`;

const py = args => execFileSync('python3', args, { cwd: REPO, encoding: 'utf8' });

// One worker, in order: this describe's beforeAll/afterAll manage ONE on-disk
// project under a fixed slug — fullyParallel would run beforeAll on a SECOND
// worker for another test in this same file, racing the first worker's
// afterAll (a project deleted out from under a still-running read) or its own
// beforeAll (two `python3 -m docsync.ingest` calls appending the same slug to
// docsync.yml at once). Same reasoning as local-scaffold.spec.js and every
// other spec in this suite that scaffolds a real project.
test.describe.configure({ mode: 'serial' });

test.describe('docsync.ingest: a PDF becomes a project', () => {
  let out = '';

  test.beforeAll(() => {
    py(['-c', MAKE_PDF]);
    out = py(['-m', 'docsync.ingest', PDF, '--id', SLUG]);
    py([path.join('projects', SLUG, 'render_report.py')]);
  });

  test.afterAll(() => {
    removeYmlBindings(SLUG);
    removeRegistryKeys(SLUG);
    fs.rmSync(PROJ, { recursive: true, force: true });
    fs.rmSync(path.join(REPO, 'docs', SLUG), { recursive: true, force: true });
    fs.rmSync(PDF, { force: true });
  });

  test('it takes the page size from the document, in inches', () => {
    // The question this feature started from: 612x792pt is 8.5x11in, and it has
    // to reach BOTH places a page size lives or they disagree — the renderer
    // bakes it, the binding tells the editor's guides.
    const renderer = fs.readFileSync(path.join(PROJ, 'render_report.py'), 'utf8');
    expect(renderer).toContain('page=(8.5, 11.0)');
    expect(renderer).toContain('DESIGNED_PAGES = 3');
    expect(fs.readFileSync(path.join(REPO, 'docsync.yml'), 'utf8'))
      .toContain(`page: [8.5, 11.0]`);
    expect(out).toContain('3 page(s) at 8.5x11.0in');
  });

  test('every text block is an editable box where the PDF had it', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(PROJ, 'layout.json'), 'utf8'));
    expect(layout.boxes.length).toBeGreaterThanOrEqual(3);
    const first = layout.boxes.find(b => b.md.includes('Page one heading'));
    expect(first).toBeTruthy();
    expect(first.page).toBe(1);
    expect(first.x).toBeCloseTo(1.0, 2);          // 72pt = 1in
    expect(first.y).toBeGreaterThan(0.7);         // insert_text y is the baseline
    expect(first.y).toBeLessThan(1.4);
    // Size and colour carry; the font never does — layout.py refuses a family
    // it cannot load, so naming the PDF's own would refuse the whole draft.
    expect(first.style.size).toBeCloseTo(24, 1);  // 18pt -> px
    expect(first.style.font).toBeUndefined();
    // One box per page, so all three sheets really have content.
    expect(new Set(layout.boxes.map(b => b.page))).toEqual(new Set([1, 2, 3]));
  });

  test('the notices name what it decided, and stay out of the published page', () => {
    const renderer = fs.readFileSync(path.join(PROJ, 'render_report.py'), 'utf8');
    // The outlier notice names the pages — the point of it.
    expect(renderer).toContain('taken from page 1');
    expect(renderer).toMatch(/Pages? 2, 3/);
    expect(renderer).toContain('page 3 was not converted');   // the drawing
    expect(renderer).toContain('Fonts were not carried');
    expect(out).toContain('pages of a different size: [2, 3]');

    // L.notices() is edit-mode only, so a published build carries none of it.
    const built = fs.readFileSync(path.join(PROJ, 'web', 'index.html'), 'utf8');
    expect(built).not.toContain('ds-notices');
    expect(built).not.toContain('Fonts were not carried');
  });
});

test.describe('the notice strip', () => {
  /** Declare notices the way a converted project's renderer does, then let the
   *  editor read them — the same script tag, in a real rendered document. */
  const declare = (page, msgs) => page.evaluate(m => {
    const d = document.getElementById('out').contentDocument;
    d.getElementById('ds-notices')?.remove();
    const s = d.createElement('script');
    s.type = 'application/json';
    s.id = 'ds-notices';
    s.textContent = JSON.stringify(m);
    d.body.appendChild(s);
    renderNotices(d);
  }, msgs);

  test('shows one row per notice, and nothing at all without any', async ({ page }) => {
    await gotoEditor(page);
    // Every authored report must show no strip whatsoever — this is on screen
    // for everyone, so an empty band would be a permanent tax on every project.
    await expect(page.locator('#notices')).toBeHidden();

    await declare(page, ['first thing decided', 'second thing decided']);
    await expect(page.locator('#notices .ds-note')).toHaveCount(2);
    await expect(page.locator('#notices')).toContainText('first thing decided');
  });

  test('each notice dismisses on its own, and the rest remain', async ({ page }) => {
    await gotoEditor(page);
    await declare(page, ['alpha notice', 'beta notice', 'gamma notice']);
    const notes = page.locator('#notices .ds-note');
    await expect(notes).toHaveCount(3);

    await notes.first().locator('.ds-note-x').click();
    await expect(notes).toHaveCount(2);
    await expect(page.locator('#notices')).not.toContainText('alpha notice');
    await expect(page.locator('#notices')).toContainText('beta notice');
  });

  test('"dismiss all" clears them, and they stay dismissed', async ({ page }) => {
    await gotoEditor(page);
    await declare(page, ['one of three', 'two of three', 'three of three']);
    await page.locator('#notices .ds-note-all').click();
    await expect(page.locator('#notices')).toBeHidden();

    // Remembered, and per MESSAGE: re-declaring the same three says nothing,
    // while a new conclusion is new news and speaks up.
    await declare(page, ['one of three', 'two of three', 'three of three']);
    await expect(page.locator('#notices')).toBeHidden();
    await declare(page, ['one of three', 'a brand new conclusion']);
    await expect(page.locator('#notices .ds-note')).toHaveCount(1);
    await expect(page.locator('#notices')).toContainText('a brand new conclusion');

    // A dismissal is a preference, not a document edit.
    expect(await page.evaluate(() => dirty)).toBe(false);
  });

  test('a single notice offers no "dismiss all" — its own × is that', async ({ page }) => {
    await gotoEditor(page);
    await declare(page, ['the only notice here']);
    await expect(page.locator('#notices .ds-note')).toHaveCount(1);
    await expect(page.locator('#notices .ds-note-all')).toHaveCount(0);
    await page.locator('#notices .ds-note-x').click();
    await expect(page.locator('#notices')).toBeHidden();
  });
});
