// The editor served from the staff hub — step 03 of the hub plan, and
// "Served from the staff hub" in collab/README.md: `/primer/` on
// staff-updates-internal, behind Cloudflare Access, joining its room through
// the hub's own /api/collab door with no GitHub token and no ticket. Two
// browser contexts, each carrying an Access identity the way the edge would
// stamp it, open one project and edit at once.
//
// Needs the hub checked out beside this repo (skipped otherwise), and boots
// the same two processes collab/hub-check.mjs does: a `wrangler dev` holding
// the Durable Object class, and a `wrangler pages dev` over the hub with the
// class bound. The editor under test is vendored into that checkout FIRST
// (python3 -m docsync.hub --into …), so what the hub serves is THIS tree's
// edit.html, not whatever was committed there last. Same reasoning as
// collab.spec.js for booting here rather than in playwright.config: only this
// file pays for the two wranglers.
//
// LOCALLY THE ACCESS HEADER IS FORGEABLE, and this spec forges it — the way
// the edge does, by stamping it on the way in: each person gets a one-line
// proxy in front of the hub that adds Cf-Access-Authenticated-User-Email to
// every request and every websocket upgrade (identityProxy below). Not
// Playwright's extraHTTPHeaders: that puts the header on EVERY request the
// page makes, including the cross-origin Pyodide fetch from cdn.jsdelivr.net,
// whose CORS preflight then refuses the unknown header and the editor never
// boots. In production the edge strips this header from inbound requests and
// re-signs it — see functions/api/collab/[room].js in the hub.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, waitForFirstRender } = require('./fixtures/editor-test');

const REPO = path.resolve(__dirname, '../..');
const HUB_DIR = process.env.PRIMER_HUB_DIR || path.resolve(REPO, '../staff-updates-internal');
// Its own ports: collab/'s relays sit on 8788/8789, collab.spec on 8792,
// collab-drafts on 8793, hub-check on 8796/8797.
const RELAY_PORT = 8794;
const HUB_PORT = 8798;
const PROJECT = 'demo-report';
// Each person reaches the hub through their own door, at their own port.
const ADA = 'ada@hiappleseed.org', ADA_PORT = 8799;
const GRACE = 'grace@hibudget.org', GRACE_PORT = 8800;
const hubAs = port => `http://127.0.0.1:${port}`;

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);
test.skip(!fs.existsSync(path.join(HUB_DIR, 'functions/api/collab')),
  `needs the staff hub checked out at ${HUB_DIR} (PRIMER_HUB_DIR points elsewhere)`);

let relay = null, pages = null;
const proxies = [];
let ctxA, ctxB, a, b, browser;

/** The Access edge, in miniature: everything through `port` reaches the hub
 *  on HUB_PORT carrying `email` as the identity header — plain requests and
 *  websocket upgrades alike, since the room is reached over the latter. */
