/**
 * One Durable Object per project document.
 *
 * y-partyserver's YServer supplies the Yjs sync protocol, awareness fan-out
 * and the in-memory document; this subclass adds the three things specific to
 * a primer project: durable storage, a seed handshake, and the commit SHA the
 * live document was built from.
 *
 * --- Why the server does not fetch from GitHub --------------------------
 *
 * The Phase 1 scope had the Durable Object bootstrap an empty room by reading
 * content.md and layout.json from the draft branch. It doesn't, and shouldn't:
 *
 *   - It would need a GitHub credential of its own. Every design that gives a
 *     shared server a token that can read (and eventually write) the repo is
 *     strictly worse than one where the credential never leaves the browser
 *     that owns it.
 *   - It would only work for a public repo, or force a service token for a
 *     private one — and primer-editor's consumers include private repos.
 *   - It is redundant. The first client to open the editor has already
 *     fetched both files in order to render the page.
 *
 * So the FIRST client to arrive seeds the room from what it already holds.
 * Exactly one connection is granted the seed (the grant is a synchronous
 * check-and-set below, and a Durable Object is single-threaded, so there is no
 * race); everyone else waits for normal Yjs sync. The room records that it has
 * been seeded in storage, so a later reconnection to an empty-but-seeded room
 * does not re-seed it.
 */
import { YServer } from 'y-partyserver';
import * as Y from 'yjs';
import { readSnapshot, writeSnapshot, snapshotMeta } from './persist.js';

const KEY_SEEDED = 'seeded';

export class PrimerRoom extends YServer {
  /**
   * How often the document is persisted. y-partyserver debounces onSave()
   * around edits and always calls it when the room empties, so these control
   * how much work is at risk if the isolate dies mid-session, not whether a
   * clean departure is saved.
   */
  static callbackOptions = {
    debounceWait: 3000,
    debounceMaxWait: 15000,
    timeout: 10000,
  };

  /**
   * Hibernation is deliberately OFF for now.
   *
   * A hibernating Durable Object drops its isolate between messages, and a Yjs
   * room has to hold the whole document in memory to apply an update — so
   * every message would pay a full reload. The cost of staying awake is
   * bounded and small: a room bills wall-clock GB-s only while a websocket is
   * open, and the free plan's 13,000 GB-s/day is roughly fourteen hours of
   * continuously-connected editing per day. Revisit with a measurement, not a
   * guess, once real sessions exist.
   */
  static options = { hibernate: false };

  /** Pilot ops in flight: id -> resolve(result). See onRequest's /pilot. */
  #pilots = new Map();

