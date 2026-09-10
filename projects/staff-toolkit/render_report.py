#!/usr/bin/env python3
"""The Toolkit — the internal guide to the staff hub's tools.

Seven designed sheets on the shared engine, in the Appleseed brand system.
Every heading and paragraph is a content.md slot; the two diagrams go through
graphic(), so they can be moved and resized in the draft editor and their
placement sticks across rebuilds.

Not a research report, so deliberately without the published-report front
matter: no org boilerplate, no copyright page, no author line. The endnotes
point at where each thing is documented rather than at outside sources.

Why the diagrams are code and not assets: a bare <svg> in the markup is frozen
and invisible to the editor (docsync.blocks.graphic), and an uploaded PNG
cannot be recoloured when the palette moves. The cost is that changing what a
diagram SAYS is an edit here, not an edit in the editor.
"""
from pathlib import Path
import os
import re
import sys

HERE = Path(__file__).resolve().parent           # projects/staff-toolkit
REPO = HERE.parents[1]                           # repo root, where docsync/ lives
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from docsync.content import Content                                # noqa: E402
from docsync.layout import Layout                                  # noqa: E402
from docsync.blocks import (card, chart_scroll, chart_scroll_css,   # noqa: E402
                            graphic, pdf_button)
from docsync.okina import OKINA_FACES                              # noqa: E402

# Same env contract as every renderer: the editor and the export endpoint
# override these to render a draft from temp files; unset -> the working tree.
_LAYOUT = Path(os.environ.get("DOCSYNC_LAYOUT") or (HERE / "layout.json"))
_CONTENT = Path(os.environ.get("DOCSYNC_CONTENT") or (HERE / "content.md"))
_OUT = Path(os.environ.get("DOCSYNC_OUT") or (HERE / "index.html"))

L = Layout(_LAYOUT, page=(8.5, 11.0))
C = Content(_CONTENT, styles=L)

# ── The brand palette ────────────────────────────────────────────────────────
# The nine Appleseed colours. DEEP (#52796F) is the workhorse accent, not
# TEAL (#6B9E78), which is lighter despite reading as the darker name.
TEAL = "#6B9E78"
MID = "#95B7A2"
SAGE = "#CAD2C5"
PALE = "#E8EDE6"
WASH = "#D6E0D2"
DEEP = "#52796F"
DARK = "#354F52"
INK = "#2F3E46"
WHITE = "#FFFFFF"

BODY_INK = "rgba(47,62,70,.80)"      # body text is never solid charcoal
MUTE_INK = "rgba(47,62,70,.62)"

# ── Diagram sizing ───────────────────────────────────────────────────────────
# The text column: 8.5in less two 0.62in margins. Both diagrams are drawn in
# 720 user units and render at this width, so one user unit is ~0.97 CSS px
# and an 11-unit label lands at 10.6px — just over docsync.blocks'
# CHART_MIN_LABEL_PX floor of 10.5. Drop a label below 11 and the legibility
# test fails the build; that is the constraint, not a style preference.
FIG_W_IN = 7.26
LABEL_U = 11

SANS = "OkinaManrope, Manrope, system-ui, sans-serif"


def _t(x, y, s, *, size=LABEL_U, fill=INK, weight="400", anchor="start",
       track=0, family=SANS, opacity=None) -> str:
    """One SVG label. Every diagram string goes through here so no label can
    be written below the legibility floor by accident."""
    if size < LABEL_U:
        raise SystemExit(f"diagram label {s!r} at {size}u is under the "
                         f"{LABEL_U}u floor — it would render below 10.5px")
    op = f' opacity="{opacity}"' if opacity else ""
    tr = f' letter-spacing="{track}"' if track else ""
    return (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"'
            f'{tr}{op}>{s}</text>')


def _box(x, y, w, h, *, fill=WHITE, stroke="", r=8, opacity=None) -> str:
    st = f' stroke="{stroke}" stroke-width="1.2"' if stroke else ""
    op = f' opacity="{opacity}"' if opacity else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="{fill}"{st}{op}/>')


def _marker(mid, fill) -> str:
    return (f'<marker id="{mid}" viewBox="0 0 10 10" refX="9" refY="5" '
            f'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
            f'<path d="M0,1 L9,5 L0,9 z" fill="{fill}"/></marker>')


