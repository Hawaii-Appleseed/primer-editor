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
import sys

HERE = Path(__file__).resolve().parent           # projects/tax-testimony
REPO = HERE.parent.parent                        # repo root, where docsync/ lives
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from docsync.content import Content              # noqa: E402
from docsync.layout import Layout                # noqa: E402
from docsync.blocks import graphic               # noqa: E402

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
    ("HB2049", "Conveyance tax",   539, 28, "died"),
    ("SB3028", "Conveyance tax",   127, 17, "died"),
    ("SB2362", "REIT loophole",     80, 11, "died"),
    ("HB1850", "Capital gains",     66, 11, "died"),
    ("HB2010", "Millionaire's tax", 42,  2, "died"),
    ("SB3125", "Act 46 freeze",     30, 181, "PASSED"),
    ("HB2306", "Act 46 freeze",     30, 156, "died"),
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


# How many of the 389 opposition submissions raise each argument on page 2, in
# the same order the page lists them. Measured, not estimated — regenerate from
# ~/repos/hawaii-tax-testimony. Counts overlap: one submission usually makes
# several of these arguments at once.
ARG_COUNTS = [98, 53, 46, 30, 28, 19, 16, 12, 10, 10]


def argument(i: int, count: int) -> str:
    """One ranked argument: heading + tally, then the testimony it came from.

    The rank and the tally are data, so they are rendered from ARG_COUNTS rather
    than typed into content.md — the heading and the quotation are prose, so
    they are slots.
    """
    return (
        f'<li class="arg">'
        f'<div class="arg-h">'
        f'<span class="arg-t"{C.slot_attr(f"arg.{i}.h")}>{C.text(f"arg.{i}.h")}</span>'
        f'<span class="arg-n">{count}</span>'
        f'</div>'
        f'<p class="arg-q"{C.slot_attr(f"arg.{i}.q")}>{C.text(f"arg.{i}.q")}</p>'
        f'</li>')


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

<section class="page">
  <div class="eyebrow"{L.attr("p2.eyebrow")}>{C.t("p2.eyebrow")}</div>
  {L.spacer("p2.h1")}<h1 class="h1-b"{L.attr("p2.h1")}>{C.t("p2.h1")}</h1>
  {C.html("p2.standfirst", "standfirst")}

  <ol class="args">
    {"".join(argument(i + 1, n) for i, n in enumerate(ARG_COUNTS))}
  </ol>

  {C.html("p2.also", "also")}
  <div class="foot"{L.attr("p2.foot")}>{C.t("p2.foot")}</div>
{C.extras("page2")} {L.layer(2)}{L.text_boxes(2)}{L.tables_html(2)}
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
  body {{ margin:0; background:{CREAM};
         font:15.5px/1.55 Manrope, system-ui, sans-serif; color:{INK}; }}
  .page {{ width:8.5in; min-height:11in; margin:24px auto; background:#fff;
           box-shadow:0 4px 18px rgba(0,0,0,.12); padding:0.75in 0.62in;
           box-sizing:border-box; position:relative; overflow:hidden; }}

  .eyebrow {{ font-size:0.95rem; font-weight:700; letter-spacing:.09em;
              color:{DEEP}; margin-bottom:6px; }}
  h1 {{ font-family:Poppins, Manrope, sans-serif; font-size:2.2rem;
        line-height:1.08; margin:0 0 8px; color:{INK}; letter-spacing:-.015em; }}
  .standfirst {{ font-size:1.02rem; line-height:1.45; margin:0 0 10px;
                 color:{SLATE}; max-width:6.6in; }}
  .standfirst strong {{ color:{INK}; }}

  .stats {{ display:flex; gap:9px; margin:0 0 11px; }}
  .stat {{ flex:1; background:{CREAM}; border-left:3px solid {TEAL};
           padding:7px 11px; border-radius:0 8px 8px 0; }}
  .stat-n {{ font-family:Poppins, sans-serif; font-size:1.42rem; font-weight:700;
             line-height:1.1; color:{DEEP}; }}
  .stat-l {{ font-size:0.93rem; color:{SLATE}; line-height:1.3; margin-top:2px; }}

  h2 {{ font-family:Poppins, sans-serif; font-size:1.16rem; margin:0 0 6px;
        color:{INK}; }}
  .note {{ font-size:0.95rem; color:{SLATE}; margin:4px 0 9px; }}

  .cols {{ display:flex; gap:20px; margin:0 0 7px; }}
  .col {{ flex:1; }}
  h3 {{ font-family:Poppins, sans-serif; font-size:1.02rem; margin:0 0 5px; }}
  .h-sup {{ color:{SUP}; }}
  .h-opp {{ color:{OPP}; }}
  .h-find {{ color:{INK}; margin-top:2px; }}
  .col ul {{ margin:0; padding-left:1.05em; }}
  .col li {{ font-size:0.94rem; line-height:1.38; margin-bottom:3px; color:{SLATE}; }}
  .col li strong {{ color:{INK}; }}

  .find {{ font-size:0.94rem; line-height:1.4; margin:0 0 4px; color:{SLATE}; }}
  .find strong {{ color:{INK}; }}

  /* --- page 2: the ranked case against ------------------------------- */
  .h1-b {{ font-size:1.9rem; }}
  .args {{ list-style:none; counter-reset:arg; margin:4px 0 0; padding:0; }}
  .arg {{ counter-increment:arg; padding:0 0 4px 30px; position:relative;
          margin-bottom:3px; border-bottom:1px solid #EDF1EC; }}
  .arg:last-child {{ border-bottom:0; }}
  .arg::before {{ content:counter(arg); position:absolute; left:0; top:1px;
                  width:21px; height:21px; border-radius:50%; background:{OPP};
                  color:#fff; font-size:0.8rem; font-weight:700;
                  display:flex; align-items:center; justify-content:center; }}
  .arg-h {{ display:flex; align-items:baseline; gap:10px; margin-bottom:1px; }}
  .arg-t {{ font-family:Poppins, sans-serif; font-size:1.0rem; font-weight:600;
            color:{INK}; flex:1; }}
  .arg-n {{ font-size:0.82rem; font-weight:700; color:{OPP}; white-space:nowrap; }}
  .arg-q {{ margin:0; font-size:0.92rem; line-height:1.36; color:{SLATE};
            border-left:2px solid {ASH}; padding-left:9px; }}
  .also {{ font-size:0.92rem; color:#7C8A80; margin:6px 0 0; }}

  .foot {{ margin-top:8px; padding-top:7px; border-top:1px solid {ASH};
           font-size:0.84rem; color:#7C8A80; }}
  .endnotes {{ font-size:12px; }}
  sup a {{ color:{DEEP}; text-decoration:none; }}
</style>
</head>
<body>
{body}
</body>
</html>
"""

_OUT.write_text(html)
print(f"wrote {_OUT} ({len(html):,} bytes)")
