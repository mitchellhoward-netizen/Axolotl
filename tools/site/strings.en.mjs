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
    title: 'Axolotl: the right payer, for union benefit funds',
    description:
      'Axolotl finds the members whose costs belong to Medicare, Social Security or the state, and enrolls them from their side, by text, with their yes. Members get disability checks, lower premiums and cheaper prescriptions. The fund stops paying first. Paid per approval.',
    shareAlt:
      'A fund’s monthly ledger from Axolotl: Part B premiums moved to the state, disability awards filed, members turning 65 enrolled on time.',
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
    eyebrow: 'For union benefit funds',
    h1Plain: 'Your fund pays bills',
    h1Em: 'Medicare and the state should pay.',
    // The social card (share.html) draws the headline as one line of plain text.
    h1: 'Your fund pays bills Medicare and the state should pay.',
    sub: 'Axolotl finds the members whose costs belong to Medicare, Social Security or the state, and gets them enrolled from their side, by text, with their yes. Members get disability checks, lower premiums and cheaper prescriptions. The fund stops paying first. You pay only for approvals.',
    primary: 'Get a free scan',
    secondary: 'See where the money goes',
    trust: 'For union health and welfare funds. Paid per approval.',
    // The hero phone: a retiree on the fund's Part B reimbursement who qualifies
    // for New York's Medicare Savings Program (2026 limit $2,474 a month, no
    // asset test). Plain text only, the way the product sends it.
    phone: {
      meta: 'Today',
      metaTime: '10:12 AM',
      thread: [
        { out: 'Got the letter from the fund about Part B. Is this real?' },
        { in: 'It’s real. New York pays the whole Part B premium if you get under $2,474 a month, and savings don’t count. What comes in each month?' },
        { out: '1,640 social security, 410 pension' },
        { in: 'That’s $2,050, so you qualify. The state would pay your $202.90 a month, and you’d get Extra Help with prescriptions too.' },
        { in: 'I filled in the application from what you told me. Reply YES and I’ll file it. Nothing goes without your yes.' },
        { out: 'YES' },
        { in: 'Filed. I’ll text you when it’s approved. Then the premium stops coming out of your Social Security.' },
      ],
      alt: 'Text thread on a phone. A retiree asks if the fund’s letter about Part B is real. Axolotl says New York pays the whole Part B premium under $2,474 a month and asks her income. She has $2,050, so she qualifies: the state would pay her $202.90 a month and she would get Extra Help with prescriptions. Axolotl has filled in the application and asks for her yes; she replies YES and it is filed.',
    },
    // The social card's ledger. An example, not a client.
    folder: {
      label: 'Monthly ledger · Example fund',
      rows: [
        { label: 'Part B premiums, 41 retirees', detail: 'Approved for a Medicare Savings Program. $49,900 a year off the fund.', status: 'confirmed' },
        { label: 'Disability awards, 3 members', detail: 'Filed with Social Security.', status: 'requested' },
        { label: 'Turning 65, 12 members', detail: 'Part B starts on time.', status: 'confirmed' },
        { label: 'New cases, 8 members', detail: 'Applications filled in.', status: 'waiting' },
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
    h2Plain: 'The fund pays first',
    h2Em: 'more often than it should.',
    lead: 'Some of a fund’s biggest bills belong to Medicare, Social Security or the state once a member is enrolled in the right program. Most members never are. The forms are hard, the rules change at 65 and at month 24, and nobody walks them through.',
    stats: {
      eyebrow: 'Union health funds',
      example: 'National',
      rows: [
        { v: '1,400+', l: 'Multiemployer health funds', note: 'Covering more than 5 million participants, before families. IFEBP.' },
        { v: '$13,121', l: 'Median spend per participant, per year', note: 'IFEBP, 2022.' },
        { v: '74%', l: 'Of funds cover retirees', note: 'Where Medicare is meant to pay first.' },
        { v: '4 in 10', l: 'Eligible people missing a Medicare Savings Program', note: 'MACPAC and NCOA, 2021–23.' },
      ],
    },
    head: ['When', 'Who pays now', 'Who should pay', 'What the member gets'],
    rows: [
      {
        when: 'A retiree under the state income limit',
        now: 'The fund, reimbursing the Part B premium',
        should: 'The state, through a Medicare Savings Program',
        member: '$202.90 a month back, and Extra Help with prescriptions',
      },
      {
        when: 'A Part B premium someone else already pays, or after a death',
        now: 'The fund, reimbursing it anyway',
        should: 'Nobody. It’s already paid, or no one is owed it',
        member: 'Nothing changes for the member',
      },
      {
        when: 'A disabled member who keeps fund coverage',
        now: 'The fund, for everything',
        should: 'Medicare first, 24 months into a Social Security disability award',
        member: 'A disability check, about $1,483 a month on average, and no coverage gap',
      },
      {
        when: 'A retiree who qualifies for Extra Help',
        now: 'The fund’s retiree drug plan',
        should: 'Medicare subsidizes the plan for that member',
        member: 'Lower drug costs',
      },
      {
        when: 'A spouse with their own job coverage',
        now: 'The fund, first',
        should: 'The spouse’s own plan, first',
        member: 'The same care, with both plans behind it',
      },
    ],
    note: 'Disability check: SSA average, 2024. Premium: 2026 standard Part B. Disability savings are largest where disability retirees keep fund coverage for years. Dialysis after month 30 and turning 65 are different: plans already stop paying first, so the gap lands on the member. We handle those too, as member protection, not fund savings.',
  },

  example: {
    h2Plain: 'One retiree,',
    h2Em: 'one letter, seven texts.',
    lead: 'The phone at the top of this page, in New York, where a Medicare Savings Program covers one person with up to $2,474 a month in income, and savings don’t count. The fund mails one letter with the number. The rest happens by text.',
    brief: {
      eyebrow: 'What one approval is worth',
      example: '2026 figures',
      rows: [
        { v: '$202.90', l: 'Part B premium, every month', note: 'The 2026 standard premium. The state pays it once she’s approved.' },
        { v: '$1,217', l: 'A year the fund stops paying', note: 'For a fund that reimburses half the premium.' },
        { v: '$1,217', l: 'A year back in her check', note: 'Her half, plus Extra Help on prescriptions.' },
        { v: '$300', l: 'Our fee, once', note: 'Paid on approval. Nothing for a denial.' },
      ],
      foot: 'The fund makes the fee back in about three months, then saves every year she stays enrolled.',
    },
  },

  // The second phone: a member applying for a disability pension. Many
  // multiemployer pension plans require a Social Security disability award
  // first, so the member has to file anyway, and most file alone.
  how: {
    phone: {
      contact: 'Axolotl',
      meta: 'Today',
      metaTime: '2:30 PM',
      thread: [
        { kind: 'in', text: 'Your fund got your disability pension application. To pay it, they need a Social Security disability award.' },
        { kind: 'out', text: 'I never applied for that. I wouldn’t know where to start.' },
        { kind: 'in', text: 'I can do it with you. I just need your doctors and your last day of work.' },
        { kind: 'out', text: 'Dr. Okafor did my back surgery. Last day was March 14.' },
        { kind: 'in', text: 'Ready to file: Social Security disability, last day worked March 14, Dr. Okafor for your records. Reply YES to file.' },
        { kind: 'out', text: 'YES' },
        { kind: 'in', text: 'Filed. Confirmation 4417. Decisions take about six months. I’ll text you every step and send the award to your fund.' },
      ],
      caption: 'Example conversation. Fictional member and fund.',
      alt: 'Text conversation on a phone. Axolotl tells a member that his fund needs a Social Security disability award to pay his disability pension. He has never applied. Axolotl asks for his doctors and last day of work, which he gives: Dr. Okafor, March 14. Axolotl shows the ready-to-file application and asks for his yes; he replies YES, and it is filed with confirmation 4417.',
    },
  },

  disability: {
    h2Plain: 'A disability pension,',
    h2Em: 'and the award it was waiting on.',
    lead: 'Only about 36% of first applications for Social Security disability are approved, and a decision takes six months or more. Members file alone, on paper, while they’re hurt. We file with them, from the first text.',
    brief: {
      eyebrow: 'What one award is worth',
      example: 'Example',
      rows: [
        { v: '$1,483', l: 'A month to him', note: 'The average Social Security disability check, 2024.' },
        { v: '24 mo.', l: 'Until Medicare pays first', note: 'After that the fund pays second on his claims.' },
        { v: '1 award', l: 'Starts his disability pension', note: 'Many pension funds require it first.' },
        { v: 'Once', l: 'Our fee, paid on the award', note: 'Nothing if it’s denied. Never out of his back pay.' },
      ],
      foot: 'Worth the most where disability retirees keep fund coverage for years. Where coverage ends at month 30, the award keeps him from a gap.',
    },
  },

  steps: {
    h2Plain: 'Your files find the moment.',
    h2Em: 'The member says yes.',
    lead: 'The fund already knows who is turning 65, who filed for a disability pension, whose Part B it reimburses and roughly what each retiree’s pension pays. That is enough to know who to reach, and when.',
    items: [
      { tag: 'Find', text: 'Your eligibility, claims and pension files flag the moment: a retiree under the state income limit, a Part B reimbursement with no living or paying member behind it, a disability pension application, a member nine months from 65.' },
      { tag: 'Reach', text: 'The fund sends one letter or text with the number. Members text back from their own phone, in English or Spanish.' },
      { tag: 'Fill', text: 'Axolotl screens in a few questions and fills the application from what the member tells it and what the fund already has.' },
      { tag: 'Yes', text: 'Nothing is filed until the member replies YES to exactly what will happen.' },
      { tag: 'Follow', text: 'We track every case to approval. A care guide, a real person, takes the hard ones.' },
      { tag: 'Count', text: 'You get a monthly ledger: approvals, and the dollars a year that moved to the right payer.' },
    ],
  },

  different: {
    h2Plain: 'Why this isn’t done',
    h2Em: 'already.',
    items: [
      { h: 'Each piece is sold separately', p: 'Disability and Medicare firms each handle one program, by phone and paper. Dependent audits come from the fund office, years late. No one covers all of it for a fund, from one text line.' },
      { h: 'It works from the member’s side', p: 'The member gets the check, the coverage, the lower premium. That is why they answer, and why the union can stand behind the letter.' },
      { h: 'You pay for approvals', p: 'No per-member fee. Nothing for screening, nothing for denials.' },
    ],
  },

  never: {
    h2: 'What we never do',
    items: [
      { title: 'Act without a yes', body: 'Nothing is filed, sent or signed until the member replies YES to exactly what will happen.' },
      { title: 'Show the fund a case', body: 'The fund sees totals. It learns a member’s name only when that member agrees, and only what it needs, like a reimbursement to stop.' },
      { title: 'Steer anyone early', body: 'For the 30 months when the law says the fund pays first for kidney failure, we don’t push anyone toward Medicare. We make sure Part B starts on time after.' },
      { title: 'Charge members', body: 'Members never pay us, and we never take a cut of their back pay. We sign a HIPAA business associate agreement before we see a single file.' },
    ],
  },

  // The free wrong-payer scan (docs/FUNDS-LEAK-SCAN.md): the way into a fund.
  scan: {
    h2Plain: 'Start with a free scan',
    h2Em: 'of your own data.',
    lead: 'In 30 days we show you, in dollars, where your fund pays when Medicare, Social Security, the state or another insurer should, and how many members are behind each number.',
    cards: [
      { title: 'What you get', body: 'A report of dollars a year paid by the wrong payer, by leak: Part B reimbursed for retirees the state should cover, Part B paid twice or after a death, disabled members still waiting on Social Security and Medicare, other coverage. Biggest first. No names leave the fund unless you ask.' },
      { title: 'What you give', body: 'Your eligibility, claims summary and Part B reimbursement files, under a HIPAA business associate agreement, and one contact at the fund office.' },
      { title: 'What it costs', body: 'Nothing. If you want the cases fixed, we reach each member by text with your letter, and you pay only per approval.' },
    ],
    dataLabel: 'What we ask for',
    data: [
      'Eligibility: date of birth, relationship, coverage type and dates',
      'The Medicare status you already have on file',
      'A claims summary: diagnosis and procedure codes, amounts paid, Medicare crossover',
      'Your Part B reimbursement file, if you reimburse',
      'If you have them: pension amounts and disability pension applications',
    ],
    neverLabel: 'What we never need',
    never: ['Full medical records', 'Social Security numbers', 'Bank details'],
    estimate: 'Our estimate for a fund with 50,000 retirees on a 50% Part B reimbursement and modest pensions: roughly $9–14 million a year in premiums the state should pay. The scan replaces it with your number.',
  },

  pilot: {
    h2: 'Start with one group',
    lead: 'Pick the retirees on your Part B reimbursement, or the members applying for a disability pension. You send one mailing. We screen, file and follow each case to approval.',
    feesHead: ['Approval', 'Our fee'],
    fees: [
      ['Medicare Savings Program', '$300, once'],
      ['Social Security disability award', 'A flat fee per award, set with you'],
      ['Part B paid twice or after a death', 'A share of what’s recovered, set with you'],
    ],
    measuresLabel: 'What we report every month',
    measures: [
      'Members who texted, and how many qualify',
      'Applications filed, approved and pending',
      'Dollars a year moved off the fund, by program',
      'Days from first text to approval',
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
    messageLabel: 'Roughly how many members and retirees, and in which states?',
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
      description: 'Your benefit fund works with Axolotl to help members get what they’re owed from Medicare, Social Security and the state. You text, we fill the forms, and nothing is sent without your yes. Free to you.',
      shareAlt: 'A fund’s monthly ledger from Axolotl.',
    },
    hero: {
      eyebrow: 'For union members and retirees',
      h1Plain: 'Your fund sent you here.',
      h1Em: 'Here’s who we are.',
      sub: 'Axolotl works with your benefit fund to help members get what they’re owed from Medicare, Social Security and the state: lower premiums, disability checks, help with prescriptions. You text. We fill in the forms. Nothing is sent without your yes. It’s free to you.',
      primary: 'Get a text from us',
    },
    help: {
      h2: 'What we can help with',
      items: [
        { title: 'Your Medicare premium', body: 'If your income is under your state’s limit, the state may pay your Part B premium: $202.90 a month in 2026.' },
        { title: 'Prescriptions', body: 'Extra Help lowers what you pay for medicines. Anyone in a Medicare Savings Program gets it automatically.' },
        { title: 'Disability', body: 'If you can’t work, we help you apply for Social Security disability and send the award to your fund.' },
        { title: 'Turning 65', body: 'We help you sign up for Medicare on time, so there’s no gap and no late penalty.' },
      ],
    },
    rules: {
      h2: 'How we work',
      items: [
        { title: 'Nothing goes out without your yes', body: 'We show you exactly what will be sent. You reply YES, or it doesn’t go.' },
        { title: 'Your fund doesn’t see your case', body: 'Your fund sees totals. It learns your name only if you agree, and only what it needs.' },
        { title: 'Free to you', body: 'Your fund pays us. You never pay, and we never take a cut of back pay.' },
        { title: 'A real person when it’s hard', body: 'When a case gets complicated, a care guide takes over.' },
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
