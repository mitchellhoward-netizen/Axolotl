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

    ws.on('error', (e) => console.error('[voice] ws error:', (e as Error).message));

    // 1. Enable call details (so we get dynamic_variables) + keepalive.
    ws.send(JSON.stringify({ response_type: 'config', config: { call_details: true, auto_reconnect: true } }));

    // 2. Begin message: the assistant introduces itself and waits for the parent.
    ws.send(
      JSON.stringify({
        response_type: 'response',
        response_id: 0,
        content: "Hey — I'm the school assistant. What can I help you with?",
        content_complete: true,
        end_call: false,
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
          break;
        }
        case 'ping_pong': {
          ws.send(JSON.stringify({ response_type: 'ping_pong', timestamp: Date.now() }));
          break;
        }
        case 'response_required':
        case 'reminder_required': {
          const transcript = normalizeTranscript(msg.transcript);
          const reply = await generateVoiceReply({
            transcript,
            variables: callVars,
            reminder: msg.interaction_type === 'reminder_required',
          }).catch(() => "Sorry — one second, could you repeat that?");
          ws.send(
            JSON.stringify({
              response_type: 'response',
              response_id: typeof msg.response_id === 'number' ? msg.response_id : 0,
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

function normalizeTranscript(t: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(t)) return [];
  return t
    .map((u) => {
      const o = u as Record<string, unknown>;
      return { role: String(o.role ?? 'user'), content: String(o.content ?? '').trim() };
    })
    .filter((u) => u.content);
}
