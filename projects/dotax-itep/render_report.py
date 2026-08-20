#!/usr/bin/env python3
"""DOTAX vs ITEP on Act 46 / Act 24 — a one-page methods note.

Every visual goes through the engine's hooks so the user can move, resize and
edit it: prose through C.t/C.html (never bare C(), which emits no data-slot),
each chart through graphic() (a bare <svg> is frozen and invisible to the
editor) wrapped in chart_scroll() (an SVG shrinks with the sheet, so without it
a 12px label is 5px on a phone).

WHY THIS PAGE EXISTS
--------------------
DOTAX and ITEP both scored Hawaii's 2024 income tax cut (Act 46) and the 2026
bill that amended it (SB 3125, enacted May 21 2026 as Act 24, SLH 2026 — the
enrolled text is CD2). Their headline numbers look incompatible: -$1.45B/yr
against -$705M/yr. They are not estimates of the same quantity.

    DOTAX  fiscal year · residents AND nonresidents · incomes grown to the year
           · Act 46 measured against the schedule it replaced
    ITEP   tax year 2031 · residents only · incomes held at 2026 levels
           · Act 46 measured against policy already in force in 2026

Aligning DOTAX to ITEP's frame means DIFFERENCING two fiscal-note lines rather
than reading one, and mapping FY to TY. Both are done below.

THE FY <-> TY MAPPING
---------------------
DOTAX publishes fiscal years; ITEP publishes tax year 2031. Hawaii withholding
splits a tax year's liability across two fiscal years, so the mapping is not
exact. This page uses FY = TY+1 (a TY2031 liability lands mostly in FY2032
collections), which is the convention Census-Forecaster already documents. The
alternative FY = TY is carried in ALT_* below and quoted in the footer note —
it moves every figure but changes no conclusion.

REPRODUCING THE NUMBERS
-----------------------
Everything here is arithmetic on two published tables; there is no model run.
The DOTAX figures are read straight off the presentation. The ITEP component
split is DERIVED (see itep_components below) because ITEP published quintile
rows, not components — the derivation reproduces ITEP's own printed shares to
0.1pp and its printed totals to <1%, which is the check that it is right.

    verify:  python3 projects/dotax-itep/render_report.py --verify
"""
from pathlib import Path
import os
import re
import sys

HERE = Path(__file__).resolve().parent           # projects/dotax-itep
REPO = HERE.parent.parent                        # repo root, where docsync/ lives
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from docsync.content import Content                            # noqa: E402
from docsync.layout import Layout                              # noqa: E402
from docsync.blocks import graphic, pdf_button                 # noqa: E402
from docsync.blocks import chart_scroll, chart_scroll_css      # noqa: E402
from docsync.okina import OKINA_FACES                          # noqa: E402

_LAYOUT = Path(os.environ.get("DOCSYNC_LAYOUT") or (HERE / "layout.json"))
_CONTENT = Path(os.environ.get("DOCSYNC_CONTENT") or (HERE / "content.md"))
_OUT = Path(os.environ.get("DOCSYNC_OUT") or (HERE / "index.html"))
EDIT = bool(os.environ.get("DOCSYNC_EDIT"))

L = Layout(_LAYOUT, page=(8.5, 11))
C = Content(_CONTENT, styles=L)

# --- Hawaiʻi Appleseed brand -------------------------------------------------
INK = "#2F3E46"       # charcoal
SLATE = "#354F52"
DEEP = "#52796F"      # house teal — links, and the two DERIVED stat cards
ASH = "#CAD2C5"       # rules and the zero line ONLY; never a data fill
CREAM = "#F4F7F4"
MUTE = "#7C8A80"

# --- The one categorical encoding on this page: whose estimate is it ---------
# Two series, and they must stay separable for every reader. Validated with the
# dataviz skill's validator against the sheet (light, #fff): all five checks
# PASS — worst adjacent pair dE 19.6 protan / 28.9 tritan, normal-vision 26.6,
# both >= 3:1 on the sheet. Do not substitute the brand greens here: they sit
# below the chroma floor and read gray as data marks.
DOTAX = "#3D5A98"     # blue
ITEP = "#C4602F"      # orange
# A lighter step of the DOTAX hue, for the part of Act 46 already in force by
# 2026. This is a WITHIN-series partition (both halves are DOTAX's number), so
# it is an intensity step, not a third category. Passes the lightness band at
# L 0.72; its sub-3:1 contrast against white is relieved the way the validator
# requires — a direct label inside the segment.
DOTAX_PALE = "#8AA2CC"

