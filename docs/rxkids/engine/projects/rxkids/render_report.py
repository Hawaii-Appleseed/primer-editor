#!/usr/bin/env python3
"""RxKids renderer.

original.html stays the untouched reference copy of the page as pulled from
the Hawaii Appleseed website repo. This renderer no longer echoes its <body>
verbatim (STAGE ONE did, see git history) — every section below is rebuilt
from docsync slots, keeping the original CSS classes/JS so it renders
identically, but with text (C.t/C.html/C.list), images (img_el) and section
containers (L.attr/L.spacer) wired for the draft editor.

Two edit-mode-only overrides, both needed for the page to be usable INSIDE the
editor's iframe rather than just on the live site:
  - the original page gates each section behind a scroll-triggered
    IntersectionObserver ('.tfc-reveal' -> opacity:0 until it fires); that
    observer doesn't reliably fire inside the editor's iframe (see the
    report-editor skill's noted interop quirk), which left everything below
    the hero invisible, not just un-editable. DOCSYNC_EDIT forces reveal
    classes visible immediately.
  - the hero's auto-cycling JS overwrites <img id="hero-image">'s src with one
    of three hardcoded URLs every few seconds, which would silently undo a
    user's "replace image" edit a few seconds after they made it. Disabled
    under DOCSYNC_EDIT; unchanged on the published page.
"""
from pathlib import Path
import base64
import html as _html
import os
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
EDIT = bool(os.environ.get("DOCSYNC_EDIT"))

L = Layout(_LAYOUT, page=(12.5, 160))   # ~1200px wide (matches the editor's own
                                        # canvas width) x tall enough for the
                                        # page's true natural height — text-heavy
                                        # sections (TANF especially) wrap taller
                                        # in this fixed 12.5in column than they
                                        # did in Squarespace's wider live layout,
                                        # so this is much taller than Stage One's
                                        # original ~76in guess. Measured via the
                                        # editor's own "N in past the cut"
                                        # warning, not a DOM scrollHeight guess
                                        # (that undercounts — see git history).
C = Content(_CONTENT, styles=L)


def esc(s: str) -> str:
    return _html.escape(s, quote=True)


def data_uri(path: Path) -> str:
    """Inlines a local image as base64 — rxkids has no asset-copy step (unlike
    report2027's Makefile, which mirrors report2027/web/assets into
    docs/primer/assets), and the live editor's preview + the published page
    resolve relative image paths against two DIFFERENT directories. A data URI
    sidesteps that entirely: it works identically in both places with nothing
    to keep in sync."""
    mime = "image/png" if path.suffix == ".png" else "image/svg+xml"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def img_el(el_id, cls, src, alt):
    """One image element, honouring replace/radius/filter/crop overrides —
    copied from report2027's render_report.py per the report-editor skill
    (this helper is project-local, not a shared docsync.blocks export)."""
    src = L.img_src(el_id, src)
    css = L.img_css(el_id)
    crop = L.cropped(el_id)
    head = f'<img class="{cls}"' if cls else "<img"
    if not crop:
        return f'{head}{L.attr(el_id, css)} src="{src}" alt="{alt}">'
    inner = (f'<img src="{src}" alt="{alt}" style="position:absolute;'
             f'left:-{crop["dx"]}in;top:-{crop["dy"]}in;width:{crop["imgW"]}in;'
             f'max-width:none">')
    wcls = f"ds-cropw {cls}".strip()
    return f'<span class="{wcls}"{L.attr(el_id, css)}>{inner}</span>'


SRC = (HERE / "original.html").read_text()
STYLE = SRC.split("<style>", 1)[1].split("</style>", 1)[0]
SCRIPT = SRC.split("<script>", 1)[1].split("</script>", 1)[0]

# The hero's auto-cycling JS (setInterval over three hardcoded URLs) would
# silently overwrite a user's "replace image" edit a few seconds later — cut
# it only in edit mode, leaving the published page's behaviour untouched.
if EDIT:
    SCRIPT = SCRIPT.split("// Hero image cycling", 1)[0] + "});"

# moveCarousel()'s bar-fill animation hardcodes these two percentages; keep it
# in sync with content.md instead of maintaining the same number in two places.
SCRIPT = (SCRIPT
          .replace("'49.0%'", f'\'{C.text("carousel.childcare.bar.single.value")}\'')
          .replace("'17.9%'", f'\'{C.text("carousel.childcare.bar.married.value")}\''))

