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
