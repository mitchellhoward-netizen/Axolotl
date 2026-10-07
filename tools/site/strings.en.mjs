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
      { label: 'For members', href: '/members' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Security and trust', href: '/security' },
    ],
  },
};