EDIT_OVERRIDES = """
  /* DOCSYNC_EDIT only: the scroll-reveal IntersectionObserver above doesn't
     reliably fire inside the editor's iframe, which otherwise leaves every
     section but the hero at opacity:0 — invisible, not just un-editable. */
  .tfc-reveal { opacity: 1 !important; transform: none !important; }
""" if EDIT else ""


# ---- site header (logo) ------------------------------------------------------
def site_header() -> str:
    logo_src = data_uri(HERE / "assets" / "rxkeiki-logo.png")
    return f"""
<div class="rxkeiki-header">
    {img_el("header.logo", "rxkeiki-logo", logo_src, esc(C.text("header.logo.alt")))}
</div>"""


# ---- hero -------------------------------------------------------------------
def hero() -> str:
    return f"""
{L.spacer("hero.title")}
<div class="tfc-hero tfc-reveal">
    <div class="tfc-hero-content">
        <h1 class="tfc-hero-title"{L.attr("hero.title")}>{C.t("hero.title")}</h1>
        <h2 class="tfc-hero-title tfc-hawaii-title"{L.attr("hero.hawaii", "margin-top:0px;margin-left:80px;margin-right:20px")}>{C.t("hero.hawaii")}</h2>
        <div class="tfc-hero-badge"{L.attr("hero.badge")}>{C.t("hero.badge")}</div>
    </div>
    <div class="tfc-hero-image-container">
        {img_el("hero.image", "tfc-hero-image", "https://images.squarespace-cdn.com/content/63c215f8a268791349c9f04a/1673931525935-N3GTMH2YO0HVT68BZOA0/unsplash-image-5zp0jym2w9M.jpg?content-type=image%2Fjpeg", esc(C.text("hero.image.alt")))}
    </div>
</div>"""


# ---- what is rxkids ----------------------------------------------------------
def what_is_rxkids() -> str:
    return f"""
<div class="tfc-full-width tfc-bg-white tfc-reveal">
    <div class="tfc-content-container">
        <div class="tfc-section" style="margin-bottom: 0;">
            <h2 class="tfc-section-title">What is RxKids?</h2>
            {L.spacer("para.what.body")}
            <p class="tfc-section-subtitle tfc-subtitle-box"{L.attr("what.body")}><span class="tfc-subtitle-eyebrow"{L.attr("what.eyebrow")}>{C.t("what.eyebrow")}</span>{C("what.body")}</p>

            <div class="tfc-scene-container">
                {img_el("what.heart.image", "tfc-floating-heart", "https://images.squarespace-cdn.com/content/63c215f8a268791349c9f04a/7e595665-8ca3-4621-b694-a787aa3f3965/floating+heart.png?content-type=image%2Fpng", esc(C.text("what.heart.alt")))}
                {img_el("what.childcare.image", "tfc-childcare-image", "https://images.squarespace-cdn.com/content/63c215f8a268791349c9f04a/a493efe8-48df-4068-a64d-a1a8cf2f39a3/Childcare+center.png?content-type=image%2Fpng", esc(C.text("what.childcare.alt")))}
                {scene_tag("right", "what.scene.right")}
                {scene_tag("left", "what.scene.left")}
                {scene_tag("bottom", "what.scene.bottom")}
            </div>

            <div class="tfc-cards-grid"></div>
        </div>
    </div>
</div>"""


def scene_tag(side: str, key: str) -> str:
    return f"""{L.spacer(key)}<div class="tfc-scene-tag tfc-scene-tag-{side}"{L.attr(key)}>
        <h3 class="tfc-scene-title">{C.t(f"{key}.title")}</h3><p>{C.t(f"{key}.body")}</p>
    </div>"""


# ---- benefits widget (6 tabs) -------------------------------------------------
BENEFIT_KEYS = ["health", "development", "housing", "food", "economic", "bonding"]