# ── Figure 1: Claude, GitHub and Cloudflare ─────────────────────────────────
# Two doors, and only the top one is git. The lower path passes UNDER the
# GitHub box rather than through it: an MCP edit needs no GitHub account and
# no token, and the geometry is what says so.
#
# Access is a gate NODE on the MCP path, not a band down the Cloudflare box's
# edge. A band would have been crossed by the push arrow too, and that is
# wrong — Cloudflare's build pulls from GitHub with no Access check. It is
# filled DEEP (Cloudflare's accent) and offset right of the GitHub column,
# because sitting square under that column read as GitHub's own gate.
#
# Gaps between columns are 50-54 units because the arrow labels live in them.
# Manrope bold at 11u runs about 6.5 units a character, not the 5.5 a first
# pass assumed, and "commit" spilled onto the repos box.
def fig_repos() -> str:
    rows = [("staff-updates-internal", 72),
            ("primer-editor", 100),
            ("and three more", 128)]
    out = [_box(206, 40, 166, 120, fill=INK, r=10),
           _t(218, 62, "the repos", size=11, fill=MID, weight="700")]
    for label, y in rows:
        out.append(_box(218, y, 142, 24, fill=WHITE, r=5, opacity=".12"))
        out.append(_t(224, y + 16.5, label, size=11, fill=WHITE))
    return "".join(out)


def fig_cloudflare() -> str:
    """Pages, the store and the room — plus the one-way seed between the first
    two, which is the fact the whole figure exists to carry."""
    return "".join([
        _box(426, 32, 288, 320, fill=PALE, stroke=DEEP, r=10),

        _box(442, 48, 256, 62, fill=WHITE, stroke=MID, r=8),
        _t(454, 70, "Cloudflare Pages", size=12.5, fill=DEEP, weight="700"),
        _t(454, 90, "serves the hub, rebuilt on a push", size=11.5,
           fill=BODY_INK),

        f'<line x1="510" y1="110" x2="510" y2="142" stroke="{INK}" '
        f'stroke-width="2" marker-end="url(#d1a)"/>',
        _t(522, 131, "seeds it, once", size=11, fill=MUTE_INK),

        _box(442, 146, 256, 72, fill=WHITE, stroke=MID, r=8),
        _t(454, 168, "The document store", size=12.5, fill=DEEP, weight="700"),
        _t(454, 187, "every version kept —", size=11.5, fill=BODY_INK),
        _t(454, 202, "what staff actually read", size=11.5, fill=BODY_INK),

        f'<line x1="510" y1="222" x2="510" y2="250" stroke="{DEEP}" '
        f'stroke-width="2" stroke-dasharray="5 4" marker-start="url(#d1b)" '
        f'marker-end="url(#d1b)"/>',
        _t(522, 240, "Save", size=11, fill=MUTE_INK),

        _box(442, 254, 256, 62, fill=WHITE, stroke=MID, r=8),
        _t(454, 276, "The room", size=12.5, fill=DEEP, weight="700"),
        _t(454, 296, "live co-editing, one shared copy", size=11.5,
           fill=BODY_INK),

        _t(442, 338, "Access gates every request", size=11, fill=DEEP,
           weight="700"),
    ])


