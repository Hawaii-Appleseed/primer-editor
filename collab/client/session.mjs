/**
 * Phase 2 — the browser side of real-time collaboration.
 *
 * edit.html keeps its whole editing state in two plain values, `source` (the
 * content.md text) and `layout` (the parsed layout.json), and mutates them
 * from ~250 places before calling the one render(). Rewriting every one of
 * those sites against Y types would be a rewrite of the editor. So the editor
 * keeps its values, and this module MIRRORS them:
 *
 *   editor  --flush(files)-->  shadow Y.Doc  --update-->  net Y.Doc  --ws-->  room
 *   editor  <--onFiles(files)--  shadow Y.Doc  <--update--  net Y.Doc  <--ws--  room
 *
 * Why two documents. A local change is computed as a DIFF between what the
 * editor holds and what it last saw, and that diff is expressed as positions
 * into slot text. Positions are only meaningful against the exact document
 * the editor's copy was derived from — and the network document moves under
 * a remote edit at any moment, in particular while someone is mid-sentence
 * in a contenteditable and has not committed yet. The shadow document is a
 * replica that only advances when the editor is ready to look (`busy()` is
 * false), so a diff is always applied to precisely the text it was computed
 * against; Yjs then merges the resulting update into the network document
 * against whatever arrived meanwhile — which is the CRDT doing the one thing
 * it exists to do. The alternative (transforming positions through the
 * remote delta by hand) is re-implementing Yjs badly.
 *
 * Undo lives on the shadow document as a Y.UndoManager tracking the LOCAL
 * origin only: undo steps are this person's edits, never a collaborator's,
 * and a remote edit interleaved with one of ours is handled by Yjs rather
 * than by a snapshot restore that would silently revert it.
 *
 * Document shape (Phase 0's, as Y types — see ../serialize.mjs):
 *
 *   blocks: Y.Array<Y.Map>   slot: {kind, key, pad, lead, text: Y.Text, gap}
 *                            note: {kind, raw}
 *   layout: Y.Map            nested Y.Map / Y.Array; leaves are JSON scalars
 *   meta:   Y.Map            {preamble, baseSha}
 *
 * Phase 4 adds three things on top of that shape, none of which change it:
 *
 *   - `beforeRemote()` runs just before a collaborator's update is replayed
 *     onto the shadow, so an editor holding text OUTSIDE its `source` (an
 *     open paragraph) can flush it first — the diff is then against the text
 *     it was typed into, and Yjs merges the two as concurrent operations.
 *   - `onBaseSha(sha)` fires when a collaborator records a Save in `meta`,
 *     so every editor in the room knows the document is now on the branch.
 *   - `cursorAt()` / `resolveCursor()` turn a caret offset into a slot's
 *     markdown into a Y.RelativePosition and back. A relative position names
 *     a character, not an index, so it stays put while text is inserted and
 *     deleted around it — on this side and on every other.
 *
 * This file is bundled into docsync/editor/collab-client.js by build-client.mjs
 * and also imported directly by the Node tests (client.test.mjs).
 */
import * as Y from 'yjs';
import YProvider from 'y-partyserver/provider';
import {
  parseContent, serializeContent, serializeLayout, assertWellFormed,
} from '../serialize.mjs';

export const ORIGIN = Object.freeze({
  LOCAL: 'collab:local',     // the editor's own edits — the only tracked origin
  REMOTE: 'collab:remote',   // a collaborator's edit, replayed onto the shadow
  SEED: 'collab:seed',       // the first client populating an empty room
  META: 'collab:meta',       // baseSha bookkeeping; never an undo step
  SHADOW: 'collab:shadow',   // a shadow update replayed onto the net doc
});

/* ------------------------------------------------------------ plain <-> Y */

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!(k in b) || !deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** A JSON value as the Y type that lets two people change different parts
 *  of it at once: objects become Y.Map, arrays Y.Array, scalars stay. */
export function toY(v) {
  if (Array.isArray(v)) { const a = new Y.Array(); a.push(v.map(toY)); return a; }
  if (isObj(v)) { const m = new Y.Map(); for (const k of Object.keys(v)) m.set(k, toY(v[k])); return m; }
  return v;
}