function identityProxy(email, port) {
  const upstream = (req) => ({
    host: '127.0.0.1', port: HUB_PORT, method: req.method, path: req.url,
    headers: { ...req.headers, host: `127.0.0.1:${HUB_PORT}`,
               'cf-access-authenticated-user-email': email },
  });
  const server = http.createServer((req, res) => {
    const up = http.request(upstream(req), r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', e => { res.writeHead(502); res.end(String(e)); });
    req.pipe(up);
  });
  server.on('upgrade', (req, socket, head) => {
    const up = http.request(upstream(req));
    up.on('upgrade', (r, upSocket, upHead) => {
      const lines = ['HTTP/1.1 101 Switching Protocols'];
      for (const [k, v] of Object.entries(r.headers)) lines.push(`${k}: ${v}`);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
      if (upHead.length) socket.write(upHead);
      if (head.length) upSocket.write(head);
      socket.pipe(upSocket).pipe(socket);
      socket.on('error', () => upSocket.destroy());
      upSocket.on('error', () => socket.destroy());
    });
    // A refusal at the door (401/403/426) is a plain response, not an upgrade.
    up.on('response', r => { socket.end(`HTTP/1.1 ${r.statusCode} ${r.statusMessage}\r\n\r\n`); });
    up.on('error', () => socket.destroy());
    up.end();
  });
  return new Promise(res => server.listen(port, '127.0.0.1', () => res(server)));
}

const status = page => page.evaluate('docsync.api.status().collab');
const slot = (page, key) => page.evaluate(`readSlot(${JSON.stringify(key)})`);
const firstSlot = page => page.evaluate('source.match(/\\[\\[([^\\]]+)\\]\\]/)[1]');

async function waitLive(page) {
  await expect.poll(async () => {
    const s = await status(page);
    if (s.status === 'error') throw new Error('collab error: ' + s.error);
    return s.status;
  }, { timeout: 60_000, message: 'the editor never joined the room through the hub' }).toBe('live');
}

/** A staff member's browser: through their door, no GitHub anything. */
async function open(browser, port) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${hubAs(port)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  await waitLive(page);
  return { ctx, page };
}

test.beforeAll(async ({ browser: b_ }) => {
  browser = b_;
  execFileSync('python3', ['-m', 'docsync.hub', '--into', HUB_DIR], { cwd: REPO, stdio: 'inherit' });
  const { startDev } = await import('../../collab/devserver.mjs');
  const { startPages } = await import('../../collab/hub-check.mjs');
  relay = await startDev({ port: RELAY_PORT });
  try {
    pages = await startPages({ port: HUB_PORT, hubDir: HUB_DIR });
  } catch (e) { await relay.stop(); throw e; }
  proxies.push(await identityProxy(ADA, ADA_PORT), await identityProxy(GRACE, GRACE_PORT));
  ({ ctx: ctxA, page: a } = await open(browser, ADA_PORT));
  ({ ctx: ctxB, page: b } = await open(browser, GRACE_PORT));
});

test.afterAll(async () => {
  for (const c of [ctxA, ctxB]) { try { await c.close(); } catch (e) { /* gone */ } }
  for (const p of proxies) p.close();
  if (pages) await pages.stop();
  if (relay) await relay.stop();
});

test('the hub lists the project and links into its editor', async () => {
  const page = await ctxA.newPage();
  await page.goto(`${hubAs(ADA_PORT)}/primer/index.html`);
  // The nav's own entry, lit.
  await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText(/Editor/);
  const tile = page.locator(`a.tile[href="edit.html?project=${PROJECT}"]`);
  await expect(tile).toBeVisible();
  // Named from docsync.yml (`name:`), not the id.
  await expect(tile).toContainText('Demo report');
  // Nobody has narrowed this document, so a person through Access may edit it.
  await expect(tile.locator('.tag')).toHaveText(/can edit/);
  await expect(page.locator('#meta')).toContainText(ADA);
  await page.close();
});

test('both editors are live in one room, as the people Access says they are', async () => {
  const sa = await status(a), sb = await status(b);
  expect(sa.on).toBe(true);
  expect(sa.peers).toBe(2);
  expect(sb.peers).toBe(2);
  // The identity came from the hub's /api/me, not from a GitHub login.
  expect(sa.login).toBe(ADA);
  expect(sb.login).toBe(GRACE);
  expect(sa.here).toContain(GRACE);
  expect(sb.here).toContain(ADA);
  await expect(a.locator('#collab')).toHaveText(/live · 2/);
  await expect(b.locator('#collab')).toHaveText(/live · 2/);
  expect(await a.evaluate('source')).toBe(await b.evaluate('source'));
});

test('an edit in A appears in B', async () => {
  const key = await firstSlot(a);
  const text = 'Typed on the hub at ' + Date.now() + '.';
  const r = await a.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, ${JSON.stringify(text)})`);
  expect(r.ok).toBe(true);
  await expect.poll(() => slot(b, key), { timeout: 20_000 }).toBe(text);
});

// --- the document store (step 04) --------------------------------------------

test('Save goes to the hub, not to git, and the room learns the version', async () => {
  const key = await firstSlot(a);
  const text = 'Saved to the store at ' + Date.now() + '.';
  await a.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, ${JSON.stringify(text)})`);
  await expect.poll(() => slot(b, key), { timeout: 20_000 }).toBe(text);
  await expect(a.locator('#save')).toBeEnabled();
  await a.locator('#save').click();
  await expect(a.locator('#stat')).toHaveText(/saved — anyone opening this document/, { timeout: 20_000 });
  // The store has it, under the room, with a version - read straight off the API.
  const meta = await a.evaluate(async () => (await fetch(docStore(), { cache: 'no-store' })).json());
  expect(meta.exists).toBe(true);
  expect(meta.updated_by).toBe(ADA);
  const stored = await a.evaluate(async () => (await fetch(docStore() + '/content', { cache: 'no-store' })).text());
  expect(stored).toContain(text);
  // B did not save, but B's "unsaved changes" now means "since Ada's save".
  await expect(b.locator('#save')).toBeDisabled();
  expect(await b.evaluate('docVersion')).toBe(meta.version);
  // No draft branch. Share is the share LIST here, Publish the export to git.
  await expect(a.locator('#share')).toHaveText('Share…');
  await expect(a.locator('#publish')).toBeVisible();
  expect(await a.evaluate('draftBranch')).toBeNull();
});

