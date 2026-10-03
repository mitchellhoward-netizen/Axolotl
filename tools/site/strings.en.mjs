/**
 * Every word on the English site, in one place.
 *
 * The build (tools/site/build.mjs) renders this into public/index.html and
 * public/employers.html. strings.es.mjs is the same shape, so the two languages
 * cannot drift apart structurally: if a key is missing, the build fails.
 *
 * The thesis the site carries (docs/PRODUCT-THESIS.md): working families are
 * owed a great deal, from their employer and from public programs, and get a
 * fraction of it. The gap is complexity, fear and time, not stinginess. Axolotl
 * is one confidential number that closes it, with a real person when it's hard.
 * Caregiving, a parent and the kids, is where the gap costs a shift.
 *
 * Rules this file has to keep (from the design brief):
 *   - Never invent stats, quotes, features or legal claims. A sourced number
 *     names its source on the page; everything else is marked as an example.
 *   - Nothing here claims "any phone": the service runs over iMessage today.
 *   - Axolotl texts the family's own people (a brother, a coworker) only on the
 *     worker's YES, after showing the exact text: every bubble that sends to
 *     someone shows the offer, the words, the yes, then the result.
 *   - The employer never sees a family's case. Say so wherever an employer appears.
 *   - Plain words, sentence case, second person, short sentences.
 */

