<!--
  RETITC — §235-12.5 Renewable Energy Technologies Income Tax Credit.
  A 5-page brief, pared down from the 9-page version and from the standalone
  analysis PDF at ~/Census-Forecaster/generate_reec_report.py (CD1 formula).

  Every slot below is editable in the draft editor. The CHARTS are drawn in
  render_report.py from the DATA constants at the top of that file — a figure
  changed here and not there will disagree with the chart. Change numbers in
  BOTH places, or better, re-run the model and update the constants:

      cd ~/Census-Forecaster && .venv/bin/python generate_reec_report.py --cd 1

  Model: tax_modeler.scenarios.sb3125_cd1_credits.compute_credit_overlay,
  vintage-pool carryforward, OBBBA Mid scenario, TY2027–2031.
  Methodology: ~/Census-Forecaster/RETITC_REPORT_METHODOLOGY.md
  Act 24 / EO 26-02 writeup: ~/Census-Forecaster/SB3125_CD1_FORECAST.md

  THE RECOMMENDATIONS ON PAGE 5 ARE NOT HAWAIʻI APPLESEED POSITIONS. positions.md
  carries no RETITC position of any kind — the house position on SB 3125 covers
  the Act 46 bracket freeze only. They are drawn from this analysis and need the
  policy team to ratify them before the report goes out under the org's name.
-->

[[title]]
Renewable Energy Technologies Tax Credit — Act 24, the one-year reprieve, and what to do next

[[cover.pill]]
§235-12.5

[[cover.h1]]
Renewable Energy Technologies Tax Credit

[[cover.deck]]
What Act 24 does to Hawaiʻi's solar tax credit, what the governor's executive order gives back for a year, and five things worth fixing.

[[cover.figures.h]]
KEY FIGURES

[[cover.fig.a.n]]
$100M

[[cover.fig.a.l]]
TOTAL RETITC CLAIMS · TAX YEAR 2023

[[cover.fig.b.n]]
$40M

[[cover.fig.b.l]]
ANNUAL CAP · TAX YEAR 2027–2030

[[cover.fig.c.n]]
≈$85M

[[cover.fig.c.l]]
GRANDFATHERED BY EXECUTIVE ORDER 26-02

[[cover.contents.02]]
The credit, and what Act 24 changes

[[cover.contents.03]]
The governor's one-year reprieve — Executive Order 26-02

[[cover.contents.04]]
Who claims it, who pays, and what the State keeps

[[cover.contents.05]]
Five things worth fixing

[[cover.contents.h]]
INSIDE THIS REPORT

[[cover.source]]
Source: Hawaiʻi Department of Taxation — Tax Credits Claimed by Hawaiʻi Taxpayers (December 2025).

[[cover.stamp]]
Hawaiʻi Appleseed Center for Law & Economic Justice  ·  Act 24, SLH 2026 (SB 3125 CD1 formula)  ·  Post-OBBBA federal §25D termination scenarios.

[[about.eyebrow]]
The credit

[[about.h1]]
What Act 24 changes, and what it costs

[[about.sub]]
§235-12.5 · Hawaiʻi Revised Statutes

[[about.works.p1]]
Hawaiʻi's Renewable Energy Technologies Tax Credit lets homeowners and businesses cut their state income tax when they install renewable energy equipment — most commonly rooftop solar. The State does not pay for installations; it forgoes the revenue instead, and its income-tax receipts fall by the same amount. **In Tax Year 2023 that came to $100.1M.**[^dotax]

[[hist.note]]
Six years of claims average **$86.1M**, with a spread wide enough that no single year is a reliable read on the program. Tax Year 2020's $113M came almost entirely from trusts, estates and financial corporations, during a stretch of large COVID-era commercial deals.

[[about.change.h]]
What changes under Act 24

[[about.change.p]]
SB 3125 was signed **May 21, 2026** and is now **Act 24, SLH 2026**.[^act24] Three provisions reshape the credit — and one of them has already been suspended for a year by executive order.

[[about.card.a.n]]
$40M

[[about.card.a.l]]
ANNUAL CAP

[[about.card.a.d]]
Applies Tax Year 2027–2030. If certifications exceed $40M, every credit is scaled down by the same percentage.

[[about.card.b.n]]
$175K

[[about.card.b.l]]
INCOME LIMIT

[[about.card.b.d]]
Filers above $175K AGI (single) or $350K (married filing jointly) no longer qualify. Starts Tax Year 2027, not 2026.

[[about.card.c.n]]
2029

[[about.card.c.l]]
FINAL YEAR

[[about.card.c.d]]
After Tax Year 2029, no new credits are issued. Carryforward balances from earlier years still draw down.

