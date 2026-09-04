/**
 * Phase 2 gate: the editor-side mirror.
 *
 *   npm test            (in collab/)   — unit + end-to-end
 *   COLLAB_E2E=0 npm test              — unit only, no wrangler
 *
 * Unit: the plain⇄Y bridge round-trips every project in this repo byte for
 * byte, local writes are minimal diffs (a slot edit keeps its Y.Text; a
 * layout move touches one key), and undo is scoped to local edits.
 *
 * End to end: two CollabSessions against a real `wrangler dev`, exercising
 * the seed handshake, convergence through the mirror API the editor actually
 * calls (flush / onFiles), the busy hold, and reconnection.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as Y from 'yjs';
import {
  CollabSession, ORIGIN, writeFiles, filesFromY, docFromY, applyText,
  syncMap, syncArray, syncBlocks, deepEqual, toY,
} from './client/session.mjs';
import { parseContent, serializeContent } from './serialize.mjs';
import { mintTicket, formatRoom } from './src/auth.js';
import { startDev } from './devserver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DEV_SECRET = 'dev-only-insecure-secret';
const PORT = Number(process.env.COLLAB_TEST_PORT || 8789);
const HOST = `127.0.0.1:${PORT}`;
const E2E = process.env.COLLAB_E2E !== '0';

/* ---------------------------------------------------------------- fixtures */

function projects() {
  const out = [];
  const dirs = [join(ROOT, 'report2027'), ...readdirSync(join(ROOT, 'projects'))
    .map(d => join(ROOT, 'projects', d))];
  for (const d of dirs) {
    const c = join(d, 'content.md'), l = join(d, 'layout.json');
    if (existsSync(c)) {
      out.push({ id: d.split('/').pop(), content: readFileSync(c, 'utf8'),
                 layout: existsSync(l) ? readFileSync(l, 'utf8') : '{}' });
    }
  }
  return out;
}

const seeded = (files) => {
  const d = new Y.Doc();
  d.transact(() => writeFiles(d, files), ORIGIN.SEED);
  return d;
};

/* -------------------------------------------------------------------- unit */