def benefits_widget() -> str:
    tabs = "\n".join(
        f'<button class="tfc-benefit-tab{" active" if i == 0 else ""}" '
        f'onclick="openBenefit(event, \'benefit-{k}\')">{C.t(f"benefits.{k}.title")}</button>'
        for i, k in enumerate(BENEFIT_KEYS))
    panels = "\n".join(benefit_panel(k, i == 0) for i, k in enumerate(BENEFIT_KEYS))
    return f"""
<div class="tfc-full-width tfc-bg-blue tfc-reveal">
    <div class="tfc-content-container">
        <div class="tfc-section tfc-benefits-widget-section" style="margin: 0 auto;">
            <h2 class="tfc-section-title">Benefits of RxKids</h2>

            <div class="tfc-benefits-layout">
            <div class="tfc-benefits-tabs">
                {tabs}
            </div>

            <div class="tfc-benefits-display">
                {panels}
            </div>
            </div>

            {flint_expandable()}
        </div>
    </div>
</div>"""


def benefit_panel(key: str, active: bool) -> str:
    bullets_key = f"benefits.{key}.bullets"
    items = "".join(f"<li>{b}</li>" for b in C.list(bullets_key))
    style = ' style="display: flex;"' if active else ""
    return f"""<div id="benefit-{key}" class="tfc-benefit-content{' active' if active else ''}"{style}>
        {L.spacer(f"benefits.{key}.title")}
        <div class="tfc-benefit-text-box"{L.attr(f"benefits.{key}.title")}>
            <h3>{C.t(f"benefits.{key}.title")}</h3>
            <ul class="tfc-benefit-list"{C.ul_attr(bullets_key)}>{items}</ul>
        </div>
    </div>"""


def flint_expandable() -> str:
    stats = ["rent", "eviction", "food", "backrent", "depression", "worrying"]
    icons = {
        "rent": '<path d="M2 11 9 5l7 6"/><path d="M4 10v9h10v-9"/><path d="M19.5 9v8.5"/><path d="m16.5 14.5 3 3 3-3"/>',
        "eviction": '<path d="M12 21.5s7.5-3.7 7.5-9.5V5.5L12 2.7 4.5 5.5V12c0 5.8 7.5 9.5 7.5 9.5Z"/><path d="M8 12.4 12 8.6l4 3.8"/><path d="M9.3 11.4v5.1h5.4v-5.1"/>',
        "food": '<path d="M6 2.5V7"/><path d="M9 2.5V7"/><path d="M6 7c0 1.6 1 2.5 2.2 2.6"/><path d="M9 7c0 1.6-1 2.5-2.2 2.6"/><path d="M7.5 9.6V21.5"/><path d="M17 2.5c-1.9.7-3 2.8-3 5.3 0 2 1.2 3.4 3 3.7"/><path d="M17 2.5v19"/>',
        "backrent": '<rect x="2.5" y="6" width="13" height="9" rx="1.5"/><circle cx="9" cy="10.5" r="2"/><path d="M19.5 8v8.5"/><path d="m16.5 13.5 3 3 3-3"/>',
        "depression": '<circle cx="12" cy="9.5" r="6"/><path d="M12 12.6c-2-1.3-3.3-2.5-3.3-4 0-1 .8-1.7 1.7-1.7.7 0 1.3.4 1.6 1 .3-.6.9-1 1.6-1 .9 0 1.7.7 1.7 1.7 0 1.5-1.3 2.7-3.3 4Z"/',
        "worrying": None,   # tfc-stat-icon--empty in the original
    }
    blocks = []
    for s in stats:
        icon_svg = icons.get(s)
        icon = (f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" '
                f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{icon_svg}</svg>'
                if icon_svg else "")
        icon_cls = "tfc-stat-icon" + ("" if icon_svg else " tfc-stat-icon--empty")
        el = f"flint.stat.{s}"
        blocks.append(f"""{L.spacer(el)}<div class="tfc-stat-block"{L.attr(el)}>
            <span class="{icon_cls}" aria-hidden="true">{icon}</span>
            <div class="tfc-stat-value">{C.t(f"{el}.value")}</div>
            <div class="tfc-stat-desc">{C.t(f"{el}.desc")}</div>
        </div>""")
    return f"""<div class="tfc-expandable-section">
    <button class="tfc-expand-btn" onclick="toggleFlintSection()">
    Example: Flint Michigan <span class="tfc-expand-icon">&#9660;</span>
</button>
<div id="flint-content" class="tfc-expand-content">
    <div class="tfc-expand-inner">
        <div class="tfc-flint-body">
            {L.spacer("flint.eyebrow")}<span class="tfc-flint-eyebrow"{L.attr("flint.eyebrow")}>{C.t("flint.eyebrow")}</span>
            {L.spacer("para.flint.lead")}<p class="tfc-flint-lead"{L.attr("flint.lead")}>{C("flint.lead")}</p>

            <div class="tfc-flint-stats-grid">
                {"".join(blocks)}
            </div>
        </div>
    </div>
</div>
</div>"""


