#!/usr/bin/env python3
"""Rx Kids Hawaiʻi fiscal one-pager — cost, and who can legally pay for it.

Every visual goes through the engine's hooks so the user can move, resize and
edit it: prose through C.t/C.html (never bare C(), which emits no data-slot),
each chart through graphic() (a bare <svg> is frozen and invisible to the
editor).

The figures are baked in as DATA below rather than read from a file: a data
file the renderer opens would have to be declared under `editor.engine` in
docsync.yml or the draft silently fails to build in Pyodide. Every number is
reproducible from ~/Census-Forecaster:

    uv run python forecast_rxkids_2028.py            # program cost + reach
    # funding-source split by FPL threshold:
    uv run python <scratch>/rxkids_tanf_split.py

Modeled program (the proposed HI structure, universal — same benefit for
every birth family, no work requirement, no asset test, no spending
restriction):
    $1,500 once during pregnancy (>=16 weeks gestation)
    $500/mo, months 1-6      -> core program,  $4,500/birth
    $500/mo, months 7-12     -> contingent on available funds, $7,500/birth
"""
from pathlib import Path
import os
import re
import sys

HERE = Path(__file__).resolve().parent           # projects/rxkids-fiscal
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
MUTE = "#7C8A80"

# Categorical pair for the funding-source encoding. The brand greens sit below
# the chroma floor and read gray as data marks, so these are stepped up until
# they pass. Validated with the dataviz validator (all six checks pass; worst
# adjacent CVD separation dE 10.8 protan / 27.8 tritan, normal-vision 23.0,
# all >= 3:1 on the sheet).
FED = "#00907A"       # federal TANF can cover this
NONFED = "#C4602F"    # state / county / philanthropic dollars
MEDI = "#3D5A98"      # Medicaid-eligible births (third validated slot)

# --- The modeled program -----------------------------------------------------
# TY2028, universal eligibility, take-up 0.90 newborn / 0.83 prenatal.
BIRTHS_PROJECTED = 13842      # CDC NVSR + HI DOH nowcast, Kalman-projected
BIRTHS_SERVED = 13228         # after take-up

COST_CORE = 52_145_328        # prenatal + 6 months  ($4,500/birth)
COST_FULL = 87_861_306        # prenatal + 12 months ($7,500/birth)

# The Medicaid split, computed per-family off the model's own medicaid_receives
# flag (Med-QUEST categorical eligibility on real PUMS incomes) — NOT the
# KFF national Medicaid-financed-birth rate.
BIRTHS_MEDICAID = 7969        # 60.2%
BIRTHS_NONMEDICAID = 5259     # 39.8%

# --- The TANF envelope -------------------------------------------------------
# Federal TANF is capped TWICE over, and both caps bind:
#
#  1. STRUCTURE. Ongoing monthly cash for basic needs is "assistance"
#     (45 CFR 260.31), which triggers work requirements and the 60-month
#     clock — fatal to a no-work-requirement design. Michigan's Rx Kids
#     instead classifies its TANF slice as a non-recurrent short-term
#     benefit (NRST), which is exempt but must not exceed 4 payments. So at
#     MOST $1,500 + 3 x $500 = $3,000/birth is TANF-fundable, REGARDLESS of
#     how long the full program runs. Verified 2026-08-18 directly against
#     Rx Kids' own "Playbook for Replicating Rx Kids: Utilizing TANF and
#     Protecting Public Benefits" (Hanna & Shaefer, MSU/Poverty Solutions,
#     July 2024 -- written with MDHHS's TANF Policy Director), quoting
#     Michigan's TANF state plan: "no state funding will be used to support
#     families after these four payments."
#  2. INCOME. TANF dollars reach only families meeting a state "needy
#     family" test. Michigan's VERIFIED mechanism is general Medicaid
#     enrollment (not a pregnancy-specific pathway): "Families not covered
#     by Medicaid at the time of birth receive benefits through
#     philanthropic sources" (same playbook, quoting Michigan's state plan).
#
# Both screens price the SAME $3,000/birth cap -- only which births it
# reaches differs -- so TANF $ is IDENTICAL between the core (6mo) and full
# (12mo) program for a given screen; only the non-federal residual grows.
# Computed in rxkids_tanf_split.py. An EARLIER version of that script (and
# of this constant) re-ran RxKids' own eligibility test per FPL threshold,
# which is wrong: eligibility is (medicaid_receives OR income<=cap), and
# medicaid_receives is independent of income_fpl_cap, so it dominated every
# threshold up to 313% FPL and returned identical results throughout (that
# bug inflated "Med-QUEST pregnancy screen" TANF-fundable $ from a real
# $12.1M to a wrongly-uncapped ~$31-53M). Fixed by gating a raw FPL ratio
# directly instead of re-running RxKids' eligibility clauses.
TANF_ENVELOPE_UNIVERSAL = 34_287_339   # the $3,000 cap x every birth, for scale