def diagram_system() -> str:
    # The store does not write back to the repo. An X rather than a single
    # bar: one stroke read as a tick on the line at this size. Unlabelled,
    # because a sentence drawn inside the SVG would be one only this file
    # could change (docsync.check's editability pass) — it is in fig1.note.
    valve = (f'<line x1="420" y1="182" x2="390" y2="182" stroke="{DEEP}" '
             f'stroke-width="2" stroke-dasharray="4 3" '
             f'marker-end="url(#d1b)"/>'
             f'<path d="M398,175 L410,189 M410,175 L398,189" '
             f'stroke="{DARK}" stroke-width="2.4" fill="none"/>')
    return f"""<svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" \
role="img" aria-label="Claude Code works in a local checkout, commits to the \
GitHub repos, and a push makes Cloudflare Pages rebuild the hub. Your own \
Claude takes a second path that skips GitHub entirely: through the Access \
sign-in over MCP, into the co-editing room and the document store. Pages \
seeds the store once, and an X on the return arrow marks that nothing flows \
back to GitHub.">
<defs>{_marker("d1a", INK)}{_marker("d1b", DEEP)}</defs>

{_t(6, 18, "CLAUDE", size=12, fill=DEEP, weight="700", track=1.3)}
{_t(206, 18, "GITHUB", size=12, fill=DEEP, weight="700", track=1.3)}
{_t(426, 18, "CLOUDFLARE", size=12, fill=DEEP, weight="700", track=1.3)}

{_box(6, 52, 150, 66, fill=SAGE, r=8)}
{_t(81, 78, "Claude Code", size=12.5, fill=INK, weight="700", anchor="middle")}
{_t(81, 96, "in a local checkout", size=11, fill=INK, anchor="middle")}

{_t(181, 74, "commit", size=11, fill=INK, weight="700", anchor="middle")}
<line x1="160" y1="85" x2="202" y2="85" stroke="{INK}" stroke-width="2"
      marker-end="url(#d1a)"/>

{fig_repos()}

{_t(399, 68, "push", size=11, fill=INK, weight="700", anchor="middle")}
<line x1="376" y1="79" x2="438" y2="79" stroke="{INK}" stroke-width="2"
      marker-end="url(#d1a)"/>

{valve}

{_box(6, 254, 150, 62, fill=SAGE, r=8)}
{_t(81, 278, "Your own Claude", size=12.5, fill=INK, weight="700",
    anchor="middle")}
{_t(81, 296, "claude.ai or Claude Code", size=11, fill=INK, anchor="middle")}

{_t(196, 274, "MCP", size=11, fill=DEEP, weight="700", anchor="middle")}
<line x1="160" y1="285" x2="232" y2="285" stroke="{DEEP}" stroke-width="2"
      marker-end="url(#d1b)"/>

{_box(236, 254, 160, 62, fill=DEEP, r=8)}
{_t(316, 278, "Access", size=12.5, fill=WHITE, weight="700", anchor="middle")}
{_t(316, 296, "Google sign-in", size=11, fill=PALE, anchor="middle")}

<line x1="400" y1="285" x2="438" y2="285" stroke="{DEEP}" stroke-width="2"
      marker-end="url(#d1b)"/>

{_t(201, 340, "skips GitHub entirely", size=11, fill=MUTE_INK,
    anchor="middle")}

{fig_cloudflare()}
</svg>"""


# ── Figure 2: the notes pipeline ────────────────────────────────────────────
def diagram_notes() -> str:
    return f"""<svg viewBox="0 0 720 172" xmlns="http://www.w3.org/2000/svg" \
role="img" aria-label="An edit to the all-staff notes doc is picked up by \
Apps Script, which both commits it to GitHub and mirrors it live into \
Cloudflare KV. The Updates page reads whichever arrives first.">
<defs>{_marker("d2a", DEEP)}</defs>

{_box(6, 56, 132, 58, fill=SAGE, r=8)}
{_t(72, 80, "The all-staff", size=11.5, fill=INK, weight="700", anchor="middle")}
{_t(72, 96, "notes doc", size=11.5, fill=INK, weight="700", anchor="middle")}

<line x1="142" y1="85" x2="172" y2="85" stroke="{DEEP}" stroke-width="2"
      marker-end="url(#d2a)"/>

{_box(176, 48, 126, 74, fill=WHITE, stroke=MID, r=8)}
{_t(239, 76, "Apps Script", size=12, fill=DEEP, weight="700", anchor="middle")}
{_t(239, 93, "watches the doc", size=11, fill=BODY_INK, anchor="middle")}
{_t(239, 108, "and pushes", size=11, fill=BODY_INK, anchor="middle")}

{_t(331, 37, "committed", size=11, fill=MUTE_INK, anchor="middle")}
<path d="M 306,74 C 330,52 336,44 360,42" fill="none" stroke="{DEEP}"
      stroke-width="2" marker-end="url(#d2a)"/>
{_t(331, 149, "live", size=11, fill=MUTE_INK, anchor="middle")}
<path d="M 306,96 C 330,118 336,126 360,128" fill="none" stroke="{DEEP}"
      stroke-width="2" stroke-dasharray="5 4" marker-end="url(#d2a)"/>

{_box(364, 14, 160, 54, fill=INK, r=8)}
{_t(444, 36, "GitHub", size=11.5, fill=MID, weight="700", anchor="middle")}
{_t(444, 53, "data/staff-updates.json", size=11, fill=WHITE, anchor="middle")}

{_box(364, 104, 160, 54, fill=PALE, stroke=DEEP, r=8)}
{_t(444, 126, "Cloudflare KV", size=11.5, fill=DEEP, weight="700",
    anchor="middle")}
{_t(444, 143, "the live mirror", size=11, fill=BODY_INK, anchor="middle")}

<path d="M 528,41 C 548,52 544,68 556,80" fill="none" stroke="{DEEP}"
      stroke-width="2" marker-end="url(#d2a)"/>
<path d="M 528,131 C 548,120 544,104 556,92" fill="none" stroke="{DEEP}"
      stroke-width="2" stroke-dasharray="5 4" marker-end="url(#d2a)"/>

{_box(560, 56, 154, 58, fill=DEEP, r=8)}
{_t(637, 80, "The Updates", size=12, fill=WHITE, weight="700", anchor="middle")}
{_t(637, 97, "page", size=12, fill=WHITE, weight="700", anchor="middle")}
</svg>"""