# =============================================================================
# DOTAX — read directly off the TRC presentation, May 26 2026
# =============================================================================
# General Fund revenue gain/(loss) from Act 46, SLH 2024, $M by FISCAL year.
# Slide 2 carries FY2025-FY2031; slide 14 repeats it and adds FY2032.
DOTAX_ACT46_FY = {
    2025: -240.3, 2026: -596.6, 2027: -740.1, 2028: -922.7,
    2029: -1052.6, 2030: -1262.3, 2031: -1347.5, 2032: -1453.2,
}

# Act 24 (SB 3125) bracket/rate changes, $M by FISCAL year (slide 14).
# The two components sum to the net, which is the check that they are a
# complete decomposition and not two of three.
DOTAX_B23_FY = {2028: -19.6, 2029: -19.7, 2030: -14.9, 2031: -14.5, 2032: -13.1}
DOTAX_TOP_FY = {2028: 106.3, 2029: 110.4, 2030: 114.3, 2031: 118.2, 2032: 122.2}
DOTAX_NET_FY = {2028: 86.7, 2029: 90.7, 2030: 99.4, 2031: 103.7, 2032: 109.2}

# Act 24's FULL revenue impact, $M by FISCAL year (slide 15) — the bill's real
# headline, and NOT the rate/bracket line above. Most of Act 24's money comes
# from sunsetting TAX CREDITS (the renewable-energy credit, capital goods,
# high-tech investment, research), and ITEP's income-tax microsimulation does
# not model business credits at all. So there is no ITEP number to put beside
# this, and any "DOTAX says X for Act 24, ITEP says Y" comparison has to be
# about the rate/bracket slice or it is comparing two different bills.
DOTAX_ACT24_ALL_FY = {2027: 72.4, 2028: 163.5, 2029: 222.7,
                      2030: 233.5, 2031: 284.7, 2032: 297.3}

# The RETITC phaseout/sunset line, kept ONLY as an alignment check on the two
# rows above — a fiscal-year table read one column out is a silent disaster.
# Rate changes do not start until FY2028, so FY2027's total must be RETITC
# alone, and FY2028's total minus rates must equal RETITC's FY2028 value. Both
# hold, which is what confirms the columns were read correctly. _verify() asserts it.
DOTAX_RETITC_FY = {2027: 72.4, 2028: 76.8, 2029: 81.4,
                   2030: 86.1, 2031: 131.1, 2032: 136.3}

# Resident returns by top marginal bracket under the Act 24 2029-and-after
# schedule (slide 13). Only brackets 2 and 3 matter here.
DOTAX_RETURNS_B2 = 36_135
DOTAX_RETURNS_B3 = 88_194

# TY2026 synthetic after-credit liability, residents vs nonresidents (slide 5).
# Used only to size the residents-only adjustment quoted in the footer note.
DOTAX_LIAB_RESIDENT = 2_238_607_826
DOTAX_LIAB_TOTAL = 2_443_033_402

# =============================================================================
# ITEP — "2031 Full Implementation" tab, all state residents at 2026 incomes
# =============================================================================
# The three panels ITEP prints, $M. They are internally consistent:
# -705 + 83 = -622, which _verify() asserts.
ITEP_ACT46_VS_2026 = -705.0   # "Do Nothing": Act 46 at full implementation vs 2026
ITEP_SB3125_VS_ACT46 = 83.0   # SB 3125 full implementation vs Act 46
ITEP_CLAWBACK = -622.0        # SB 3125 vs freezing cuts at TY2026 (Gov's proposal)

# ITEP's universe, implied by its own printed averages: -$705M / -$920 average
# and $83M / $108 average both land on ~767,000. That is resident TAX UNITS,
# ~19% more than DOTAX's 644,631 resident RETURNS, because ITEP models
# non-filers too. It is a wedge worth knowing, not an error in either source.
ITEP_UNITS = 767_000

# ITEP quintile rows for the SB 3125-vs-Act 46 panel: (share of all units,
# % with a change, average change for those with one). Decrease side, then
# increase side. Transcribed from the CSV.
ITEP_DECREASE_ROWS = [
    (0.20, 0.000, 0), (0.20, 0.356, -55), (0.20, 0.686, -84),
    (0.20, 0.790, -127), (0.15, 0.820, -163), (0.04, 0.668, -169),
    (0.01, 0.123, -158),
]
ITEP_INCREASE_ROWS = [
    (0.15, 0.025, 262), (0.04, 0.297, 1383), (0.01, 0.848, 17912),
]