# (label, TANF-fundable $ [same for core+full], births reached)
TANF_SCREENS = [
    ("Medicaid enrollment — Michigan's actual approach",
     20_655_771, 7969),
    ("Hawaiʻi's current TANF test (net income, ~30% FPL)",
     1_433_999, 553),
]

# Hawaii TANF context (federal award + the idle reserve). Both verified
# 2026-08-18 against primary documents: ACF's official FY2024 TANF Financial
# Data Table (SFAG, sheet E.2) and Hawaii DHS's "Report to the Thirty-Third
# Hawaii State Legislature 2025" (HRS 346-51.5), filed 2025-03-20 by
# Director Ryan I. Yamane, Attachment 1 "TANF Financial Plan."
TANF_BLOCK_GRANT = 98_578_402          # annual State Family Assistance Grant
TANF_RESERVE = 459_178_667             # reserve balance as of February 2025


def money_m(v: float, dp: int = 1) -> str:
    return f"${v / 1e6:.{dp}f}M"


# --- Graphic 1: the payment schedule and the TANF ceiling --------------------

def payment_timeline() -> str:
    """Every payment the program makes, coloured by which funder can cover it.

    The point of the chart is the CEILING: federal TANF stops after four
    payments no matter how long the program runs, so the bars are coloured by
    funder and a band beneath restates the same split — identity never rests
    on colour alone.
    """
    W, H = 820, 140
    BASE = 88                       # bar baseline
    X0, SLOT, BW = 34, 59, 44
    UNIT = 58 / 1500.0              # px per dollar

    def x(i):
        return X0 + i * SLOT

    # slot 0 = prenatal; slots 1..12 = months 1..12
    p = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'role="img" aria-label="Payment schedule by funding source: federal '
         f'TANF can cover the first four payments only">']

    # legend — always present for >= 2 series
    p.append(f'<rect x="0" y="0" width="11" height="11" rx="2.5" fill="{FED}"/>')
    p.append(f'<text x="17" y="9.5" font-size="12.5" fill="{SLATE}">'
             f'Federal TANF can cover</text>')
    p.append(f'<rect x="168" y="0" width="11" height="11" rx="2.5" fill="{NONFED}"/>')
    p.append(f'<text x="185" y="9.5" font-size="12.5" fill="{SLATE}">'
             f'State / county / philanthropy</text>')
    p.append(f'<rect x="392" y="0" width="11" height="11" rx="2.5" fill="{NONFED}" '
             f'opacity="0.45"/>')
    p.append(f'<text x="409" y="9.5" font-size="12.5" fill="{SLATE}">'
             f'…contingent on available funds</text>')

    # value labels
    p.append(f'<text x="{x(0) + BW/2}" y="24" font-size="12.5" font-weight="700" '
             f'fill="{INK}" text-anchor="middle">$1,500</text>')
    p.append(f'<text x="{x(6) + BW/2}" y="58" font-size="12.5" font-weight="700" '
             f'fill="{INK}" text-anchor="middle">$500 per month</text>')

    bars = [(0, 1500, FED, 1.0)]
    for m in range(1, 13):
        if m <= 3:
            fill, op = FED, 1.0
        elif m <= 6:
            fill, op = NONFED, 1.0
        else:
            fill, op = NONFED, 0.45
        bars.append((m, 500, fill, op))

    for i, val, fill, op in bars:
        h = val * UNIT
        y = BASE - h
        # 4px radius on the data end only, anchored to the baseline
        p.append(f'<path d="M {x(i)} {BASE} V {y + 4} a4 4 0 0 1 4 -4 '
                 f'H {x(i) + BW - 4} a4 4 0 0 1 4 4 V {BASE} Z" '
                 f'fill="{fill}" opacity="{op}"/>')
        lab = "Pregnancy" if i == 0 else str(i)
        p.append(f'<text x="{x(i) + BW/2}" y="{BASE + 14}" font-size="11.5" '
                 f'fill="{MUTE}" text-anchor="middle">{lab}</text>')

    p.append(f'<line x1="{X0}" y1="{BASE}" x2="{x(12) + BW}" y2="{BASE}" '
             f'stroke="{ASH}" stroke-width="1"/>')

    # the funding band — a 2px surface gap between the two fills
    by, bh = 107, 20
    split = x(3) + BW + 6
    p.append(f'<rect x="{X0}" y="{by}" width="{split - X0 - 2}" height="{bh}" '
             f'rx="5" fill="{FED}"/>')
    p.append(f'<text x="{(X0 + split) / 2}" y="{by + 16}" font-size="12" '
             f'font-weight="700" fill="#fff" text-anchor="middle">'
             f'4 payments · $3,000 max</text>')
    p.append(f'<rect x="{split}" y="{by}" width="{x(12) + BW - split}" '
             f'height="{bh}" rx="5" fill="{NONFED}"/>')
    p.append(f'<text x="{(split + x(12) + BW) / 2}" y="{by + 16}" font-size="12" '
             f'font-weight="700" fill="#fff" text-anchor="middle">'
             f'every remaining payment</text>')

    # The "by rule, not by budget" half of this caption now lives in the
    # section heading, where it reads as the finding rather than a footnote.
    p.append(f'<text x="{X0}" y="{by + 32}" font-size="11.5" fill="{MUTE}">'
             f'Numbered bars are months after birth.</text>')
    p.append("</svg>")
    return "".join(p)


