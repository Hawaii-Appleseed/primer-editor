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
What the credit is, and what Act 24 changes

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
What the credit is, and what Act 24 changes

[[about.sub]]
§235-12.5 · Hawaiʻi Revised Statutes

[[about.works.p1]]
Hawaiʻi's Renewable Energy Technologies Tax Credit cuts your state income tax when you install renewable energy equipment — usually rooftop solar. It is the State's main tax incentive for rooftop solar, and part of how it pursues a goal written into law: all of Hawaiʻi's electricity from renewable sources by 2045. The State does not write anyone a check. It collects less tax instead, which costs it the same money. **In Tax Year 2023 that came to $100.1M.**[^dotax]

[[hist.note]]
Claims average **$86.1M** across the six years, but no single year says much on its own. Tax Year 2020 is the odd one out: claims by trusts, estates and financial corporations jumped from $2.7M to $50.9M, then fell back to $2.0M the year after. Household claims are the steady part — they have risen every year in the series, though these are nominal dollars, not adjusted for inflation or for the number of filers.

[[about.change.h]]
What changes under Act 24

[[about.change.p]]
SB 3125 was signed on **May 21, 2026** and is now **Act 24**.[^act24] It adds three limits to the credit, and the governor has already suspended one of them for a year. The timing matters: the federal government ended its own residential solar credit at the end of 2025, so for a household the State credit is now the only one left.

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
Act 24's $40M cap reaches back to Tax Year 2026 — over systems that were already paid for, already permitted, and in many cases already running. Three weeks after signing the bill, Gov. Josh Green signed an executive order taking most of that year back out. His stated reason: **"the retroactivity of the RETITC annual cap presents a risk of litigation."**[^eo]

[[eo.what.points]]
- **It lifts the cap, and nothing else.** A system finished during 2026 is not counted against the $40M limit. Everything else still applies: the 35 percent rate, the separate dollar limit on each system ($5,000 for a single-family solar array, $350 per unit for an apartment building, $500,000 for a commercial system), the approval process, and the 2030 wind-down.[^eo]
- **The date that matters is May 21, 2026** — the day Act 24 was signed, not June 8, when the order was. A system qualifies if it was finished before that day, or if its owner can show they had already spent money on it. The Tax Department accepts a payment made or a bill incurred before the cutoff as proof, and approvals are due by May 31, 2027.[^tir]
- **Nobody has priced it.** The cap was added late in the session with no cost estimate attached, and no official figure for what the exemption is worth has ever been published. The number below is ours.

[[eo.size.note]]
**How we got there.** Start from what the credit normally costs: $100.1M in Tax Year 2023, and $86.1M averaged over six years. Then assume 75 to 95 percent of 2026 systems qualify, which is what a May 21 cutoff implies when solar projects take months to finish. That puts the exempted amount near **$85M**, against the $40M a strict cap would have allowed — a one-time gap in 2027 and 2028, not a recurring one.

[[eo.warn.h]]
Don't take 35 percent of $436M

[[eo.warn.p]]
The only public figures describe **what the projects cost, not what the credits are worth**. The Hawaiʻi Solar Energy Association reported that the eight largest solar firms had 265 commercial projects with $436M committed for 2026 — a sample, and no residential systems at all.[^cb] Because each system carries its own dollar limit, the credit is worth far less than 35 percent of what a project costs. A typical home system, around $30,000, earns $5,000 — about 17 percent of the price. A 114-unit apartment building earns $39,900, not $500,000. Taking 35 percent of $436M would make that one sample larger than the biggest year the program has ever paid out.

[[eo.foot]]
The $85M figure is this analysis's own; the State has published none. Two things are still unsettled. The Council on Revenues, which sets the State's official revenue forecast, had not accounted for Act 24 or the executive order as of its last one.[^cor] And the law gives two different end dates for the credit — 2029 in one subsection, 2031 in another — which the Tax Department has settled at 2030 by announcement rather than by amendment.[^ann]

[[pays.eyebrow]]
Who pays

[[pays.h1]]
Who claims the credit today

[[pays.sub]]
Tax Year 2023 · individual filers

[[pays.agi.note]]
Households earning $200K and up take **45 percent** of all individual claims. Everyone under $60K combined takes less than a fifth. Two things drive that. One is who can afford the up-front cost — a home system runs around $30,000. The other is that the credit is **nonrefundable** — it can only cancel tax you already owe, so if your tax bill is smaller than the credit, you do not get the difference back. Act 24's income limit addresses the top directly: the orange marks show where it applies, in the top two brackets and nowhere below.

[[pays.foot]]
Source: DOTAX Table A-5, Tax Year 2023 individual claims by income bracket.[^dotax] Adjusted gross income is roughly what you earned before deductions and exemptions. Individual filers claimed $58.3M of the program's $100.1M that year; businesses and trusts claimed the rest.

[[saves.eyebrow]]
What it saves

[[saves.h1]]
What the cap saves, and who pays for it

[[saves.sub]]
Tax Year 2027 burden  ·  savings through 2031

[[saves.burden.h]]
Who pays more in Tax Year 2027

[[saves.burden.note]]
The income limit is aimed. **The cap is not.** Once a year's claims pass $40M, every remaining credit is cut by the same share — about 56 percent at 2027 demand — so a household in the bottom fifth pays about $40 more a year because of a ceiling it did nothing to reach. Businesses and trusts hold about 42 percent of the credit, and the income limit cannot reach those at all: a commercial or apartment system is not claimed by a person with an income.

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
**Why $103M and not $40M:** the cap limits only new credits. Credits earned in earlier years but never used keep being claimed on top of them.[^model] These projections also assume the cap applies to Tax Year 2026 systems; the executive order means it mostly will not, so the savings shown here are **somewhat overstated**. The $385M is one scenario of several the model runs, which is where the range on the first figure comes from. Claims are spread across income groups using Tax Year 2023 tax data and rounded to the nearest $10; no change in taxpayer behavior is modeled.[^method]

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
