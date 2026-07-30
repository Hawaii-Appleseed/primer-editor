#!/usr/bin/env python3
"""Build the tiny webfonts that give U+02BB (the Hawaiian ʻokina) a glyph.

Several of the families these reports use — Manrope, Poppins, Open Sans — do
not encode U+02BB, so every ʻokina set in them silently falls back to the OS UI
font (.SFNS on screen, Helvetica in print): visibly off-weight and off-colour
next to its neighbours. Measured on the tax-testimony one-pager, all 18
occurrences fell back, including the page-1 eyebrow.

The ʻokina is MODIFIER LETTER TURNED COMMA — the same mark a font already draws
for U+2018 LEFT SINGLE QUOTATION MARK. So rather than borrow a whole second
family, this takes each family's *own* U+2018 outline and re-encodes it at
U+02BB in a one-glyph font. The text keeps the correct character (substituting
U+2018 outright is an orthographic error in Hawaiian, and would break search,
copy-paste and screen readers) while the glyph is the one that family's own
designer drew. Under 1 KB each, inlined as a data: URI so pages stay
self-contained.

Every upstream here is SIL OFL 1.1 with no Reserved Font Name, so a renamed
derivative is permitted; the emitted module carries the attribution.

Adding a family: append to SOURCES. The name is derived from the source, so
okinafy() picks it up with no further wiring.

Run:  python3 tools/build_okina_font.py   (rewrites docsync/okina.py)
"""
import base64
import io
import pathlib
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# (CSS family this fronts, source TTF, css font-weight). Manrope ships a
# wght-variable build, so one face covers its whole range; Poppins and Open
# Sans are static-only upstream, so each weight actually loaded needs its own
# face — a weight with no face gets the nearest one and a synthesised result.
SOURCES = [
    ("Manrope", f"{RAW}/manrope/Manrope%5Bwght%5D.ttf", "200 800"),
    ("Poppins", f"{RAW}/poppins/Poppins-Light.ttf", "300"),
    ("Poppins", f"{RAW}/poppins/Poppins-Regular.ttf", "400"),
    ("Poppins", f"{RAW}/poppins/Poppins-Medium.ttf", "500"),
    ("Poppins", f"{RAW}/poppins/Poppins-SemiBold.ttf", "600"),
    ("Poppins", f"{RAW}/poppins/Poppins-Bold.ttf", "700"),
    ("Open Sans", f"{RAW}/opensans/OpenSans%5Bwdth,wght%5D.ttf", "300 800"),
]
SRC_CP, DST_CP = 0x2018, 0x02BB


def okina_family(source: str) -> str:
    """CSS family name for the one-glyph face fronting `source`."""
    return "Okina" + source.replace(" ", "")


def one_glyph_font(url: str, family: str) -> bytes:
    font = TTFont(io.BytesIO(urllib.request.urlopen(url).read()))

    opts = subset.Options()
    opts.drop_tables += ["DSIG"]
    opts.name_IDs = [1, 2, 3, 4, 6, 16, 17]
    opts.notdef_outline = False
    opts.layout_features = []
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=[SRC_CP])
    sub.subset(font)

    # re-encode the surviving quote glyph at the ʻokina's codepoint
    glyph = font.getBestCmap()[SRC_CP]
    for table in font["cmap"].tables:
        table.cmap = {DST_CP: glyph}

    # Rename every record still naming the source, not just IDs 1/3/4/6: the
    # variable builds carry fvar named-instance PostScript names that survive
    # subsetting, and Chrome labels the embedded PDF subset from those — which
    # is exactly what the verification pass reads back.
    for rec in font["name"].names:
        old = str(rec)
        if rec.nameID in (1, 3, 4, 16):
            rec.string = family
        else:
            for src in {s for s, _, _ in SOURCES}:
                if src in old:
                    old = old.replace(src, family)
            rec.string = old

    font.flavor = "woff2"
    out = io.BytesIO()
    font.save(out)
    return out.getvalue()


