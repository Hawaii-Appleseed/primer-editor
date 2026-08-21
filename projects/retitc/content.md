<!--
  RETITC — §235-12.5 Renewable Energy Technologies Income Tax Credit.
  A 4-page analysis, pared down from the standalone PDF at
  ~/Census-Forecaster/generate_reec_report.py (CD1 formula).

  Every slot below is editable in the draft editor. The CHARTS are drawn in
  render_report.py from the DATA constants at the top of that file — a figure
  changed here and not there will disagree with the chart. Change numbers in
  BOTH places, or better, re-run the model and update the constants:

      cd ~/Census-Forecaster && .venv/bin/python generate_reec_report.py --cd 1

  Model: tax_modeler.scenarios.sb3125_cd1_credits.compute_credit_overlay,
  vintage-pool carryforward, OBBBA Mid scenario, TY2027–2031.
  Methodology: ~/Census-Forecaster/RETITC_REPORT_METHODOLOGY.md
  Act 24 / EO 26-02 writeup: ~/Census-Forecaster/SB3125_CD1_FORECAST.md

  WRITTEN FOR A READER WHO DOES NOT DO THIS FOR A LIVING. Terms of art are
  glossed where they first appear — nonrefundable, the pro-rata cut, unused
  credits carried forward — because the glossary page is gone. If you add a
  term, gloss it in the same sentence rather than assuming it.

  NO RECOMMENDATIONS. This is an analysis; it describes and does not advise.
  Removed 2026-08-21 at the user's direction — the five that were here are in
  git history at ed13dfe if they are ever wanted back.
-->

[[title]]
Renewable Energy Technologies Tax Credit — Act 24 and the one-year reprieve

[[cover.pill]]
§235-12.5

[[cover.h1]]
Renewable Energy Technologies Tax Credit

[[cover.deck]]
What Act 24 does to Hawaiʻi's solar tax credit, and what the governor's executive order gives back for a year.

[[cover.figures.h]]
KEY FIGURES

[[cover.fig.a.n]]
$100M

[[cover.fig.a.l]]
CLAIMED IN TAX YEAR 2023

[[cover.fig.b.n]]
$40M

[[cover.fig.b.l]]
THE NEW ANNUAL CAP · 2027–2030

[[cover.fig.c.n]]
2029

[[cover.fig.c.l]]
LAST YEAR FOR NEW CREDITS

[[cover.contents.h]]
INSIDE THIS REPORT

[[cover.contents.02]]
What Act 24 does to a $100M tax break

[[cover.contents.03]]
The governor's one-year reprieve

[[cover.contents.04]]
Who claims the credit today

[[cover.contents.05]]
What the cap saves, and who pays for it

[[cover.source]]
Source: Hawaiʻi Department of Taxation — Tax Credits Claimed by Hawaiʻi Taxpayers (December 2025).

[[cover.stamp]]
Hawaiʻi Appleseed Center for Law & Economic Justice  ·  Act 24, SLH 2026  ·  Projections use the CD1 credit formula.

[[about.eyebrow]]
The credit

[[about.h1]]
What Act 24 does to a $100M tax break

[[about.sub]]
§235-12.5 · Hawaiʻi Revised Statutes

[[about.works.p1]]
Install renewable energy equipment in Hawaiʻi — usually rooftop solar — and this credit cuts your state income tax. It is the biggest tax break the State offers for putting solar on a roof, and one of the tools behind a target written into law: all of Hawaiʻi's electricity from renewable sources by 2045. No money changes hands. The State simply collects less tax, which costs it the same either way. **In Tax Year 2023 that came to $100.1M.**[^dotax]

[[hist.note]]
Claims average **$86.1M** across the six years, but no single year tells you much. Tax Year 2020 is the odd one: claims by trusts, estates and financial corporations jumped from $2.7M to $50.9M, then dropped back to $2.0M. Household claims move far less, and have gone up every year — though in nominal dollars, before inflation or any change in the number of filers.

[[about.change.h]]
What changes under Act 24

[[about.change.p]]
SB 3125 was signed on **May 21, 2026** and is now **Act 24**.[^act24] It adds three limits to the credit, one of which the governor has already suspended for a year. All of it lands just after Washington ended the federal residential solar credit at the end of 2025, leaving the State credit as the only one a household can still claim.

