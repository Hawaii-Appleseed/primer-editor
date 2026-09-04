# Phase 0 — the file⇄document bridge

Gate for the real-time collaboration plan (Yjs + Cloudflare Durable Objects).
The question this phase exists to answer:

> Can a primer project's two state files be modelled as a structured document
> that a CRDT can merge, and turned back into bytes losslessly?

**Answer: yes.** `npm run test:collab` — 72 assertions, all green, ~1s, no
Playwright and no Pyodide.

```
node --test collab/serialize.test.mjs
```

## The contract

`collab/serialize.mjs`, no dependencies, runs in Node and the browser:

```js
filesToDoc({content, layout})   // -> {preamble, blocks, layout}
docToFiles(doc)                 // -> {content, layout}
setSlotText(doc, key, value)    // the only sanctioned slot write
assertWellFormed(doc)           // dev guard: would this survive a round-trip?
```

Guaranteed, and tested against all 11 projects in this repo:

- `docToFiles(filesToDoc(f)).content === f.content` — **byte-identical**.
  Opening a project collaboratively and saving without typing produces no diff.
- `layout` survives as **deep-equal** (see the caveat below on why not bytes).
- After rewriting **every** slot, `docsync.content.parse_content()` reads back
  exactly the values written — the renderer cannot see something different
  from what a collaborator typed.
- Our slot-key list matches `content.py`'s, project for project, in order.

## What content.md actually is

A preamble, then `[[key]]`-marked blocks:

```
<!-- a comment, or a markdown heading, or nothing -->

[[cover.title]]
HAWAIʻI'S BUDGET PRIMER

[[page1.intro]]
Prose, possibly several paragraphs.[^src]

[[sources]]
[src]: A source — https://example.com
```

Surveyed across all 11 projects (107 KB, 727 slots):

| Property | Finding |
|---|---|
| Key agreement, `content.py` vs `edit.html` | **11/11 identical** — no parser disagrees about a block |
| Duplicate keys | none (both parsers refuse them; so do we) |
| Key charset | all within `[A-Za-z0-9._-]` |
| CRLF | none |
| Block separators | usually one blank line; `tax-testimony` also has 0- and 2-blank-line gaps |
| Trailing newline | all 11 end with exactly one |
| HTML comments | 18 total: 11 in a preamble, 7 trailing a slot body, **0 interleaved inside prose** |
| Preamble | comment-only in 10 projects; `report2027` also has a markdown `# heading` |
| Empty slots | present in `rxkids`, `tax-testimony`, `tfc-2027-priorities` |

The zero interleaved comments is the load-bearing result. It means every block
is either a slot or a note, never a slot torn in half by one — so the
`Y.Array<Y.Map>` + per-slot `Y.Text` model in the scope doc holds without a
fallback.

## Three parsers, three different views of the same file

This is the part worth carrying into Phase 2.

- **`docsync/content.py` `parse_content()`** — the renderer's view. Strips
  every HTML comment, drops the preamble, `.strip()`s each block. Comments and
  spacing provably cannot affect output.
- **`edit.html` `slotRe()` / `readSlot()`** — the editor's view. Raw text;
  captures everything between one marker and the next, so a comment trailing a
  slot *is part of that slot's editable value*, and `writeSlot()` replaces the
  whole captured region — **editing such a slot destroys the comment.** Seven
  comments in four projects are currently exposed to this.
- **`collab/serialize.mjs`** — the file's view. Preserves every byte, and
  models a trailing comment run as its own non-editable `note` block, so a
  collaborative edit to the slot above cannot eat it. Strictly safer than
  today's behaviour, and it round-trips where today's does not.

Related: `writeSlot()` normalizes every block separator to exactly one blank
line, so the current editor rewrites `tax-testimony`'s 0- and 2-blank-line gaps
on any save. We preserve each block's own separator.

## Two bugs this phase caught

Both were invisible to an identity round-trip and would have surfaced as data
loss in Phase 2.

1. **Empty slots swallowed the next marker.** Three projects contain
   `[[key]]\n\n\n[[next]]`. Splitting the body as `lead → text → gap` gave all
   the whitespace to `lead`, leaving `gap` empty; writing the first text into
   such a slot emitted no newline before the next marker and merged two slots
   into one. Fixed by taking `gap` from the end first. Caught only by the
   mutation test, not by the round-trip test — which is the argument for
   keeping the mutation test in CI.
2. **Trailing spaces on a marker line were dropped.** `content.py`'s `_KEY_RE`
   tolerates `[[key]]···`; we now round-trip the padding.

## layout.json has two writers

`layout.json` is written both by the editor (`JSON.stringify(layout, null, 2)`)
and by Python (`docsync.scaffold` / `propose` / `serve.py`). They format
differently: Python emits `8.0` and `0.0` where `JSON.stringify` emits `8` and
`0`, and keeps short arrays like `groups` on one line.

Three projects are in the Python-written state today: `demo-report`,
`eviction-code-guide`, `my-report`. Their first editor Save already reformats
the file — this predates and is unaffected by collaboration.

So the gate is **deep-equality**, plus byte-identity against the editor's own
writer (`serializeLayout` is that writer, exactly). Requiring byte-identity
with a Python-written file would mean reproducing Python's float formatting in
the browser, which the editor has never done.

## Verdict, and what Phase 1 inherits

The gate is **passed** — no normalization commits are needed on any project,
and no `content.md` has to change shape before collaboration can be built.

Phase 2 should:

- Route every slot write through `setSlotText()`, and run `assertWellFormed()`
  behind a dev flag on each transaction.
- Map `blocks` → `Y.Array<Y.Map>`, each slot's `text` → `Y.Text`, and keep
  `pad` / `lead` / `gap` / `note.raw` as plain (non-collaborative) fields —
  they are formatting, not content, and two people never need to merge them.
- Treat `[[sources]]` as a special case on write: it has its own grammar
  (`content.py parse_sources`), and `edit.html` already refuses a malformed
  line at the write rather than letting it fail the build hours later.
