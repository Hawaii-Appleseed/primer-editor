# How much of STAGE TWO can be automated?

STAGE ONE (make a static page *openable* in the draft editor) is now fully
automatic: `python3 -m docsync.scaffold page.html --id my-page`. STAGE TWO
(make its pieces *editable*) was done by hand for `projects/rxkids`. This
note scopes which parts of that hand work could become scripts, in order of
payoff, and which parts genuinely need a human or an AI session.

## Automatable — worth building

### 1. Auto-slot proposal (`docsync.propose` — the big one)
A DOM walk (Python stdlib `html.parser`) over `original.html` can find every
substantial text leaf — `h1–h6`, `p`, `li`, text-bearing `span`/`div` above a
length threshold — and mechanically:
- generate a slot key from context (`sect2.h1-0`, `sect5.p-3`),
- rewrite the body to wrap each leaf in a `data-slot` span,
- emit the matching `[[slot]]` entries into `content.md`.

Result: **every paragraph on the page becomes double-click-editable with zero
judgment applied**. That's most of the day-to-day value of stage two (people
mostly edit words, not layout). What it cannot do — and where the proposal
needs pruning by a person or an AI pass:
- **names**: `hero.title` beats `sect1.h1-0`; ugly keys work but age badly,
- **chrome vs content**: nav labels, button text, legal boilerplate should
  usually NOT be slots,
- **repeated widgets**: six benefit tabs should be six *structured* slot
  groups (`benefits.health.title/bullets`), not eighteen anonymous leaves.

Realistic yield: 60–80% of hand-wired slot coverage, in seconds.

### 2. Page-height trim (fully automatic)
Render, measure the content's real bottom in headless Playwright (already a
dev dependency), write the trimmed height back to `render_report.py` +
`docsync.yml`. Removes the "generous 160in default" wart and the class of
stale page-cut warnings entirely.

### 3. Reveal-animation neutraliser (DONE — in the scaffold)
The generated renderer now injects, in edit mode only, a generic
`opacity:1 !important` override for `[class*="reveal"/"fade"/"animate"]` and
`[data-aos]`. This was the #1 stage-one blocker on rxkids (everything below
the hero was invisible). Pages with *JS-driven* behaviour — image cyclers,
carousels — still need a hand-written edit-mode override.

### 4. Movable images/SVGs (semi-automatic, ship behind a flag)
Free-standing `<img>` and inline `<svg>` elements are safe to auto-wrap with
`data-el` hooks (`L.attr`) — that's mechanical. **Flow text blocks are not**:
giving arbitrary paragraphs `data-el` means a drag absolutises them and their
siblings reflow underneath, wrecking the page. Auto-wire images only.

## NOT worth automating — needs judgment

- **Repeated-widget restructuring** (the rxkids benefits tabs → a loop over
  structured slots): detecting "these six blocks are one component" and
  synthesising the loop is real program synthesis. An AI session does this
  well; a script does it wrong confidently.
- **Citations/footnotes**: source pages carry no citation semantics; mapping
  superscripts and links to `[^source-id]` definitions is editorial.
- **Page-specific JS overrides**: what an image cycler or carousel should do
  in edit mode (freeze? show frame 1? expose each frame?) is a per-page call.
- **Grouping/detachables**: which visuals move together vs independently is
  design intent, unrecoverable from markup.

## The realistic pipeline

```
scaffold (script, seconds)        → openable, everything visible
propose-slots (script, seconds)   → every paragraph editable, ugly names
AI pass (one session, minutes)    → prune chrome, rename, restructure
                                    widgets, wire citations, JS overrides
```

The scripts compress the AI session from "read and rebuild the whole page"
(rxkids took a full session) to "review a working proposal" — but the last
pass can't be eliminated, because it *is* the editorial decision of what the
page's owner should be able to touch.
