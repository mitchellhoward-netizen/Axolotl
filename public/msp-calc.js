/* Medicare Savings Program calculators: the arithmetic only.
   ============================================================================
   Used in two places so the numbers cannot disagree:
   - tools/site/build.mjs runs it at build time to print each calculator's
     default result into the HTML (the page reads correctly with no script);
   - site.js runs it in the browser when someone changes an input.
   Its inputs (`rules`) come from tools/site/msp-ny.json, which is exported
   from the rules archive (archive/tools/export_site_data.py) and checked in CI,
   so the limits here are the archive's New York 2026 limits.

   It mirrors the archive's New York evaluator (archive/playbooks/msp/states/ny
   /rules.py): one $20 disregard per household from unearned income first, then
   $65 and half of the rest of wages; QMB at or below 138% FPL, QI above that and
   at or below 186%, no asset test; QI cannot be held with Medicaid.
   archive/tests/test_site_calculator.py runs both on the same households. */

(function (root) {
  function num(v) {
    var n = Number(String(v == null ? "" : v).replace(/[^0-9.]/g, ""));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /** Countable monthly income the way New York budgets the MSP. */
  function countable(rules, unearned, earned) {
    var gd = rules.values.income_disregard_monthly;
    var ed = rules.values.earned_exclusion_monthly;
    var unearnedAfter = Math.max(0, unearned - gd);
    var gdLeft = Math.max(0, gd - unearned);
    var earnedAfter = Math.max(0, earned - gdLeft - ed) / 2;
    return Math.round((unearnedAfter + earnedAfter) * 100) / 100;
  }

  /**
   * One household.
   * input: { couple: bool, onMedicare: 1|2, unearned, earned, partA: bool,
   *          medicaid: bool, reimbursed: 0..1 (share of Part B the fund pays back) }
   * returns: { tier: "QMB"|"QI"|"over"|"needs_part_a", countable, limit, over,
   *            medicaidChoice: bool, gainMonthly, gainYearly }
   */
  function member(rules, input) {
    var size = input.couple ? "2" : "1";
    var v = rules.values;
    var c = countable(rules, num(input.unearned), num(input.earned));
    var qmb = v.qmb_standard_monthly[size];
    var qi = v.qi_standard_monthly[size];
    var tier;
    if (!input.partA) tier = "needs_part_a";
    else if (c <= qmb) tier = "QMB";
    else if (c <= qi) tier = "QI";
    else tier = "over";
    var covered = tier === "QMB" || tier === "QI" ? (input.couple ? (input.onMedicare === 2 ? 2 : 1) : 1) : 0;
    var reimbursed = Math.min(1, Math.max(0, Number(input.reimbursed) || 0));
    var medicaidChoice = tier === "QI" && !!input.medicaid;
    var gainMonthly = medicaidChoice ? 0 : v.part_b_premium_monthly * covered * (1 - reimbursed);
    return {
      tier: tier,
      countable: c,
      limit: tier === "QMB" ? qmb : qi,
      over: tier === "over" ? Math.round((c - qi) * 100) / 100 : 0,
      medicaidChoice: medicaidChoice,
      gainMonthly: Math.round(gainMonthly * 100) / 100,
      gainYearly: Math.round(gainMonthly * 12 * 100) / 100,
    };
  }

  /**
   * A fund.
   * input: { retirees, reimbursed: 0..1, eligibleShare: 0..1, fee: 0..1 }
   * returns yearly dollars, assuming every likely-eligible retiree is approved.
   */
  function fund(rules, input) {
    var year = rules.values.part_b_premium_monthly * 12;
    var reimbursed = Math.min(1, Math.max(0, Number(input.reimbursed) || 0));
    var share = Math.min(1, Math.max(0, Number(input.eligibleShare) || 0));
    var fee = Math.min(1, Math.max(0, Number(input.fee) || 0));
    var eligible = Math.round(num(input.retirees) * share);
    var perRetiree = year * reimbursed;
    var gross = eligible * perRetiree;
    var feeDollars = gross * fee;
    return {
      eligible: eligible,
      perRetiree: Math.round(perRetiree * 100) / 100,
      gross: Math.round(gross),
      fee: Math.round(feeDollars),
      net: Math.round(gross - feeDollars),
      toRetirees: Math.round(eligible * year * (1 - reimbursed)),
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
    return {
      eligible: count(lang, r.eligible),
      gross: money(lang, r.gross, false),
      fee: money(lang, r.fee, false),
      net: money(lang, r.net, false),
      retirees: money(lang, r.toRetirees, false),
      perRetiree: fill(tpl.perRetiree, { amount: money(lang, r.perRetiree, false) }),
    };
  }

  var api = {
    countable: countable, member: member, fund: fund, num: num,
    money: money, fill: fill, memberText: memberText, fundText: fundText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MSPCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