describe('plain <-> Y bridge', () => {
  const all = projects();
  test('finds the projects', () => assert.ok(all.length >= 5, `${all.length} projects`));

  for (const p of all) {
    test(`${p.id}: content is byte-identical and layout deep-equal after a round trip`, () => {
      const d = seeded(p);
      const f = filesFromY(d);
      assert.equal(f.content, p.content);
      const want = JSON.parse(p.layout || '{}');
      want.positions = want.positions || {}; want.shapes = want.shapes || []; want.sections = want.sections || {};
      assert.ok(deepEqual(f.layout, want), 'layout deep-equal (after the editor\'s own normalisation)');
    });
  }

  test('writing the same files again changes nothing', () => {
    const p = all[0];
    const d = seeded(p);
    let changed = true;
    d.transact(() => { changed = writeFiles(d, p); }, ORIGIN.LOCAL);
    assert.equal(changed, false);
  });

  test('a slot edit keeps its Y.Text and every other block untouched', () => {
    const p = all.find(x => x.id === 'report2027') || all[0];
    const d = seeded(p);
    const blocks = d.getArray('blocks');
    const before = blocks.toArray();
    const key = before.find(m => m.get('kind') === 'slot' && String(m.get('text')).length > 20).get('key');
    const ytext = before.find(m => m.get('key') === key).get('text');

    const doc = parseContent(p.content);
    const b = doc.blocks.find(x => x.key === key);
    b.text = b.text.slice(0, 10) + 'INSERTED ' + b.text.slice(10);
    const content = serializeContent(doc);

    let changed;
    d.transact(() => { changed = writeFiles(d, { content, layout: p.layout }); }, ORIGIN.LOCAL);
    assert.equal(changed, true);
    const after = blocks.toArray();
    assert.equal(after.length, before.length);
    after.forEach((m, i) => assert.equal(m, before[i], `block ${i} is the same Y.Map`));
    assert.equal(after.find(m => m.get('key') === key).get('text'), ytext, 'same Y.Text instance');
    assert.equal(filesFromY(d).content, content);
  });

  test('applyText is a single delete+insert around the change and never splits a surrogate pair', () => {
    const d = new Y.Doc();
    const t = d.getText('t');
    t.insert(0, 'Hawaiʻi 🌺 budget');
    let events = [];
    t.observe(e => events.push(e.delta));
    d.transact(() => applyText(t, 'Hawaiʻi 🌴 budget!'));
    assert.equal(t.toString(), 'Hawaiʻi 🌴 budget!');
    assert.equal(events.length, 1);
    // Two ops at most: the delete and the insert.
    const ops = events[0].filter(o => o.insert !== undefined || o.delete !== undefined);
    assert.ok(ops.length <= 2, JSON.stringify(events[0]));
    assert.equal(applyText(t, t.toString()), false);
  });

  test('a layout move sets one key; adding a shape splices one entry', () => {
    const d = new Y.Doc();
    const layout = { positions: { 'cover.logo': { x: 1, y: 2 }, 'fig.3': { x: 4, y: 5 } },
                     shapes: [{ id: 's1', x: 0 }, { id: 's2', x: 1 }], sections: {} };
    d.transact(() => syncMap(d.getMap('layout'), layout));
    const lm = d.getMap('layout');
    const logo = lm.get('positions').get('cover.logo');
    const shapes = lm.get('shapes');
    const s1 = shapes.get(0);

    const moved = structuredClone(layout);
    moved.positions['cover.logo'].x = 3.25;
    d.transact(() => syncMap(lm, moved));
    assert.equal(lm.get('positions').get('cover.logo'), logo, 'same nested Y.Map');
    assert.equal(logo.get('x'), 3.25);

    const added = structuredClone(moved);
    added.shapes.splice(1, 0, { id: 'new', x: 9 });
    d.transact(() => syncMap(lm, added));
    assert.equal(shapes.length, 3);
    assert.equal(shapes.get(0), s1, 'untouched entries keep their Y.Map');
    assert.equal(shapes.get(1).get('id'), 'new');
    assert.ok(deepEqual(lm.toJSON(), added));

    const removed = structuredClone(added);
    removed.shapes.pop();
    d.transact(() => syncMap(lm, removed));
    assert.ok(deepEqual(lm.toJSON(), removed));
  });

  test('syncArray on equal lengths recurses; on scalars replaces', () => {
    const d = new Y.Doc();
    const a = d.getArray('a');
    d.transact(() => syncArray(a, [1, 2, 3]));
    d.transact(() => syncArray(a, [1, 9, 3]));
    assert.deepEqual(a.toJSON(), [1, 9, 3]);
    d.transact(() => syncArray(a, [[1], { k: 1 }]));
    d.transact(() => syncArray(a, [[1, 2], { k: 2 }]));
    assert.deepEqual(a.toJSON(), [[1, 2], { k: 2 }]);
  });

  test('syncBlocks replaces only moved/added/removed blocks', () => {
    const d = new Y.Doc();
    const blocks = d.getArray('blocks');
    const mk = (key, text = key) => ({ kind: 'slot', key, pad: '', lead: '', text, gap: '\n\n' });
    d.transact(() => syncBlocks(blocks, [mk('a'), mk('b'), mk('c'), mk('d')]));
    const [ya, yb, yc, yd] = blocks.toArray();
    // move d before b, drop c, add e at the end
    d.transact(() => syncBlocks(blocks, [mk('a'), mk('d'), mk('b'), mk('e')]));
    assert.deepEqual(blocks.toArray().map(m => m.get('key')), ['a', 'd', 'b', 'e']);
    const now = blocks.toArray();
    assert.equal(now[0], ya);
    assert.equal(now[2], yb, 'b kept its identity');
    assert.notEqual(now[1], yd, 'the moved block is a fresh map');
    assert.ok(!now.includes(yc));
  });

  test('notes and the preamble survive local writes', () => {
    const content = '<!-- head -->\n\n[[a]]\nA text\n\n<!-- trailing -->\n\n[[b]]\nB\n';
    const d = seeded({ content, layout: '{}' });
    assert.equal(filesFromY(d).content, content);
    const edited = content.replace('A text', 'A longer text');
    d.transact(() => writeFiles(d, { content: edited, layout: '{}' }), ORIGIN.LOCAL);
    assert.equal(filesFromY(d).content, edited);
    assert.equal(docFromY(d).blocks.filter(b => b.kind === 'note').length, 1);
  });

  test('toY turns nested JSON into nested Y types', () => {
    const y = toY({ a: [1, { b: 2 }], c: 'x' });
    assert.ok(y instanceof Y.Map);
    const d = new Y.Doc(); d.getMap('m').set('v', y);
    assert.deepEqual(d.getMap('m').get('v').toJSON(), { a: [1, { b: 2 }], c: 'x' });
  });
});