# Emitted verbatim into docsync/okina.py, so everything ʻokina lives in one
# module. For pages whose CSS is inherited rather than authored — a scaffolded
# copy of a live site, say — rewriting the stacks beats hand-editing dozens of
# declarations in a file that is meant to stay pristine.
HELPER = '''

_FAMILY = r"""(?P<q>['"]?)(?P<fam>%s)(?P=q)"""

# `font-family: 'Poppins', sans-serif`
_STACK = re.compile(r"font-family\\s*:\\s*" + _FAMILY, re.I)

# `font: 500 13px/1.4 'Poppins', sans-serif` — the shorthand hides the family
# behind the size/line-height, and missing it is not academic: one such rule on
# a position:fixed announcement bar put a fallback ʻokina on all 11 PDF pages.
# The (?!Okina) guard keeps the pass idempotent, since here the inserted name
# lands in the middle of the value rather than directly after the colon.
_SHORT = re.compile(r"\\bfont\\s*:\\s*(?:(?!Okina)[^;}\\"'])*?" + _FAMILY, re.I)


def okinafy(css: str) -> str:
    """Prepend each font's Okina* twin to every stack in `css` that names it.

    Handles inline `style=` attributes as happily as a stylesheet — it is only
    looking at declarations. Safe to run twice: an already-prefixed stack no
    longer matches.
    """
    def lead(m: "re.Match[str]") -> str:
        return OKINA_FOR[" ".join(m.group("fam").lower().split())] + ", "

    css = _STACK.sub(lambda m: "font-family:" + lead(m)
                     + m.group(0).split(":", 1)[1].lstrip(), css)
    return _SHORT.sub(lambda m: _insert(m, lead(m)), css)


def _insert(m: "re.Match[str]", lead: str) -> str:
    """Splice `lead` in front of the family name inside a matched declaration."""
    at = m.group(0).rindex(m.group("fam")) - len(m.group("q"))
    return m.group(0)[:at] + lead + m.group(0)[at:]
'''


def main() -> None:
    faces, seen = [], []
    for source, url, weight in SOURCES:
        family = okina_family(source)
        data = one_glyph_font(url, family)
        b64 = base64.b64encode(data).decode()
        faces.append(
            f"  @font-face {{ font-family:'{family}'; font-weight:{weight};\n"
            f"    font-style:normal; font-display:block;\n"
            f"    src:url(data:font/woff2;base64,{b64}) format('woff2');\n"
            f"    unicode-range:U+02BB; }}"
        )
        if source not in seen:
            seen.append(source)
        print(f"{family:16s} {weight:8s} {len(data):5d} B woff2")

    mapping = "\n".join(
        f'    "{s.lower()}": "{okina_family(s)}",' for s in seen)
    alternation = "|".join(s.replace(" ", r"\s+") for s in seen)

    out = pathlib.Path(__file__).resolve().parent.parent / "docsync" / "okina.py"
    out.write_text(
        '"""One-glyph webfaces that give U+02BB (the Hawaiian ʻokina) a real glyph.\n\n'
        "GENERATED by tools/build_okina_font.py — do not hand-edit.\n\n"
        "Manrope, Poppins and Open Sans do not encode U+02BB, so an ʻokina set in\n"
        "any of them silently falls back to the OS UI font — visibly off-weight next\n"
        "to its neighbours, on screen and in the PDF. These faces re-encode each\n"
        "family's own U+2018 outline at U+02BB, so the mark is the one that family's\n"
        "designer drew. The text keeps the correct character: no quote-mark\n"
        "substitution, which Hawaiian orthography treats as an error.\n\n"
        "Usage, from a project renderer:\n\n"
        "    from docsync.okina import OKINA_FACES, okinafy\n\n"
        "    # emit OKINA_FACES once inside the page's <style>, then either write\n"
        "    # the stacks yourself:\n"
        "    #     body { font-family: OkinaManrope, Manrope, system-ui, sans-serif }\n"
        "    # or, for CSS inherited from a page you did not author:\n"
        "    #     STYLE = okinafy(STYLE)\n\n"
        "The Okina* family MUST come first in the stack. Its unicode-range keeps it\n"
        "from claiming any character but the ʻokina, and a family listed after one\n"
        "that already claims U+02BB never gets consulted — which is why the tempting\n"
        "shortcut of adding these faces to the REAL families does not work: Google's\n"
        "own latin face declares U+02BB in its unicode-range without shipping the\n"
        "glyph, wins the match, and falls back. Verified, not assumed.\n\n"
        "Manrope (c) 2018 The Manrope Project Authors; Poppins (c) 2020 The Poppins\n"
        "Project Authors; Open Sans (c) 2020 The Open Sans Project Authors.\n"
        'All SIL OFL 1.1, no Reserved Font Name.\n"""\n'
        "import re\n\n"
        "# source family (lowercased) -> the one-glyph family that fronts it\n"
        "OKINA_FOR = {\n" + mapping + "\n}\n\n"
        "OKINA_FACES = r'''\n" + "\n".join(faces) + "\n'''\n"
        + HELPER % alternation
    )
    print(f"wrote {out} ({out.stat().st_size:,} B)")


if __name__ == "__main__":
    main()
