<!--
  Rx Kids Hawaiʻi — fiscal one-pager. Every slot below is editable in the
  draft editor; the charts are drawn in render_report.py from the DATA
  constants at the top of that file, so a figure changed here and not there
  will disagree with the chart. Change numbers in BOTH places, or better,
  re-run the model and update the constants first.

  Model: ~/Census-Forecaster/forecast_rxkids_2028.py (TY2028, universal
  eligibility, take-up 0.90 newborn / 0.83 prenatal).
-->

[[title]]
Rx Kids Hawaiʻi — what it costs and who can pay

[[hero.eyebrow]]
HAWAIʻI APPLESEED · FISCAL ESTIMATE · 2028

[[hero.h1]]
Rx Kids Hawaiʻi: the cost, and the funding wall

[[hero.standfirst]]
A universal program paying **$1,500 during pregnancy** and **$500 a month after birth** would reach **roughly 13,200 births a year** — every family, no income test, no work requirement, no asset test. Modeled family-by-family on Census microdata for 2028.[^model] The constraint is not the price tag: **federal TANF can legally cover only a corner of it.**

[[stat.a.n]]
13,228

[[stat.a.l]]
births served a year — every family, no income test

[[stat.b.n]]
$52.1M

[[stat.b.l]]
core program: $1,500 + 6 monthly payments

[[stat.c.n]]
$87.9M

[[stat.c.l]]
full program, paying through 12 months

[[stat.d.n]]
40%

[[stat.d.l]]
of the core program TANF could cover, at best

[[timeline.title]]
Federal money runs out after the fourth payment

[[funding.title]]
What TANF covers, and what Hawaiʻi has to raise

[[funding.note]]
**Choosing the screen is worth ~$19.2M a year** — and Michigan's own approach happens to be the generous one. Adopting it takes a state plan amendment, not a federal waiver.[^son]

[[medicaid.title]]
Six in ten births are already on Medicaid — four in ten are not

[[risk.h]]
The federal exposure is real, and untested

[[risk.points]]
- **Ongoing monthly cash is "assistance"** federally — triggering work requirements and the 60-month clock. Michigan's workaround: call its slice a **non-recurrent short-term benefit**, exempt but capped at four payments.[^nrst]
- **No federal agency has ruled on it** — no approval, no waiver, but no audit finding either. Michigan's position sits unadjudicated in its state plan.[^rxkids]
- Guidance warns four months is **necessary but not sufficient**.[^nrst]

[[ask.h]]
Where the non-federal share could come from

[[ask.points]]
- **Hawaiʻi holds an idle TANF reserve near $459M** — about 4.7 years of its whole annual block grant.[^reserve] The $20.7M slice (Medicaid screen) is 4.5% of it, making the federal portion the *easy* part to finance.
- That leaves **$31.5M a year** to raise for the core program — state funds, counties and philanthropy — or **$67.2M** through twelve months.
- Phasing months 7–12 as contingent lets the ask grow with the fundraising rather than gate the launch.

[[footer.note]]
Census PUMS microdata (ACS 2018–2022) aged to 2028; births anchored to CDC vital statistics and Hawaiʻi DOH counts.[^births] Eligibility and the Medicaid split are tested per family on projected 2028 income — the Medicaid figure is the model's own Med-QUEST calculation, not a national average. Costs exclude administration (add ~8%). Take-up assumed 0.90 newborn / 0.83 prenatal; with no Hawaiʻi program to calibrate against, true uncertainty is roughly ±30–40%.

[[sources]]
[model]: Rx Kids Hawaiʻi cost model, TY2028 universal scenario — https://github.com/dtomkatsu/Census-Forecaster/blob/main/forecast_rxkids_2028.py
[births]: Methodology — births anchored to CDC NVSR and Hawaiʻi DOH, Kalman-projected to 2028 — https://github.com/dtomkatsu/Census-Forecaster/blob/main/RXKIDS_METHODOLOGY.md
[nrst]: 45 CFR 260.31 (definition of "assistance") and ACF Program Instruction TANF-ACF-PI-2008-05, "Diversion Programs" — https://acf.gov/ofa/policy-guidance/tanf-acf-pi-2008-05-diversion-programs-amended
[rxkids]: Michigan PA 119 of 2023 (HB 4437), Sec. 2006 — the "prenatal and infant allowance pilot program" line item ($16.5M TANF), and Rx Kids' own "Playbook for Replicating Rx Kids: Utilizing TANF and Protecting Public Benefits" (Hanna & Shaefer, MSU/Poverty Solutions, July 2024), written with MDHHS's TANF Policy Director — https://rxkids.org/wp-content/uploads/2024/08/Rx_Kids_TANF_Playbook.pdf
[son]: Hawaiʻi Administrative Rules §17-678-4 (standard of need) and §17-676-54.1 (income tests) — https://humanservices.hawaii.gov/wp-content/uploads/2025/02/17-678_Financial-Assistance-Standards-Adopted-01-26-25.pdf
[reserve]: Hawaiʻi DHS, "Report to the Thirty-Third Hawaiʻi State Legislature 2025" (HRS §346-51.5), filed March 20, 2025 — https://humanservices.hawaii.gov/wp-content/uploads/2024/11/RYamane_2025-HRS-Sect-346-51.5-TANF-Legislative-Report-DHS-BESSD-signed.pdf
