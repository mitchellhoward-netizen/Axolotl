import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { generateVoiceReply } from './brain.js';

/**
 * Retell "custom LLM" WebSocket server. Retell handles telephony / STT / TTS /
 * turn-taking and opens this socket per call; we generate every spoken reply
 * with the voice brain (DeepSeek + knowledge graph + live web search).
 *
 * Protocol (see https://docs.retellai.com/api-references/llm-websocket):
 *   Retell → us   { interaction_type: call_details | ping_pong | update_only | response_required | reminder_required, ... }
 *   us → Retell   { response_type: config | response | ping_pong, ... }
 *
 * NOTE: field names below follow the Retell docs at build time; verify the
 * config/response event shapes against a live agent on first deploy.
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

    // 3. Begin message: stay silent until we know who we're talking to, then greet warmly.
    ws.send(JSON.stringify({ response_type: 'response', response_id: 0, content: '', content_complete: true, end_call: false }));

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
          if (!greeted) {
            greeted = true;
            ws.send(
              JSON.stringify({
                response_type: 'agent_interrupt',
                interrupt_id: Date.now(),
                content: buildGreeting(callVars),
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
          const reply = await Promise.race([
            generateVoiceReply({
              transcript,
              variables: callVars,
              reminder: msg.interaction_type === 'reminder_required',
              onProgress: (message) => {
                // Narrate what the agent is doing so the caller is never left in silence.
                ws.send(
                  JSON.stringify({
                    response_type: 'agent_interrupt',
                    interrupt_id: Date.now(),
                    content: message,
                  }),
                );
              },
            }),
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

function buildGreeting(vars: Record<string, unknown>): string {
  const first = String(vars.parent_name ?? '').trim().split(/\s+/)[0] ?? '';
  const who = first ? ` ${first}` : ' there';
  return `Hey${who} — thanks for picking up. I'm the school helper you've been texting with, so now I can just talk you through this. What's going on?`;
}

function normalizeTranscript(t: unknown): Array<{ role: string; content: string }> {  if (!Array.isArray(t)) return [];
  return t
    .map((u) => {
      const o = u as Record<string, unknown>;
      return { role: String(o.role ?? 'user'), content: String(o.content ?? '').trim() };
    })
    .filter((u) => u.content);
}