# ── Sheet furniture ─────────────────────────────────────────────────────────
def head(pre: str, page_no: int) -> str:
    """A content page's eyebrow, title and standfirst."""
    return (f'<div class="phead">'
            f'<div class="eyebrow"{L.attr(f"{pre}.eyebrow")}>'
            f'{C.t(f"{pre}.eyebrow")}</div>'
            f'{L.spacer(f"{pre}.h1")}<h1{L.attr(f"{pre}.h1")}>'
            f'{C.t(f"{pre}.h1")}</h1>'
            f'<div class="psub"{L.attr(f"{pre}.sub")}>{C.t(f"{pre}.sub")}</div>'
            f'</div>')


def foot(key: str, page_no: int) -> str:
    """The running folio. C.html, not C.t: these carry emphasis, and a bare
    C.t would ship the asterisks. The label beside the numeral is one slot
    shared by every page, so retitling the document moves all five at once."""
    return (f'<div class="pfoot">{C.html(key, "pfoot-t")}'
            f'<span class="pnum"{L.attr(f"foot.pnum.{page_no}")}>'
            f'{page_no:02d} · {C.t("foot.running")}</span></div>')


def figure(cap_key: str, note_key: str, el_id: str, svg: str) -> str:
    """Caption above, source line below — the house figure furniture."""
    return (f'<div class="figure">'
            f'<div class="figcap"{L.attr(cap_key)}>{C.t(cap_key)}</div>'
            f'{graphic(L, el_id, chart_scroll(svg, smallest_label=LABEL_U), w=FIG_W_IN)}'
            f'{C.html(note_key, "figsrc")}'
            f'</div>')


def contents_rows() -> str:
    return "".join(
        f'<div class="crow"{L.attr(f"cover.contents.{n}")}>'
        f'<span class="cnum">{n}</span>'
        f'<span class="ctxt">{C.t(f"cover.contents.{n}")}</span></div>'
        for n in ("02", "03", "04", "05", "06", "07"))


PAGE1 = f"""
  <div class="eyebrow"{L.attr("cover.eyebrow")}>{C.t("cover.eyebrow")}</div>
  {L.spacer("cover.h1")}<h1 class="cover-h1"{L.attr("cover.h1")}>\
{C.t("cover.h1")}</h1>
  <div class="rule"></div>
  {C.html("cover.deck", "deck")}
  {C.html("cover.lead", "lead")}
  <div class="contents">
    <div class="klabel"{L.attr("cover.contents.h")}>{C.t("cover.contents.h")}</div>
    {contents_rows()}
  </div>
  <div class="cstamp"{L.attr("cover.stamp")}>{C.t("cover.stamp")}</div>
"""

PAGE2 = f"""
  {head("p2", 2)}
  {figure("fig1.h", "fig1.note", "fig.system", diagram_system())}
  <h2{L.attr("cover.read.h")}>{C.t("cover.read.h")}</h2>
  {C.html("cover.read.p", "body")}
  {card(C, L, "cover.card.title", "cover.card.bullets", DEEP,
        detachable=True, min_h=1.5)}
  {foot("p2.foot", 2)}
"""

