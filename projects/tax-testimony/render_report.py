#!/usr/bin/env python3
"""Tax testimony one-pager — cross-campaign comparison, letter-size print page.

Every visual is rendered through the engine's hooks so the user can move,
resize and edit it: prose through C.html/C.t (never bare C(), which emits no
data-slot), the chart through graphic() (a bare <svg> is frozen and invisible
to the editor).

The figures are baked in as DATA below rather than read from a file. The 2026
session is closed, so these numbers are final, and a data file the renderer
opens would have to be declared under `editor.engine` in docsync.yml or the
draft silently fails to build in Pyodide. Regenerate from
~/repos/hawaii-tax-testimony with `python -m testimony stats`.
"""
from pathlib import Path
import os
import re
import sys

HERE = Path(__file__).resolve().parent           # projects/tax-testimony
REPO = HERE.parent.parent                        # repo root, where docsync/ lives
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from docsync.content import Content              # noqa: E402
from docsync.layout import Layout                # noqa: E402
from docsync.blocks import graphic, pdf_button   # noqa: E402
from docsync.okina import OKINA_FACES            # noqa: E402

_LAYOUT = Path(os.environ.get("DOCSYNC_LAYOUT") or (HERE / "layout.json"))
_CONTENT = Path(os.environ.get("DOCSYNC_CONTENT") or (HERE / "content.md"))
_OUT = Path(os.environ.get("DOCSYNC_OUT") or (HERE / "index.html"))
EDIT = bool(os.environ.get("DOCSYNC_EDIT"))

L = Layout(_LAYOUT, page=(8.5, 11))
C = Content(_CONTENT, styles=L)

# --- Hawaiʻi Appleseed brand -------------------------------------------------
INK = "#2F3E46"       # charcoal
SLATE = "#354F52"
TEAL = "#84A98C"
DEEP = "#52796F"
ASH = "#CAD2C5"
CREAM = "#F4F7F4"

# Diverging pair for the support/oppose chart. The brand greens sit below the
# chroma floor and read gray as data marks, so the poles are stepped up until
# they pass; validated with the dataviz validator (all six checks pass, worst
# CVD separation ΔE 10.8 protan, normal-vision ΔE 23.0).
SUP = "#00907A"
OPP = "#C4602F"

# bill, campaign short, support, oppose, outcome
DATA = [
    ("HB2049", "Conveyance tax",   538, 33, "died"),
    ("SB3028", "Conveyance tax",   127, 21, "died"),
    ("SB2362", "REIT loophole",     81, 14, "died"),
    ("HB1850", "Capital gains",     69, 13, "died"),
    ("HB2010", "Millionaire's tax", 42,  2, "died"),
    ("HB2306", "Act 46 freeze",     31, 156, "died"),
    ("SB3125", "Act 46 freeze",     29, 11, "PASSED"),
]


def diverging_chart() -> str:
    """Support vs. opposition per bill, diverging from a shared centre.

    One shared scale for both poles so the two sides are directly comparable —
    never two scales. Every bar is directly labelled, so identity never rests on
    colour alone, and the 4px radius sits on the data end only.
    """
    W, ROW, TOP = 720, 25, 30
    CX = 328                       # centre axis
    LEFT_MAX, RIGHT_MAX = 172, 250
    H = TOP + len(DATA) * ROW + 4
    scale = RIGHT_MAX / max(d[2] for d in DATA)     # px per submission

    p = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'role="img" aria-label="Support and opposition by bill, with outcome">']

    # legend — always present for two series
    p.append(f'<rect x="0" y="0" width="11" height="11" rx="2.5" fill="{OPP}"/>')
    p.append(f'<text x="17" y="9.5" font-size="12.5" fill="{SLATE}">Opposed</text>')
    p.append(f'<rect x="86" y="0" width="11" height="11" rx="2.5" fill="{SUP}"/>')
    p.append(f'<text x="103" y="9.5" font-size="12.5" fill="{SLATE}">Supported</text>')
    p.append(f'<text x="{W}" y="9.5" font-size="12" fill="#7C8A80" '
             f'text-anchor="end">bars share one scale</text>')

    p.append(f'<line x1="{CX}" y1="{TOP - 8}" x2="{CX}" y2="{H - 4}" '
             f'stroke="{ASH}" stroke-width="1"/>')

    for i, (bill, camp, sup, opp, outcome) in enumerate(DATA):
        y = TOP + i * ROW
        mid = y + 9
        passed = outcome == "PASSED"

        p.append(f'<text x="0" y="{mid + 4}" font-size="13" font-weight="600" '
                 f'fill="{INK}">{bill}</text>')
        p.append(f'<text x="58" y="{mid + 4}" font-size="12" fill="#7C8A80">{camp}</text>')

        # opposed — grows left; radius on the data end only
        ow = max(opp * scale, 2)
        p.append(f'<path d="M {CX - 2} {y} H {CX - 2 - ow + 4} '
                 f'a4 4 0 0 0 -4 4 V {y + 14} a4 4 0 0 0 4 4 H {CX - 2} Z" fill="{OPP}"/>')
        p.append(f'<text x="{CX - 8 - ow}" y="{mid + 4}" font-size="12" '
                 f'fill="{SLATE}" text-anchor="end">{opp}</text>')

        # supported — grows right
        sw = max(sup * scale, 2)
        p.append(f'<path d="M {CX + 2} {y} H {CX + 2 + sw - 4} '
                 f'a4 4 0 0 1 4 4 V {y + 14} a4 4 0 0 1 -4 4 H {CX + 2} Z" fill="{SUP}"/>')
        p.append(f'<text x="{CX + 8 + sw}" y="{mid + 4}" font-size="12" '
                 f'fill="{SLATE}">{sup}</text>')

        badge = SUP if passed else "#9AA79E"
        weight = "700" if passed else "500"
        p.append(f'<text x="{W}" y="{mid + 4}" font-size="12" font-weight="{weight}" '
                 f'fill="{badge}" text-anchor="end">{outcome}</text>')

    p.append("</svg>")
    return "".join(p)


