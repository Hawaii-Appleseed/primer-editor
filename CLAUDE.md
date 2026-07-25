# primer-editor — the docsync draft editor engine

> Deeper playbook: the **`report-editor` skill** (`.claude/skills/report-editor/`)
> — load it when building or changing anything a report's user should be able
> to edit. This file is the always-on summary.

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
- **Tests:** `npx playwright test` (editor behaviour; ~190 specs),
  `python3 docsync/test_docsync.py` (engine round-trip),
  `python3 report2027/tools/test_render.py` (render tolerances + edit.html
  syntax guard). `make -C report2027 validate` chains them but its
  build_data step needs fixture data files this repo doesn't carry — run the
  three directly.
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
