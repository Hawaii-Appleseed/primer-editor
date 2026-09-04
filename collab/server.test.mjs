/**
 * Phase 1 gate: the Worker + Durable Object actually relay a Yjs document,
 * and refuse everyone who should be refused.
 *
 *   npm test            (in collab/)   — unit + end-to-end
 *   COLLAB_E2E=0 npm test              — unit only, no wrangler
 *
 * The end-to-end half boots a real `wrangler dev` (Miniflare: real Durable
 * Objects, real websockets, real storage) and drives it with two independent
 * Yjs clients. Tickets are minted locally with the development signing secret,
 * so no GitHub call is involved — the GitHub half is unit-tested separately
 * against its own contract.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as Y from 'yjs';
import YProvider from 'y-partyserver/provider';
import { mintTicket, verifyTicket, parseRoom, formatRoom } from './src/auth.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_SECRET = 'dev-only-insecure-secret';
const PORT = Number(process.env.COLLAB_TEST_PORT || 8788);
const HOST = `127.0.0.1:${PORT}`;
const ROOM = formatRoom('dtomkatsu', 'primer-editor', 'demo-report');
const E2E = process.env.COLLAB_E2E !== '0';

/* ------------------------------------------------------------------ unit */

describe('room names', () => {
  test('round-trips', () => {
    assert.deepEqual(parseRoom(ROOM), {
      owner: 'dtomkatsu', repo: 'primer-editor', project: 'demo-report',
      nwo: 'dtomkatsu/primer-editor',
    });
  });

  test('refuses anything that is not exactly three parts', () => {
    for (const bad of ['', 'a', 'a~b', 'a~b~c~d', 'a~~c', '~b~c']) {
      assert.equal(parseRoom(bad), null, `should refuse ${JSON.stringify(bad)}`);
    }
  });

  test('refuses path and query characters that could escape the segment', () => {
    for (const bad of ['a~b~../etc', 'a~b~c/d', 'a~b~c?x=1', 'a/b~c~d', 'a~b~c#f']) {
      assert.equal(parseRoom(bad), null, `should refuse ${JSON.stringify(bad)}`);
    }
  });
});

describe('tickets', () => {
  test('a freshly minted ticket verifies for its own room', async () => {
    const t = await mintTicket(DEV_SECRET, { room: ROOM, login: 'me', ro: false, exp: now() + 60 });
    const p = await verifyTicket(DEV_SECRET, t, ROOM);
    assert.equal(p.login, 'me');
    assert.equal(p.ro, false);
  });

  test('is refused for a different room', async () => {
    const t = await mintTicket(DEV_SECRET, { room: ROOM, login: 'me', ro: false, exp: now() + 60 });
    const other = formatRoom('dtomkatsu', 'primer-editor', 'retitc');
    assert.equal(await verifyTicket(DEV_SECRET, t, other), null);
  });

  test('is refused once expired', async () => {
    const t = await mintTicket(DEV_SECRET, { room: ROOM, login: 'me', ro: false, exp: now() - 1 });
    assert.equal(await verifyTicket(DEV_SECRET, t, ROOM), null);
  });

  test('is refused under a different secret', async () => {
    const t = await mintTicket(DEV_SECRET, { room: ROOM, login: 'me', ro: false, exp: now() + 60 });
    assert.equal(await verifyTicket('some-other-secret', t, ROOM), null);
  });

  test('is refused when the payload is tampered with', async () => {
    const t = await mintTicket(DEV_SECRET, { room: ROOM, login: 'me', ro: true, exp: now() + 60 });
    const [body, sig] = t.split('.');
    const forged = Buffer.from(
      JSON.stringify({ room: ROOM, login: 'me', ro: false, exp: now() + 60 }))
      .toString('base64url');
    assert.equal(await verifyTicket(DEV_SECRET, `${forged}.${sig}`, ROOM), null);
    // and the original still verifies, so the test is testing the tamper
    assert.ok(await verifyTicket(DEV_SECRET, `${body}.${sig}`, ROOM));
  });

  test('malformed input is refused rather than throwing', async () => {
    for (const bad of [null, '', 'nodot', 'a.b.c', '!!!.???', 'x.']) {
      assert.equal(await verifyTicket(DEV_SECRET, bad, ROOM), null);
    }
  });
});

