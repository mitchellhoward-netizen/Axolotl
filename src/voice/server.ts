import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { generateVoiceReply } from './brain.js';
import { generateSchoolReply } from './school-brain.js';
import { deferQuestion } from './defer.js';
import { executeVoiceSteps } from './actions.js';
import type { Step } from '../agent/steps/types.js';

/**
 * Retell "custom LLM" WebSocket server. Retell handles telephony / STT / TTS /
 * turn-taking and opens this socket per call; we generate every spoken reply.
 *
 * One socket serves BOTH call kinds, routed by the `call_kind` dynamic variable
 * (set by the caller when placing the call):
 *   - "parent" → the warm, fast parent voice (answer from context, or defer to text)
 *   - "school" → the professional advocate voice (representing the parent)
 *
 * Protocol (see https://docs.retellai.com/api-references/llm-websocket):
 *   Retell → us   { interaction_type: call_details | ping_pong | update_only | response_required | reminder_required, ... }
 *   us → Retell   { response_type: config | response | ping_pong, ... }
 */

export function attachVoiceWebSocket(server: Server): void {
  // Retell may use `wss://host` or `wss://host/voice-llm`. Claim ONLY those paths so a
  // second upgrade handler (the portal-takeover VNC proxy) can own `/connect/*/stream`.
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/' || path === '/voice-llm') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    }
    // every other path is left untouched for another handler
  });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log(`[voice] Retell connected: ${req.url}`);
    let callVars: Record<string, unknown> = {};
    let conversationId = '';
    let latestResponseId = 0;
    let greeted = false;
    // Actions the agent proposed (email/call) awaiting the parent's spoken YES.
    let pendingSteps: Step[] = [];

    ws.on('error', (e) => console.error('[voice] ws error:', (e as Error).message));

    // 1. Enable call details (so we get dynamic_variables) + keepalive.
    ws.send(JSON.stringify({ response_type: 'config', config: { call_details: true, auto_reconnect: true } }));

    // 2. Make the agent snappy and easy to interrupt.
    ws.send(
      JSON.stringify({
        response_type: 'update_agent',
        agent_config: {
          responsiveness: 0.8,
          interruption_sensitivity: 0.9,
          reminder_trigger_ms: 4500,
          reminder_max_count: 2,
        },
      }),
    );

    ws.on('message', async (data: RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(data)) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (msg.interaction_type) {
        case 'call_details': {
          const call = (msg.call ?? msg) as Record<string, unknown>;
          // Retell sends these as `retell_llm_dynamic_variables` + `metadata` on
          // the `call` object (the same names we set in create-phone-call).
          callVars = (call.retell_llm_dynamic_variables ?? call.dynamic_variables ?? msg.retell_llm_dynamic_variables ?? msg.dynamic_variables ?? {}) as Record<string, unknown>;
          const meta = (call.metadata ?? msg.metadata ?? {}) as Record<string, unknown>;
          conversationId = String(meta.conversationId ?? '');
          // Greet once we know the call kind (parent vs school), so the opening
          // line is right for whoever is on the other end.
          if (!greeted) {
            greeted = true;
            ws.send(
              JSON.stringify({
                response_type: 'response',
                response_id: 0,
                content: isSchoolCall(callVars) ? schoolGreeting(callVars) : parentGreeting(),
                content_complete: true,
                end_call: false,
              }),
            );
          }
          break;
        }
        case 'ping_pong': {
          ws.send(JSON.stringify({ response_type: 'ping_pong', timestamp: Date.now() }));
          break;
        }
        case 'response_required':
        case 'reminder_required': {
          const id = typeof msg.response_id === 'number' ? msg.response_id : 0;
          latestResponseId = id;
          const turnStart = Date.now();
          const transcript = normalizeTranscript(msg.transcript);
          const reminder = msg.interaction_type === 'reminder_required';
          const school = isSchoolCall(callVars);

          // The parent just approved a proposed action → execute it + follow up by text.
          if (!school && !reminder && pendingSteps.length && isAffirmative(lastUserUtterance(transcript))) {
            const steps = pendingSteps;
            pendingSteps = [];
            const spoken = await executeVoiceSteps(conversationId, steps);
            if (id !== latestResponseId) break;
            ws.send(
              JSON.stringify({
                response_type: 'response',
                response_id: id,
                content: spoken,
                content_complete: true,
                end_call: false,
              }),
            );
            break;
          }

          const turn = {
            transcript,
            variables: callVars,
            reminder,
            onProgress: (message: string) => {
              // Narrate during slow live research so the caller is never in silence.
              ws.send(
                JSON.stringify({
                  response_type: 'agent_interrupt',
                  interrupt_id: Date.now(),
                  content: message,
                  content_complete: true,
                  no_interruption_allowed: true,
                }),
              );
            },
          };

          const reply = await Promise.race([
            school
              ? generateSchoolReply(turn).then((text) => ({ text, deferred: false, proposedSteps: undefined, endCall: undefined }))
              : generateVoiceReply(turn),
            new Promise<{ text: string; deferred?: boolean; proposedSteps?: Step[]; endCall?: boolean }>((resolve) =>
              setTimeout(() => resolve({ text: 'Still working on that — one sec, just a moment.', deferred: false, proposedSteps: undefined }), 10000),
            ),
          ]).catch(() => ({ text: 'Sorry — one second, could you repeat that?', deferred: false, proposedSteps: undefined, endCall: undefined }));

          // Voice→text handoff: the parent asked something that needs research.
          if (reply.deferred && conversationId) {
            const question = lastUserUtterance(transcript);
            if (question) deferQuestion({ question, conversationId, vars: callVars });
          }
          // Hold proposed actions until the parent says YES on the call.
          if (reply.proposedSteps?.length) pendingSteps = reply.proposedSteps;

          if (id !== latestResponseId) break; // a newer request superseded this one
          console.log(`[voice] turn total ${Date.now() - turnStart}ms`);
          ws.send(
            JSON.stringify({
              response_type: 'response',
              response_id: id,
              content: reply.text,
              content_complete: true,
              end_call: reply.endCall === true,
            }),
          );
          break;
        }
        case 'update_only':
        default:
          break; // no response required
      }
    });

    ws.on('close', () => {
      callVars = {};
    });
  });

  wss.on('error', (e) => console.error('[voice] server error:', (e as Error).message));
}