def itep_components() -> tuple[float, float]:
    """ITEP's SB 3125 package split into its cut half and its raise half, $M.

    ITEP published quintile rows, not components — so this is DERIVED, and the
    derivation has to earn trust before the chart can use it. It does, twice
    over: the per-quintile products reproduce ITEP's own printed "share of
    resident tax decrease/increase" percentages to 0.1pp, and they sum to
    +$83.6M against ITEP's printed +$83M. _verify() asserts both.

    The split is meaningful because in 2031 SB 3125 changes exactly three
    things against Act 46, and they sort cleanly by sign: brackets 2 and 3 are
    cut to 2.5%/5% (the only tax DECREASE in the bill), while the repeal of the
    upper-bracket expansions and the new 13% bracket are both INCREASES. So the
    decrease side is the middle-bracket rate cut and nothing else — which is
    what makes it directly comparable to DOTAX's own -$13.1M line.
    """
    dec = sum(ITEP_UNITS * s * p * a for s, p, a in ITEP_DECREASE_ROWS) / 1e6
    inc = sum(ITEP_UNITS * s * p * a for s, p, a in ITEP_INCREASE_ROWS) / 1e6
    return dec, inc


ITEP_B23, ITEP_TOP = itep_components()

# =============================================================================
# The three aligned frames
# =============================================================================
# FY = TY+1: TY2026 liability is FY2027 collections, TY2031 is FY2032.
_TY2026_FY, _TY2031_FY = 2027, 2032
_ALT_TY2026_FY, _ALT_TY2031_FY = 2026, 2031          # the FY = TY alternative

# Frame 1 — Act 46's REMAINING phase-in: what 2031 law costs relative to the
# policy already in force in 2026. This is ITEP's "Do Nothing" panel, and
# reaching it from DOTAX means subtracting, not reading.
DOTAX_ACT46_REMAINING = DOTAX_ACT46_FY[_TY2031_FY] - DOTAX_ACT46_FY[_TY2026_FY]
ALT_ACT46_REMAINING = DOTAX_ACT46_FY[_ALT_TY2031_FY] - DOTAX_ACT46_FY[_ALT_TY2026_FY]

# Frame 2 — Act 24 against Act 46, both at 2031.
DOTAX_ACT24 = DOTAX_NET_FY[_TY2031_FY]
ALT_ACT24 = DOTAX_NET_FY[_ALT_TY2031_FY]

# Frame 3 — the "clawback": Act 24 against freezing the cuts at TY2026 levels.
DOTAX_CLAWBACK = DOTAX_ACT46_REMAINING + DOTAX_ACT24
ALT_CLAWBACK = ALT_ACT46_REMAINING + ALT_ACT24

# Act 24's whole revenue effect, and the slice of it ITEP's model reaches.
DOTAX_ACT24_ALL = DOTAX_ACT24_ALL_FY[_TY2031_FY]          # +297.3
DOTAX_ACT24_CREDITS = DOTAX_ACT24_ALL - DOTAX_ACT24       # +188.1, credit sunsets

# What each headline actually contains, and how much of it the other source can
# see. Both bills fail the naive comparison for the SAME reason — the headline
# bundles something ITEP's number does not cover — but for two different
# reasons, which is why each row carries its own.
#   (title, total, slice both measure, label for that slice, label for the rest)
SCOPE_ROWS = [
    ("Act 46, fully phased in", abs(DOTAX_ACT46_FY[_TY2031_FY]),
     abs(DOTAX_ACT46_REMAINING), "still to come after 2026",
     "already in force by 2026",
     "ITEP measures 2031 law against 2026 policy, so the left half is inside "
     "its baseline, not its answer."),
    ("Act 24, fully phased in", DOTAX_ACT24_ALL,
     DOTAX_ACT24, "rate and bracket changes",
     "tax-credit sunsets",
     "ITEP models the personal income tax. The credit sunsets — renewable "
     "energy, capital goods, high tech — are simply not in its model."),
]

# The one place the two models genuinely disagree, and the mechanism behind it.
# Both rows are DOTAX expressed as a share of ITEP, so they share a 0–100%
# scale even though one is dollars and the other is filers. That is the whole
# argument: the two shortfalls are the same size.
RATIO_ROWS = [
    ("What the bracket 2 &amp; 3 cut costs",
     abs(DOTAX_B23_FY[_TY2031_FY]), abs(ITEP_B23), "$", "M"),
    ("Filers who benefit from it",
     float(DOTAX_RETURNS_B2 + DOTAX_RETURNS_B3), ITEP_UNITS * 0.511, "", ""),
]


def money(v: float, dp: int = 0) -> str:
    """A signed $M figure with a real minus sign, never a hyphen."""
    return f"{'−' if v < 0 else '+'}${abs(v):,.{dp}f}M"


def gap_note(a: float, b: float) -> str:
    """How far apart two estimates are, phrased the way the size deserves.

    A ratio is the honest form when one is a multiple of the other, and a
    percentage when they are close; "3.5x apart" and "1% apart" say very
    different things and the reader should not have to compute which applies.
    """
    lo, hi = min(abs(a), abs(b)), max(abs(a), abs(b))
    if lo <= 0:
        return ""
    if hi / lo >= 1.9:
        return f"{hi / lo:.1f}× apart"
    return f"{100 * (hi - lo) / lo:.0f}% apart"