# How many of the 250 opposing submissions raise each argument, in the same
# order the page lists them. Measured, and now RE-DERIVABLE rather than read by
# hand: `python -m testimony arguments` in ~/repos/hawaii-tax-testimony prints
# this list, from phrase sets committed in testimony/arguments.py.
#
# Counts overlap — one submission usually makes several of these at once — so
# they do not sum to 250. They are RAW submission counts, which is what the
# (xN) markers in the citations describe; the distinct (deduped) count is lower
# for every theme and is reported alongside by the command above.
ARG_COUNTS = [71, 38, 34, 18, 18, 15, 12, 9, 7, 5]

# The same measurement over the 917 SUPPORTING submissions (657 distinct).
# Printed by the same command. Note how differently the two sides argue: the
# opposition's top theme is a claim about consequences, the support's top three
# are all destinations for the money.
SUPPORT_COUNTS = [451, 250, 164, 139, 135, 106, 81, 77, 75, 72]


# Argument blocks vary from ~240px to ~410px depending on how many examples and
# figures each carries, so a fixed count-per-page either overflows the tall ones
# or wastes a third of a sheet on the short ones. Pages are packed by ESTIMATED
# height instead. The estimate is calibrated against measured render heights:
# predicted vs. actual came within ~15px per block across all ten.
PAGE_CONTENT_PX = 950          # 11in sheet less 0.55in top and bottom margins
HEAD_FIRST_PX = 126            # eyebrow + h1 + standfirst on the first arg page
HEAD_CONTD_PX = 42             # the short "continued" running head
TAIL_PX = 88                   # the "also raised" line plus the footer rule
CHARS_PER_LINE = 108           # at 0.855rem in the 7.5in text column


def _visible_len(s: str) -> int:
    """Characters a reader actually sees.

    C.text() hands back raw markdown and C.list() hands back rendered HTML, so
    both carry the source-PDF URLs — around 120 characters each, none of which
    occupy a single pixel on the page. Counting them made every block estimate
    ~116px too tall.
    """
    s = re.sub(r"\]\(https?://[^)]+\)", "]", s)     # markdown links
    s = re.sub(r"<[^>]+>", "", s)                    # rendered anchors/bold
    return len(" ".join(s.split()))


