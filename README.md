# primer-editor

The **docsync draft editor** — a single-file, browser-based WYSIWYG editor that
runs a report's *real* Python renderer in the browser via Pyodide, so what you
edit is exactly what the report will build. This repo is the editor's home:
its source, its engine, its tooling, and its tests all live here.

It ships with the **Hawaiʻi Budget Primer** as its bundled demo and test
fixture — the editor is nothing without a report to render, and the test suite
asserts against that report's real content.

## What's here

| Path | What it is |
|------|-----------|
| `docsync/editor/edit.html` | the editor itself (the canonical source; one file, no build step) |
| `docs/primer/` | the **staged** editor + engine + demo, as GitHub Pages serves it (`start.html`, `edit.html`, `htmlimport.js`, `sw.js`, `manifest.webmanifest`, `icons/`, `engine/`) |
| `docsync/*.py` | the **engine**: `content.py` / `layout.py` / `normalise.py` run in Pyodide; `stage.py` / `registry.py` assemble a project's engine beside the editor |
| `report2027/` | the bundled Budget Primer demo — `content.md`, `layout.json`, `tools/render_report.py`, data — that the editor renders and the tests exercise |
| `report2027/tools/serve.py` | the local live server: watch-rebuild-reload, plus `/__save` (commit locally) and `/__push` (send to GitHub) |
| `report2027/tools/make_launcher.sh` | builds a double-clickable macOS `.app` that boots the server and opens the editor |
| `tests/editor/` | the Playwright suite (170+ specs) — runs against the real `serve.py` with GitHub fully mocked; never touches the network |

## Run it

```
make -C report2027 live          # http://localhost:8010/primer/edit.html
# or build the .app launcher:
./report2027/tools/make_launcher.sh   # -> ~/Applications/Budget Primer Editor.app
```

`make live` starts `serve.py`: it rebuilds the report on any change and reloads
the browser, so an edit shows in ~1s. **Save** writes the files and commits
*locally only*; **Push** is a separate, explicit trip to GitHub.

## Test it

```
npm ci
npx playwright test          # the full editor suite
python3 docsync/test_docsync.py   # the engine's own self-test
```

## Architecture: one editor, many reports

The editor knows nothing about any particular report. Everything specific — the
renderer, what it reads, the page size, the palette — comes from
`engine/manifest.json`, staged beside the editor from `docsync.yml` by
`python3 -m docsync.stage`. A second report is a second registry entry, not a
second editor. The editor's landing page (`start.html`) can **connect** a new
repo or **adopt** an existing project, and each project records its own repo and
deploy branch.

### The shared engine

`docsync/` (the `content.py` / `layout.py` renderer) is a shared dependency: the
editor runs it in Pyodide, **and** a report repo's own build (`render_report.py`
→ `make pub`) imports it. This repo owns it. A report repo (e.g.
`BudgetPrimerFinal`) **vendors a synced copy** — the editor already stages a copy
of the engine into every project it serves, so the pattern is native. A report
repo keeps its own `serve.py` + vendored editor for the sub-second local
fast-loop; it refreshes them from here with a small sync script when it wants
the latest editor.

So: **editor development happens here**; reports pull updates when they choose,
and their fast local loop never depends on a network.
