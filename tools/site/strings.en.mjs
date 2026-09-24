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
 *   - Nothing here claims Axolotl texts a backup caregiver on a parent's
 *     behalf. That is not live, so the week bubbles offer a reminder instead.
 *   - Plain words, sentence case, second person, short sentences.
 */

export default {
  lang: 'en',
  locale: 'en_US',

  meta: {
    title: 'Axolotl: help with school, by text, for working parents.',
    description:
      "Axolotl handles early releases, sick days and school paperwork by text, and gets your kid what they're owed. Nothing goes to school without your yes.",
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
    rights: 'Your rights',
    circles: 'Circles',
    limits: 'Limits',
    join: 'Join the pilot',
    langSwitch: 'Español',
    langSwitchHref: '/es',
  },

  exampleCaption:
    'Example conversation. Fictional school and family.',

  hero: {
    h1: "Your family's school assistant.",
    sub: "It reads what school sends, covers the early releases and the sick days, and gets your kid what they're owed. Just text it.",
    primary: 'Join the pilot',
    secondary: 'See how it works',
    trust:
      'Nothing goes to your school without your yes. Free during the pilot, in English or Spanish.',
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
        { in: 'Wednesday\u2019s early release is covered too: Grandma\u2019s got Leo, and she confirmed.' },
        { out: 'You\u2019re a lifesaver.' },
        { in: 'Leo\u2019s ride to Lincoln went in to the district under McKinney-Vento. They have ten days to answer.' },
        { in: 'Maya\u2019s reading evaluation is requested as well \u2014 their clock started September 30.' },
        { in: 'The rest is just FYI: picture day, the book fair, spirit week.' },
      ],
      alt: 'Text thread on a phone. Axolotl says eight school emails came in and two things need the parent. The parent, in meetings all day, asks Axolotl to deal with them. Axolotl has filled in Maya\u2019s field trip form and sends it on the parent\u2019s go-ahead, then confirms Lincoln has it, reference K-1042, and that Grandma is covering Wednesday\u2019s early release.',
    },
    // What Axolotl actually connects to — the messaging line, the parent's own
    // email, the school calendar and the forms it files. Real app icons, supplied
    // by the founder: the flat brand marks simple-icons ships are not the icons a
    // parent would recognise.
    connects: [
      { icon: 'imessage.svg', label: 'iMessage' },
      { icon: 'gmail.png', label: 'Your email' },
      { icon: 'google-calendar.png', label: 'The school calendar' },
      { icon: 'google-forms.png', label: 'Forms, filed' },
    ],
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

  layers: {
    h2: 'Built around your family, and the families around you.',
    lead: 'One agent that knows your family, works with the people who help you, and learns how your school works.',
    cols: [
      {
        h3: 'Your family',
        label: 'Private',
        body: 'Your kids, their schools, your schedule and everything still pending. Only you and the people you add can see it.',
      },
      {
        h3: 'Your people',
        label: 'Household now, circles soon',
        body: 'Your partner, grandma and the sitter see the same plan, and every task has a name on it. Soon: the parent friends you trade pickups with.',
      },
      {
        h3: 'Your school',
        label: 'Shared',
        body: "What Axolotl learns about your school, like the calendar, the early releases and who handles rides, helps every family there. Nobody's personal information is shared.",
      },
    ],
    line: 'Circles make it easier. You never need one to get the full help.',
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
          "Found who's free Wednesday.",
        ],
        turns: [
          { in: 'The district calendar came out. Wednesday is early release at 1:20.' },
          { out: 'I can\u2019t get them \u2014 I\u2019m in meetings until 3.' },
          { in: 'Grandma is free. Want me to ask her?' },
          { out: 'Please.' },
          { in: 'She said yes. Leo is covered at 1:20 on Wednesday.' },
          { out: 'What about Maya? She\u2019s at the other campus.' },
          { in: 'I asked Dana \u2014 she can pick Maya up on her way.' },
          { out: 'Perfect. Thank you.' },
          { in: 'Both names are on the pickup list and the office knows.' },
          { out: 'Does that cover Thursday too?' },
          { in: 'Thursday is a normal day. You\u2019re clear until Friday.' },
        ],
        status: 'waiting',
      },
      {
        h3: 'Same-day changes',
        time: '11:48 AM',
        steps: [
          'School texted: dismissal at noon.',
          'Checked your calendar: meetings until 3.',
          'Grandma is first on your backup list.',
        ],
        turns: [
          { in: 'Lincoln just texted. Dismissal at noon today.' },
          { in: 'That\u2019s twelve minutes from now.' },
          { out: 'I can\u2019t leave. I\u2019m in meetings until 3.' },
          { in: 'Grandma is first on your backup list. Want me to ask her?' },
          { out: 'Yes, please \u2014 go.' },
          { in: 'She\u2019s got them. I told the office the kids are covered.' },
          { out: 'Did you tell Leo?' },
          { in: 'I texted his teacher. She\u2019ll walk him to the office at noon.' },
          { out: 'Thank you. That was fast.' },
          { in: 'Grandma will text you when they\u2019re home.' },
          { in: 'I\u2019ll keep an eye on the school\u2019s messages in case anything else moves.' },
        ],
        status: 'waiting',
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
        status: 'waiting',
      },
      {
        h3: "Who's got it",
        time: '6:30 PM',
        steps: [
          "Leo's pickup Wednesday: Grandma.",
          "Maya's form: you.",
          'Dentist Thursday: Sam.',
        ],
        turns: [
          { in: 'Here\u2019s who\u2019s on what this week.' },
          { in: 'Wednesday pickup: Grandma. Maya\u2019s form: you. Dentist Thursday: Sam.' },
          { out: 'Can you remind Sam about Thursday?' },
          { in: 'Sam sees the same list, and I\u2019ll remind whoever\u2019s on it.' },
          { out: 'What about Friday? I might be late.' },
          { in: 'Dana has all four on Friday \u2014 she confirmed this morning.' },
          { out: 'Great. Anything I\u2019m forgetting?' },
          { in: 'The book fair runs all week. No action unless you want to send money.' },
          { out: 'Skip it.' },
          { in: 'Skipped. I\u2019ll check in Friday afternoon.' },
          { out: 'Thanks.' },
          { in: 'Anytime. Have a good week.' },
        ],
        status: 'reminder',
      },
    ],
  },

  year: {
    h2: "Some of this isn't a favor. It's the law.",
    lead: 'Describe your situation in your own words. Axolotl works out which rule applies, puts the request in writing, and keeps track of the answer.',
    head: ['When you say', 'The rule', 'What Axolotl does'],
    rows: [
      {
        say: '"We lost our apartment and we\'re staying with my sister across town. Can he keep going to his school?"',
        rule: 'McKinney-Vento Act: school stability for kids without steady housing',
        does: 'Finds the district\u2019s transportation contact, requests the ride in writing, and follows up until the route is confirmed.',
      },
      {
        say: '"His teacher says his reading is behind. I don\'t know what I\'m supposed to ask for."',
        rule: 'IDEA: evaluations for special education',
        does: "Drafts your written request for an evaluation, sends it on your yes, and records the date the district's clock started.",
      },
      {
        say: '"The meeting was all in English and I didn\'t understand most of it."',
        rule: 'Title VI, Civil Rights Act: communication in a language you understand',
        does: 'Asks the school in writing for an interpreter and translated documents before the next meeting.',
      },
      {
        say: '"We\'re paying full price for lunch and I think we qualify for help."',
        rule: 'National School Lunch Program: free and reduced-price meals',
        does: 'Fills the application, shows you exactly what it will send, and files it on your yes.',
      },
      {
        say: '"We agreed in the meeting that she gets extra time. It\'s not happening in class."',
        rule: 'Her IEP or 504 plan: accommodations the school agreed to',
        does: "Writes to the school quoting what the plan says, and keeps following up until they confirm it's in place.",
      },
    ],
    line: "Axolotl isn't a lawyer. It helps you use the rules that already protect your child.",
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
    h2: 'Trade pickups with families you trust.',
    soon: 'Coming soon',
    lead: "You already trade pickups over text. Soon, Axolotl can do the asking: it works out each family's part, and only plans it once every family says yes.",
    chat: {
      alt: "Example group chat in the Messages app. The parent says they are both stuck on Wednesday's early release and asks for help. Axolotl reports that Dana is free Wednesday and can take all four kids; Dana agrees if someone covers her Friday pickup, Sam takes Friday, and Axolotl confirms the plan \u2014 Dana Wednesday, Sam Friday.",
      group: 'You, Dana, Sam',
      meta: 'Today',
      metaTime: '8:02 AM',
      messages: [
        { from: 'You', out: true, text: 'We\u2019re both stuck Wednesday \u2014 early release at 1:20. Can anyone help?' },
        { from: 'Axolotl', text: 'I checked with the circle: Dana is free Wednesday and can take all four kids.' },
        { from: 'Dana', text: 'I can, if someone covers my Friday pickup.' },
        { from: 'Sam', text: 'I\u2019ve got your Friday.' },
        { from: 'Dana', text: 'Perfect. I\u2019ll take Wednesday then.' },
        { from: 'Axolotl', text: 'That\u2019s set: Dana has Wednesday, Sam has Friday.' },
        { from: 'You', out: true, text: 'Thank you both. What time do I tell the school?' },
        { from: 'Axolotl', text: '1:20. I\u2019ll put all four names on the pickup list and remind everyone Thursday night.' },
        { from: 'Dana', text: 'Works for me.' },
        { from: 'Axolotl', text: 'Done. If anything changes, I\u2019ll text the group.' },
      ],
    },
    listLabel: 'How circles work',
    list: [
      'You never need a circle to get the full help.',
      'A circle sees only the plan, never why a family needs help.',
      'Nothing is agreed until every family says yes.',
      "Helping out isn't only driving, and nobody keeps score.",
      'Everyone reads and writes in their own language.',
      'If the district owes your family a ride, Axolotl asks the district first.',
      "Axolotl coordinates. It doesn't provide rides; families decide who drives.",
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

  limits: {
    h2: 'The limits, before you find them yourself.',
    lead: 'The honest list. The rest of this page only means something if this part is true.',
    items: [
      {
        title: "It won't send anything without your yes.",
        body: 'Every email, form and submission waits for an explicit yes from you. A suggestion is not permission.',
      },
      {
        title: "It tells you what it can't open.",
        body: 'A sign-in wall, a form that only exists on paper, a district that wants a phone call. It names the wall instead of guessing.',
      },
      {
        title: "It won't pretend a form went through.",
        body: "Done means the school's own confirmation came back. If it can't confirm, it says so and gives you the link.",
      },
      {
        title: "It can't see your school portal.",
        body: 'It never asks for your password. If the portal matters, you sign in yourself and it only reads.',
      },
      {
        title: "It's strongest at reading and research.",
        body: 'A clean form it has handled before is reliable. A complicated new district form may come back to you as a link.',
      },
      {
        title: "It isn't a doctor, a lawyer or the school.",
        body: 'It helps you through the process. Decisions about your child stay with you, your school and your providers.',
      },
    ],
    privacy:
      "Your family's information is yours. It is never sold. The only system that reads your messages is the AI that writes the replies.",
    privacyLinks: [
      { label: 'How we handle information', href: '/privacy' },
      { label: 'Security and limits', href: '/security' },
    ],
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
    body: 'Axolotl helps your families keep up: forms back before the deadline, questions answered from your own information, and requests that arrive complete, in writing and to the right office. Nothing to install.',
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
        'Axolotl helps parents handle what school asks of them, by text. Your staff gets complete forms, clear requests and fewer repeat questions. Nothing to install.',
      shareAlt: 'A manila folder of school tasks with a Confirmed stamp on the first row.',
    },
    hero: {
      h1: 'Families who can finally keep up.',
      sub: 'Axolotl helps parents handle what school asks of them, by text, in English or Spanish. Your staff gets complete forms, clear requests and fewer repeat questions. Nothing to install.',
      primary: 'Talk to us about a pilot',
    },
    changes: {
      h2: 'What changes for your staff.',
      lead: "Axolotl helps your families keep up, without adding anything to your staff's plate.",
      head: ['Today', 'With Axolotl', 'Who benefits'],
      rows: [
        {
          pain: 'Forms and deadlines missed',
          does: 'Parents see the one thing that matters; forms come back complete before the deadline',
          who: 'Front office, school nurse',
        },
        {
          pain: 'Repeat routine questions',
          does: "Answers from the school's own published information first: bus, calendar, what to bring",
          who: 'Front office, teachers',
        },
        {
          pain: 'Hard-to-reach families',
          does: 'Works by text, in Spanish, around work shifts; asks for the evening or phone option',
          who: 'Title I and family engagement staff',
        },
        {
          pain: 'Requests that arrive messy',
          does: 'Rights and services requests arrive in writing, complete, dated and routed to transportation, the McKinney-Vento liaison or special education',
          who: 'Liaisons, special education, transportation',
        },
        {
          pain: 'Late arrivals and absences caused by logistics',
          does: 'Coverage plans now, circles soon, so fewer "no one could get them" days',
          who: 'Attendance and transportation staff',
        },
        {
          pain: 'Unclaimed programs',
          does: 'Meal applications filed; after-school seats found and signed up',
          who: 'Nutrition services, after-school programs',
        },
      ],
    },
    how: {
      h2: 'How it works with your school.',
      lead: 'Nothing to install at the start. Axolotl reads what your school already sends and replies through your normal channels.',
      items: [
        'It reads what you already send: the weekly update, the calendar, the notice home.',
        'It replies through your normal channels, so your staff does not learn a new system.',
        'It routes a request to the right office instead of the front desk.',
        'It counts something as done only when your staff confirms it.',
      ],
      tensionTitle: 'More requests will arrive, not fewer.',
      tensionBody:
        'Evaluations, accommodations and rides are obligations your school already has. Axolotl makes them arrive complete, in writing and routed correctly, so they take less staff time to resolve than the same request made over three phone calls.',
      integration:
        'If your district ever wants a deeper integration, it needs explicit parent consent and a student-privacy agreement first. Until then, Axolotl only uses what families choose to forward.',
    },
    never: {
      h2: 'What Axolotl will never do.',
      items: [
        { title: 'Report on families.', body: 'Your staff sees only what a parent chooses to send.' },
        { title: 'Sell data.', body: 'Not to vendors, not to advertisers, not to anyone.' },
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
        'Circles are never required. A family with no one to trade pickups with gets the full help.',
        'Supports your Title I engagement goals: flexible times, a language parents understand, and a yearly look at what worked.',
      ],
    },
    pilot: {
      h2: 'A pilot together.',
      lead: 'A small group of families, one school, and something you can actually measure.',
      measuresLabel: "What we'd measure",
      measures: [
        'On-time return rate for forms, against last year.',
        'Days to resolve a rights or services request.',
        'Conference and meeting participation among pilot families.',
      ],
      consent:
        'Always with family consent. Families choose to join, and a family can leave at any time.',
      guardrail:
        'No outcome numbers until a pilot produces real ones. We will publish what we measure, including the parts that do not work.',
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