# --- Graphic 2: who pays, under each candidate needy-family screen -----------

def funding_split() -> str:
    """Stacked TANF vs non-federal, for both program lengths and both screens.

    One shared scale across all four bars so they are directly comparable, and
    every segment is directly labelled.
    """
    W = 820
    ROW, GAP, GRPGAP = 18, 3, 6
    # The TANF segment is only ~21px wide in the tightest row ($3.2M against a
    # $87.9M scale) — far too narrow to hold its own label inside. So the
    # federal value lives in the gutter for EVERY row (right-aligned, in the
    # federal colour) rather than inside for some rows and outside for others;
    # only the always-wide non-federal segment is labelled in place.
    X0 = 214
    BARMAX = W - X0 - 8
    scale = BARMAX / COST_FULL

    rows = []
    for label, tanf, _births in TANF_SCREENS:
        rows.append(("hdr", label, 0, 0))
        rows.append(("bar", "Core · through 6 mo", tanf, COST_CORE))
        rows.append(("bar", "Full · through 12 mo", tanf, COST_FULL))

    H = 20 + sum(ROW + GAP if k == "bar" else 16 for k, *_ in rows) + GRPGAP + 2

    p = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'role="img" aria-label="Annual cost split between federal TANF and '
         f'non-federal dollars, by program length and needy-family screen">']

    p.append(f'<rect x="0" y="0" width="11" height="11" rx="2.5" fill="{FED}"/>')
    p.append(f'<text x="17" y="9.5" font-size="12.5" fill="{SLATE}">Federal TANF</text>')
    p.append(f'<rect x="112" y="0" width="11" height="11" rx="2.5" fill="{NONFED}"/>')
    p.append(f'<text x="129" y="9.5" font-size="12.5" fill="{SLATE}">'
             f'State / county / philanthropy</text>')
    p.append(f'<text x="{W}" y="9.5" font-size="12" fill="{MUTE}" '
             f'text-anchor="end">all bars share one scale</text>')

    y = 20
    for kind, label, tanf, total in rows:
        if kind == "hdr":
            if y > 24:            # extra air before a 2nd group
                y += GRPGAP
            p.append(f'<text x="0" y="{y + 10}" font-size="12.5" font-weight="700" '
                     f'fill="{INK}">{label}</text>')
            y += 16
            continue

        p.append(f'<text x="0" y="{y + 14}" font-size="12.5" '
                 f'fill="{SLATE}">{label}</text>')

        tw = tanf * scale
        rest = total - tanf
        rw = rest * scale
        # 2px surface gap between stacked segments
        p.append(f'<path d="M {X0} {y} H {X0 + tw - 4} a4 4 0 0 1 4 4 '
                 f'V {y + ROW - 4} a4 4 0 0 1 -4 4 H {X0} Z" fill="{FED}"/>')
        p.append(f'<path d="M {X0 + tw + 2} {y} H {X0 + tw + 2 + rw - 4} '
                 f'a4 4 0 0 1 4 4 V {y + ROW - 4} a4 4 0 0 1 -4 4 '
                 f'H {X0 + tw + 2} Z" fill="{NONFED}"/>')

        # federal value in the gutter, in the federal colour
        p.append(f'<text x="{X0 - 10}" y="{y + 14}" font-size="12.5" '
                 f'font-weight="700" fill="{FED}" text-anchor="end">'
                 f'{money_m(tanf)}</text>')
        # Kept short deliberately: the narrowest non-federal segment is ~230px,
        # and the long form ("needed from non-federal sources") overflows it.
        # The legend and the section heading carry the rest of the sentence.
        p.append(f'<text x="{X0 + tw + 12}" y="{y + 14}" font-size="12.5" '
                 f'font-weight="700" fill="#fff">{money_m(rest)} to raise</text>')
        y += ROW + GAP

    p.append("</svg>")
    return "".join(p)


