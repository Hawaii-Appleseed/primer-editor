# primer-editor — the docsync draft editor engine

> Deeper playbook: the **`report-editor` skill** (`.claude/skills/report-editor/`)
> — load it when building or changing anything a report's user should be able
> to edit. This file is the always-on summary.

## Default to driving the editor, not editing files

When the user asks for a visual/content change — move, resize, restyle,
retext, recolor an element, swap an image, adjust a chart — **drive
`edit.html`** instead of editing `content.md` / `layout.json` / any file
directly. That is what the editor is *for*: a drag writes `layout.json` and
nothing else, Save is a local commit the user reviews before Push, and the
browser session has no reach into `docsync/*.py` or the renderer even by
accident.

**Drive it through `window.docsync.api`, not through clicks.** The editor
exposes a pilot API — one JS eval per action, same safety as the UI (every
verb runs `pushHistory()` first so ⌘Z undoes it, writes land through the one
`render()` with all its validation, and every verb returns plain JSON with
geometry in page inches so no screenshot round-trips are needed). The loop
is: `docsync.api.inventory()` once to learn every element id, slot key and
bounding box, then act by id:

```js
await docsync.api.setSlot('whopays.p1', '…new markdown…')
await docsync.api.place('cover.logo', { x: 1, y: 4 })   // inches; clamps like a drag
await docsync.api.recolor('page.3', '#FFF6D8')          // null = reset
await docsync.api.addTextBox({ page: 3, x: 1, y: 1, w: 2.5, md: 'Note' })
docsync.api.save()      // presses the real Save; Push stays with the human

// Several edits as ONE undo step and ONE render — batch() over separate
// calls whenever the edits are related. All-or-nothing: a bad op refuses
// the whole batch before anything mutates. Verbs: setSlot, place, recolor,
// addTextBox, addSource — not addPage/addEndnotesSection, which push their
// own history internally and so cannot join one.
await docsync.api.batch([
  { verb: 'setSlot', args: ['whopays.p1', '…new markdown…'] },
  { verb: 'place', args: ['cover.logo', { x: 1, y: 4 }] },
])
```

Full verb list and contract: `pilot-api.spec.js` is the executable spec;
the `report-editor` skill documents it. Reserve clicking/dragging for what
the API doesn't cover, and screenshots for visual judgement calls only.

Only edit repo files directly when the user's instruction is explicitly about
the files or the code — "edit content.md", "fix the renderer", "change how
tables render", "update layout.py", or similar. If a request is ambiguous
("make the intro shorter"), prefer the UI; it is reversible in the same way a
human's own edit would be, and never risks touching engine code that vendors
out to every consumer repo on commit (see below). Say which mode you're in if
it isn't obvious from the request.

This repo is the **canonical home of the editor engine**: `docsync/` (content,
layout, blocks, stage, fragment), `docsync/editor/edit.html`, and
`report2027/tools/serve.py`. The `report2027/` report here is a **test
fixture** — a full copy of the Budget Primer used by the Playwright suite —
not the live report. The live report lives in `~/BudgetPrimerFinal`, which
**vendors** engine files from here.

Rules that bite:

- **Engine changes are made HERE, and vendoring is automatic.** A commit that
  touches `docsync/` or `report2027/tools/serve.py` triggers
  `.githooks/post-commit`, which runs `python3 -m docsync.vendor`: it copies
  every git-tracked engine file (the package IS the manifest — no list to
  maintain) into each consumer in `vendor.yml`, restages that repo's editors,
  and commits the engine paths there (local only; deploying stays each repo's
  own Push). New consumer repo = one line in vendor.yml. Fresh clone of THIS
  repo = run `git config core.hooksPath .githooks` once. The vendor refuses a
  consumer whose engine paths are dirty — engine edits must never originate
  in a consumer, and content/design changes in a report repo never flow back.
- **`docs/` is generated, not source.** Each report's `edit.html` and
  `engine/` there, and the built report itself, are written by
  `make -C report2027 pub` (which the live server runs on startup) and are
  untracked. Edit `docsync/editor/edit.html` and re-stage; never edit a staged
  copy. Only the editor's shell — `start.html`, `sw.js`, icons, the manifest —
  is tracked under `docs/`.