# ---- stats carousel (2 slides) -----------------------------------------------
def stats_carousel() -> str:
    return f"""
<div class="tfc-full-width tfc-bg-white tfc-reveal">
    <div class="tfc-content-container">
        <div class="tfc-section" style="margin-bottom: 0;">
            <h2 class="tfc-section-title">Why Hawaiʻi's families need RxKids</h2>

            <div class="tfc-carousel-container">
                <button class="tfc-carousel-arrow tfc-carousel-prev" onclick="moveCarousel(-1)">&#10094;</button>
                <button class="tfc-carousel-arrow tfc-carousel-next" onclick="moveCarousel(1)">&#10095;</button>

                <div class="tfc-carousel-track" id="statsTrack">
                    <div class="tfc-carousel-slide">
                        {L.spacer("carousel.poverty.quote")}
                        <div class="tfc-pullout-quote"{L.attr("carousel.poverty.quote", "margin-top:0px")}>
                            <p class="tfc-quote-text">{C.t("carousel.poverty.quote")}</p>
                        </div>

                        <h3 style="text-align: center; color: #2A3A4D; margin-bottom: 10px; margin-top: 40px; font-size: 1.5rem;">{C.t("carousel.poverty.chart.title")}</h3>

                        <div class="tfc-chart-container" style="margin-top: 80px;">
                            <div class="tfc-3d-chart">
                                {poverty_bar("married", 64)}
                                {poverty_bar("singlefather", 113)}
                                {poverty_bar("singlemother", 266)}
                            </div>
                            <p class="tfc-chart-source">{C("carousel.poverty.source")}</p>
                        </div>
                    </div>

                    <div class="tfc-carousel-slide">
                        <h3 style="text-align: center; color: #2A3A4D; margin-bottom: 10px; font-size: 1.5rem;">{C.t("carousel.childcare.title")}</h3>
                        <p class="tfc-section-subtitle"></p>

                        <div class="tfc-childcare-stats">
                            {L.spacer("carousel.childcare.cost.amount")}
                            <div class="tfc-cost-display"{L.attr("carousel.childcare.cost.amount")}>
                                <span class="tfc-cost-title">{C.t("carousel.childcare.cost.title")}</span>
                                <div class="tfc-cost-amount">{C.t("carousel.childcare.cost.amount")}</div>
                                <div class="tfc-cost-monthly">({C.t("carousel.childcare.cost.monthly")})</div>
                            </div>

                            <div class="tfc-income-comparison">
                                <div class="tfc-income-bar-group">
                                    <span class="tfc-income-label">{C.t("carousel.childcare.bar.single.label")}</span>
                                    <div class="tfc-bar-container">
                                        <div class="tfc-bar-fill single" id="bar-single">{C.t("carousel.childcare.bar.single.value")}</div>
                                    </div>
                                    <p style="font-size: 0.9rem; color: #718096; margin-top: 8px;">{C.t("carousel.childcare.bar.single.note")}</p>
                                </div>

                                <div class="tfc-income-bar-group">
                                    <span class="tfc-income-label">{C.t("carousel.childcare.bar.married.label")}</span>
                                    <div class="tfc-bar-container">
                                        <div class="tfc-bar-fill married" id="bar-married">{C.t("carousel.childcare.bar.married.value")}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tfc-flint-source">
                            <p>{C("carousel.childcare.source")}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>"""


def poverty_bar(key: str, height_px: int) -> str:
    el = f"carousel.poverty.bar.{key}"
    return f"""{L.spacer(el)}<div class="tfc-3d-bar-group"{L.attr(el)}>
        <div class="tfc-3d-bar">
            <div class="tfc-3d-bar-front" style="height: {height_px}px;">
                <span class="tfc-3d-bar-value">{C.t(f"{el}.value")}</span>
            </div>
        </div>
        <div class="tfc-3d-bar-label">{C.t(f"{el}.label")}</div>
    </div>"""


