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

## A second front door: the staff hub

Everything above authenticates against GitHub. The Hawaiʻi Appleseed staff hub
authenticates against Google, through Cloudflare Access, and most of the people
who would use the editor have no GitHub account at all. So the hub has a door
of its own onto the *same rooms*:

```
              ticket (GitHub push)              Access session (Google SSO)
browser ──▶ primer-collab Worker  ──┐      ┌──  hub /api/collab/<room>  ◀── browser
                                     ├─ PrimerRoom ─┤
            /parties/primer-room/…  ─┘  Durable Object └─  functions/api/collab/[room].js
```

The room is untouched. Both doors decide who you are and hand it over on the
same two headers — `x-collab-login` and `x-collab-ro` — which is all the room
has ever read. `isReadOnly` finally has something that sets it: the hub's share
list maps *viewer* to `ro: 1`.

**Why the hub binds the class rather than proxying to the Worker.** The Access
session is a first-party cookie on the hub's hostname; a request from the hub to
`*.workers.dev` would not carry it, and third-party cookie blocking would finish
the job even with `SameSite=None`. There is no zone on the account to give the
Worker a same-site hostname, and a Durable Object cannot be defined inside a
Pages project. So the class stays here and the hub binds it —
`PRIMER_ROOM = PrimerRoom @ primer-collab`.

The client side is one option. `CollabSession` takes a `path` instead of a
`party`, and no `ticket`:

```js
new CollabSession({ host: 'hub.example', room, path: `/api/collab/${room}`, files })
```

`path` is the WHOLE path — y-partyserver's `prefix` is used verbatim and the
room is **not** appended to it, so a path that stops at `/api/collab` puts every
document in one room. `client.test.mjs` pins both shapes for that reason.

### Checking the hop

```bash
node hub-check.mjs [--hub ../../staff-updates-internal]
```

Not part of `npm test`: it needs the hub repo checked out and boots two
wranglers — a `wrangler dev` holding the class, a `wrangler pages dev` over the
hub with the binding — then drives the result with real `CollabSession`s. It
watches the refusals refuse, the identity arrive in the room's `here`, two
clients converge, a viewer's write get dropped *by the room* while they keep
receiving, and the document survive everyone leaving.

Two things it cost an hour to learn, both worth keeping:

- **Run `wrangler pages dev` from the hub's directory, not this one.** From
  here it reads `wrangler.jsonc`, merges in the *local* `PrimerRoom` binding,
  and dies complaining that the Pages shim does not export the class — a
  message about the entrypoint that has nothing to do with the mistake.
- **`fetch()` cannot send an `Upgrade` header.** undici refuses it outright, so
  every refusal check has to go through `node:http` or it looks like a
  client-side `TypeError` rather than the status the Function returned.

Locally the Access header is forgeable, and `hub-check.mjs` forges it. In
production the edge strips `Cf-Access-Authenticated-User-Email` from inbound
requests and re-signs it, which is the only reason the Function may trust it.

## Served from the staff hub

The hub's door (above) only helps if the editor is on the hub's origin, and it
is: `python3 -m docsync.hub` vendors it into
`staff-updates-internal/primer/` — one `edit.html`, one `collab-client.js`, a
`projects.json`, and an `engine/` + `assets/` per project — from every binding
here with an `editor:` block (unless it says `hub: false`) and from every
consumer in `vendor.yml` / `vendor.local.yml`, each staged by its own vendored
`docsync.stage`. The hub's path comes from `hub:` in `vendor.local.yml`, and
the post-commit hook runs it after `docsync.vendor`, so the hub's working tree
is always current; committing there is a person's act, because a push there is
a deploy. The list page, `primer/index.html`, is the hub's own file and is
never written by the vendor.

What differs for an editor served there, and nothing else does:

- Its registry entry says `"collab": {"path": "/api/collab", "me": "/api/me"}`
  instead of `"url"`. `collabDoor()` in `edit.html` returns the one or the
  other; on a path the editor mints no ticket and asks for no token — the
  socket goes to `location.origin + path + '/' + room`, and the Access
  session the page already carries is what the door checks. `/api/me` names
  the person for presence; the room itself learns the login from the header
  the door set and trusts nothing the client says.
- The manifest's `repo` is canonicalised to the source checkout's origin
  (`Hawaii-Appleseed/…`), because that is the room's name and the hub serves
  only those spellings.
- The document itself lives in the hub's store, not in git. The same door
  names it — `"docs": "/api/docs"` — and `docStoreDecide()` in `edit.html`
  settles it ONCE at boot, right after local mode is known: on that path the
  document is loaded from `/api/docs/<room>` over the vendored copy, Save
  PUTs it back, an image upload POSTs to `…/assets/<name>`, and the git
  verbs (draft branch, Share, Publish, Push) hide. The store's version stamp
  plays the part a commit sha played: it seeds the room's `meta.baseSha`, a
  Save carries it as `base`, and a store that moved past it (a Save from a
  session this browser was not in) answers 409 and the person chooses —
  `collabBranchStillOurs`'s rule, on a store that cannot merge either. Every
  Save is kept whole under `history/<version>/`. No GitHub credential
  anywhere in a hub-served editor. Server side: the hub's
  `functions/api/docs/[[path]].js` (R2 binding `PRIMER_DOCS` → bucket
  `primer-docs`) and `functions/primer/[id]/assets/[name].js`, which serves
  an uploaded image at the very path the layout names, ahead of the vendored
  file. Pipeline reports (the Budget Primer) still BUILD from git and are
  vendored from their repo's checkout; what staff edit on the hub is the
  store's copy of that, and nothing flows back to git until step 05's export.

Proof: `npx playwright test collab-hub.spec.js` vendors this tree's editor
into the hub checkout beside this repo, boots the same two wranglers
`hub-check.mjs` does (with local R2), and opens the editor in two browser
contexts carrying Access identities — the list page names the project, both
are live in one room as the people Access says they are, an edit crosses, a
Save lands in the store and the other editor learns the version, a fresh
editor loads the stored document, an upload is served at the project path,
and no token was asked for. Skipped when the hub is not checked out beside
this repo. The handlers alone: `node dev/test_docs.mjs` in the hub.

## Export to git (step 05)

What the store gives up by leaving git — a log, blame, a diff on github.com,
a clone as an off-Cloudflare backup — comes back on a schedule instead of the
hot path. `src/export.js` writes ONE commit of a document's current state to
`hub/<project>` in its repository: the two files at the paths the editor
recorded in meta on every Save (`paths`), every uploaded image as a blob at
the assets path, parented on the branch's tip, the branch made from the
deploy branch the first time. `docs/<room>/export.json` remembers the last
version exported, so an unchanged store writes nothing. The deploy branch is
never touched: a pipeline report builds from main on a machine, and an
editor-native one is published by a person merging what this wrote.

Two ways it runs, both in this Worker, because this is the one place a
GitHub credential may live — `GITHUB_EXPORT_TOKEN`, a fine-grained PAT with
Contents read/write on the repositories in `ALLOWED_REPOS` and nothing else:

- **Publish, from the hub.** The editor's Publish on the store path POSTs
  `/api/docs/<room>/publish`; the hub's Function asks this Worker's
  `POST /export/<room>` with the shared `EXPORT_KEY` (a secret on both sides)
  and hands the answer back — the commit's sha and URL, or the refusal in
  words. The key lets a caller cause a commit of what the store already
  holds and nothing else.
- **Nightly**, `0 14 * * *` UTC (04:00 Hawaiʻi): `scheduled()` sweeps every
  room and exports the ones whose version the branch lacks. A room failing
  fails that room only.