function isSchoolCall(vars: Record<string, unknown>): boolean {
  return vars.call_kind === 'school';
}

function parentGreeting(): string {
  return "Hey there — thanks for picking up! I'm the school helper you've been texting with. Figured it'd be easier to just talk. What's going on?";
}

function schoolGreeting(vars: Record<string, unknown>): string {
  const parent = String(vars.parent_name ?? 'a parent');
  const student = String(vars.student ?? 'their child');
  const disclosure = String(
    vars.disclosure ?? "I'm an automated assistant, and this call is transcribed for the parent's records.",
  );
  return `Hello — I'm calling on behalf of ${parent} about ${student}. ${disclosure}`;
}

function normalizeTranscript(t: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(t)) return [];
  return t
    .map((u) => {
      const o = u as Record<string, unknown>;
      return { role: String(o.role ?? 'user'), content: String(o.content ?? '').trim() };
    })
    .filter((u) => u.content);
}

/** The most recent caller (user) utterance — the question to hand off to research. */
function lastUserUtterance(transcript: Array<{ role: string; content: string }>): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const turn = transcript[i];
    if (turn && turn.role === 'user') return turn.content;
  }
  return '';
}

/** Is the caller approving a proposed action ("yes, send it")? */
function isAffirmative(text: string): boolean {
  return /^(y|yes|yeah|yep|sure|ok|okay|confirm|go ahead|do it|please|please do|send it|send the|sign .* up)\b/i.test(text.trim());
}