# =============================================================================
# Chart geometry — read this before changing any viewBox width
# =============================================================================
# THE THREE-UNITS TRAP. A chart label's size on screen is NOT the number in the
# SVG. Every chart here is drawn in its own user units and rendered at CHART_W_IN
# inches, so:
#
#     px on screen = user units x (CHART_W_IN x 96) / viewBox width
#
# At a 820-unit viewBox and 7.4in, an 11.5-unit label rendered at 9.96px —
# under the 10.5px floor docsync enforces for chart labels, and invisible to
# docsync.check, which reads AUTHORED sizes out of the markup and so never sees
# the conversion. The viewBox is therefore sized so the smallest label clears
# the floor with margin: 11.5 x 710.4/750 = 10.9px.
#
# If you widen the viewBox, re-run the arithmetic. VB_W is the only knob.
CHART_W_IN = 7.4
VB_W = 750
SMALLEST_LABEL = 11.5          # smallest font-size any chart uses, in user units
_PX_PER_UNIT = (CHART_W_IN * 96) / VB_W


def _label_px(units: float) -> float:
    return units * _PX_PER_UNIT


# =============================================================================
# Chart 1 — what each headline actually contains
# =============================================================================

def scope_chart() -> str:
    """Both headlines, split into the part ITEP can see and the part it can't.

    This replaces a pair of grouped bar charts that put DOTAX and ITEP side by
    side on one signed axis. Those were wrong in a way worth recording: the
    frames ran -713, +109, -604, so a shared scale rendered the middle pair as
    two stubs while the outer pairs dominated, and the reader's eye was drawn
    to whichever comparison happened to be biggest rather than to the finding.
    Worse, the chart whose heading was "the disagreement is confined to a
    single line" gave its longest bars to the line where the two AGREE.

    Two 100% stacked bars instead, because the question here is not "how many
    dollars" but "what fraction of this headline is even comparable" — and a
    proportion is what a 100% bar is for. Each row is normalised to its own
    total, which is legitimate precisely because the comparison being invited
    is between the two SHARES, not between the two bills' sizes; the absolute
    total sits at the right of each row so the magnitudes are not lost.
    """
    W = VB_W
    TOP, HDR, BH, GAP = 12, 16, 32, 8
    LEG = 13
    H = TOP + len(SCOPE_ROWS) * (HDR + BH + GAP) + 22

    p = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'role="img" aria-label="Each bill\'s full 2031 revenue effect split '
         f'into the share ITEP\'s analysis covers and the share it does not">']

    # Legend: the fill IS the argument here, so it is named before anything else.
    p.append(f'<rect x="0" y="2" width="11" height="11" rx="2.5" fill="{DOTAX}"/>')
    p.append(f'<text x="17" y="11.5" font-size="12.5" fill="{SLATE}">'
             f'both sources measure this</text>')
    p.append(f'<rect x="196" y="2" width="11" height="11" rx="2.5" fill="{DOTAX_PALE}"/>')
    p.append(f'<text x="213" y="11.5" font-size="12.5" fill="{SLATE}">'
             f'only DOTAX does</text>')
    p.append(f'<text x="{W}" y="11.5" font-size="11.5" fill="{MUTE}" '
             f'text-anchor="end">DOTAX, $M a year at 2031</text>')

    y = TOP + LEG
    for title, total, seen, seen_lab, rest_lab, _why in SCOPE_ROWS:
        rest = total - seen
        p.append(f'<text x="0" y="{y + 12}" font-size="12.5" font-weight="700" '
                 f'fill="{INK}">{title}</text>')
        p.append(f'<text x="{W}" y="{y + 12}" font-size="12.5" font-weight="700" '
                 f'fill="{MUTE}" text-anchor="end">${total:,.1f}M total</text>')
        y += HDR

        rw = W * rest / total
        r = 5
        # Not-comparable on the left in the pale step, comparable on the right in
        # full colour, the same way round in both rows — the reader should be
        # able to compare the two solid segments by eye without re-reading a key.
        p.append(f'<path d="M {r} {y} H {rw - 2} V {y + BH} H {r} '
                 f'a{r} {r} 0 0 1 -{r} -{r} V {y + r} a{r} {r} 0 0 1 {r} -{r} Z" '
                 f'fill="{DOTAX_PALE}"/>')
        p.append(f'<path d="M {rw} {y} H {W - r} a{r} {r} 0 0 1 {r} {r} '
                 f'V {y + BH - r} a{r} {r} 0 0 1 -{r} {r} H {rw} Z" '
                 f'fill="{DOTAX}"/>')

        p.append(f'<text x="12" y="{y + 15}" font-size="12.5" font-weight="700" '
                 f'fill="{INK}">${rest:,.1f}M</text>')
        p.append(f'<text x="12" y="{y + 29}" font-size="12" fill="{SLATE}">'
                 f'{rest_lab}</text>')
        p.append(f'<text x="{rw + 12}" y="{y + 15}" font-size="12.5" '
                 f'font-weight="700" fill="#fff">${seen:,.1f}M</text>')
        p.append(f'<text x="{rw + 12}" y="{y + 29}" font-size="12" fill="#fff" '
                 f'opacity="0.92">{seen_lab}</text>')
        y += BH + GAP

    p.append(f'<text x="0" y="{H - 6}" font-size="11.5" fill="{MUTE}">'
             f'Each bar is one bill\'s full effect, scaled to its own total.'
             f'</text>')
    p.append("</svg>")
    return "".join(p)


