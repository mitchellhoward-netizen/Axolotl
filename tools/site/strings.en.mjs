/**
 * Every word on the English site, in one place.
 *
 * The build (tools/site/build.mjs) renders this into public/index.html and
 * public/schools.html. strings.es.mjs is the same shape, so the two languages
 * cannot drift apart structurally: if a key is missing, the build fails.
 *
 * Rules this file has to keep (from the design brief):
 *   - Copy in quotes in the brief is final draft. Do not paraphrase it.
 *   - Never invent stats, quotes, features or legal claims.
 *   - Nothing here claims "any phone": the service runs over iMessage today.
 *   - Axolotl texts the family's own people (grandma, the sitter) only on the
 *     parent's YES, after showing the exact text: every bubble that sends to
 *     someone shows the offer, the words, the yes, then the result.
 *   - Plain words, sentence case, second person, short sentences.
 */

export default {
  lang: 'en',
  locale: 'en_US',

  meta: {
    title: 'Axolotl: every parent deserves an agent for school.',
    description:
      'Axolotl is your family\'s agent for school, by text. It reads what school sends, handles the forms and pickups, and gets your kid the help they qualify for. Nothing goes out without your yes.',
    shareAlt:
      'A manila folder labeled "The Howard family" holding school tasks, each marked Confirmed, Waiting for your yes, or Requested.',
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
    schools: 'For schools',
    join: 'Join the pilot',
    langSwitch: 'Español',
    langSwitchHref: '/es',
  },

  exampleCaption:
    'Example conversation. Fictional school and family.',

  // ── The homepage, as one school day ─────────────────────────────────────────
  // Each section is a moment in a parent's day, and the page's light moves with
  // it: dawn, daylight, golden hour, dusk, night. Times are part of the copy.
  day: {
    // Short enough to fit inside the signup field on a small phone.
    phonePlaceholder: 'Your phone number',
    agents: {
      // The line above the headline rolls through people who have someone in
      // their corner, then lands on parents. Decorative: screen readers get the
      // headline alone, and reduced motion shows only the last line.
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
      parentsLead: 'Parents have',
      parentsTail: 'a stack of permission slips.',
    },
    morning: {
      time: '7:15 AM',
      label: 'A school day',
      h1Plain: 'Every parent deserves',
      h1Em: 'an agent.',
    },
    inbox: {
      time: '8:30 AM',
      label: 'The inbox',
      h2Plain: 'Eight school emails.',
      h2Em: 'One that matters.',
      lead: 'Axolotl reads everything school sends, pulls out the one with a deadline, fills in the form, and waits for your yes. Done means the school confirmed it.',
      steps: [
        { tag: 'Reads', body: 'Forwarded mail, a photo of a paper form, or your Gmail' },
        { tag: 'Finds', body: 'The one thing with a date attached' },
        { tag: 'Asks', body: 'You see what it will send. Your yes sends it' },
        { tag: 'Confirms', body: "Only the school's confirmation counts as done" },
      ],
      inboxLabel: 'Inbox · 8 new from Lincoln Elementary',
      emails: [
        'Picture day, Oct 3',
        'Book fair next week',
        'Kindergarten: physical and dental by Oct 15',
        'Spirit week theme days',
        'PTA meeting, Thursday',
        'October lunch menu',
        'Library books due',
      ],
      // Which email above is the one that needs the parent.
      highlight: 2,
    },
    midday: {
      time: '11:48 AM',
      label: 'Midday',
    },
    qualify: {
      time: '3:05 PM',
      label: 'The car line',
      h2Plain: 'Help your kid',
      h2Em: 'already qualifies for.',
      lead: 'Rides, evaluations, interpreters, free meals. The help exists, but you have to know to ask, ask in writing, and keep asking. Axolotl notices when your kid might qualify, then does all three.',
      timelineTitle: 'One ask, start to finish',
      steps: [
        {
          when: 'Sep 30 · 2:14 PM',
          title: 'The school emails',
          kind: 'email',
          from: 'Ms. Park, 2nd grade · Lincoln Elementary',
          subject: 'Fall reading screener results',
          before: 'Maya scored ',
          mark: 'well below benchmark',
          after: " in reading fluency. We'll add small-group practice in class.",
        },
        {
          when: '3:05 PM',
          title: 'Axolotl spots what it means',
          kind: 'text',
          in: "Maya's reading screener came back well below benchmark. You can ask the school to evaluate her for more help. It has to be in writing. Want me to draft it?",
          out: 'Yes, please',
        },
        {
          when: '9:40 PM',
          title: 'It writes the letter',
          kind: 'letter',
          to: 'To Ms. Alvarez, special education, Lincoln Elementary',
          before: 'I am requesting a full evaluation of my daughter, Maya Howard, for special education services under the ',
          mark: 'Individuals with Disabilities Education Act',
          after: '. I consent to the evaluation.',
          sent: 'Sent on your yes',
        },
        {
          when: 'Oct 8 · Day 8',
          title: 'No answer, so it follows up',
          kind: 'text',
          in: 'No reply from Lincoln yet. I sent Ms. Alvarez a friendly follow-up and copied the front office.',
          pending: true,
        },
        {
          when: 'Oct 10 · Day 10',
          title: 'The school answers',
          kind: 'reply',
          from: 'Lincoln Elementary',
          text: "Received. Maya's evaluation is scheduled for October 21.",
          track: 'Tracking: day 10 of 60. Due by Nov 29.',
          done: true,
        },
      ],
      alsoLabel: 'It can ask for these too:',
      also: [
        'A ride to school',
        'An interpreter at meetings',
        'Free or reduced-price lunch',
        'The extra time in her plan',
        'A spot in after-school',
      ],
      note: "Axolotl isn't a lawyer. It asks for what your child already qualifies for.",
    },
    school: {
      time: '3:40 PM',
      label: 'At the school gate',
      h2Plain: 'Every family makes Lincoln easier',
      h2Em: 'for the next one.',
      lead: 'Every time Axolotl gets something done at a school, it learns what worked: which office, which form, how long it took. The school checks it and makes it official. The next family just says yes. Nobody\u2019s personal details go into it.',
      steps: [
        { tag: 'One family', text: 'Axolotl finds a way through that works.' },
        { tag: 'Many families', text: 'It keeps working, so it becomes proven.' },
        { tag: 'The school', text: 'Makes it official, and promises how fast.' },
      ],
      link: 'Run a school? Make your first path official',
      // An illustrative path at the example school. The numbers show what a path
      // records; they are not measured results, and the eyebrow says "Example".
      card: {
        eyebrow: 'Example \u00b7 Lincoln Elementary',
        version: 'Path v2',
        title: 'Change who picks up on an early-release day',
        doLabel: 'What you do',
        doText: 'Text Axolotl who\u2019s picking up. Say yes to the message.',
        happensLabel: 'What happens',
        happensText: 'The front office gets it before 11 and confirms the same day.',
        stats: [
          { v: '31', l: 'families used it' },
          { v: '31', l: 'confirmed' },
          { v: '2h 10m', l: 'typical wait' },
        ],
        neverLabel: 'Never shared',
        neverText: 'Why you asked. Custody details. Anything but the adult\u2019s name and phone.',
        stamp: { top: 'Official', name: ['Principal', 'Ruiz'], date: 'Oct 2' },
        stampAlt: 'Made official by Principal Ruiz on October 2',
      },
      moreLabel: 'More paths at Lincoln',
      more: [
        { name: 'Report an absence', status: 'official', official: true },
        { name: 'Request a bus', status: 'official, 5 days', official: true },
        { name: 'Medication at school', status: 'proven' },
        { name: 'Interpreter for a conference', status: 'proven' },
        { name: 'See your child\u2019s records', status: 'new' },
      ],
      note: 'School paths are rolling out with our first pilot schools.',
    },
    dinner: {
      time: '6:30 PM',
      label: 'Dinner',
      h2Plain: 'Who\u2019s got what',
      h2Em: 'this week.',
      lead: 'Your circle is the few people you already trade favors with: the sitter, Grandma, the parent you met at soccer. Tell Axolotl what you need. It asks them, sorts out who\u2019s doing what, and reminds everyone.',
      weekLabel: 'This week',
      week: [
        { day: 'Mon', who: 'You' },
        { day: 'Tue', who: 'You' },
        { day: 'Wed 1:20', who: 'Dana', set: true },
        { day: 'Thu', who: 'Grandma' },
        { day: 'Fri', who: 'Sam', set: true },
      ],
      rules: [
        { h: 'Everyone says yes.', p: 'Nobody is added without agreeing. Anyone can leave, anytime.' },
        { h: 'The plan, not the reason.', p: 'Your circle sees who\u2019s picking up when. Never why you asked.' },
        { h: 'Any language.', p: 'Sam writes in Spanish, Dana reads it in English.' },
      ],
      soon: 'Coming soon \u00b7 Circles',
      circles: 'Join the pilot and you\u2019ll be first to start one.',
    },
    night: {
      time: '9:40 PM',
      label: 'Kids are asleep',
      h2Plain: 'Everything’s',
      h2Em: 'handled.',
      lead: 'Instead of a kitchen table covered in forms, one summary: what went out, what the school confirmed, and what is still waiting.',
      summaryLabel: 'Today, in one summary',
      summary: [
        { title: 'Leo’s health forms', detail: 'Lincoln confirmed · K-1042', done: true },
        { title: 'Noon pickup', detail: 'Grandma collected Leo · office told', done: true },
        { title: 'Ride to Lincoln', detail: 'Requested · district has 10 days', done: false },
        { title: 'Maya’s reading evaluation', detail: 'Requested · clock started Sep 30', done: false },
      ],
      doneWord: 'Done',
      waitingWord: 'Waiting on the school',
      promises: [
        { title: 'Your yes sends it.', body: 'Every email, form and request waits for an explicit yes. A suggestion is not permission.' },
        { title: 'Done means confirmed.', body: 'Only the school’s own confirmation counts. If it can’t confirm, it says so and gives you the link.' },
        { title: 'Never sold.', body: 'Your family’s information is yours. It never asks for your school portal password.' },
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
    h1: 'Every parent deserves an agent.',
    sub: 'Axolotl is your family\'s agent for school. It reads what school sends, handles the forms and pickups, and gets your kid the help they qualify for. Just text. Nothing goes out without your yes.',
    primary: 'Join the pilot',
    secondary: 'See how it works',
    trust:
      'Free during the pilot, in English or Spanish.',
    // The hero visual is the thread the parent actually gets: Axolotl's weekly
    // triage, the parent's yes, and the school's confirmation. Plain text only,
    // the way the product really sends it.
    phone: {
      meta: 'Today',
      metaTime: '7:15 AM',
      thread: [
        { in: 'Eight school emails came in this week. Two things need you.' },
        { out: 'I\u2019m in meetings all day. Can you deal with them?' },
        { in: 'On it. The field trip form for Maya is due Friday \u2014 I filled it in.' },
        { out: 'Send it.' },
        { in: 'Sent. Lincoln confirmed they have it \u2014 reference K-1042.' },
        { in: 'Wednesday\u2019s early release at 1:20: nobody\u2019s set yet. Want me to ask Grandma to get them?' },
        { out: 'Yes please. You\u2019re a lifesaver.' },
        { in: 'Asked. Grandma says she\u2019s got them.' },
        { in: 'Leo\u2019s ride to Lincoln went in to the district under McKinney-Vento. They have ten days to answer.' },
        { in: 'Maya\u2019s reading evaluation is requested as well \u2014 their clock started September 30.' },
        { in: 'The rest is just FYI: picture day, the book fair, spirit week.' },
      ],
      alt: 'Text thread on a phone. Axolotl says eight school emails came in and two things need the parent. The parent, in meetings all day, asks Axolotl to deal with them. Axolotl has filled in Maya\u2019s field trip form and sends it on the parent\u2019s go-ahead, then confirms Lincoln has it, reference K-1042. It also flags that Wednesday\u2019s early release still needs cover; on the parent\u2019s yes it asks Grandma, who says she has them.',
    },
    // The phone no longer draws the folder, but the social card (share.html)
    // still does, so its rows live here.
    folder: {
      label: 'The Howard family',
      tab: 'Howard',
      listLabel: 'What is in this folder',
      annotation: 'just needs your yes',
      rows: [
        {
          label: 'Wednesday: early release at 1:20',
          detail: "Grandma's picking up Leo. She confirmed.",
          status: 'confirmed',
        },
        {
          label: 'Field trip form, due Friday',
          detail: 'Filled in for Maya. Ready to send.',
          status: 'waiting',
          annotated: true,
        },
        {
          label: 'Ride to Lincoln',
          detail: 'Requested from the district under McKinney-Vento.',
          status: 'requested',
        },
        {
          label: "Maya's reading evaluation",
          detail: "Requested September 30. The district's deadline clock started.",
          status: 'requested',
        },
        {
          label: 'Friday pickup',
          detail: "Dana's taking all four kids. Every family said yes.",
          status: 'soon',
          tag: 'Circles',
        },
      ],
    },
  },

  statuses: {
    confirmed: 'Confirmed',
    waiting: 'Waiting for your yes',
    requested: 'Requested, waiting on the district',
    reminder: 'Reminder set',
    soon: 'Coming soon',
  },

  week: {
    h2: 'It keeps the week running.',
    lead: "The early releases, sick days and small asks that assume someone's home at 1:20.",
    stepsLabel: 'What it did',
    shotAlt: 'A text conversation with Axolotl:',
    you: 'You',
    prev: 'Previous',
    next: 'Next',
    trackLabel: 'The week, one screen at a time',
    preview: { domain: 'lincoln.k12.us', title: 'Lincoln Weekly Update' },
    meta: 'Today',
    cols: [
      {
        h3: 'Days off and early releases',
        time: '7:15 AM',
        steps: [
          'Read the district calendar.',
          'Checked it against your shifts.',
          'Texted Grandma on your yes.',
        ],
        turns: [
          { in: 'The district calendar came out. Wednesday is early release at 1:20.' },
          { out: 'I can\u2019t get them \u2014 I\u2019m in meetings until 3.' },
          { in: 'Grandma is first on your backup list. Want me to text her?' },
          { out: 'Please.' },
          { in: 'Here\u2019s what I\u2019ll send: \u201cCan you get Leo and Maya Wednesday? They\u2019re out at 1:20.\u201d' },
          { out: 'Yes' },
          { in: 'Sent. Grandma says she\u2019s got them.' },
          { in: 'I told the office she\u2019s picking them up.' },
          { out: 'You\u2019re the best.' },
          { in: 'I\u2019ll check in Wednesday at noon to make sure.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'Same-day changes',
        time: '11:48 AM',
        steps: [
          'School emailed: dismissal at noon.',
          'Checked your calendar: meetings until 3.',
          'Texted Grandma and told the office.',
        ],
        turns: [
          { in: 'Lincoln emailed. Dismissal at noon today.' },
          { in: 'That\u2019s twelve minutes from now.' },
          { out: 'I can\u2019t leave. I\u2019m in meetings until 3.' },
          { in: 'Grandma is first on your backup list. Want me to text her: \u201cCan you get Leo and Maya at noon? Lincoln moved dismissal up.\u201d' },
          { out: 'Yes \u2014 fast.' },
          { in: 'Sent. Grandma says she\u2019s on her way.' },
          { in: 'Want me to email the office that she\u2019s collecting them?' },
          { out: 'Yes \u2014 and ask them to send Leo down.' },
          { in: 'Sent. The office confirmed. Leo will be waiting at the front.' },
        ],
        status: 'confirmed',
      },
      {
        h3: 'The small asks',
        time: '4:05 PM',
        steps: [
          'Pajama day is Thursday.',
          'Field trip form is due Friday.',
          "Drafted Leo's absence note.",
        ],
        turns: [
          { in: 'Three things this week: pajama day Thursday, the field trip form due Friday, and Leo needs an absence note.' },
          { out: 'He has a dentist appointment Monday morning.' },
          { in: 'Then I\u2019ll write the absence note for Monday and fill in the form.' },
          { out: 'Do you need anything from me?' },
          { in: 'Just a yes. Everything else I have.' },
          { in: 'Ready to send: the absence note and Maya\u2019s field trip form.' },
          { out: 'Yes' },
          { in: 'Both sent. The office confirmed they have them.' },
          { out: 'What about pajama day?' },
          { in: 'Nothing to do \u2014 he just wears pajamas. I\u2019ll remind you Thursday morning.' },
        ],
        status: 'confirmed',
      },
      {
        h3: "Who's got it",
        time: '6:30 PM',
        steps: [
          'Leo\'s pickup Wednesday: Grandma.',
          'Maya\'s form: you.',
          'Dentist Thursday: Sam.',
        ],
        turns: [
          { in: 'Here\u2019s who\u2019s on what this week.' },
          { in: 'Wednesday pickup: Grandma. Maya\u2019s form: you. Dentist Thursday: Sam.' },
          { out: 'Can you check Sam\u2019s still good for Thursday?' },
          { in: 'Want me to text Sam: \u201cStill good to take Leo to the dentist Thursday at 4?\u201d' },
          { out: 'Yes' },
          { in: 'Sent. Sam says yes, 4 o\u2019clock.' },
          { out: 'What about Friday? I might be late.' },
          { in: 'Nobody\u2019s covering Friday yet. Dana is next on your list. Want me to ask her?' },
          { out: 'Yes.' },
          { in: 'Asked. I\u2019ll tell you what she says.' },
        ],
        status: 'confirmed',
      },
    ],
  },

  how: {
    h2: 'Nothing goes out until you say yes.',
    lead: 'Eight emails from school, one deadline that matters, and two forms that have to come back.',
    steps: [
      {
        title: 'It spots the deadline.',
        body: 'Seven of the eight emails are just information. One needs you, with the date attached.',
      },
      {
        title: 'It does the work.',
        body: 'It finds an in-network appointment and fills in both forms.',
      },
      {
        title: 'It waits for your yes.',
        body: 'You see exactly what it will send. Your yes is what sends it.',
      },
      {
        title: 'Done means confirmed.',
        body: 'It only calls something finished when the school confirms it.',
      },
    ],
    stepsLabel: 'How it works, in order',
    phone: {
      contact: 'Axolotl',
      meta: 'Today',
      metaTime: '4:02 PM',
      who: 'Axolotl: ',
      whoParent: 'Parent: ',
      thread: [
        {
          kind: 'in',
          text: "Leo's school sent a note. One thing needs you: kindergarteners need a physical and a dental check on file by October 15.",
        },
        { kind: 'in', text: 'Leo is missing both.' },
        { kind: 'out', text: 'Ugh. Can you sort it out?' },
        {
          kind: 'in',
          text: "On it. His physical is covered in-network, and there's an opening Thursday at 4:10.",
        },
        { kind: 'in', text: 'I filled in both forms while I was there.' },
        { kind: 'out', text: 'Do I have to take him out of school for it?' },
        { kind: 'in', text: 'No \u2014 4:10 is after dismissal. I\u2019ll book it and send the forms.' },
        {
          kind: 'in',
          text: 'Ready to send: Leo Howard, Kindergarten, physical and dental.',
        },
        { kind: 'out', text: 'Yes' },
        {
          kind: 'in',
          text: 'Booked and submitted. Lincoln Elementary confirmed it. Reference K-1042.',
        },
      ],
      caption: 'Example conversation. Fictional school and family.',
      alt: 'Text conversation on a phone: Axolotl says Leo needs a physical and a dental check on file by October 15. The parent asks Axolotl to sort it out. Axolotl finds an in-network appointment, fills in both forms, and shows the ready-to-send details. The parent replies Yes, and Axolotl confirms Lincoln Elementary accepted it, reference K-1042.',
    },
    channel: {
      line: 'Text one number. No app, no portal. English or Spanish.',
      label: 'Things parents send',
      items: [
        { kind: 'text', text: 'Fwd: Lincoln Weekly Update' },
        { kind: 'photo', text: 'Photo of a form' },
        { kind: 'text', text: 'Does the district have summer school?' },
        { kind: 'text', text: 'Leo is out sick today.' },
      ],
    },
  },

  circles: {
    h2: 'Coordinate effortlessly with the people you already trust.',
    soon: 'Coming soon',
    lead: 'Your circle is the people who already help: your partner, your mom, the sitter, the parents you trade with. Soon, Axolotl brings them into one plan — it asks in your words, works out who is doing what, and only commits once everyone says yes. Pickups are the start, not the whole idea.',
    chat: {
      alt: 'Example group chat in the Messages app, showing a circle. The parent says early release is Wednesday at 1:20 and asks if anyone can get Maya. Axolotl asks Dana and Sam. Dana can, if someone covers her Friday. Sam answers in Spanish, and Axolotl translates: Sam has Dana\u2019s Friday. Axolotl confirms the plan and says it will remind them that morning. Grandma offers Thursday, and Axolotl adds it to the week.',
      group: 'You, Dana, Sam, Grandma',
      meta: 'Today',
      metaTime: '6:31 PM',
      messages: [
        { from: 'You', out: true, text: 'Early release Wednesday at 1:20 and I\u2019m at work till 3. Can anyone get Maya?' },
        { from: 'Axolotl', text: 'Dana, Sam: is either of you free Wednesday at 1:20?' },
        { from: 'Dana', text: 'I can, if someone covers my Friday.' },
        { from: 'Sam', text: 'Yo tengo el viernes de Dana.' },
        { from: 'Axolotl', text: 'Sam says they\u2019ve got Dana\u2019s Friday.' },
        { from: 'Axolotl', text: 'Set: Dana has Wednesday, Sam has Friday. I\u2019ll remind you both that morning.' },
        { from: 'Grandma', text: 'And I can do Thursday if anyone needs it.' },
        { from: 'You', out: true, text: 'You\u2019re all the best.' },
        { from: 'Axolotl', text: 'Added to the week. Everyone\u2019s covered.' },
      ],
    },
    listLabel: 'How circles work',
    list: [
      'You never need a circle to get the full help.',
      'A circle sees only the plan, never why a family needs help.',
      'Nothing is agreed until everyone says yes.',
      'It is not only pickups: sick days, the school run, appointment swaps, and passing on what you have learned about a teacher or a program.',
      'Everyone reads and writes in their own language.',
      'If the district owes your family a ride, Axolotl asks the district first.',
      'Axolotl coordinates. It does not drive anyone; the families decide.',
    ],
    // The ring sketch: families who already trade pickups, around one plan.
    // No ticks, no counts — nobody keeps score.
    form: {
      legend: 'Start a circle',
      phoneLabel: 'Your phone number',
      familiesLabel: 'How many families?',
      familiesOptions: ['2 to 3', '4 to 6', '7 or more'],
      schoolLabel: 'School',
      schoolHint: '(optional)',
      submit: 'Start a circle',
      note: "We'll text you when circles open.",
      success: "You're on the list. We'll text you when circles open.",
      errors: {
        phone: 'Enter a 10-digit US phone number.',
        families: 'Choose how many families.',
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
    lead: "We're onboarding a small group of families. Add your number and we'll text you about access. Free during the pilot, in English or Spanish.",
    phoneLabel: 'Your phone number',
    submit: 'Join the pilot',
    note: 'By joining, you agree to receive texts about access.',
    circleLink: 'Start a circle instead',
    questionLink: 'Have a question first?',
    success: "You're on the list. We'll text you at {phone}.",
    error: 'Enter a 10-digit US phone number.',
    generic: "We couldn't save your signup. Please try again.",
  },

  schoolsBand: {
    h2: 'For schools and districts.',
    body: "Parents are writing to school with AI now. Axolotl gives it a front door: requests arrive short, complete and at the right office, routine questions are answered from your own information, and your staff decides the official way things get done. Nothing to install.",
    link: 'How Axolotl works with schools',
  },

  contact: {
    h2: 'Questions.',
    lead: 'Ask about the pilot, or ask a question about how it works. We save your message and reply by email.',
    emailLabel: 'Email',
    messageLabel: 'What would you like to ask?',
    messageHint: '(optional)',
    submit: 'Send',
    note: "We'll use these details to reply. Please don't include your child's records, health information or school passwords.",
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
        body: 'We collect the email address and message you submit so we can reply. Inquiries are stored in our database. Please do not send your child\u2019s records, health information or school passwords.',
      },
      {
        h3: 'The pilot list and school requests',
        body: 'A family or circle signup gives us your phone number, and a circle signup also says how many families and, if you want, your school. A school pilot request gives us your name, role, school or district and email. All of it is stored in our database. A text provider may process your phone number to send a confirmation text.',
      },
      {
        h3: 'This website is not the service',
        body: "These forms do not connect to your school or to your child's records. The site loads fonts from Google Fonts, so your browser makes requests to Google and to our hosting provider when you visit. How the service itself handles your family's information is in the privacy policy.",
      },
      {
        h3: 'Questions about your information?',
        body: 'Use the form above for privacy questions or a request about information you submitted.',
      },
    ],
    link: 'Read the service privacy policy',
  },

  footer: {
    tagline: 'The school agent for parents',
    links: [
      { label: 'Contact', href: '#contact' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Security and trust', href: '/security' },
    ],
  },

  // ── /schools ────────────────────────────────────────────────────────────────
  schools: {
    meta: {
      title: 'Axolotl for schools and districts',
      description:
        "Parents are writing to school with AI. Axolotl is the front door your staff controls: requests arrive short, complete and at the right office, routine questions are answered from your own information, and your staff decides the official way things get done.",
      shareAlt: 'A manila folder of school tasks with a Confirmed stamp on the first row.',
    },
    hero: {
      eyebrow: 'For schools and districts',
      h1Plain: 'Parents’ AI is already writing to you.',
      h1Em: 'Give it a front door.',
      sub: 'More parents now draft school emails with an AI assistant. Axolotl is the front door your staff controls: every request arrives short, complete and at the right office, routine questions are answered from your own information, and your staff decides the official way things get done.',
      primary: 'Talk to us about a pilot',
      secondary: 'See the difference',
    },
    door: {
      h2Plain: 'Same parent, same need.',
      h2Em: 'One you can act on.',
      lead: 'A parent worried about their daughter’s speech asks an AI for help. Without a front door, you get a legal letter sent to everyone on the thread. Through Axolotl, the right office gets one request it can act on today.',
      example: 'Example',
      before: {
        label: 'Without a front door',
        to: 'To: Principal · Cc: Superintendent, School Board',
        subject: 'FORMAL REQUEST pursuant to IDEA, Section 504 and FERPA',
        body: 'Dear Principal Ruiz, I am writing to formally request, pursuant to the Individuals with Disabilities Education Act (20 U.S.C. § 1400 et seq.) and Section 504 of the Rehabilitation Act of 1973, a comprehensive multidisciplinary evaluation of my child in all areas of suspected disability, and I further request that you preserve all records…',
        foot: ['1,380 words', '3 laws cited', 'No grade or classroom', 'Sent to the principal'],
      },
      after: {
        label: 'Through Axolotl',
        to: 'To: Special education coordinator',
        rows: [
          ['Request', 'Evaluation for speech and language'],
          ['Student', 'Maya R., grade 2, Room 12'],
          ['What the parent sees', 'Hard to understand at times; gets upset reading aloud.'],
          ['Attached', 'Signed consent to evaluate'],
          ['Parent prefers', 'Text, in Spanish, after 5 PM'],
        ],
        sent: "Sent with the parent's yes · 7:42 PM",
        foot: ['64 words', 'One office', 'Ready to act on'],
      },
      tensionTitle: 'The requests are coming either way.',
      tensionBody:
        'Evaluations, accommodations, rides and records are obligations your school already has, and AI makes them easier than ever to ask for. The choice is not whether they arrive. It is whether they arrive as long letters to the wrong person or as one complete request to the office that can resolve it.',
    },
    paths: {
      h2Plain: 'Your staff decides',
      h2Em: 'how things get done.',
      lead: 'A path is the official way to get one thing done at your school: what the family sends, which office handles it, and when they hear back. Axolotl learns paths from real families. Your staff makes them official.',
      steps: [
        { tag: 'Learned', text: 'Axolotl sees what actually worked for families at your school: which form, which office, what came back.' },
        { tag: 'Blessed', text: 'Someone on your staff reviews the path, fixes what is wrong, and makes it official with one reply.' },
        { tag: 'Followed', text: 'Every family after that is walked through the official way, in their language, with an honest wait time.' },
      ],
      card: {
        eyebrow: 'Example · Lincoln Elementary',
        version: 'Path v3',
        title: 'Enroll a student mid-year',
        doLabel: 'The family sends',
        doText: 'Proof of address, birth certificate and shot record, in one packet. Phone photos are fine.',
        happensLabel: 'Your office',
        happensText: 'The registrar gets one complete packet and confirms a start date within two school days.',
        stats: [
          { v: '48', l: 'families used it' },
          { v: '2 days', l: 'promised reply' },
          { v: '0', l: 'sent to the wrong office' },
        ],
        neverLabel: 'Never asks for:',
        neverText: "immigration status or a Social Security number. Your school can't require either to enroll.",
        stamp: { top: 'Official', name: ['Registrar', 'Okafor'], date: 'Aug 2026' },
        stampAlt: 'Made official by Registrar Okafor, August 2026',
      },
    },
    staff: {
      h2Plain: 'No dashboard to learn.',
      h2Em: 'Just text it.',
      lead: 'Principals, registrars and teachers use Axolotl the way parents do: by text. Ask what families are stuck on, fix a path in plain words, or describe a new one and approve what it writes.',
      threadLabel: 'A registrar, texting Axolotl',
      thread: [
        { from: 'staff', text: 'What are families stuck on this week?' },
        { from: 'axolotl', text: 'Enrollment: 6 families didn’t know what counts as proof of address. Everything else was answered from your Monday notice.' },
        { from: 'staff', text: 'A lease or any utility bill works. Add that.' },
        { from: 'axolotl', text: 'Done, the enrollment path is v4. Want me to tell those 6 families?' },
        { from: 'staff', text: 'Yes please.' },
      ],
      brief: {
        eyebrow: 'Monday brief · Lincoln Elementary',
        example: 'Example',
        rows: [
          { v: '31', l: 'routine questions answered from your own information', note: 'Bus, calendar, what to bring' },
          { v: '14', l: 'families asked about the Route 9 change', note: 'Answered from your notice' },
          { v: '6', l: 'families stuck on proof of address', note: 'Path updated to v4' },
        ],
        foot: 'Patterns, not people. The brief never shows who asked or what they said.',
      },
    },
    network: {
      h2Plain: 'Every family makes it easier',
      h2Em: 'for the next one.',
      lead: 'Each request that works teaches a path. Each path your staff makes official helps every family after it. Across a district, the paths add up to the manual for how your schools actually work.',
      items: [
        { h: 'For families', p: 'The right way, the first time, in their own language.' },
        { h: 'For your staff', p: 'Fewer repeat questions, fewer requests to re-route, and a weekly view of where families get stuck.' },
        {
          h: 'For every AI',
          p: 'Your official paths, published so any assistant a parent uses, not just Axolotl, sends a complete request to the right office.',
        },
      ],
      note: 'Your paths stay yours. Your staff decides what is published, and can change or retire a path at any time.',
    },
    changes: {
      h2: 'What changes for your staff.',
      lead: 'Families keep up, and requests arrive the way your offices need them.',
      head: ['Today', 'With Axolotl', 'Who benefits'],
      rows: [
        {
          pain: 'Long AI-written requests to the wrong person',
          does: 'One short request with what the office needs, routed to transportation, the McKinney-Vento liaison, special education or the registrar',
          who: 'Principals, liaisons, special education',
        },
        {
          pain: 'Repeat routine questions',
          does: "Answered from your school's own published information first: bus, calendar, what to bring",
          who: 'Front office, teachers',
        },
        {
          pain: 'Forms and deadlines missed',
          does: 'Parents see the one thing that matters; forms come back complete before the deadline',
          who: 'Front office, school nurse',
        },
        {
          pain: 'Hard-to-reach families',
          does: 'Works by text, in Spanish, around work shifts; asks for the evening or phone option',
          who: 'Title I and family engagement staff',
        },
        {
          pain: 'Late arrivals caused by logistics',
          does: 'Parents coordinate pickups in their own circles, so there are fewer "no one could get them" days',
          who: 'Attendance and transportation staff',
        },
        {
          pain: 'Unclaimed programs',
          does: 'Meal applications filed; after-school seats found and signed up',
          who: 'Nutrition services, after-school programs',
        },
      ],
    },
    never: {
      h2: 'What Axolotl will never do.',
      items: [
        { title: 'Report on families.', body: 'Your staff sees only what a parent chooses to send. The brief shows patterns, never people.' },
        { title: 'Sell data.', body: 'Not to vendors, not to advertisers, not to anyone.' },
        { title: 'Make a path official on its own.', body: 'It can suggest a path. Only your staff can make one official.' },
        {
          title: 'Make up an answer.',
          body: 'Routine answers come from your own published information. When it is not sure, it says so and routes the question.',
        },
        {
          title: 'Replace your staff or your obligations.',
          body: 'It helps families use what your school already offers.',
        },
        {
          title: "Send anything without the parent's yes.",
          body: 'Every message and form waits for the parent to approve it.',
        },
      ],
    },
    equity: {
      h2: 'Access and equity.',
      lead: 'The families with the least slack are the ones this has to work for first.',
      items: [
        'English and Spanish, written for a plain reading level.',
        'Works around shifts, and asks for the evening or phone option instead of a mid-morning meeting.',
        'A family that has never written a formal letter gets the same complete, well-routed request as one with a lawyer.',
        'Circles are never required. A family with no one to trade pickups with gets the full help.',
        'Supports your Title I engagement goals: flexible times, a language parents understand, and a yearly look at what worked.',
      ],
    },
    pilot: {
      h2: 'A pilot together.',
      lead: 'One school, a group of families, and your staff making the first paths official.',
      measuresLabel: "What we'd measure",
      measures: [
        'Share of requests that reached the right office the first time.',
        'Days to resolve a rights or services request.',
        'On-time return rate for forms, against last year.',
        'Routine questions answered without a staff member.',
      ],
      consent:
        'Always with family consent. Families choose to join, and a family can leave at any time. Nothing to install: Axolotl starts from what your school already publishes.',
      integration:
        'If your district ever wants a deeper integration, it needs explicit parent consent and a student-privacy agreement first.',
      guardrail:
        'No outcome numbers until a pilot produces real ones. The numbers on this page are examples. We will publish what we measure, including the parts that do not work.',
    },
    form: {
      h2: 'Talk to us about a pilot.',
      lead: "Tell us about your school or district and we'll follow up by email.",
      nameLabel: 'Your name',
      roleLabel: 'Your role',
      schoolLabel: 'School or district',
      emailLabel: 'Email',
      messageLabel: 'Anything we should know?',
      messageHint: '(optional)',
      submit: 'Send',
      note: "We'll use these details to reply. Please don't include student records or health information.",
      success: "Your message is saved. We'll reply to the email you gave us.",
      error: "We couldn't save your message. Please try again.",
      generic: 'Please fill in every field.',
    },
  },
};