function blockToY(b) {
  const m = new Y.Map();
  m.set('kind', b.kind);
  if (b.kind === 'note') { m.set('raw', b.raw); return m; }
  m.set('key', b.key);
  m.set('pad', b.pad ?? '');
  m.set('lead', b.lead ?? '');
  m.set('text', new Y.Text(b.text ?? ''));
  m.set('gap', b.gap ?? '');
  return m;
}

function blockFromY(m) {
  if (m.get('kind') === 'note') return { kind: 'note', raw: m.get('raw') ?? '' };
  return {
    kind: 'slot', key: m.get('key'), pad: m.get('pad') ?? '', lead: m.get('lead') ?? '',
    text: String(m.get('text') ?? ''), gap: m.get('gap') ?? '',
  };
}

/** The Y document as Phase 0's plain shape. */
export function docFromY(ydoc) {
  return {
    preamble: ydoc.getMap('meta').get('preamble') ?? '',
    blocks: ydoc.getArray('blocks').toArray().map(blockFromY),
    layout: ydoc.getMap('layout').toJSON(),
  };
}

/** {content, layout} — the two file bodies — from a Y document. */
export function filesFromY(ydoc) {
  const d = docFromY(ydoc);
  return { content: serializeContent(d), layout: d.layout, layoutText: serializeLayout(d.layout) };
}

/* ----------------------------------------------------------- text diffs */

const isHigh = c => c >= 0xD800 && c <= 0xDBFF;
const isLow = c => c >= 0xDC00 && c <= 0xDFFF;

/**
 * Turn `prev` into `next` on a Y.Text as ONE delete + ONE insert around the
 * changed span — a common prefix and suffix are left untouched, which is what
 * lets a collaborator's concurrent insert elsewhere in the same paragraph
 * survive. Never splits a surrogate pair.
 */