# ---- how it works (4 steps) --------------------------------------------------
def how_it_works() -> str:
    steps = "\n".join(step(i) for i in (1, 2, 3, 4))
    return f"""
<div class="tfc-full-width tfc-bg-blue tfc-reveal">
    <div class="tfc-content-container">
        <div class="tfc-section" style="margin-bottom: 0;">
            <h2 class="tfc-section-title">How RxKids would work in Hawaiʻi</h2>

            {L.spacer("steps.banner.amount")}
            <div class="tfc-total-banner"{L.attr("steps.banner.amount")}>
                <span class="tfc-total-label">{C.t("steps.banner.label")}</span>
                <span class="tfc-total-amount">{C.t("steps.banner.amount")}</span>
                <span class="tfc-total-sub">{C.t("steps.banner.sub")}</span>
            </div>

            <div class="tfc-steps">
                {steps}
            </div>

            <p class="tfc-steps-note">{C.t("steps.note")}</p>
        </div>
    </div>
</div>"""


def step(n: int) -> str:
    key = f"steps.{n}"
    has_amount = n != 1
    amount = (f'<div class="tfc-step-amount">{C.t(f"{key}.amount")}'
              f'<span class="tfc-step-amount-note">{C.t(f"{key}.amountnote")}</span></div>'
              if has_amount else "")
    return f"""{L.spacer(key)}<div class="tfc-step"{L.attr(key)}>
        <div class="tfc-step-phase">{C.t(f"{key}.phase")}</div>
        <div class="tfc-step-number">{n}</div>
        <h3 class="tfc-step-title">{C.t(f"{key}.title")}</h3>
        {amount}
        <p class="tfc-step-text">{C.t(f"{key}.text")}</p>
    </div>"""


# ---- TANF section -------------------------------------------------------------
def tanf_section() -> str:
    return f"""
<div class="tfc-full-width tfc-bg-white tfc-reveal">
    <div class="tfc-content-container">
        <div class="tfc-section" style="margin-bottom: 0;">
            <h2 class="tfc-section-title">How TANF helps pay for RxKids</h2>
            {L.spacer("para.tanf.intro")}
            <p class="tfc-section-subtitle"{L.attr("tanf.intro")}>{C("tanf.intro")}</p>

            <h3 style="text-align:center; color:#2A3A4D; font-size:1.5rem; margin: 0 0 28px;">{C.t("tanf.compare1.title")}</h3>

            <div class="tfc-tanf-compare">
                {tanf_card("tanf.ongoing", good=False,
                           icon_path='<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/>')}
                {tanf_card("tanf.shortterm", good=True,
                           icon_path='<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2.6"/><path d="M12 15v2"/>')}
            </div>

            {L.spacer("tanf.split.title")}
            <div class="tfc-tanf-split"{L.attr("tanf.split.title")}>
                <h3>{C.t("tanf.split.title")}</h3>
                <p>{C.t("tanf.split.body")}</p>
                <div class="tfc-tanf-bar">
                    <div class="tfc-tanf-seg tfc-tanf-seg--tanf">{C.t("tanf.split.bar.tanf.label")}<span>{C.t("tanf.split.bar.tanf.sub")}</span></div>
                    <div class="tfc-tanf-seg tfc-tanf-seg--state">{C.t("tanf.split.bar.state.label")}<span>{C.t("tanf.split.bar.state.sub")}</span></div>
                </div>
            </div>

            <h3 style="text-align:center; color:#2A3A4D; font-size:1.5rem; margin: 56px 0 16px;">{C.t("tanf.choice.title")}</h3>
            {L.spacer("para.tanf.choice.body")}
            <p class="tfc-section-subtitle"{L.attr("tanf.choice.body", "margin-bottom:32px")}>{C("tanf.choice.body")}</p>

            <div class="tfc-tanf-compare">
                {tanf_option_card("tanf.option1", "Option 1")}
                {tanf_option_card("tanf.option2", "Option 2 · Recommended", free=True)}
            </div>

            {L.spacer("para.tanf.note")}
            <p class="tfc-tanf-note"{L.attr("tanf.note")}>{C("tanf.note")}</p>

            {L.spacer("tanf.bottomline.title")}
            <div class="tfc-highlight-box"{L.attr("tanf.bottomline.title", "margin-bottom:0")}>
                <h3>{C.t("tanf.bottomline.title")}</h3>
                <p>{C.t("tanf.bottomline.body")}</p>
            </div>
        </div>
    </div>
</div>"""