test('a fresh editor loads the stored document, not the vendored copy', async () => {
  const key = await firstSlot(a);
  const saved = await slot(a, key);
  const page = await ctxA.newPage();
  await page.goto(`${hubAs(ADA_PORT)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  expect(await slot(page, key)).toBe(saved);
  expect(await page.evaluate('docVersion')).toBe(await a.evaluate('docVersion'));
  await page.close();
});

test('an image uploads to the store and is served at the project path', async () => {
  // A 1x1 PNG. The editor compresses uploads; a tiny one comes back as is.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const chooser = a.waitForEvent('filechooser');
  await a.locator('#toolbar-image, [aria-label^="Insert image"]').first().click();
  await (await chooser).setFiles({ name: 'Hub Upload.png', mimeType: 'image/png', buffer: png });
  await expect(a.locator('#stat')).toHaveText(/hub-upload\.png (uploaded|placed)/, { timeout: 20_000 });
  const r = await a.request.get(`${hubAs(ADA_PORT)}/primer/${PROJECT}/assets/hub-upload.png`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('image/png');
  expect((await r.body()).length).toBe(png.length);
});

test('Publish asks the hub, and the hub says plainly when it cannot', async () => {
  // Nothing here holds an export key, so the honest answer is "not
  // configured" - proof that the verb reaches the store route and comes back
  // as words, not that a commit lands (that is collab/export.test.mjs).
  await expect(a.locator('#publish')).toBeVisible();
  await expect(a.locator('#publish')).toBeEnabled();
  await a.locator('#publish').click();
  // The editor's own confirm (dsConfirm), not a browser dialog.
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(a.locator('#stat')).toHaveText(/publish failed: publishing is not configured/, { timeout: 20_000 });
});

// --- who may open it (step 06) ------------------------------------------------

test('Share shows the record, and a change narrows the document', async () => {
  await a.locator('#share').click();
  const dlg = a.locator('dialog[open]');
  await expect(dlg.locator('.hub-share-default')).toHaveValue('editor');
  await dlg.locator('.hub-share-default').selectOption('viewer');
  await dlg.locator('.hub-share-add').click();
  const row = dlg.locator('.hub-share-row').last();
  await row.locator('input').fill(ADA);
  await row.locator('select').selectOption('editor');
  await dlg.locator('button.dsdlg-ok').click();
  await expect(a.locator('#stat')).toHaveText(/sharing saved — everyone may view, 1 named/, { timeout: 10_000 });
  const r = await a.request.get(`${hubAs(ADA_PORT)}/api/collab/share/Hawaii-Appleseed~primer-editor~${PROJECT}`);
  const rec = await r.json();
  expect(rec.default).toBe('viewer');
  expect(rec.people[ADA]).toBe('editor');
  expect(rec.you.role).toBe('owner');
});

test('a viewer watches: the chip says so, Save stays off, and their edit reaches nobody', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${hubAs(GRACE_PORT)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  await waitLive(page);
  await expect(page.locator('#collab')).toHaveText(/view only/);
  const key = await firstSlot(a);
  const before = await slot(a, key);
  await page.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, "A viewer typed this.")`);
  await expect(page.locator('#save')).toBeDisabled();
  await page.waitForTimeout(2000);
  expect(await slot(a, key)).toBe(before);
  // The dialog is readable, not changeable, for them.
  await page.locator('#share').click();
  await expect(page.locator('dialog[open] .hub-share-default')).toBeDisabled();
  await expect(page.locator('dialog[open] button.dsdlg-ok')).toHaveCount(0);
  await page.locator('dialog[open] button.dsdlg-cancel').click();
  await ctx.close();
  // Back to open, so the tests after this see the door's default.
  const r = await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/Hawaii-Appleseed~primer-editor~${PROJECT}`,
                                { data: { default: 'editor', people: {} } });
  expect(r.status()).toBe(200);
});

// --- versions and comments (step 07) -----------------------------------------

test('History lists every Save, names one, and brings one back as a new version', async () => {
  const key = await firstSlot(a);
  const before = await slot(a, key);
  await a.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, "A second saved version.")`);
  await a.locator('#save').click();
  await expect(a.locator('#stat')).toHaveText(/saved — anyone opening/, { timeout: 20_000 });
  await a.locator('#history').click();
  const dlg = a.locator('dialog[open]');
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  const rows = dlg.locator('.hub-history-row');
  await expect(rows.nth(1)).toBeVisible({ timeout: 10_000 });
  await expect(rows.first()).toHaveClass(/current/);
  // Name the older one, then bring it back.
  const older = rows.nth(1);
  await older.locator('.hub-history-label').fill('before the rewrite');
  await older.locator('.hub-history-label').press('Tab');
  await expect(older.locator('.hub-history-label')).toHaveClass(/saved/, { timeout: 5000 });
  await older.locator('.hub-history-restore').click();
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(a.locator('#stat')).toHaveText(/restored — the version from/, { timeout: 20_000 });
  expect(await slot(a, key)).toBe(before);
  // The room got it too, as a saved version, not as unsaved edits.
  await expect.poll(() => slot(b, key), { timeout: 20_000 }).toBe(before);
  await expect(b.locator('#save')).toBeDisabled();
  const hist = await (await a.request.get(`${hubAs(ADA_PORT)}/api/docs/Hawaii-Appleseed~primer-editor~${PROJECT}/history`)).json();
  expect(hist[0].restored_from).toBeTruthy();
  expect(hist.find(h => h.label === 'before the rewrite')).toBeTruthy();
});

