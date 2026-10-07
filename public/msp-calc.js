/* Medicare Savings Program calculators: the arithmetic only.
   ============================================================================
   Used in two places so the numbers cannot disagree:
   - tools/site/build.mjs runs it at build time to print each calculator's
     default result into the HTML (the page reads correctly with no script);
   - site.js runs it in the browser when someone changes an input.
   Its inputs (`rules`) come from tools/site/msp-ny.json, exported from the
   rules archive (archive/tools/export_site_data.py) and checked in CI:
   - rules.values: New York's 2026 MSP limits and the Part B premium;
   - rules.estimates: eligibility by pension size (ACS 2024 PUMS,
     archive/research/msp_ny_eligibility/estimate.py) and the take-up,
     outreach, timing and retention assumptions with their sources
     (archive/research/msp_ny_eligibility/assumptions.yaml).

   The member check mirrors the archive's New York evaluator
   (archive/playbooks/msp/states/ny/rules.py): one $20 disregard per household
   from unearned income first, then $65 and half of the rest of wages, then
   health insurance premiums other than Part B (MSP-NY-HEALTH-PREMIUMS); QMB at
   or below 138% FPL, QI above that and at or below 186%, no asset test; QI
   cannot be held with Medicaid. archive/tests/test_site_calculator.py runs
   both on the same households. */

