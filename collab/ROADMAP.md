# Collaboration roadmap — seamless to edit, share and organise

What is left between the editor on the staff hub as it stands (collab/README.md:
Phases 0–4, hub steps 02–07, Google-Docs-shaped comments) and something a
colleague never has to think about. Ordered by how much friction each removes
per day of work. A scheduled Claude session works this list top to bottom,
one item per run where it can, tests first, and moves finished items to the
bottom under **Done** with the commit.

Ground rules for whoever picks this up (a person or the 6 am session):

- Engine changes are made in `~/primer-editor` (`docsync/editor/edit.html`,
  `collab/`), hub changes in `~/staff-updates-internal` (`functions/api/`,
  `primer/`, `assets/`). The post-commit hook vendors the editor into the hub;
  commit primer-editor first, then the hub.
- Proof before done: `npx playwright test tests/editor/collab-hub.spec.js`
  (boots two wranglers, ~1.5 min), `node dev/test_docs.mjs` in the hub,
  `cd collab && npm run build:client && node --test client.test.mjs` after
  touching the session, `npx playwright test tests/editor/boot-errors.spec.js`
  after touching edit.html's stylesheet (it is a template literal).
- Verify every layout change at 375px as well as desktop.
- `collab.spec.js` (the relay path) serves the STAGED editor under
  `docs/primer/`, which the commit hook refreshes — so before running it
  against uncommitted edits to `edit.html`, `python3 -m docsync.stage --id
  budget-primer`, or it quietly tests the last commit. The hub spec vendors
  the working tree itself and has no such trap.
- Push only when told to in the message that asks for the work; the
  scheduled session may push its own commits (the person asked for that).

## Needs a human

- **A daily digest email for comments that name you.** The hub has no way
  to send mail: Pages functions have no mail binding, and the only outbound
  path today is the Apps Script's Slack webhook. Two decisions, then it is
  an hour's work: (1) a sender — a MailChannels/Resend/SES API key as a
  Pages secret (`MAIL_KEY`) and a From address; (2) a clock — Pages has no
  cron, so either a Worker with a cron trigger calling a new
  `GET /api/docs/digest` with a Cloudflare Access **service token**
  (`CF_ACCESS_CLIENT_ID/SECRET` secrets, and the Access policy widened to
  the token), or the Apps Script's time trigger doing the same. The summary
  already knows what to say: `for_you` / `for_you_at` per person. The
  same sender would serve Share's "notify people by email" (left out of
  the dialog until it can be true).

## Now — the next runs

1. **Suggestions, the last stretch.** A suggestion on a text box's
   words (they live in layout as a scalar today, so a box edit reads as
   "change box"), and a suggestion shown at its place in the margin
   beside the words it proposes.


## Organising project files

2. **Folders and tags on the hub's list page.** Projects grouped by folder
   (a `folder` field in the registry, editable from the list), tags as
   chips, a search box that filters by name, tag, and last editor. Drag a
   tile onto a folder. Remember the person's last view.
3. **Rename, duplicate, archive, delete from the list.** Each tile's ⋮:
    rename (updates the registry and the room name safely — the room is
    named by project id, so rename the display name only), duplicate as a
    new project (files + assets + no comments), archive (hidden from the
    default view, restorable), delete (owner only, to a trash folder in R2
    with a 30-day sweep).
4. **Starred and recent.** A star on each tile and a "Recent" row at the
    top of the list — the documents this person opened last, from the
    `primer-seen` keys the editor already writes.
5. **Assets library per project.** Insert image shows what has already
    been uploaded to this project's store with a thumbnail and who added it,
    delete an unused one, and a project-wide "images in use / unused" view.
6. **Move a section between projects.** Copy a slot (words + layout +
    assets it names) into another project as a new section — the pilot
    `addExtra` + `setSlot` path, from a "Copy to…" on the section menu.

## Aesthetic

7. **One quiet chrome.** The comments panel, share dialog, history and
    the top bar on the hub path share one type scale and one radius set
    (`--r-ctl`/`--r-card`/`--r-edge`), one shadow, and the hub's own palette
    (Ash/Teal/Slate/Charcoal, Manrope/Poppins). Audit every new surface at
    375px.
