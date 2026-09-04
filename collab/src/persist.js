/**
 * Durable Object storage for a room's Yjs snapshot.
 *
 * y-partyserver keeps the document in memory while anyone is connected and
 * calls onSave() periodically and when the room empties; this is what onSave
 * writes to and onLoad reads back, so a document survives everyone leaving.
 *
 * The snapshot is a single `Y.encodeStateAsUpdate` blob, chunked across
 * storage keys. Chunking is not strictly required at current document sizes
 * (~40 KB of markdown yields a comparable update), but a Yjs update grows with
 * edit history until it is compacted, and a write that outgrows the per-value
 * limit would fail at exactly the moment the document is most valuable.
 */

const CHUNK_BYTES = 48 * 1024;
const KEY_META = 'snapshot:meta';
const KEY_CHUNK = i => `snapshot:${i}`;

/**
 * Write a snapshot, replacing any previous one.
 *
 * Order matters: chunks are written first and the meta key last, so a write
 * interrupted partway leaves the PREVIOUS meta pointing at chunks that still
 * exist. A reader either sees the old complete snapshot or the new one, never
 * a half-written mixture.
 */
export async function writeSnapshot(storage, bytes, extra = {}) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    chunks.push(bytes.slice(i, i + CHUNK_BYTES));
  }
  // A zero-length document still needs one (empty) chunk so `count` is honest.
  if (chunks.length === 0) chunks.push(new Uint8Array(0));

  const writes = {};
  chunks.forEach((c, i) => { writes[KEY_CHUNK(i)] = c; });
  await storage.put(writes);

  const prev = await storage.get(KEY_META);
  await storage.put(KEY_META, {
    count: chunks.length,
    bytes: bytes.length,
    at: Date.now(),
    ...extra,
  });

  // Only now is it safe to drop chunks the old snapshot used and this one does
  // not. Doing this before the meta write could strand a reader mid-restore.
  if (prev?.count > chunks.length) {
    const stale = [];
    for (let i = chunks.length; i < prev.count; i++) stale.push(KEY_CHUNK(i));
    await storage.delete(stale);
  }
}

/** @returns {Promise<{bytes: Uint8Array, meta: object} | null>} */
export async function readSnapshot(storage) {
  const meta = await storage.get(KEY_META);
  if (!meta || typeof meta.count !== 'number') return null;

  const keys = [];
  for (let i = 0; i < meta.count; i++) keys.push(KEY_CHUNK(i));
  const map = await storage.get(keys);

  let total = 0;
  const parts = [];
  for (const k of keys) {
    const part = map.get(k);
    if (!part) return null;              // torn snapshot; treat as absent
    const u8 = part instanceof Uint8Array ? part : new Uint8Array(part);
    parts.push(u8);
    total += u8.length;
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  return { bytes, meta };
}

export async function snapshotMeta(storage) {
  return (await storage.get(KEY_META)) ?? null;
}
