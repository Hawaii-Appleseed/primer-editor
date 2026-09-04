# primer-collab

Real-time collaborative editing for the docsync draft editor: one Cloudflare
Durable Object per project, holding a Yjs document that two or more browsers
edit at once.

Phase 0 (the file⇄document bridge) is in [PHASE0.md](PHASE0.md).
Phase 1 (this Worker) is described below.

```
collab/
  serialize.mjs        Phase 0: content.md + layout.json  <->  document
  src/auth.js          who may open a room, and the ticket that proves it
  src/index.js         the Worker: POST /auth, and the websocket gate
  src/room.js          the Durable Object: one project document
  src/persist.js       chunked snapshot storage
```

## Running it

```bash
cd collab
npm install
npm run dev          # wrangler dev on :8787
npm test             # 24 assertions: unit + end-to-end against a real Worker
COLLAB_E2E=0 npm test   # unit only, no wrangler
```

The end-to-end tests boot a real `wrangler dev` (Miniflare — real Durable
Objects, real websockets, real storage) and drive it with two independent Yjs
clients. Nothing touches GitHub: tickets are minted locally with the
development signing secret.

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
`"oauth"` entry. That flag is what Phase 2 will switch collaborative mode on
with, per project.

## Known gaps, for Phase 2

- **Nothing in `edit.html` connects to this yet.** That is Phase 2: mirror
  `source`/`layout` off the Y.Doc, route writes through a `tx()` wrapper, and
  replace the snapshot undo stack with `Y.UndoManager`.
- **`wrangler dev` is not in the Playwright `webServer` list.** The config
  takes a single server object, so adding a second means restructuring it, and
  no spec needs the Worker until the editor actually connects. Do it in Phase 2
  along with the first multi-context spec.
- **Awareness carries no presence payload yet.** The transport is there
  (y-partyserver fans awareness out already); deciding what goes in it —
  login, colour, cursor, drag state — is Phase 3.
- **`isReadOnly` is wired but nothing mints a read-only ticket.** The `/auth`
  route always sets `ro: false`, because the current permission model is binary
  (push or no access). It exists so a future "commenter" role is a ticket field
  rather than a redesign.
