#!/usr/bin/env python3
"""RxKids renderer — STAGE ONE: openable, not yet editable.

original.html is the untouched page as pulled from the Hawaii Appleseed
website repo (a Squarespace-embedded marketing page — continuous scroll, not
a paginated report). This wraps its <style> and <body> almost verbatim in one
big `section.page` (the editor's one hard structural requirement — see the
report-editor skill) sized to the page's own natural footprint, so it opens in
the draft editor exactly as it looks on the live site, with nothing lost and
nothing broken.

Nothing in it is editable yet: no [[slot]] is wired to the hero copy, the stat
blocks, the benefit tabs. That is the NEXT step — pick pieces of original.html
and, one at a time, move their text into content.md slots (L.attr + C.t) and
their art into docsync.blocks.graphic()/card(), the same way report2027 and
projects/demo-report do it. See the report-editor skill for the how-to.
"""
from pathlib import Path
import os
import re
import sys

HERE = Path(__file__).resolve().parent           # projects/rxkids
REPO = HERE.parent.parent                        # repo root, where docsync/ lives
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from docsync.content import Content              # noqa: E402
from docsync.layout import Layout                # noqa: E402

_LAYOUT = Path(os.environ.get("DOCSYNC_LAYOUT") or (HERE / "layout.json"))
_CONTENT = Path(os.environ.get("DOCSYNC_CONTENT") or (HERE / "content.md"))
_OUT = Path(os.environ.get("DOCSYNC_OUT") or (HERE / "index.html"))

L = Layout(_LAYOUT, page=(12.5, 76))    # ~1200px wide (matches the editor's own
                                        # canvas width) x tall enough for the
                                        # page's natural ~7160px scroll height.
C = Content(_CONTENT, styles=L)

SRC = (HERE / "original.html").read_text()
STYLE = SRC.split("<style>", 1)[1].split("</style>", 1)[0]
BODY = SRC.split("<body>", 1)[1].rsplit("</body>", 1)[0]

# The editor needs exactly one <section class="page"> as the coordinate origin
# for every drag/resize/snap calculation (see the report-editor skill). The
# original page's own CSS handles all internal layout, so the section just
# needs to be wide/tall enough to hold it without clipping — L.attr/L.spacer
# calls come later, once specific elements are wired to slots.
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