describe('an offline session (no provider connection)', () => {
  const p = projects()[0];
  const make = () => new CollabSession({
    host: HOST, room: formatRoom('dtomkatsu', 'primer-editor', 'offline'),
    ticket: async () => 'unused', files: p, connect: false,
  });

  test('flush is a no-op before the room is ready', () => {
    const s = make();
    assert.equal(s.flush(p), false);
    assert.equal(s.shadow.getArray('blocks').length, 0);
    s.close();
  });

  test('undo is scoped to local marks; remote edits are never undone', () => {
    const s = make();
    // Stand in for the handshake: seed and declare ready.
    s.shadow.transact(() => writeFiles(s.shadow, p), ORIGIN.SEED);
    s.state = { ...s.state, phase: 'ready' };
    assert.equal(s.canUndo(), false);

    const doc = parseContent(p.content);
    const slot = doc.blocks.find(b => b.kind === 'slot' && b.text);
    const orig = slot.text;

    s.mark();
    slot.text = orig + ' one';
    assert.equal(s.flush({ content: serializeContent(doc), layout: p.layout }), true);
    // Same step: no mark between.
    slot.text = orig + ' one two';
    s.flush({ content: serializeContent(doc), layout: p.layout });
    s.mark();
    slot.text = orig + ' one two three';
    s.flush({ content: serializeContent(doc), layout: p.layout });
    assert.equal(s.undoManager.undoStack.length, 2, 'two marks -> two undo steps');

    // A "remote" edit lands in a different slot.
    const other = s.shadow.getArray('blocks').toArray()
      .find(m => m.get('kind') === 'slot' && m.get('key') !== slot.key);
    s.shadow.transact(() => other.get('text').insert(0, 'REMOTE '), ORIGIN.REMOTE);

    let f = s.undo();
    assert.ok(f.content.includes(orig + ' one two\n') || f.content.includes(orig + ' one two'), 'first undo drops " three"');
    f = s.undo();
    assert.ok(!f.content.includes(orig + ' one'), 'second undo drops the whole first step');
    assert.ok(String(other.get('text')).startsWith('REMOTE '), 'the remote edit survives both undos');
    assert.equal(s.canUndo(), false);
    f = s.redo();
    assert.ok(f.content.includes(orig + ' one two'));
    s.close();
  });

  test('a flush that changes nothing creates no undo step', () => {
    const s = make();
    s.shadow.transact(() => writeFiles(s.shadow, p), ORIGIN.SEED);
    s.state = { ...s.state, phase: 'ready' };
    s.mark();
    assert.equal(s.flush(p), false);
    assert.equal(s.canUndo(), false);
    s.close();
  });
});

/* --------------------------------------------------------------------- e2e */

let dev = null;