export default {
  lang: 'en',
  locale: 'en_US',

  meta: {
    title: 'Axolotl: every working family deserves an agent.',
    description:
      'Axolotl is one confidential number working families text for everything they are owed: a parent’s care, Medi-Cal and benefits, leave, the kids’ school. It does the work, a real person steps in when it’s hard, and nothing goes out without your yes.',
    shareAlt:
      'A manila folder labeled "The Reyes family" holding tasks for a parent’s care, benefits and work, each marked Confirmed, Waiting for your yes, or Requested.',
  },

  a11y: {
    skip: 'Skip to content',
    home: 'Axolotl home',
    menu: 'Menu',
    mainNav: 'Main navigation',
    footerNav: 'Footer',
    mascot: 'A smiling pink axolotl with frilly gills.',
    statusWord: 'Status',
  },

  nav: {
    how: 'How it works',
    help: 'Help available',
    employers: 'For employers',
    funds: 'For benefit funds',
    join: 'Join the pilot',
    langSwitch: 'Español',
    langSwitchHref: '/es',
  },

  exampleCaption:
    'Example conversation. Fictional family and employer.',

  // ── The homepage, as one working day ────────────────────────────────────────
  // Each section is a moment in a working parent's day, and the page's light
  // moves with it: dawn, daylight, golden hour, dusk, night. Times are copy.
  day: {
    // Short enough to fit inside the signup field on a small phone.
    phonePlaceholder: 'Your phone number',
    agents: {
      // The line above the headline rolls through people who have someone in
      // their corner, then lands on working families. Decorative: screen readers
      // get the headline alone, and reduced motion shows only the last line.
      label: 'Who has an agent',
      items: [
        'Movie stars have agents.',
        'Athletes have agents.',
        'Authors have agents.',
        'Jazz cats have agents.',
        'Comedians have agents.',
        'Pro surfers have agents.',
        'Influencers have agents.',
        'Pro gamers have agents.',
        'Matadors have agents.',
        'Hand models have agents.',
        'Clowns have agents.',
      ],
      parentsLead: 'Working families have',
      parentsTail: 'a pile of letters and hold music.',
    },
    morning: {
      time: '5:40 AM',
      label: 'Before a 7 AM shift',
      h1Plain: 'Every working family deserves',
      h1Em: 'an agent.',
    },
    inbox: {
      time: '8:30 AM',
      label: 'On her break',
      h2Plain: 'Eight letters this month.',
      h2Em: 'One that matters.',
      lead: 'The county, the insurance company, HR, the school. Axolotl reads it all, finds the one with a deadline, fills in the form, and waits for your yes. Done means they confirmed it.',
      steps: [
        { tag: 'Reads', body: 'A photo of a letter, a forwarded email, a form from HR' },
        { tag: 'Finds', body: 'The one thing with a date attached' },
        { tag: 'Asks', body: 'You see what it will send. Your yes sends it' },
        { tag: 'Confirms', body: 'Only their confirmation counts as done' },
      ],
      inboxLabel: 'This month · 8 letters and emails',
      emails: [
        'Insurance: explanation of benefits',
        'HR: open enrollment reminder',
        'County: Mom’s Medi-Cal renewal, due Oct 15',
        'School: picture day, Oct 3',
        'Pharmacy: refill ready',
        'Bank statement',
        'Library books due',
      ],
      // Which email above is the one that needs the family.
      highlight: 2,
    },
    midday: {
      time: '11:48 AM',
      label: 'Midday',
    },
    qualify: {
      time: '3:05 PM',
      label: 'After the shift',
      h2Plain: 'Help your family',
      h2Em: 'already qualifies for.',
      lead: 'Paid caregiving, Medicare savings, food help, paid leave. The help exists, but you have to know to ask, ask the right office, and keep asking. Axolotl notices when your family might qualify, then does all three.',
      timelineTitle: 'One ask, start to finish',
      steps: [
        {
          when: 'Oct 2 · 2:14 PM',
          title: 'The doctor’s visit',
          kind: 'email',
          from: 'Dr. Lee’s office · Valley Clinic',
          subject: 'Visit summary for Carmen Reyes',
          before: 'Mrs. Reyes now ',
          mark: 'needs daily help with bathing and medications',
          after: '. We recommend support at home.',
        },
        {
          when: '3:05 PM',
          title: 'Axolotl spots what it means',
          kind: 'text',
          in: 'Your mom has Medi-Cal and now needs daily help. She may qualify for IHSS, and you could be paid as her caregiver. Want me to start the application?',
          out: 'Yes, please',
        },
        {
          when: '9:40 PM',
          title: 'It fills in the application',
          kind: 'letter',
          to: 'To the county IHSS office',
          before: 'I am applying for In-Home Supportive Services for my mother, Carmen Reyes, who has Medi-Cal and ',
          mark: 'needs help with daily care',
          after: '. I would like to be her provider.',
          sent: 'Sent on your yes',
        },
        {
          when: 'Oct 10 · Day 8',
          title: 'No answer, so it follows up',
          kind: 'text',
          in: 'No word from the county yet. I called, and they have it. A social worker will call to set up a home visit.',
          pending: true,
        },
        {
          when: 'Oct 16 · Day 14',
          title: 'The county answers',
          kind: 'reply',
          from: 'County IHSS office',
          text: 'Received. A home visit for Carmen Reyes is scheduled for October 23.',
          track: 'Next: the doctor’s form. Dr. Lee’s office has it.',
          done: true,
        },
      ],
      alsoLabel: 'It can ask for these too:',
      also: [
        'Medicare savings for a parent',
        'Food help (CalFresh)',
        'Paid family leave',
        'Help paying for child care',
        'An interpreter at appointments',
      ],
      note: 'Axolotl isn’t a lawyer. It asks for what your family already qualifies for.',
    },
    school: {
      time: '3:40 PM',
      label: 'On the way home',
      h2Plain: 'Every family makes the county easier',
      h2Em: 'for the next one.',
      lead: 'Every time Axolotl gets something done, it learns what worked: which office, which form, how long it took. A care guide checks it, and the next family just says yes. Nobody’s personal details go into it.',
      steps: [
        { tag: 'One family', text: 'Axolotl finds a way through that works.' },
        { tag: 'Many families', text: 'It keeps working, so it becomes proven.' },
        { tag: 'A care guide', text: 'Checks it and makes it the standard way.' },
      ],
      link: 'Run a team of hourly workers? See what your people get',
      // An illustrative path in a fictional county. The numbers show what a path
      // records; they are not measured results, and the eyebrow says "Example".
      card: {
        eyebrow: 'Example · Valley County',
        version: 'Path v2',
        title: 'Renew a parent’s Medi-Cal',
        doLabel: 'What you do',
        doText: 'Send a photo of the renewal letter. Say yes to the form.',
        happensLabel: 'What happens',
        happensText: 'The form goes in complete, and the county confirms it.',
        stats: [
          { v: '31', l: 'families used it' },
          { v: '31', l: 'confirmed' },
          { v: '6 days', l: 'typical wait' },
        ],
        neverLabel: 'Never shared',
        neverText: 'Why you asked. Health details. Anything the county doesn’t require.',
        stamp: { top: 'Verified', name: ['Care guide', 'Ana R.'], date: 'Oct 2' },
        stampAlt: 'Verified by care guide Ana R. on October 2',
      },
      moreLabel: 'More paths in Valley County',
      more: [
        { name: 'Medicare savings for a parent', status: 'verified', official: true },
        { name: 'CalFresh renewal', status: 'verified', official: true },
        { name: 'Apply for IHSS', status: 'proven' },
        { name: 'Paid family leave claim', status: 'proven' },
        { name: 'Adult day program', status: 'new' },
      ],
      note: 'Paths are rolling out with our first pilot families.',
    },
    dinner: {
      time: '6:30 PM',
      label: 'Dinner',
      h2Plain: 'Who’s got Mom',
      h2Em: 'this week.',
      lead: 'Your circle is the people who already help: your brother, your sister, a neighbor, the sitter. Tell Axolotl what you need. It asks them, sorts out who’s doing what, and reminds everyone.',
      weekLabel: 'This week',
      week: [
        { day: 'Mon', who: 'You' },
        { day: 'Tue 10:00', who: 'Luis', set: true },
        { day: 'Wed', who: 'The aide' },
        { day: 'Thu', who: 'Marisol', set: true },
        { day: 'Fri', who: 'You' },
      ],
      rules: [
        { h: 'Everyone says yes.', p: 'Nobody is added without agreeing. Anyone can leave, anytime.' },
        { h: 'The plan, not the reason.', p: 'Your circle sees who’s with Mom when. Never the medical details.' },
        { h: 'Any language.', p: 'Luis writes in Spanish, Marisol reads it in English.' },
      ],
      soon: 'Coming soon · Circles',
      circles: 'Join the pilot and you’ll be first to start one.',
    },
    night: {
      time: '9:40 PM',
      label: 'Kids are asleep',
      h2Plain: 'Everything’s',
      h2Em: 'handled.',
      lead: 'Instead of a kitchen table covered in letters, one summary: what went out, what was confirmed, and what is still waiting.',
      summaryLabel: 'Today, in one summary',
      summary: [
        { title: 'Mom’s aide', detail: 'Covered by your backup care · arrived 7:30', done: true },
        { title: 'Today’s shift', detail: 'Dana took 7 to 11 · manager approved', done: true },
        { title: 'Mom’s Medi-Cal renewal', detail: 'County confirmed · R-4471', done: true },
        { title: 'Paid caregiving (IHSS)', detail: 'Requested · waiting on the county', done: false },
      ],
      doneWord: 'Done',
      waitingWord: 'Waiting on them',
      promises: [
        { title: 'Your yes sends it.', body: 'Every email, form and request waits for an explicit yes. A suggestion is not permission.' },
        { title: 'Your employer never sees your case.', body: 'If your job pays for Axolotl, they see totals only. Never who asked, or what about.' },
        { title: 'A real person when it’s hard.', body: 'For a crisis or a big decision, a care guide steps in. Your information is never sold.' },
      ],
      links: [
        { label: 'Read every limit, in plain words', href: '/security' },
        { label: 'How we handle information', href: '/privacy' },
      ],
      closePlain: 'Tomorrow’s',
      closeEm: 'already handled.',
    },
  },

  hero: {
    h1: 'Every working family deserves an agent.',
    sub: 'Your family is owed a lot, from your job and from public programs, and most of it never reaches you. Axolotl is one confidential number you text. It handles a parent’s care, the benefits, the leave forms and the kids’ school, and a real person steps in when it’s hard. Nothing goes out without your yes.',
    primary: 'Join the pilot',
    secondary: 'See how it works',
    trust:
      'Free for families in the pilot, in English or Spanish.',
    // The hero visual is the thread a working parent actually gets before a
    // shift: the aide cancels, care is covered, the renewal goes in, and the
    // help she didn't know about. Plain text only, the way the product sends it.
    phone: {
      meta: 'Today',
      metaTime: '5:40 AM',
      thread: [
        { out: 'Mom’s aide just cancelled and I start at 7. Help.' },
        { in: 'Your backup care at work covers an aide today, at 6:45. Book it?' },
        { out: 'Yes.' },
        { in: 'Booked. Ana from Sunrise Home Care arrives at 6:45.' },
        { in: 'Mom’s Medi-Cal renewal is due Friday. It’s filled in and needs your yes.' },
        { out: 'Send it.' },
        { in: 'Sent. The county confirmed they have it.' },
        { in: 'You may be able to get paid for caring for your mom, through IHSS. Want me to check?' },
        { out: 'Wait, really? Yes.' },
      ],
      alt: 'Text thread on a phone, before a 7 AM shift. The worker says her mom’s aide just cancelled. Axolotl says the backup care at her job covers an aide today and, on her yes, books one for 6:45. It has filled in her mom’s Medi-Cal renewal and sends it on her yes; the county confirms. Then it tells her she may be able to get paid for the care she gives her mom through IHSS, and she says yes.',
    },
    // The phone no longer draws the folder, but the social card (share.html)
    // still does, so its rows live here.
    folder: {
      label: 'The Reyes family',
      tab: 'Reyes',
      listLabel: 'What is in this folder',
      annotation: 'just needs your yes',
      rows: [
        {
          label: 'Mom’s aide today',
          detail: 'Covered by backup care. Ana arrives at 6:45.',
          status: 'confirmed',
        },
        {
          label: 'Mom’s Medi-Cal renewal',
          detail: 'Filled in from last year. Ready to send.',
          status: 'waiting',
          annotated: true,
        },
        {
          label: 'Paid caregiving (IHSS)',
          detail: 'Application started with the county.',
          status: 'requested',
        },
        {
          label: 'Thursday shift',
          detail: 'Dana said yes to the swap. Your manager approved.',
          status: 'confirmed',
        },
        {
          label: 'Mom’s week',
          detail: 'Luis has Tuesday. Marisol has Thursday.',
          status: 'soon',
          tag: 'Circles',
        },
      ],
    },
  },

  statuses: {
    confirmed: 'Confirmed',
    waiting: 'Waiting for your yes',
    requested: 'Requested, waiting on the county',
    reminder: 'Reminder set',
    soon: 'Coming soon',
  },

  week: {
    h2: 'It keeps the week running.',
    lead: 'The aide who cancels, the shift you can’t miss, and the forms that assume someone is free at 2 PM.',
    stepsLabel: 'What it did',
    shotAlt: 'A text conversation with Axolotl:',
    you: 'You',
    prev: 'Previous',
    next: 'Next',
    trackLabel: 'The week, one screen at a time',
    preview: { domain: 'benefits.valleymed.org', title: 'Your benefits guide' },
    meta: 'Today',
    cols: [
      {
        h3: 'When care falls through',
        time: '5:40 AM',
        steps: [
          'The aide cancelled.',
          'Found care your job covers.',
          'Asked Dana to swap, on your yes.',
        ],
        turns: [
          { out: 'Mom’s aide cancelled. I start at 7.' },
          { in: 'Your backup care covers an aide today. The earliest is 7:30.' },
          { out: 'That’s too late.' },
          { in: 'Dana could take 7 to 11 if you take her Saturday. Want me to ask her?' },
          { out: 'Yes' },
          { in: 'Here’s what I’ll send: “Can you swap my 7 to 11 today for your Saturday?”' },
          { out: 'Send' },
          { in: 'Dana said yes. I sent the swap to your manager.' },
          { in: 'Approved. The aide is booked for 7:30.' },
          { out: 'You saved my morning.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'The benefits you already have',
        time: '11:48 AM',
        steps: [
          'Read your benefits guide.',
          'Found free counseling at work.',
          'Booked it on your yes.',
        ],
        turns: [
          { out: 'Mom’s getting worse and I can’t sleep.' },
          { in: 'I’m sorry. That’s a lot to carry.' },
          { in: 'Your job includes free counseling. It’s confidential. Work never sees who uses it.' },
          { out: 'I didn’t know that.' },
          { in: 'There’s a Spanish-speaking counselor Tuesday at 6 PM, by phone. Want it?' },
          { out: 'Yes' },
          { in: 'Booked. I’ll remind you Tuesday at 5.' },
          { in: 'Your mom may also qualify for an adult day program through Medi-Cal. Want me to check?' },
          { out: 'Please.' },
          { in: 'On it. I’ll send you what I find tonight.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'The kids',
        time: '4:05 PM',
        steps: [
          'Picture day is Thursday.',
          'Field trip form is due Friday.',
          'Drafted Leo’s absence note.',
        ],
        turns: [
          { in: 'Three things this week: picture day Thursday, the field trip form due Friday, and Leo needs an absence note.' },
          { out: 'He has a dentist appointment Monday morning.' },
          { in: 'Then I’ll write the absence note for Monday and fill in the form.' },
          { out: 'Do you need anything from me?' },
          { in: 'Just a yes. Everything else I have.' },
          { in: 'Ready to send: the absence note and Maya’s field trip form.' },
          { out: 'Yes' },
          { in: 'Both sent. The school confirmed they have them.' },
          { out: 'What about picture day?' },
          { in: 'Nothing to do. I’ll remind you Thursday morning.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Who’s got Mom',
        time: '6:30 PM',
        steps: [
          'Tuesday doctor visit: Luis.',
          'Thursday: the aide.',
          'Sunday: your sister, if she can.',
        ],
        turns: [
          { in: 'Here’s who’s with your mom this week.' },
          { in: 'Tuesday doctor visit: Luis. Thursday: the aide. Saturday: you.' },
          { out: 'Can you check Luis is still good for Tuesday?' },
          { in: 'Want me to text Luis: “Still good to take Mom to Dr. Lee Tuesday at 10?”' },
          { out: 'Yes' },
          { in: 'Sent. Luis says yes, 10 o’clock.' },
          { out: 'What about Sunday? I might pick up a shift.' },
          { in: 'Nobody’s with her Sunday yet. Marisol is next. Want me to ask her?' },
          { out: 'Yes.' },
          { in: 'Asked. I’ll tell you what she says.' },
        ],
        status: 'confirmed',
      },
    ],
  },

  how: {
    h2: 'Nothing goes out until you say yes.',
    lead: 'A letter from HR, one deadline that matters, and two forms that have to go out.',
    steps: [
      {
        title: 'It spots the deadline.',
        body: 'Most letters are just information. One needs you, with the date attached.',
      },
      {
        title: 'It does the work.',
        body: 'It fills in the forms and gets the doctor’s part started.',
      },
      {
        title: 'It waits for your yes.',
        body: 'You see exactly what it will send. Your yes is what sends it.',
      },
      {
        title: 'Done means confirmed.',
        body: 'It only calls something finished when they confirm it.',
      },
    ],
    stepsLabel: 'How it works, in order',
    phone: {
      contact: 'Axolotl',
      meta: 'Today',
      metaTime: '4:02 PM',
      who: 'Axolotl: ',
      whoParent: 'You: ',
      thread: [
        {
          kind: 'in',
          text: 'HR needs your leave form and a doctor’s note by Oct 15 for your mom’s surgery.',
        },
        { kind: 'in', text: 'California paid family leave can also cover part of your pay.' },
        { kind: 'out', text: 'I have no idea how to do that. Can you?' },
        {
          kind: 'in',
          text: 'Yes. I filled in the leave form and sent the doctor’s part to Dr. Lee.',
        },
        { kind: 'in', text: 'HR tells your manager the dates, so you don’t have to.' },
        {
          kind: 'in',
          text: 'Ready to send: Rosa Reyes, leave Oct 20 to Nov 3, to care for her mother. I’ll start your paid leave claim too.',
        },
        { kind: 'out', text: 'Yes' },
        {
          kind: 'in',
          text: 'Sent. HR confirmed they have it. Reference L-2210.',
        },
      ],
      caption: 'Example conversation. Fictional family and employer.',
      alt: 'Text conversation on a phone: Axolotl says HR needs the worker’s leave form and a doctor’s note by October 15 for her mom’s surgery, and that California paid family leave can cover part of her pay. Axolotl fills in the leave form, sends the doctor’s part to the doctor, and shows the ready-to-send details, offering to start the paid leave claim too. She replies Yes, and Axolotl confirms HR has it, reference L-2210.',
    },
    channel: {
      line: 'Text one number. No app, no portal. English or Spanish.',
      label: 'Things families send',
      items: [
        { kind: 'text', text: 'Fwd: Your benefits enrollment' },
        { kind: 'photo', text: 'Photo of a letter' },
        { kind: 'text', text: 'Can my mom get help at home?' },
        { kind: 'text', text: 'Leo is out sick today.' },
      ],
    },
  },

  circles: {
    h2: 'Coordinate with the people who already help.',
    soon: 'Coming soon',
    lead: 'Your circle is the people who already help: your brother, your sister, a neighbor, the sitter. Soon, Axolotl brings them into one plan for your mom and the kids. It asks in your words, works out who is doing what, and only commits once everyone says yes.',
    chat: {
      alt: 'Example group chat in the Messages app, showing a circle. The worker says her mom has a doctor visit Tuesday at 10 and she is working. Axolotl asks Luis and Marisol. Luis answers in Spanish that he can take her if someone covers his Thursday, and Axolotl translates. Marisol takes Thursday. Axolotl confirms the plan and says it will remind them that morning.',
      group: 'You, Luis, Marisol',
      meta: 'Today',
      metaTime: '6:31 PM',
      messages: [
        { from: 'You', out: true, text: 'Mom has a doctor visit Tuesday at 10 and I’m working. Can anyone take her?' },
        { from: 'Axolotl', text: 'Luis, Marisol: is either of you free Tuesday at 10?' },
        { from: 'Luis', text: 'Yo la llevo, si alguien me cubre el jueves.' },
        { from: 'Axolotl', text: 'Luis can take her if someone covers his Thursday.' },
        { from: 'Marisol', text: 'I’ve got Thursday.' },
        { from: 'Axolotl', text: 'Set: Luis has Tuesday at 10, Marisol has Thursday. I’ll remind you both that morning.' },
        { from: 'You', out: true, text: 'You’re both the best. I owe you dinner this weekend.' },
      ],
    },
    listLabel: 'How circles work',
    list: [
      'You never need a circle to get the full help.',
      'A circle sees only the plan, never the medical or money details.',
      'Nothing is agreed until everyone says yes.',
      'It is not only rides: doctor visits, sick days, the school run and covering a shift.',
      'Everyone reads and writes in their own language.',
      'If a program owes your family help, Axolotl asks the program first.',
      'Axolotl coordinates. It does not drive anyone; the family decides.',
    ],
    form: {
      legend: 'Start a circle',
      phoneLabel: 'Your phone number',
      familiesLabel: 'How many people help?',
      familiesOptions: ['2 to 3', '4 to 6', '7 or more'],
      schoolLabel: 'City',
      schoolHint: '(optional)',
      submit: 'Start a circle',
      note: "We'll text you when circles open.",
      success: "You're on the list. We'll text you when circles open.",
      errors: {
        phone: 'Enter a 10-digit US phone number.',
        families: 'Choose how many people help.',
        generic: "We couldn't save your signup. Please try again.",
      },
    },
  },

  // Rendered only when at least two permissioned quotes exist. Empty today:
  // the brief forbids shipping bracketed placeholders, so the section is absent.
  voices: {
    h2: 'From families in the pilot.',
    quotes: [],
  },

  join: {
    h2: 'Join the pilot.',
    lead: "We're onboarding a small group of working families. Add your number and we'll text you about access. Free for families, in English or Spanish.",
    phoneLabel: 'Your phone number',
    submit: 'Join the pilot',
    note: 'By joining, you agree to receive texts about access.',
    circleLink: 'Start a circle instead',
    questionLink: 'Have a question first?',
    success: "You're on the list. We'll text you at {phone}.",
    error: 'Enter a 10-digit US phone number.',
    generic: "We couldn't save your signup. Please try again.",
  },

  employersBand: {
    h2: 'For employers.',
    body: 'Your people are owed benefits they don’t use, and family care costs you shifts and quits. Give every worker one confidential number. Axolotl gets them what they’re owed and handles the family crisis before it costs a shift. You see totals, never cases.',
    link: 'How Axolotl works with employers',
  },

  contact: {
    h2: 'Questions.',
    lead: 'Ask about the pilot, or ask a question about how it works. We save your message and reply by email.',
    emailLabel: 'Email',
    messageLabel: 'What would you like to ask?',
    messageHint: '(optional)',
    submit: 'Send',
    note: "We'll use these details to reply. Please don't include health information, benefit IDs or passwords.",
    privacyLink: 'How we handle website data',
    success: "Your message is saved. We'll reply to the email you gave us.",
    error: "We couldn't save your message. Please try again.",
  },

  websitePrivacy: {
    summary: 'Website privacy',
    h2: 'What you share here.',
    blocks: [
      {
        h3: 'What you send us',
        body: 'We collect the email address and message you submit so we can reply. Inquiries are stored in our database. Please do not send health information, benefit IDs or passwords.',
      },
      {
        h3: 'The pilot list and employer requests',
        body: 'A family signup gives us your phone number. An employer pilot request gives us your name, role, organization and email. All of it is stored in our database. A text provider may process your phone number to send a confirmation text.',
      },
      {
        h3: 'This website is not the service',
        body: "These forms do not connect to your employer, your benefits or any government account. The site loads fonts from Google Fonts, so your browser makes requests to Google and to our hosting provider when you visit. How the service itself handles your family's information is in the privacy policy.",
      },
      {
        h3: 'Questions about your information?',
        body: 'Use the form above for privacy questions or a request about information you submitted.',
      },
    ],
    link: 'Read the service privacy policy',
  },

  footer: {
    tagline: 'The agent for working families',
    links: [
      { label: 'Contact', href: '#contact' },
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

  // ── /funds ──────────────────────────────────────────────────────────────────
  //
  // For union (Taft-Hartley) benefit funds. The worked example is the Medicare
  // Savings Program: a fund that reimburses part of its retirees' Part B premium
  // is paying a bill the state would pay for many of them. Figures checked
  // October 2026: Part B standard premium $202.90 a month (CMS, 2026); New York
  // QI-1 limit $2,474 a month gross for one person, no asset test (NY DOH 2026);
  // any Medicare Savings Program level qualifies a person for Extra Help.
  funds: {
    meta: {
      title: 'Axolotl for benefit funds',
      description:
        'Axolotl is a confidential text line that enrolls your members in the public programs they already qualify for, starting with Medicare Savings Programs for retirees, so the fund stops paying premiums the state would cover. Paid per approved enrollment.',
      shareAlt: 'A manila folder of family tasks with a Confirmed stamp on the first row.',
    },
    hero: {
      eyebrow: 'For union benefit funds',
      h1Plain: 'Some of the premiums your fund pays,',
      h1Em: 'the state would pay instead.',
      sub: 'Many retirees on your Part B reimbursement qualify for a Medicare Savings Program, which pays the whole premium. Few apply. Axolotl is a confidential text line that checks, fills the application and files it with the member’s yes. You pay only when one is approved.',
      primary: 'Request a fund pilot',
      secondary: 'See one retiree’s math',
    },
    example: {
      h2Plain: 'One retiree,',
      h2Em: 'one letter, six texts.',
      lead: 'A worked example in New York, where a Medicare Savings Program covers a single person with up to $2,474 a month in income, and savings don’t count. The fund mails one letter with the number. The rest happens by text.',
      threadLabel: 'A retired home health aide, 68',
      thread: [
        { from: 'member', text: 'Got the letter from the fund about Part B. Is this real?' },
        { from: 'axolotl', text: 'It’s real. New York pays the whole Part B premium for people under $2,474 a month, and savings don’t count. What comes in each month, Social Security and pension together?' },
        { from: 'member', text: '1,640 social security, 410 pension' },
        { from: 'axolotl', text: 'That’s $2,050, so you qualify. The state would pay your $202.90 a month, and you’d get Extra Help with prescriptions too. I’ve filled the application from what you told me. Reply YES and I’ll file it. Nothing goes without your yes.' },
        { from: 'member', text: 'YES' },
        { from: 'axolotl', text: 'Filed. The office has up to 45 days. I’ll text you when it’s approved, and the premium stops coming out of your Social Security.' },
      ],
      brief: {
        eyebrow: 'What one approval is worth',
        example: '2026 figures',
        rows: [
          { v: '$202.90', l: 'Part B premium, every month', note: 'The 2026 standard premium. The state pays it once she’s approved.' },
          { v: '$1,217', l: 'A year the fund stops paying', note: 'For a fund that reimburses half the premium.' },
          { v: '$1,217', l: 'A year back in her check', note: 'Her half, plus Extra Help on prescriptions.' },
          { v: '$300', l: 'Our fee, once', note: 'Paid on approval. Nothing for a denial.' },
        ],
        foot: 'The fund pays for itself in about three months, then saves every year she stays enrolled.',
      },
    },
    programs: {
      h2Plain: 'The same line,',
      h2Em: 'for everything members leave on the table.',
      lead: 'Retiree premiums are where the fund’s money is clearest, so a pilot starts there. Members text the same number for the rest.',
      head: ['What members are owed', 'What it does for the fund'],
      rows: [
        ['Medicare Savings Programs', 'Part B premiums the state pays instead of the fund.'],
        ['Extra Help with prescriptions', 'Lower drug costs for retirees, automatic with any Medicare Savings Program.'],
        ['Turning 65', 'Medicare signed up on time, with no lifelong late penalty, and the move off the active plan done right.'],
        ['Dependents and life events', 'A new baby, a marriage or a divorce, with the paperwork complete the first time.'],
        ['State leave and child care programs', 'Paid family leave and child care help members already pay into, filed for them.'],
      ],
    },
    never: {
      h2: 'What we never do',
      items: [
        { title: 'Act without a yes', body: 'Nothing is filed, sent or signed until the member replies YES to exactly what will happen.' },
        { title: 'Show the fund a case', body: 'The fund sees totals. It learns a member’s name only when that member agrees, and only to stop a reimbursement the state now pays.' },
        { title: 'Sell or share member data', body: 'Not to employers, not to insurers, not to anyone.' },
        { title: 'Replace your member services', body: 'When a question is about the fund’s own plan, we send it to your staff with the context, not a guess.' },
      ],
    },
    pilot: {
      h2: 'A pilot that pays for itself',
      lead: 'Pick one group: the retirees on your Part B reimbursement. You send one mailing with the number. We screen, file and follow each case to approval.',
      measuresLabel: 'What we report every month',
      measures: [
        'Retirees who texted, and how many qualify',
        'Applications filed, approved and pending',
        'Premium dollars a year moved off the fund',
        'Days from first text to approval',
      ],
      price: '$300 per approved enrollment. Nothing for screening, nothing for denials.',
      guardrail: 'If nobody is approved, the pilot costs the fund nothing.',
    },
    form: {
      h2: 'Request a fund pilot',
      lead: 'Tell us about your fund. We’ll reply within two business days.',
      nameLabel: 'Your name',
      roleLabel: 'Your role',
      fundLabel: 'Fund',
      emailLabel: 'Work email',
      messageLabel: 'Roughly how many retirees, and in which states?',
      messageHint: '(optional)',
      submit: 'Send',
      note: "We'll use these details to reply. Please don't include member records or health information.",
      success: "Your request is saved. We'll reply to the email you gave us.",
      error: "We couldn't save your request. Please try again.",
      generic: 'Please fill in every field.',
    },
  },
};