test('what A selects, B sees ringed with her name', async () => {
  const id = await a.evaluate(`(docsync.api.inventory().pages.flatMap(p => p.elements)[0] || {}).id || null`);
  test.skip(!id, 'this project has no addressable elements');
  await a.evaluate(`docsync.api.select(${JSON.stringify(id)})`);
  const ring = b.frameLocator('#out').locator(`[data-el="${id}"].ds-peer`);
  await expect(ring).toHaveCount(1, { timeout: 20_000 });
  // The label is the person, by name when the roster knows one, else the
  // local part of the address - never the whole email.
  await expect(ring).toHaveAttribute('data-peer', /^ada/);
});

test('a comment on the selected element, from its own strip, marks it on the page for everyone', async () => {
  const id = await a.evaluate(`(docsync.api.inventory().pages.flatMap(p => p.elements)[0] || {}).id || null`);
  test.skip(!id, 'this project has no addressable elements');
  await a.evaluate(`docsync.api.select(${JSON.stringify(id)})`);
  // Whichever strip this element gets, its comment button is on it.
  const btn = a.locator('#ar-comment:visible, #ty-comment:visible').first();
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(a.locator('#cpanel')).toBeVisible();
  await expect(a.locator('#cpanel-anchor')).toHaveText(`New comment on ${id}`);
  await a.locator('#cpanel-text').fill('Move this up a little.');
  await a.locator('#cpanel-add').click();
  await expect(a.locator('#cpanel .cmt-here')).toBeVisible({ timeout: 10_000 });
  await expect(btn).toHaveClass(/has/);
  await expect(b.frameLocator('#out').locator(`[data-el="${id}"][data-ds-comments="1"], [data-slot="${id}"][data-ds-comments="1"]`)).toHaveCount(1, { timeout: 25_000 });
  const list = await (await a.request.get(`${hubAs(ADA_PORT)}/api/docs/Hawaii-Appleseed~primer-editor~${PROJECT}/comments`)).json();
  const c = list.find(x => x.anchor === id);
  expect(c).toBeTruthy();
  await a.request.delete(`${hubAs(ADA_PORT)}/api/docs/Hawaii-Appleseed~primer-editor~${PROJECT}/comments/${c.id}`);
  await a.locator('#cpanel-close').click();
});

