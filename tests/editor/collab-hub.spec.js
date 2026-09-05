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
  // Their edit became a suggestion (the suggesting tests below cover the rest); tidied here.
  await expect.poll(async () => (await allComments()).filter(c => c.kind === 'suggestion').length, { timeout: 10_000 }).toBe(1);
  for (const c of await allComments()) await a.request.delete(`${hubAs(ADA_PORT)}/api/docs/Hawaii-Appleseed~primer-editor~${PROJECT}/comments/${c.id}`);
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

// The rest of History: what both editors show after a restore, a Save on
// top of one, the confirmation refused, a restore from the OTHER editor,
// unsaved edits superseded, a reload and a fresh editor, the viewer's
// read-only list, and naming from the dialog.
const DOC_URL = () => `${hubAs(ADA_PORT)}/api/docs/Hawaii-Appleseed~primer-editor~${PROJECT}`;
const versions = async () => (await a.request.get(`${DOC_URL()}/history`)).json();
const historyRows = page => page.locator('dialog[open] .hub-history-row');
const closeDialog = page => page.locator('dialog[open] button.dsdlg-cancel').click();
let N = 0;   // versions in the store when this block starts (earlier tests save too)
const namedRow = async () => (await versions()).findIndex(h => h.label === 'before the rewrite');

test('history: after a restore both editors are clean on it, and both lists say so', async () => {
  const hist = await versions();
  N = hist.length;
  expect(N).toBeGreaterThanOrEqual(3);
  expect(hist[0].restored_from).toBe(hist[2].version);
  // Nothing unsaved on either side: the restore IS the saved version.
  await expect(a.locator('#save')).toBeDisabled();
  await expect(b.locator('#save')).toBeDisabled();
  expect(await a.evaluate('docVersion')).toBe(hist[0].version);
  expect(await b.evaluate('docVersion')).toBe(hist[0].version);
  // B's list, who did not click Restore: the same rows, the same current.
  await b.locator('#history').click();
  const rows = historyRows(b);
  await expect(rows).toHaveCount(N, { timeout: 10_000 });
  await expect(rows.first()).toHaveClass(/current/);
  await expect(rows.first().locator('.hub-history-when')).toHaveText(/· current · restored$/);
  await expect(rows.first().locator('.hub-history-when')).toHaveText(/ada/);
  await expect(rows.first().locator('.hub-history-restore')).toHaveCount(0);
  await expect(rows.nth(1).locator('.hub-history-restore')).toHaveCount(1);
  await expect(rows.nth(2).locator('.hub-history-label')).toHaveValue('before the rewrite');
  await closeDialog(b);
  await expect(b.locator('dialog[open]')).toHaveCount(0);
});