# =============================================================================
# The aligned comparison — a table, because three number pairs is not a chart
# =============================================================================

def comparison_table() -> str:
    """The three like-for-like comparisons, as exact numbers.

    Deliberately NOT a chart. The message is "these two estimates are within a
    few percent of each other", and asking a reader to detect the ABSENCE of a
    difference between pairs of near-identical bars is the weakest thing a bar
    chart can be asked to do — the earlier version spent 1.3 vertical inches
    doing it. Four columns and three rows say it exactly, in less space, and
    the outlier row can simply be marked.

    The figures are computed from the DATA constants rather than authored as
    slots: they must move when the constants move, and a hand-editable cell
    that silently disagrees with the charts is the failure mode this whole
    page is about.
    """
    rows = [
        ("Act 46 still to come, by 2031",
         DOTAX_ACT46_REMAINING, ITEP_ACT46_VS_2026, False),
        ("Act 24&#8217;s rate and bracket changes",
         DOTAX_ACT24, ITEP_SB3125_VS_ACT46, True),
        ("Both together, against a 2026 freeze",
         DOTAX_CLAWBACK, ITEP_CLAWBACK, False),
    ]
    out = [f'<table class="cmp"{L.attr("table.frames")}>',
           '<thead><tr><th>Measured the same way, at 2031</th>'
           '<th class="n">DOTAX</th><th class="n">ITEP</th>'
           '<th class="n">Gap</th></tr></thead><tbody>']
    for label, d, i, flag in rows:
        cls = ' class="flag"' if flag else ''
        out.append(f'<tr{cls}><td>{label}</td>'
                   f'<td class="n d">{money(d)}</td>'
                   f'<td class="n i">{money(i)}</td>'
                   f'<td class="n g">{gap_note(d, i)}</td></tr>')
    out.append('</tbody></table>')
    return "".join(out)


# =============================================================================
# Chart 2 — the one real disagreement, and the mechanism behind it
# =============================================================================

def ratio_chart() -> str:
    """DOTAX as a share of ITEP, on two measures that should not match — and do.

    The strongest evidence on this page, and the old charts buried it. Dollars
    and filer counts cannot share an axis, but the RATIO of each to ITEP can,
    and the ratios are the finding: DOTAX prices the cut at 28% of ITEP's
    figure and reaches 32% as many filers. One number explains the other, which
    is what a marginal-bracket-only count would produce and what a
    pass-through count would not.
    """
    W = VB_W
    TOP, HDR, BH, SUB, GAP = 20, 15, 14, 14, 9
    TRACK = 560                       # 100% mark; the rest holds the ITEP label
    H = TOP + len(RATIO_ROWS) * (HDR + BH + SUB + GAP) + 12

    p = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'role="img" aria-label="DOTAX as a share of ITEP on two measures: '
         f'28 percent of the cost and 32 percent of the filers">']

    p.append(f'<text x="0" y="11.5" font-size="12.5" font-weight="700" '
             f'fill="{INK}">DOTAX as a share of ITEP</text>')
    p.append(f'<text x="{W}" y="11.5" font-size="11.5" fill="{MUTE}" '
             f'text-anchor="end">the two shortfalls are the same size</text>')

    y = TOP
    for title, dv, iv, pre, suf in RATIO_ROWS:
        share = dv / iv
        p.append(f'<text x="0" y="{y + 11}" font-size="12.5" font-weight="700" '
                 f'fill="{INK}">{title}</text>')
        y += HDR

        # The 100% track is ITEP's figure — drawn first, so the bar sits in it.
        p.append(f'<rect x="0" y="{y}" width="{TRACK}" height="{BH}" rx="4" '
                 f'fill="{ITEP}" opacity="0.16"/>')
        bw = TRACK * share
        p.append(f'<rect x="0" y="{y}" width="{bw}" height="{BH}" rx="4" '
                 f'fill="{DOTAX}"/>')
        p.append(f'<text x="{TRACK + 10}" y="{y + 12}" font-size="12.5" '
                 f'font-weight="700" fill="{ITEP}">= ITEP</text>')
        p.append(f'<text x="{bw + 10}" y="{y + 12}" font-size="12.5" '
                 f'font-weight="700" fill="{DOTAX}">{share * 100:.0f}%</text>')
        y += BH

        fmt = (lambda v: f"{pre}{v:,.1f}{suf}") if suf else (lambda v: f"{v:,.0f}")
        p.append(f'<text x="0" y="{y + 13}" font-size="12" fill="{SLATE}">'
                 f'DOTAX {fmt(dv)} against ITEP {fmt(iv)}</text>')
        y += SUB + GAP

    p.append("</svg>")
    return "".join(p)


