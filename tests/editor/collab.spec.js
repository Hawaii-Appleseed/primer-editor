// Real-time collaboration, end to end through the editor (Phase 2 of
// collab/README.md): two browser contexts open the same project against a
// real `wrangler dev` relay and edit at once.
//
// The relay is booted HERE, per spec file, rather than as a second entry in
// playwright.config's webServer: only this spec needs it, and a ~10s Worker
// boot on every one of the other ~120 files would be paid for nothing. It
// gets its own port (8792) and inspector port so it never collides with
// collab/'s own test relays (8788/8789).
//
// Local mode throughout: the editor talks to the relay with a `dev:<login>`
// token, which the Worker accepts only under its development secret (see
// collab/src/index.js handleAuth). `?collab=` and `?collabroom=` are honoured
// by a LOCAL editor only, and the room tag keeps every run in a fresh room.
const { test, expect, gotoEditor } = require('./fixtures/editor-test');

const RELAY_PORT = 8792;
const EDITOR_PORT = process.env.PRIMER_TEST_PORT || 8199;
const SLOT = 'whopays.p1';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

let relay = null;
let ctxA, ctxB, a, b;
const room = `pw-${Date.now()}`;

const status = page => page.evaluate('docsync.api.status().collab');
const slot = page => page.evaluate(`readSlot(${JSON.stringify(SLOT)})`);
const api = (page, expr) => page.evaluate(`docsync.api.${expr}`);

async function waitLive(page) {
  await expect.poll(async () => {
    const s = await status(page);
    if (s.status === 'error') throw new Error('collab error: ' + s.error);
    return s.status;
  }, { timeout: 60_000, message: 'the editor never joined the room' }).toBe('live');
}

async function open(browser, as) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await gotoEditor(page, `?collab=http://127.0.0.1:${RELAY_PORT}&collabroom=${room}&collabas=${as}`);
  await waitLive(page);
  return { ctx, page };
}

test.beforeAll(async ({ browser }) => {
  const { startDev } = await import('../../collab/devserver.mjs');
  relay = await startDev({
    port: RELAY_PORT,
    vars: { ALLOWED_ORIGINS: `http://localhost:${EDITOR_PORT},http://127.0.0.1:${EDITOR_PORT}` },
  });
  ({ ctx: ctxA, page: a } = await open(browser, 'ada'));
  ({ ctx: ctxB, page: b } = await open(browser, 'grace'));
});

test.afterAll(async () => {
  for (const c of [ctxA, ctxB]) { try { await c.close(); } catch (e) { /* gone */ } }
  if (relay) await relay.stop();
});

test('both editors are live in one room and see each other', async () => {
  const sa = await status(a), sb = await status(b);
  expect(sa.on).toBe(true);
  expect(sa.peers).toBe(2);
  expect(sb.peers).toBe(2);
  await expect(a.locator('#collab')).toHaveText(/live · 2/);
  await expect(b.locator('#collab')).toHaveText(/live · 2/);
  // The first one in seeded from its files; the second adopted the room and
  // holds the same bytes — including the prose it did not type.
  expect(await slot(a)).toBe(await slot(b));
  expect(await a.evaluate('source')).toBe(await b.evaluate('source'));
});

test('a slot edit in A appears in B, rendered', async () => {
  const before = await slot(b);
  const text = 'Shared from A at ' + Date.now() + '.';
  const r = await api(a, `setSlot(${JSON.stringify(SLOT)}, ${JSON.stringify(text)})`);
  expect(r.ok).toBe(true);
  await expect.poll(() => slot(b), { timeout: 20_000 }).toBe(text);
  await expect(b.frameLocator('#out').locator(`[data-slot="${SLOT}"]`)).toContainText('Shared from A');
  expect(before).not.toBe(text);
  // B did nothing, so B has nothing to undo; A's edit is A's to undo.
  await expect(b.locator('#undo')).toBeDisabled();
  await expect(a.locator('#undo')).toBeEnabled();
});

