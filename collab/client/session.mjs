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

export const ORIGIN = Object.freeze({
  LOCAL: 'collab:local',     // the editor's own edits — the only tracked origin
  REMOTE: 'collab:remote',   // a collaborator's edit, replayed onto the shadow
  SEED: 'collab:seed',       // the first client populating an empty room
  META: 'collab:meta',       // baseSha bookkeeping; never an undo step
  SHADOW: 'collab:shadow',   // a shadow update replayed onto the net doc
});

/* ------------------------------------------------------------ plain <-> Y */
// The bridge lives in ../ydoc.mjs so the room can use it too; re-exported
// here because the editor bundle and the tests import it from this module.
import {
  deepEqual, toY, docFromY, filesFromY, applyText, syncMap, syncArray, syncBlocks, writeFiles, checkY,
} from '../ydoc.mjs';
export { deepEqual, toY, docFromY, filesFromY, applyText, syncMap, syncArray, syncBlocks, writeFiles, checkY };

/* ------------------------------------------------------------- presence */

/** Eight colours that stay apart from the editor's own selection green and
 *  from each other; a person keeps theirs across sessions because it hashes
 *  off the login, so "the orange one is Ada" holds from one day to the next.
 *
 *  All eight are saturated, on purpose. The set used to end in a brown and a
 *  blue-grey (#5D4037, #455A64), and the blue-grey is within a shade of the
 *  slate every Appleseed report is set in: a ring in it around a card drawn
 *  in that slate was found by reading the DOM, not by looking at the page.
 *  A presence colour has one job, to be seen against the report. */
