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
let ctxA, ctxB, a, b;

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

test.beforeAll(async ({ browser }) => {
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
  // No draft branch and no Share link; Publish stays, as the export to git.
  await expect(a.locator('#share')).toBeHidden();
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

test('no GitHub token was asked for or stored', async () => {
  for (const page of [a, b]) {
    expect(await page.evaluate("localStorage.getItem('docsync-pat')")).toBeNull();
    // A hosted editor with no token normally sits at "Sign in to collaborate";
    // through the hub's door that state cannot occur.
    expect((await status(page)).status).toBe('live');
  }
});