test('concurrent edits to the SAME slot merge instead of one winning', async () => {
  const base = 'Base sentence for the merge test.';
  await api(a, `setSlot(${JSON.stringify(SLOT)}, ${JSON.stringify(base)})`);
  await expect.poll(() => slot(b), { timeout: 20_000 }).toBe(base);

  // Both edit from the same base: A prepends, B appends. B is BUSY (a pointer
  // held down — the same hold a drag or an open inline editor gets) so A's
  // change waits at B's door; B's own edit is therefore diffed against the
  // base, exactly as a sentence typed while A's change was in flight would
  // be, and the two land as concurrent CRDT operations. Without the hold this
  // is a race between the network and the next evaluate: whichever of A's
  // adoption or B's setSlot runs second in B simply wins the whole slot —
  // correct for a verb that says "set the slot to X", but not this test.
  await b.evaluate('collabPointerAt = Date.now()');
  await api(a, `setSlot(${JSON.stringify(SLOT)}, ${JSON.stringify('A says: ' + base)})`);
  await expect.poll(() => a.evaluate(`docsync.api.status().collab.status`)).toBe('live');
  await b.waitForTimeout(800);                    // A's update has reached B and is being held
  expect(await slot(b)).toBe(base);
  await api(b, `setSlot(${JSON.stringify(SLOT)}, ${JSON.stringify(base + ' (B agrees)')})`);
  await b.evaluate('collabPointerAt = 0');        // release: the held update drains and merges
  const merged = 'A says: ' + base + ' (B agrees)';
  await expect.poll(() => slot(a), { timeout: 20_000 }).toBe(merged);
  await expect.poll(() => slot(b), { timeout: 20_000 }).toBe(merged);
});

test('undo in B removes only B\'s part; A\'s stays', async () => {
  await api(b, 'undo()');
  const base = 'Base sentence for the merge test.';
  await expect.poll(() => slot(b), { timeout: 20_000 }).toBe('A says: ' + base);
  await expect.poll(() => slot(a), { timeout: 20_000 }).toBe('A says: ' + base);
  await api(b, 'redo()');
  await expect.poll(() => slot(a), { timeout: 20_000 }).toBe('A says: ' + base + ' (B agrees)');
});

test('a move in A lands in B\'s layout and geometry', async () => {
  const r = await api(a, `place('cover.logo', { x: 1.25, y: 4 })`);
  expect(r.ok).toBe(true);
  await expect.poll(async () => {
    const l = await b.evaluate('layout.positions["cover.logo"]');
    return l && l.x;
  }, { timeout: 20_000 }).toBeCloseTo(1.25, 1);
  const inv = await api(b, 'inventory()');
  const logo = inv.pages[0].elements.find(e => e.id === 'cover.logo');
  expect(logo.box.x).toBeCloseTo(1.25, 1);
});

test('a remote edit waits while B is typing in a slot, then lands', async () => {
  // Open B's inline editor on a DIFFERENT slot — on another page, clear of
  // the logo the previous test parked over the cover — and leave it open.
  const inv = await api(b, 'inventory()');
  const other = inv.pages.slice(1).flatMap(p => p.slots).find(s => s.key !== SLOT && s.text).key;
  const el = b.frameLocator('#out').locator(`[data-slot="${other}"]`).first();
  await el.scrollIntoViewIfNeeded();
  await el.dblclick();
  await expect.poll(() => b.evaluate('editing'), { timeout: 10_000 }).toBe(true);

  const text = 'Landed after B finished typing.';
  await api(a, `setSlot(${JSON.stringify(SLOT)}, ${JSON.stringify(text)})`);
  await b.waitForTimeout(1500);
  expect(await slot(b)).not.toBe(text);          // held: B is busy

  await b.keyboard.press('Escape');               // close the editor, keep nothing
  await expect.poll(() => b.evaluate('editing'), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => slot(b), { timeout: 20_000 }).toBe(text);
});

test('a third editor arriving late adopts the room, not its own files', async ({ browser }) => {
  const { ctx, page: c } = await open(browser, 'linus');
  try {
    expect(await slot(c)).toBe(await slot(a));
    expect(await c.evaluate('layout.positions["cover.logo"].x')).toBeCloseTo(1.25, 1);
    await expect(c.locator('#collab')).toHaveText(/live · 3/);
    expect((await status(c)).peers).toBe(3);
    // Presence: a newcomer sees who is here and in what colour, immediately.
    const s = await status(c);
    expect(s.peerList.map(p => p.login).sort()).toEqual(['ada', 'grace']);
    await expect(c.locator('#collab i')).toHaveCount(2);
  } finally {
    await ctx.close();
  }
  await expect.poll(async () => (await status(a)).peers, { timeout: 10_000 }).toBe(2);
});