def _est_lines(chars: int, per_line: int = CHARS_PER_LINE) -> int:
    return max(1, -(-chars // per_line))


def estimate_height(pre: str, i: int) -> int:
    """Rendered height of one argument block, in CSS px, without rendering it."""
    q = _visible_len(C.text(f"{pre}.{i}.q"))
    more = [_visible_len(x) for x in C.list(f"{pre}.{i}.more")]
    figs = [_visible_len(x) for x in C.list(f"{pre}.{i}.f")]

    h = 21 + 2                                    # rank/title row
    h += _est_lines(q) * 17 + 4                   # the lead quotation
    if more:
        h += 13 + sum(_est_lines(m) * 15 + 2 for m in more) + 3
    if figs:
        h += 13 + 8 + sum(_est_lines(f, 105) * 15 + 1 for f in figs)
    # Deliberately biased to OVER-estimate by ~10-30px. Under-estimating
    # overflows the sheet; over-estimating only leaves a little whitespace.
    return h + 34                                 # block padding + rule + margin


def argument(pre: str, i: int, count: int) -> str:
    """One ranked argument: heading + tally, the testimony, then its figures.

    The rank and the tally are data, so they come from ARG_COUNTS rather than
    being typed into content.md. The heading, the quotation and the figures are
    prose, so they are slots.
    """
    more = C.list(f"{pre}.{i}.more")
    more_html = (
        f'<div class="arg-m">'
        f'<span class="arg-ml">More from the record</span>'
        f'<ul{C.ul_attr(f"{pre}.{i}.more")}>'
        + "".join(f"<li>{m}</li>" for m in more) +
        f'</ul></div>') if more else ""

    facts = C.list(f"{pre}.{i}.f")
    facts_html = (
        f'<div class="arg-f">'
        f'<span class="arg-fl">Figures cited</span>'
        f'<ul{C.ul_attr(f"{pre}.{i}.f")}>'
        + "".join(f"<li>{f}</li>" for f in facts) +
        f'</ul></div>') if facts else ""
    return (
        f'<li class="arg">'
        f'<span class="arg-r">{i}</span>'
        f'<div class="arg-h">'
        f'<span class="arg-t"{C.slot_attr(f"{pre}.{i}.h")}>{C.text(f"{pre}.{i}.h")}</span>'
        f'<span class="arg-n">{count}</span>'
        f'</div>'
        # C.html, not C.t/C.text: the quotation carries a markdown link to the
        # source PDF, and only html() runs the markdown pass. It emits its own
        # <p> with the data-slot already on it.
        f'{C.html(f"{pre}.{i}.q", "arg-q")}'
        f'{more_html}'
        f'{facts_html}'
        f'</li>')


def ranked_pages(pre: str, head_pre: str, counts: list[int],
                 start_page: int, cls: str = "") -> str:
    """The ranked arguments, flowing over as many letter pages as they need.

    The section grows with the evidence rather than being squeezed onto one
    sheet: add an eleventh argument and it simply lands on the next page.
    """
    # Pack greedily by estimated height. A block only moves to the next sheet
    # when it genuinely will not fit, so a page holds two tall arguments or
    # three short ones rather than a fixed count that has to suit both.
    chunks: list[list[int]] = []
    cur: list[int] = []
    used = HEAD_FIRST_PX
    for i in range(1, len(counts) + 1):
        h = estimate_height(pre, i)
        last = i == len(counts)
        budget = PAGE_CONTENT_PX - (TAIL_PX if last else 0)
        if cur and used + h > budget:
            chunks.append(cur)
            cur, used = [], HEAD_CONTD_PX
            budget = PAGE_CONTENT_PX - (TAIL_PX if last else 0)
        cur.append(i)
        used += h
    if cur:
        chunks.append(cur)
    out = []
    for n, chunk in enumerate(chunks):
        page_no = start_page + n
        first = n == 0
        head = (
            f'<div class="eyebrow"{L.attr(f"{head_pre}.eyebrow")}>{C.t(f"{head_pre}.eyebrow")}</div>'
            f'{L.spacer(f"{head_pre}.h1")}<h1 class="h1-b"{L.attr(f"{head_pre}.h1")}>{C.t(f"{head_pre}.h1")}</h1>'
            f'{C.html(f"{head_pre}.standfirst", "standfirst")}'
            if first else
            f'<div class="eyebrow contd"{L.attr(f"{head_pre}.contd")}>{C.t(f"{head_pre}.contd")}</div>')
        tail = (f'{C.html(f"{head_pre}.also", "also")}'
                f'<div class="foot"{L.attr(f"{head_pre}.foot")}>{C.t(f"{head_pre}.foot")}</div>'
                if n == len(chunks) - 1 else "")
        body = "".join(argument(pre, i, counts[i - 1]) for i in chunk)
        out.append(
            f'\n<section class="page">\n  {head}\n'
            f'  <ol class="args{cls}">{body}</ol>\n  {tail}\n'
            f'{C.extras(f"page{page_no}")} {L.layer(page_no)}'
            f'{L.text_boxes(page_no)}{L.tables_html(page_no)}\n</section>')
    return "".join(out)


def _arg_pages() -> int:
    """How many sheets the opposition section takes, so the support section
    starts on the one after it. Same packer, so the answer cannot drift from
    what actually renders."""
    return ranked_pages("arg", "p2", ARG_COUNTS, 2).count('<section class="page"')



# Organisations that filed more than once, measured over the 336 organisation
# records with a resolved name. Two filters make these numbers safe to print,
# because an ORGANISATIONS table is the one artifact where a bad attribution is
# the headline rather than a footnote:
#   - names are canonicalised through orgs.yml (a masthead that extracts as its
#     chair's name, a hearing header that is not a filer at all);
#   - records holding TWO organisations' letters are dropped, because the name
#     comes from one and the position can come from the other. That is what had
#     the Department of Taxation — which files comments, not positions — showing
#     up as a supporter: DHHL's "strongly supports this bill" sat inside DOTAX's
#     record.
# Regenerate with `python -m testimony organisations`.
ORG_OPPOSE = [
    ("Hawaiʻi Association of REALTORS", 11, 4),
    ("Grassroot Institute of Hawaii", 10, 4),
    ("NAIOP Hawaii", 10, 3),
    ("Chamber of Commerce Hawaii", 3, 2),
    ("Land Use Research Foundation of Hawaii", 3, 2),
    ("Hawaiʻi Food Industry Association", 2, 2),
    ("Trust for Public Land", 1, 1),
    ("Kobayashi Group", 1, 1),
    ("Building Industry Association of Hawaii", 1, 1),
    ("Hawaiʻi Laborers & Employers Cooperation", 1, 1),
]
ORG_SUPPORT = [
    ("Hawaiʻi Appleseed Center for Law and Economic Justice", 14, 5),
    ("Protect Democracy", 12, 6),
    ("Hawaiʻi Children's Action Network Speaks!", 12, 6),
    ("Hawaiʻi Public Health Institute", 10, 7),
    ("Hawaiʻi YIMBY", 7, 2),
    ("Department of Hawaiian Home Lands", 6, 1),
    ("Women's Caucus", 5, 4),
    ("Council for Native Hawaiian Advancement", 5, 2),
    ("Office of the Governor", 5, 2),
    ("The Nature Conservancy", 4, 1),
]


def org_column(rows, accent: str, head_key: str) -> str:
    """One ranked column of organisations: name, submissions, bills."""
    items = "".join(
        f'<li class="org">'
        f'<span class="org-r" style="background:{accent}">{i}</span>'
        f'<span class="org-n">{name}</span>'
        f'<span class="org-c" style="color:{accent}">{n}</span>'
        f'<span class="org-b">{b} bill{"s" if b != 1 else ""}</span>'
        f'</li>'
        for i, (name, n, b) in enumerate(rows, 1))
    return (f'<div class="col">'
            f'<h3 style="color:{accent}"{L.attr(head_key)}>{C.t(head_key)}</h3>'
            f'<ol class="orgs">{items}</ol></div>')


def bullets(key: str) -> str:
    """C.list() returns a list[str] of items — the caller builds the <li>s.

    Interpolating the list straight into an f-string prints its Python repr
    (brackets and quotes) onto the page.
    """
    return "".join(f"<li>{item}</li>" for item in C.list(key))


def stat(key: str) -> str:
    """One figure in the top strip — number and label are separate slots."""
    return (f'<div class="stat">'
            f'<div class="stat-n"{C.slot_attr(f"stats.{key}.num")}>'
            f'{C.text(f"stats.{key}.num")}</div>'
            f'<div class="stat-l"{C.slot_attr(f"stats.{key}.lab")}>'
            f'{C.text(f"stats.{key}.lab")}</div></div>')


page = f"""
<section class="page">
  <div class="eyebrow"{L.attr("hero.eyebrow")}>{C.t("hero.eyebrow")}</div>
  {L.spacer("hero.h1")}<h1{L.attr("hero.h1")}>{C.t("hero.h1")}</h1>
  {C.html("hero.standfirst", "standfirst")}

  <div class="stats"{L.attr("stats.strip")}>
    {stat("a")}{stat("b")}{stat("c")}{stat("d")}
  </div>

  <h2{L.attr("chart.title")}>{C.t("chart.title")}</h2>
  {graphic(L, "chart.diverging", diverging_chart(), w=7.0)}
  {C.html("chart.note", "note")}

  <div class="cols">
    <div class="col">
      <h3 class="h-sup"{L.attr("support.h")}>{C.t("support.h")}</h3>
      <ul{C.ul_attr("support.themes")}>{bullets("support.themes")}</ul>
    </div>
    <div class="col">
      <h3 class="h-opp"{L.attr("oppose.h")}>{C.t("oppose.h")}</h3>
      <ul{C.ul_attr("oppose.themes")}>{bullets("oppose.themes")}</ul>
    </div>
  </div>

  <h3 class="h-find"{L.attr("find.h")}>{C.t("find.h")}</h3>
  {C.html("find.body", "find")}

  <div class="foot"{L.attr("footer.note")}>{C.t("footer.note")}</div>
{C.extras("page1")} {L.layer(1)}{L.text_boxes(1)}{L.tables_html(1)}
</section>

{ranked_pages("arg", "p2", ARG_COUNTS, 2)}
{ranked_pages("sup", "p6", SUPPORT_COUNTS, 2 + _arg_pages(), " sup")}
<section class="page">
  <div class="eyebrow"{L.attr("p10.eyebrow")}>{C.t("p10.eyebrow")}</div>
  {L.spacer("p10.h1")}<h1 class="h1-b"{L.attr("p10.h1")}>{C.t("p10.h1")}</h1>
  {C.html("p10.standfirst", "standfirst")}
  <div class="cols org-cols">
    {org_column(ORG_OPPOSE, OPP, "p10.oppose.h")}
    {org_column(ORG_SUPPORT, SUP, "p10.support.h")}
  </div>
  {C.html("p10.note", "find")}
  <div class="foot"{L.attr("p10.foot")}>{C.t("p10.foot")}</div>
{C.extras("page10")} {L.layer(10)}{L.text_boxes(10)}{L.tables_html(10)}
</section>"""

body = C.fn.resolve(page)
notes = C.fn.endnotes()
endnotes = "".join(
    f'<li id="en{i + 1}">{txt} <a href="{url}">{url}</a></li>'
    for i, (txt, url) in enumerate(notes))

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{C.text("title")}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
<style>
  /* Neither Manrope nor Poppins encodes U+02BB, so every ʻokina used to fall
     back to the OS UI font. These one-glyph faces re-encode each family's own
     U+2018 outline at U+02BB; unicode-range keeps them from claiming anything
     else, so they must come FIRST in a stack. See tools/build_okina_font.py. */
{OKINA_FACES}
  body {{ margin:0; background:{CREAM};
         font:15.5px/1.55 OkinaManrope, Manrope, system-ui, sans-serif; color:{INK}; }}
  .page {{ width:8.5in; min-height:11in; margin:24px auto; background:#fff;
           box-shadow:0 4px 18px rgba(0,0,0,.12); padding:0.55in 0.5in;
           box-sizing:border-box; position:relative; overflow:hidden; }}

  .eyebrow {{ font-size:0.95rem; font-weight:700; letter-spacing:.09em;
              color:{DEEP}; margin-bottom:6px; }}
  h1 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif; font-size:2.2rem;
        line-height:1.08; margin:0 0 8px; color:{INK}; letter-spacing:-.015em; }}
  .standfirst {{ font-size:1.02rem; line-height:1.45; margin:0 0 10px;
                 color:{SLATE}; max-width:6.6in; }}
  .standfirst strong {{ color:{INK}; }}

  .stats {{ display:flex; gap:9px; margin:0 0 11px; }}
  .stat {{ flex:1; background:{CREAM}; border-left:3px solid {TEAL};
           padding:7px 11px; border-radius:0 8px 8px 0; }}
  .stat-n {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif; font-size:1.42rem; font-weight:700;
             line-height:1.1; color:{DEEP}; }}
  .stat-l {{ font-size:0.93rem; color:{SLATE}; line-height:1.3; margin-top:2px; }}

  h2 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif; font-size:1.16rem; margin:0 0 6px;
        color:{INK}; }}
  .note {{ font-size:0.95rem; color:{SLATE}; margin:4px 0 9px; }}

  .cols {{ display:flex; gap:20px; margin:0 0 7px; }}
  .col {{ flex:1; }}
  h3 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif; font-size:1.02rem; margin:0 0 5px; }}
  .h-sup {{ color:{SUP}; }}
  .h-opp {{ color:{OPP}; }}
  .h-find {{ color:{INK}; margin-top:2px; }}
  .col ul {{ margin:0; padding-left:1.05em; }}
  .col li {{ font-size:0.94rem; line-height:1.38; margin-bottom:3px; color:{SLATE}; }}
  .col li strong {{ color:{INK}; }}

  .find {{ font-size:0.94rem; line-height:1.38; margin:0 0 3px; color:{SLATE}; }}
  .find strong {{ color:{INK}; }}

  /* --- page 2: the ranked case against ------------------------------- */
  .h1-b {{ font-size:1.9rem; }}
  .args {{ list-style:none; margin:6px 0 0; padding:0; }}
  .arg {{ padding:0 0 6px 26px; position:relative;
          margin-bottom:6px; border-bottom:1px solid #EDF1EC; }}
  .arg:last-child {{ border-bottom:0; }}
  .arg-r {{ position:absolute; left:0; top:1px;
            width:19px; height:19px; border-radius:50%; background:{OPP};
            color:#fff; font-size:0.8rem; font-weight:700;
            display:flex; align-items:center; justify-content:center; }}
  .arg-h {{ display:flex; align-items:baseline; gap:9px; margin-bottom:0; }}
  .arg-t {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif; font-size:0.96rem; font-weight:600;
            color:{INK}; flex:1; }}
  .arg-n {{ font-size:0.82rem; font-weight:700; color:{OPP}; white-space:nowrap; }}
  .arg-q {{ margin:0; font-size:0.87rem; line-height:1.3; color:{SLATE};
            border-left:2px solid {ASH}; padding-left:8px; }}
  .also {{ font-size:0.92rem; color:#7C8A80; margin:6px 0 0; }}
  .contd {{ color:#9AA79E; margin-bottom:10px; }}
  .arg-m {{ margin:3px 0 0 0; padding-left:8px;
            border-left:2px solid #E4EAE3; }}
  .arg-ml {{ display:block; font-size:0.67rem; font-weight:700; color:#8A968D;
             letter-spacing:.06em; text-transform:uppercase; margin-bottom:1px; }}
  .arg-m ul {{ margin:0; padding-left:0.95em; }}
  .arg-m li {{ font-size:0.855rem; line-height:1.28; color:{SLATE};
               margin-bottom:2px; }}
  .arg-f {{ margin:3px 0 0 0; padding:4px 8px; background:#FAF7F4;
            border-radius:5px; }}
  /* The support section reuses every .arg rule and only re-accents it, so the
     two ranked sections stay identical in rhythm and differ only in colour. */
  .args.sup .arg-r {{ background:{SUP}; }}
  .args.sup .arg-n {{ color:{SUP}; }}
  .args.sup .arg-fl {{ color:{SUP}; }}
  .arg-fl {{ display:block; font-size:0.67rem; font-weight:700; color:{OPP};
             letter-spacing:.06em; text-transform:uppercase; margin-bottom:1px; }}
  .arg-f ul {{ margin:0; padding-left:0.95em; }}
  .arg-f li {{ font-size:0.855rem; line-height:1.28; color:{SLATE};
               margin-bottom:1px; }}
  .arg-f li strong {{ color:{INK}; }}
  .arg-f li em {{ color:#8A968D; font-style:normal; font-size:0.86rem; }}

  /* --- the organisations page ---------------------------------------- */
  .org-cols {{ gap:26px; margin-top:4px; }}
  .orgs {{ list-style:none; margin:6px 0 0; padding:0; }}
  .org {{ display:flex; align-items:baseline; gap:7px; padding:4px 0;
          border-bottom:1px solid #EDF1EC; font-size:0.9rem; }}
  .org:last-child {{ border-bottom:0; }}
  .org-r {{ flex:0 0 auto; width:17px; height:17px; border-radius:50%;
            color:#fff; font-size:0.7rem; font-weight:700; display:flex;
            align-items:center; justify-content:center; }}
  .org-n {{ flex:1; color:{INK}; line-height:1.25; }}
  .org-c {{ font-weight:700; font-size:0.95rem; white-space:nowrap; }}
  .org-b {{ flex:0 0 auto; font-size:0.78rem; color:#8A968D;
            white-space:nowrap; width:46px; text-align:right; }}
  .foot {{ margin-top:8px; padding-top:7px; border-top:1px solid {ASH};
           font-size:0.84rem; color:#7C8A80; }}
  .arg a, .arg-f a, .arg-m a {{ color:{DEEP}; text-decoration:none;
                                border-bottom:1px solid {ASH}; }}
  .endnotes {{ font-size:12px; }}
  sup a {{ color:{DEEP}; text-decoration:none; }}
</style>
</head>
<body>
{pdf_button(L, bg=DEEP)}
{body}
</body>
</html>
"""

_OUT.write_text(html)
print(f"wrote {_OUT} ({len(html):,} bytes)")
