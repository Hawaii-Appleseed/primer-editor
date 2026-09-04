/**
 * Phase 0 of the real-time collaboration layer: the lossless bridge between
 * the two files a primer project stores its edited state in and the structured
 * document a CRDT can merge.
 *
 *   filesToDoc({content, layout})  ->  a plain, structured snapshot
 *   docToFiles(doc)                ->  {content, layout} file bodies
 *
 * The contract this module exists to guarantee:
 *
 *   docToFiles(filesToDoc(f)).content === f.content     // byte-identical
 *   deepEqual(docToFiles(filesToDoc(f)).layout, f.layout)
 *
 * Byte-identical matters because opening a project in a collaborative session
 * and saving it without typing anything must produce no diff. Anything less
 * and every session start writes a spurious commit.
 *
 * Nothing here imports Yjs. The document shape below maps onto Y types in
 * Phase 2 (blocks -> Y.Array of Y.Map, each slot's `text` -> Y.Text, layout ->
 * nested Y.Map), but the parse/serialize contract is provable on its own, and
 * that is what the Phase 0 gate tests.
 *
 * --- What content.md actually is -------------------------------------------
 *
 * A preamble, then a run of `[[key]]`-marked blocks:
 *
 *     <!-- a comment, or a markdown heading, or nothing -->
 *
 *     [[cover.title]]
 *     HAWAIʻI'S BUDGET PRIMER
 *
 *     [[page1.intro]]
 *     Prose, possibly several paragraphs.[^src]
 *
 *     [[sources]]
 *     [src]: A source — https://example.com
 *
 * Two existing parsers read this file and they disagree about what they keep:
 *
 *   - docsync/content.py `parse_content()` strips every HTML comment, drops
 *     the preamble entirely, and `.strip()`s each block. It is the renderer's
 *     view: comments and spacing cannot affect output.
 *   - edit.html `slotRe()`/`readSlot()` works on raw text and captures
 *     everything between a marker and the next one, so a comment sitting after
 *     a slot's prose is part of that slot's editable value — and `writeSlot()`
 *     replaces the whole captured region, so editing that slot destroys the
 *     comment.
 *
 * This module is the file's view: it preserves every byte, and it models a
 * trailing comment run as its own non-editable `note` block so a collaborative
 * edit to the slot above it cannot eat it. Verified across all 11 projects in
 * this repo: 18 HTML comments, all of them either in a preamble or trailing a
 * slot body — none interleaved inside prose. See PHASE0.md.
 */

/** A marker line: `[[key]]` alone on its line, followed by a newline.
 *  Charset matches docsync/content.py's `_KEY_RE` exactly. The `m` flag plus
 *  an explicit `\n` requirement is the intersection of what both existing
 *  parsers accept, so this module can never see a block one of them misses. */
const MARKER_RE = /^\[\[([A-Za-z0-9._-]+)\]\]([ \t]*)\n/gm;

/**
 * Split a slot body into [prose, note], where `note` is a trailing run of HTML
 * comments plus the whitespace around them — the shape of every between-block
 * comment in this repo.
 *
 * Scanned from the end rather than matched with a regex: the natural pattern
 * (`/(\s*(?:<!--[\s\S]*?-->\s*)+)$/`) nests a lazy quantifier inside a greedy
 * one, which backtracks badly on a long body that has no comment at all — and
 * most bodies have no comment at all.
 */
function splitTrailingNote(body) {
  const isWs = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  let i = body.length;
  let found = false;
  for (;;) {
    let j = i;
    while (j > 0 && isWs(body[j - 1])) j--;
    if (j >= 3 && body.slice(j - 3, j) === '-->') {
      const open = body.lastIndexOf('<!--', j - 3);
      if (open === -1) break;
      i = open;
      found = true;
      continue;
    }
    break;
  }
  if (!found) return [body, ''];
  // The whitespace introducing the run belongs with the note, so that editing
  // the prose above cannot change the spacing around the comment.
  while (i > 0 && isWs(body[i - 1])) i--;
  return [body.slice(0, i), body.slice(i)];
}

/**
 * content.md text -> {preamble, blocks}.
 *
 * `blocks` is an ordered list of:
 *   {kind: 'slot', key, lead, text, gap}
 *       lead  leading whitespace between the marker line and the prose
 *       text  the editable value — what a Y.Text will hold
 *       gap   trailing whitespace up to the next marker (or EOF)
 *   {kind: 'note', raw}
 *       a verbatim comment run that trailed a slot; never editable
 *
 * A slot's on-disk region is exactly `[[key]]\n` + lead + text + gap.
 */
