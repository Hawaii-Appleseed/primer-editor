<!--
  DOTAX vs ITEP on Act 46 / Act 24 — a one-page methods note.

  Every slot below is editable in the draft editor. The charts are drawn in
  render_report.py from the DATA constants at the top of that file, so a figure
  changed here and not there will disagree with the chart. Change numbers in
  BOTH places.

  Primary sources, both verified 2026-08-20:
    DOTAX  files.hawaii.gov/tax/stats/trc/docs2025/
           2026-05-Karacaovali_Presentation_TRC_Legislative_Update.pdf
    ITEP   "ITEP 26.05.13 HI SB 3125 Analysis.xlsx", tab "2031 Full Implementation"

  ITEP's component split is DERIVED from its published quintile rows (see the
  derivation note in render_report.py) — it is not a number ITEP printed.
-->

[[title]]
DOTAX vs ITEP on Hawaiʻi's income tax cuts

[[hero.eyebrow]]
HAWAIʻI APPLESEED · METHODS NOTE · AUGUST 2026

[[hero.h1]]
Two estimates of the same tax cut

[[hero.standfirst]]
The two sets of numbers look irreconcilable. They are not: each headline bundles something the other source never measured. Strip that out and they agree within a few percent — **except on one line, where they differ 3.5×.**

[[stat.a.n]]
$1,453M

[[stat.a.l]]
DOTAX Act 46 — half already law by 2026

[[stat.b.n]]
$705M

[[stat.b.l]]
ITEP, same year — different baseline

[[stat.c.n]]
37%

[[stat.c.l]]
of Act 24 is rate cuts, not credit sunsets

[[stat.d.n]]
3.5×

[[stat.d.l]]
apart on the one line they genuinely dispute

[[frame.title]]
Neither headline is what the other source measured

[[frame.note]]
The two bars fail for different reasons. Act 46's left half sits **inside ITEP's baseline**.[^itep] Act 24's is missing outright: ITEP models the personal income tax, and **$188.1M of that bill is tax-credit sunsets** — renewable energy, capital goods, high tech — which its microsimulation does not cover.[^dotax]

[[whole.title]]
Line the comparable slices up and they agree

[[parts.title]]
The one disagreement, and the fingerprint it leaves

[[finding.h]]
Where they agree, and where they don't

[[finding.p]]
**Both price the top-end changes alike** — $122M (DOTAX) against $130M (ITEP). **The middle-bracket cut is the entire disagreement:** DOTAX's −$13.1M is what you get if only filers whose *top* bracket is 2 or 3 benefit, and it counts **124,329** such returns.[^dotax] That is the fingerprint — 28% of the cost because 32% of the filers. Everyone above them earns through those bands too, which is what ITEP's **392,000** reflects.

[[footer.note]]
**Aligning them.** DOTAX reports fiscal years and includes nonresidents; ITEP reports TY2031 at 2026 incomes, residents only.[^itep][^iteptrc] ITEP's frame means differencing two DOTAX lines and mapping FY to TY — here FY = TY+1 (the alternative gives −$751M, +$104M, −$647M). **Caution:** nonresidents and income growth both push DOTAX up, so like-for-like would put ITEP 25–30% above it.

[[endnotes.h2]]
Sources

[[sources]]
[dotax]: Karacaovali, "Legislative Update," Hawaiʻi Tax Review Commission, May 26, 2026 (pp. 2, 13, 14). — https://files.hawaii.gov/tax/stats/trc/docs2025/2026-05-Karacaovali_Presentation_TRC_Legislative_Update.pdf
[itep]: ITEP, "HI SB 3125 Analysis," May 13, 2026 — tab "2031 Full Implementation," residents at 2026 incomes. — https://itep.org/
[iteptrc]: ITEP, "Regressivity," presentation to the Hawaiʻi Tax Review Commission, June 16, 2026. — https://files.hawaii.gov/tax/stats/trc/docs2025/2026-06-16_Regressivity_ITEP_presentation_HI_TRC.pdf