PAGE3 = f"""
  {head("p3", 3)}
  {C.html("updates.p", "lead")}
  {figure("fig2.h", "fig2.note", "fig.notes", diagram_notes())}
  <h2{L.attr("updates.how.h")}>{C.t("updates.how.h")}</h2>
  {C.html("updates.how.p", "body")}
  {foot("p3.foot", 3)}
"""

PAGE4 = f"""
  {head("p4", 4)}
  <h2{L.attr("cal.h")}>{C.t("cal.h")}</h2>
  {C.html("cal.p", "lead")}
  {card(C, L, "cal.card.title", "cal.card.bullets", PALE,
        detachable=True, min_h=1.3)}
  <h2{L.attr("subs.h")}>{C.t("subs.h")}</h2>
  {C.html("subs.p", "body")}
  {foot("p4.foot", 4)}
"""

PAGE5 = f"""
  {head("p5", 5)}
  {C.html("lib.p", "lead")}
  <h2{L.attr("res.h")}>{C.t("res.h")}</h2>
  {C.html("res.p", "body")}
  <h2{L.attr("search.h")}>{C.t("search.h")}</h2>
  {C.html("search.p", "body")}
  {card(C, L, "search.card.title", "search.card.bullets", SAGE,
        detachable=True, min_h=1.5)}
  {foot("p5.foot", 5)}
"""

PAGE6 = f"""
  {head("p6", 6)}
  {C.html("ed.p", "lead")}
  {card(C, L, "ed.card.title", "ed.card.bullets", DARK,
        detachable=True, min_h=1.9)}
  <h2{L.attr("ed.rooms.h")}>{C.t("ed.rooms.h")}</h2>
  {C.html("ed.rooms.p", "body")}
  <h2{L.attr("ed.share.h")}>{C.t("ed.share.h")}</h2>
  {C.html("ed.share.p", "body")}
  {foot("p6.foot", 6)}
"""

PAGE7 = f"""
  {head("p7", 7)}
  {C.html("mcp.p", "lead")}
  {card(C, L, "mcp.card.title", "mcp.card.bullets", DEEP,
        detachable=True, min_h=1.7)}
  <h2{L.attr("broke.h")}>{C.t("broke.h")}</h2>
  {C.html("broke.p", "body")}
  <div class="endnotes">
    <div class="klabel"{L.attr("endnotes.h2")}>{C.t("endnotes.h2")}</div>
    {C.fn.MOUNT}
  </div>
  {foot("p7.foot", 7)}
"""

DESIGNED = {1: PAGE1, 2: PAGE2, 3: PAGE3, 4: PAGE4, 5: PAGE5,
            6: PAGE6, 7: PAGE7}

# Derived from the layout rather than hardcoded: Save commits layout.json but
# NOT this file, so a hardcoded count goes stale the moment a page is added in
# the editor — and page_order() then refuses to render at all.
DESIGNED_PAGES = max(
    [p for p in (L.pages.get("order") or []) if isinstance(p, int)]
    or [len(DESIGNED)])
NOTICES: list = []


def sheet(pid) -> str:
    """One <section class="page">: this document's markup for a designed
    page, empty for a blank page added in the editor.

    data-page carries the page's IDENTITY, which stops matching its position
    the moment the order can be changed. L.layer/text_boxes/tables_html go
    INSIDE the section — .page is the positioning context every placed
    element is measured against, so as siblings they would sit a box out.
    """
    inner = DESIGNED.get(pid, "") if isinstance(pid, int) else ""
    return (f'<section class="page" data-page="{pid}"'
            f'{L.fill_attr(f"page.{pid}")}>{inner}'
            f'{C.extras(f"page{pid}") if isinstance(pid, int) else ""}'
            f'{L.layer(pid)}{L.text_boxes(pid)}{L.tables_html(pid)}'
            f'</section>')


def linkify_footnotes(markup: str, count: int) -> str:
    """Turn every <sup>N</sup> marker into a link to its endnote. Without this
    the markers render as bare numerals pointing at nothing."""
    def repl(m):
        nums = re.findall(r"\d+", m.group(1))
        if not nums:
            return m.group(0)
        out = [f'<a class="fn" href="#en{n}">{n}</a>' if 1 <= int(n) <= count
               else n for n in nums]
        return "<sup>" + "&thinsp;".join(out) + "</sup>"
    return re.sub(r"<sup>(.*?)</sup>", repl, markup, flags=re.S)


