// The preview's stylesheet must be cache-busted, or CSS edits need a HARD
// refresh.
//
// The preview is an iframe assigned via srcdoc. Its <link> stylesheets are
// ORDINARY browser subresource loads: they do not go through the editor's
// get()/bust() fetches, and a report's CSS is usually absent from docsync.yml's
// editor.engine list, so NOTHING in the live-reload path re-fetches them. A
// rebuild therefore re-rendered the HTML while the browser kept serving the
// stylesheet it already held for that URL — every other live edit landed at
// once, but a primer.css change appeared only after ⌘⇧R. prepPreviewHtml()
// stamps same-origin sheets with the build version to close that.
//
// This repo's report2027 is a FIXTURE and deliberately emits a bare
// `href="primer.css"` (the live report's own renderer also stamps it, belt and
// braces). That is what makes this spec meaningful: it exercises the ENGINE
// path on its own. If the fixture ever starts stamping, this spec stops testing
// prepPreviewHtml and should be pointed at a fixture that does not.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

/** Raw href attributes of the preview's stylesheet links (not resolved URLs —
 *  we care what the markup says). srcdoc is same-origin, so the parent can
 *  reach into contentDocument directly. */
const sheetHrefs = page => page.evaluate(() => {
  const d = document.querySelector('#out').contentDocument;
  return [...d.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href'));
});

const isAbsolute = h => /^(?:https?:)?\/\//i.test(h);

test.describe('preview stylesheet cache-busting', () => {
  test('same-origin sheets are stamped; cross-origin ones are left alone', async ({ page }) => {
    await gotoEditor(page);
    await page.frameLocator('#out').locator('.page').first().waitFor();

    const hrefs = await sheetHrefs(page);
    expect(hrefs.length, 'preview has no stylesheet links at all').toBeGreaterThan(0);

    const local = hrefs.filter(h => !isAbsolute(h));
    expect(local.length, 'preview has no same-origin stylesheet to stamp').toBeGreaterThan(0);
    for (const h of local) {
      expect(h, `same-origin stylesheet "${h}" is not cache-busted — a CSS edit `
        + 'will need a hard refresh').toMatch(/[?&]cb=/);
    }

    // Webfont sheets are mirrored into the outer document rather than inlined,
    // and their text is unreadable from here; stamping them would only defeat
    // the font cache.
    for (const h of hrefs.filter(isAbsolute)) {
      expect(h, `cross-origin stylesheet "${h}" should not be stamped`).not.toMatch(/[?&]cb=/);
    }
  });

  test('a stamp already present in the markup is not doubled', async ({ page }) => {
    await gotoEditor(page);
    await page.frameLocator('#out').locator('.page').first().waitFor();
    for (const h of await sheetHrefs(page)) {
      const n = (h.match(/[?&]cb=/g) || []).length;
      expect(n, `"${h}" carries ${n} cache-busters; the renderer-side and `
        + 'engine-side stamps must compose, not stack').toBeLessThanOrEqual(1);
    }
  });
});