(function (root) {
  function num(v) {
    var n = Number(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /** Countable monthly income the way New York budgets the MSP. */
  function countable(rules, unearned, earned, premiums) {
    var gd = rules.values.income_disregard_monthly;
    var ed = rules.values.earned_exclusion_monthly;
    var unearnedAfter = Math.max(0, unearned - gd);
    var gdLeft = Math.max(0, gd - unearned);
    var earnedAfter = Math.max(0, earned - gdLeft - ed) / 2;
    return round2(Math.max(0, unearnedAfter + earnedAfter - (premiums || 0)));
  }

  /**
   * One household.
   * input: { couple, onMedicare: 1|2, unearned, earned, premiums, partA, medicaid,
   *          reimbursed: 0..1 (share of Part B the fund pays back) }
   */
  function member(rules, input) {
    var size = input.couple ? "2" : "1";
    var v = rules.values;
    var c = countable(rules, num(input.unearned), num(input.earned), num(input.premiums));
    var qmb = v.qmb_standard_monthly[size];
    var qi = v.qi_standard_monthly[size];
    var tier;
    if (!input.partA) tier = "needs_part_a";
    else if (c <= qmb) tier = "QMB";
    else if (c <= qi) tier = "QI";
    else tier = "over";
    var covered = tier === "QMB" || tier === "QI" ? (input.couple && input.onMedicare === 2 ? 2 : 1) : 0;
    var reimbursed = Math.min(1, Math.max(0, Number(input.reimbursed) || 0));
    var medicaidChoice = tier === "QI" && !!input.medicaid;
    var gainMonthly = medicaidChoice ? 0 : v.part_b_premium_monthly * covered * (1 - reimbursed);
    return {
      tier: tier,
      countable: c,
      limit: tier === "QMB" ? qmb : qi,
      over: tier === "over" ? round2(c - qi) : 0,
      medicaidChoice: medicaidChoice,
      gainMonthly: round2(gainMonthly),
      gainYearly: round2(gainMonthly * 12),
    };
  }

  /** Share of a fund's reimbursement list that qualifies but is not enrolled.
   *  e = share under the line; a = share of eligibles already enrolled. People
   *  already enrolled have their premium paid by the state, so they are mostly
   *  not on the reimbursement list: e(1-a) / (1 - e*a). */
  function notEnrolledShare(e, a) {
    return (e * (1 - a)) / (1 - e * a);
  }

  /**
   * A fund.
   * input: { retirees, reimbursed: 0..1, pension: key of eligible_share_by_pension, fee: 0..1 }
   * returns counts and yearly dollars at low / middle / high assumptions.
   */
  function fund(rules, input) {
    var est = rules.estimates;
    var year = rules.values.part_b_premium_monthly * 12;
    var reimbursed = Math.min(1, Math.max(0, Number(input.reimbursed) || 0));
    var fee = Math.min(1, Math.max(0, Number(input.fee) || 0));
    var n = num(input.retirees);
    var band = est.eligible_share_by_pension[input.pension] || est.eligible_share_by_pension.with_pension;
    var tu = est.take_up_among_eligible;
    var out = est.enroll_after_outreach;
    // Ranges combine the survey margin with the take-up and outreach ranges.
    var share = {
      low: notEnrolledShare(Math.max(0, band.share - band.moe90), tu.high),
      middle: notEnrolledShare(band.share, tu.middle),
      high: notEnrolledShare(Math.min(1, band.share + band.moe90), tu.low),
    };
    var pool = { low: Math.round(n * share.low), middle: Math.round(n * share.middle), high: Math.round(n * share.high) };
    var enrolled = {
      low: Math.round(pool.low * out.low),
      middle: Math.round(pool.middle * out.middle),
      high: Math.round(pool.high * out.high),
    };
    var perRetiree = year * reimbursed;
    var saved = {
      low: Math.round(enrolled.low * perRetiree),
      middle: Math.round(enrolled.middle * perRetiree),
      high: Math.round(enrolled.high * perRetiree),
    };
    return {
      share: share,
      pool: pool,
      enrolled: enrolled,
      saved: saved,
      ceiling: Math.round(pool.middle * perRetiree),
      fee: Math.round(saved.middle * fee),
      net: Math.round(saved.middle * (1 - fee)),
      toRetirees: Math.round(enrolled.middle * year * (1 - reimbursed)),
      perRetiree: round2(perRetiree),
      months: est.months_until_savings.middle,
      retained: est.retained_per_year.middle,
    };
  }

  /** "$1,217" or "$202.90", in the page's language. */
  function money(lang, n, cents) {
    var digits = cents ? 2 : 0;
    return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", {
      style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(n);
  }

  function count(lang, n) {
    return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US").format(n);
  }

  function pct(lang, x) {
    return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "percent", maximumFractionDigits: 0 }).format(x);
  }

  function fill(tpl, vars) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] === undefined ? m : vars[k]; });
  }

  /** The sentences a member sees. tpl holds the page's templates (strings.<lang>.mjs members.calc). */
  function memberText(rules, input, tpl, lang) {
    var r = member(rules, input);
    var premium = money(lang, rules.values.part_b_premium_monthly, true);
    var each = input.couple && input.onMedicare === 2;
    var premiumText = fill(each ? tpl.premiumEach : tpl.premiumOne, { premium: premium });
    var headline, gain = "", extra = "";
    if (r.tier === "needs_part_a") headline = tpl.needs_part_a;
    else if (r.tier === "over") headline = fill(tpl.over, { over: money(lang, Math.ceil(r.over), false) });
    else if (r.medicaidChoice) headline = tpl.medicaid;
    else {
      headline = fill(tpl[r.tier], { premiumText: premiumText });
      gain = r.gainMonthly > 0
        ? fill(tpl.gain, { month: money(lang, r.gainMonthly, true), year: money(lang, Math.round(r.gainYearly), false) })
        : tpl.gainNone;
      extra = tpl.extraHelp;
    }
    return { tier: r.tier, headline: headline, gain: gain, extra: extra };
  }

  /** The figures a fund sees, formatted. */
  function fundText(rules, input, tpl, lang) {
    var r = fund(rules, input);
    var m = function (n) { return money(lang, n, false); };
    var c = function (n) { return count(lang, n); };
    var range = function (o, f) { return fill(tpl.range, { low: f(o.low), high: f(o.high) }); };
    return {
      pool: c(r.pool.middle), poolRange: range(r.pool, c),
      enrolled: c(r.enrolled.middle), enrolledRange: range(r.enrolled, c),
      saved: m(r.saved.middle), savedRange: range(r.saved, m),
      fee: m(r.fee),
      net: m(r.net),
      retirees: m(r.toRetirees),
      ceiling: fill(tpl.ceiling, { amount: m(r.ceiling), count: c(r.pool.middle) }),
      perRetiree: fill(tpl.perRetiree, { amount: m(r.perRetiree) }),
      timing: fill(tpl.timing, { months: c(r.months), retained: pct(lang, r.retained) }),
    };
  }

  var api = {
    countable: countable, member: member, fund: fund, notEnrolledShare: notEnrolledShare, num: num,
    money: money, pct: pct, fill: fill, memberText: memberText, fundText: fundText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MSPCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