# =============================================================================
# Page
# =============================================================================
# Cards a and b carry the two SOURCES' headline numbers, so they wear those
# sources' colours. Cards c and d are findings of this note, not of either
# source, so they wear the house teal — the distinction is the encoding.
def stat(key: str, cls: str = "") -> str:
    return (f'<div class="stat{cls}"{L.attr(f"stat.{key}")}>'
            f'<div class="stat-n">{C.t(f"stat.{key}.n")}</div>'
            f'<div class="stat-l">{C.t(f"stat.{key}.l")}</div></div>')


def bullets(key: str) -> str:
    return "".join(f"<li>{b}</li>" for b in C.list(key))


ENDNOTES_SLOT = "<!--ds-endnotes-->"


def endnote_link(n: int, sid: str, txt: str, url: str) -> str:
    # Keyed by source id, not by n: the number is whatever the current reading
    # order says, but the identity the editor routes an edit through has to
    # stay put. data-el also makes the entry draggable to reorder.
    sep = "" if n == 1 else '<span class="ensep"> · </span>'
    return (f'{sep}<span id="en{n}" class="en"{L.attr(f"endnote.{sid}")}>'
            f'<span class="enn">{n}</span> <a href="{url}">{txt}</a></span>')


def linkify_footnotes(markup: str, count: int) -> str:
    """Turn every <sup>N</sup> marker into a link to its endnote."""
    def repl(m):
        nums = re.findall(r"\d+", m.group(1))
        if not nums:
            return m.group(0)
        out = [f'<a class="fn" href="#en{n}">{n}</a>' if 1 <= int(n) <= count
               else n for n in nums]
        return "<sup>" + "&thinsp;".join(out) + "</sup>"
    return re.sub(r"<sup>(.*?)</sup>", repl, markup, flags=re.S)


# Every chart is wrapped for the phone case. smallest_label is the smallest
# font-size each SVG actually uses in ITS OWN user units — 11.5 throughout —
# which is what sets the point below which the chart scrolls instead of
# shrinking its type past the legibility floor.
page = f"""
<section class="page">
  <div class="eyebrow"{L.attr("hero.eyebrow")}>{C.t("hero.eyebrow")}</div>
  {L.spacer("hero.h1")}<h1{L.attr("hero.h1")}>{C.t("hero.h1")}</h1>
  {C.html("hero.standfirst", "standfirst")}

  <div class="stats"{L.attr("stats.strip")}>
    {stat("a", " stat-dotax")}{stat("b", " stat-itep")}{stat("c")}{stat("d")}
  </div>

  <h2{L.attr("frame.title")}>{C.t("frame.title")}</h2>
  {graphic(L, "chart.scope",
           chart_scroll(scope_chart(), smallest_label=SMALLEST_LABEL), w=CHART_W_IN)}
  {C.html("frame.note", "note")}

  <h2{L.attr("whole.title")}>{C.t("whole.title")}</h2>
  {comparison_table()}

  <h2{L.attr("parts.title")}>{C.t("parts.title")}</h2>
  {graphic(L, "chart.ratio",
           chart_scroll(ratio_chart(), smallest_label=SMALLEST_LABEL), w=CHART_W_IN)}

  <div class="finding"{L.attr("finding.box")}>
    <h3{L.attr("finding.h")}>{C.t("finding.h")}</h3>
    {C.html("finding.p", "finding-p")}
  </div>

  {C.html("footer.note", "foot")}

  <div class="endnotes"><span class="srch"{L.attr("endnotes.h2")}>{C.t("endnotes.h2")}</span>{ENDNOTES_SLOT}</div>
{C.extras("page1")} {L.layer(1)}{L.text_boxes(1)}{L.tables_html(1)}
</section>
"""