- **`edit.html`'s stylesheet is a JS template literal** — a backtick or `${…}`
  even in a CSS comment kills the whole script (editor hangs at "loading the
  render engine…", no console error). After any edit: `npx playwright test
  boot-errors.spec.js`, or minimum `node --check` the inline script
  (`report2027/tools/test_render.py` does this).
- **Shared building blocks live in `docsync/blocks.py`** (`graphic()`,
  `card(detachable=…)`, `is_light_bg`) — zero-stylesheet, importable by any
  project renderer, staged into the browser engine automatically. Add new
  reusable capabilities there, not in one report's renderer.
- **Tests:** `npx playwright test` (editor behaviour; 276 specs),
  `python3 docsync/test_docsync.py` (engine round-trip),
  `python3 report2027/tools/test_render.py` (render tolerances + edit.html
  syntax guard). `make -C report2027 validate` chains them but its
  build_data step needs fixture data files this repo doesn't carry — run the
  three directly. All 276 pass clean as of 2026-07-27 — if you inherit a
  failure, suspect your own change first, but see the two traps below before
  chasing a ghost.
- **Never launch or kill a dev server the user owns**; Playwright starts its
  own throwaway servers and that's fine.
- A report is bound in **`docsync.yml`** (id, content, build command, editor
  block); `python3 -m docsync.stage --id <id>` stages the editor + engine next
  to that report's published dir.
- **Bringing in a static HTML page**: `python3 -m docsync.scaffold page.html
  --id <slug>` does STAGE ONE (openable) automatically — project dir, wrapper
  renderer, docsync.yml binding, build + stage. Then `python3 -m
  docsync.propose --id <slug>` mechanically wires every substantial text
  leaf as an editable slot (worked example: `projects/our-mission`). The
  remaining STAGE TWO judgment work (renames, chrome pruning, widget
  restructuring) and what's still automatable is scoped in
  `docsync/STAGE2_AUTOMATION.md`.

## Recent architecture (2026-07), so you don't rediscover it

- **Page resize is real, not cosmetic.** `layout.py`'s `Layout` reads an
  optional `"page": {"w": 8.5, "h": 11}` (or `"h": null` for pageless) from
  layout.json and emits matching `.page`/`@page` CSS via `layer()`'s
  `_page_style_once()` — so the preview, the published HTML and the printed
  PDF all agree. The editor's `File ▸ Resize` writes that field and calls
  `syncPageSize()`, which keeps the JS globals `PAGE_W_IN`/`PAGE_H_IN` (every
  clamp, guide and align rule) in step. **`syncPageSize()` must run in
  `boot()`**, not in `restoreCachedDraft()` — a stray anchor once put it in
  the wrong one and a resized report silently kept the OLD geometry for every
  drag/clamp rule while rendering the new sheet. If you touch boot-time
  layout normalisation, grep for `syncPageSize()` and confirm both call
  sites still make sense before you commit.
- **The File menu** (`#file` / `#filepop`) is the top-left entry point:
  Open (switch project — the old `#proj` `<select>` is gone), Resize, and
  Download/Token moved in from the bar (same ids, same handlers). `+ Section`
  is hidden via `#add { display:none }` only — still fully wired.
- **Auto-update + rollback** (`tools/selfupdate.py`, `serve.py`'s
  `/__update` and `/__rollback`, the editor's version chip `#ver`/`#upd`):
  an update REBASES the user's local Save commits on top when their files
  don't overlap with the incoming ones, refuses (naming the file) when they
  do. `apply_update()` records the pre-update SHA in
  `.primer-previous-version` (gitignored) so `--rollback` can `reset --hard`
  back to it — safe there specifically because that commit already includes
  the user's own prior saves. The server checks in the background every 20
  min (`UPDATE_POLL`), not just at launch.
- **Dismiss-on-outside-click** (`closeOnOutsideClick` /
  `closeOnOutsideClick`'s per-render twin `bindOutsideClose`): a click
  inside the report iframe does NOT bubble to the parent document, so it
  needs its own listener, rebound every render. Table/Chart/Colour panels
  are deliberately exempt (`RAIL_PICKERS` only covers Text/Shape/Icon) —
  they describe a selection and are used WHILE clicking the canvas. A click
  while any `dialog[open]` exists is ignored outright.
- **Chrome is one system now**: `--canvas` is the single grey behind the
  report, the contextual toolbar card, and `#work`'s background (the last
  one exists specifically so the rail's rounded corners don't show white
  wedges). `--r-ctl`/`--r-card`/`--r-edge` are the only three border-radius
  values anything should use. `--rail-w` is border-box — if you add another
  surface anchored to `left: var(--rail-w)`, this is why it lines up.
- **Contextual strip never shows an element's raw id** (`cover.logo` etc.)
  — it showed a count or nothing, with the id on `title=` only. If you add a
  new selection-summary field, keep that rule.
- **Page strip folds and remembers per project**
  (`localStorage['primer-rail-folded:'+M.id]`, restored in `boot()`).
- **A rewritten test that only asserts a CSS declaration (`justify-content:
  center`, a class name, a boundingBox read right after a CSS transition
  starts) can pass against the exact bug it's meant to catch.** This bit us
  three times in one session — always verify a new/rewritten assertion FAILS
  on the pre-fix code before trusting it, not just that it passes on the fix.