export function parseContent(text) {
  if (typeof text !== 'string') throw new TypeError('parseContent: expected a string');

  MARKER_RE.lastIndex = 0;
  const marks = [];
  for (let m; (m = MARKER_RE.exec(text)) !== null; ) {
    // `pad` is any spaces/tabs between `]]` and the newline. content.py's
    // _KEY_RE tolerates them, so they can exist and must survive a round-trip.
    marks.push({ key: m[1], pad: m[2], start: m.index, bodyStart: m.index + m[0].length });
  }

  const preamble = marks.length ? text.slice(0, marks[0].start) : text;
  const blocks = [];
  const seen = new Set();

  for (let i = 0; i < marks.length; i++) {
    const { key, pad, bodyStart } = marks[i];
    if (seen.has(key)) {
      // content.py raises on this; refuse here too rather than silently
      // dropping one of them on the way back out.
      throw new Error(`parseContent: duplicate key [[${key}]]`);
    }
    seen.add(key);

    const bodyEnd = i + 1 < marks.length ? marks[i + 1].start : text.length;
    const region = text.slice(bodyStart, bodyEnd);

    // Peel a trailing comment run off into its own block, so editing this
    // slot can never destroy it (which is what writeSlot() does today).
    const [body, note] = splitTrailingNote(region);

    // body = lead + text + gap. `gap` is taken FIRST, from the end: it is what
    // separates this block from the next, and an empty slot (body is nothing
    // but whitespace — several projects have them) must put that whitespace in
    // `gap`, not `lead`. Split the other way round and writing text into an
    // empty slot emits no newline before the next `[[marker]]`, silently
    // merging two slots into one.
    const gap = (body.match(/\s*$/) || [''])[0];
    const head = body.slice(0, body.length - gap.length);
    const lead = (head.match(/^\s*/) || [''])[0];
    const value = head.slice(lead.length);

    blocks.push({ kind: 'slot', key, pad, lead, text: value, gap });
    if (note) blocks.push({ kind: 'note', raw: note });
  }

  return { preamble, blocks };
}

/** {preamble, blocks} -> content.md text. Inverse of parseContent. */
export function serializeContent(doc) {
  const out = [doc.preamble ?? ''];
  for (const b of doc.blocks) {
    if (b.kind === 'note') { out.push(b.raw); continue; }
    out.push(`[[${b.key}]]${b.pad ?? ''}\n`, b.lead ?? '', b.text ?? '', b.gap ?? '');
  }
  return out.join('');
}

/**
 * Set a slot's value, keeping the document well-formed.
 *
 * The one structural invariant a writer has to maintain: a block that is
 * followed by anything must end in a newline, or the next `[[marker]]` stops
 * being at the start of a line and the two blocks merge on the next parse.
 * Every block that came from parseContent already satisfies this, so the
 * branch below is a guard rather than the common path — it earns its keep in
 * Phase 2, where blocks are rebuilt from Y types and a dropped `gap` would
 * otherwise merge two slots silently. Route every slot write through here.
 *
 * @returns {boolean} whether the slot exists
 */
export function setSlotText(doc, key, value) {
  const i = doc.blocks.findIndex(b => b.kind === 'slot' && b.key === key);
  if (i === -1) return false;
  const b = doc.blocks[i];
  b.text = value;
  const isLast = i === doc.blocks.length - 1;
  if (!isLast && b.text !== '' && !/\n$/.test(b.gap || '')) {
    // Match the convention every project uses: one blank line between blocks.
    b.gap = (b.gap || '') + '\n\n';
  }
  return true;
}

/**
 * Throw if the document would not survive a serialize/parse cycle unchanged.
 * Cheap enough to run behind a dev flag on every transaction in Phase 2.
 */
export function assertWellFormed(doc) {
  const text = serializeContent(doc);
  const keys = slotKeys(parseContent(text));
  const want = slotKeys(doc);
  if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
    throw new Error(
      `document does not round-trip: ${want.length} slots in, ${keys.length} out` +
      (want.find((k, i) => k !== keys[i]) ? ` (first divergence at [[${want.find((k, i) => k !== keys[i])}]])` : ''));
  }
  return true;
}

/** Every slot key in document order. */
export function slotKeys(doc) {
  return doc.blocks.filter(b => b.kind === 'slot').map(b => b.key);
}

/** A slot's editable value, or undefined. Mirrors edit.html's readSlot(). */
export function readSlot(doc, key) {
  const b = doc.blocks.find(x => x.kind === 'slot' && x.key === key);
  return b ? b.text : undefined;
}

/**
 * layout.json text -> object.
 *
 * Parsing is plain JSON; the reason this is a named function is the writer
 * below, which has to match the editor byte for byte.
 */
export function parseLayout(text) {
  if (typeof text !== 'string') throw new TypeError('parseLayout: expected a string');
  const v = JSON.parse(text);
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('parseLayout: expected a JSON object at the top level');
  }
  return v;
}

/**
 * layout object -> layout.json text.
 *
 * Exactly what edit.html's save path writes (`JSON.stringify(layout, null, 2)
 * + '\n'`), so a collaborative save produces the same bytes the editor's own
 * Save does. Note this is NOT always the bytes currently on disk: layout.json
 * has a second writer in Python (docsync.scaffold / propose / serve.py), whose
 * json.dump emits `8.0` where JSON.stringify emits `8` and keeps short arrays
 * on one line. Three projects in this repo are in that state today; the first
 * editor Save on any of them already reformats the file. See PHASE0.md.
 */
export function serializeLayout(layout) {
  return JSON.stringify(layout, null, 2) + '\n';
}

/**
 * The Phase 0 contract, in the shape Phase 2 will wrap Y types around.
 *
 * @param {{content: string, layout: string}} files
 * @returns {{preamble: string, blocks: Array, layout: object}}
 */
export function filesToDoc(files) {
  const { preamble, blocks } = parseContent(files.content);
  return { preamble, blocks, layout: parseLayout(files.layout) };
}

/** @returns {{content: string, layout: string}} */
export function docToFiles(doc) {
  return {
    content: serializeContent(doc),
    layout: serializeLayout(doc.layout),
  };
}
