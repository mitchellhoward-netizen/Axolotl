/**
 * Every word on the English site, in one place.
 *
 * The build (tools/site/build.mjs) renders this into public/index.html,
 * public/members.html and public/employers.html. strings.es.mjs is the same
 * shape, so the two languages cannot drift apart structurally: if a key is
 * missing, the build fails.
 *
 * The thesis the site carries (docs/FUNDS-MONEY-MAP.md): a union benefit fund
 * pays bills that Medicare, Social Security or the state should pay, and in
 * almost every one of those cases the member is losing money too. Axolotl gets
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
    title: 'Axolotl: Part B premiums the state would pay',
    description:
      'Many retirees on a fund’s Part B reimbursement qualify for New York’s Medicare Savings Program, which pays the whole premium. Most never apply. Axolotl finds them in the fund’s files, enrolls them by text with their yes, and renews it every year. Retirees keep more each month. The fund stops paying. Paid from the savings.',
    shareAlt:
      'A fund’s monthly ledger from Axolotl: retirees approved for a Medicare Savings Program, renewals sent, applications waiting on the state.',
  },

  a11y: {
    skip: 'Skip to content',
    home: 'Axolotl home',
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
    sub: 'Many retirees on your Part B reimbursement qualify for New York’s Medicare Savings Program, which pays the whole premium. Most never apply. Axolotl finds them in your files, enrolls them by text with their yes, and renews it every year. They keep about $100 more a month. Your fund stops paying. You pay a share of what you save.',
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
      alt: 'Text thread on a phone. A retiree asks if the fund’s letter about Part B is real. Axolotl says New York pays the whole Part B premium under $2,494 a month and asks whether it is just her and what comes in before Medicare is taken out. She has $2,050 alone, so she qualifies: the state would pay all $202.90, the fund’s half stops, and she keeps about $101 more a month plus Extra Help with prescriptions. Axolotl has filled in the application and will handle the yearly renewal; she replies YES, it is sent, and Axolotl will text when the state confirms.',
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
      contact: 'Axolotl',
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
      alt: 'Text conversation on a phone, six weeks after applying. Axolotl tells a retiree that New York approved her and Social Security stops taking $202.90 out of her check in May. She asks if her check goes up; yes, and the fund’s half stops the same month, so she comes out about $101 a month ahead, and she gets Extra Help on prescriptions. Axolotl says the benefit renews every year and it will text her in the fall; she agrees, and Axolotl asks her to text if her income or address changes.',
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
    lead: 'Axolotl keeps a live record of where each retiree on your reimbursement stands: watching, likely eligible, contacted, agreed, filed, approved, up for renewal. It reads what changed in your files and in the rules, and moves a retiree forward only when it’s sure. When it isn’t, a person decides.',
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
    estimate: 'Our estimate for a fund with 50,000 retirees on a 50% Part B reimbursement and modest pensions: roughly $3–9 million a year in premiums the state would pay. The scan replaces it with your number.',
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
      title: 'Axolotl for members',
      description: 'Your benefit fund works with Axolotl to help retirees get New York to pay their Medicare Part B premium. You text, we fill in the forms, and nothing is sent without your yes. Free to you.',
      shareAlt: 'A fund’s monthly ledger from Axolotl.',
    },
    hero: {
      eyebrow: 'For union retirees',
      h1Plain: 'Your fund sent you here.',
      h1Em: 'Here’s who we are.',
      sub: 'Axolotl works with your benefit fund to help retirees get New York State to pay their Medicare Part B premium, $202.90 a month in 2026. You text. We fill in the forms. Nothing is sent without your yes. It’s free to you.',
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
    join: {
      h2: 'Get a text from us',
      lead: 'Leave your number and we’ll text you. In English or Spanish.',
    },
  },

  join: {
    phoneLabel: 'Your phone number',
    placeholder: 'Your phone number',
    submit: 'Text me',
    note: 'By sending, you agree to receive texts from Axolotl.',
    success: "Thanks. We'll text you at {phone}.",
    error: 'Enter a 10-digit US phone number.',
    generic: "We couldn't save your number. Please try again.",
  },

  footer: {
    tagline: 'The right payer, for union funds and their members',
    links: [
      { label: 'For members', href: '/members' },
      { label: 'For employers', href: '/employers' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Security and trust', href: '/security' },
    ],
  },

  // ── /employers ──────────────────────────────────────────────────────────────
  employers: {
    meta: {
      title: 'Axolotl for employers',
      description:
        'Axolotl is one confidential number your hourly workers text for everything they are owed: the benefits they don’t use, a parent’s care, leave paperwork and public programs. Fewer missed shifts, priced like an EAP, and you see totals, never cases.',
      shareAlt: 'A manila folder of family tasks with a Confirmed stamp on the first row.',
    },
    hero: {
      eyebrow: 'For HR and benefits leaders',
      h1Plain: 'Your people are owed a lot.',
      h1Em: 'Most of it goes unused.',
      sub: 'Axolotl is one confidential number every worker texts. It finds what they’re owed from your benefits and from public programs, does the paperwork, and handles the family crisis before it costs a shift. A real person steps in when it’s hard. Priced like an EAP.',
      primary: 'Talk to us about a pilot',
      secondary: 'See where the shifts go',
    },
    office: {
      h2Plain: 'The shifts you lose',
      h2Em: 'to life at home.',
      lead: 'Employees who care for a family member miss about 6.6 workdays a year, and more than half have had to start late or leave early. Most of them are paid by the hour. It shows up as call-outs, short shifts and quits, and almost none of it reaches HR as a reason.',
      head: ['Today', 'With Axolotl', 'What it saves'],
      rows: [
        {
          pain: 'A parent’s aide cancels before a 7 AM shift',
          does: 'Axolotl finds care the worker is already covered for and, on their yes, asks a coworker to swap. The manager approves.',
          who: 'A call-out',
        },
        {
          pain: 'Benefits nobody uses',
          does: 'It tells each worker what they already have, like the EAP, backup care or leave, at the moment they need it, and books it.',
          who: 'Money you already spend',
        },
        {
          pain: 'Leave paperwork stuck for weeks',
          does: 'The leave form, the doctor’s part and the state paid leave claim go in complete.',
          who: 'HR time, a worker’s pay',
        },
        {
          pain: 'A parent’s Medi-Cal or Medicare renewal',
          does: 'Filled in from a photo of the letter and sent on the worker’s yes.',
          who: 'A day off at the county office',
        },
        {
          pain: 'The same benefits question forty times',
          does: 'Answered from your own benefits guide, in English or Spanish. HR never sees it.',
          who: 'HR time',
        },
        {
          pain: 'A parent who now needs care every day',
          does: 'It checks whether the family qualifies for paid caregiving or an adult day program, and applies.',
          who: 'A resignation',
        },
        {
          pain: 'Workers afraid to ask',
          does: 'It’s confidential. You see totals, never names or reasons.',
          who: 'Trust',
        },
        {
          pain: 'A portal nobody opens',
          does: 'It’s a text thread. No app, no login.',
          who: 'Usage',
        },
      ],
    },
    door: {
      h2Plain: 'Same worker, same crisis.',
      h2Em: 'Two very different mornings.',
      lead: 'A nursing assistant’s mother needs help at home. With a phone list, she spends a week of breaks on hold. Through Axolotl, it’s handled before her shift.',
      example: 'Example',
      before: {
        label: 'With an EAP phone list',
        to: 'To: Rosa Reyes, nursing assistant',
        subject: 'Your Employee Assistance Program: elder care resources',
        body: 'Thank you for contacting your EAP. Below is a list of elder care resources in your area. Please contact each provider directly to check availability, eligibility and cost. For Medi-Cal questions, please contact your county office. Office hours are Monday to Friday, 8 AM to 5 PM…',
        foot: ['14 phone numbers', 'Office hours only', 'English only', 'She does the work'],
      },
      after: {
        label: 'Through Axolotl',
        to: 'To: Rosa, by text',
        rows: [
          ['Booked', 'An aide for her mother at 6:45 AM, covered by backup care'],
          ['Shift', 'Swapped with Dana on Rosa’s yes, manager approved'],
          ['Applied', 'Paid caregiving (IHSS), with the county'],
          ['Next', 'Counseling Tuesday at 6 PM, in Spanish'],
          ['Rosa prefers', 'Text, in Spanish, after her shift'],
        ],
        sent: 'Each step sent on Rosa’s yes · 5:52 AM',
        foot: ['One text thread', 'Before her shift', 'Done, not referred'],
      },
      tensionTitle: 'More people will use it. That’s the point.',
      tensionBody:
        'An EAP stays cheap because almost nobody uses it. Axolotl is built to be used: software does the paperwork and a small team of care guides handles the hard parts, so it stays affordable when your people actually ask for help.',
    },
    attendance: {
      h2Plain: 'Fewer call-outs,',
      h2Em: 'one family at a time.',
      lead: 'A benefits portal does not fix call-outs. Getting the right help at 5:40 AM, before the shift, can.',
      items: [
        {
          h: 'The 5:40 AM problem.',
          p: 'An aide cancels or a kid wakes up sick. Axolotl finds covered care and, on the worker’s yes, asks the people they already trade shifts with.',
        },
        {
          h: 'The paperwork day.',
          p: 'The day off to sit at the county or chase a form becomes a text and a yes.',
        },
        {
          h: 'The slow slide.',
          p: 'A parent getting worse means weeks of short shifts. A care guide helps the family plan before it becomes a resignation.',
        },
        {
          h: 'The help they already have.',
          p: 'Backup care, the EAP, paid leave: used when it matters, because someone tells them at the right moment.',
        },
      ],
      research:
        'Employees who care for a family member miss about 6.6 workdays a year, and 53% have had to start late or leave early (Rosalynn Carter Institute, Invisible Overtime, 2022). Axolotl is built to win those days back.',
      threadLabel: 'A worker, on a Sunday evening',
      thread: [
        {
          from: 'axolotl',
          text: 'Quick check-in: your mom’s renewal went through and her aide is set for the week. Anything coming up?',
        },
        { from: 'parent', text: 'I work Saturday and nobody can be with her.' },
        {
          from: 'axolotl',
          text: 'Marisol said she’s free Saturdays. Want me to ask her? Your backup care also covers an aide if she can’t.',
        },
        { from: 'parent', text: 'Yes to both.' },
      ],
    },
    flywheel: {
      h2Plain: 'It gets cheaper',
      h2Em: 'every week.',
      lead: 'Every case a care guide solves becomes a path the AI follows next time.',
      steps: [
        { tag: 'A worker texts a need', text: 'In their language, at 10 PM, after a shift.' },
        { tag: 'Axolotl does what it knows', text: 'Forms, bookings and follow-ups, on the worker’s yes.' },
        { tag: 'A care guide handles the rest', text: 'The calls, the judgment and the hard conversations.' },
        { tag: 'What worked becomes a path', text: 'Which office, which form, how long it took. Never anyone’s personal details.' },
        { tag: 'The next family gets it faster', text: 'Less human time per case, so it stays affordable as more people use it.' },
        { tag: 'Your brief shows where people get stuck', text: 'Patterns, never people, so you can fix a confusing benefit at the source.' },
      ],
      example: {
        label: 'Example · a parent’s Medi-Cal renewal',
        beforeLabel: 'Care guide steps the first time',
        before: 5,
        afterLabel: 'Once it’s a path',
        after: 1,
      },
      note: 'Across your workforce, the paths add up to a map of how your benefits and your local programs actually work. Your team can see it and fix what is confusing.',
    },
    paths: {
      h2Plain: 'Your benefits,',
      h2Em: 'finally used.',
      lead: 'Connect your benefits guide and Axolotl knows exactly what each worker has: the EAP, backup care, leave and the health plan. It routes people to them, books them, and tells them what they’re missing.',
      steps: [
        { tag: 'Learned', text: 'Axolotl reads your benefits guide and your vendors’ contacts.' },
        { tag: 'Approved', text: 'Your benefits team reviews how each one is explained, in plain words.' },
        { tag: 'Used', text: 'Every worker hears about the right benefit at the moment it matters, in their language.' },
      ],
      card: {
        eyebrow: 'Example · Valley Medical',
        version: 'Path v3',
        title: 'Book backup care for a parent',
        doLabel: 'The worker sends',
        doText: '“Mom’s aide cancelled.” That’s it.',
        happensLabel: 'Axolotl does',
        happensText: 'Checks the backup care benefit, books the earliest aide, and confirms with the worker.',
        stats: [
          { v: '48', l: 'workers used it' },
          { v: '22 min', l: 'typical time to book' },
          { v: '0', l: 'calls to HR' },
        ],
        neverLabel: 'Never shares:',
        neverText: 'who used it, or why. HR sees totals only.',
        stamp: { top: 'Approved', name: ['Benefits', 'team'], date: 'Aug 2026' },
        stampAlt: 'Approved by the Valley Medical benefits team, August 2026',
      },
    },
    staff: {
      h2Plain: 'Your HR team uses it too,',
      h2Em: 'from day one.',
      lead: 'Benefits and HR staff text Axolotl the way workers do. Ask what people are stuck on, fix how a benefit is explained, or send a notice in two languages.',
      threadLabel: 'A benefits manager, texting Axolotl',
      thread: [
        { from: 'staff', text: 'What are people stuck on this week?' },
        { from: 'axolotl', text: 'Leave: 6 workers didn’t know California pays part of their wages while they care for a parent. Everything else was answered from your benefits guide.' },
        { from: 'staff', text: 'Add that to how we explain leave.' },
        { from: 'axolotl', text: 'Done, the leave path is v4. Want me to tell those 6 workers?' },
        { from: 'staff', text: 'Yes please.' },
      ],
      brief: {
        eyebrow: 'Monday brief · Valley Medical',
        example: 'Example',
        rows: [
          { v: '31', l: 'benefit questions answered from your own guide', note: 'EAP, leave, backup care' },
          { v: '14', l: 'workers helped with a parent’s care', note: 'Booked, filed or applied' },
          { v: '6', l: 'workers stuck on paid leave', note: 'Path updated to v4' },
        ],
        foot: 'Patterns, not people. The brief never shows who asked or what they said.',
      },
    },
    connect: {
      h2Plain: 'Connect your benefits,',
      h2Em: 'and every worker’s agent knows them.',
      lead: 'Axolotl works for families without you. Connected, it stops guessing: it answers from your benefits and reaches the workers who need it most.',
      head: ['What you share', 'What workers get'],
      rows: [
        ['Benefits guide and plan summaries', 'Straight answers, in their language, any time'],
        ['EAP and backup care vendors', 'Counseling and care booked for them, not a phone list'],
        ['Leave policy and HR contacts', 'Leave forms that go in complete, to the right person'],
        ['A scheduling contact', 'Shift swaps arranged with coworkers, approved by managers'],
        ['Roster with phone numbers', 'An invite from their own employer, in their language'],
      ],
      ruleTitle: 'Help flows to workers, not from them.',
      ruleBody:
        'Your information helps each worker with their own family. Their conversations with Axolotl never come back to you. You see patterns, never people.',
      start:
        'Start with your benefits guide and a roster file, not an integration project.',
    },
    never: {
      h2: 'What Axolotl will never do.',
      items: [
        { title: 'Report on workers.', body: 'You see totals and patterns, never who asked or what about.' },
        { title: 'Sell data.', body: 'Not to vendors, not to advertisers, not to anyone.' },
        { title: 'Decide for a family.', body: 'It suggests and prepares. The worker decides.' },
        {
          title: 'Make up an answer.',
          body: 'Answers come from your own benefits and official program rules. When it is not sure, a care guide answers.',
        },
        {
          title: 'Replace your benefits or your obligations.',
          body: 'It helps people use what you already offer and what they are owed.',
        },
        {
          title: "Send anything without the worker's yes.",
          body: 'Every message and form waits for them to approve it.',
        },
      ],
    },
    equity: {
      h2: 'Access and equity.',
      lead: 'The workers with the least slack are the ones this has to work for first.',
      items: [
        'English and Spanish, written for a plain reading level.',
        'Works around shifts: a text thread, not office hours.',
        'A worker who has never filled out a government form gets the same complete application as one with a lawyer.',
        'No app, no login, no portal.',
        'Confidential by design, so people use it before a problem becomes a resignation.',
      ],
    },
    pilot: {
      h2: 'A pilot together.',
      lead: 'One site, a few hundred hourly workers, and a before number you can trust.',
      baselineTitle: 'We start by counting.',
      baseline:
        'Before anything launches, we look at a recent quarter: call-outs, short shifts, quits, and how many people used your EAP and other benefits. That is your before number.',
      measuresLabel: "What we'd measure",
      measures: [
        'Call-outs and short shifts, against the before number.',
        'Quits among workers who used Axolotl, compared with a similar site.',
        'How many workers used it, against your EAP’s usage.',
        'Benefits and programs workers got, and the dollars they recovered.',
      ],
      consent:
        'Always confidential. Workers choose to use it, and you see totals only.',
      integration:
        'Connecting a roster or scheduling requires a signed data agreement first.',
      guardrail:
        'No outcome numbers until a pilot produces real ones. The numbers on this page are examples, except where a source is named. We will publish what we measure, including the parts that do not work.',
    },
    form: {
      h2: 'Talk to us about a pilot.',
      lead: "Tell us about your workforce and we'll follow up by email.",
      nameLabel: 'Your name',
      roleLabel: 'Your role',
      schoolLabel: 'Company or organization',
      emailLabel: 'Work email',
      messageLabel: 'How many hourly workers, and where?',
      messageHint: '(optional)',
      submit: 'Send',
      note: "We'll use these details to reply. Please don't include employee records or health information.",
      success: "Your message is saved. We'll reply to the email you gave us.",
      error: "We couldn't save your message. Please try again.",
      generic: 'Please fill in every field.',
    },
  },

};