  /**
   * The room's plain-HTTP side, reached only through a Worker that holds the
   * namespace binding (the hub's Pages Functions do; a browser cannot):
   *
   *   GET  …/status   what status() says — is it seeded, who is here
   *   POST …/pilot    {ops, by?, what?, timeout?} — hand pilot ops to ONE
   *                   editor in the room to apply, and wait for its answer
   *
   * /pilot is how a person's own Claude, talking to the hub's MCP connector,
   * edits a document that someone has open: the ops are relayed to the first
   * editor that may write, which applies them through docsync.api.batch() —
   * one undo step, the same validation as typing — and answers with a
   * `pilot-result`. Nothing is written to the Yjs document from here; the
   * editor that applied the batch syncs it to everyone the ordinary way. An
   * empty room answers {ok:false, reason:'empty'} so the caller can write the
   * store instead, which is the right thing when nobody is in the document.
   */
  async onRequest(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/status')) {
      return Response.json(await this.status());
    }
    if (request.method === 'POST' && url.pathname.endsWith('/pilot')) {
      let body;
      try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'a JSON body is required' }, { status: 400 }); }
      const ops = Array.isArray(body?.ops) ? body.ops : [];
      if (!ops.length) return Response.json({ ok: false, error: 'ops is required' }, { status: 400 });
      const all = [...this.getConnections()];
      const editors = all.filter(c => !this.isReadOnly(c));
      if (!editors.length) return Response.json({ ok: false, reason: 'empty', connections: all.length });
      const id = crypto.randomUUID();
      const answer = new Promise(res => this.#pilots.set(id, res));
      const wait = Math.min(Math.max(+body.timeout || 20000, 1000), 60000);
      this.#send(editors[0], { t: 'pilot', id, ops, by: body.by ?? null, what: body.what ?? '' });
      const r = await Promise.race([
        answer,
        new Promise(res => setTimeout(() => res({ ok: false, error: 'the editor did not answer in time' }), wait)),
      ]);
      this.#pilots.delete(id);
      return Response.json({ ...r, via: editors[0].state?.login ?? null, connections: all.length });
    }
    return new Response('not found', { status: 404 });
  }

  /** Set synchronously the moment a seed is granted, so two connections
   *  arriving in the same tick cannot both be told to seed. */
  #seedGranted = false;
  #seedKnown = false;
  #seeded = false;

  async onLoad() {
    const snap = await readSnapshot(this.ctx.storage);
    if (snap && snap.bytes.length) {
      Y.applyUpdate(this.document, snap.bytes, 'storage');
    }
    this.#seeded = (await this.ctx.storage.get(KEY_SEEDED)) === true;
    this.#seedKnown = true;
  }

  async onSave() {
    const bytes = Y.encodeStateAsUpdate(this.document);
    await writeSnapshot(this.ctx.storage, bytes, {
      baseSha: this.document.getMap('meta').get('baseSha') ?? null,
      slots: this.document.getArray('blocks').length,
    });
  }

  /**
   * A connection that authenticated read-only sees the document and everyone's
   * cursors but cannot change it. The ticket carries the verdict; onConnect
   * copies it onto the connection so this stays a synchronous read.
   */
  isReadOnly(connection) {
    return connection.state?.ro === true;
  }

  onConnect(connection, ctx) {
    const url = new URL(ctx.request.url);
    connection.setState({
      login: ctx.request.headers.get('x-collab-login') || null,
      ro: ctx.request.headers.get('x-collab-ro') === '1',
      room: url.pathname.split('/').pop(),
    });
    // YServer's own onConnect opens the sync and — the part that is easy to
    // lose — sends the newcomer everyone's current awareness state. Without
    // it a second editor sees an empty room until someone moves, because the
    // client only ever learns presence from updates, never from a query.
    super.onConnect(connection, ctx);
  }

  onCustomMessage(connection, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    switch (msg?.t) {
      case 'hello':
        this.#send(connection, {
          t: 'hello',
          seeded: this.#seeded,
          baseSha: this.document.getMap('meta').get('baseSha') ?? null,
          you: { login: connection.state?.login ?? null, ro: this.isReadOnly(connection) },
          here: [...this.getConnections()].map(c => c.state?.login ?? null),
        });
        return;

      case 'seed-claim': {
        // Check-and-set with no await in between: a Durable Object runs one
        // task at a time, so this is atomic without a lock.
        const granted = !this.#seeded && !this.#seedGranted && !this.isReadOnly(connection);
        if (granted) this.#seedGranted = true;
        this.#send(connection, { t: 'seed-claim-result', granted, seeded: this.#seeded });
        return;
      }

      case 'seeded': {
        if (!this.#seedGranted || this.#seeded) return;
        this.#seeded = true;
        // Not awaited: the flag is already true in memory, and a failed write
        // only costs a redundant re-seed offer after an eviction.
        this.ctx.storage.put(KEY_SEEDED, true).catch(() => {});
        this.broadcastCustomMessage(JSON.stringify({
          t: 'seeded',
          by: connection.state?.login ?? null,
          baseSha: this.document.getMap('meta').get('baseSha') ?? null,
        }));
        return;
      }

      case 'pilot-result': {
        // The editor's answer to an onRequest /pilot; nobody waiting means
        // the caller's timeout already spoke, and the answer is dropped.
        const res = this.#pilots.get(msg.id);
        if (res) res({ ok: msg.ok === true, error: msg.error ?? null, results: msg.results ?? null });
        return;
      }

      default:
        return;
    }
  }

  #send(connection, obj) {
    this.sendCustomMessage(connection, JSON.stringify(obj));
  }

  /**
   * A plain HTTP view of the room, for operators and tests: is it seeded, how
   * many people are in it, how big is the document. Never returns content.
   */
  async status() {
    return {
      name: this.name ?? null,
      seeded: this.#seedKnown ? this.#seeded : (await this.ctx.storage.get(KEY_SEEDED)) === true,
      connections: [...this.getConnections()].length,
      blocks: this.document.getArray('blocks').length,
      baseSha: this.document.getMap('meta').get('baseSha') ?? null,
      snapshot: await snapshotMeta(this.ctx.storage),
    };
  }
}
