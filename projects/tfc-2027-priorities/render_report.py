#!/usr/bin/env python3
"""Tax Fairness Coalition — 2027 Priorities: What the Poll Said renderer — auto-slotted by `python3 -m docsync.propose`.

body.slotted.html is original.html's body with slot/movable markers; every
marker is substituted at build time from content.md ([[key]] blocks) and
layout.json. Rename a slot by changing the key in BOTH files. Richer wiring
(structured widgets, citations, page-specific edit-mode overrides) still
belongs in this file — see the report-editor skill.
"""
from pathlib import Path
import os
import re
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from docsync.content import Content              # noqa: E402
from docsync.layout import Layout                # noqa: E402

_LAYOUT = Path(os.environ.get("DOCSYNC_LAYOUT") or (HERE / "layout.json"))
_CONTENT = Path(os.environ.get("DOCSYNC_CONTENT") or (HERE / "content.md"))
_OUT = Path(os.environ.get("DOCSYNC_OUT") or (HERE / "index.html"))

# Keep in step with the `page:` in docsync.yml. 27in is the content's measured
# bottom (26.3in, the .sheet's own height) plus slack: .page is overflow:hidden,
# so a page trimmed exactly to today's content would clip tomorrow's sentence.
# 160in was the scaffold's no-clip import default, ~6x the real page.
L = Layout(_LAYOUT, page=(12.5, 27.0))
C = Content(_CONTENT, styles=L)

EDIT = bool(os.environ.get("DOCSYNC_EDIT"))

EDIT_CSS = """
[class*="reveal"], [class*="fade"], [class*="animate"], [data-aos] {
  opacity: 1 !important; transform: none !important;
  visibility: visible !important;
}
""" if EDIT else ""

SRC = (HERE / "original.html").read_text()
_body_m = re.search(r"<body[^>]*>(.*)</body>", SRC, re.S | re.I)
_head_src = SRC[:_body_m.start()] if _body_m else ""
STYLE = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", _head_src, re.S | re.I))

# This page ships a dark palette (@media (prefers-color-scheme: dark) redefines
# --ink to #E8EEE9), and the sheet the wrapper draws is always white — so on a
# dark-mode machine the editor showed near-white ink on white paper: text
# luminance 179 against 255. The page's own @media print block already says
# which palette it means for paper, and it is the light one.
#
# Switched off by making the media condition unsatisfiable: an unknown
# media-feature VALUE invalidates only the component it appears in, so a
# comma-separated list keeps its other arms. EDIT MODE ONLY — the published page
# is a real web page and keeps its dark mode, and these bytes are unchanged
# outside the editor.
if EDIT:
    STYLE = re.sub(r"prefers-color-scheme\s*:\s*dark",
                   "prefers-color-scheme:ds-edit-light-only", STYLE, flags=re.I)

BODY = (HERE / "body.slotted.html").read_text()
# marker substitution: A=slot attr, T=slot text, S=movable spacer,
# E=movable attr, B=resizable background band
BODY = re.sub("\u27e6A:([a-z0-9_.-]+)\u27e7", lambda m: C.slot_attr(m.group(1)), BODY)
BODY = re.sub("\u27e6T:([a-z0-9_.-]+)\u27e7", lambda m: C(m.group(1)), BODY)
BODY = re.sub("\u27e6S:([a-z0-9_.-]+)\u27e7", lambda m: L.spacer(m.group(1)), BODY)
BODY = re.sub("\u27e6E:([a-z0-9_.-]+)\u27e7", lambda m: L.attr(m.group(1)), BODY)
BODY = re.sub("\u27e6B:([a-z0-9_.-]+)\u27e7", lambda m: L.sec(m.group(1)), BODY)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{C.text("title")}</title>
<style>
  body {{ margin:0; background:#EDF1EE; }}
  .page {{ width:{L.page_w}in; min-height:{L.page_h}in; margin:0 auto;
           background:#fff; position:relative; overflow:hidden; }}
  {STYLE}
  {EDIT_CSS}
</style>
</head>
<body>
<section class="page">
{BODY}
</section>
{L.layer(1)}{L.text_boxes(1)}{L.tables_html(1)}
</body>
</html>
"""

_OUT.write_text(html)
print(f"wrote {_OUT} ({len(html):,} bytes)")