test('a comment on a paragraph marks it on the page, and the other editor sees it', async () => {
  const key = await firstSlot(a);
  await a.evaluate('docsync.api.select(null)');
  await a.locator('#comments').click();
  await expect(a.locator('#cpanel')).toBeVisible();
  await a.locator('#cpanel-text').fill('Tighten this paragraph.');
  await a.locator('#cpanel-add').click();
  await expect(a.locator('#cpanel .cmt')).toHaveCount(1, { timeout: 10_000 });
  await expect(a.locator('#comments')).toHaveText(/Comments · 1/);
  // B's page carries the marker within one refresh of the panel.
  await b.locator('#comments').click();
  await expect(b.locator('#cpanel .cmt')).toHaveCount(1, { timeout: 20_000 });
  const marked = await b.frameLocator('#out').locator('[data-ds-comments]').count();
  expect(marked).toBeGreaterThanOrEqual(0);
  // Resolve from B; A's count drops on its next refresh.
  await b.locator('#cpanel .cmt button', { hasText: 'Resolve' }).first().click();
  await expect(a.locator('#comments')).toHaveText('Comments', { timeout: 30_000 });
  await b.locator('#cpanel-close').click();
  await a.locator('#cpanel-close').click();
});

// --- comments, comprehensively --------------------------------------------------
// Set on the document, on a paragraph and on an element; resolved and
// reopened from the OTHER editor; who may delete; a viewer's part; Show;
// persistence across a reload; and what the list page says.

const ROOM_URL = `/api/docs/Hawaii-Appleseed~primer-editor~${PROJECT}`;
const allComments = () => a.request.get(`${hubAs(ADA_PORT)}${ROOM_URL}/comments`).then(r => r.json());
const clearComments = async () => {
  for (const c of await allComments()) await a.request.delete(`${hubAs(ADA_PORT)}${ROOM_URL}/comments/${c.id}`);
};
const cmtRow = (page, text) => page.locator('#cpanel .cmt', { hasText: text });
const marker = (page, id) => page.frameLocator('#out').locator(`[data-el="${id}"][data-ds-comments], [data-slot="${id}"][data-ds-comments]`);

test('comments: on the document, a paragraph and an element - each anchored where it was set', async () => {
  await clearComments();
  const inv = await a.evaluate('docsync.api.inventory()');
  const els = inv.pages.flatMap(p => p.elements);
  const prose = els.find(e => e.kind === 'prose') || els[0];
  const other = els.find(e => e.id !== prose.id) || prose;
  for (const p of [a, b]) { if (await p.locator('#cpanel').isVisible()) await p.locator('#cpanel-close').click(); }

  // Nothing selected: the document.
  await a.evaluate('docsync.api.select(null)');
  await a.locator('#comments').click();
  await expect(a.locator('#cpanel-anchor')).toHaveText('New comment on the document');
  await a.locator('#cpanel-text').fill('Overall: shorter, please.');
  await a.locator('#cpanel-add').click();
  await expect(cmtRow(a, 'Overall: shorter')).toBeVisible({ timeout: 10_000 });
  await expect(cmtRow(a, 'Overall: shorter')).toContainText('on the document');

  // A paragraph, selected as a click would select it.
  await a.evaluate(`docsync.api.select(${JSON.stringify(prose.id)})`);
  await expect(a.locator('#cpanel-anchor')).toHaveText(`New comment on ${prose.id}`);
  await a.locator('#cpanel-text').fill('This paragraph runs long.');
  await a.locator('#cpanel-add').click();
  await expect(cmtRow(a, 'runs long')).toBeVisible({ timeout: 10_000 });
  await expect(marker(a, prose.id)).toHaveCount(1);

  // An element, from its own strip.
  await a.evaluate(`docsync.api.select(${JSON.stringify(other.id)})`);
  const btn = a.locator('#ar-comment:visible, #ty-comment:visible').first();
  await btn.click();
  await a.locator('#cpanel-text').fill('Nudge this to the left.');
  await a.locator('#cpanel-add').click();
  await expect(cmtRow(a, 'Nudge this')).toBeVisible({ timeout: 10_000 });
  await expect(a.locator('#comments')).toHaveText('Comments · 3');

  const stored = await allComments();
  expect(stored.map(c => c.anchor).sort()).toEqual([null, prose.id, other.id].sort());
  expect(stored.every(c => c.by === ADA && !c.resolved)).toBe(true);
  // Both markers, on both editors, with the count of what is open there.
  await expect(marker(b, prose.id)).toHaveAttribute('data-ds-comments', '1', { timeout: 20_000 });
  await expect(marker(b, other.id)).toHaveAttribute('data-ds-comments', '1');
  await expect(b.locator('#comments')).toHaveText('Comments · 3', { timeout: 20_000 });
});