/* ------------------------------------------------------------------- e2e */

let dev = null;
let persistDir = null;

describe('end to end', { skip: E2E ? false : 'COLLAB_E2E=0' }, () => {
  before(async () => {
    persistDir = mkdtempSync(join(tmpdir(), 'primer-collab-'));
    dev = spawn('npx', [
      'wrangler', 'dev',
      '--ip', '127.0.0.1', '--port', String(PORT),
      '--persist-to', persistDir,
      '--log-level', 'warn',
    ], { cwd: HERE, stdio: ['ignore', 'pipe', 'pipe'] });

    const log = [];
    dev.stdout.on('data', d => log.push(String(d)));
    dev.stderr.on('data', d => log.push(String(d)));
    dev.on('exit', c => { if (c) log.push(`\n[wrangler exited ${c}]`); });

    const deadline = Date.now() + 90_000;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`wrangler dev did not come up in 90s:\n${log.join('')}`);
      }
      try {
        const r = await fetch(`http://${HOST}/health`);
        if (r.ok) break;
      } catch { /* not up yet */ }
      await sleep(400);
    }
  });

  after(async () => {
    if (dev && !dev.killed) { dev.kill('SIGTERM'); await sleep(500); dev.kill('SIGKILL'); }
    if (persistDir) rmSync(persistDir, { recursive: true, force: true });
  });

  test('health is public', async () => {
    const r = await fetch(`http://${HOST}/health`);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).service, 'primer-collab');
  });

  describe('POST /auth', () => {
    const ORIGIN = 'https://dtomkatsu.github.io';

    test('refuses an origin that is not on the list', async () => {
      const r = await post('/auth', { room: ROOM, token: 'x' }, 'https://evil.example');
      assert.equal(r.status, 403);
    });

    test('refuses a request with no Origin at all', async () => {
      const r = await fetch(`http://${HOST}/auth`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room: ROOM, token: 'x' }),
      });
      assert.equal(r.status, 403);
    });

    test('refuses a malformed room name', async () => {
      const r = await post('/auth', { room: 'not-a-room', token: 'x' }, ORIGIN);
      assert.equal(r.status, 400);
    });

    test('refuses a repository this Worker does not serve', async () => {
      const r = await post('/auth', { room: formatRoom('someone', 'else', 'proj'), token: 'x' }, ORIGIN);
      assert.equal(r.status, 403);
      assert.match((await r.json()).error, /not served here/);
    });

    test('refuses a missing token before calling GitHub', async () => {
      const r = await post('/auth', { room: ROOM }, ORIGIN);
      assert.equal(r.status, 400);
    });

    test('answers a preflight for an allowed origin only', async () => {
      const ok = await fetch(`http://${HOST}/auth`, {
        method: 'OPTIONS', headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
      });
      assert.equal(ok.status, 204);
      assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);

      const no = await fetch(`http://${HOST}/auth`, {
        method: 'OPTIONS', headers: { origin: 'https://evil.example' },
      });
      assert.equal(no.status, 403);
    });
  });

  describe('the websocket gate', () => {
    test('refuses a connection with no ticket', async () => {
      const res = await rawUpgrade(`/parties/primer-room/${ROOM}`);
      assert.equal(res.status, 401);
    });

    test('refuses a ticket minted for another room', async () => {
      const t = await mintTicket(DEV_SECRET, {
        room: formatRoom('dtomkatsu', 'primer-editor', 'retitc'),
        login: 'me', ro: false, exp: now() + 60,
      });
      const res = await rawUpgrade(`/parties/primer-room/${ROOM}?ticket=${encodeURIComponent(t)}`);
      assert.equal(res.status, 401);
    });

    test('refuses an expired ticket', async () => {
      const t = await ticketFor(ROOM, { exp: now() - 5 });
      const res = await rawUpgrade(`/parties/primer-room/${ROOM}?ticket=${encodeURIComponent(t)}`);
      assert.equal(res.status, 401);
    });

    test('refuses a malformed room name', async () => {
      const res = await rawUpgrade(`/parties/primer-room/nonsense?ticket=x`);
      assert.equal(res.status, 400);
    });
  });

  describe('two clients on one document', () => {
    test('converge on concurrent edits to the same and different slots', async () => {
      const room = uniqueRoom('converge');
      const a = await connect(room, 'ada');
      const b = await connect(room, 'grace');

      // Seed from A, the way the first browser into a room will.
      const blocks = a.doc.getArray('blocks');
      a.doc.transact(() => {
        for (const key of ['cover.title', 'page1.intro']) {
          const m = new Y.Map();
          m.set('kind', 'slot');
          m.set('key', key);
          m.set('text', new Y.Text(''));
          blocks.push([m]);
        }
        a.doc.getMap('meta').set('baseSha', 'a'.repeat(40));
      });
      await converged(a, b, d => d.getArray('blocks').length === 2);

      // Different slots at once — both must land.
      slotText(a.doc, 'cover.title').insert(0, 'Budget Primer');
      slotText(b.doc, 'page1.intro').insert(0, 'An introduction.');
      await converged(a, b, d =>
        String(slotText(d, 'cover.title')) === 'Budget Primer' &&
        String(slotText(d, 'page1.intro')) === 'An introduction.');

      // The same slot at once — this is the case last-writer-wins cannot do.
      slotText(a.doc, 'page1.intro').insert(0, 'A: ');
      slotText(b.doc, 'page1.intro').insert(16, ' Really.');
      await converged(a, b, d => {
        const s = String(slotText(d, 'page1.intro'));
        return s.includes('A: ') && s.includes('Really.');
      });

      const sa = String(slotText(a.doc, 'page1.intro'));
      const sb = String(slotText(b.doc, 'page1.intro'));
      assert.equal(sa, sb, 'the two clients must agree exactly');
      assert.match(sa, /A: /);
      assert.match(sa, /Really\./);

      // Layout: concurrent moves of DIFFERENT elements both survive.
      a.doc.getMap('layout').set('cover.logo', new Y.Map());
      await converged(a, b, d => d.getMap('layout').has('cover.logo'));
      a.doc.getMap('layout').get('cover.logo').set('x', 1.5);
      const other = new Y.Map();
      b.doc.getMap('layout').set('fig.3', other);
      await converged(a, b, d =>
        d.getMap('layout').get('cover.logo')?.get('x') === 1.5 &&
        d.getMap('layout').has('fig.3'));

      await disconnect(a, b);
    });

    test('exactly one connection is granted the seed', async () => {
      const room = uniqueRoom('seed');
      const a = await connect(room, 'ada');
      const b = await connect(room, 'grace');

      const [ra, rb] = await Promise.all([claimSeed(a), claimSeed(b)]);
      const granted = [ra, rb].filter(r => r.granted).length;
      assert.equal(granted, 1, 'exactly one client may seed the room');

      // The winner declares it done; a client arriving later is told the room
      // is already seeded and must not offer to seed it again.
      const winner = ra.granted ? a : b;
      winner.provider.sendMessage(JSON.stringify({ t: 'seeded' }));
      await sleep(300);

      const c = await connect(room, 'linus');
      const rc = await claimSeed(c);
      assert.equal(rc.granted, false);
      assert.equal(rc.seeded, true);

      await disconnect(a, b, c);
    });

    test('the document survives every client leaving', async () => {
      const room = uniqueRoom('persist');
      const a = await connect(room, 'ada');
      a.doc.transact(() => {
        const m = new Y.Map();
        m.set('kind', 'slot');
        m.set('key', 'cover.title');
        m.set('text', new Y.Text('Persisted across a restart'));
        a.doc.getArray('blocks').push([m]);
        a.doc.getMap('meta').set('baseSha', 'b'.repeat(40));
      });
      // y-partyserver debounces onSave; give it more than debounceWait.
      await sleep(4500);
      await disconnect(a);
      await sleep(1500);

      const b = await connect(room, 'grace');
      await waitFor(() => b.doc.getArray('blocks').length === 1, 15_000,
        'the reconnecting client never received the stored document');
      assert.equal(String(slotText(b.doc, 'cover.title')), 'Persisted across a restart');
      assert.equal(b.doc.getMap('meta').get('baseSha'), 'b'.repeat(40));
      await disconnect(b);
    });

    test('a read-only ticket cannot change the document', async () => {
      const room = uniqueRoom('readonly');
      const writer = await connect(room, 'ada');
      const reader = await connect(room, 'guest', { ro: true });

      slotText2(writer.doc, 'only').insert(0, 'written');
      await waitFor(() => String(slotText2(reader.doc, 'only')) === 'written', 10_000,
        'the reader never received the writer\'s change');

      slotText2(reader.doc, 'only').insert(0, 'NOPE ');
      await sleep(1200);
      assert.equal(String(slotText2(writer.doc, 'only')), 'written',
        'a read-only connection must not be able to write');

      await disconnect(writer, reader);
    });
  });
});