test('presence: A\'s selection shows in B as a ring with A\'s name; it clears when A deselects', async () => {
  await a.evaluate(`setSel(document.getElementById('out').contentDocument, ['cover.logo'])`);
  const ring = b.frameLocator('#out').locator('[data-el="cover.logo"].ds-peer');
  await expect(ring).toHaveCount(1, { timeout: 10_000 });
  await expect(ring).toHaveAttribute('data-peer', 'ada');
  const color = await ring.evaluate(el => el.style.getPropertyValue('--peer'));
  expect(color).toMatch(/^#[0-9A-F]{6}$/i);
  // The dot in B's chip for ada is the same colour as the ring.
  const dot = b.locator('#collab i[title^="ada"]');
  await expect(dot).toHaveCount(1);
  expect((await dot.evaluate(el => el.style.background)).toLowerCase())
    .toBe((await ring.evaluate((el, c) => { el.style.background = c; const v = el.style.background; el.style.background = ''; return v; }, color)).toLowerCase());
  // A's own view carries no peer ring for its own selection.
  await expect(a.frameLocator('#out').locator('.ds-peer')).toHaveCount(0);

  await a.evaluate(`clearSel(document.getElementById('out').contentDocument)`);
  await expect(b.frameLocator('#out').locator('.ds-peer')).toHaveCount(0, { timeout: 10_000 });
});

test('presence: the paragraph B is typing in is tagged in A, and A is told when opening it', async () => {
  const inv = await api(b, 'inventory()');
  const key = inv.pages.slice(1).flatMap(p => p.slots).find(s => s.key !== SLOT && s.text).key;
  const el = b.frameLocator('#out').locator(`[data-slot="${key}"]`).first();
  await el.scrollIntoViewIfNeeded();
  await el.dblclick();
  await expect.poll(() => b.evaluate('editing'), { timeout: 10_000 }).toBe(true);
  expect(await b.evaluate('collabEditTarget()')).toBe(key);

  const tag = a.frameLocator('#out').locator(`[data-slot="${key}"].ds-peer-typing`);
  await expect(tag).toHaveCount(1, { timeout: 10_000 });
  await expect(tag).toHaveAttribute('data-peer', 'grace · typing');
  await expect(a.locator('#collab i[title="grace · typing"]')).toHaveCount(1);

  // A opens the same paragraph: told, not blocked.
  const elA = a.frameLocator('#out').locator(`[data-slot="${key}"]`).first();
  await elA.scrollIntoViewIfNeeded();
  await elA.dblclick();
  await expect.poll(() => a.evaluate('editing'), { timeout: 10_000 }).toBe(true);
  await expect(a.locator('#stat')).toHaveText(/grace is also editing this paragraph/);

  await a.keyboard.press('Escape');
  await b.keyboard.press('Escape');
  await expect.poll(() => b.evaluate('editing'), { timeout: 10_000 }).toBe(false);
  await expect(a.frameLocator('#out').locator('.ds-peer-typing')).toHaveCount(0, { timeout: 10_000 });
});

test('presence survives a re-render: B\'s ring for A is back after B edits', async () => {
  await a.evaluate(`setSel(document.getElementById('out').contentDocument, ['cover.logo'])`);
  await expect(b.frameLocator('#out').locator('[data-el="cover.logo"].ds-peer')).toHaveCount(1, { timeout: 10_000 });
  await api(b, `setSlot(${JSON.stringify(SLOT)}, ${JSON.stringify('B re-rendered at ' + Date.now())})`);
  await expect(b.frameLocator('#out').locator('[data-el="cover.logo"].ds-peer')).toHaveCount(1, { timeout: 10_000 });
  await a.evaluate(`clearSel(document.getElementById('out').contentDocument)`);
});

test('an unshared project shows no chip and keeps the snapshot undo stack', async ({ page }) => {
  await gotoEditor(page, '?collab=0');
  const s = await status(page);
  expect(s.on).toBe(false);
  await expect(page.locator('#collab')).toBeHidden();
  expect(await page.evaluate('collab')).toBe(null);
});
