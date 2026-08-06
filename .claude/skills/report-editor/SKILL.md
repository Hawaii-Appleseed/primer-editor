---
name: report-editor
description: How to build or change ANY report served by the docsync draft editor so its elements stay user-editable — movable/resizable SVGs and graphics, detachable cards, text, shapes, images, groups, citations. Use when adding, drawing, or restyling anything in a report bound in docsync.yml, or when the user says an element "should be movable / resizable / editable."
---

# Building reports the draft editor can edit

Reports bound in `docsync.yml` render through their own `render_report.py` and
are edited live in the **docsync draft editor** (`docsync/editor/edit.html`).
The editor can move, resize, rotate, recolour, group and re-layer elements —
but ONLY elements rendered through the right hook. Raw markup is frozen: the
editor has no handle to select it. When you add anything, render it so the
user can grab it.

## The shared building blocks: `docsync.blocks`

Every project can import the engine's helpers — they are staged into the
browser engine automatically:

```python
from docsync.blocks import graphic, card, is_light_bg, pdf_button

# A movable/resizable/rotatable inline SVG. viewBox REQUIRED; w = default
# width in inches (until the user resizes; then layout.json wins).
{graphic(L, "page1.diagram", '<svg viewBox="0 0 200 120">…</svg>', w=2.4)}

# A coloured tile: bold title + bullets, both content.md slots. detachable=True
# renders title/bullets as their own movables (seed a default group, below).
{card(C, L, "page1.card.title", "page1.card.bullets", "#52796F",
      detachable=True, min_h=1.8)}

# ONCE, just inside <body>: the reader-facing "Download PDF" in the upper-right
# corner, plus the print CSS that makes the PDF come out right.
{pdf_button(L, bg="#52796F")}
```

- `L` is the project's `Layout`, `C` its `Content` — every renderer has both.
- `el_id`s must be unique and STABLE (`<page>.<name>`): they key layout.json;
  renaming one orphans wherever the user dragged it.
- Helpers are zero-stylesheet (styles inlined), so they work in a minimal
  scaffolded renderer with no CSS of its own.
- A project MAY keep bespoke equivalents (the Budget Primer's `card()` is
  CSS-styled); the *behavioural* hooks (`ds-graphic`, `ds-detachable`,
  `data-el`/`data-slot`) are what the editor reads either way.

## The one rule for SVGs / graphics

**Any free-standing SVG, diagram, icon-lockup, badge, or drawn graphic MUST go
through `graphic()`** — never a bare `<svg>` in the markup. Glyphs that live
inside another element and shouldn't move on their own stay inline.

## Making other elements editable

Everything editable shares one hook: `{L.spacer(el_id)}` before the element +
`{L.attr(el_id)}` on its tag stamps `data-el` (edit mode only) and applies any
layout.json position/size override.

| Want | Use | The user gets |
|---|---|---|
| Free-standing SVG/graphic | `blocks.graphic(L, id, svg, w=)` | move, 4-corner proportional resize, rotate |
| Coloured tile with text | `blocks.card(C, L, …, detachable=)` | recolour, move; pieces pull apart if detachable |
| Editable prose paragraph | `C.html(key, cls)` — stamps `data-slot` AND wraps a movable `para.<key>` | click-to-edit text; drag; resize |
| Editable heading / inline text | a slot: `C.t(key)`, or `C.slot_attr`/`C.slot_span` on a tag you build | click-to-edit text; drag; width resize |