# --- Graphic 3: births by Medicaid status ------------------------------------

def medicaid_split() -> str:
    """One 100% bar: how the birth cohort divides on Medicaid eligibility.

    A single split, so a bar beats a pie — and both segments are directly
    labelled with count and share.
    """
    W, H = 820, 58
    X0, BW, BH, Y = 0, 820, 26, 14
    total = BIRTHS_MEDICAID + BIRTHS_NONMEDICAID
    mw = BW * BIRTHS_MEDICAID / total

    p = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'role="img" aria-label="Births served, split by Medicaid '
         f'eligibility">']
    p.append(f'<text x="0" y="10" font-size="12.5" fill="{MUTE}">'
             f'{total:,} births served each year</text>')

    p.append(f'<rect x="{X0}" y="{Y}" width="{mw - 2}" height="{BH}" rx="5" '
             f'fill="{MEDI}"/>')
    p.append(f'<rect x="{X0 + mw}" y="{Y}" width="{BW - mw}" height="{BH}" '
             f'rx="5" fill="{NONFED}" opacity="0.75"/>')

    p.append(f'<text x="10" y="{Y + 19}" font-size="13" font-weight="700" '
             f'fill="#fff">{BIRTHS_MEDICAID:,} on Medicaid  ·  60%</text>')
    p.append(f'<text x="{X0 + mw + 10}" y="{Y + 19}" font-size="13" '
             f'font-weight="700" fill="#fff">{BIRTHS_NONMEDICAID:,}  ·  40%</text>')

    p.append(f'<text x="0" y="{Y + BH + 14}" font-size="11.5" fill="{MUTE}">'
             f'Only the left-hand pool is reachable with federal dollars.</text>')
    p.append("</svg>")
    return "".join(p)


# Card "d" is the thesis (what share TANF can cover), not a peer of the three
# descriptive facts beside it — and it is a statement about FEDERAL money, so it
# takes the federal green the charts already use for that. The other three keep
# the neutral brand teal.
def stat(key: str, cls: str = "") -> str:
    return (f'<div class="stat{cls}"{L.attr(f"stat.{key}")}>'
            f'<div class="stat-n">{C.t(f"stat.{key}.n")}</div>'
            f'<div class="stat-l">{C.t(f"stat.{key}.l")}</div></div>')


def bullets(key: str) -> str:
    return "".join(f"<li>{b}</li>" for b in C.list(key))