body = C.fn.resolve(page)
en = "".join(endnote_link(i + 1, sid, txt, url)
             for i, (sid, txt, url) in enumerate(C.fn.endnotes_with_ids(), 0))
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
  .standfirst {{ font-size:0.93rem; line-height:1.36; margin:0 0 6px;
                 color:{SLATE}; max-width:7.4in; }}
  .standfirst b {{ color:{INK}; }}

  .stats {{ display:flex; gap:7px; margin:0 0 5px; align-items:stretch; }}
  .stat {{ flex:1; background:{CREAM}; border-left:3px solid {DEEP};
           padding:6px 8px; border-radius:0 7px 7px 0; }}
  /* The two source cards wear their source's colour; the two derived cards
     keep the house teal. */
  .stat-dotax {{ border-left-color:{DOTAX}; }}
  .stat-dotax .stat-n {{ color:{DOTAX}; }}
  .stat-itep {{ border-left-color:{ITEP}; }}
  .stat-itep .stat-n {{ color:{ITEP}; }}
  .stat-n {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
             font-size:1.2rem; font-weight:700; line-height:1.1; color:{DEEP}; }}
  .stat-l {{ font-size:0.82rem; color:{SLATE}; line-height:1.22; margin-top:1px; }}

  /* Section rhythm: every h2 opens a section, so each gets a rule above and
     more air before it than after — otherwise a heading sits as close to the
     chart it follows as to the one it introduces. */
  h2 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
        font-size:1.03rem; margin:5px 0 2px; padding-top:4px; color:{INK};
        border-top:1px solid {ASH}; letter-spacing:-.005em; }}
  .note {{ font-size:0.845rem; color:{SLATE}; margin:4px 0 0; max-width:7.4in;
           line-height:1.32; }}
  .note b {{ color:{INK}; }}

  /* The aligned comparison is a TABLE, not a chart: three number pairs whose
     message is "these agree", which is the one thing paired bars are worst at
     showing. Numbers are computed from the DATA constants, never authored, so
     a cell can never drift out of step with the charts. */
  .cmp {{ width:100%; border-collapse:collapse; margin:5px 0 0;
          font-size:0.845rem; }}
  .cmp th {{ font-size:0.7rem; font-weight:700; letter-spacing:.06em;
             text-transform:uppercase; color:{MUTE}; text-align:left;
             padding:0 8px 3px 0; border-bottom:1px solid {ASH}; }}
  .cmp td {{ padding:5px 8px 5px 0; color:{SLATE};
             border-bottom:1px solid {CREAM}; }}
  .cmp .n {{ text-align:right; padding-right:0; white-space:nowrap; }}
  .cmp .d {{ color:{DOTAX}; font-weight:700; }}
  .cmp .i {{ color:{ITEP}; font-weight:700; }}
  .cmp .g {{ color:{MUTE}; }}
  /* The one row where they part company carries the page's whole question, so
     it is marked rather than left for the reader to spot in a column. */
  .cmp .flag td {{ background:{CREAM}; }}
  .cmp .flag .g {{ color:{ITEP}; font-weight:700; }}

  /* The diagnosis reads as the page's conclusion, so it gets a tinted panel
     rather than body type — and a left rule in the ITEP orange, because the
     disagreement it describes is the one place the two sources part. */
  .finding {{ background:{CREAM}; border-left:3px solid {ITEP};
              border-radius:0 8px 8px 0; padding:8px 12px 9px; margin:9px 0 0; }}
  h3 {{ font-family:OkinaPoppins, Poppins, OkinaManrope, Manrope, sans-serif;
        font-size:0.95rem; margin:0 0 2px; color:{INK}; }}
  .finding-p {{ font-size:0.845rem; line-height:1.32; margin:0; color:{SLATE}; }}
  .finding-p b {{ color:{INK}; }}
  .finding-p i {{ font-style:italic; color:{INK}; }}

  .foot {{ margin:8px 0 0; padding-top:6px; border-top:1px solid {ASH};
           font-size:0.775rem; color:{MUTE}; line-height:1.32; }}
  .foot b {{ color:{SLATE}; }}

  /* Sources: one run of small type, so three citations cost a line rather
     than an inch. */
  .srch {{ font-size:0.66rem; font-weight:700; letter-spacing:.07em;
           text-transform:uppercase; color:{SLATE}; margin-right:5px; }}
  .endnotes {{ margin:5px 0 0; font-size:0.685rem; line-height:1.3;
               color:{MUTE}; }}
  .en {{ white-space:normal; }}
  .enn {{ font-weight:700; color:{DEEP}; }}
  .ensep {{ color:{ASH}; }}
  .endnotes a {{ color:{MUTE}; text-decoration:none; }}
  .endnotes a:hover {{ text-decoration:underline; }}
  /* Superscript markers inherit the UA sheet's `font-size: smaller` (~0.83x),
     so one inside the 0.775rem footer computed to 10.3px — under the 10.5px
     legibility floor, and invisible to docsync.check, which cannot resolve a
     class to a size. Pin it rather than letting the cascade shrink it.
     NB: do not write the tag name literally in this comment. docsync.check
     scans the OUTPUT for sup elements, and a tag name in a CSS comment opens
     a match that swallows the first real marker after it — which silently
     reported the page's first citation as uncited. */
  sup {{ font-size:10.6px; line-height:0; }}
  sup a.fn {{ color:{DEEP}; text-decoration:none; font-weight:700; }}
  a {{ color:{DEEP}; }}