[[about.card.a.n]]
$40M

[[about.card.a.l]]
ANNUAL CAP

[[about.card.a.d]]
Applies to Tax Year 2027 through 2030. If a year's approved credits add up to more than $40M, everyone's credit is cut by the same percentage.

[[about.card.b.n]]
$175K

[[about.card.b.l]]
INCOME LIMIT

[[about.card.b.d]]
Filers earning above $175K — $350K for a married couple filing together — no longer qualify. This starts in Tax Year 2027, not 2026.

[[about.card.c.n]]
2029

[[about.card.c.l]]
FINAL YEAR

[[about.card.c.d]]
No new credits after Tax Year 2029. Credits already earned but not yet used can still be claimed after that.

[[about.foot]]
Source: DOTAX, Tax Credits Claimed by Hawaiʻi Taxpayers — 2018 to 2022 actuals, Tax Year 2023 published December 2025.[^dotax] "Other" is the total minus individual and corporate claims, so it picks up figures the Department withholds to protect individual taxpayers. Approvals run through the Hawaiʻi State Energy Office.

[[eo.eyebrow]]
The one-year reprieve

[[eo.h1]]
The governor exempted a year of solar from the cap

[[eo.sub]]
Executive Order 26-02  ·  signed June 8, 2026  ·  cutoff date May 21, 2026

[[eo.standfirst]]
Act 24's $40M cap reaches back to Tax Year 2026 — over systems that were already paid for and permitted. Three weeks after signing the bill, Gov. Josh Green signed an executive order protecting a large portion of that year's projects from the cap. His stated reason: **"the retroactivity of the RETITC annual cap presents a risk of litigation."**[^eo]

[[eo.what.points]]
- **Only the cap is lifted.** A system finished during 2026 does not count against the $40M limit. Everything else stands: the 35 percent rate, the separate dollar limit on each system ($5,000 for a single-family solar array, $350 per unit for an apartment building, $500,000 for a commercial system), the approval process, and the 2030 wind-down.[^eo]
- **The cutoff is May 21, 2026** — the day Act 24 was signed, not June 8, when the order was. A system qualifies if it was finished by then, or if its owner can show they had already spent money on it. The Tax Department will accept a payment made or a bill incurred before the cutoff, and approvals are due by May 31, 2027.[^tir]
- **Caveat. **The cap was added late in the session with no cost estimate attached, and the State has not published a figure for what the exemption is worth.

[[eo.size.note]]
**How we got to $85M.** The credit usually costs Hawaiʻi $86M to $100M a year. Most solar projects finished in 2026 will likely qualify for the exemption, since installations take months and the cutoff falls in the middle of the year. That points to about **$85M** in credits protected from the cap — more than double the $40M the cap alone would have allowed. It only happens once, in 2027 and 2028, not every year.

[[eo.warn.h]]
Don't multiply $436M by 35 percent

[[eo.warn.p]]
The only public number here is **what these solar projects cost to build — not what the tax credits are worth**. The Hawaiʻi Solar Energy Association says the state's eight largest solar companies have $436M in commercial projects planned for 2026. That is a sample of big companies, and it leaves out homes entirely.[^cb] The credit is worth far less than 35 percent of a project's cost, because every system has its own dollar limit. A typical $30,000 home system earns back $5,000 — about 17 percent. A 114-unit apartment building earns $39,900, not $500,000. Multiplying $436M by 35 percent would produce more money than the credit has ever cost the state in a single year — a sign the math doesn't work that way.

[[eo.foot]]
The $85M figure is this analysis's own; the State has published none. Two things are still unsettled. The Council on Revenues, which sets the State's official revenue forecast, had not accounted for Act 24 or the executive order as of its last one.[^cor] And the law gives two different end dates for the credit — 2029 in one subsection, 2031 in another — which the Tax Department has settled at 2030 by announcement rather than by amendment.[^ann]

[[pays.eyebrow]]
Who pays

[[pays.h1]]
Who claims the credit today

[[pays.sub]]
Tax Year 2023 · individual filers

