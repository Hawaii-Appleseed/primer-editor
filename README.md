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
| `docs/` | the editor's own shell — `start.html`, `sw.js`, `manifest.webmanifest`, `icons/` — plus, once built, each report's staged copy. **The staged parts are generated and untracked**: `edit.html`, `engine/`, and the built report are written by `make -C report2027 pub`, which the live server also runs on startup. Nothing here is published; the Budget Primer deploys from its own repo. |
| `docsync/*.py` | the **engine**: `content.py` / `layout.py` / `normalise.py` run in Pyodide; `stage.py` / `registry.py` assemble a project's engine beside the editor |
| `report2027/` | the bundled Budget Primer demo — `content.md`, `layout.json`, `tools/render_report.py`, data — that the editor renders and the tests exercise |
| `report2027/tools/serve.py` | the local live server: watch-rebuild-reload, plus `/__save` (commit locally) and `/__push` (send to GitHub) |
| `report2027/tools/make_launcher.sh` | builds a double-clickable macOS `.app` that boots the server and opens the editor |
| `tests/editor/` | the Playwright suite (170+ specs) — runs against the real `serve.py` with GitHub fully mocked; never touches the network |

## Install

Requires **Python 3.10+**, **git**, and — only for PDF/PNG export — **Chrome**.

```
git clone https://github.com/dtomkatsu/primer-editor && cd primer-editor
python3 -m pip install -r requirements.txt
make -C report2027 live          # http://localhost:8010/primer/edit.html
```

`make live` runs `tools/preflight.py` first: it checks the Python version and
PyYAML, arms the vendoring git hook, and tells you if Chrome is missing. It is
idempotent — it runs on every start and only reports what needs attention.

Nothing else is required. There is no build step, no bundler, and no account:
the editor is one HTML file and the renderer is your report's own Python,
running in the browser via Pyodide.

Optional, macOS only — a double-clickable launcher:

```
./report2027/tools/make_launcher.sh   # -> ~/Applications/Budget Primer Editor.app
```

### Two files that are yours, not the repo's

| File | What it is |
|------|-----------|
| `docs/primer/projects.json` | which reports your start page lists, and where their files live on **this** machine. Untracked — copy `projects.example.json` if you want to customise it. Without it, every report in `docsync.yml` is still served. |
| `vendor.local.yml` | other repos on this machine that vendor this engine, synced by the post-commit hook. Untracked; `vendor.yml` ships empty so a clone never writes into a checkout it does not have. |

Where a report's **Save/Push** goes is recorded per project in its staged
`engine/manifest.json`. It defaults to your own checkout's `origin`, and the
editor asks the first time if there is none.

`make live` starts `serve.py`: it rebuilds the report on any change and reloads
the browser, so an edit shows in ~1s. **Save** writes the files and commits
*locally only*; **Push** is a separate, explicit trip to GitHub.

## Test it

```
npm ci
npx playwright install chromium   # the browser itself — npm ci does not fetch it
npx playwright test               # the full editor suite (~190 specs)
python3 docsync/test_docsync.py       # the engine's own self-test
python3 report2027/tools/test_render.py   # render tolerances + edit.html syntax
```

The suite starts its own throwaway `serve.py` on port 8199 and mocks GitHub
entirely — it never touches the network or your real repo. It also regenerates
`docs/` on startup, so it works on a clone that has never been built.

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

## Licence

MIT — see [LICENSE](LICENSE).
