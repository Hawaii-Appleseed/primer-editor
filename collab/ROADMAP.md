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
- Push only when told to in the message that asks for the work; the
  scheduled session may push its own commits (the person asked for that).

## Now — the next runs

1. **Comments in the margin.** Cards pinned beside their anchor (a right
   gutter the page frame leaves room for when the panel is open), stacked
   without overlap, the active one nudging the rest — the one visible
   difference from Docs left. Scroll the page and the cards follow.
   Fall back to the ordered list below a narrow width.
2. **Comment notifications that reach people.** Mentions and replies are
   only seen by opening the document. Add "For you" to the hub's list page
   and nav badge (the store already knows mentions), and a daily digest
   email through the hub's existing mail path for threads that name you.
3. **Presence you can see at a glance.** Avatars of who is in the document
   in the top bar (initials, colour, name on hover), "Ada is typing in §2"
   as a jump link, and a "follow Ada" mode that scrolls with her.
4. **Share, like Docs' dialog.** A "Share" button top-right with a copy-link
   field, a people list with roles, a "notify by email" checkbox, and a
   link that opens straight to the document (works today, just not from
   here). Show avatars of who has access in the dialog.
5. **Version history like Docs' side panel.** The History dialog becomes a
   panel: versions grouped by day, named versions first, a diff view of one
   version against the current (per slot, words added/removed), restore
   from the panel, "show changes" toggle that colours changed paragraphs.
6. **Autosave on the hub.** With the store as the record, every quiet
   two seconds after an edit is a Save (the room already carries the live
   document, so nothing is lost either way — this only removes the button
   from people's minds). Keep the Save button as "Saved · just now".
   Guard: not while a paragraph editor is open mid-word; not on a 409.
7. **Offline that says so.** The chip already reads offline; add a banner
   "working offline — edits are kept here and shared when you are back",
   and prove a reconnect merges (there is a test; make the UI honest).

8. **Suggestions, the rest of the way.** A suggestion on a text box's
   words (they live in layout as a scalar today, so a box edit reads as
   "change box"); the list page and nav badge counting open suggestions;
   "Accept all" / "Reject all" on the panel; a suggestion shown at its
   place in the margin once cards live there.

## Organising project files

9. **Folders and tags on the hub's list page.** Projects grouped by folder
   (a `folder` field in the registry, editable from the list), tags as
   chips, a search box that filters by name, tag, and last editor. Drag a
   tile onto a folder. Remember the person's last view.
10. **Rename, duplicate, archive, delete from the list.** Each tile's ⋮:
    rename (updates the registry and the room name safely — the room is
    named by project id, so rename the display name only), duplicate as a
    new project (files + assets + no comments), archive (hidden from the
    default view, restorable), delete (owner only, to a trash folder in R2
    with a 30-day sweep).
11. **Starred and recent.** A star on each tile and a "Recent" row at the
    top of the list — the documents this person opened last, from the
    `primer-seen` keys the editor already writes.
12. **Assets library per project.** Insert image shows what has already
    been uploaded to this project's store with a thumbnail and who added it,
    delete an unused one, and a project-wide "images in use / unused" view.
13. **Move a section between projects.** Copy a slot (words + layout +
    assets it names) into another project as a new section — the pilot
    `addExtra` + `setSlot` path, from a "Copy to…" on the section menu.

## Aesthetic

14. **One quiet chrome.** The comments panel, share dialog, history and
    the top bar on the hub path share one type scale and one radius set
    (`--r-ctl`/`--r-card`/`--r-edge`), one shadow, and the hub's own palette
    (Ash/Teal/Slate/Charcoal, Manrope/Poppins). Audit every new surface at
    375px.
15. **Motion that explains.** A card raising when its highlight is clicked,
    a highlight pulsing once when its card is hovered, the "+ Comment" pill
    fading in beside the selection, the reply box growing — 120–180 ms, no
    bounce.
16. **Empty states that teach.** No comments yet: a two-line hint with the
    shortcut. First time on the hub: what Save does here. No projects: how
    to make one from a template.
17. **Dark mode for the chrome** (not the report), following the OS.

## Done

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