[[pays.agi.note]]
Households earning $200K and up take **45 percent** of all individual claims. Everyone under $60K combined takes less than a fifth. Solar costs money up front — a home system runs around $30,000 — and the credit is **nonrefundable**, meaning it only cancels tax you already owe. A filer whose tax bill comes to less than the credit never sees the difference. Act 24's income limit goes straight at the top of that distribution: the orange marks show where it applies, in the top two brackets only.

[[pays.foot]]
Source: DOTAX Table A-5, Tax Year 2023 individual claims by income bracket.[^dotax] Adjusted gross income is roughly what you earned before deductions and exemptions. Individual filers claimed $58.3M of the program's $100.1M that year; businesses and trusts claimed the rest.

[[saves.eyebrow]]
What it saves

[[saves.h1]]
What capping the credit saves

[[saves.sub]]
Tax Year 2027 burden  ·  savings through 2031

[[saves.burden.h]]
Who pays more in Tax Year 2027

[[saves.burden.note]]
**The cap makes no distinction at all.** Once a year's claims pass $40M, every remaining credit is cut by the same share — roughly 56 percent at 2027 demand — so a household in the bottom fifth pays about $40 more a year because of a ceiling it did nothing to reach. The income limit only ever touches the top. Businesses and trusts hold about 42 percent of the credit and sit outside it entirely, since a commercial or apartment system is not claimed by a person with an income.

[[saves.stat.a.n]]
$385M

[[saves.stat.a.l]]
revenue the State keeps, 2027–2031 — plausibly $372M to $434M

[[saves.stat.b.n]]
53%

[[saves.stat.b.l]]
of that comes in 2030–31, after new credits stop

[[saves.stat.c.n]]
$103M

[[saves.stat.c.l]]
what the credit still costs in 2027, despite a $40M cap

[[saves.foot]]
**Why $103M and not $40M:** the cap limits only new credits. Credits earned in earlier years and never used keep being claimed on top of them.[^model] How fast that older pile drains is the shakiest input in the model — it assumes 65 percent of it goes each year, a rate the State does not publish and nobody has measured for Hawaiʻi. The totals above barely move if that is wrong, but the size of the pile itself swings threefold, which is why no figure for it appears here. Two smaller caveats: the projections assume the cap applies to Tax Year 2026 systems, which the executive order mostly prevents, so the savings are **somewhat overstated**; and household figures are rounded to the nearest $10, with no change in taxpayer behavior modeled.[^method]

[[foot.running]]
RETITC · §235-12.5

[[endnotes.h2]]
Sources

[[sources]]
[dotax]: Hawaiʻi Dept. of Taxation, Tax Credits Claimed by Hawaiʻi Taxpayers, Tax Year 2023 (December 2025). — https://tax.hawaii.gov/stats/a5_3txcr/
[act24]: Act 24, Session Laws of Hawaiʻi 2026 (SB 3125), signed May 21, 2026. — https://www.capitol.hawaii.gov/session/measure_indiv.aspx?billtype=SB&billnumber=3125&year=2026
[eo]: Executive Order No. 26-02, Office of the Governor, June 8, 2026. — https://governor.hawaii.gov/executive-orders/
[tir]: Hawaiʻi Dept. of Taxation, Tax Information Release No. 2026-02, July 31, 2026. — https://tax.hawaii.gov/legal/tir/
[cb]: Hawaiʻi Solar Energy Association figures reported by Honolulu Civil Beat, May 29 and June 12, 2026. — https://www.civilbeat.org/
[cor]: Hawaiʻi Council on Revenues, General Fund forecast of May 21, 2026. — https://tax.hawaii.gov/useful/a2_b2_5cor/
[ann]: Hawaiʻi Dept. of Taxation, Announcement No. 2026-06. — https://tax.hawaii.gov/legal/announce/
[model]: Census-Forecaster credit-overlay model (CD1 formula). — https://github.com/Hawaii-Appleseed/Census-Forecaster/blob/main/generate_reec_report.py
[method]: Census-Forecaster, "RETITC Report — How the Pipeline Works." — https://github.com/Hawaii-Appleseed/Census-Forecaster/blob/main/RETITC_REPORT_METHODOLOGY.md
