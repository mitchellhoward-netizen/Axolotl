/** splitIntoBubbles unit tests (multi-bubble replies). */
import { splitIntoBubbles } from '../src/agent/bubbles.js';
import { openOnboarding } from '../src/agent/onboarding.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${name}`);
  } else {
    fail++;
    console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

async function main() {
  // 1. Plan summary + "Reply YES to confirm or NO to change." — YES line separate + last.
  {
    const b = splitIntoBubbles("Here's the plan for Patrick's speech evaluation.\n\nReply YES to confirm or NO to change.");
    check('plan+YES: 2 bubbles', b.length === 2);
    check('plan+YES: YES line is its own final bubble', /Reply YES/.test(b[1] ?? ''));
    check('plan+YES: plan is bubble 1 (not merged with YES)', /speech evaluation/.test(b[0] ?? ''));
  }
  // 2. 3-sentence answer, no blank line → ≤2 bubbles, never mid-sentence.
  {
    const b = splitIntoBubbles('Your child is eligible for free meals. Just submit the application to the school office. It takes about five minutes.');
    check('3-sentence: ≤2 bubbles', b.length <= 2);
    check('3-sentence: each bubble ends on sentence boundary', b.every((s) => /[.!?]\s*$/.test(s)));
  }
  // 3. Bulleted list → stays one bubble.
  {
    const text = 'Here are the options:\n• ELO-P after-school\n• Library kids programs\n• Free meals';
    const b = splitIntoBubbles(text);
    check('list: stays one bubble', b.length === 1 && /✓|•/.test(b[0] ?? '') && /ELO-P/.test(b[0] ?? ''));
  }
  // 4a. Short content one-liner → exactly one bubble.
  {
    const b = splitIntoBubbles('Yep, Soquel is the right school!');
    check('short one-liner: exactly one bubble', b.length === 1 && b[0] === 'Yep, Soquel is the right school!');
  }
  // 4b. Acknowledgment-only fragment → dropped; preamble stripped from content.
  {
    check('ack-only "Got it!" is dropped', splitIntoBubbles('Got it!').length === 0);
    const b = splitIntoBubbles('Got it! Here\u2019s what I found for Patrick:\n\nFree ELO-P is available.');
    check('preamble stripped from content', b.length >= 1 && !/^got it/i.test(b[0] ?? ''));
  }
  // 5. Clarifying question → its own bubble.
  {
    const b = splitIntoBubbles('I want to help you get this right.\n\nWhat grade is Patrick in?');
    check('question: question is its own bubble', b.length === 2 && /\?/.test(b[1] ?? ''));
  }
  // 6. 5 paragraphs → capped at 3, special still isolated.
  {
    const text = ['p1', 'p2', 'p3', 'p4', 'Reply YES to confirm.'].join('\n\n');
    const b = splitIntoBubbles(text);
    check('5 paragraphs: capped at 3', b.length <= 3);
    check('5 paragraphs: YES still isolated (final)', /Reply YES/.test(b[b.length - 1] ?? ''));
  }
  // 7. Empty/whitespace → [].
  {
    check('empty -> []', splitIntoBubbles('   ').length === 0);
  }
  // 8. The onboarding intro: introduce + explain in BOTH languages in one bubble, then
  //    ask the language question LAST in its own bubble so it is the only thing
  //    answerable yet. Regression guards for the real-thread bugs: it used to open with
  //    a bare question, explain itself in English only, and ask for the email twice.
  {
    const b = splitIntoBubbles(openOnboarding().text);
    check('intro: exactly 2 bubbles', b.length === 2, String(b.length));
    const intro = b[0] ?? '';
    check('intro: introduces Axolotl in English', /Hi, I'm Axolotl/.test(intro));
    check('intro: says what it does in English', /email the school/i.test(intro) && /fill out forms/i.test(intro) && /calls/i.test(intro));
    check('intro: privacy promise in English', /private by design/i.test(intro) && /never sold/i.test(intro) && /without your permission/i.test(intro));
    check('intro: says who reads their messages in English', /only system that reads your messages/i.test(intro));
    check('intro: introduces Axolotl in Spanish too', /Hola, soy Axolotl/.test(intro));
    check('intro: says what it does in Spanish', /escribo a la escuela/i.test(intro) && /formularios/i.test(intro));
    check('intro: privacy promise in Spanish', /privado por diseño/i.test(intro) && /nunca la vendemos/i.test(intro) && /sin tu permiso/i.test(intro));
    check('intro: language question is its own final bubble, both languages', /Which language do you prefer, English or Spanish\?/.test(b[1] ?? '') && /¿Qué idioma prefieres, inglés o español\?/.test(b[1] ?? ''));
    check('intro: only the last bubble asks anything', /\?/.test(b[1] ?? '') && !/\?/.test(intro));
    check('intro: it does NOT ask for the email (the brain asks once, after the answer)', !/\bemail address\b/i.test(b.join(' ')) && !/correo/i.test(b.join(' ')));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('bubbles test error:', (e as Error)?.message ?? e);
  process.exit(1);
});