8. **Motion that explains.** A card raising when its highlight is clicked,
    a highlight pulsing once when its card is hovered, the "+ Comment" pill
    fading in beside the selection, the reply box growing — 120–180 ms, no
    bounce.
9. **Empty states that teach.** No comments yet: a two-line hint with the
    shortcut. First time on the hub: what Save does here. No projects: how
    to make one from a template.
10. **Dark mode for the chrome** (not the report), following the OS.

## Done

- 2026-09-05 — The margin keeps up and keeps still: reads before writes and
  transforms on a scroll, a reconciled list instead of a rebuilt one on a
  click, comments shown at once with the hub asked after; and editing in
  place looks like the page (heading marker hidden, inline styles worn)
  (primer-editor e4f28cd).

- 2026-09-05 — The margin finished: the new comment is a card at its anchor
  once it is in use, a line joins the card in hand to its words, and a card
  taller than the gutter scrolls inside itself (primer-editor 38278b0,
  hub f5fa727).

- 2026-09-05 — Suggestions counted and decided in bulk: "Accept all N" /
  "Reject all N" on the panel (one question, then each through its own
  path, so one undo step each), and the list page's tile, its count line
  and the Editor tab's badge all say how many wait on an editor
  (primer-editor 4feea0f, hub f9ce2d5).

- 2026-09-05 — Offline that says so: a band above the page while the
  session is down, gone on its own when it is back with "what you did
  offline is shared now"; the relay spec proves an edit made offline
  reaches the other editor after the reconnect (primer-editor 3e95091,
  hub 550ba96).

- 2026-09-05 — Autosave on the hub: a quiet two seconds after an edit is a
  Save; not mid-word, not mid-Save, held after a 409 or a failure until Save
  is pressed; "Saved · just now" on the button; off per browser from the
  File menu (primer-editor 2effa3b, hub 0593c8d).

- 2026-09-05 — Version history as Docs' side panel: grouped by day, Named
  only, a version opens on what it changed (per paragraph, words gone and
  come; paragraphs only on one side; the layout), marks it on the page with
  a toggle, Restore and naming from the same rows; the list never rebuilds
  under a name being typed (primer-editor 1da335c, hub f15cc87).

- 2026-09-05 — Share as Docs lays it out: the link first with Copy, the
  owner named, people with faces and roster suggestions, everyone on the
  hub closing the list; fits a phone (primer-editor d2d2446, hub 18c49af).

- 2026-09-05 — Presence at a glance: avatars in the bar (initial, colour,
  typing dot, "Ada · typing on page 2" as the title), a click goes to where
  they are, a second click follows them until a gesture, the avatar again,
  or their leaving stops it (primer-editor 290c3d0, hub 91f5070).

- 2026-09-05 — For you, where people already look: the store's summary
  answers `for_you` / `for_you_at` per person (one shared rule), the list
  page wears "N for you" (a click opens the editor on the For you tab), the
  count line says it, the Editor tab's badge counts documents that want you
  and says why, and the editor records when you looked so the badge rests
  (primer-editor 678d946, hub 0ab3b5f). The digest email is under
  "Needs a human".

- 2026-09-05 — Comments in the margin: on a wide window the panel is a
  gutter the stage makes room for, each card beside its words, none
  overlapping, the one in hand at its place with the rest nudged clear,
  riding the page's scroll and zoom; List / Margin switch kept; the list
  below 1100px and on a phone (primer-editor 7925b30, hub 862fa56).

- 2026-09-05 — History and restore tested to their edges; the restore-
  reaches-an-editor-with-unsaved-edits session fix (primer-editor f2327f7,
  hub c8bcb02).
- 2026-09-05 — Comments the way Google Docs does them: quotes, highlights,
  "+ Comment", ⌘⌥M, replies, Edit, Delete, Show, Copy link, @-mentions,
  For you; the obvious failure modes closed (lost comment updates, expired
  sign-in passing for a Save, room behind the store) (primer-editor 85097f5,
  hub 3fefae0).
- 2026-09-05 — Suggesting mode: a viewer's or an editor's edit proposed as
  a thread with the change, drawn inline, accepted or rejected from the
  card (primer-editor f4023c4, hub 3ce43cc).
