import type { IntentName } from '../../domain/intents.js';
import type { IntentEngine } from './engine.js';

/**
 * Deterministic, offline intent classifier. Deliberately ordered so that
 * action intents win over the looser keyword matches below them.
 */
export class RulesIntentEngine implements IntentEngine {
  async detect(text: string): Promise<{ name: IntentName; confidence: number }> {
    const t = text.toLowerCase();

    const rules: Array<[IntentName, RegExp]> = [
      [
        'call_me',
        /call me|give me a call|calling me|call my phone|call me to|show me how you|demonstrate|let me hear you|hear you talk|show me/i,
      ],
      [
        'call_school',
        /\b(call|calling|phone|ring)\b.*\b(school|office|district|attendance|principal|liaison|them|someone|front office)\b/i,
      ],
      [
        'attendance_issue',
        /chronical(ly)? (absent|absenteeism)|absenteeism|attendance (problem|issue|concern|meeting|warning|letter)|won'?t (go to )?school|refus(es|ing)? to (go to )?school|skip(ped|ping)? school|not going to school|keeps (missing|skipping|being absent)|absent (a lot|too much|all the time|again)|truant/i,
      ],
      [
        'onboarding',
        /get (started|set up)|set (me )?up|onboard|first time|new here|i want to (get )?started|let'?s (get )?started|tell me about your (kids|children|family)|my (kids|children|kid|child|son|daughter) (go|goes|attend|attends|is|are) (in|to|at)/i,
      ],
      [
        'mckinney_vento_bus',
        /homeless|displaced|mckinney|mckinny|school of origin|no (permanent|fixed) address|living in (our|a|my|the) (car|motel|hotel|shelter)|transitional housing|couch ?surf|doubled ?up|staying with (family|friends|relatives|someone)|lost (our|my|their) (home|housing)|evict|unaccompanied|school bus|need (a|the) bus|get (a )?bus|bus for|bus to school|\b(ride|rides|transportation|transport)\b|get to school|(get|need|how).*(to school|to class)/i,
      ],
      [
        'schedule_conference',
        /\b(parent[\s-]?teacher|conference|schedule|book|meet(ing)? with|sit ?down with)\b/i,
      ],
      [
        'report_absence',
        /\b(absent|absence|sick|ill|call(ed)? (in|out)|won'?t be (in|at)|miss(ed)? school|excuse|can'?t make it)\b/i,
      ],
      [
        'request_meal_voucher',
        /\b(meal|meals|lunch|breakfast|food|voucher|free[\s-]?and[\s-]?reduced|reduced[- ]price)\b/i,
      ],
      [
        'school_info',
        /\b(principal|address|phone number|where is|located|what schools|which schools|which school|district|bell schedule|school hours|front office)\b/i,
      ],
      [
        'demo_status',
        /did you (actually |really )?(submit|send|file|do|make|book)|is this (real|a demo|actually (sent|submitted))|is this a (real|demo) (submission|test)|did (that|it) (go through|get submitted|actually happen)|are these real|is it (real|actually submitted)|what did you (just )?(do|submit|send)|did (that|it) (work|succeed)/i,
      ],
      [
        'case_status',
        /what'?s (the )?(status|going on|open|next)|what'?s (open|new)|remind me|where (are we|is that)|what (are you|did you) (working on|do|send)|open cases|case status|progress|follow ?up/i,
      ],
      [
        'list_students',
        /\b(which|who are|list|show).*(kid|child|children|student|kids)|(kids|children|students)\??\s*$/i,
      ],
      [
        'help',
        /\b(help|what can you do|menu|options|capabilities|hi|hello|hey|good (morning|afternoon|evening))\b/i,
      ],
    ];

    for (const [name, re] of rules) {
      if (re.test(t)) return { name, confidence: 0.9 };
    }
    return { name: 'unknown', confidence: 0 };
  }
}
