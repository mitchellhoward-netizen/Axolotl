# Source check, 2026-10-07

450 sources checked: **1 changed**, 1 could not be fetched, 69 need a manual check (sites that block scripts), 379 unchanged.

## Needs re-checking, by state

### California

- **Medicare Counseling (HICAP)** (`ca-cda-hicap`): 8 changed lines vs snapshot 2026-10-07. Re-check:
  - claims_checked `1` (playbooks/turning_65/states/ca/playbook.yaml)
  - procedure `T65-CA-FILE-HICAP` (playbooks/turning_65/states/ca/playbook.yaml)
  - rule `T65-CA-HICAP` (playbooks/turning_65/states/ca/playbook.yaml)
  - summary `summary` (playbooks/turning_65/states/ca/playbook.yaml)

## What changed

### `ca-cda-hicap`

https://aging.ca.gov/Programs_and_Services/Medicare_Counseling/

First changed lines (no numbers changed):

```diff
+×
+
+Extreme Heat Advisory
+
+Many areas of California are continuing to experience extreme heat, with heat advisories in place through the end of the week.
+
+Learn about resources to stay safe during extreme heat, including finding cooling centers.
+
```

## Could not compare automatically

- `il-hsc-hsmfa-blog` (school_meals/il, fetch_failed): HTTP 202; snapshot 2026-10-07. 1 dependent items. https://healthyschoolscampaign.org/blog/illinois-must-step-up-and-meet-its-obligation-to-fund-free-school-meals-for-all-public-school-students/
- `ny-ssl-209` (disability/ny, manual): HTTP 403; snapshot 2026-10-07 was imported via headless Chromium (Playwright) page load; nysenate.gov returns 403 to non-JavaScript clients. 15 dependent items. https://www.nysenate.gov/legislation/laws/SOS/209
- `ny-senate-ssp-takeover-2014` (disability/ny, manual): HTTP 403; snapshot 2026-10-07 was imported via headless Chromium (Playwright) page load; nysenate.gov returns 403 to non-JavaScript clients. 5 dependent items. https://www.nysenate.gov/newsroom/articles/2014/andrea-stewart-cousins/state-supplement-program-state-takeover
- `ny-budget-otda-2006` (disability/ny, manual): snapshot 2026-10-07 was imported via requests with browser user agent (retry after connection reset); re-fetch the same way and compare. 2 dependent items. https://www.budget.ny.gov/pubs/archive/fy0607archive/fy0607app1/tda.pdf
- `cms-cib-2025-11-18` (ltc_medicaid/federal, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch research tool saved the PDF (medicaid.gov returns 403 to scripts). 15 dependent items. https://www.medicaid.gov/federal-policy-guidance/downloads/cib11182025.pdf
- `cms-cib-2025-12-09` (ltc_medicaid/federal, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch research tool saved the PDF (medicaid.gov returns 403 to scripts). 12 dependent items. https://www.medicaid.gov/federal-policy-guidance/downloads/cib12092025.pdf
- `cms-cib-2026-04-27` (ltc_medicaid/federal, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch research tool saved the PDF (medicaid.gov returns 403 to scripts). 6 dependent items. https://www.medicaid.gov/federal-policy-guidance/downloads/cib04272026.pdf
- `cms-smm-3257-3259` (ltc_medicaid/federal, manual): snapshot 2026-10-07 was imported via curl download of the CMS zip p45_03.zip; file 'sm 03 3 325 to 3259.8.doc' converted to text with LibreOffice; re-fetch the same way and compare. 3 dependent items. https://www.cms.gov/regulations-and-guidance/guidance/manuals/downloads/p45_03.zip
- `ca-dhcs-acwdl-25-14` (ltc_medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) download; dhcs.ca.gov blocks scripted clients and WebFetch with an Incapsula challenge. 45 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/25-14.pdf
- `ca-dhcs-acwdl-25-18` (ltc_medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) download; dhcs.ca.gov blocks scripted clients and WebFetch with an Incapsula challenge. 19 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/25-18.pdf
- `ca-dhcs-acwdl-26-02` (ltc_medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) download; dhcs.ca.gov blocks scripted clients and WebFetch with an Incapsula challenge. 16 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/26-02.pdf
- `ca-dhcs-acwdl-26-03` (ltc_medicaid/ca, manual): snapshot 2026-10-07 was imported via headless Chromium (Playwright) download; dhcs.ca.gov blocks scripted clients and WebFetch with an Incapsula challenge; re-fetch the same way and compare. 6 dependent items. https://www.dhcs.ca.gov/wp-content/uploads/2026/04/26-03.pdf
- `ca-dhcs-ltc-medi-cal-qa` (ltc_medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) download; dhcs.ca.gov blocks scripted clients. 4 dependent items. https://www.dhcs.ca.gov/services/ltc/Documents/Medi_CalQandA.pdf
- `justiceinaging-ca-asset-limit-faq` (ltc_medicaid/ca, manual): HTTP 412; snapshot 2026-10-07 was imported via curl with a browser user agent (the archive fetcher got HTTP 412). 1 dependent items. https://justiceinaging.org/reinstatement-of-medi-cal-asset-limit-faq/
- `ca-dhcs-acwdl-25-13` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 9 dependent items. https://www.dhcs.ca.gov/file/25-13-pdf/
- `ca-dhcs-acwdl-25-20` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 6 dependent items. https://www.dhcs.ca.gov/file/25-20-pdf/
- `ca-dhcs-acwdl-25-25` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 3 dependent items. https://www.dhcs.ca.gov/file/25-25-pdf/
- `ca-dhcs-acwdl-25-30` (medicaid/ca, manual): snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula); re-fetch the same way and compare. 2 dependent items. https://www.dhcs.ca.gov/file/25-30-pdf/
- `ca-dhcs-acwdl-25-33` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 4 dependent items. https://www.dhcs.ca.gov/file/25-33-pdf/
- `ca-dhcs-acwdl-26-13` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 4 dependent items. https://www.dhcs.ca.gov/file/acwdl-26-13-pdf/
- `ca-dhcs-acwdl-26-14` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 5 dependent items. https://www.dhcs.ca.gov/file/acwdl-26-14-pdf/
- `ca-dhcs-acwdl-25-08` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 2 dependent items. https://www.dhcs.ca.gov/file/25-08-pdf/
- `ca-dhcs-acwdl-20-18` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 2 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/20-18.pdf
- `ca-dhcs-acwdl-20-24` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 7 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/20-24.pdf
- `ca-dhcs-acwdl-23-31` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 2 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/23-31.pdf
- `ca-dhcs-acwdl-24-10` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 3 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/24-10.pdf
- `ca-dhcs-acwdl-89-58` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 2 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/c89-58.pdf
- `ca-dhcs-medil-i26-18` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 1 dependent items. https://www.dhcs.ca.gov/file/i26-18-pdf/
- `ca-dhcs-medil-i26-20` (medicaid/ca, manual): snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula); re-fetch the same way and compare. 2 dependent items. https://www.dhcs.ca.gov/file/i26-20/
- `ca-dhcs-medil-i26-01` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 1 dependent items. https://www.dhcs.ca.gov/file/i26-01-pdf/
- `ca-dhcs-medil-i25-24` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 3 dependent items. https://www.dhcs.ca.gov/file/i25-24-pdf/
- `ca-dhcs-medil-i26-03` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 2 dependent items. https://www.dhcs.ca.gov/file/i26-03-pdf/
- `ca-dhcs-medil-i25-23` (medicaid/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright); dhcs.ca.gov refuses scripted requests (Incapsula). 3 dependent items. https://www.dhcs.ca.gov/file/i25-23-pdf/
- `nysofa-hiicap-msp-2026` (msp/ny, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch research tool (site blocks scripted clients). 21 dependent items. https://aging.ny.gov/hiicap-notebook-medicare-savings-programs
- `ca-dhcs-acwdl-25-27` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 8 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/25-27.pdf
- `ca-dhcs-acwdl-26-16` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 3 dependent items. https://www.dhcs.ca.gov/file/acwdl-26-16-pdf/
- `ca-dhcs-acwdl-22-25` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 4 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/22-25.pdf
- `ca-dhcs-acwdl-22-28` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 3 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/letters/Documents/22-28.pdf
- `ca-dhcs-acwdl-26-01` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 10 dependent items. https://www.dhcs.ca.gov/file/26-01-pdf/
- `ca-dhcs-fpl-2026-monthly` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 14 dependent items. https://www.dhcs.ca.gov/services/medi-cal-resources/medi-cal-eligibility-division/all-county-welfare-directors-medi-cal-eligibility-division-information-letters/2026-fpl-calculation-chart-monthly-values-enclosure-1/
- `ca-dhcs-fpl-2026-programs` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 15 dependent items. https://www.dhcs.ca.gov/services/medi-cal-resources/medi-cal-eligibility-division/all-county-welfare-directors-medi-cal-eligibility-division-information-letters/program-descriptions-by-fpl-enclosure-3/
- `ca-dhcs-acwdl-25-01` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 14 dependent items. https://www.dhcs.ca.gov/file/25-01-pdf/
- `ca-dhcs-acwdl-25-26` (msp/ca, manual): snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula); re-fetch the same way and compare. 3 dependent items. https://www.dhcs.ca.gov/file/25-26-pdf/
- `ca-dhcs-acwdl-23-05` (msp/ca, manual): snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula); re-fetch the same way and compare. 7 dependent items. https://www.dhcs.ca.gov/wp-content/uploads/2025/10/23-05.pdf
- `ca-dhcs-acwdl-26-12` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 6 dependent items. https://www.dhcs.ca.gov/file/acwdl26-12-pdf/
- `ca-dhcs-acwdl-26-07` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 5 dependent items. https://www.dhcs.ca.gov/file/acwdl-26-07-pdf/
- `ca-dhcs-medil-i25-01` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 6 dependent items. https://www.dhcs.ca.gov/file/i25-01-pdf/
- `ca-dhcs-msp-page` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 20 dependent items. https://www.dhcs.ca.gov/individuals/medicare-savings-programs-in-california/
- `ca-dhcs-buyin-page` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 1 dependent items. https://www.dhcs.ca.gov/services/medicare-premium-payment-buy-in-program/
- `ca-dhcs-part-a-buyin-flyer` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 2 dependent items. https://www.dhcs.ca.gov/file/medicare-part-a-buy-in-flyer-pdf/
- `ca-dhcs-mc-14a` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 8 dependent items. https://www.dhcs.ca.gov/file/mc14a-eng-2-pdf/
- `ca-dhcs-mepm-5l` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 9 dependent items. https://www.dhcs.ca.gov/services/medi-cal/eligibility/Documents/c188.pdf
- `ca-dhcs-mc-176-qmb` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 1 dependent items. https://www.dhcs.ca.gov/formsandpubs/forms/Forms/MC%20176%201QMBSLMBQI.pdf
- `ca-dhcs-msp-county-contacts` (msp/ca, manual): HTTP 200; snapshot 2026-10-07 was imported via headless Chromium (Playwright) via the session proxy; dhcs.ca.gov refuses scripted requests (Incapsula). 4 dependent items. https://www.dhcs.ca.gov/file/file-190991-pdf/
- `fns-eligibility-manual-2017` (school_meals/federal, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader text of the usda.gov PDF (usda.gov returns 403 to scripts and WebFetch). 11 dependent items. https://www.usda.gov/sites/default/files/guidance-documents/fns.SP36cacfp15sfsp11-2017-eligibilityManualforSchools.pdf
- `nysed-cep-household-income-form` (school_meals/ny, manual): snapshot 2026-10-07 was imported via curl (NYSED intermediate certificate added to trust bundle); text extracted from word/document.xml with a zipfile script; re-fetch the same way and compare. 3 dependent items. https://www.cn.nysed.gov/sites/cn/files/spohouseholdincomeform.docx
- `ca-ec-49501-5` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 6 dependent items. https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=49501.5
- `ca-ec-42238-01` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 4 dependent items. https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=EDC&sectionNum=42238.01
- `ca-cde-ump-guidelines-2024` (school_meals/ca, manual): snapshot 2026-10-07 was imported via WebFetch saved the .docx (cde.ca.gov blocks scripts); text extracted from word/document.xml with a zipfile script; re-fetch the same way and compare. 10 dependent items. https://www.cde.ca.gov/ls/nu/sn/documents/umpfinalguidelines.docx
- `ca-cde-ump-faq` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 2 dependent items. https://www.cde.ca.gov/ls/nu/univmealsfaq.asp
- `ca-cde-alt-income-forms` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 15 dependent items. https://www.cde.ca.gov/fg/aa/pa/altincomeforms.asp
- `ca-cde-direct-cert` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 11 dependent items. https://www.cde.ca.gov/ls/nu/sn/directcert.asp
- `ca-cde-census-day` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 2 dependent items. https://www.cde.ca.gov/ds/ad/fsenrcensus.asp
- `ca-cde-ieg-2026-27` (school_meals/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via r.jina.ai reader (https://r.jina.ai/<url>) returning the page text; cde.ca.gov/leginfo block scripted requests. 0 dependent items. https://www.cde.ca.gov/ls/nu/rs/scales2627.asp
- `fns-snap-sua-fy26` (snap/federal, manual): snapshot 2026-10-07 was imported via curl download of the .xlsx from www.fns.usda.gov, converted to text (all rows, cells joined with |) with openpyxl; re-fetch the same way and compare. 5 dependent items. https://www.fns.usda.gov/sites/default/files/resource-files/2026-05-21-SUA-Table-FY26.xlsx
- `naic-medigap-birthday-chart-2026` (turning_65/federal, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch (site returns 403 to scripts); PDF saved by the research tool. 1 dependent items. https://content.naic.org/sites/default/files/inline-files/medigapbdayruleandunder65chart.pdf
- `nysofa-hiicap-guide-2025` (turning_65/ny, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch (aging.ny.gov returns 403 to scripts); PDF saved by the research tool. 8 dependent items. https://aging.ny.gov/system/files/documents/2025/09/2025-hiicap-guide-for-counselors.pdf
- `ny-dfs-medsup-rates-2026-04` (turning_65/ny, manual): HTTP 403; snapshot 2026-10-07 was imported via WebFetch (dfs.ny.gov returns 403 to scripts); PDF saved by the research tool. 2 dependent items. https://www.dfs.ny.gov/system/files/documents/2026/03/medsup-2026-04.pdf
- `ca-ins-code-10192-11` (turning_65/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via leginfo.legislature.ca.gov blocks scripts/WebFetch/headless Chromium (Cloudflare 403); text taken from the Legislative Counsel's official bulk dataset downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip (LAW_SECTION_TBL_56401.lob plus the table row's history line), read by HTTP range requests. 7 dependent items. https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=INS&sectionNum=10192.11
- `ca-sb-407-2019-chaptered` (turning_65/ca, manual): HTTP 403; snapshot 2026-10-07 was imported via leginfo.legislature.ca.gov blocks scripts (Cloudflare 403); chaptered bill text from the Legislative Counsel's official bulk dataset downloads.leginfo.legislature.ca.gov/pubinfo_2019.zip (BILL_VERSION_TBL_10083.lob), read by HTTP range requests. 4 dependent items. https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=201920200SB407

## Sources nothing cites

These are snapshotted but no rule or parameter cites them:

- `ssa-poms-si-00835-020` (disability/federal)
- `ssa-poms-si-01320-150` (disability/federal)
- `ca-scc-mc-medically-needy` (medicaid/ca)
- `ca-scc-mc-redetermination` (medicaid/ca)
- `ca-smc-medi-cal-changes-2025-26` (medicaid/ca)
- `ca-hca-asset-limits-practice-tip-2026` (medicaid/ca)
- `il-aging-ship-2026-limits` (medicaid/il)
- `il-idhs-pm-06-12-06` (msp/il)
- `il-idhs-pm-06-14-02-b` (msp/il)
- `il-idhs-pm-22-07-02-a` (msp/il)
- `nysed-ieg-2026-27` (school_meals/ny)
- `ca-cde-ieg-2026-27` (school_meals/ca)
- `il-iphi-hsmfa-overview-2026` (school_meals/il)
- `ny-hra-community-updates` (snap/ny)
- `il-idhs-pm-13-01-01` (snap/il)
- `il-admin-code-89-121-63-lii` (snap/il)
- `ssa-poms-hi-00805-382` (turning_65/federal)
- `healthinsurance-org-medicare-il` (turning_65/il)