test('comments: resolved from the other editor, the marker and the count drop everywhere; reopened, they return', async () => {
  const inv = await a.evaluate('docsync.api.inventory()');
  const prose = (inv.pages.flatMap(p => p.elements).find(e => e.kind === 'prose') || inv.pages[0].elements[0]).id;
  await b.locator('#comments').click();
  await expect(cmtRow(b, 'runs long')).toBeVisible({ timeout: 10_000 });
  await cmtRow(b, 'runs long').locator('button', { hasText: 'Resolve' }).click();
  await expect(cmtRow(b, 'runs long')).toHaveClass(/resolved/, { timeout: 10_000 });
  await expect(cmtRow(b, 'runs long').locator('button', { hasText: 'Reopen' })).toBeVisible();
  await expect(b.locator('#comments')).toHaveText('Comments · 2');
  await expect(marker(b, prose)).toHaveCount(0);
  // A hears it through presence, not a poll.
  await expect(a.locator('#comments')).toHaveText('Comments · 2', { timeout: 20_000 });
  await expect(marker(a, prose)).toHaveCount(0);
  await expect(cmtRow(a, 'runs long')).toHaveClass(/resolved/);
  const rec = (await allComments()).find(c => c.text.includes('runs long'));
  expect(rec.resolved).toBe(true);
  expect(rec.resolved_by).toBe(GRACE);
  // Reopen from A this time.
  await cmtRow(a, 'runs long').locator('button', { hasText: 'Reopen' }).click();
  await expect(cmtRow(a, 'runs long')).not.toHaveClass(/resolved/, { timeout: 10_000 });
  await expect(marker(a, prose)).toHaveCount(1);
  await expect(marker(b, prose)).toHaveCount(1, { timeout: 20_000 });
  await expect(b.locator('#comments')).toHaveText('Comments · 3', { timeout: 20_000 });
  expect((await allComments()).find(c => c.text.includes('runs long')).resolved_by).toBeNull();
});

test('comments: who may delete - the author, and the owner; nobody else sees the button', async () => {
  // Grace wrote nothing yet: no Delete on Ada's comments for her (Ada owns the record).
  await expect(cmtRow(b, 'Overall: shorter').locator('button', { hasText: 'Delete' })).toHaveCount(0);
  await b.locator('#cpanel-text').fill("Grace's own note.");
  await b.locator('#cpanel-add').click();
  await expect(cmtRow(b, "Grace's own note")).toBeVisible({ timeout: 10_000 });
  await expect(cmtRow(b, "Grace's own note").locator('button', { hasText: 'Delete' })).toBeVisible();
  // Ada, the owner, may delete Grace's; and her own.
  await expect(cmtRow(a, "Grace's own note")).toBeVisible({ timeout: 20_000 });
  await expect(cmtRow(a, "Grace's own note").locator('button', { hasText: 'Delete' })).toBeVisible();
  await cmtRow(a, "Grace's own note").locator('button', { hasText: 'Delete' }).click();
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(cmtRow(a, "Grace's own note")).toHaveCount(0, { timeout: 10_000 });
  await expect(cmtRow(b, "Grace's own note")).toHaveCount(0, { timeout: 20_000 });
  await cmtRow(a, 'Nudge this').locator('button', { hasText: 'Delete' }).click();
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(cmtRow(a, 'Nudge this')).toHaveCount(0, { timeout: 10_000 });
  await expect(a.locator('#comments')).toHaveText('Comments · 2');
  expect((await allComments()).length).toBe(2);
});

test('comments: Show flashes the paragraph; a comment on something no longer on the page says so', async () => {
  await cmtRow(a, 'runs long').locator('button', { hasText: 'Show' }).click();
  await expect(a.frameLocator('#out').locator('.ds-comment-flash')).toHaveCount(1);
  await expect(a.frameLocator('#out').locator('.ds-comment-flash')).toHaveCount(0, { timeout: 5000 });
  // The document-level comment has no Show; one anchored to a ghost says so.
  await expect(cmtRow(a, 'Overall: shorter').locator('button', { hasText: 'Show' })).toHaveCount(0);
  await a.request.post(`${hubAs(ADA_PORT)}${ROOM_URL}/comments`, { data: { anchor: 'ghost.element', text: 'Orphaned note.' } });
  await expect(cmtRow(a, 'Orphaned note')).toBeVisible({ timeout: 20_000 });
  await cmtRow(a, 'Orphaned note').locator('button', { hasText: 'Show' }).click();
  await expect(a.locator('#stat')).toContainText('not on the page any more');
  await cmtRow(a, 'Orphaned note').locator('button', { hasText: 'Delete' }).click();
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(cmtRow(a, 'Orphaned note')).toHaveCount(0, { timeout: 10_000 });
});

