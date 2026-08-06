// GET /__inventory — the document as data, WITHOUT a browser.
//
// The editor's own docsync.api.inventory() is the richer answer: it measures
// the live DOM, so it knows where every designed element actually paints.
// This is the headless twin for a CI check, a script, or an MCP client that
// has no browser at all — everything the FILES know, exactly, and nothing
// guessed. These tests hit the REAL endpoint on the fixture's own server.
const { test, expect } = require('./fixtures/editor-test');

const get = async (page, qs) => {
  const r = await page.request.get(`/__inventory${qs}`);
  expect(r.status()).toBe(200);
  return r.json();
};

test.describe('inventory endpoint', () => {
  test('reports the document from the files: slots, sources, placed geometry',
    async ({ page }) => {
      const inv = await get(page, '?project=budget-primer&elements=0');
      expect(inv.ok).toBe(true);
      expect(inv.project).toBe('budget-primer');

      // Slots carry their FULL markdown, not the 80-char snippet the browser
      // inventory returns — a headless caller has no second call to go and
      // fetch the rest with.
      expect(inv.slots.length).toBeGreaterThan(50);
      const p1 = inv.slots.find(s => s.key === 'whopays.p1');
      expect(p1.md).toContain('low- and middle-income');
      expect(p1.md.length).toBeGreaterThan(200);      // the whole block
      // The sources block is parsed out, never listed as an editable slot.
      expect(inv.slots.some(s => s.key === 'sources')).toBe(false);

      // Sources come with their citation counts, so "which are unused" — the
      // thing that blocks a publish — is answerable without rendering.
      expect(inv.sources.length).toBeGreaterThan(10);
      const cited = inv.sources.find(s => s.cites > 0);
      expect(cited.url).toMatch(/^https?:\/\//);
      expect(cited.text.length).toBeGreaterThan(0);

      // Geometry for PLACED things is exact — it is the stored value itself.
      expect(inv.placed).toHaveProperty('shapes');
      expect(inv.placed).toHaveProperty('boxes');
      expect(inv.placed).toHaveProperty('tables');
      expect(inv.placed).toHaveProperty('positions');
      // And the boundary is stated, not left to be discovered.
      expect(inv.note).toContain('docsync.api.inventory()');
    });

  test('the page size falls back to what the report was BUILT at', async ({ page }) => {
    // layout.json only carries a `page` once File ▸ Resize has written one, so
    // an untouched report has none — answering "what size is this?" with null
    // would be a shrug. The binding's own size stands in until overridden.
    const inv = await get(page, '?project=budget-primer&elements=0');
    expect(inv.page.w).toBe(8.5);
    expect(inv.page.h).toBe(11);
    expect(inv.page.pageless).toBe(false);
    expect(inv.page.overridden).toBe(false);        // says WHICH it is
  });

  test('elements lists every addressable id, discovered by an edit-mode render',
    async ({ page }) => {
      // The published build stamps no data-el/data-slot at all (both are gated
      // behind DOCSYNC_EDIT), so the ids are simply not in the normal output —
      // a render is the only way to learn them without a browser.
      const inv = await get(page, '?project=budget-primer');
      expect(inv.elements.ok).toBe(true);
      expect(inv.elements.els).toContain('cover.logo');
      expect(inv.elements.slots).toContain('whopays.p1');
      expect(inv.elements.fills.length).toBeGreaterThan(0);
      // pageCount is the other half of pageOrder, which is empty whenever
      // nobody has reordered anything.
      expect(inv.elements.pageCount).toBeGreaterThan(10);

      // Every element id the render found is addressable; every slot the
      // render found is one the file-side parse also knows about, so the two
      // halves of this payload describe the same document.
      const fileSlots = new Set(inv.slots.map(s => s.key));
      const missing = inv.elements.slots.filter(k => !fileSlots.has(k)
        && !k.startsWith('extra.'));   // added sections live in content too
      expect(missing, `render found slots content.md does not: ${missing}`).toEqual([]);
    });

  test('elements=0 skips the render — the cheap path stays cheap', async ({ page }) => {
    const inv = await get(page, '?project=budget-primer&elements=0');
    expect(inv.ok).toBe(true);
    expect(inv.elements).toBeUndefined();
  });

  test('an unknown project is refused by name, and says what IS served',
    async ({ page }) => {
      const r = await page.request.get('/__inventory?project=no-such-report');
      expect(r.status()).toBe(404);
      const j = await r.json();
      expect(j.ok).toBe(false);
      expect(j.error).toContain('no-such-report');
      expect(j.projects).toContain('budget-primer');
    });
});
