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

- **Engine bugs are fixed HERE first**, then the changed file is copied to the
  consuming repo(s). Content/design changes in a report repo never flow back.
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
  --id <slug>` does STAGE ONE (openable, not editable) automatically —
  project dir, wrapper renderer, docsync.yml binding, build + stage. Making
  it editable (STAGE TWO) is a per-page AI/hand job; what could shrink that
  is scoped in `docsync/STAGE2_AUTOMATION.md`.