describe('two editors on one room', { skip: E2E ? false : 'COLLAB_E2E=0' }, () => {
  before(async () => { dev = await startDev({ port: PORT }); });
  after(async () => { if (dev) await dev.stop(); });

  const p = projects().find(x => x.id === 'report2027') || projects()[0];
  let seq = 0;
  const uniqueRoom = tag => formatRoom('dtomkatsu', 'primer-editor', `c-${tag}-${Date.now()}-${seq++}`);
  const ticketFor = (room, login) => async () =>
    mintTicket(DEV_SECRET, { room, login, ro: false, exp: Math.floor(Date.now() / 1000) + 120 });

  function open(room, login, files, extra = {}) {
    const got = [];
    const s = new CollabSession({
      host: HOST, room, login, files, ticket: ticketFor(room, login), debug: true,
      onFiles: (f, why) => got.push({ f, why }), ...extra,
    });
    s.got = got;
    return s;
  }

  test('the first editor seeds, the second adopts, and both hold the same bytes', async () => {
    const room = uniqueRoom('seed');
    const a = open(room, 'ada', p);
    await a.ready;
    assert.equal(a.state.phase, 'ready');
    assert.equal(a.state.seededBy, 'ada');
    assert.equal(a.got[0].why, 'adopt');
    assert.equal(a.got[0].f.content, p.content);

    const b = open(room, 'grace', { content: '[[x]]\nnot what the room holds\n', layout: '{}' });
    await b.ready;
    assert.equal(b.got[0].why, 'adopt');
    assert.equal(b.got[0].f.content, p.content, 'the room wins over the late arriver\'s files');
    assert.equal(b.baseSha(), null);
    await waitFor(() => a.state.peers === 2 && b.state.peers === 2, 5000, 'presence never showed two');
    assert.deepEqual(a.state.here, ['grace']);
    a.close(); b.close();
  });

  test('edits flow through flush/onFiles and converge, including the same slot', async () => {
    const room = uniqueRoom('converge');
    const a = open(room, 'ada', p);
    await a.ready;
    const b = open(room, 'grace', p);
    await b.ready;

    const docA = parseContent(p.content), docB = parseContent(p.content);
    const key = docA.blocks.find(x => x.kind === 'slot' && x.text.length > 20).key;
    const slotA = docA.blocks.find(x => x.key === key), slotB = docB.blocks.find(x => x.key === key);

    slotA.text = 'A: ' + slotA.text;
    slotB.text = slotB.text + ' (B)';
    a.mark(); a.flush({ content: serializeContent(docA), layout: p.layout });
    b.mark(); b.flush({ content: serializeContent(docB), layout: p.layout });

    await waitFor(() => {
      const fa = a.files().content, fb = b.files().content;
      return fa === fb && fa.includes('A: ') && fa.includes(' (B)');
    }, 10_000, 'the two sessions never converged on the shared slot');

    const lastA = a.got[a.got.length - 1], lastB = b.got[b.got.length - 1];
    assert.equal(lastA.why, 'remote'); assert.equal(lastB.why, 'remote');
    assert.equal(lastA.f.content, lastB.f.content);
    // Merged text: both edits, in one slot, nobody's lost.
    const merged = parseContent(lastA.f.content).blocks.find(x => x.key === key).text;
    assert.ok(merged.startsWith('A: ') && merged.endsWith(' (B)'), merged);

    // Layout: two different elements at once.
    const la = JSON.parse(p.layout), lb = JSON.parse(p.layout);
    la.positions = la.positions || {}; lb.positions = lb.positions || {};
    la.positions['cover.logo'] = { x: 1.5, y: 2 };
    lb.positions['fig.3'] = { x: 4, y: 4 };
    a.flush({ content: lastA.f.content, layout: la });
    b.flush({ content: lastB.f.content, layout: lb });
    await waitFor(() => {
      const l = a.files().layout, m = b.files().layout;
      return deepEqual(l, m) && l.positions['cover.logo']?.x === 1.5 && l.positions['fig.3']?.x === 4;
    }, 10_000, 'layout moves never converged');
    a.close(); b.close();
  });

  test('a remote edit is held while the editor is busy and lands when it is not', async () => {
    const room = uniqueRoom('busy');
    let busy = false;
    const a = open(room, 'ada', p, { busy: () => busy });
    await a.ready;
    const b = open(room, 'grace', p);
    await b.ready;

    busy = true;
    const docB = parseContent(p.content);
    const slot = docB.blocks.find(x => x.kind === 'slot' && x.text.length > 20);
    slot.text = 'B typed. ' + slot.text;
    b.flush({ content: serializeContent(docB), layout: p.layout });
    await sleep(1500);
    assert.ok(!a.files().content.includes('B typed.'), 'held while busy');
    assert.ok(a.net.getArray('blocks').length > 0, 'but the net doc has it');
    assert.equal(a.got.length, 1, 'no onFiles while busy');

    // Meanwhile A commits an edit to a DIFFERENT slot from its (older) view.
    const docA = parseContent(p.content);
    const other = docA.blocks.find(x => x.kind === 'slot' && x.key !== slot.key && x.text.length > 5);
    other.text = other.text + ' [A]';
    a.mark(); a.flush({ content: serializeContent(docA), layout: p.layout });

    busy = false;
    await waitFor(() => a.files().content.includes('B typed.') && b.files().content.includes(' [A]'),
      10_000, 'the held update never landed / A\'s edit never reached B');
    assert.equal(a.files().content, b.files().content);
    a.close(); b.close();
  });

  test('a session that reconnects does not re-seed and picks up what it missed', async () => {
    const room = uniqueRoom('reconnect');
    const a = open(room, 'ada', p);
    await a.ready;
    const b = open(room, 'grace', p);
    await b.ready;

    // A dropped connection, as the provider sees one: its socket's close
    // event. (Not provider.disconnect(): under Miniflare the server never
    // completes the close handshake, so the socket sits in CLOSING forever and
    // the provider — correctly — treats it as still connected.) The provider's
    // own reconnect logic takes it from here, fresh ticket included.
    const dropped = a.provider.ws;
    dropped.dispatchEvent(new Event('close'));
    dropped.close();   // a CLOSING socket delivers no more messages
    await waitFor(() => a.state.status === 'offline', 5000, 'never went offline');
    const docB = parseContent(p.content);
    const slot = docB.blocks.find(x => x.kind === 'slot' && x.text.length > 20);
    slot.text = slot.text + ' while A was away';
    b.flush({ content: serializeContent(docB), layout: p.layout });
    // (No "A must not see it yet" here: the provider's first reconnect fires
    // after 100ms, so by now A is usually back — which is the point.)

    await waitFor(() => a.state.status === 'live' && a.files().content.includes('while A was away'),
      15_000, 'A never caught up after reconnecting');
    assert.equal(a.shadow.getArray('blocks').length, b.shadow.getArray('blocks').length, 'no duplicate blocks');
    assert.equal(a.files().content, b.files().content);
    a.close(); b.close();
  });

  test('baseSha rides in meta and is not an undo step', async () => {
    const room = uniqueRoom('sha');
    const a = open(room, 'ada', p, { baseSha: 'a'.repeat(40) });
    await a.ready;
    const b = open(room, 'grace', p);
    await b.ready;
    assert.equal(b.baseSha(), 'a'.repeat(40));
    b.setBaseSha('b'.repeat(40));
    assert.equal(b.canUndo(), false);
    await waitFor(() => a.baseSha() === 'b'.repeat(40), 5000, 'baseSha never propagated');
    a.close(); b.close();
  });
});

/* ------------------------------------------------------------------ helpers */

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(pred, ms, what) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return;
    await sleep(50);
  }
  throw new Error(what);
}
