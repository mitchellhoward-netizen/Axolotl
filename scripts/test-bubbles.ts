/** splitIntoBubbles unit tests (multi-bubble replies). */
import { splitIntoBubbles } from '../src/agent/bubbles.js';

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
  // 4. Short one-liner → exactly one bubble.
  {
    const b = splitIntoBubbles('Got it!');
    check('short one-liner: exactly one bubble', b.length === 1 && b[0] === 'Got it!');
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

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('bubbles test error:', (e as Error)?.message ?? e);
  process.exit(1);
});