[[about.foot]]
Source: DOTAX — Tax Credits Claimed by Hawaiʻi Taxpayers (Tax Year 2018–2022 actuals; Tax Year 2023 December 2025 publication).[^dotax] "Other" = Total − Individual − Corporate, so disclosure-suppressed cells appear in the stack. Certification runs through the Hawaiʻi State Energy Office, not DBEDT.

[[eo.eyebrow]]
The one-year reprieve

[[eo.h1]]
The governor exempted a year's worth of solar from the cap

[[eo.sub]]
Executive Order 26-02  ·  signed June 8, 2026  ·  eligibility cutoff May 21, 2026

[[eo.standfirst]]
Act 24's $40M cap reaches back to Tax Year 2026. Three weeks after signing the bill, Gov. Josh Green signed an executive order taking most of that year back out — the stated reason being that **"the retroactivity of the RETITC annual cap presents a risk of litigation."**[^eo]

[[eo.what.points]]
- **The cap only.** A calendar-2026 system "shall not be subject to the annual $40,000,000 aggregate cap" — and nothing else changes. The 35 percent rate, every per-system cap ($5,000 single-family PV, $350 per unit multi-family, $500,000 commercial), certification and the 2030 phase-out all still apply.[^eo]
- **Two ways to qualify**, against a **May 21, 2026** cutoff — not the June 8 signing date. The system was finished before that day, or its owner shows the State it had already "reasonably relied" on the credit. DOTAX reads reliance as a payment made or cost incurred before the cutoff, and then presumes it; certification lands by May 31, 2027.[^tir]
- **Nobody has priced it.** The cap was added in conference committee with no fiscal note, and no official estimate of the exempted credit dollars exists. The figure below is ours, derived top-down from program scale.

[[eo.size.note]]
**How the estimate is built.** Anchor on what the credit normally costs — $100.1M in Tax Year 2023, a six-year mean of $86.1M — and on a grandfathered share of 75 to 95 percent, which a May 21 cutoff implies against multi-month lead times. That puts the pool near **$85M** against the $40M a strict cap allowed — a one-time gap in FY2027–28, not a recurring one.

[[eo.warn.h]]
Do not convert the $436M figure at 35 percent

[[eo.warn.p]]
The only quantified public numbers are **project cost, not credit value**: the Hawaiʻi Solar Energy Association reported that the eight largest solar firms had 265 commercial projects with $436M of committed private capital for 2026 — explicitly a sample, and excluding residential.[^cb] The per-system caps put the blended effective rate nearer **17 to 25 percent**, not 35: a $30,000 residential system yields $5,000, and a 114-unit multi-family complex yields $39,900 at $350 per unit, not $500,000. Converted at 35 percent, that sample alone would exceed the largest annual total the program has ever paid.

[[eo.foot]]
The exempted-pool estimate is this analysis's own. It is **not** a DOTAX, HSEO or Council on Revenues figure, and no such figure has been published. The savings on the next page do not move with the order — they score Act 24 against a no-bill baseline, and both paths already treat Tax Year 2026 as uncapped. What moves is the State's cash position in FY2027–28.

[[pays.eyebrow]]
Who pays

[[pays.h1]]
Claims cluster at the top — the cap does not

[[pays.sub]]
Tax Year 2023 claims  ·  Tax Year 2027 burden  ·  OBBBA Mid

[[pays.agi.h]]
Who claims the credit today

[[pays.agi.note]]
The top bracket alone — $200K and up — takes **45 percent** of all individual claims; everyone under $60K combined takes less than a fifth. That is who can afford solar, and who has the tax liability to use a credit that is not refundable. The orange rules mark where Act 24's income limit bites — the top two brackets, and nothing below them.

[[pays.burden.h]]
Who bears the increase in Tax Year 2027

[[pays.burden.note]]
The income limit is targeted; **the cap is not.** Once certifications exceed $40M every surviving credit is trimmed by the same percentage, so the bottom quintile loses about $37 a household to a cap it had no part in triggering. Corporate and trust filers hold roughly 42 percent of the credit and sit outside the income limit entirely.

[[pays.stat.a.n]]
$385M

[[pays.stat.a.l]]
revenue the State keeps, Tax Year 2027–2031

[[pays.stat.b.n]]
$103M

[[pays.stat.b.l]]
what the RETITC still costs in 2027, against a $40M cap

[[pays.stat.c.n]]
44¢

[[pays.stat.c.l]]
what each certified credit pays on the dollar in 2027

[[pays.foot]]
Annual savings run $58M–$63M through 2029, then rise to $100M–$105M as the sunset bites rather than the cap.[^model] Individual loss is crosswalked from DOTAX Tax Year 2023 AGI bins onto Tax Year 2027-anchored household quintiles; static incidence, no behavioral response modeled.[^method]