body = ("".join(sheet(pid) for pid in L.page_order(DESIGNED_PAGES))
        + L.pagemeta(range(1, DESIGNED_PAGES + 1))
        + L.notices(NOTICES))
# resolve() walks the body assigning numbers and fills the endnotes mount on
# page 5 as it goes; only after that is the count known, so linkify runs last.
body = C.fn.resolve(body)
body = linkify_footnotes(body, len(C.fn.endnotes()))

unused = C.fn.unused()
if unused:
    raise SystemExit(f"sources nothing cites: {', '.join(unused)}")

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{C.text("title")}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800\
&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* Neither Manrope nor Poppins encodes U+02BB, so every ʻokina would fall
     back to the OS UI font. These one-glyph faces re-encode each family's own
     U+2018 outline at U+02BB; they must come FIRST in a stack. */
{OKINA_FACES}
  body {{ margin:0; background:{WASH};
          font:13.5px/1.6 OkinaPoppins, Poppins, system-ui, -apple-system,
               Arial, sans-serif;
          color:{BODY_INK}; }}

  /* position:relative is load-bearing: every placed object is absolute
     against its page, so the page must be the containing block or the whole
     document stacks at the window's origin. isolation:isolate equally so —
     it keeps a send-to-back shape above the page's own background. */
  .page {{ width:8.5in; min-height:11in; margin:24px auto; background:{WHITE};
           box-shadow:0 4px 18px rgba(0,0,0,.12); padding:0.75in 0.62in;
           box-sizing:border-box; position:relative; isolation:isolate;
           overflow:hidden; }}

  /* --- Headings. Manrope has no true italic on Google Fonts, so nothing
         here ever sets font-style:italic on it. ------------------------- */
  h1, h2, .eyebrow, .klabel, .figcap, .cnum, .pnum {{
      font-family:OkinaManrope, Manrope, system-ui, sans-serif; }}
  .eyebrow {{ font-size:11px; font-weight:800; letter-spacing:1.6px;
              text-transform:uppercase; color:{TEAL}; margin:0 0 10px; }}
  h1 {{ font-size:26px; line-height:1.14; font-weight:800; color:{DEEP};
        margin:0 0 10px; letter-spacing:-.3px; }}
  .cover-h1 {{ font-size:52px; line-height:1.02; letter-spacing:-1.4px;
               color:{DARK}; margin:0 0 14px; }}
  h2 {{ font-size:16px; font-weight:800; color:{DARK}; margin:20px 0 7px; }}
  .rule {{ height:4px; width:1.5in; background:{TEAL}; border-radius:2px;
           margin:0 0 16px; }}
  .deck {{ font-size:16px; line-height:1.45; font-weight:500; color:{DEEP};
           margin:0 0 16px; max-width:6in; }}
  .lead {{ font-size:14px; margin:0 0 16px; }}
  .body {{ font-size:13.5px; margin:0 0 12px; }}
  .lead p, .body p {{ margin:0 0 9px; }}
  .lead p:last-child, .body p:last-child {{ margin-bottom:0; }}
  .psub {{ font-size:14.5px; line-height:1.4; font-weight:500; color:{TEAL};
           margin:0 0 15px; max-width:5.4in; }}
  .phead {{ border-bottom:1px solid {PALE}; padding-bottom:11px;
            margin-bottom:15px; }}
  .klabel {{ font-size:11px; font-weight:800; letter-spacing:1.4px;
             text-transform:uppercase; color:{DEEP}; margin:0 0 9px; }}

  /* --- Figures: caption above, source below --------------------------- */
  .figure {{ margin:16px 0 18px; }}
  .figcap {{ font-size:13.5px; font-weight:800; color:{DARK}; margin:0 0 9px; }}
  .figsrc {{ font-size:11.5px; line-height:1.4; color:{MUTE_INK};
             margin:9px 0 0; }}
  .figsrc p {{ margin:0; }}

  /* --- The cover's lower band ----------------------------------------- */
  .twocol {{ display:flex; gap:18px; align-items:flex-start; margin:18px 0 0; }}
  .twocol > * {{ flex:1 1 0; min-width:0; }}
  .crow {{ display:flex; gap:11px; align-items:baseline;
           padding:7px 0; border-top:1px solid {PALE}; }}
  .cnum {{ font-size:13px; font-weight:800; color:{TEAL}; min-width:20px; }}
  .ctxt {{ font-size:13px; line-height:1.35; color:{INK}; }}
  .cstamp {{ position:absolute; left:0.62in; bottom:0.55in; font-size:11px;
             font-weight:600; letter-spacing:1.2px; text-transform:uppercase;
             color:{MUTE_INK}; }}

  /* --- Footers and endnotes ------------------------------------------- */
  .pfoot {{ position:absolute; left:0.62in; right:0.62in; bottom:0.5in;
            display:flex; justify-content:space-between; align-items:baseline;
            gap:14px; border-top:1px solid {PALE}; padding-top:8px; }}
  .pfoot-t {{ font-size:11.5px; color:{MUTE_INK}; margin:0; }}
  .pfoot-t p {{ margin:0; }}
  .pnum {{ font-size:11px; font-weight:800; letter-spacing:1.2px;
           text-transform:uppercase; color:{DEEP}; white-space:nowrap; }}
  .endnotes {{ margin:20px 0 0; padding-top:12px; border-top:1px solid {PALE}; }}
  .ds-endnotes {{ font-size:11.5px; line-height:1.45; color:{MUTE_INK}; }}
  .ds-endnotes a {{ color:{DEEP}; text-decoration:none; }}
  .ds-endnotes a:hover {{ text-decoration:underline; }}

  /* --- Prose details --------------------------------------------------- */
  strong {{ font-weight:700; color:{INK}; }}
  code {{ font-family:ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size:.92em; background:{PALE}; color:{DARK};
          padding:1px 4px; border-radius:4px; }}
  a {{ color:{DEEP}; }}
  sup {{ font-size:10.5px; line-height:0; }}
  sup a.fn {{ color:{DEEP}; text-decoration:none; font-weight:700; }}
  .extra-section h2 {{ margin-top:18px; }}
  .ds-textbox p {{ margin:0 0 .5em; }}
  .ds-textbox p:last-child {{ margin-bottom:0; }}
  .ds-table {{ border-collapse:collapse; font-size:11.5px; }}
  .ds-table td, .ds-table th {{ border:1px solid {SAGE}; padding:4px 7px;
          text-align:left; }}

  /* The sheet is the breakpoint, not a device: below its own width the page
     can no longer show the design at the size it was composed at. */
  @media screen and (max-width:8.5in) {{
    .page {{ width:100%; min-height:0; margin:0; box-shadow:none;
             padding:26px 20px; }}
    .cover-h1 {{ font-size:38px; letter-spacing:-.9px; }}
    /* graphic() pins a figure at its inch width on an inline-block span, and
       Layout.mobile_css() cannot reach it: that release matches [data-placed]
       and position:absolute, and an un-dragged graphic is neither. So a 7.26in
       figure stayed 697px wide inside a 375px page and .page's overflow:hidden
       ate the right-hand third of it — clipped, with nothing to scroll. Handing
       the width back lets chart_scroll's own scroller do its job: the wrapper
       narrows to the page, the svg keeps its 687px min-width, and the figure
       scrolls at full size instead of shrinking under the legibility floor. */
    .ds-graphic {{ width:auto !important; max-width:100% !important; }}
    /* pdf_button() pins itself top-right, which on a desktop floats over the
       grey gutter beside the sheet. At 375px there is no gutter and it sat on
       top of the page title. Bottom-right corner instead — !important because
       the button's geometry is inline styles from docsync.blocks. */
    body > button {{ top:auto !important; bottom:14px !important;
                     right:14px !important; padding:8px 13px !important;
                     font-size:13.5px !important; }}
    .twocol {{ flex-direction:column; gap:14px; }}
    .pfoot, .cstamp {{ position:static; left:auto; right:auto; bottom:auto;
                       margin-top:22px; }}
  }}
</style>
</head>
<body>
{pdf_button(L, bg=DEEP)}
{chart_scroll_css()}
{body}
</body>
</html>
"""

_OUT.write_text(html)
print(f"wrote {_OUT} ({len(html):,} bytes)")