export const PEER_COLORS = [
  '#D9622B', '#2F6DB5', '#8E44AD', '#C2185B', '#00838F', '#F9A825', '#D32F2F', '#5E35B1',
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
    name: st.name ?? null,      // a display name, when the door knows one (the hub's roster)
    color: st.color || colorFor(st.login ?? clientId),
    sel: Array.isArray(st.sel) ? st.sel : [],
    page: st.page ?? null,
    slot: st.slot ?? null,      // the slot / element id an inline editor is open on
    drag: !!st.drag,
    cursor: st.cursor ?? null,  // {slot, rel}: a caret in that slot, as a relative position
    anchor: st.anchor ?? null,  // {slot, rel}: the other end of a text selection, when there is one
    view: st.view ?? null,      // the page (1-based) in the middle of their window — where they are LOOKING
    idle: !!st.idle,            // no input for a while: present, but not at the desk
    boxes: Array.isArray(st.boxes) ? st.boxes : [],  // [{id,x,y,w,h}] in inches: where they are moving something TO
    agent: st.agent ?? null,    // {by, what, target}: an AI is editing THROUGH this editor right now
    comments: st.comments ?? null,  // when this editor last changed the document's comments (a stamp)
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
   * @param {string} [o.path]      a front door at a path on `host` instead of the relay's
   *                               own routing — see "two front doors" below
   * @param {() => Promise<string>} [o.ticket]  mints a fresh ticket (re-run on every
   *                               reconnect). Omitted when the front door authenticates
   *                               the request itself.
   * @param {{content: string, layout: object|string}} o.files   what the editor holds now
   * @param {string|null} [o.baseSha]   the commit those files came from
   * @param {string|null} [o.login]     for presence — the identity (a login, an email)
   * @param {string|null} [o.name]      for presence — what to call them, when known
   * @param {() => boolean} [o.busy]    true while the editor must not be disturbed
   * @param {(files, why: 'adopt'|'remote'|'undo'|'redo') => void} [o.onFiles]
   * @param {() => void} [o.beforeRemote]  runs just before a collaborator's update lands on the shadow
   * @param {(sha: string|null) => void} [o.onBaseSha]  a collaborator recorded a Save (meta.baseSha)
   * @param {(state) => void} [o.onStatus]
   * @param {() => void} [o.onHistory]
   * @param {boolean} [o.debug]        assert the document round-trips after every local write
   * @param {boolean} [o.connect]      default true
   * @param {Function} [o.WebSocketPolyfill]   for a Node client (see below); browsers never set it
   */
  constructor(o) {
    this.room = o.room;
    this.login = o.login ?? null;
    this.name = o.name ?? null;
    this.busy = o.busy || (() => false);
    this.onFiles = o.onFiles || (() => {});
    this.beforeRemote = o.beforeRemote || (() => {});
    this.onBaseSha = o.onBaseSha || (() => {});
    this.onStatus = o.onStatus || (() => {});
    this.onHistory = o.onHistory || (() => {});
    this.onPeers = o.onPeers || (() => {});
    // The room may hand THIS editor pilot ops to apply (the hub's /pilot, on
    // behalf of a person's own Claude): (msg) => {ok, error?, results?}. When
    // unset, such a message is answered as refused rather than left hanging.
    this.onPilot = o.onPilot || null;
    this.onAsk = o.onAsk || null;      // answers questions about the rendered page (see 'ask')
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

    // --- two front doors, one room -------------------------------------
    //
    // The relay Worker routes /parties/primer-room/<room> and authenticates
    // with a ticket minted from a GitHub token. The staff hub serves the same
    // Durable Object at a path of its own, behind Cloudflare Access, and
    // authenticates the request itself from the session the page already
    // carries — so there is no ticket to mint and none to refresh on
    // reconnect. Same room, same protocol, same document; only the door.
    //
    // `prefix` is the WHOLE path: y-partyserver does not append the room to it
    // (isPrefixedUrl), so `path` has to name the room itself. Getting that
    // wrong points every document at one room rather than failing.
    this.provider = new YProvider(o.host, o.room, this.net, {
      ...(o.path ? { prefix: o.path } : { party: 'primer-room' }),
      ...(o.ticket ? { params: async () => ({ ticket: await o.ticket() }) } : {}),
      // A browser has a WebSocket and a cookie jar; a Node client driving this
      // for a test has neither, and needs to put an identity on the request by
      // hand. y-websocket's own escape hatch, passed straight through.
      ...(o.WebSocketPolyfill ? { WebSocketPolyfill: o.WebSocketPolyfill } : {}),
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
    this.provider.awareness.setLocalState({ login: this.login, name: this.name, color: this.color });
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
  #localSinceEmit = false;   // the editor moved the shadow since it was last handed the document

  /* ----------------------------------------------------------- presence */

  /** Publish what this editor is doing: {sel: [ids], page, slot, drag, cursor,
   *  anchor, view, …}. Only sends when something changed — awareness fans out
   *  to everyone. The fields are named here, not spread, so a stray property
   *  on the editor's object cannot ride into every collaborator's awareness
   *  state - which also means a NEW field has to be added here and in peerOf,
   *  or it is silently dropped at this door (view and anchor were, once). */
  setPresence(p) {
    const next = { sel: p.sel || [], page: p.page ?? null, slot: p.slot ?? null, drag: !!p.drag,
                   cursor: p.cursor ?? null, anchor: p.anchor ?? null, view: p.view ?? null,
                   idle: !!p.idle, boxes: p.boxes || [],
                   agent: p.agent ?? null, comments: p.comments ?? null };
    const sig = JSON.stringify(next);
    if (sig === this.#lastPresence) return false;
    this.#lastPresence = sig;
    const aw = this.provider.awareness;
    aw.setLocalState({ ...(aw.getLocalState() || {}), login: this.login, name: this.name, color: this.color, ...next });
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
    if (changed) this.#localSinceEmit = true;
    if (changed && this.debug) checkY(this.shadow);
    return changed;
  }

  /** The document as the two file bodies (+ the parsed layout). */
  files() { return filesFromY(this.shadow); }

  /**
   * What the ROOM holds right now, including updates still held back from the
   * shadow because the editor is busy (an open text box, a table cell, a
   * dialog — see `busy`). `files()` is what the EDITOR is looking at; this is
   * what everybody else has already agreed on.
   *
   * The difference is the whole point: an inline editor whose words live in
   * layout.json cannot merge a collaborator's edit character by character the
   * way a paragraph does, so before it writes its value over theirs it has to
   * be able to SEE theirs — and while it is open, the shadow is by design the
   * one place that does not have it.
   */
  netFiles() { return filesFromY(this.net); }

  /**
   * Let held updates land NOW, and resolve when nothing is waiting (or the
   * wait runs out).
   *
   * For the moment a person has chosen to write their value over a
   * collaborator's: theirs has to land FIRST, because two concurrent writes
   * to one key are resolved by the document and not by the person — whichever
   * Yjs happens to order last wins, which is exactly the coin toss the
   * question was asked to replace. Applied after theirs, the choice is the
   * later write and it stands.
   */
  async drainNow(timeoutMs = 3000) {
    const until = Date.now() + timeoutMs;
    while (this.#pending.length && Date.now() < until) {
      this.#drain();
      if (!this.#pending.length) break;
      await new Promise(r => setTimeout(r, 30));
    }
    return !this.#pending.length;
  }

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

  /** Hand the editor the document, if it differs from what the editor holds.
   *  "Holds" is what it was last given — unless it has flushed since, in
   *  which case a collaborator's update that lands the document back on
   *  exactly that earlier state (a restore, an undo of our edit) must still
   *  be handed over, or the editor keeps its own superseded words. */
  #emit(why) {
    const f = this.files();
    const sig = f.content + ' ' + f.layoutText;
    if (sig === this.#lastEmitted && why === 'remote' && !this.#localSinceEmit) return;
    this.#lastEmitted = sig;
    this.#localSinceEmit = false;
    this.onFiles(f, why);
  }

  /* ---------------------------------------------------------- handshake */

  #send(obj) { this.provider.sendMessage(JSON.stringify(obj)); }

  #onSynced() {
    // A reconnect syncs again; the room cannot need seeding twice.
    if (this.state.phase === 'ready') { this.#drain(); this.#set({ status: 'live' }); this.#emit('remote'); return; }
    // `pilot` tells the room this client can take pilot ops. A client that
    // cannot (an older bundle, or one built without a handler) must never be
    // handed them: the room would sit waiting for an answer that no code
    // exists to send, and the caller would see a timeout instead of "nobody
    // here can do that".
    this.#send({ t: 'hello', pilot: !!this.onPilot });
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
      case 'ask': {
        // A question the room relays to one editor — the same waiting map as
        // /pilot (an ask is a pilot request with nothing to apply), so the
        // answer comes back as a pilot-result on the same id.
        const reply = r => this.#send({ t: 'pilot-result', id: msg.id, ...(r || { ok: false, error: 'no answer' }) });
        if (!this.onAsk) { reply({ ok: false, error: 'this editor does not answer questions' }); return; }
        Promise.resolve().then(() => this.onAsk(msg)).then(reply,
          e => reply({ ok: false, error: String((e && e.message) || e) }));
        return;
      }
      case 'pilot': {
        // Answer every one, even a refusal: the room is holding a caller on
        // this id and a silence costs them the full timeout.
        const reply = r => this.#send({ t: 'pilot-result', id: msg.id, ...(r || { ok: false, error: 'no answer' }) });
        if (!this.onPilot) { reply({ ok: false, error: 'this editor does not take pilot ops' }); return; }
        Promise.resolve().then(() => this.onPilot(msg)).then(reply,
          e => reply({ ok: false, error: String((e && e.message) || e) }));
        return;
      }
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