/* --------------------------------------------------------------- helpers */

const now = () => Math.floor(Date.now() / 1000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let roomSeq = 0;
const uniqueRoom = tag =>
  formatRoom('dtomkatsu', 'primer-editor', `t-${tag}-${Date.now()}-${roomSeq++}`);

function post(path, body, origin) {
  return fetch(`http://${HOST}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

/**
 * Attempt a websocket upgrade and resolve with the status, so a refusal can be
 * asserted as a status code rather than an opaque socket error.
 *
 * Uses node:http rather than fetch: undici treats `Connection` and `Upgrade`
 * as forbidden headers and fails the request before it leaves the process, so
 * a fetch-based version of this helper silently tests nothing.
 */
function rawUpgrade(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, path, method: 'GET',
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'sec-websocket-version': '13',
      },
    });
    // The server answered instead of upgrading — a refusal.
    req.on('response', res => { res.resume(); resolve({ status: res.statusCode }); });
    // The server upgraded — acceptance.
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve({ status: res.statusCode || 101 }); });
    req.on('error', reject);
    req.end();
  });
}

const ticketFor = (room, over = {}) =>
  mintTicket(DEV_SECRET, { room, login: 'tester', ro: false, exp: now() + 120, ...over });

async function connect(room, login, opts = {}) {
  const ticket = await ticketFor(room, { login, ...opts });
  const doc = new Y.Doc();
  const provider = new YProvider(HOST, room, doc, {
    party: 'primer-room',
    params: { ticket },
    connect: true,
  });
  const client = { doc, provider, login };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${login} never synced to ${room}`)), 20_000);
    const done = () => { clearTimeout(timer); resolve(); };
    if (provider.synced) return done();
    provider.on('synced', done);
  });
  return client;
}

async function disconnect(...clients) {
  for (const c of clients) { try { c.provider.destroy(); } catch { /* already gone */ } }
  await sleep(200);
}

function claimSeed(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no seed-claim-result')), 10_000);
    const onMsg = raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t !== 'seed-claim-result') return;
      clearTimeout(timer);
      client.provider.off('custom-message', onMsg);
      resolve(m);
    };
    client.provider.on('custom-message', onMsg);
    client.provider.sendMessage(JSON.stringify({ t: 'seed-claim' }));
  });
}

/** The Y.Text of a slot block, by key — the Phase 0 document shape. */
function slotText(doc, key) {
  for (const m of doc.getArray('blocks')) {
    if (m.get('key') === key) return m.get('text');
  }
  throw new Error(`no slot block for ${key}`);
}

/** A bare Y.Text at the document root, for tests that don't need block shape. */
const slotText2 = (doc, key) => doc.getText(key);

async function waitFor(pred, ms, message) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await sleep(100);
  }
  throw new Error(message || 'condition never became true');
}

const converged = (a, b, pred) =>
  waitFor(() => pred(a.doc) && pred(b.doc), 15_000,
    'the two clients did not converge in 15s');