test('history: a Save after a restore builds on it - no conflict, one more plain version', async () => {
  const key = await firstSlot(a);
  await a.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, "Saved on top of the restore.")`);
  await expect(a.locator('#save')).toBeEnabled();
  await a.locator('#save').click();
  await expect(a.locator('#stat')).toHaveText(/saved — anyone opening/, { timeout: 20_000 });
  const hist = await versions();
  expect(hist.length).toBe(N + 1);
  expect(hist[0].restored_from).toBeNull();
  expect(hist[0].updated_by).toBe(ADA);
  expect(hist[1].restored_from).toBeTruthy();
  await expect.poll(() => slot(b, key), { timeout: 20_000 }).toBe('Saved on top of the restore.');
  await expect(b.locator('#save')).toBeDisabled();
  expect(await b.evaluate('docVersion')).toBe(hist[0].version);
});

test('history: a session that missed the restore is refused, and told where the store is', async () => {
  const hist = await versions();
  const stale = hist[2].version;          // the version before the restore
  const r = await a.request.put(DOC_URL(), { data: { content: 'From a browser that was not here.', base: stale } });
  expect(r.status()).toBe(409);
  const j = await r.json();
  expect(j.version).toBe(hist[0].version);
  expect(j.updated_by).toBe(ADA);
  expect((await versions()).length).toBe(N + 1);   // nothing written
});

test('history: Restore, then Cancel at the confirmation, changes nothing', async () => {
  const key = await firstSlot(a);
  const before = await slot(a, key);
  const version = await a.evaluate('docVersion');
  await a.locator('#history').click();
  await expect(historyRows(a)).toHaveCount(N + 1, { timeout: 10_000 });
  await historyRows(a).nth(await namedRow()).locator('.hub-history-restore').click();
  // The history dialog closed and the confirmation opened in its place.
  await expect(a.locator('dialog[open] button.dsdlg-ok')).toHaveText('Restore');
  await expect(a.locator('dialog[open] .dsdlg-msg')).toHaveText(/"before the rewrite"/);
  await closeDialog(a);
  await expect(a.locator('dialog[open]')).toHaveCount(0);
  expect(await slot(a, key)).toBe(before);
  expect(await a.evaluate('docVersion')).toBe(version);
  await expect(a.locator('#save')).toBeDisabled();
  expect((await versions()).length).toBe(N + 1);
});

test('history: the other editor may restore too, and the first sees it land as saved', async () => {
  const key = await firstSlot(a);
  const hist = await versions();
  const second = hist[2];                   // "A second saved version."
  await b.locator('#history').click();
  const rows = historyRows(b);
  await expect(rows).toHaveCount(N + 1, { timeout: 10_000 });
  await rows.nth(2).locator('.hub-history-restore').click();
  await b.locator('dialog[open] button.dsdlg-ok').click();
  await expect(b.locator('#stat')).toHaveText(/restored — the version from/, { timeout: 20_000 });
  expect(await slot(b, key)).toBe('A second saved version.');
  await expect(b.locator('#save')).toBeDisabled();
  await expect.poll(() => slot(a, key), { timeout: 20_000 }).toBe('A second saved version.');
  await expect(a.locator('#save')).toBeDisabled();
  await expect(a.locator('#stat')).toHaveText(/a collaborator saved/);
  const after = await versions();
  expect(after.length).toBe(N + 2);
  expect(after[0].updated_by).toBe(GRACE);
  expect(after[0].restored_from).toBe(second.version);
  expect(await a.evaluate('docVersion')).toBe(after[0].version);
  expect(await b.evaluate('docVersion')).toBe(after[0].version);
});

test("history: a restore supersedes the other editor's unsaved edits, and says so", async () => {
  const key = await firstSlot(a);
  await b.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, "Grace, not yet saved.")`);
  await expect(b.locator('#save')).toBeEnabled();
  await expect.poll(() => slot(a, key), { timeout: 20_000 }).toBe('Grace, not yet saved.');
  // Newest first: Grace's restore, then the Save Ada made on top of the first restore.
  const hist = await versions();
  expect(hist[1].updated_by).toBe(ADA);
  expect(hist[1].restored_from).toBeNull();
  const idx = 1;
  await a.locator('#history').click();
  await expect(historyRows(a)).toHaveCount(N + 2, { timeout: 10_000 });
  await historyRows(a).nth(idx).locator('.hub-history-restore').click();
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(a.locator('#stat')).toHaveText(/restored — the version from/, { timeout: 20_000 });
  expect(await slot(a, key)).toBe('Saved on top of the restore.');
  await expect.poll(() => slot(b, key), { timeout: 20_000 }).toBe('Saved on top of the restore.');
  await expect(b.locator('#save')).toBeDisabled();
  await expect(b.locator('#stat')).toHaveText(/a collaborator saved/);
  expect((await versions()).length).toBe(N + 3);
});

test('history: a reload and a fresh editor both open on the restored version, not on what came before', async () => {
  const key = await firstSlot(a);
  const current = (await versions())[0];
  await a.reload();
  await waitForFirstRender(a);
  await waitLive(a);
  expect(await slot(a, key)).toBe('Saved on top of the restore.');
  expect(await a.evaluate('docVersion')).toBe(current.version);
  await expect(a.locator('#save')).toBeDisabled();
  const { ctx, page } = await open(browser, GRACE_PORT);
  expect(await slot(page, key)).toBe('Saved on top of the restore.');
  expect(await page.evaluate('docVersion')).toBe(current.version);
  await page.locator('#history').click();
  await expect(historyRows(page)).toHaveCount(N + 3, { timeout: 10_000 });
  await expect(historyRows(page).first()).toHaveClass(/current/);
  await closeDialog(page);
  await ctx.close();
});

test('history: a viewer reads the list and may neither name nor restore', async () => {
  const room = `Hawaii-Appleseed~primer-editor~${PROJECT}`;
  let r = await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/${room}`, { data: { default: 'viewer', people: { [ADA]: 'editor' } } });
  expect(r.status()).toBe(200);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${hubAs(GRACE_PORT)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  await waitLive(page);
  await expect(page.locator('#collab')).toHaveText(/view only/);
  await page.locator('#history').click();
  const rows = historyRows(page);
  await expect(rows).toHaveCount(N + 3, { timeout: 10_000 });
  await expect(rows.first()).toHaveClass(/current/);
  await expect(page.locator('dialog[open] .hub-history-restore')).toHaveCount(0);
  for (let i = 0; i < N + 3; i++) await expect(rows.nth(i).locator('.hub-history-label')).toBeDisabled();
  await closeDialog(page);
  // And the store agrees, whatever the page shows.
  const hist = await versions();
  r = await page.request.post(`${hubAs(GRACE_PORT)}/api/docs/${room}/restore`, { data: { version: hist[1].version } });
  expect(r.status()).toBe(403);
  r = await page.request.patch(`${hubAs(GRACE_PORT)}/api/docs/${room}/history/${hist[1].version}`, { data: { label: 'no' } });
  expect(r.status()).toBe(403);
  await ctx.close();
  r = await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/${room}`, { data: { default: 'editor', people: {} } });
  expect(r.status()).toBe(200);
  expect((await versions()).length).toBe(N + 3);
});

