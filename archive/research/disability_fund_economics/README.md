# Disability (SSDI) as Mycelium's second product: is it worth it?

Researched 2026-10-07. This page pulls together four sourced notes in this folder and the model
built on them. Every number traces to a note; numbers that are our own assumptions are marked.

| Note | Question |
|---|---|
| [medicare_pay_order.md](medicare_pay_order.md) | When does Medicare pay before the fund for an SSDI member? |
| [health_costs.md](health_costs.md) | What does the fund save per member-year once it does? |
| [ssa_process_and_fees.md](ssa_process_and_fees.md) | Can a fund pay us? How long do cases take, and how often do they win? |
| [funds_incidence_market.md](funds_incidence_market.md) | How many cases does a fund have, how do funds treat disabled members, and who already sells this? |
| [assumptions.yaml](assumptions.yaml), [model.py](model.py) | What it is worth per 10,000 members |

## The answer

**It's real, legal and worth adding, but it's smaller and slower than it first looks. It can't
carry half of a $5 million business by itself unless we work with very large funds, and it needs
a different way to get paid than Part B.**

## What is solid (verified in primary sources)

1. **The fund does save money.** A disabled member who is not working loses "current employment
   status" once they receive Social Security disability benefits, even if a union hour bank still
   covers them (42 CFR 411.104(a)(2), (b)(3)). From the first month of Medicare, which is month 25
   of SSDI and about month 29 after onset, Medicare pays first. Medicare is also primary over
   COBRA and retiree coverage. A multiemployer plan counts as "large" if any one contributing
   employer has 100+ employees, and the small-employer exception doesn't apply to disability
   (42 CFR 411.101; CMS MSP Manual ch. 2).
2. **The savings per member are large.** Once Medicare is primary, the fund saves about **$23,000
   per member-year** if it keeps drug coverage (range $11,500–$35,000), in 2026 dollars. This rests
   on CMS 2024 spending for disabled beneficiaries and SSA's randomized trial of new SSDI
   beneficiaries, which found $19,265 in average paid claims in year one. We checked that figure in
   the report. A few members drive the average: in the trial, 12% of members made up 53% of the
   cost.
3. **A fund can pay us, and the member pays nothing.** SSA doesn't need to approve the fee when an
   entity pays from its own money, the member owes nothing "directly or indirectly", and the
   representative files a written waiver (20 CFR 404.1720(e), 416.1520(e); checked in the CFR).
   Each staff member who helps must register with SSA and be appointed by name. Only individuals
   can be appointed, not companies.
4. **Cases are slow and usually denied at first.** Initial decisions averaged 188 days in August
   2026, reconsideration 212 and hearings 276. SSDI-only claims are allowed 38% of the time at the
   initial stage, 17–18% at reconsideration and about 58% at hearings. Only about 29–32% of
   applications ever end in an award. A case that goes to a hearing takes about two years.

## What weakens it

5. **Medicare starts late, and many funds stop covering members before then.** Medicare begins
   around month 29 after the member stops working. Many funds' disability extensions run 26 weeks
   to 30 months (32BJ: up to 30 months), so the fund often no longer covers the member when
   Medicare starts. For those members the health saving is about zero. The savings are real where
   coverage continues: disability pensioners with retiree health (1199SEIU, IBEW Local 3 JIBEI;
   74% of multiemployer health plans cover retirees).
6. **Many members would get SSDI without us.** Several NY, CA and IL funds already require an SSDI
   award before paying a disability pension or long-term disability (1199SEIU, 32BJ, JIBEI, SoCal
   IBEW-NECA, Chicago Painters). Only the difference we make counts: members who would never have
   applied or would have given up after a denial, and members who file sooner.
7. **The savings arrive years later.** The saving starts about two years after we file. A share of
   savings means a startup waits years for revenue.
8. **The pension fund often pays more.** An SSDI award often unlocks a disability pension, so the
   health fund saves while the pension fund pays out. The pitch has to be to the health fund.

## What it's worth (model.py; several inputs are assumptions)

Per 10,000 working-age covered members, per year of outreach, counting only the difference we make:

| | Low | Middle | High |
|---|---|---|---|
| New SSDI awards in the fund (sourced) | 30 | 45 | 55 |
| Awards that happen only because of us (assumption: 5% / 15% / 30%) | 1.5 | 6.8 | 16.5 |
| Health savings caused (new awards + earlier filing) | $12k | $321k | $2.19M |
| 20% of savings | $2k | $64k | $439k |
| Same, per member per month | $0.02 | $0.53 | $3.65 |

- **In the middle case, $2.5M a year in disability fees takes about 390,000 working-age members.**
  That is a handful of the largest NY funds, not 20 average ones. The average multiemployer health
  plan has about 3,500 participants (IFEBP: 1,436 plans, 5M+ participants).
- **The range is wide because of three assumptions that no study pins down.** They are the share
  of awards we cause, how many awardees the fund still covers when Medicare starts, and how many
  months earlier members file. Each one can be measured from one fund's claims and plan data.

## How to sell it without bloat

- **Charge per case, not as a share of savings.** A filing fee plus a fee on award pays us now, not in two
  years. Advocates who represent claimants are usually paid per case, from back pay; here the fund pays
  instead, and employer-side vendors don't publish their prices. Use the
  savings model to justify the price, not to calculate it.
- **Sell it to funds that keep covering disabled members:** retiree health for disability
  pensioners and long disability extensions. Ask for that plan provision in the first meeting. It
  decides whether the fund saves anything.
- **Same contract, same member file and same text outreach as Part B.** We find members on
  disability benefits, file the first application, collect medical records, and remind members of
  the 60-day appeal deadline. Hearings go to partner representatives. Our staff register with SSA
  individually. No SSA or Medicare branding in outreach (42 U.S.C. 1320b-10).
- **The contract must say the member owes nothing,** and the fund must not recover our fee from
  the member's back pay. Otherwise the fee needs SSA approval and falls under the cap.

## Competitors

SSDC Services sells "Medicare Maximization" to "employers & trusts" and claims $15,000
per-member-per-year savings. Allsup sells Medicare coordination to self-insured employers.
Genex/Enlyte, Brown & Brown (Advocator) and Citizens Disability sell to disability insurers and
employers. All of these are vendor claims. **None markets to Taft-Hartley funds by name.** That's an
opening, and it also means nobody has proven the channel.

## Still open

- Whether fund-paid weekly disability benefits count toward the 6-month current-employment clock.
- How a fund recovers money it paid first during retroactive Medicare months. There is no direct
  Medicare billing path; it has to recoup from providers and is exposed to timely-filing limits.
- Legal limits on "Medicare-eligible" carve-outs in plan design, from ERISA, the ACA, HIPAA and the
  ADA. Not reviewed.
- Allowance rates by age from a primary source. SSA's tables were blocked here.
- Which SSA waiver form applies (SSA-1696 checkbox or the older SSA-1696-U4). Confirm with SSA.
- How many members the largest NY funds have. Not verified here.