# Filled after C.fn.resolve() has walked the body and assigned every number.
ENDNOTES_SLOT = "<!--ds-endnotes-->"


def endnote_link(n: int, sid: str, txt: str, url: str) -> str:
    # Keyed by source id, not by n: the number is whatever the current order
    # says, but the identity the editor routes an edit back through has to stay
    # put. data-el also makes the entry draggable to reorder.
    # The citation TEXT is the link, not a spelled-out URL beside it. Six
    # printed URLs cost two vertical inches on a page that has none to spare,
    # and every route this page reaches a reader by — PDF, screen — carries
    # the href.
    sep = "" if n == 1 else '<span class="ensep"> · </span>'
    return (f'{sep}<span id="en{n}" class="en"{L.attr(f"endnote.{sid}")}>'
            f'<span class="enn">{n}</span> <a href="{url}">{txt}</a></span>')


def linkify_footnotes(markup: str, count: int) -> str:
    """Turn every <sup>N</sup> marker into a link to its endnote.

    Without this the markers render as bare numerals — visible, meaningless,
    and pointing at nothing.
    """
    def repl(m):
        nums = re.findall(r"\d+", m.group(1))
        if not nums:
            return m.group(0)
        out = [f'<a class="fn" href="#en{n}">{n}</a>' if 1 <= int(n) <= count
               else n for n in nums]
        return "<sup>" + "&thinsp;".join(out) + "</sup>"
    return re.sub(r"<sup>(.*?)</sup>", repl, markup, flags=re.S)


page = f"""
<section class="page">
  <div class="eyebrow"{L.attr("hero.eyebrow")}>{C.t("hero.eyebrow")}</div>
  {L.spacer("hero.h1")}<h1{L.attr("hero.h1")}>{C.t("hero.h1")}</h1>
  {C.html("hero.standfirst", "standfirst")}

  <div class="stats"{L.attr("stats.strip")}>
    {stat("a")}{stat("b")}{stat("c")}{stat("d", " stat-fed")}
  </div>

  <h2{L.attr("timeline.title")}>{C.t("timeline.title")}</h2>
  {graphic(L, "chart.timeline", payment_timeline(), w=7.5)}

  <h2{L.attr("funding.title")}>{C.t("funding.title")}</h2>
  {graphic(L, "chart.funding", funding_split(), w=7.5)}
  {C.html("funding.note", "note")}

  <h2{L.attr("medicaid.title")}>{C.t("medicaid.title")}</h2>
  {graphic(L, "chart.medicaid", medicaid_split(), w=7.5)}

  <div class="cols">
    <div class="col">
      <h3 class="h-warn"{L.attr("risk.h")}>{C.t("risk.h")}</h3>
      <ul{C.ul_attr("risk.points")}>{bullets("risk.points")}</ul>
    </div>
    <div class="col">
      <h3 class="h-fed"{L.attr("ask.h")}>{C.t("ask.h")}</h3>
      <ul{C.ul_attr("ask.points")}>{bullets("ask.points")}</ul>
    </div>
  </div>

  {C.html("footer.note", "foot")}

  <div class="endnotes"><span class="srch"{L.attr("endnotes.h2")}>{C.t("endnotes.h2")}</span>{ENDNOTES_SLOT}</div>
{C.extras("page1")} {L.layer(1)}{L.text_boxes(1)}{L.tables_html(1)}
</section>
"""

body = C.fn.resolve(page)
en = "".join(endnote_link(i + 1, sid, txt, url)
             for i, (sid, txt, url) in enumerate(C.fn.endnotes_with_ids(), 0))