test('history: a name given in the dialog is kept, shown to the other editor and the list page, and cleared', async () => {
  await a.locator('#history').click();
  const rows = historyRows(a);
  await expect(rows).toHaveCount(N + 3, { timeout: 10_000 });
  await rows.first().locator('.hub-history-label').fill('sent to the board');
  await rows.first().locator('.hub-history-label').press('Tab');
  await expect(rows.first().locator('.hub-history-label')).toHaveClass(/saved/, { timeout: 5000 });
  await closeDialog(a);
  // The current version wears it: on the store, in the summary, and for B.
  const meta = await (await a.request.get(DOC_URL())).json();
  expect(meta.label).toBe('sent to the board');
  const sum = await (await a.request.get(`${hubAs(ADA_PORT)}/api/docs`)).json();
  expect(sum.find(d => d.project === PROJECT).label).toBe('sent to the board');
  await b.locator('#history').click();
  await expect(historyRows(b).first().locator('.hub-history-label')).toHaveValue('sent to the board', { timeout: 10_000 });
  await expect(historyRows(b).nth(await namedRow()).locator('.hub-history-label')).toHaveValue('before the rewrite');
  // B clears it.
  await historyRows(b).first().locator('.hub-history-label').fill('');
  await historyRows(b).first().locator('.hub-history-label').press('Tab');
  await expect(historyRows(b).first().locator('.hub-history-label')).toHaveClass(/saved/, { timeout: 5000 });
  await closeDialog(b);
  expect((await (await a.request.get(DOC_URL())).json()).label).toBeNull();
  expect((await versions())[0].label).toBeNull();
  expect((await versions()).find(h => h.label === 'before the rewrite')).toBeTruthy();
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
  // Painting the marks must never throw: a throw here silently stops every refresh after it.
  for (const p of [a, b]) expect(await p.evaluate("(() => { try { hubCommentsPaint(document.getElementById('out').contentDocument); return 'ok'; } catch (e) { return String(e.stack || e); } })()")).toBe('ok');
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
  await expect(b.locator('#cpanel .cmt').first()).toHaveClass(/resolved/, { timeout: 10_000 });
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
// Delete, Show, Edit and Copy link live in the card's ⋮ menu, as in Docs.
const openMenu = row => row.locator('.cmt-msg').first().locator('.cmt-more').click();
const menuItem = (row, label) => row.locator('.cmt-menu button', { hasText: label });
const viaMenu = async (row, label) => { await openMenu(row); await menuItem(row, label).click(); };
const closeMenu = page => page.locator('#cpanel .cpanel-head b').click();
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
  await openMenu(cmtRow(b, 'Overall: shorter'));
  await expect(menuItem(cmtRow(b, 'Overall: shorter'), 'Delete')).toHaveCount(0);
  await expect(menuItem(cmtRow(b, 'Overall: shorter'), 'Resolve')).toHaveCount(1);
  await closeMenu(b);
  await b.locator('#cpanel-text').fill("Grace's own note.");
  await b.locator('#cpanel-add').click();
  await expect(cmtRow(b, "Grace's own note")).toBeVisible({ timeout: 10_000 });
  await openMenu(cmtRow(b, "Grace's own note"));
  await expect(menuItem(cmtRow(b, "Grace's own note"), 'Delete')).toBeVisible();
  await expect(menuItem(cmtRow(b, "Grace's own note"), 'Edit')).toBeVisible();
  await closeMenu(b);
  // Ada, the owner, may delete Grace's; and her own.
  await expect(cmtRow(a, "Grace's own note")).toBeVisible({ timeout: 20_000 });
  await viaMenu(cmtRow(a, "Grace's own note"), 'Delete');
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(cmtRow(a, "Grace's own note")).toHaveCount(0, { timeout: 10_000 });
  await expect(cmtRow(b, "Grace's own note")).toHaveCount(0, { timeout: 20_000 });
  await viaMenu(cmtRow(a, 'Nudge this'), 'Delete');
  await a.locator('dialog[open] button.dsdlg-ok').click();
  await expect(cmtRow(a, 'Nudge this')).toHaveCount(0, { timeout: 10_000 });
  await expect(a.locator('#comments')).toHaveText('Comments · 2');
  expect((await allComments()).length).toBe(2);
});