`GITHUB_API` (a var) points the Worker at a test double. `export.test.mjs`
drives the export against an in-memory Git Data API: first export makes the
branch and commits files and assets, an unchanged store is silent, a new
version is one more commit on the same branch, main is untouched, no
recorded paths is a refusal, the sweep survives one failure.

## Who may open it, and as whom (step 06)

The hub's share record (`functions/api/collab/share/`) was enforced from the
day the door opened — a viewer's socket is read-only in the room, and the
store refuses their Save. What step 06 adds is the editor SAYING so and
letting people change it:

- **Share…** on the store path opens the share dialog: a default for everyone
  through Access (can edit / view only / no access) and named exceptions.
  Anyone who can edit can re-share; a viewer sees the record and cannot
  change it. Sharing outside the staff domains is not a row — the dialog
  says it is a change to the hub's sign-in.
- **A viewer is told.** `hubShareLoad()` reads the record at boot: the chip
  says `· view only`, Save and Publish stay off, an upload is refused before
  it starts, and the status line says edits here are not kept. The room and
  the store enforce; the editor only spares the person the surprise.
- **Names.** `/api/me` on the hub answers `{email, name}`, the name from the
  staff roster (`data/staff.json`) — so presence says "Abbey" rather than an
  address. It rides awareness as `name` beside `login` (the identity stays
  the email); `peerOf()` passes it through and the chip prefers it. No
  avatars: the roster has none, and Access's identity endpoint was not
  relied on for a picture it may not carry.

## Versions, comments, and what changed (step 07)

- **History** on the store path lists every Save (`/api/docs/<room>/history`),
  lets an editor name a version (`PATCH …/history/<v>` `{label}`) and bring
  one back (`POST …/restore` `{version}`). A restore is a NEW version on top
  — nothing saved is lost, and the log reads "restored from …". The editor
  adopts the files the way a collaborator's change lands and records the
  version the way a Save does, so the room gets it through `meta.baseSha`.
- **Who is where, by name.** A collaborator's selection has always been
  ringed in their colour with a tag, their open paragraph marked, their caret
  drawn (Phase 3); the tag now says the person — the roster's name, else the
  local part of the address — never a whole email.
- **Comment on this element.** The arrange strip (what an element shows when
  selected) carries a comment button on the store path: one click opens the
  panel with that element named as the anchor and the box focused. The
  panel puts comments on the current selection first, under "On the
  selection", and the strip's button glows when the selection already has
  open comments. `docsync.api.select(ids)` selects the way a click does, so
  a pilot (or a spec) can do the same.
- **Comments** live beside the store's files (`comments.json`), not in the
  Yjs document — a note about the document is not part of what renders or
  exports. Anchored to a slot key or element id, or to the document. Anyone
  who may open the document may comment and resolve; only the author
  rewords; the author or the owner deletes. The panel refreshes itself every
  15 s while open, and every open anchored comment puts a small orange
  marker on its paragraph or element inside the report (`hubCommentsPaint`,
  called from `wire()` like the peer marks).
- **What changed since you looked.** The editor records the version it
  showed as `localStorage['primer-seen:<room>']`. The hub's `GET /api/docs`
  answers every document the person may open with its version, who saved
  it, and its open comments; `primer/index.html` marks the ones that moved
  and sorts them first, and the Editor tab on every hub page wears the count
  (`assets/nav.js`, the calendar badge's pattern). No email, no push: a badge
  where people already look, on data the store already had.

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
- **Comments do not follow a rename.** A comment is anchored to a slot key or
  element id; a renderer that renames one leaves the comment on the document.
- **Export is one-way.** Nothing merges a commit someone makes on `hub/<id>`
  back into the store; the store is the live copy and the branch its record.
- **No read-only ticket on the GitHub door.** `/auth` always sets `ro: false`,
  because that permission model is binary (push or no access). The hub's door
  does set it — a *viewer* in its share list connects `ro: 1` — so the
  enforcement is now exercised; it is only this route that has nothing to say.