**The `C()` trap — the #1 "why can't I edit this?" cause.** Bare `C(key)` (i.e.
`Content.__call__`) and `C.text(key)` emit prose with **no `data-slot`**, so the
editor has no click-to-edit hook — the text is frozen even when the `<p>` around
it carries `L.attr` (that only makes it *movable*, `data-el`, not *editable*).
For any prose the user should edit, render it through `C.html(key, cls)` (a
whole `<p>`) or wrap the inner text in `C.slot_attr`/`C.slot_span`/`C.t`. A `<p>`
with `data-el` but no `data-slot` is the tell.
| Photo / raster image | an `<img>` with `L.attr` (see the primer's `img_el`) | move, corner resize, rotate, crop, replace |
| Rect / ellipse / line / text box / table | user adds from the editor; stored in layout.json | move, resize, restyle |
| Coloured background band (a full-width section) | `L.sec(el_id)` on the section tag — NOT `L.attr` (a band must never leave the flow) | bottom-edge grip: stretch taller, or drag back to natural height to reset; override lives in layout.json `sections` |

## Composing NEW visuals: separate primitives, grouped — never fused

Build a labelled box from a layout.json `shapes` rect + a `boxes` text box +
a `groups` entry (`["<shapeId>", "text.<boxId>"]`): it moves as one until the
user hits Ungroup (⌘⇧G) and detaches the text. Never bake sentences inside an
SVG or fuse text + background into one div. For a `card(detachable=True)`,
seed the default group `["card.<bullets_key>", "<title_key>", "<bullets_key>"]`.

## layout.json is an OVERRIDES layer

The renderer's design is the default; layout.json only speaks where the user
moved/resized/recoloured something (`positions`, `shapes`, `boxes`, `tables`,
`groups`, `endnote_order`). An empty file = the pristine design. Don't
hand-place by guessing inches — set a sensible default in the renderer and let
the user drag.

## Moving cited text (footnotes travel with it)

A citation is the literal token `[^source-id]`. Move the sentence WITH its
token — into another slot or a text box's `md` — and endnotes renumber by
first appearance in the new reading order automatically. Mid-move states are
edit-tolerant, publish-strict: an uncited source, a typo'd token (renders a
red ? naming the missing id), and an emptied bullet list all RENDER in edit
mode and REFUSE at publish. Never retype a token by hand — copy it exactly.

## Piloting the editor programmatically: `window.docsync.api`

When YOU (an AI, a script) are the one making changes in an open editor,
don't click and drag — drive the pilot API by JS eval in the editor's top
window. It is the editor's own verbs, blessed and held stable
(`tests/editor/pilot-api.spec.js` is the executable contract). Same safety
as the UI: every mutator runs `pushHistory()` first (⌘Z undoes a pilot like
a human), writes land through the one `render()` with all its validation,
and every verb returns plain JSON — geometry in page INCHES — so no
screenshot round-trips.

Start with `inventory()`; act by the ids it returns:

| verb | does |
|---|---|
| `status()` | `{dirty, editing, page:{w,h,pageless}, overflow, selected}` — cheap, poll it |
| `inventory()` | every page: elements `{id, kind, box, locked, text}`, slots `{key, text}`, plus sources and status |
| `getSlot(key)` / `setSlot(key, md)` | a slot's markdown, read / replaced (renderer's grammar applies) |
| `place(id, {x,y,w,h})` | move/size in inches — placer's coordinate correction, clamps to the page like a drag; returns where it really landed |
| `recolor(id, fill)` | shape/box/mark id or `'page.<pid>'`; `null` resets to the design |
| `addTextBox({page,x,y,w,md,style,fill})` | returns `'text.<n>'` for further verbs |
| `addPage(at?)` | blank page; returns its id |
| `addSource(id, text, url)` / `addEndnotesSection()` | declare a source (cite via `[^id]` in slot text) / the synced endnotes section |
| `batch(ops)` | `[{verb, args}]` for `setSlot`/`place`/`recolor`/`addTextBox`/`addSource` — one history entry, one render. ALL-OR-NOTHING: every op validates before any mutates, so a bad op refuses the whole batch rather than half-landing |
| `undo()` / `redo()` | the same history a human's ⌘Z walks |
| `save()` | presses the real Save; refuses (with the pages named) while content overflows the print cut. Push stays with the human |

