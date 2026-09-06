import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { generateVoiceReply } from './brain.js';
import { generateSchoolReply } from './school-brain.js';

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
  // No `path` restriction — accept the WS on any path, so a Retell URL of
  // `wss://host` or `wss://host/voice-llm` both connect.
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log(`[voice] Retell connected: ${req.url}`);
    let callVars: Record<string, unknown> = {};
    let latestResponseId = 0;
    let greeted = false;

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
          reminder_trigger_ms: 8000,
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
          callVars = (call.dynamic_variables ?? msg.dynamic_variables ?? {}) as Record<string, unknown>;
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
          const transcript = normalizeTranscript(msg.transcript);
          const reminder = msg.interaction_type === 'reminder_required';
          const turn = { transcript, variables: callVars, reminder };

          const reply = await Promise.race([
            isSchoolCall(callVars) ? generateSchoolReply(turn) : generateVoiceReply(turn),
            new Promise<string>((resolve) => setTimeout(() => resolve('Still working on that — hang tight, just a few more seconds.'), 45000)),
          ]).catch(() => 'Sorry — one second, could you repeat that?');

          if (id !== latestResponseId) break; // a newer request superseded this one
          ws.send(
            JSON.stringify({
              response_type: 'response',
              response_id: id,
              content: reply,
              content_complete: true,
              end_call: false,
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
