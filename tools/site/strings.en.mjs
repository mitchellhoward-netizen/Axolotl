/**
 * Every word on the English site, in one place.
 *
 * The build (tools/site/build.mjs) renders this into public/index.html and
 * public/members.html. strings.es.mjs is the same
 * shape, so the two languages cannot drift apart structurally: if a key is
 * missing, the build fails.
 *
 * The thesis the site carries (docs/FUNDS-MONEY-MAP.md): a union benefit fund
 * pays bills that Medicare, Social Security or the state should pay, and in
 * almost every one of those cases the member is losing money too. Mycelium gets
 * the right payer to pay, from the member's side, by text, with their yes.
 * The fund pays per approval.
 *
 * Rules this file has to keep (from the design brief):
 *   - Never invent stats, quotes, features or legal claims. A sourced number
 *     names its source on the page; everything else is marked as an example.
 *   - Nothing here claims "any phone": the service runs over iMessage today.
 *   - Nothing is filed without the member's YES, after showing exactly what
 *     will be sent: every thread shows the offer, the yes, then the result.
 *   - The fund (or employer) never sees a member's case. Say so wherever a
 *     buyer appears.
 *   - Plain words, sentence case, second person, short sentences.
 */

export default {
  lang: 'en',
  locale: 'en_US',

  meta: {
    title: 'Mycelium: Part B premiums the state would pay',
    description:
      'Many retirees on a fund’s Part B reimbursement qualify for New York’s Medicare Savings Program, which pays the whole premium. Most never apply. Mycelium finds them in the fund’s files, enrolls them by text with their yes, and renews it every year. Retirees keep more each month. The fund stops paying. Paid from the savings.',
    shareAlt:
      'A fund’s monthly ledger from Mycelium: retirees approved for a Medicare Savings Program, renewals sent, applications waiting on the state.',
  },

  a11y: {
    skip: 'Skip to content',
    home: 'Mycelium home',
    menu: 'Menu',
    mainNav: 'Main navigation',
    footerNav: 'Footer',
  },

  nav: {
    money: 'Where the money goes',
    how: 'How it works',
    members: 'For members',
    join: 'Get a free scan',
    joinMembers: 'Get a text',
    langSwitch: 'Español',
  },

  // The homepage is for union health and welfare funds (docs/FUNDS-MONEY-MAP.md).
  // One idea: get the right payer to pay, from the member's side. Every figure
  // below is in the money map with its source; examples are marked as examples.
  hero: {
    eyebrow: 'For funds that reimburse Part B',
    h1Plain: 'Your fund reimburses Part B premiums',
    h1Em: 'the state would pay.',
    // The social card (share.html) draws the headline as one line of plain text.
    h1: 'Your fund reimburses Part B premiums the state would pay.',
    sub: 'Many retirees on your Part B reimbursement qualify for New York’s Medicare Savings Program, which pays the whole premium. Most never apply. Mycelium finds them in your files, enrolls them by text with their yes, and renews it every year. They keep about $100 more a month. Your fund stops paying. You pay a share of what you save.',
    primary: 'Get a free scan',
    secondary: 'See the numbers',
    trust: 'For union funds and public retiree plans that reimburse Part B. Nothing if nobody is approved.',
    // The hero phone: a retiree on the fund's Part B reimbursement who qualifies
    // for New York's Medicare Savings Program, as QI (2026 limit $2,474 a month
    // countable, about $2,494 gross after the $20 disregard; couple $3,355; no
    // asset test). Plain text only, the way the product sends it.
    phone: {
      meta: 'Today',
      metaTime: '10:12 AM',
      thread: [
        { out: 'Got the letter from the fund about Part B. Is this real?' },
        { in: 'It’s real. New York pays the whole Part B premium if you get under $2,494 a month, and savings don’t count. Just you, or a spouse too? And what comes in, before Medicare is taken out?' },
        { out: 'Just me. 1,640 social security, 410 pension' },
        { in: 'That’s $2,050, so you qualify. The state would pay all $202.90. The fund’s half stops, so you keep about $101 more a month, plus Extra Help with prescriptions.' },
        { in: 'I filled in the application. Reply YES and I’ll send it. I’ll handle the renewal every year too.' },
        { out: 'YES' },
        { in: 'Sent. I’ll text you as soon as the state confirms it.' },
      ],
      alt: 'Text thread on a phone. A retiree asks if the fund’s letter about Part B is real. Mycelium says New York pays the whole Part B premium under $2,494 a month and asks whether it is just her and what comes in before Medicare is taken out. She has $2,050 alone, so she qualifies: the state would pay all $202.90, the fund’s half stops, and she keeps about $101 more a month plus Extra Help with prescriptions. Mycelium has filled in the application and will handle the yearly renewal; she replies YES, it is sent, and Mycelium will text when the state confirms.',
    },
    // The social card's ledger. An example, not a client.
    folder: {
      label: 'Monthly ledger · Example fund',
      rows: [
        { label: 'Approved, 41 retirees', detail: 'Medicare Savings Program. $49,900 a year off the fund.', status: 'confirmed' },
        { label: 'Renewals, 126 retirees', detail: 'Sent before the deadline.', status: 'requested' },
        { label: 'Filed, 18 retirees', detail: 'Waiting on the state.', status: 'requested' },
        { label: 'New this month, 9 retirees', detail: 'Applications filled in.', status: 'waiting' },
      ],
    },
  },

  statuses: {
    confirmed: 'Approved',
    waiting: 'Waiting for a yes',
    requested: 'Filed, waiting on the agency',
    reminder: 'Reminder set',
    soon: 'Coming soon',
  },

  money: {
    h2Plain: 'Four in ten',
    h2Em: 'never apply.',
    lead: 'New York’s Medicare Savings Program pays the whole Part B premium for a retiree with up to about $2,494 a month before deductions, or $3,375 for a couple, and savings don’t count. About 4 in 10 people who qualify aren’t enrolled. When one of them is on your reimbursement, your fund pays a premium the state would cover.',
    stats: {
      eyebrow: 'The rule',
      example: 'New York, 2026',
      rows: [
        { v: '$202.90', l: 'Part B premium, every month', note: 'The 2026 standard premium. CMS.' },
        { v: '~$2,494', l: 'A month, one person, before deductions', note: 'New York’s limit with the $20 disregard. About $3,375 for a couple.' },
        { v: 'None', l: 'Asset test in New York', note: 'Savings and a home don’t count.' },
        { v: '4 in 10', l: 'Eligible people not enrolled', note: 'MACPAC, 2021–23.' },
      ],
    },
    head: ['Who', 'Who pays the premium now', 'Who would pay', 'What the retiree gets'],
    rows: [
      {
        when: 'A retiree under the limit, on a 50% reimbursement',
        now: 'Half the fund, half the retiree',
        should: 'The state, all of it',
        member: 'About $101 more a month, and Extra Help with prescriptions',
      },
      {
        when: 'A retiree under the limit, on a 100% reimbursement',
        now: 'The plan, all of it',
        should: 'The state, all of it',
        member: 'Extra Help with prescriptions. The premium stays covered.',
      },
      {
        when: 'A retiree the state already covers',
        now: 'The state, and the fund again',
        should: 'The state only',
        member: 'Nothing changes',
      },
      {
        when: 'A retiree whose income just dropped, after a spouse’s death or a smaller check',
        now: 'The fund',
        should: 'The state',
        member: 'The same as the first row, starting now',
      },
    ],
    note: 'Premium: 2026 standard Part B. Limits: New York QI-1, 2026, gross with the $20 disregard. Take-up: MACPAC. Extra Help comes automatically with a Medicare Savings Program.',
  },

  example: {
    h2Plain: 'One retiree,',
    h2Em: 'one letter, seven texts.',
    lead: 'The phone at the top of this page. The fund mails one letter with our number. She texts, answers two questions, and says yes. The rest happens without her.',
    brief: {
      eyebrow: 'What one approval is worth',
      example: '2026 figures',
      rows: [
        { v: '$202.90', l: 'Part B premium, every month', note: 'The state pays it once she’s approved.' },
        { v: '$1,217', l: 'A year the fund stops paying', note: 'For a fund that reimburses half the premium.' },
        { v: '$1,217', l: 'A year back in her check', note: 'Her half, plus Extra Help on prescriptions.' },
        { v: '20%', l: 'Our share of the fund’s savings', note: 'For each year she stays enrolled. Nothing for a denial.' },
      ],
      foot: 'The fund keeps 80% of the savings, every year she stays enrolled.',
    },
  },

  // The second phone: a member applying for a disability pension. Many
  // multiemployer pension plans require a Social Security disability award
  // first, so the member has to file anyway, and most file alone.
  how: {
    phone: {
      contact: 'Mycelium',
      meta: 'Six weeks later',
      metaTime: '11:04 AM',
      thread: [
        { kind: 'in', text: 'Good news: New York approved you. Social Security stops taking $202.90 out of your check starting in May.' },
        { kind: 'out', text: 'So my check goes up?' },
        { kind: 'in', text: 'Yes. The fund’s half stops the same month, so you come out about $101 a month ahead.' },
        { kind: 'out', text: 'Thank you so much' },
        { kind: 'in', text: 'You also get Extra Help now, so your prescriptions cost less. Nothing to do for that one.' },
        { kind: 'in', text: 'One more thing: this renews every year. I’ll text you in the fall. Reply YES then and I’ll send it.' },
        { kind: 'out', text: 'YES when it’s time' },
        { kind: 'in', text: 'Deal. If your income or address changes, text me here.' },
      ],
      caption: 'Example conversation. Fictional member and fund.',
      alt: 'Text conversation on a phone, six weeks after applying. Mycelium tells a retiree that New York approved her and Social Security stops taking $202.90 out of her check in May. She asks if her check goes up; yes, and the fund’s half stops the same month, so she comes out about $101 a month ahead, and she gets Extra Help on prescriptions. Mycelium says the benefit renews every year and it will text her in the fall; she agrees, and Mycelium asks her to text if her income or address changes.',
    },
  },

  after: {
    h2Plain: 'After the yes,',
    h2Em: 'we keep it working.',
    lead: 'Approval is the start. Social Security stops deducting the premium, your reimbursement stops the same month, and the state needs a renewal every year. We handle each step, so the retiree never pays twice and never drops off.',
    brief: {
      eyebrow: 'What we handle',
      example: 'Every year',
      rows: [
        { v: 'Day 1', l: 'The application, filed with her yes', note: 'In English or Spanish.' },
        { v: 'Weeks', l: 'The state decides', note: 'We answer any request for papers.' },
        { v: 'Same month', l: 'Your reimbursement stops', note: 'Only once her check stops the deduction, so she never pays twice.' },
        { v: 'Every year', l: 'The renewal, sent with her yes', note: 'Before the deadline, so the fund doesn’t start paying again.' },
      ],
      foot: 'If she moves, her income changes or her spouse dies, she texts us and we update it.',
    },
  },

  steps: {
    h2Plain: 'Every retiree, checked every month.',
    h2Em: 'Nothing moves without a yes.',
    lead: 'Mycelium keeps a live record of where each retiree on your reimbursement stands: watching, likely eligible, contacted, agreed, filed, approved, up for renewal. It reads what changed in your files and in the rules, and moves a retiree forward only when it’s sure. When it isn’t, a person decides.',
    items: [
      { tag: 'Watch', text: 'Every month: your eligibility and Part B reimbursement files. Every year: the new premium, the cost-of-living raise and New York’s new income limits, which make more retirees eligible each January.' },
      { tag: 'Decide', text: 'The eligibility math is plain code, traceable to the rule and the number. A calibrated decision model reads what changed and says how sure it is. Below the bar, a person on our team looks.' },
      { tag: 'Reach', text: 'You mail one letter with our number. Retirees text or call back, in English or Spanish, and confirm their income in two questions.' },
      { tag: 'Yes', text: 'Nothing is filed until the retiree replies YES to exactly what will happen.' },
      { tag: 'Confirm', text: 'We file with the state, track it to the written approval, and renew it every year.' },
      { tag: 'Reconcile', text: 'With the retiree’s okay, you get the list of reimbursements to stop, timed to when Social Security stops the deduction, and a monthly ledger of dollars saved.' },
    ],
  },

  different: {
    h2Plain: 'Why this isn’t done',
    h2Em: 'already.',
    items: [
      { h: 'Your rules already ask for it', p: 'Plans reimburse Part B when the retiree pays it, not when someone else does. Auditors keep finding plans paying premiums the state or another employer already covers. We make that rule work for every retiree, every month.' },
      { h: 'Only the retiree can apply', p: 'No claims system can enroll anyone. The retiree has to confirm their income, agree and sign. We do that with them, from a letter they trust.' },
      { h: 'Every decision is on the record', p: 'Each step a retiree takes is logged with what changed, what the system concluded and how sure it was. Your counsel can review any of it.' },
      { h: 'You pay from savings', p: 'A share of what you save, for each year a retiree stays enrolled. Nothing for screening, nothing for denials.' },
    ],
  },

  never: {
    h2: 'What we never do',
    items: [
      { title: 'Act without a yes', body: 'Nothing is filed, sent or signed until the retiree replies YES to exactly what will happen.' },
      { title: 'Show the fund a case', body: 'The fund sees totals. It learns a retiree’s name only when that retiree agrees, and only what it needs, like a reimbursement to stop.' },
      { title: 'Touch anyone’s coverage', body: 'Retirees keep exactly the plan they have. Only who pays the premium changes. We never sell or recommend a Medicare plan.' },
      { title: 'Charge retirees', body: 'Retirees never pay us. We sign a HIPAA business associate agreement before we see a single file.' },
    ],
  },

  // The free wrong-payer scan (docs/FUNDS-LEAK-SCAN.md): the way into a fund.
  scan: {
    h2Plain: 'Start with a free scan',
    h2Em: 'of your own data.',
    lead: 'In 30 days we show you, in dollars, how much of your Part B reimbursement New York would pay, and how many retirees are behind the number.',
    cards: [
      { title: 'What you get', body: 'How many retirees on your reimbursement likely qualify, what you pay for them each year, and any premiums you reimburse that someone else already pays. No names leave the fund unless you ask.' },
      { title: 'What you give', body: 'Your Part B reimbursement file and a few eligibility fields, de-identified, under a HIPAA business associate agreement, and one contact at the fund office.' },
      { title: 'What it costs', body: 'Nothing. If you want the retirees reached, you mail one letter and pay only a share of what you save.' },
    ],
    dataLabel: 'What we ask for',
    data: [
      'Age band, county, and whether there’s a covered spouse',
      'Who you reimburse for Part B, and how much',
      'Pension amount or band, if you have it',
      'Whether you keep the Social Security letters retirees send with their claims',
    ],
    neverLabel: 'What we never need',
    never: ['Medical records', 'Social Security numbers', 'Bank details'],
    estimate: 'For a fund with 50,000 retirees on a 50% Part B reimbursement and pensions mostly under $500, the estimate above comes to about $3 million a year in premiums the state would pay (range $0.8–6.2 million). The scan replaces it with your number.',
  },

  // The fund calculator (/#estimate). Numbers come from tools/site/msp-ny.json,
  // exported from the rules archive; {placeholders} are filled by public/msp-calc.js.
  fundCalc: {
    h2Plain: 'Your number,',
    h2Em: 'grounded in the data.',
    lead: 'Three things you already know. The rest comes from New York’s 2026 rules, Census data on New York retirees, and published research on enrollment. Every assumption is listed below, and the free scan replaces it with your own files.',
    retireesLabel: 'Retirees you reimburse for Part B',
    shareLabel: 'How much of the premium you pay back',
    shareOptions: [['0.5', 'Half'], ['1', 'All of it'], ['0.25', 'A quarter'], ['0.75', 'Three quarters']],
    pensionLabel: 'Typical monthly pension your retirees get',
    pensionOptions: [
      ['with_pension', 'Not sure'],
      ['under_500', 'Under $500'],
      ['500_999', '$500 to $999'],
      ['1000_1499', '$1,000 to $1,499'],
      ['1500_1999', '$1,500 to $1,999'],
      ['2000_plus', '$2,000 or more'],
    ],
    pensionHint: 'Pension size is the biggest driver. Among New Yorkers 65 and older on Medicare with a pension, about half of those getting under $500 a month are under New York’s limit, and almost none above $2,000.',
    resultsTitle: 'What to expect in a year',
    range: '{low} to {high}',
    out: {
      pool: 'Retirees likely eligible and not enrolled',
      enrolled: 'Likely to enroll after your letter and our help',
      saved: 'Premiums New York pays instead of you, a year',
      fee: 'Our fee, 20% of that',
      net: 'What your fund keeps, a year',
      retirees: 'Back in retirees’ checks, a year',
    },
    ceiling: 'If all {count} enrolled: {amount} a year.',
    perRetiree: 'Each enrolled retiree saves your fund {amount} a year, every year they stay enrolled.',
    timing: 'Savings start about {months} months after a retiree says yes, and about {retained} stay enrolled each year. We handle the renewals.',
    methodsTitle: 'How we estimate this',
    methods: [
      'Who qualifies: Census Bureau, American Community Survey 2024, New York microdata. We apply New York’s MSP income rules to New Yorkers 65 and older on Medicare and group them by total pension income (every pension combined, so slightly higher than your fund’s alone). The ranges include the survey’s margin of error.',
      'Two things the survey misses pull in opposite directions. Surveys under-report pensions a little, which makes our share too high. New York also subtracts health insurance premiums a retiree pays, including union fund premiums, which makes it too low.',
      'Already enrolled: about 55% of eligible people are enrolled (range 40% to 65%), from the Urban Institute’s 2021–23 national estimates and MACPAC’s earlier New York estimate. People already enrolled are usually no longer on your reimbursement.',
      'Enrolled through outreach: 15% of the people we reach (range 5% to 25%). This is the weakest number. No published trial measures it for the MSP. Mass letters from Social Security added under 1% (GAO, 2004). Letters with help applying reached 18% in a randomized trial for older adults and SNAP (Finkelstein and Notowidigdo, 2019).',
      'Timing and renewals: decisions within 45 days and about 3 months for Medicare’s records to update (GAO); 11% to 17% of new enrollees lose coverage within a year (KFF).',
    ],
    scanTitle: 'What the free scan replaces',
    scanItems: [
      'The pension guess, with each retiree’s real pension and household from your files',
      'The enrollment guess, with who is already enrolled',
      'Then a list, so one letter reaches the right retirees',
    ],
    cta: 'Get your real number',
    noScript: 'Turn on JavaScript to change the numbers. The figures shown are for the example inputs.',
  },

  pilot: {
    h2: 'Start with one mailing',
    lead: 'Pick the retirees on your Part B reimbursement who likely qualify. You send one letter. We screen, file, follow each case to approval and renew it every year.',
    feesHead: ['What', 'Our fee'],
    fees: [
      ['A retiree approved for a Medicare Savings Program', '20% of the premium you no longer pay, each year they stay enrolled'],
      ['The yearly renewal', 'Included'],
      ['A denial, or no answer', 'Nothing'],
    ],
    measuresLabel: 'What we report every month',
    measures: [
      'Retirees who answered, and how many qualify',
      'Applications filed, approved and pending',
      'Premium dollars a year off the fund',
      'Renewals sent on time',
    ],
    guardrail: 'If nobody is approved, the pilot costs the fund nothing.',
  },

  form: {
    h2: 'Request a free scan',
    lead: 'Tell us about your fund. We’ll reply within two business days with the agreement and the data list.',
    nameLabel: 'Your name',
    roleLabel: 'Your role',
    fundLabel: 'Fund',
    emailLabel: 'Work email',
    messageLabel: 'How many participants and Medicare retirees, in which states, and is the fund self-administered or with a TPA?',
    messageHint: '(optional)',
    submit: 'Send',
    note: "We'll use these details to reply. Please don't include member records or health information.",
    success: "Your request is saved. We'll reply to the email you gave us.",
    error: "We couldn't save your request. Please try again.",
    generic: 'Please fill in every field.',
  },

  membersBand: {
    h2: 'Got a letter from your fund?',
    body: 'If your fund sent you our number, here’s what we do, and what we never do.',
    link: 'For members',
  },

  // ── /members ────────────────────────────────────────────────────────────────
  // For the member holding the fund's letter. Plain words; they are checking
  // that we are real before they text.
  members: {
    meta: {
      title: 'Mycelium for members',
      description: 'Your benefit fund works with Mycelium to help retirees get New York to pay their Medicare Part B premium. You text, we fill in the forms, and nothing is sent without your yes. Free to you.',
      shareAlt: 'A fund’s monthly ledger from Mycelium.',
    },
    hero: {
      eyebrow: 'For union retirees',
      h1Plain: 'Your fund sent you here.',
      h1Em: 'Here’s who we are.',
      sub: 'Mycelium works with your benefit fund to help retirees get New York State to pay their Medicare Part B premium, $202.90 a month in 2026. You text. We fill in the forms. Nothing is sent without your yes. It’s free to you.',
      primary: 'Get a text from us',
    },
    help: {
      h2: 'What we can help with',
      items: [
        { title: 'Your Medicare premium', body: 'If your income is under New York’s limit, the state may pay your whole Part B premium. If your fund pays back half of it today, that stops, and you still come out about $100 a month ahead.' },
        { title: 'Prescriptions', body: 'Extra Help lowers what you pay for medicines. Anyone in a Medicare Savings Program gets it automatically.' },
        { title: 'Renewing every year', body: 'The state asks for a renewal each year. We text you before it’s due, and send it with your yes.' },
        { title: 'When something changes', body: 'If you move, your income changes or your spouse passes away, text us. We’ll tell you what it means and update it.' },
      ],
    },
    rules: {
      h2: 'How we work',
      items: [
        { title: 'Nothing goes out without your yes', body: 'We show you exactly what will be sent. You reply YES, or it doesn’t go.' },
        { title: 'Your fund doesn’t see your case', body: 'Your fund sees totals. It learns your name only if you agree, and only what it needs.' },
        { title: 'Free to you', body: 'Your fund pays us. You never pay, and we never take a cut of back pay.' },
        { title: 'A real person when it’s hard', body: 'When a case gets complicated, a person on our team takes over.' },
      ],
    },
    calc: {
      h2: 'Could New York pay your Part B premium?',
      lead: 'A quick estimate under New York’s 2026 rules. Nothing you type here leaves this page.',
      householdLabel: 'Who’s in your household?',
      householdOptions: [['1', 'Just me'], ['2', 'Me and my spouse']],
      medicareLabel: 'If married: how many of you have Medicare?',
      medicareOptions: [['1', 'One of us'], ['2', 'Both of us']],
      incomeLabel: 'Money that comes in each month',
      incomeHint: 'Social Security before Medicare is taken out, pensions and other income. Include your spouse’s.',
      wagesLabel: 'Pay from work each month',
      wagesHint: 'Before taxes. Leave it at 0 if nobody works.',
      premiumsLabel: 'Other health insurance premiums you pay each month',
      premiumsHint: 'Your union or retiree plan, Medigap, drug plan, dental or long-term care. Not Part B. New York subtracts these from your income.',
      fundLabel: 'Does your fund pay back your Part B premium?',
      fundOptions: [['0', 'No'], ['0.5', 'Half of it'], ['1', 'All of it']],
      partALabel: 'Do you have Medicare Part A (hospital)?',
      medicaidLabel: 'Do you have Medicaid?',
      yesNo: [['yes', 'Yes'], ['no', 'No']],
      noYes: [['no', 'No'], ['yes', 'Yes']],
      resultsTitle: 'Your estimate',
      premiumOne: '{premium} a month',
      premiumEach: '{premium} a month each',
      QMB: 'You likely qualify for QMB, the fullest help. New York would pay your Part B premium, {premiumText}, and your Medicare deductibles and coinsurance.',
      QI: 'You likely qualify for QI. New York would pay your Part B premium, {premiumText}.',
      over: 'You look about {over} a month over New York’s limit. If your income drops, check again, or text us and we’ll take a closer look.',
      needs_part_a: 'You need Medicare Part A first. If you’re 65 or older and don’t have it, New York’s Part A Buy-in can get you Part A and QMB together. Text us and we’ll help.',
      medicaid: 'Your income is in QI’s range and you have Medicaid. In New York you can’t have both, so you’d pick one. We can help you compare.',
      gain: 'Your check would go up about {month} a month, {year} a year.',
      gainNone: 'Your fund already pays your premium, so your check stays the same.',
      extraHelp: 'You’d also get Extra Help with prescriptions, automatically.',
      note: 'An estimate, not an approval. We count income the way New York does: $20 off, $65 plus half the rest off pay from work, and the health insurance premiums you pay. Savings and your home don’t count. If you pay court-ordered support, tell us; it may change the answer. New York makes the decision.',
      cta: 'Get a text from us',
      noScript: 'Turn on JavaScript to change the answers. The estimate shown is for the example answers.',
    },
    join: {
      h2: 'Get a text from us',
      lead: 'Leave your number and we’ll text you. In English or Spanish.',
    },
  },

  join: {
    phoneLabel: 'Your phone number',
    placeholder: 'Your phone number',
    submit: 'Text me',
    note: 'By sending, you agree to receive texts from Mycelium.',
    success: "Thanks. We'll text you at {phone}.",
    error: 'Enter a 10-digit US phone number.',
    generic: "We couldn't save your number. Please try again.",
  },

  footer: {
    tagline: 'The right payer, for union funds and their members',
    links: [
      { label: 'For schools', href: '/schools' },
      { label: 'For members', href: '/members' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Security and trust', href: '/security' },
    ],
  },

  // ── the homepage: for school districts ───────────────────────────────────────
  // One idea: funding and help a district is already owed wait on a family
  // signing, enrolling or getting to school. Mycelium does that work with each
  // family, with their yes, and the district pays per outcome. Sources:
  //   NYC Comptroller follow-up audit, July 2026 (Medicaid, FY2023–25)
  //   AASA/AESA/NAME district survey, Dec 2022, via K-12 Dive, Jan 2023 (consent)
  //   AEI 45-state analysis via K-12 Dive, 2025 (chronic absence)
  //   CDE 2025–26 P-2 Fingertip Facts and LCFF overview (LCFF grants)
  //   34 CFR 300.154(d) (one-time parental consent to bill Medicaid)
  // Everything else is marked as an example or an estimate.
  schools: {
    meta: {
      title: 'Mycelium: kids get the help, districts get the funding',
      description:
        'Medicaid for students with IEPs, the low-income count your funding formula uses, attendance: each waits on a family signing a form, enrolling or getting to school. Mycelium works with every family by text, in English or Spanish, with their yes. Districts pay a fixed fee per outcome.',
      shareAlt:
        'An example district’s monthly ledger from Mycelium: Medicaid consents returned, families newly counted, students back in class.',
    },

    nav: {
      outcomes: 'What we work on',
      how: 'How it works',
      funds: 'For union funds',
      join: 'Get a free scan',
    },

    hero: {
      eyebrow: 'For school districts and charter networks',
      h1Plain: 'Kids get the help.',
      h1Em: 'Your district gets the funding.',
      // The social card (share.html) draws the headline as one line of plain text.
      h1: 'Kids get the help. Your district gets the funding.',
      sub: 'Medicaid for students with IEPs, the low-income count your funding formula uses, attendance: each one waits on a family signing a form, enrolling in a program or getting to school. No office has the hours to do that with every family. Mycelium does, by text, in English or Spanish, and nothing is sent without the parent’s yes. You pay a fixed fee only for outcomes that happen.',
      primary: 'Get a free scan',
      secondary: 'See what we work on',
      trust: 'For districts and charter networks in California, New York and Illinois. Nothing if nothing changes.',
      ledger: {
        eyebrow: 'Monthly ledger',
        example: 'Example district',
        rows: [
          { v: '212', l: 'Medicaid consents returned', note: 'Students with IEPs. Therapy the district already provides, now billable.' },
          { v: '87', l: 'Families newly counted', note: 'Enrolled in CalFresh or Medi-Cal, then matched for the low-income count.' },
          { v: '64', l: 'Students back above 90% attendance', note: 'After a ride, a refill or a form was sorted out.' },
          { v: '130', l: 'Families deciding', note: 'They answered and are thinking it over. Nothing moves without a yes.' },
        ],
        foot: 'An example, not a client.',
      },
      // The social card's ledger. An example, not a client.
      folder: {
        label: 'Monthly ledger · Example district',
        // The card's status pills. The shared `statuses` are left alone: the
        // phone art's fingerprint covers them.
        statuses: { done: 'Done', waiting: 'Waiting for a yes' },
        rows: [
          { label: '212 consents returned', detail: 'Medicaid for services on students’ IEPs.', status: 'done' },
          { label: '87 families counted', detail: 'Enrolled in CalFresh or Medi-Cal and matched.', status: 'done' },
          { label: '64 students back in class', detail: 'Above 90% attendance for the term.', status: 'done' },
          { label: '130 families deciding', detail: 'They answered. Nothing moves without a yes.', status: 'waiting' },
        ],
      },
    },

    outcomes: {
      h2Plain: 'The money is there.',
      h2Em: 'The paperwork is in the way.',
      lead: 'Districts are owed funding for students they already serve. It arrives only when a family signs, enrolls or shows up, and the work to get there is a form, a call or a ride at a time. Your coordinators know how to do every one of them. Nobody has the hours to do them for every family. These are the outcomes we work on.',
      stats: {
        eyebrow: 'On the record',
        example: 'Public sources',
        rows: [
          { v: '$431.6M', l: 'Medicaid New York City schools didn’t claim, 2023–25', note: 'NYC Comptroller, 2026. About half of eligible therapy sessions were never billed.' },
          { v: '26–50%', l: 'Of Medicaid consent forms incomplete, for a third of districts surveyed', note: 'AASA, AESA and NAME, 2022.' },
          { v: '22.6%', l: 'Of US students chronically absent in 2025', note: 'AEI, 45 states. It was 15.4% in 2019.' },
          { v: '$14.66B', l: 'California’s LCFF supplemental and concentration grants, 2025–26', note: 'CDE. They follow every student counted as low-income, an English learner or in foster care.' },
        ],
      },
      caption: 'The outcomes Mycelium works on, what is in the way, and who gains',
      head: ['Outcome', 'What’s in the way', 'What the district gets', 'What the family gets'],
      rows: [
        {
          outcome: 'Medicaid for students with IEPs',
          blocked: 'A parent’s one-time consent, a Medicaid number on file',
          district: 'Reimbursement for therapy and services it already provides',
          family: 'The same services. Consent changes nothing the child receives and can be withdrawn.',
        },
        {
          outcome: 'The low-income count',
          blocked: 'Families eligible for SNAP or Medicaid (CalFresh or Medi-Cal in California) who never enrolled, or never got matched',
          district: 'Formula funding for each student counted: LCFF in California, Foundation Aid in New York, Evidence-Based Funding in Illinois',
          family: 'Food benefits, health coverage and free school meals',
        },
        {
          outcome: 'Attendance',
          blocked: 'A ride, a health form, coverage that lapsed, a move',
          district: 'Days of learning, and attendance-based funding in California and Texas',
          family: 'A kid back in class',
        },
        {
          outcome: 'Students without stable housing',
          blocked: 'Families who don’t know that staying with relatives can count under McKinney-Vento',
          district: 'The right students identified, and the support the law requires reaching them',
          family: 'A ride to the same school, free meals, and enrollment without the usual papers',
        },
      ],
      note: 'Medicaid: NYC Comptroller follow-up audit, July 2026. Consent: district survey by AASA, AESA and NAME, reported by K-12 Dive, 2023. Under IDEA, a district needs a parent’s one-time written consent before it first bills Medicaid for a child’s services (34 CFR 300.154). Chronic absence: AEI, reported by K-12 Dive, 2025. LCFF: California Department of Education, 2025–26.',
    },

    example: {
      h2Plain: 'One family,',
      h2Em: 'counted right.',
      lead: 'In a California district where more than 55% of students are low-income, a family that enrolls in CalFresh or Medi-Cal is matched by the state, and their student counts for LCFF. The family gets help with groceries and health coverage. The district gets funding it was already meant to have.',
      brief: {
        eyebrow: 'What one match is worth',
        example: 'California, estimate',
        rows: [
          { v: '~$9,750', l: 'A year to the district, once it phases in', note: 'Supplemental (20%) plus concentration (65%) grants on an average base of $11,465. The count averages three years, so it builds up.' },
          { v: 'Yearly', l: 'The student is matched again', note: 'While the family stays enrolled. No meal form to chase.' },
          { v: '$0', l: 'What the family pays us', note: 'Districts pay. Families never do.' },
          { v: 'Fixed', l: 'Our fee for the outcome, agreed up front', note: 'Nothing if the family doesn’t enroll.' },
        ],
        foot: 'Estimates from public rates. The free scan replaces them with your district’s numbers.',
      },
    },

    steps: {
      h2Plain: 'Every family, followed through.',
      h2Em: 'Nothing moves without a yes.',
      lead: 'Mycelium keeps a live record of where each family stands on each outcome: likely eligible, contacted, agreed, filed, confirmed. It moves a family forward only when it’s sure. When it isn’t, a person on your team or ours decides.',
      items: [
        { tag: 'Map', text: 'We read how your district is funded and where outcomes stall: your state’s formula, your Medicaid claiming, your enrollment and attendance data.' },
        { tag: 'Find', text: 'Names in: the students whose families are likely eligible, missing a consent or slipping on attendance.' },
        { tag: 'Reach', text: 'Your district sends one message with our number. Families text back in English or Spanish, at any hour.' },
        { tag: 'Yes', text: 'Nothing is signed or filed until the parent replies YES to exactly what will happen.' },
        { tag: 'Confirm', text: 'We follow each case to the result: the consent on file, the approval, the match, the student back in class.' },
        { tag: 'Report', text: 'Outcomes out: a monthly ledger by school of what changed and what it’s worth, with the hard cases handed to your coordinators.' },
      ],
    },

    different: {
      h2Plain: 'Why this isn’t done',
      h2Em: 'already.',
      items: [
        { title: 'Each case is small. There are thousands.', body: 'A form, a call, a ride. Your staff know how to do every one. Nobody has the hours to do them for every family, every month.' },
        { title: 'The work sits outside the school', body: 'Food benefits, health coverage and transit run through county and state offices. We work with families across all of them.' },
        { title: 'Only the family can sign', body: 'No data match can enroll anyone or give consent. We get it done with the parent, from a message they trust because it came from their school.' },
        { title: 'You pay for results', body: 'A fixed fee per outcome, agreed up front. Nothing for outreach, nothing for families who say no.' },
      ],
    },

    never: {
      h2: 'What we never do',
      items: [
        { title: 'Act without a yes', body: 'Nothing is sent, signed or filed until a parent replies YES to exactly what will happen.' },
        { title: 'Share a family’s case', body: 'The district sees outcomes and totals. It learns more only when the family agrees, and only what it needs.' },
        { title: 'Touch a student’s education', body: 'We never change an IEP, a placement, a grade or a service.' },
        { title: 'Charge families', body: 'Families never pay us. We sign your state’s student data privacy agreement before we see a single record.' },
      ],
    },

    scan: {
      h2Plain: 'Start with a free scan',
      h2Em: 'of your own data.',
      lead: 'In 30 days we show you, in dollars, what’s waiting on families in your district, outcome by outcome, and how many students are behind each number.',
      cards: [
        { title: 'What you get', body: 'For each outcome: how many students are likely affected, what it’s worth a year, and which schools have the most. No names leave the district unless you ask.' },
        { title: 'What you give', body: 'A de-identified student file under your data privacy agreement, and one contact in your district office.' },
        { title: 'What it costs', body: 'Nothing. If you want families reached, you send one message and pay only for outcomes.' },
      ],
      dataLabel: 'What we ask for',
      data: [
        'Grade, school and home language',
        'IEP status and the services on each IEP',
        'Medicaid and free-meal status, and how it was determined',
        'Days enrolled and days absent',
      ],
      neverLabel: 'What we never need',
      never: ['Social Security numbers', 'Health records', 'Grades or discipline records'],
      estimate: 'For a California district above the 55% line, every 100 students newly counted is worth about $975,000 a year once it phases in. The scan replaces that with your number.',
    },

    pilot: {
      h2: 'Start with one outcome at a few schools',
      lead: 'Pick the outcome that matters most and a few schools. You send one message. We reach families, follow every case through and report every month.',
      feesHead: ['What', 'Our fee'],
      fees: [
        ['A Medicaid consent returned for a student with an IEP', 'A fixed fee, agreed up front'],
        ['A family newly enrolled and counted', 'A fixed fee, agreed up front'],
        ['A chronically absent student back above 90% for a full term', 'A fixed fee, agreed up front'],
        ['A family that doesn’t answer, isn’t eligible or says no', 'Nothing'],
      ],
      measuresLabel: 'What we report every month',
      measures: [
        'Families reached, in which language, and how many answered',
        'Consents returned, enrollments approved and students matched',
        'Attendance for the students we worked with',
        'Estimated funding gained, by school',
      ],
      guardrail: 'If nothing changes, the pilot costs the district nothing.',
    },

    form: {
      h2: 'Request a free scan',
      lead: 'Tell us about your district. We’ll reply within two business days with the data agreement and the data list.',
      nameLabel: 'Your name',
      roleLabel: 'Your role',
      fundLabel: 'District or network',
      emailLabel: 'Work email',
      messageLabel: 'How many students, in which state, and which outcome matters most to you?',
      messageHint: '(optional)',
      submit: 'Send',
      note: "We'll use these details to reply. Please don't include student records.",
      success: "Your request is saved. We'll reply to the email you gave us.",
      error: "We couldn't save your request. Please try again.",
      generic: 'Please fill in every field.',
    },

    fundsBand: {
      h2: 'Run a union benefit fund?',
      body: 'Mycelium also helps funds stop paying Medicare Part B premiums that New York would pay, with each retiree’s yes.',
      link: 'For union funds',
    },

    footer: {
      tagline: 'Help for families, funding for the schools that serve them',
      links: [
        { label: 'For union funds', href: '/funds' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'Security and trust', href: '/security' },
      ],
    },
  },

  // ── the homepage: one school day, dawn to night ──────────────────────────────
  // Stranded alignment in plain words, told as a school day. Every phone is a
  // fictional family and school, marked as an example. Sources:
  //   Oakland: EdSource 2025. LCFF: CDE 2025–26. NYC Medicaid: NYC Comptroller 2026.
  //   Case manager loads: NIJ-funded study (ojp.gov/pdffiles1/nij/grants/304457.pdf).
  //   FAFSA help: Bettinger, Long, Oreopoulos and Sanbonmatsu, via J-PAL.
  //   Medicaid consent: 34 CFR 300.154. SNAP decisions within 30 days: 7 CFR 273.2(g).
  home: {
    meta: {
      title: 'Mycelium: when families do better, schools do too',
      description:
        'Every day a student misses, a school loses funding. Every family that never enrolls in food assistance or Medicaid is a student the school isn’t paid for. Mycelium gives every family a helper, sponsored by their school: an AI agent that works for them, by text, in their language. Families get what they qualify for. Schools get paid when the outcome lands.',
      shareAlt: 'Mycelium: when families do better, schools do too.',
    },

    nav: {
      why: 'Why it’s stuck',
      how: 'How it works',
      schools: 'Schools',
      funds: 'Union funds',
      join: 'Talk to us',
    },

    hero: {
      chip: { time: '7:15 AM', label: 'A school day' },
      agents: [
        'Sales teams have agents.',
        'Hedge funds have agents.',
        'Lawyers have agents.',
        'Recruiters have agents.',
        'Support desks have agents.',
        'Startups have agents.',
      ],
      agentsLast: 'Families have',
      agentsStrike: 'a stack of forms.',
      h1Plain: 'When families do better,',
      h1Em: 'schools do too.',
      // The social card (share.html) draws the headline as one line of plain text.
      h1: 'When families do better, schools do too.',
      sub: 'Every day a student misses, the school loses funding. Every family that never enrolls in food assistance or Medicaid is a student the school isn’t paid for. Mycelium gives every family a helper, sponsored by their school: an AI agent that works for them, by text, in their language. Families get what they qualify for. Schools get paid when the outcome lands.',
      primary: 'Talk to us',
      secondary: 'Follow one school day',
      trust: 'Nothing goes out without the family’s yes. In English or Spanish.',
      // The social card's ledger.
      folder: {
        label: 'Lincoln Elementary, today · Example',
        statuses: { done: 'Done', waiting: 'Waiting for a yes' },
        rows: [
          { label: 'Maya’s Medi-Cal renewed', detail: 'The renewal had gone to an old address.', status: 'done' },
          { label: 'A transit pass', detail: 'For the mornings the bus doesn’t come.', status: 'done' },
          { label: 'Leo’s Medicaid consent', detail: 'Speech therapy the school can now bill.', status: 'done' },
          { label: 'CalFresh application', detail: 'Submitted. The county decides in 30 days.', status: 'waiting' },
        ],
      },
    },

    phoneAltPrefix: 'Example text conversation with Mycelium, a family’s helper.',
    phoneYou: 'Parent',
    caption: 'Example conversations. Fictional school and family.',

    // The phones (scripts/build-phone.mjs renders each one, on a GitHub runner). 0 is the hero,
    // 1-4 the midday carousel, 5 the dinner-time thread. A thread has to be
    // long enough to fill the screen; the build fails if one is short.
    phones: [
      {
        meta: 'Today',
        time: '7:15 AM',
        turns: [
          { in: 'Hi, it’s Mycelium, Lincoln Elementary’s family helper. Maya has missed a few mornings. Is anything making school harder? Rides, forms, health coverage, anything.' },
          { out: 'Her inhaler ran out and the pharmacy says her Medi-Cal isn’t active' },
          { in: 'That usually means the renewal went to an old address. What’s your address now?' },
          { out: '88 Pine Ave apt 3. We moved' },
          { in: 'Thanks. The renewal is filled in. Reply YES and I’ll send it to the county.' },
          { out: 'YES' },
          { in: 'Sent. I’ll text you the day it’s active so you can pick up her inhaler.' },
        ],
      },
      {
        meta: 'Tuesday',
        time: '7:02 AM',
        turns: [
          { out: 'Bus didn’t come again. Maya is going to be late' },
          { in: 'Sorry. Route 12 has run late all week. Your family qualifies for a free student transit pass, good on the 7:10 city bus from Pine and 3rd.' },
          { in: 'I filled in the pass application. Reply YES and I’ll send it to the district.' },
          { out: 'YES' },
          { in: 'Sent. The pass comes in the mail this week.' },
          { in: 'Want me to tell the front office Maya is on her way?' },
          { out: 'Yes please' },
          { in: 'Done. They marked her as running late, not absent.' },
          { out: 'Thank you' },
          { in: 'Of course. I’ll check Friday that the pass came.' },
        ],
      },
      {
        meta: 'Thursday',
        time: '9:10 AM',
        turns: [
          { in: 'Good news: the county renewed Maya’s Medi-Cal. It’s active again as of today.' },
          { out: 'Omg finally' },
          { in: 'The pharmacy on 3rd can fill her inhaler this afternoon. Want me to call and ask them to have it ready?' },
          { out: 'Yes please' },
          { in: 'Done. It’ll be ready after 2.' },
          { in: 'Medi-Cal renews every year. I’ll text you before the next one so it doesn’t lapse again.' },
          { out: 'You’re a lifesaver' },
          { in: 'If her asthma keeps her home again, tell me. I can let the school know and get you a doctor’s note.' },
          { out: 'Ok will do' },
          { in: 'I’ll check in Monday to see how she’s feeling.' },
        ],
      },
      {
        meta: 'Thursday',
        time: '12:10 PM',
        turns: [
          { in: 'One more thing. With your new rent, your family likely qualifies for CalFresh: money for groceries every month. It also means free school meals for Maya and Leo, with no form.' },
          { out: 'How long does it take' },
          { in: 'About eight minutes, by text. I already have your address and income from the renewal.' },
          { out: 'ok lets do it' },
          { in: 'Three questions. How many people live with you, counting you?' },
          { out: '4. me, my mom, Maya and Leo' },
          { in: 'Thanks. I filled in the application. Reply YES and I’ll submit it to the county.' },
          { out: 'YES' },
          { in: 'Submitted. The county has 30 days to decide, and I’ll keep an eye on it.' },
        ],
      },
      {
        meta: 'Friday',
        time: '3:20 PM',
        turns: [
          { in: 'Leo’s school can bill Medi-Cal for the speech therapy he already gets. They need your OK once.' },
          { in: 'It doesn’t change his therapy, it never costs you anything, and you can take it back anytime.' },
          { out: 'Does it use up his benefits?' },
          { in: 'No. By law it can’t reduce his coverage or raise what you pay.' },
          { out: 'ok then sure' },
          { in: 'Here’s the consent, filled in with Leo’s details. Reply YES to sign it and I’ll send it to the school.' },
          { out: 'YES' },
          { in: 'Signed and sent. The school confirmed they have it.' },
          { out: 'That was easy' },
          { in: 'That’s the idea.' },
        ],
      },
      {
        meta: 'Today',
        time: '6:30 PM',
        turns: [
          { out: 'Random question. My landlord says rent goes up $200 in January. Is there any help for that?' },
          { in: 'There might be. Your county runs a rental assistance program, and with four people at your income you’re likely under its limit.' },
          { in: 'I can check the details and fill in the application with you this weekend. Want me to?' },
          { out: 'Yes. Does the school see this?' },
          { in: 'No. The school only sees what it asked about, like whether Maya is getting to school. This stays between us unless you say otherwise.' },
          { out: 'ok good' },
          { in: 'Saturday morning, then. Have your lease handy.' },
          { out: 'Will do. Goodnight' },
        ],
      },
    ],

    // 8:30 AM
    depend: {
      chip: { time: '8:30 AM', label: 'First bell' },
      h2Plain: 'Every empty seat',
      h2Em: 'is money.',
      lead: 'Attendance gets taken, and in California and Texas, schools are paid by the day. A family that never enrolls in the programs it qualifies for is a student the school isn’t paid for. What a school is funded for reaches deep into family life. What its staff can do stops at the classroom door.',
      caption: 'How a family’s outcome changes a school’s money, and where it gets stuck',
      head: ['When this happens for a family', 'What it means for the school’s budget', 'Where it gets stuck'],
      rows: [
        { life: 'A kid gets to school', money: 'Schools in California and Texas are funded by daily attendance. Oakland lost about $90 for every absent student, every day.', stuck: 'A ride that didn’t come, an inhaler that ran out' },
        { life: 'A family enrolls in food assistance or Medicaid', money: 'The student is counted as low-income, and the school gets more per student. In a high-poverty California district, up to about $9,750 a year.', stuck: 'A form nobody explained, in a language nobody spoke' },
        { life: 'A parent signs the Medicaid consent for their child’s therapy', money: 'The school can bill Medicaid for services it already provides. New York City left $431.6 million unclaimed in three years.', stuck: 'A form that went home in a backpack' },
      ],
      note: 'Oakland: EdSource, 2025. California LCFF supplemental and concentration grants, CDE 2025–26; the count averages three years, so it phases in. New York City: NYC Comptroller follow-up audit, 2026.',
    },

    // 10:15 AM
    why: {
      chip: { time: '10:15 AM', label: 'The front office' },
      h2Plain: 'Everyone wants the kid in school.',
      h2Em: 'It’s nobody’s job.',
      lead: 'The parent wants it. The teacher wants it. The school is paid for it. We call this stranded alignment: outcomes a school and its families both want, that never happen because reaching them costs more than anyone can spend. Each case is small and sits between offices. A typical school case manager carries 110 to 125 students.',
      cards: [
        { title: 'Letters home', body: 'Tell families what to do. They reach everyone and change little, because information alone rarely moves anyone.' },
        { title: 'Coordinators and case managers', body: 'Do the work with families, and it works. But one person can only carry so many.' },
        { title: 'A helper for every family', body: 'Does the work with each family, as often as it takes, for every student. That’s new.' },
      ],
      changed: 'What changed: in one experiment, eight minutes of help filling out the federal student aid form raised college enrollment from 34% to 42%. Information alone did nothing. An AI agent can now spend those eight minutes with every family.',
      note: 'Case manager loads: a study funded by the National Institute of Justice. Student aid form: the H&R Block experiment by Bettinger, Long, Oreopoulos and Sanbonmatsu, summarized by J-PAL.',
    },

    // 12:10 PM
    week: {
      chip: { time: '12:10 PM', label: 'Midday' },
      h2Plain: 'It works with every family.',
      h2Em: 'All week.',
      lead: 'Rides, renewals, applications, consents. Each one is small. Each one is something the family needed, and something the school is paid for.',
      prev: 'Previous',
      next: 'Next',
      trackLabel: 'A family’s week, one conversation at a time',
      cards: [
        { title: 'A way to school', money: 'A day attended instead of a day lost.' },
        { title: 'Coverage, renewed', money: 'An inhaler refilled, and fewer sick days.' },
        { title: 'Food help, in eight minutes', money: 'Groceries for the family. A student the school now counts.' },
        { title: 'A consent, signed once', money: 'Therapy the school already gives, now billable.' },
      ],
    },

    // 3:40 PM
    school: {
      chip: { time: '3:40 PM', label: 'After the bell' },
      h2Plain: 'Names in.',
      h2Em: 'Outcomes out.',
      lead: 'Mycelium works inside the school too. It learns your goals, rules and funding from your staff, and connects to the systems you already use. Your records show who could use help. You see the results you pay for, never the eviction notice or the sick grandparent.',
      steps: [
        { tag: '01 · Learn', text: 'Your goals, rules and funding, from your staff' },
        { tag: '02 · Offer', text: 'One message from the school: here’s a helper for your family' },
        { tag: '03 · Help', text: 'By text, in their language, with every office around them' },
        { tag: '04 · Report', text: 'What changed and what it’s worth. Hard cases go to your staff' },
      ],
      ledger: {
        eyebrow: 'Lincoln Elementary, this month',
        example: 'An example',
        rows: [
          { v: '212', l: 'Medicaid consents returned', note: 'Therapy the school already provides, now billable.' },
          { v: '87', l: 'Families newly counted', note: 'Enrolled in CalFresh or Medi-Cal, then matched.' },
          { v: '64', l: 'Students back above 90% attendance', note: 'Days the school is funded for again.' },
          { v: '40', l: 'Families lost the same bus stop', note: 'One family’s problem is a case. Forty is a policy decision.' },
        ],
        foot: 'You pay a fixed fee for each outcome, agreed up front. Nothing for families who say no.',
      },
    },

    // 6:30 PM
    helper: {
      chip: { time: '6:30 PM', label: 'Dinner' },
      h2Plain: 'The helper belongs to the family.',
      h2Em: 'The school sponsors it.',
      lead: 'It works for the family, on anything making life harder, and on the school’s goals only where the family agrees. Personal AI would otherwise reach families the way financial advisors did: the ones with the most friction last. Schools have what it takes to change that.',
      items: [
        { title: 'A reason to pay', body: 'The school loses money when these outcomes don’t happen' },
        { title: 'The records', body: 'It can see who needs help before they ask' },
        { title: 'Trust', body: 'Families already read what the school sends' },
        { title: 'Permission', body: 'Offices turn away agents that show up uninvited. The one the school sponsors gets let in' },
      ],
      closer: 'When the health plan or the county serves the same family, they can sponsor the same helper. One helper instead of seven portals.',
    },

    // 9:40 PM
    night: {
      chip: { time: '9:40 PM', label: 'Kids are asleep' },
      h2Plain: 'Everything’s',
      h2Em: 'handled.',
      lead: 'Instead of a stack of letters home and a list of families nobody reached, one summary: what got done, what the school is paid for, and what’s still waiting on a yes.',
      sumLabel: 'Lincoln Elementary, today',
      doneLabel: 'Done',
      waitingLabel: 'Waiting',
      summary: [
        { done: true, title: 'Maya’s Medi-Cal renewed', detail: 'County approved · inhaler filled' },
        { done: true, title: 'A transit pass for Maya', detail: 'Marked late, not absent' },
        { done: true, title: 'Leo’s Medicaid consent', detail: 'Signed · the school can bill his therapy' },
        { done: false, title: 'CalFresh for the family', detail: 'Submitted · the county decides in 30 days' },
      ],
      securityLink: 'Read every limit, in plain words',
      privacyLink: 'How we handle information',
      joinPlain: 'Tomorrow,',
      joinEm: 'start with one outcome.',
      joinLead: 'Tell us what you’re measured on. We’ll look at your data for free, show you what’s stranded, and start with one outcome at a few schools. You pay when it moves.',
    },

    rules: [
      { title: 'Their yes sends it.', body: 'Nothing is filed, signed or shared until the family says yes to exactly what will happen.' },
      { title: 'Only outcomes good for both.', body: 'The school picks the outcome. We take it on only if it’s good for the family too.' },
      { title: 'Names in, outcomes out.', body: 'The school sees results, not lives. It learns more only when the family agrees.' },
    ],

    where: {
      h2: 'Where we work',
      lead: 'Schools first. The same gap shows up wherever an institution’s money depends on its people’s lives.',
      cards: [
        { title: 'Schools', body: 'Attendance, Medicaid consent for students with IEPs, food and health enrollment that counts toward your funding, students without stable housing.', link: 'For schools', href: '/schools' },
        { title: 'Union benefit funds', body: 'Medicare Part B premiums New York would pay, enrolled with each retiree’s yes and renewed every year.', link: 'For union funds', href: '/funds' },
        { title: 'Your outcome', body: 'If your money depends on the people you serve, tell us which outcome.', link: 'Talk to us', href: '#school-contact' },
      ],
    },

    form: {
      h2: 'Talk to us',
      lead: 'Tell us who you serve and what you’re measured on. We’ll reply within two business days.',
      nameLabel: 'Your name',
      roleLabel: 'Your role',
      fundLabel: 'School, district or organization',
      emailLabel: 'Work email',
      messageLabel: 'Which outcome matters most to you?',
      messageHint: '(optional)',
      submit: 'Send',
      note: "We'll use these details to reply. Please don't include anyone's personal records.",
      success: "Thanks. We'll reply to the email you gave us.",
      error: "We couldn't save your message. Please try again.",
      generic: 'Please fill in every field.',
    },

    footer: {
      tagline: 'When families do better, schools do too',
      links: [
        { label: 'For schools', href: '/schools' },
        { label: 'For union funds', href: '/funds' },
        { label: 'Privacy', href: '/privacy' },
        { label: 'Security and trust', href: '/security' },
      ],
    },
  },
};
