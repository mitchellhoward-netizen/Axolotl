# The free leak scan

> **Corrected October 2026 — read `FUNDS-PROBLEM-VERIFICATION.md` first.**
> - Dialysis after month 30 and retirees without Part B are member costs, not
>   fund costs: plans already stop paying first.
> - The $76,540 figure is withdrawn. It's a vendor estimate for workers
>   moving to Medicare at 65+, not for SSDI.
> - Disability savings depend on how long the plan keeps disability retirees
>   on coverage.
> - Part B reimbursement at low-pension funds is verified and larger.

The way into a fund: a free, 30-day review of the fund's own data. It ends
with a dollar figure for every place the fund is paying when Medicare, Social
Security, the state or another insurer should pay. Then we fix those cases
member by member, and the fund pays per approval.

This file has three parts:

1. The one-page offer (the letter of intent)
2. The data request
3. How the scan finds each leak

Figures come from `FUNDS-MONEY-MAP.md` and `FUNDS-WRONG-PAYER.md`.
*Inferred* marks an estimate the scan replaces with the fund's real numbers.

---

## 1. The one-page offer

**[Fund name] × Axolotl: Wrong-Payer Scan**

**What it is.** A free review of [Fund]'s eligibility, claims and Part B
reimbursement data. It finds members whose costs belong to Medicare, Social
Security, the state or another insurer.

**What [Fund] gets in 30 days.** A report showing:

- Dollars a year the fund pays today that another payer owes, by leak:
  - dialysis past month 30
  - disability without Social Security disability or Medicare
  - retirees and COBRA members without Medicare
  - Part B reimbursed twice, or after death
  - other coverage
- How many members are behind each figure. No names leave the fund unless it
  asks.
- The order to fix them in, biggest dollars first.
- What each member gains: disability checks, lower premiums, cheaper
  prescriptions.

**What [Fund] provides.** The data files listed in section 2, under a HIPAA
business associate agreement, and one contact at the fund office.

**What it costs.** Nothing. If [Fund] then wants the cases fixed, Axolotl
reaches each member by text, with the fund's letter. Nothing is filed until
the member replies YES. The fund pays only per approval:

| Approval | Fee |
|---|---|
| Medicare Savings Program | $300 |
| Social Security disability award | Flat fee, agreed with the fund |
| Medicare starting at month 31 for dialysis | Flat fee, agreed with the fund |

**Our commitments.**

- **Data:** used only for this scan, kept encrypted, and deleted on request.
- **Members:** the fund sees totals, and nobody is contacted without the
  fund's go-ahead.
- **Dialysis:** we never steer anyone during the 30-month period when the law
  says the fund pays first.

**Signed (non-binding):**

| | [Fund] | Axolotl |
|---|---|---|
| Name and title | | |
| Date | | |

---

## 2. The data request

Ask for the smallest set that answers the question, and accept whatever the
fund office or its administrator (TPA) can export. Ideally the last 24
months, one row per person.

**Must have**

1. **Eligibility file.** Member ID, date of birth, sex, relationship
   (member, spouse, child), coverage type (active, retiree, COBRA, self-pay,
   disability extension), coverage start and end, ZIP code.
2. **Medicare status the fund has on file.** Part A and B dates, Medicare
   ID if present, and whether the fund pays first or second. Most of this
   comes from the fund's mandatory Section 111 reporting to CMS.
3. **Medical claims summary.** Member ID, date of service, the diagnosis
   and procedure codes, place of service, amount paid, and whether Medicare
   paid first ("crossover").
4. **Part B reimbursement file** (if the fund reimburses). Who is
   reimbursed, how much, which months.

**Good to have**

5. **Pension file.** Monthly pension amount, or bands, and any disability
   pension applications with dates and outcome. This pre-screens income for
   the Medicare Savings Program.
6. **Hours and contribution history.** For hour-bank drops and the move to
   self-pay.
7. **Other-coverage records.** Answers to coordination-of-benefits
   questionnaires and spouse coverage on file.
8. **Accident and work-injury questionnaires** and subrogation logs.

**Never needed for the scan:** full medical records, Social Security numbers
(a member ID is enough), or bank details.

---

## 3. How the scan finds each leak

Each rule produces a count and a dollar estimate. Every flag is checked by a
person before it goes in the report.

| Leak | What flags it | Dollar estimate |
|---|---|---|
| **Dialysis past month 30** | Dialysis claims (procedure codes 90935–90999, the outpatient dialysis bill type), months since the first one, and the fund still paying first | Fund's paid dialysis claims over the last 12 months × the share Medicare would carry as first payer |
| **Disabled, not working, no SSDI/Medicare** | Disability pension application or disability extension, no active hours for 6+ months, under 65, no Medicare on file | Paid claims over 12 months × (1 − the share left to a second payer). Lifetime value about $76K each *(industry figure)* |
| **ALS** | ALS diagnosis code (G12.21) with no Medicare on file | As above. Medicare starts the same month as SSDI |
| **Retirees 65+ where the fund pays first** | Age 65+, retiree coverage, no Part B date or no Medicare crossover on claims | Paid claims × the share Medicare would carry, *if* the plan document doesn't already "assume" Part B |
| **COBRA or self-pay with Medicare** | COBRA or self-pay coverage type with age 65+ or a disability flag, and the fund paying first | Same as the row above |
| **Part B reimbursed twice** | Reimbursement list matched against Medicare Savings Program / Medicaid status (with the member's consent, or through the state's match process), another employer's reimbursement, and death records | Reimbursed amount × months overlapping. Recoverable |
| **Coverage after death** | Eligibility or reimbursement continuing after a date of death (from claims, pension records or a death-record match) | Premiums and reimbursements paid after death |
| **Medicare Savings Program candidates** | Part B reimbursed, and pension plus estimated Social Security under the state limit (New York: $2,474 a month for one person, 2026) | Count × the fund's yearly reimbursement per person ($1,217 at 50%) |
| **Spouse with other coverage** | A working-age spouse on the fund with no other coverage on file. Confirmed by a text question, not inferred | Average spouse claims × the share the other plan would carry |
| **Work and car injuries** | Injury and trauma diagnosis codes with no accident questionnaire on file | Paid claims on those episodes. Confirmed by a text question |

**What the report looks like**

| Leak | Members | Fund $ a year | Member gains | Fix |
|---|---|---|---|---|
| Dialysis past month 30 | | | | Part B starting at month 31 |
| Disabled, no SSDI | | | | SSDI filing → Medicare |
| … | | | | |
| **Total** | | | | |

**What it should find at a 30,000-member fund** *(inferred, to be replaced
by the scan)*:

| Leak | Estimate |
|---|---|
| Disability → Medicare | about 57 members a year, about $4.4M of lifetime savings |
| Dialysis past month 30 | a handful of members, about $0.75M a year |
| Retirees, COBRA, double payments and deaths | about $0.5–1M+ |
| **Total** | **roughly $2–6M a year, 1–2% of spend** |

## After the scan

1. Trustees see the number and approve outreach for the top leaks.
2. The fund mails one letter. Axolotl texts each flagged member, screens
   them, fills the application and waits for the member's YES.
3. Every month: approvals, dollars moved, and reimbursements stopped,
   reported against the scan's baseline.