export function applyText(ytext, next) {
  const prev = ytext.toString();
  if (prev === next) return false;
  const max = Math.min(prev.length, next.length);
  let p = 0;
  while (p < max && prev.charCodeAt(p) === next.charCodeAt(p)) p++;
  if (p > 0 && isHigh(prev.charCodeAt(p - 1))) p--;
  let s = 0;
  while (s < max - p && prev.charCodeAt(prev.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
  if (s > 0 && isLow(prev.charCodeAt(prev.length - s))) s--;
  const del = prev.length - p - s;
  const ins = next.slice(p, next.length - s);
  if (del) ytext.delete(p, del);
  if (ins) ytext.insert(p, ins);
  return true;
}

/* --------------------------------------------------------- layout diffs */

/** Make `ymap` equal the plain object `obj`, touching only what differs. */
export function syncMap(ymap, obj) {
  let changed = false;
  for (const k of [...ymap.keys()]) {
    if (!(k in obj)) { ymap.delete(k); changed = true; }
  }
  for (const k of Object.keys(obj)) {
    const nv = obj[k];
    const ov = ymap.get(k);
    if (ov instanceof Y.Map && isObj(nv)) { if (syncMap(ov, nv)) changed = true; }
    else if (ov instanceof Y.Array && Array.isArray(nv)) { if (syncArray(ov, nv)) changed = true; }
    else if (!(ov instanceof Y.AbstractType) && !isObj(nv) && !Array.isArray(nv) && ov === nv) { /* same */ }
    else { ymap.set(k, toY(nv)); changed = true; }
  }
  return changed;
}

/**
 * Make `yarr` equal the plain array `arr`.
 *
 * Same length: element by element, recursing into maps — so two people moving
 * two different shapes (one array, two entries) both land. Different length:
 * the equal prefix and suffix are kept and only the middle is spliced, which
 * is exactly one shape added or removed anywhere in the list.
 */
export function syncArray(yarr, arr) {
  const old = yarr.toJSON();
  if (old.length === arr.length) {
    let changed = false;
    for (let i = 0; i < arr.length; i++) {
      const ov = yarr.get(i), nv = arr[i];
      if (ov instanceof Y.Map && isObj(nv)) { if (syncMap(ov, nv)) changed = true; }
      else if (ov instanceof Y.Array && Array.isArray(nv)) { if (syncArray(ov, nv)) changed = true; }
      else if (!deepEqual(old[i], nv)) { yarr.delete(i, 1); yarr.insert(i, [toY(nv)]); changed = true; }
    }
    return changed;
  }
  let p = 0;
  while (p < old.length && p < arr.length && deepEqual(old[p], arr[p])) p++;
  let s = 0;
  while (s < old.length - p && s < arr.length - p
         && deepEqual(old[old.length - 1 - s], arr[arr.length - 1 - s])) s++;
  yarr.delete(p, old.length - p - s);
  yarr.insert(p, arr.slice(p, arr.length - s).map(toY));
  return true;
}

/* ---------------------------------------------------------- block diffs */

const blockId = b => b.kind === 'note' ? `note:${b.raw}` : `slot:${b.key}`;

/** Indices forming a longest increasing subsequence of `xs` (−1 = absent). */
function lis(xs) {
  const tails = [], tailIdx = [], prev = new Array(xs.length).fill(-1);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    if (x < 0) continue;
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; }
    tails[lo] = x; tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  }
  const out = [];
  for (let i = tailIdx.length ? tailIdx[tailIdx.length - 1] : -1; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/**
 * Make the Y block list equal `blocks` (Phase 0's plain list).
 *
 * A slot that exists on both sides keeps its Y.Map — and so its Y.Text, and
 * so any collaborator's concurrent typing in it. Only blocks that were added,
 * removed or MOVED are replaced: the longest run of blocks already in the
 * right order stays put, everything else is deleted and re-inserted fresh.
 * That makes the common case (typing) a text diff, and the rare case (a
 * section moved, added or renamed) touch only the blocks involved.
 */
export function syncBlocks(yblocks, blocks) {
  const old = yblocks.toArray().map(blockFromY);
  const oldIdx = new Map();
  old.forEach((b, i) => {
    const id = blockId(b);
    if (!oldIdx.has(id)) oldIdx.set(id, []);
    oldIdx.get(id).push(i);
  });
  const newToOld = blocks.map(b => {
    const q = oldIdx.get(blockId(b));
    return q && q.length ? q.shift() : -1;
  });
  const kept = new Set(lis(newToOld).map(ni => newToOld[ni]));
  let changed = false;
  for (let i = old.length - 1; i >= 0; i--) {
    if (!kept.has(i)) { yblocks.delete(i, 1); changed = true; }
  }
  let j = 0;
  blocks.forEach((b, ni) => {
    const oi = newToOld[ni];
    if (oi !== -1 && kept.has(oi)) {
      const m = yblocks.get(j++);
      if (b.kind === 'slot') {
        for (const f of ['pad', 'lead', 'gap']) {
          if ((m.get(f) ?? '') !== (b[f] ?? '')) { m.set(f, b[f] ?? ''); changed = true; }
        }
        let t = m.get('text');
        if (!(t instanceof Y.Text)) { t = new Y.Text(''); m.set('text', t); changed = true; }
        if (applyText(t, b.text ?? '')) changed = true;
      }
    } else {
      yblocks.insert(j++, [blockToY(b)]);
      changed = true;
    }
  });
  return changed;
}

/* ------------------------------------------------------------ the mirror */

/** Accept either the layout object or its JSON text. */
function layoutObject(layout) {
  if (typeof layout === 'string') return JSON.parse(layout || '{}');
  // JSON round-trip: drops `undefined` values and functions the editor may
  // leave on its in-memory object, and is exactly what the file would hold.
  return JSON.parse(JSON.stringify(layout ?? {}));
}

/** The editor fills these in on load; keeping them in the document means a
 *  freshly adopted layout never differs from what the editor then holds —
 *  which would otherwise be a spurious LOCAL transaction (an undo step that
 *  undoes nothing) on the very next render. */
function normalizeLayout(l) {
  l.positions = l.positions || {};
  l.shapes = l.shapes || [];
  l.sections = l.sections || {};
  return l;
}

/**
 * Write {content, layout} into a Y document, touching only what differs.
 * Runs inside the caller's transaction. Returns whether anything changed.
 */
export function writeFiles(ydoc, files) {
  const { preamble, blocks } = parseContent(files.content);
  const layout = normalizeLayout(layoutObject(files.layout));
  let changed = false;
  const meta = ydoc.getMap('meta');
  if ((meta.get('preamble') ?? '') !== preamble) { meta.set('preamble', preamble); changed = true; }
  if (syncBlocks(ydoc.getArray('blocks'), blocks)) changed = true;
  if (syncMap(ydoc.getMap('layout'), layout)) changed = true;
  return changed;
}

/** Would the document survive a round trip? Throws if not. */
export function checkY(ydoc) {
  return assertWellFormed(docFromY(ydoc));
}

/* ------------------------------------------------------------- presence */

/** Eight colours that stay apart from the editor's own selection green and
 *  from each other; a person keeps theirs across sessions because it hashes
 *  off the login, so "the orange one is Ada" holds from one day to the next. */
export const PEER_COLORS = [
  '#D9622B', '#2F6DB5', '#8E44AD', '#C2185B', '#00838F', '#F9A825', '#5D4037', '#455A64',
];

export function colorFor(key) {
  const s = String(key ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return PEER_COLORS[h % PEER_COLORS.length];
}

/** What one collaborator is doing, as the editor wants it. */
function peerOf(clientId, st) {
  return {
    id: clientId,
    login: st.login ?? null,
    color: st.color || colorFor(st.login ?? clientId),
    sel: Array.isArray(st.sel) ? st.sel : [],
    page: st.page ?? null,
    slot: st.slot ?? null,      // the slot / element id an inline editor is open on
    drag: !!st.drag,
    cursor: st.cursor ?? null,  // {slot, rel}: a caret in that slot, as a relative position
  };
}

/* ------------------------------------------------------------ the session */

const STATUS_POLL_MS = 200;
const PRESENCE_POLL_MS = 250;

export class CollabSession {
  /**
   * @param {object} o
   * @param {string} o.host        the Worker: "https://x.workers.dev" or "127.0.0.1:8787"
   * @param {string} o.room        "owner~repo~project"
   * @param {() => Promise<string>} o.ticket   mints a fresh ticket (re-run on every reconnect)
   * @param {{content: string, layout: object|string}} o.files   what the editor holds now
   * @param {string|null} [o.baseSha]   the commit those files came from
   * @param {string|null} [o.login]     for presence
   * @param {() => boolean} [o.busy]    true while the editor must not be disturbed
   * @param {(files, why: 'adopt'|'remote'|'undo'|'redo') => void} [o.onFiles]
   * @param {() => void} [o.beforeRemote]  runs just before a collaborator's update lands on the shadow
   * @param {(sha: string|null) => void} [o.onBaseSha]  a collaborator recorded a Save (meta.baseSha)
   * @param {(state) => void} [o.onStatus]
   * @param {() => void} [o.onHistory]
   * @param {boolean} [o.debug]        assert the document round-trips after every local write
   * @param {boolean} [o.connect]      default true
   */
  constructor(o) {
    this.room = o.room;
    this.login = o.login ?? null;
    this.busy = o.busy || (() => false);
    this.onFiles = o.onFiles || (() => {});
    this.beforeRemote = o.beforeRemote || (() => {});
    this.onBaseSha = o.onBaseSha || (() => {});
    this.onStatus = o.onStatus || (() => {});
    this.onHistory = o.onHistory || (() => {});
    this.onPeers = o.onPeers || (() => {});
    this.presence = o.presence || null;     // polled: () => {sel, page, slot, drag}
    this.debug = !!o.debug;
    this.color = o.color || colorFor(this.login ?? Math.random());
    this.peers = [];
    this.state = { status: 'connecting', phase: 'sync', peers: 0, here: [], seededBy: null, error: null };

    this.shadow = new Y.Doc();
    this.net = new Y.Doc();
    this.#initial = { content: o.files.content, layout: o.files.layout, baseSha: o.baseSha ?? null };

    this.undoManager = new Y.UndoManager(
      [this.shadow.getArray('blocks'), this.shadow.getMap('layout'), this.shadow.getMap('meta')],
      {
        trackedOrigins: new Set([ORIGIN.LOCAL]),
        // One undo step per mark(): the editor calls pushHistory() at every
        // action boundary it already knows about, and mark() is that call.
        // Between marks, every flush merges into the same step — so a drag
        // that renders twice is still one ⌘Z, as it always was.
        captureTimeout: Number.MAX_SAFE_INTEGER,
      });
    for (const ev of ['stack-item-added', 'stack-item-popped', 'stack-cleared']) {
      this.undoManager.on(ev, () => this.onHistory());
    }
    // A Save recorded by a collaborator: their commit now holds this document,
    // so the editor's own "unsaved changes" should reset to it. Our own
    // setBaseSha() is META origin and the editor already knows about it.
    this.shadow.getMap('meta').observe((ev, tr) => {
      if (tr.origin === ORIGIN.REMOTE && ev.keysChanged.has('baseSha')) this.onBaseSha(this.baseSha());
    });

    // shadow -> net: every local (non-remote) shadow update is replayed onto
    // the network document, whose provider broadcasts it.
    this.shadow.on('update', (u, origin) => {
      if (origin === ORIGIN.REMOTE) return;
      Y.applyUpdate(this.net, u, ORIGIN.SHADOW);
    });
    // net -> shadow: a collaborator's update, held while the editor is busy.
    this.net.on('update', (u, origin) => {
      if (origin === ORIGIN.SHADOW) return;
      this.#pending.push(u);
      this.#drainSoon();
    });

    this.ready = new Promise((res, rej) => { this.#readyRes = res; this.#readyRej = rej; });
    this.ready.catch(() => {});

    this.provider = new YProvider(o.host, o.room, this.net, {
      party: 'primer-room',
      params: async () => ({ ticket: await o.ticket() }),
      connect: false,
    });
    this.provider.on('status', ({ status }) => {
      if (status === 'connected') this.#set({ status: this.state.phase === 'ready' ? 'live' : 'connecting' });
      else if (status === 'disconnected') this.#set({ status: 'offline' });
      else this.#set({ status: 'connecting' });
    });
    this.provider.on('connection-error', () => this.#set({ status: 'offline' }));
    this.provider.on('synced', synced => { if (synced) this.#onSynced(); });
    this.provider.on('custom-message', s => this.#onMessage(s));
    this.provider.awareness.on('change', () => this.#presence());
    this.provider.awareness.setLocalState({ login: this.login, color: this.color });
    if (this.presence) {
      this.#presenceTimer = setInterval(() => {
        if (this.state.phase !== 'ready') return;
        let p = null;
        try { p = this.presence(); } catch { return; }
        if (p) this.setPresence(p);
      }, PRESENCE_POLL_MS);
    }

    if (o.connect !== false) this.connect();
  }

  #initial;
  #pending = [];
  #drainTimer = 0;
  #presenceTimer = 0;
  #lastPresence = '';
  #readyRes; #readyRej;
  #lastEmitted = null;

  /* ----------------------------------------------------------- presence */

  /** Publish what this editor is doing: {sel: [ids], page, slot, drag}.
   *  Only sends when something changed — awareness fans out to everyone. */
  setPresence(p) {
    const next = { sel: p.sel || [], page: p.page ?? null, slot: p.slot ?? null, drag: !!p.drag,
                   cursor: p.cursor ?? null };
    const sig = JSON.stringify(next);
    if (sig === this.#lastPresence) return false;
    this.#lastPresence = sig;
    const aw = this.provider.awareness;
    aw.setLocalState({ ...(aw.getLocalState() || {}), login: this.login, color: this.color, ...next });
    return true;
  }

  connect() {
    this.provider.connect().catch(e => this.#set({ status: 'offline', error: String(e && e.message || e) }));
  }

  /* ------------------------------------------------------- local writes */

  /**
   * Push the editor's current {content, layout} into the document as ONE
   * transaction. Before the room is ready this is a no-op: writing local
   * files into a shadow that has not yet learned whether the room is seeded
   * would duplicate every block the moment the sync arrived.
   * @returns {boolean} whether anything changed
   */
  flush(files) {
    if (this.state.phase !== 'ready') return false;
    let changed = false;
    this.shadow.transact(() => { changed = writeFiles(this.shadow, files); }, ORIGIN.LOCAL);
    if (changed && this.debug) checkY(this.shadow);
    return changed;
  }

  /** The document as the two file bodies (+ the parsed layout). */
  files() { return filesFromY(this.shadow); }

  /** Start a new undo step at the next local write. */
  mark() { this.undoManager.stopCapturing(); }
  canUndo() { return this.undoManager.canUndo(); }
  canRedo() { return this.undoManager.canRedo(); }
  undo() { this.undoManager.undo(); return this.files(); }
  redo() { this.undoManager.redo(); return this.files(); }

  baseSha() { return this.shadow.getMap('meta').get('baseSha') ?? null; }
  setBaseSha(sha) {
    this.shadow.transact(() => this.shadow.getMap('meta').set('baseSha', sha || null), ORIGIN.META);
  }

  /* ------------------------------------------------------------ cursors */

  /** The Y.Text behind a slot in the shadow, or null. */
  slotText(key) {
    for (const m of this.shadow.getArray('blocks').toArray()) {
      if (m.get('kind') === 'slot' && m.get('key') === key) {
        const t = m.get('text');
        return t instanceof Y.Text ? t : null;
      }
    }
    return null;
  }

  /**
   * A caret at `index` into a slot's markdown, as something that survives
   * edits around it: {slot, rel}, where `rel` is a Y.RelativePosition as JSON
   * (small, plain, and meaningful on every client that shares the document).
   * Null when the slot is not in the document.
   */
  cursorAt(key, index) {
    const t = this.slotText(key);
    if (!t) return null;
    const i = Math.max(0, Math.min(Number(index) || 0, t.length));
    return { slot: key, rel: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(t, i)) };
  }

  /**
   * Where a cursor is NOW, against what this editor holds: {slot, index}, or
   * null when the character it named is gone with its slot (a section moved
   * or removed re-creates the block, and a position into the old one has
   * nothing to point at).
   */
  resolveCursor(c) {
    if (!c || !c.rel || !c.slot) return null;
    try {
      const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(c.rel), this.shadow);
      if (!abs) return null;
      const t = this.slotText(c.slot);
      if (!t || abs.type !== t) return null;
      return { slot: c.slot, index: abs.index };
    } catch { return null; }
  }

  close() {
    clearTimeout(this.#drainTimer);
    clearInterval(this.#presenceTimer);
    try { this.provider.destroy(); } catch (e) { /* already closed */ }
    this.undoManager.destroy();
    this.shadow.destroy();
    this.net.destroy();
    this.#set({ status: 'closed' });
  }

  /* ------------------------------------------------------- remote reads */

  #drainSoon() {
    if (this.#drainTimer) return;
    this.#drainTimer = setTimeout(() => { this.#drainTimer = 0; this.#drain(); }, 0);
  }

  /** Replay held network updates onto the shadow — unless the editor is
   *  busy, in which case try again shortly. */
  #drain() {
    if (!this.#pending.length) return false;
    if (this.busy()) {
      this.#drainTimer = setTimeout(() => { this.#drainTimer = 0; this.#drain(); }, STATUS_POLL_MS);
      return false;
    }
    // The editor's last word before the document moves under it: anything it
    // holds outside `source` goes in now, as a diff against the text it was
    // typed into. (Only once the room is ready — before that a flush is a
    // no-op by design, see flush().)
    if (this.state.phase === 'ready') {
      try { this.beforeRemote(); } catch (e) { /* the editor's problem, not the document's */ }
    }
    const merged = this.#pending.length === 1 ? this.#pending[0] : Y.mergeUpdates(this.#pending);
    this.#pending = [];
    Y.applyUpdate(this.shadow, merged, ORIGIN.REMOTE);
    if (this.state.phase === 'ready') this.#emit('remote');
    return true;
  }

  /** Hand the editor the document, if it differs from what it was last given. */
  #emit(why) {
    const f = this.files();
    const sig = f.content + ' ' + f.layoutText;
    if (sig === this.#lastEmitted && why === 'remote') return;
    this.#lastEmitted = sig;
    this.onFiles(f, why);
  }

  /* ---------------------------------------------------------- handshake */

  #send(obj) { this.provider.sendMessage(JSON.stringify(obj)); }

  #onSynced() {
    // A reconnect syncs again; the room cannot need seeding twice.
    if (this.state.phase === 'ready') { this.#drain(); this.#set({ status: 'live' }); this.#emit('remote'); return; }
    this.#send({ t: 'hello' });
  }

  #onMessage(s) {
    let msg;
    try { msg = JSON.parse(s); } catch { return; }
    switch (msg?.t) {
      case 'hello':
        if (this.state.phase === 'ready') return;
        this.#set({ here: msg.here || [] });
        if (msg.seeded) this.#adopt();
        else { this.#set({ phase: 'seeding' }); this.#send({ t: 'seed-claim' }); }
        return;
      case 'seed-claim-result':
        if (this.state.phase === 'ready') return;
        if (msg.granted) this.#seed();
        else if (msg.seeded) this.#adopt();
        else this.#set({ phase: 'waiting' });   // someone else is seeding; 'seeded' follows
        return;
      case 'seeded':
        if (this.state.phase === 'ready') return;
        this.#set({ seededBy: msg.by ?? null });
        this.#adopt();
        return;
      default:
        return;
    }
  }

  /** We won the seed: the room takes what this editor holds. */
  #seed() {
    const { content, layout, baseSha } = this.#initial;
    this.shadow.transact(() => {
      writeFiles(this.shadow, { content, layout });
      this.shadow.getMap('meta').set('baseSha', baseSha);
    }, ORIGIN.SEED);
    this.undoManager.clear();
    this.#send({ t: 'seeded' });
    this.#set({ phase: 'ready', status: this.provider.wsconnected ? 'live' : this.state.status, seededBy: this.login });
    this.#lastEmitted = null;
    this.#emit('adopt');
    this.#readyRes(this);
  }

  /** The room is seeded: what it holds replaces what this editor holds. */
  #adopt() {
    this.#drain();
    if (this.busy()) { setTimeout(() => this.#adopt(), STATUS_POLL_MS); return; }
    if (this.shadow.getArray('blocks').length === 0) {
      // Seeded, but empty — the room's storage is gone. The seed handshake
      // will not run again, so refill it from here rather than adopt nothing
      // and blank the editor. SEED origin: not an undo step.
      const { content, layout, baseSha } = this.#initial;
      this.shadow.transact(() => {
        writeFiles(this.shadow, { content, layout });
        this.shadow.getMap('meta').set('baseSha', baseSha);
      }, ORIGIN.SEED);
    }
    this.undoManager.clear();
    this.#set({ phase: 'ready', status: this.provider.wsconnected ? 'live' : this.state.status });
    this.#lastEmitted = null;
    this.#emit('adopt');
    this.#readyRes(this);
  }

  /* ------------------------------------------------------------- status */

  #presence() {
    const states = this.provider.awareness.getStates();
    const peers = [];
    for (const [id, st] of states) if (id !== this.net.clientID && st) peers.push(peerOf(id, st));
    peers.sort((a, b) => a.id - b.id);
    this.peers = peers;
    this.#set({ peers: states.size, here: peers.map(p => p.login) });
    this.onPeers(peers);
  }

  #set(patch) {
    this.state = { ...this.state, ...patch };
    this.onStatus(this.state);
  }
}

/** Convenience: build and return a session. */
export function openSession(opts) { return new CollabSession(opts); }

export { Y };