def tanf_card(key: str, good: bool, icon_path: str) -> str:
    free_cls = " tfc-tanf-card--free" if good else ""
    tag_cls = "tfc-tanf-tag tfc-tanf-tag--good" if good else "tfc-tanf-tag"
    return f"""{L.spacer(key)}<div class="tfc-tanf-card{free_cls}"{L.attr(key)}>
        <span class="tfc-tanf-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{icon_path}</svg></span>
        <h3>{C.t(f"{key}.title")}</h3>
        <span class="{tag_cls}">{C.t(f"{key}.tag")}</span>
        <p>{C.t(f"{key}.body")}</p>
    </div>"""


def tanf_option_card(key: str, num_label: str, free: bool = False) -> str:
    free_cls = " tfc-tanf-card--free" if free else ""
    tag_cls = "tfc-tanf-tag tfc-tanf-tag--good" if free else "tfc-tanf-tag"
    return f"""{L.spacer(key)}<div class="tfc-tanf-card{free_cls}"{L.attr(key)}>
        <span class="tfc-tanf-option-num">{num_label}</span>
        <h3>{C.t(f"{key}.title")}</h3>
        <span class="{tag_cls}">{C.t(f"{key}.tag")}</span>
        <p>{C.t(f"{key}.body")}</p>
    </div>"""


# ---- CTA footer ---------------------------------------------------------------
def cta() -> str:
    return f"""
<div class="tfc-cta-section tfc-reveal" style="margin-bottom: 0;">
    <h2>{C.t("cta.title")}</h2>
    <p>{C.t("cta.body")}</p>
    <a href="https://rxkids.org/" target="_blank" class="tfc-btn">{C.t("cta.link1.label")}</a>
    <a href="https://rxkids.org/about/" target="_blank" class="tfc-btn tfc-btn-outline">{C.t("cta.link2.label")}</a>
</div>"""


# ---- sources ------------------------------------------------------------------
# The original page's citations were plain <a>[Source]</a> links a reader could
# click straight through; converting them to numbered [^id] superscripts (see
# BENEFIT_KEYS etc. above) needs somewhere those numbers resolve TO, or a
# reader has no way to find what "¹" refers to. Mirrors report2027's own
# endnote_link pattern.
def endnote_link(n, sid, txt, url):
    return (f'<li id="en{n}"{L.attr(f"endnote.{sid}")}>{txt} '
            f'<a href="{url}" target="_blank">{url}</a></li>')


def sources_section(entries) -> str:
    items = "".join(endnote_link(i + 1, sid, t, u) for i, (sid, t, u) in enumerate(entries))
    return f"""
<div class="tfc-full-width tfc-bg-white tfc-reveal">
    <div class="tfc-content-container">
        <div class="tfc-section" style="margin-bottom: 0;">
            <h2 class="tfc-section-title">Sources</h2>
            <ol style="font-size:0.95rem; color:#4a5568; line-height:1.7; padding-left:1.4em;">{items}</ol>
        </div>
    </div>
</div>"""


MAIN_BODY = f"""<div class="tfc-container">
{site_header()}
{hero()}
{what_is_rxkids()}
{benefits_widget()}
{stats_carousel()}
{how_it_works()}
{tanf_section()}"""

# Citation numbering runs once, on the whole body assembled SO FAR — before the
# sources section exists (it has no [^id] tokens of its own, and needs the
# order this establishes to render its numbered list in the first place).
C.fn.order_by(L.endnote_order(), C.fn.cited(MAIN_BODY))

BODY = f"""{MAIN_BODY}
{sources_section(C.fn.endnotes_with_ids())}
{cta()}
</div>"""

BODY = C.fn.resolve(BODY)

# The editor needs exactly one <section class="page"> as the coordinate origin
# for every drag/resize/snap calculation (see the report-editor skill).
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
  /* original.html's own `body` rule reserves 80px of top padding (and a
     beige fill) to clear Squarespace's sticky site nav, which we don't have
     here — dead space with nothing to clear once extracted. */
  body {{ padding-top: 0 !important; }}
  .rxkeiki-header {{ padding: 16px 0 0 24px; }}
  .rxkeiki-logo {{ display: block; width: 220px; height: auto; }}
  {EDIT_OVERRIDES}
</style>
</head>
<body>
<section class="page">
{BODY}
</section>
{L.layer(1)}{L.text_boxes(1)}{L.tables_html(1)}
<script>
{SCRIPT}
</script>
</body>
</html>
"""

_OUT.write_text(html)
print(f"wrote {_OUT} ({len(html):,} bytes)")