[[recs.eyebrow]]
What to do next

[[recs.h1]]
Five things worth fixing

[[recs.sub]]
Drawn from the figures in this report  ·  not adopted positions

[[recs.standfirst]]
Each of these follows from a number in this report. **None of them is yet a Hawaiʻi Appleseed position** — the organization has taken no position on the RETITC, and its support for SB 3125 covers the Act 46 bracket freeze, not the credit. They are put here for the policy team to weigh.

[[recs.r1.h]]
Stop the cap from falling on the households the income limit was written to spare

[[recs.r1.b]]
Act 24 does two things at once, and only one of them is targeted. The AGI limit removes high earners; the cap then trims **every surviving claim by the same 56 percent**, including claims from households the limit deliberately left in. Reserve a share of the $40M for single-family systems below a stated income, or exempt them from pro-rata, so the cap's cost falls where the income limit was already pointing.

[[recs.r2.h]]
Make the credit refundable below an income threshold

[[recs.r2.b]]
The RETITC is nonrefundable, so its value depends on having tax liability to offset — which is a large part of why claims cluster in the top bracket, and why an unexpiring carryforward pool exists at all. Refundability below a stated income would deliver the credit to households that cannot use it today. **This is a design proposal, not a scored one**: no run in this analysis prices it.

[[recs.r3.h]]
Report new certifications and carryforward drawdown as separate lines

[[recs.r3.b]]
"A $40M cap" is not what the State spends. In Tax Year 2027 the RETITC still costs **$103M**, because credits earned earlier but never claimed draw down on top of newly certified ones. Splitting the two lines in DOTAX reporting would make the cap's real fiscal effect legible — as would publishing **effective** rates by system class, which the per-system caps put at 17 to 25 percent, not the headline 35.

[[recs.r4.h]]
Publish the certified grandfathered total once the 2027 round closes

[[recs.r4.b]]
The executive order's cost is unknown to everyone, including the State. HSEO certifies by **May 31, 2027**; publishing the certified total and the count of exempted systems would replace every derived estimate, including ours, with a fact. The Council on Revenues should also take up Act 24 and the order — its last General Fund forecast predates both and incorporates neither.[^cor]

[[recs.r5.h]]
Fix the sunset conflict in statute, not by announcement

[[recs.r5.b]]
§235-12.5(c)(5) says allowable credits are $0 beginning January 1, 2031; §235-12.5(p) sunsets the section after Tax Year 2029. DOTAX has resolved the conflict as $0 from January 1, 2030 — which settles it administratively but not formally.[^ann] A one-line technical amendment in the 2027 session would close it.

[[foot.running]]
RETITC · §235-12.5

[[endnotes.h2]]
Sources

[[recs.foot]]
Act 24, SLH 2026  ·  §235-12.5 Renewable Energy Technologies Income Tax Credit  ·  Recommendations derived from this analysis; not adopted positions.

[[sources]]
[dotax]: Hawaiʻi Department of Taxation, "Tax Credits Claimed by Hawaiʻi Taxpayers," Tax Year 2023 (published December 2025). — https://tax.hawaii.gov/stats/a5_3txcr/
[act24]: Act 24, Session Laws of Hawaiʻi 2026 (SB 3125 CD2), signed May 21, 2026. — https://www.capitol.hawaii.gov/session/measure_indiv.aspx?billtype=SB&billnumber=3125&year=2026
[eo]: Executive Order No. 26-02, Office of the Governor, signed June 8, 2026 (announced June 12; approved as to form by Attorney General Anne Lopez). — https://governor.hawaii.gov/executive-orders/
[tir]: Hawaiʻi Department of Taxation, Tax Information Release No. 2026-02, July 31, 2026. — https://tax.hawaii.gov/legal/tir/
[cb]: Hawaiʻi Solar Energy Association figures reported by Honolulu Civil Beat, May 29 and June 12, 2026 — 265 commercial projects, $436M of committed private capital across the eight largest firms. — https://www.civilbeat.org/
[cor]: Hawaiʻi Council on Revenues, General Fund forecast of May 21, 2026; next meeting September 3, 2026. — https://tax.hawaii.gov/useful/a2_b2_5cor/
[ann]: Hawaiʻi Department of Taxation, Announcement No. 2026-06. — https://tax.hawaii.gov/legal/announce/
[model]: Census-Forecaster credit-overlay model, vintage-pool carryforward simulation (CD1 formula, OBBBA Mid). — https://github.com/Hawaii-Appleseed/Census-Forecaster/blob/main/generate_reec_report.py
[method]: "RETITC Report — How the Pipeline Works," Census-Forecaster methodology. — https://github.com/Hawaii-Appleseed/Census-Forecaster/blob/main/RETITC_REPORT_METHODOLOGY.md