</style>
</head>
<body>
{pdf_button(L, bg=DEEP)}
{chart_scroll_css()}
{body}
</body>
</html>
"""


def _verify() -> int:
    """Assert every derived figure against what the two sources printed.

    This is the check that the page is arithmetic on published tables rather
    than a set of numbers someone typed. Run it after touching any constant.
    """
    ok = True

    def chk(name, got, want, tol):
        nonlocal ok
        good = abs(got - want) <= tol
        ok = ok and good
        print(f"  [{'PASS' if good else 'FAIL'}] {name}: {got:,.2f} vs {want:,.2f}")

    print("DOTAX — components sum to the printed net:")
    for fy in sorted(DOTAX_NET_FY):
        chk(f"FY{fy}", DOTAX_B23_FY[fy] + DOTAX_TOP_FY[fy], DOTAX_NET_FY[fy], 0.11)

    print("ITEP — the three printed panels are internally consistent:")
    chk("do-nothing + SB3125 = clawback",
        ITEP_ACT46_VS_2026 + ITEP_SB3125_VS_ACT46, ITEP_CLAWBACK, 0.01)

    print("ITEP — derived components reproduce the printed total:")
    chk("decrease + increase = net", ITEP_B23 + ITEP_TOP, ITEP_SB3125_VS_ACT46, 1.0)

    print("ITEP — derived quintile shares reproduce the printed shares:")
    dec_tot = sum(ITEP_UNITS * s * p * a for s, p, a in ITEP_DECREASE_ROWS)
    for (s, p_, a), want in zip(ITEP_DECREASE_ROWS,
                                [0.0, 6.6, 19.0, 33.4, 33.2, 7.5, 0.3]):
        chk(f"decrease share {want}%",
            100 * (ITEP_UNITS * s * p_ * a) / dec_tot, want, 0.15)
    inc_tot = sum(ITEP_UNITS * s * p * a for s, p, a in ITEP_INCREASE_ROWS)
    for (s, p_, a), want in zip(ITEP_INCREASE_ROWS, [0.6, 9.7, 89.7]):
        chk(f"increase share {want}%",
            100 * (ITEP_UNITS * s * p_ * a) / inc_tot, want, 0.15)

    print("DOTAX Act 24 — the credit half ITEP does not model:")
    # A fiscal-year table read one column out is a silent disaster, so the two
    # rows are cross-checked against a third: rate changes do not start until
    # FY2028, so FY2027's total must be the RETITC line alone, and FY2028's
    # total minus rates must equal RETITC's own FY2028 figure.
    chk("FY2027 total == RETITC alone",
        DOTAX_ACT24_ALL_FY[2027], DOTAX_RETITC_FY[2027], 0.05)
    chk("FY2028 total - rates == RETITC",
        DOTAX_ACT24_ALL_FY[2028] - DOTAX_NET_FY[2028], DOTAX_RETITC_FY[2028], 0.05)
    chk("credit half at TY2031 ($M)", DOTAX_ACT24_CREDITS, 188.1, 0.05)
    chk("rate share of Act 24 (%)",
        100 * DOTAX_ACT24 / DOTAX_ACT24_ALL, 36.7, 0.1)

    print("The diagnosis in the right-hand column:")
    returns = DOTAX_RETURNS_B2 + DOTAX_RETURNS_B3
    chk("brackets 2+3 returns", returns, 124_329, 0)
    chk("implied average benefit ($)",
        abs(DOTAX_B23_FY[_TY2031_FY]) * 1e6 / returns, 105, 2)
    chk("ITEP beneficiaries (000s)", ITEP_UNITS * 0.511 / 1000, 392, 1)

    print(f"\n{'ALL CHECKS PASS' if ok else 'FAILED'}")
    return 0 if ok else 1


if __name__ == "__main__" and "--verify" in sys.argv:
    sys.exit(_verify())

_OUT.write_text(html)
print(f"wrote {_OUT} ({len(html):,} bytes)")