# `en` carries no <sup> markers of its own, so linkifying before the fill is
# safe and keeps the substitution out of the regex's way.
body = linkify_footnotes(body, len(C.fn.endnotes()))
body = body.replace(ENDNOTES_SLOT, en)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{C.text("title")}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Poppins:wght@600;700&display=swap" rel="stylesheet">
<style>
  /* Neither Manrope nor Poppins encodes U+02BB, so every ʻokina would fall
     back to the OS UI font. These one-glyph faces re-encode each family's own
     U+2018 outline at U+02BB; they must come FIRST in a stack. */
{OKINA_FACES}
  body {{ margin:0; background:{CREAM};
         font:14.5px/1.48 OkinaManrope, Manrope, system-ui, sans-serif; color:{INK}; }}
  .page {{ width:8.5in; min-height:11in; margin:24px auto; background:#fff;
           box-shadow:0 4px 18px rgba(0,0,0,.12); padding:0.4in 0.5in;
           box-sizing:border-box; position:relative; overflow:hidden; }}

  .eyebrow {{ font-size:0.88rem; font-weight:700; letter-spacing:.09em;
              color:{DEEP}; margin-bottom:3px; }}
  h1 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
        font-size:1.62rem; line-height:1.06; margin:0 0 5px; color:{INK};
        letter-spacing:-.015em; }}
  .standfirst {{ font-size:0.93rem; line-height:1.36; margin:0 0 5px;
                 color:{SLATE}; max-width:7.4in; }}
  .standfirst strong {{ color:{INK}; }}

  .stats {{ display:flex; gap:7px; margin:0 0 5px; align-items:stretch; }}
  .stat {{ flex:1; background:{CREAM}; border-left:3px solid {TEAL};
           padding:7px 9px; border-radius:0 7px 7px 0; }}
  /* The federal-ceiling card is the page's thesis, and it is a claim about
     federal money — so it carries the same green the charts use for TANF. */
  .stat-fed {{ border-left-color:{FED}; }}
  .stat-fed .stat-n {{ color:{FED}; }}
  .stat-n {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
             font-size:1.2rem; font-weight:700; line-height:1.1; color:{DEEP}; }}
  .stat-l {{ font-size:0.82rem; color:{SLATE}; line-height:1.26; margin-top:1px; }}

  /* Section rhythm. Every h2 opens a section, so each gets a rule above and
     noticeably more air before it than after — otherwise a heading sits as
     close to the chart it follows as to the one it introduces, and the page
     reads as one undifferentiated column. */
  h2 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
        font-size:1.1rem; margin:12px 0 4px; padding-top:8px; color:{INK};
        border-top:1px solid {ASH}; letter-spacing:-.005em; }}
  .note {{ font-size:0.86rem; color:{SLATE}; margin:3px 0 0; }}
  .note strong {{ color:{INK}; }}

  .cols {{ display:flex; gap:14px; margin:12px 0 0; align-items:stretch; }}
  /* Framed rather than bare: two colour-coded headings over loose bullets was
     the page's weakest region, with nothing holding either column together. */
  .col {{ flex:1; background:{CREAM}; border-radius:8px; padding:11px 13px 10px; }}
  h3 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
        font-size:0.95rem; margin:0 0 4px; }}
  .h-warn {{ color:{NONFED}; }}
  .h-fed {{ color:{FED}; }}
  .col ul {{ margin:0; padding-left:1.05em; }}
  .col li {{ font-size:0.845rem; line-height:1.3; margin-bottom:4px;
             color:{SLATE}; }}
  .col li:last-child {{ margin-bottom:0; }}
  .col li strong {{ color:{INK}; }}

  .foot {{ margin:11px 0 0; padding-top:7px; border-top:1px solid {ASH};
           font-size:0.775rem; color:{MUTE}; line-height:1.32; }}
  .foot strong {{ color:{SLATE}; }}

  /* Sources: two columns of small type, so six citations cost a few lines
     rather than an inch. */
  .srch {{ font-size:0.66rem; font-weight:700; letter-spacing:.07em;
           text-transform:uppercase; color:{SLATE}; margin-right:5px; }}
  .endnotes {{ margin:5px 0 0; font-size:0.685rem; line-height:1.3;
               color:{MUTE}; }}
  .en {{ white-space:normal; }}
  .enn {{ font-weight:700; color:{DEEP}; }}
  .ensep {{ color:{ASH}; }}
  .endnotes a {{ color:{MUTE}; text-decoration:none; }}
  .endnotes a:hover {{ text-decoration:underline; }}
  sup a.fn {{ color:{DEEP}; text-decoration:none; font-weight:700; }}
  a {{ color:{DEEP}; }}
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