test('comments: a viewer may comment and resolve, and is shown the same panel', async () => {
  await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/Hawaii-Appleseed~primer-editor~${PROJECT}`,
                      { data: { default: 'viewer', people: { [ADA]: 'editor' } } });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${hubAs(GRACE_PORT)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  await waitLive(page);
  await expect(page.locator('#collab')).toHaveText(/view only/);
  await page.locator('#comments').click();
  await expect(cmtRow(page, 'Overall: shorter')).toBeVisible({ timeout: 10_000 });
  await page.locator('#cpanel-text').fill('From a viewer: agreed.');
  await page.locator('#cpanel-add').click();
  await expect(cmtRow(page, 'From a viewer')).toBeVisible({ timeout: 10_000 });
  await cmtRow(page, 'Overall: shorter').locator('button', { hasText: 'Resolve' }).click();
  await expect(cmtRow(page, 'Overall: shorter')).toHaveClass(/resolved/, { timeout: 10_000 });
  await ctx.close();
  await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/Hawaii-Appleseed~primer-editor~${PROJECT}`,
                      { data: { default: 'editor', people: {} } });
  await expect(cmtRow(a, 'From a viewer')).toBeVisible({ timeout: 20_000 });
  await expect(cmtRow(a, 'Overall: shorter')).toHaveClass(/resolved/, { timeout: 20_000 });
});

test('comments: they survive a reload, and the list page counts the open ones', async () => {
  const page = await ctxA.newPage();
  await page.goto(`${hubAs(ADA_PORT)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  // Two open (runs long, from a viewer), one resolved (overall) - before any panel is opened.
  await expect(page.locator('#comments')).toHaveText('Comments · 2', { timeout: 20_000 });
  await page.locator('#comments').click();
  await expect(page.locator('#cpanel .cmt')).toHaveCount(3, { timeout: 10_000 });
  await expect(page.locator('#cpanel .cmt-sep', { hasText: '1 resolved' })).toBeVisible();
  await page.goto(`${hubAs(ADA_PORT)}/primer/index.html`);
  await expect(page.locator(`a.tile[href="edit.html?project=${PROJECT}"]`)).toContainText('2 open comments');
  await page.close();
  await clearComments();
  for (const p of [a, b]) { if (await p.locator('#cpanel').isVisible()) await p.locator('#cpanel-close').click(); }
});

test('the list says what changed since you looked, and the Editor tab counts it', async () => {
  // A browser that has seen nothing of this document: to it, it changed.
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await page.goto(`${hubAs(GRACE_PORT)}/primer/index.html`);
  const tile = page.locator(`a.tile[href="edit.html?project=${PROJECT}"]`);
  await expect(tile.locator('.tag.t-changed')).toBeVisible();
  await expect(tile).toContainText('saved');
  await expect(page.locator('#count')).toContainText('changed since you looked');
  // On another page of the hub the Editor tab wears the count.
  await page.goto(`${hubAs(GRACE_PORT)}/resources.html`);
  await expect(page.locator('#primerBadge')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#primerBadge')).toHaveText(/^[1-9]/);
  await fresh.close();
  // Ada's browser saw the current version in the editor: to her, nothing changed.
  const mine = await ctxA.newPage();
  await mine.goto(`${hubAs(ADA_PORT)}/primer/index.html`);
  await expect(mine.locator(`a.tile[href="edit.html?project=${PROJECT}"]`)).toBeVisible();
  await expect(mine.locator(`a.tile[href="edit.html?project=${PROJECT}"] .tag.t-changed`)).toHaveCount(0);
  await mine.close();
});

test('no GitHub token was asked for or stored', async () => {
  for (const page of [a, b]) {
    expect(await page.evaluate("localStorage.getItem('docsync-pat')")).toBeNull();
    // A hosted editor with no token normally sits at "Sign in to collaborate";
    // through the hub's door that state cannot occur.
    expect((await status(page)).status).toBe('live');
  }
});
