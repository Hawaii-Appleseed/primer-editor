# primer-collab

Real-time collaborative editing for the docsync draft editor: one Cloudflare
Durable Object per project, holding a Yjs document that two or more browsers
edit at once.

Phase 0 (the file⇄document bridge) is in [PHASE0.md](PHASE0.md).
Phase 1 (the Worker), Phase 2 (the editor side), Phase 3 (presence) and
Phase 4 (the branch underneath, carets, typing together in one paragraph)
are described below.

```
collab/
  serialize.mjs        Phase 0: content.md + layout.json  <->  document
  src/auth.js          who may open a room, and the ticket that proves it
  src/index.js         the Worker: POST /auth, and the websocket gate
  src/room.js          the Durable Object: one project document
  src/persist.js       chunked snapshot storage
  client/session.mjs   Phase 2: the editor's mirror — shadow doc, diffs, undo
                       Phase 4: beforeRemote/onBaseSha hooks, cursors as relative positions
  build-client.mjs     bundles client/ + yjs -> docsync/editor/collab-client.js
  devserver.mjs        boots a throwaway `wrangler dev` for tests (or by hand)
```

## Running it

```bash
cd collab
npm install
npm run dev          # wrangler dev on :8787
npm test             # unit + end-to-end against a real Worker (~2 min)
COLLAB_E2E=0 npm test   # unit only, no wrangler
npm run build:client    # after touching client/session.mjs or ../serialize.mjs
```

The end-to-end tests boot a real `wrangler dev` (Miniflare — real Durable
Objects, real websockets, real storage) and drive it with two independent Yjs
clients — and, in `client.test.mjs`, two `CollabSession`s through the exact
API the editor calls. Nothing touches GitHub: tickets are minted locally with
the development signing secret.

The editor itself is exercised by `npx playwright test collab.spec.js
collab-drafts.spec.js` from the repo root: two browser contexts on one
project against a relay each spec boots for itself (so the other ~120 spec
files never pay for a Worker boot). `collab.spec.js` runs a local editor;
`collab-drafts.spec.js` runs a hosted one against the in-memory fake GitHub,
for the branch side of Phase 4.

The Phase 0 gate runs from the repo root and stays dependency-free:

```bash
npm run test:collab     # 72 assertions, ~1s
```

## How a browser joins a room

A room is one project in one repository, named `owner~repo~project` — `~`
because it is URL-unreserved and cannot appear in a GitHub owner or repository
name, so the three parts stay unambiguous inside one path segment.

```
POST /auth  {room, token}   ->  {ticket, exp, login}
GET  /parties/primer-room/<room>?ticket=<ticket>   (websocket)
```

**The GitHub token never appears in a URL.** It is POSTed once, over TLS, in a
request body. The Worker asks GitHub whether that token has push permission on
the room's repository — the same single call `edit.html`'s `tokenWhy()` already
makes — and returns a short-lived HMAC-signed ticket naming the room and the
login. The ticket is what rides the websocket query string, so a URL captured
in a log or a proxy is worthless 90 seconds later and cannot be replayed
against a different room. Tickets are stateless, so verifying one costs no
storage read.