Mutators refuse while an inline text editor is open (`editing`) — close it
first. Coordinates clamp to the sheet, so read the RETURNED box rather than
assuming the request landed verbatim. A `batch()` op cannot reference
something an EARLIER op in the same batch creates — a fresh `addTextBox`'s
id doesn't exist until that batch's own render runs — so chain create-then-
place across two calls, not one. `addPage`/`addEndnotesSection` push their
own history internally and cannot join a batch either; call them singly.

**Headless (no browser): `GET /__inventory?project=<id>`.** The same document
as data, from the FILES rather than the DOM — every slot's full markdown (not
the browser's 80-char snippet), every source with its citation count, the
geometry of everything placed, and unless `&elements=0`, every addressable
element/slot/fill id plus the page count (discovered by an edit-mode render,
cached per build). `docsync/mcp_server.py` wraps it as a stdlib-only MCP
server — `list_reports`, `status`, `inventory`, `get_slot`, `search`,
`uncited_sources`.

The boundary worth knowing: layout.json stores geometry only for things
somebody PLACED, so an unmoved designed element has ids here but no
coordinates — those exist only once a browser lays the page out, which is
what `docsync.api.inventory()` measures. And both are READ-only deliberately:
the editor holds the document in memory, so a write from outside would be
overwritten by its next Save, silently and un-undoably. Decide WHAT to change
headlessly; make the change through `docsync.api` in the open editor.

Reserve real clicks for what the API
doesn't cover, and screenshots for visual judgement only.

## Editing the editor itself (`edit.html`)

Its whole stylesheet is one JS **template literal**: a backtick or `${…}` in a
CSS comment ends the literal early and kills the ENTIRE script — the editor
hangs at "loading the render engine…" with no console error. After ANY
`edit.html` change run a boot test (`npx playwright test boot-errors.spec.js`)
or at least `node --check` its inline script (`tools/test_render.py` does).
An isolated DOM check that a feature works is NOT proof the file still boots.

## Build & serve rules

- Each binding in `docsync.yml` names its ONE build command; run that, never
  hand-edit generated output (the rendered HTML, the staged `<dir>/engine/`).
- Re-stage after engine changes: `python3 -m docsync.stage --id <id>`.
- Never start or kill a dev server the USER owns (a server launched outside
  their login session cannot reach the keychain, so Push breaks) — ask them to
  relaunch their launcher app instead. Test servers on other ports are fine.
- If an editor origin wedges ("localhost won't load", server healthy), the
  escape hatch is `<origin>/reset.html` — it unregisters the service worker,
  drops caches, and reopens the editor.

## Bringing in an existing static page (e.g. a Squarespace embed)

`projects/rxkids/` is the pattern: copy the original HTML in untouched
(`original.html`), stage it via `editor.engine` in docsync.yml (the browser's
virtual filesystem only has what the manifest lists — a renderer reading a
file it forgot to declare fails with no file-not-found on disk to explain it),
and have `render_report.py` wrap its `<style>`/`<body>` almost verbatim in ONE
`section.page` sized to the page's own natural footprint (measure
`scrollHeight` first) rather than a print page. That gets it OPENABLE with
zero content loss. Making pieces of it editable — moving copy into slots,
wrapping art in `graphic()`/`card()` — is a separate, later pass.

Known interop quirk: scroll-triggered reveal animations (an IntersectionObserver
or scroll-listener that adds an "active"/visible class) may not fire inside the
editor's iframe the way they do on the live site — confirmed on rxkids: the
hero (first section) revealed correctly, sections further down stayed at
opacity:0 even after scrolling. Not a build error; a rendering interop wrinkle
worth fixing (or stripping the reveal-gating for the editor context) if it
matters for editing that content.

## Where code lives

The engine (`docsync/`, `edit.html`, `serve.py`, this skill) is canonical in
the **primer-editor** repo; report repos vendor copies. Fix engine bugs there
first, then copy over. Report content (its pages, prose, its renderer's
bespoke design) is owned by each report's repo and never flows back.