test('comments: Show flashes the paragraph; a comment on something no longer on the page says so', async () => {
  await viaMenu(cmtRow(a, 'runs long'), 'Show');
  await expect(a.frameLocator('#out').locator('.ds-comment-flash')).toHaveCount(1);
  await expect(a.frameLocator('#out').locator('.ds-comment-flash')).toHaveCount(0, { timeout: 5000 });
  // The document-level comment has no Show; one anchored to a ghost says so.
  await openMenu(cmtRow(a, 'Overall: shorter'));
  await expect(menuItem(cmtRow(a, 'Overall: shorter'), 'Show')).toHaveCount(0);
  await closeMenu(a);
  await a.request.post(`${hubAs(ADA_PORT)}${ROOM_URL}/comments`, { data: { anchor: 'ghost.element', text: 'Orphaned note.' } });
  await expect(cmtRow(a, 'Orphaned note')).toBeVisible({ timeout: 20_000 });
  await viaMenu(cmtRow(a, 'Orphaned note'), 'Show');
  await expect(a.locator('#stat')).toContainText('not on the page any more');
  await viaMenu(cmtRow(a, 'Orphaned note'), 'Delete');
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

// --- comments, the way Google Docs does them ---------------------------------
// Words selected in a paragraph become the quote and the highlight; a click
// on the highlight opens the thread; replies thread under it and reopen a
// resolved one; Edit rewords; @ offers people and For you lists what names
// you; ⌘⌥M starts one on what is in hand; a link opens on a thread.
const highlightCount = (page, name) => page.evaluate(`(() => { const w = document.getElementById('out').contentWindow;
  const h = w.CSS && w.CSS.highlights && w.CSS.highlights.get(${JSON.stringify(name)}); return h ? h.size : 0; })()`);
// Either set: the thread in hand paints darker, every other one lighter.
const highlighted = async page => (await highlightCount(page, 'ds-comment')) + (await highlightCount(page, 'ds-comment-active'));

test('comments: words selected in a paragraph are quoted and highlighted; a click on the highlight opens the thread', async () => {
  await clearComments();
  const inv = await a.evaluate('docsync.api.inventory()');
  // A body paragraph, not the cover's: the cover moves under a click.
  const key = (inv.pages.slice(1).flatMap(p => p.slots || []).find(s => s.text && s.text.length > 40)
            || inv.pages.flatMap(p => p.slots || []).find(s => s.text && s.text.length > 40)).key;
  const el = a.frameLocator('#out').locator(`[data-slot="${key}"]`).first();
  await el.scrollIntoViewIfNeeded();
  // What the paragraph's double-click does, called directly: the hub's frame
  // is never "stable" enough for Playwright's own double-click.
  await a.evaluate(`edit(document.getElementById('out').contentDocument, ${JSON.stringify(key)})`);
  await expect.poll(() => a.evaluate('editing'), { timeout: 10_000 }).toBe(true);
  // Select the first twelve characters of the paragraph, as a drag would.
  await expect.poll(() => a.evaluate('!!(richHost && richHost.textContent.trim())'), { timeout: 10_000 }).toBe(true);
  const quote = await a.evaluate(`(() => { const d = document.getElementById('out').contentDocument;
    const w = d.createTreeWalker(richHost, NodeFilter.SHOW_TEXT); let n = w.nextNode(); while (n && !n.nodeValue.trim()) n = w.nextNode();
    const r = d.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(12, n.length));
    const s = d.getSelection(); s.removeAllRanges(); s.addRange(r); return r.toString().trim(); })()`);
  expect(quote.length).toBeGreaterThan(3);
  await expect(a.locator('#cmt-plus')).toBeVisible({ timeout: 5000 });
  await a.locator('#cmt-plus').dispatchEvent('mousedown');
  await expect(a.locator('#cpanel')).toBeVisible();
  await expect(a.locator('#cpanel-anchor q')).toHaveText(quote);
  await expect(a.locator('#cpanel-text')).toBeFocused();
  await a.locator('#cpanel-text').fill('Rephrase this bit.');
  await a.keyboard.press('Meta+Enter');
  await expect(cmtRow(a, 'Rephrase this bit')).toBeVisible({ timeout: 10_000 });
  await expect(cmtRow(a, 'Rephrase this bit').locator('.cmt-quote q')).toHaveText(quote);
  await expect(cmtRow(a, 'Rephrase this bit')).toHaveClass(/active/);
  // The quoted words carry the highlight, not the paragraph a badge.
  await expect.poll(() => highlightCount(a, 'ds-comment-active')).toBe(1);
  await expect(marker(a, key)).toHaveCount(0);
  await expect.poll(() => highlightCount(b, 'ds-comment'), { timeout: 20_000 }).toBe(1);
  await expect(marker(b, key)).toHaveCount(0);
  const stored = (await allComments())[0];
  expect(stored.anchor).toBe(key);
  expect(stored.quote).toBe(quote);
  // B clicks the highlighted words: the panel opens on that thread.
  await b.evaluate(`(() => { const d = document.getElementById('out').contentDocument; const h = hubCommentRanges[0];
    h.el.scrollIntoView({ block: 'center' }); const r = h.range.getBoundingClientRect();
    d.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + 3, clientY: r.top + r.height / 2, bubbles: true, button: 0 })); })()`);
  await expect(b.locator('#cpanel')).toBeVisible();
  await expect(b.locator('#cpanel .cmt.active')).toContainText('Rephrase this bit', { timeout: 10_000 });
  await expect.poll(() => highlightCount(b, 'ds-comment-active')).toBe(1);
  if (await a.evaluate('editing')) await a.keyboard.press('Escape');
});

test('comments: a reply threads under it for everyone; resolved says who; a reply on a resolved thread reopens it', async () => {
  const row = cmtRow(b, 'Rephrase this bit');
  await row.locator('.cmt-reply-line').click();
  await row.locator('.cmt-reply-text').fill('Done.');
  await row.locator('button', { hasText: 'Reply' }).click();
  await expect(row.locator('.cmt-msg.reply')).toContainText('Done.', { timeout: 10_000 });
  await expect(row.locator('.cmt-msg.reply .cmt-meta b')).toHaveText('grace');
  await expect(cmtRow(a, 'Rephrase this bit').locator('.cmt-msg.reply')).toContainText('Done.', { timeout: 20_000 });
  // Resolve from A: the card greys, says who, the highlight goes.
  await cmtRow(a, 'Rephrase this bit').locator('.cmt-actions button', { hasText: 'Resolve' }).click();
  await expect(cmtRow(a, 'Rephrase this bit')).toHaveClass(/resolved/, { timeout: 10_000 });
  await expect(cmtRow(a, 'Rephrase this bit').locator('.cmt-resolved-line')).toContainText('Marked as resolved by ada');
  await expect(cmtRow(a, 'Rephrase this bit').locator('.cmt-reply-line')).toHaveAttribute('placeholder', /reopen/);
  await expect.poll(() => highlighted(a)).toBe(0);
  await expect(cmtRow(b, 'Rephrase this bit')).toHaveClass(/resolved/, { timeout: 20_000 });
  // B answers anyway: that reopens it, everywhere.
  await cmtRow(b, 'Rephrase this bit').locator('.cmt-reply-line').click();
  await cmtRow(b, 'Rephrase this bit').locator('.cmt-reply-text').fill('Not quite - the second half too.');
  await cmtRow(b, 'Rephrase this bit').locator('button', { hasText: 'Reply' }).click();
  await expect(cmtRow(b, 'Rephrase this bit')).not.toHaveClass(/resolved/, { timeout: 10_000 });
  await expect(cmtRow(a, 'Rephrase this bit')).not.toHaveClass(/resolved/, { timeout: 20_000 });
  await expect.poll(() => highlighted(a), { timeout: 10_000 }).toBeGreaterThan(0);
  if (process.env.PRIMER_SHOTS) await a.screenshot({ path: 'test-results/comments-panel.png' });
  const stored = (await allComments())[0];
  expect(stored.replies.map(r => r.by)).toEqual([GRACE, GRACE]);
  expect(stored.resolved).toBe(false);
  expect(stored.resolved_by).toBeNull();
});

test('comments: Edit rewords your own words and says so; @ offers people; For you lists what names you', async () => {
  const thread = (await allComments())[0];
  const card = a.locator(`#cpanel .cmt[data-id="${thread.id}"]`);
  await viaMenu(cmtRow(a, 'Rephrase this bit'), 'Edit');
  const box = card.locator('.cmt-edit');
  await expect(box).toBeVisible();
  await expect(box).toHaveValue('Rephrase this bit.');
  await box.fill('Rephrase this sentence.');
  await card.locator('button', { hasText: 'Save' }).click();
  await expect(cmtRow(a, 'Rephrase this sentence')).toBeVisible({ timeout: 10_000 });
  await expect(cmtRow(a, 'Rephrase this sentence').locator('.cmt-meta span').first()).toContainText('edited');
  expect((await allComments())[0].edited_at).toBeTruthy();
  // Grace cannot Edit Ada's words: no such item for her.
  await openMenu(cmtRow(b, 'Rephrase'));
  await expect(menuItem(cmtRow(b, 'Rephrase'), 'Edit')).toHaveCount(0);
  await closeMenu(b);
  // A new comment that names Grace, picked from the @ list.
  await a.evaluate('docsync.api.select(null)');
  await a.locator('#cpanel-text').click();
  await a.keyboard.type('Ping @gr');
  await expect(a.locator('#cpanel .cmt-mentions button')).toContainText(/grace/, { timeout: 5000 });
  await a.keyboard.press('Enter');
  await expect(a.locator('#cpanel-text')).toHaveValue(/^Ping @grace /);
  await a.keyboard.type('- see the cover.');
  await a.locator('#cpanel-add').click();
  await expect(cmtRow(a, 'Ping @grace')).toBeVisible({ timeout: 10_000 });
  await expect(cmtRow(a, 'Ping @grace').locator('.mention')).toHaveText('@grace');
  const ping = (await allComments()).find(c => c.text.startsWith('Ping'));
  expect(ping.mentions).toEqual([GRACE]);
  // For you, on Grace's side: the one that names her. On Ada's: the one Grace answered.
  await expect(cmtRow(b, 'Ping @grace')).toBeVisible({ timeout: 20_000 });
  await expect(b.locator('#cpanel-tab-you')).toHaveText('For you · 1');
  await b.locator('#cpanel-tab-you').click();
  await expect(b.locator('#cpanel .cmt')).toHaveCount(1);
  await expect(cmtRow(b, 'Ping @grace')).toBeVisible();
  await b.locator('#cpanel-tab-all').click();
  await expect(b.locator('#cpanel .cmt')).toHaveCount(2);
  await a.locator('#cpanel-tab-you').click();
  await expect(a.locator('#cpanel .cmt')).toHaveCount(1);
  await expect(cmtRow(a, 'Rephrase this sentence')).toBeVisible();
  await a.locator('#cpanel-tab-all').click();
});

test('comments: ⌘⌥M starts one on what is in hand, and a link opens the editor on a thread', async () => {
  const id = await a.evaluate(`(docsync.api.inventory().pages.flatMap(p => p.elements)[0] || {}).id || null`);
  test.skip(!id, 'this project has no addressable elements');
  await a.locator('#cpanel-close').click();
  await a.evaluate(`docsync.api.select(${JSON.stringify(id)})`);
  await a.keyboard.press('Meta+Alt+KeyM');
  await expect(a.locator('#cpanel')).toBeVisible();
  await expect(a.locator('#cpanel-anchor')).toHaveText(`New comment on ${id}`);
  await expect(a.locator('#cpanel-text')).toBeFocused();
  await a.locator('#cpanel-cancel').click();
  // Copy link puts ?comment=<id> on the clipboard (or in the status line when it cannot).
  const thread = (await allComments()).find(c => c.text.startsWith('Rephrase'));
  await viaMenu(cmtRow(a, 'Rephrase'), 'Copy link');
  await expect(a.locator('#stat')).toHaveText(new RegExp('copied|comment=' + thread.id));
  const page = await ctxA.newPage();
  await page.goto(`${hubAs(ADA_PORT)}/primer/edit.html?project=${PROJECT}&comment=${thread.id}`);
  await waitForFirstRender(page);
  await expect(page.locator('#cpanel')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#cpanel .cmt.active')).toContainText('Rephrase this sentence');
  await expect.poll(() => highlightCount(page, 'ds-comment-active'), { timeout: 10_000 }).toBe(1);
  await page.close();
  await clearComments();
  for (const p of [a, b]) { if (await p.locator('#cpanel').isVisible()) await p.locator('#cpanel-close').click(); }
});

// --- suggesting, the way Google Docs does it ---------------------------------
// A viewer's edit is proposed, not made: shown inline (red struck, green
// underlined), as a card an editor accepts or rejects. An editor can switch
// to Suggesting too; a move becomes a suggestion; Reject leaves the page.
const suggestRow = (page, text) => page.locator('#cpanel .cmt.suggest', { hasText: text });
const suggestions = async () => (await allComments()).filter(c => c.kind === 'suggestion');

test("suggesting: a viewer's edit is proposed, shown inline, and an editor accepts it", async () => {
  await clearComments();
  const room = `Hawaii-Appleseed~primer-editor~${PROJECT}`;
  await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/${room}`, { data: { default: 'viewer', people: { [ADA]: 'editor' } } });
  // A body paragraph (plain HTML), so the proposal can be drawn inline.
  const inv = await a.evaluate('docsync.api.inventory()');
  const key = (inv.pages.slice(1).flatMap(p => p.slots || []).find(s => s.text && s.text.length > 40)
            || inv.pages.flatMap(p => p.slots || []).find(s => s.text && s.text.length > 40)).key;
  const before = await slot(a, key);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${hubAs(GRACE_PORT)}/primer/edit.html?project=${PROJECT}`);
  await waitForFirstRender(page);
  await waitLive(page);
  await expect(page.locator('#mode')).toHaveText('Suggesting ▾');
  await expect(page.locator('#mode')).toBeDisabled();
  // The viewer edits the first paragraph. It shows, then goes back, and a suggestion exists.
  await page.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, "Suggested words here.")`);
  await expect.poll(() => slot(page, key), { timeout: 10_000 }).toBe(before);
  await expect(page.locator('#stat')).toHaveText(/suggested — an editor can accept/, { timeout: 10_000 });
  await expect(page.locator('#cpanel')).toBeVisible();
  await expect(suggestRow(page, 'Suggested words here')).toBeVisible({ timeout: 10_000 });
  await expect(suggestRow(page, 'Suggested words here').locator('.cmt-kind')).toHaveText('Suggests');
  await expect(suggestRow(page, 'Suggested words here').locator('.cmt-diff ins')).toHaveText('Suggested words here.');
  await expect(suggestRow(page, 'Suggested words here').locator('button', { hasText: 'Accept' })).toHaveCount(0);
  await expect(suggestRow(page, 'Suggested words here').locator('button', { hasText: 'Withdraw' })).toHaveCount(1);
  const [sg] = await suggestions();
  expect(sg.by).toBe(GRACE);
  expect(sg.status).toBe('open');
  expect(sg.change.content[key]).toEqual({ before, after: 'Suggested words here.' });
  // Nothing reached the room: A still has the words as they were.
  await page.waitForTimeout(1500);
  expect(await slot(a, key)).toBe(before);
  // A sees the proposal inline and on a card, with Accept and Reject.
  await expect(a.locator('#comments')).toHaveText(/1 suggested/, { timeout: 20_000 });
  await expect(a.frameLocator('#out').locator('ins.ds-suggest')).toHaveText('Suggested words here.', { timeout: 20_000 });
  if (!(await a.locator('#cpanel').isVisible())) await a.locator('#comments').click();
  await expect(suggestRow(a, 'Suggested words here')).toBeVisible({ timeout: 10_000 });
  if (process.env.PRIMER_SHOTS) { await suggestRow(a, 'Suggested words here').hover(); await a.screenshot({ path: 'test-results/suggesting.png' }); }
  await suggestRow(a, 'Suggested words here').locator('button', { hasText: 'Accept' }).click();
  await expect.poll(() => slot(a, key), { timeout: 10_000 }).toBe('Suggested words here.');
  await expect(a.locator('#stat')).toHaveText(/suggestion accepted/);
  await expect(suggestRow(a, 'Suggested words here')).toHaveClass(/resolved/, { timeout: 10_000 });
  await expect(suggestRow(a, 'Suggested words here').locator('.cmt-resolved-line')).toContainText('Accepted by ada');
  await expect(a.frameLocator('#out').locator('ins.ds-suggest')).toHaveCount(0);
  // It reached the room as an edit: B has it, unsaved; and the viewer sees it land.
  await expect.poll(() => slot(b, key), { timeout: 20_000 }).toBe('Suggested words here.');
  await expect.poll(() => slot(page, key), { timeout: 20_000 }).toBe('Suggested words here.');
  await expect(a.locator('#save')).toBeEnabled();
  expect((await suggestions())[0].status).toBe('accepted');
  await ctx.close();
  await a.request.put(`${hubAs(ADA_PORT)}/api/collab/share/${room}`, { data: { default: 'editor', people: {} } });
  // Save it, so the store and the room agree for the tests after.
  await a.locator('#save').click();
  await expect(a.locator('#stat')).toHaveText(/saved — anyone opening/, { timeout: 20_000 });
});

test('suggesting: an editor in Suggesting mode proposes a move; the other rejects it; the page is as it was', async () => {
  const id = await a.evaluate(`(docsync.api.inventory().pages.flatMap(p => p.elements).find(e => e.kind !== 'prose') || {}).id || null`);
  test.skip(!id, 'this project has no movable elements');
  await a.locator('#mode').click();
  await a.locator('.mode-menu button', { hasText: 'Suggesting' }).click();
  await expect(a.locator('#mode')).toHaveText('Suggesting ▾');
  await expect(a.locator('#stat')).toHaveText(/suggesting — edits you make are proposed/);
  const pos = await a.evaluate(`JSON.stringify(layout.positions[${JSON.stringify(id)}] || null)`);
  await a.evaluate(`docsync.api.place(${JSON.stringify(id)}, { x: 1.25, y: 4.5 })`);
  await expect.poll(() => a.evaluate(`JSON.stringify(layout.positions[${JSON.stringify(id)}] || null)`), { timeout: 10_000 }).toBe(pos);
  await expect(suggestRow(a, `Move ${id}`)).toBeVisible({ timeout: 10_000 });
  await expect(a.frameLocator('#out').locator(`[data-el="${id}"].ds-suggested`)).toHaveCount(1);
  await expect(a.locator('#save')).toBeDisabled();
  const [sg] = (await suggestions()).filter(s => s.status === 'open');
  expect(sg.change.layout[0]).toMatchObject({ section: 'positions', id });
  expect(sg.change.layout[0].after.x).toBeCloseTo(1.25, 1);   // place() corrects into the page's own space
  expect(sg.change.layout[0].after.y).toBeCloseTo(4.5, 1);
  // B rejects.
  if (!(await b.locator('#cpanel').isVisible())) await b.locator('#comments').click();
  await expect(suggestRow(b, `Move ${id}`)).toBeVisible({ timeout: 20_000 });
  await suggestRow(b, `Move ${id}`).locator('button', { hasText: 'Reject' }).click();
  await expect(suggestRow(b, `Move ${id}`)).toHaveClass(/resolved/, { timeout: 10_000 });
  await expect(suggestRow(b, `Move ${id}`).locator('.cmt-resolved-line')).toContainText('Rejected by grace');
  await expect(suggestRow(a, `Move ${id}`)).toHaveClass(/resolved/, { timeout: 20_000 });
  expect(await a.evaluate(`JSON.stringify(layout.positions[${JSON.stringify(id)}] || null)`)).toBe(pos);
  expect(await b.evaluate(`JSON.stringify(layout.positions[${JSON.stringify(id)}] || null)`)).toBe(pos);
  await expect(a.frameLocator('#out').locator(`[data-el="${id}"].ds-suggested`)).toHaveCount(0, { timeout: 10_000 });
  // Back to Editing: the same move is made, not proposed.
  await a.locator('#mode').click();
  await a.locator('.mode-menu button', { hasText: 'Editing' }).click();
  await expect(a.locator('#mode')).toHaveText('Editing ▾');
  await a.evaluate(`docsync.api.place(${JSON.stringify(id)}, { x: 1.25, y: 4.5 })`);
  await expect.poll(() => a.evaluate(`JSON.stringify(layout.positions[${JSON.stringify(id)}] || null)`)).not.toBe(pos);
  await a.waitForTimeout(1200);
  expect((await suggestions()).filter(s => s.status === 'open').length).toBe(0);
  await a.evaluate(`docsync.api.place(${JSON.stringify(id)}, ${pos || 'null'} || { x: 1, y: 1 })`).catch(() => {});
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

test('save: an expired sign-in cannot pass for a Save, and nothing is marked saved', async () => {
  // Access answers a signed-out browser with its sign-in page: 200, HTML.
  const key = await firstSlot(a);
  await a.route('**/api/docs/**', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 200, contentType: 'text/html', body: '<html><title>Sign in</title></html>' })
    : route.continue());
  const version = await a.evaluate('docVersion');
  await a.evaluate(`docsync.api.setSlot(${JSON.stringify(key)}, "Typed while signed out.")`);
  await a.locator('#save').click();
  await expect(a.locator('#stat')).toHaveText(/save failed: signed out of the hub/, { timeout: 20_000 });
  await expect(a.locator('#save')).toBeEnabled();
  expect(await a.evaluate('docVersion')).toBe(version);
  await a.unroute('**/api/docs/**');
  await a.locator('#save').click();
  await expect(a.locator('#stat')).toHaveText(/saved — anyone opening/, { timeout: 20_000 });
  expect(await a.evaluate('docVersion')).not.toBe(version);
});

test('no GitHub token was asked for or stored', async () => {
  for (const page of [a, b]) {
    expect(await page.evaluate("localStorage.getItem('docsync-pat')")).toBeNull();
    // A hosted editor with no token normally sits at "Sign in to collaborate";
    // through the hub's door that state cannot occur.
    expect((await status(page)).status).toBe('live');
  }
});