Two allowlists bound the surface: `ALLOWED_ORIGINS` (which pages may request a
ticket at all) and `ALLOWED_REPOS` (which repositories this Worker serves —
without it, push access to *any* repository would mint a ticket for a room
named after someone else's).

## The document

The shape Phase 0 established, as Y types:

```
Y.Doc
├─ blocks: Y.Array<Y.Map>    { kind, key, text: Y.Text, pad, lead, gap }
├─ layout: Y.Map<id, Y.Map>  positions, shapes, boxes, tables
└─ meta:   Y.Map             { baseSha }
```

Per-slot `Y.Text` is what makes two people typing in the same paragraph merge
character by character instead of one overwriting the other — proven by the
`converge on concurrent edits` test, which has both clients edit one slot
simultaneously and asserts both edits survive on both sides.

## The server does not talk to GitHub

The Phase 1 scope had the Durable Object bootstrap an empty room by reading
`content.md` and `layout.json` from the draft branch. It doesn't. **The first
client to arrive seeds the room from the files it has already fetched to render
the page.** Reasons, in order of weight:

1. A server-side fetch needs a GitHub credential of its own. Any design where
   a shared server holds a token that can read — and eventually write — the
   repository is strictly worse than one where the credential never leaves the
   browser that owns it.
2. It would only work for public repositories, or force a service token for
   private ones. primer-editor's consumers include private repositories.
3. It is redundant work. The first browser into a room already has both files.

Exactly one connection is granted the seed. The grant is a synchronous
check-and-set inside the Durable Object, which runs one task at a time, so no
lock is needed; the room then records in storage that it has been seeded, so
reconnecting to an empty-but-seeded room does not re-seed it. Tested by
`exactly one connection is granted the seed`.

## Persistence

`onSave()` writes `Y.encodeStateAsUpdate` to Durable Object storage, chunked at
48 KB. Chunks are written before the meta key and stale chunks deleted after
it, so an interrupted write leaves the previous complete snapshot readable
rather than a half-written mixture. `onLoad()` restores it. Tested by
`the document survives every client leaving`, which disconnects every client,
waits out the save debounce, and reconnects a fresh one.

Saving to git remains the browser's job and keeps its current meaning: Save
serializes the document through `docToFiles()` and commits to the shared
`draft/<project>` branch; Publish opens and merges the PR. The Durable Object
is the live workspace; git stays the record. `meta.baseSha` is the commit the
live document was built from, which is how Phase 4 will detect that the branch
moved underneath a session.

## Hibernation is off, deliberately

A hibernating Durable Object drops its isolate between messages, and a Yjs room
must hold the whole document in memory to apply an update — so every message
would pay a full reload. The cost of staying awake is bounded: a room bills
wall-clock GB-s only while a websocket is open, and the free plan's 13,000
GB-s/day is roughly fourteen hours of continuously-connected editing per day,
against two to five editors. Revisit with a measurement once real sessions
exist, not before.

## Deploying

Not deployed yet — this is deliberate, and it is the one step that needs a
human. To put it up:

```bash
cd collab
npx wrangler secret put COLLAB_SECRET     # any high-entropy string
npx wrangler deploy
```

`COLLAB_SECRET` only ever signs connection tickets. `wrangler dev` has no
secrets bound and falls back to a fixed development value, which is safe
precisely because it is well known: a ticket signed with it is worthless
against a deployed Worker.

After deploying, put the `*.workers.dev` URL into each project's entry in
`docs/primer/projects.json` as `"collab": {"url": …}`, alongside the existing
`"oauth"` entry. That is the whole switch: an editor opening that project
joins its room (Phase 2 below); a project without it is exactly as before.

## Phase 2 — the editor is in the room

`edit.html` joins a room when a project is marked shared: `"collab": {"url":
"https://….workers.dev"}` on its `projects.json` entry (or in its manifest).
No flag, no session — the editor is exactly what it was.

### The editor's state model is untouched

`edit.html` keeps its whole editing state in two plain values, `source` (the
content.md text) and `layout` (the parsed layout.json), and mutates them from
some 250 places before calling the one `render()`. The Phase 2 scope said
"route writes through a `tx()` wrapper"; rewriting every one of those sites
against Y types would have been a rewrite of the editor. Instead the editor
keeps its values and `client/session.mjs` **mirrors** them:

```
editor  --flush(files)-->   shadow Y.Doc  --update-->  net Y.Doc  --ws-->  room
editor  <--onFiles(files)-- shadow Y.Doc  <--update--  net Y.Doc  <--ws--  room
```

- **Out.** `renderOnce()` calls `collabFlush()` before it does anything else,
  so every local edit — whatever code path made it — becomes one document
  transaction. The write is a *diff*, not a replacement: a slot edit is one
  delete + one insert around the changed span of its `Y.Text` (common prefix
  and suffix untouched); a layout move sets one key in a nested `Y.Map`; a
  shape added is one splice of a `Y.Array`; a section moved replaces only the
  blocks that moved (longest-in-order run kept). That is what lets two people
  edit one paragraph at once — the Playwright spec proves the same-slot merge
  through the real editor.
- **In.** A collaborator's change reaches the editor as the whole document
  (`onFiles`), which sets `source`/`layout` and renders — never while the
  editor is *busy*: an inline text editor open, a pointer held down (a drag),
  a dialog up. The change waits and lands at the next quiet moment, so
  nobody's caret or drag is pulled out from under them.
- **Undo.** The snapshot stack yields to a `Y.UndoManager` on the shadow
  document, tracking only this editor's own origin: ⌘Z undoes *my* last edit
  and leaves everyone else's alone — a snapshot restore cannot express that.
  `pushHistory()` keeps its exact meaning (the boundary between undo steps);
  in a session it marks one instead of copying state.

### Why two documents

A local change is computed as a diff against what the editor last saw, and
that diff is positions into slot text. Positions are only meaningful against
the exact document the editor's copy was derived from — and the network
document moves under a remote edit at any moment, in particular while someone
is mid-sentence and has not committed yet. The **shadow** document is a
replica that only advances when the editor is ready to look, so a diff always
applies to precisely the text it was computed against; Yjs then merges the
resulting update into the network document against whatever arrived in the
meantime. That is the CRDT doing the one thing it exists to do; the
alternative — transforming positions through the remote delta by hand — is
re-implementing Yjs badly.

### Joining

After the first paint, `startCollab()` asks the relay for a ticket (the same
`POST /auth` as Phase 1, with the token Save already uses), imports
`collab-client.js` from beside the page, and opens the session with the files
on screen. The seed handshake is Phase 1's: the first editor in seeds the
room from those files; everyone after adopts the room, whatever their own
copy said. A seeded-but-empty room (storage gone) is refilled from the
arriving editor rather than adopted as blank.

A chip in the bar (`#collab`) says `● live · N`, `○ offline` (edits are kept
and sent when the relay is back — Yjs queues them), `⚠ not shared` with the
reason on hover, or `Sign in to collaborate` when the project is shared but
this browser holds no token. `docsync.api.status().collab` carries the same
for a pilot or a test.

Save is unchanged: it commits what is on screen — which is now what everyone
sees — to the saver's own draft branch, and records the new commit as
`meta.baseSha` for Phase 4.

### Developing against it locally

A local editor (served by `serve.py`) accepts two URL parameters, **local
mode only**: `?collab=http://127.0.0.1:8787` points it at a loopback relay,
and `?collabroom=<tag>` suffixes the room name so runs do not share a room.
A hosted editor ignores both — the page POSTs its GitHub token to whatever
`collab` names, so it must never come from a link. `?collab=0` opens a
shared project alone.

Such an editor has no GitHub token and needs none: the Worker accepts a
`dev:<login>` token **only** when no `COLLAB_SECRET` is bound — that is,
under the development signing secret, which a deployed Worker never uses.

```bash
cd collab && node devserver.mjs 8787        # a relay with fresh storage
# then open  http://localhost:8010/primer/edit.html?collab=http://127.0.0.1:8787
```

### The bundle

`docsync/editor/collab-client.js` is generated (`npm run build:client`) from
`client/session.mjs` + yjs + y-partyserver's provider, and committed: the
editor is a single file with no build step, and this is the one dependency it
cannot load from a CDN as-is. It lives under `docsync/` so it vendors to every
consumer like the rest of the engine, and `docsync.stage` copies it beside
`edit.html`. The Node tests import the source; the Playwright spec is what
catches a stale bundle.

## Phase 3 — presence

Awareness (y-partyserver fans it out; nothing server-side changed) now
carries what each editor is doing, and every other editor paints it:

| Field | Set from | Painted as |
|---|---|---|
| `login`, `color` | the ticket; colour hashes off the login | a dot per person in the `#collab` chip |
| `sel` | `selIds` | a ring in their colour on each selected element, with a name tag |
| `page` | `selPage` (a selected page background) | a halo on that page |
| `slot` | the inline editor open here (`data-slot` on a paragraph host, `data-el` on a text box, the table cell's id) | `name · typing` on that paragraph, and a coloured bar down its left edge |
| `drag` | a pointer down on a selection | the tag reads `name · moving` |

The editor publishes from one poll (`collabPresence()`, 4×/s, sent only when
something changed) rather than from hooks at every selection and edit site;
`collabPaintPeers()` is idempotent and runs after every render (from
`wire()`) and every awareness change, so marks survive a re-render. Rings go
on HTML elements only — an outline on an SVG child paints around the whole
page-sized viewport (the same reason `paintSel` uses an overlay for shapes).

Colours are **stable, not unique**: a person keeps theirs from one day to
the next because it hashes off the login, and with eight colours two people
can share one — the name tag disambiguates. Opening a paragraph a
collaborator is already typing in is allowed (the CRDT merges both) but
announced in the status row: *grace is also editing this paragraph — both of
your edits will be kept*. Presence leaves with the person: closing the tab
removes the awareness state, and the provider's disconnect path clears it
for a dropped connection.

`?collabas=<name>` names a local editor in a dev room (two tabs on one
machine would otherwise both be `local`); local mode only, like `?collab=`.

## Phase 4 — the branch underneath, carets, and typing together

Three things, each answering one of Phase 3's known gaps.

### One draft branch for the room

A shared project — one with a relay — saves to **one** draft branch,
`draft/<project>`, rather than `draft/<project>/<user>`: everyone in the room
edits one document, so they save it to one place, and a Save by anyone is a
Save for everyone. The editor's `draftBranchFor()` makes the choice;
`resolveDraft()` opens the shared branch when it exists; the title reads
`shared draft`. Discard on a shared draft says so before deleting it.

When a collaborator saves, the room learns it through `meta.baseSha`
(`onBaseSha` in the session; `collabSaved()` in the editor): the other
editors reset their "unsaved changes" to the document as it stands — that is
what was committed, to within a keystroke — pick up the branch if they
loaded from the deploy branch before it existed, and say who did it. The
status API's `collab.baseSha` and `collab.branch` carry the same.

### The branch moved underneath

`meta.baseSha` is the commit the live document was built from: set by the
seeding editor from the tip it loaded (`collabLoadedSha()` — a shared, hosted
editor with a token asks GitHub once; anyone else seeds null), and by every
Save since. Before committing to a branch that already existed, Save compares
the branch tip with it (`collabBranchStillOurs()`). If they differ, a commit
landed **outside** the session — a push from a laptop, a docsync tool, an
editor that was not in the room — and a plain fast-forward would silently
replace it with what the room holds. So it is said, with both short SHAs and
where to look, and the person chooses: *Save over it*, or cancel. Nothing is
merged: the two are whole files, and the room's copy is what everyone has
been looking at. A branch Save just created (forked from the deploy branch)
is not checked — the deploy branch moving for another project in the same
repository is not this project's branch moving.

### Carets

Presence now carries `cursor: {slot, rel}` — the caret in the paragraph an
editor has open, as a Yjs **relative position** (`cursorAt()` /
`resolveCursor()` in the session). A relative position names a character,
not an offset, so it stays put while text is inserted and deleted around it,
on this side and every other; when the slot itself is replaced (a section
moved), it resolves to nothing and the caret is simply not drawn.

The editor finds its own caret by marking the DOM selection's focus with a
private-use character in a *clone* of the contenteditable and running the
same `htmlToMd()` the commit runs (`collabHostCaretIndex()`); it draws a
collaborator's by walking the paragraph's text nodes by visible characters
(`collabCaretDom()` — markdown syntax carries no glyphs, a footnote chip is
skipped), then painting a bar in their colour into the page overlay, like a
shape's selection ring. Close enough for a caret; a guess past the end lands
at the end.

### Typing together in one paragraph

An open **paragraph** editor is no longer `busy`. Its words are flushed live
from the presence tick (`collabLiveFlush()`, 4×/s, only when they changed):
the host's DOM through `htmlToMd()`, overlaid on `source` at that slot, diffed
into the document like any other edit — so a collaborator sees the words
land as they are typed, not at the commit. `collabFlush()` overlays the same
way, so a render mid-edit (a citation added) cannot read the live words as
deleted.

A collaborator's change now lands while the paragraph is open
(`collabAdopt()`'s paragraph path): `source`/`layout` take it at once, no
render — nothing repaints under an open editor; `finish()` renders — and if
the document's words for *that* slot changed, the host is rebuilt in place
from the merged markdown with the caret put back (`collabRefreshHost()`).
The caret survives because the session calls `beforeRemote` just before a
remote update lands: the editor flushes its live words *first*, so its diff
is against the text it typed into and Yjs merges the two as concurrent
operations, and notes its caret as a relative position, which resolves to
the right spot afterwards. Mid-IME-composition the rebuild waits for
`compositionend`. Escape still means keep nothing: what was flushed live is
undone as this editor's own step (`collabDiscardLive()`), which leaves a
collaborator's words in the same paragraph standing.

Every other inline editor — a text box, a table cell, a chart label — holds
its words in layout.json, where a remote edit is a whole-string replace. Those
still wait. The sources slot waits too: `writeSlot()` validates it line by
line at the commit, and a half-typed line must not reach the room.

Tests: `client.test.mjs` — a cursor holds through inserts and deletes around
it and dies with its slot; `beforeRemote` runs just before a remote update,
with the old text still in place; a collaborator's Save is announced and our
own is not; a cursor published by A resolves in B and moves with B's edits.
`collab.spec.js` — words reach A while B's editor is still open, with B's
caret drawn at their end, and Escape takes them back; both editors type in
the same paragraph at once, each sees the other's words land around its own
caret, and both keep theirs; a remote edit to another slot lands in B's
source under an open editor and paints when it closes.
`collab-drafts.spec.js` — the room knows the commit it was built from; a Save
goes to the shared branch and disables everyone's Save; a commit landing
outside the session is named in a confirm, cancel leaves the branch alone,
and *Save over it* commits on top of it.

### The AI at work

`#agentnote` was already the past tense — *Claude edited this*, with a
rewind. Phase 4 adds the present tense: a purple, pulsing `#agentlive` chip,
**✦ Claude is editing…**, while an automated editor is changing the report,
and a *✦ Claude · editing* tag on the paragraph or element it is touching,
drawn the way a collaborator's typing spot is. Three sources feed it
(`agentTouch()` in the editor):

- a pilot op running in this tab (`runPilotOps`), named by verb and target —
  the ordinary shape of an AI edit through the MCP server;
- an agent that announced itself to the local server (`POST /__agent/change`),
  and every disk change adopted while that announcement is fresh;
- a collaborator's editor doing either: presence carries `agent` and the room
  paints it with **· via \<login\>**, so a change that arrives from Claude
  through grace's tab is never mistaken for grace's own.

It clears itself — a few seconds after the last pilot op, longer after an
announced agent's last change. `docsync.api.status().agent` carries the same,
and `collab.peerList[].agent` who is relaying one. Tested end to end in
`collab.spec.js`: a pilot op in B shows in A as *Claude is editing · via
grace* with the tag on the paragraph, clears when it is done, and a person's
own edit says nothing of the kind.

## Known gaps, for later

- **Nothing merges an outside commit.** The moved-branch check names the
  commit and lets the person choose; folding it in would need a three-way
  merge on slot text, which the document's per-slot `Y.Text` could express.
- **Carets, not selections.** Only the focus point is shared; a highlighted
  range would be a second relative position and a painted rectangle per
  line.
- **Text boxes still hold.** A box's markdown is one scalar in a `Y.Map`;
  making it a `Y.Text` would let two people type in one box the way they
  now can in one paragraph.
- **`isReadOnly` is wired but nothing mints a read-only ticket.** The `/auth`
  route always sets `ro: false`, because the current permission model is binary
  (push or no access). It exists so a future "commenter" role is a ticket field
  rather than a redesign.
