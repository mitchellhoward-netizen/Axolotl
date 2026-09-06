import WebSocket from 'ws';

const url = process.argv[2] ?? 'wss://get-axolotl-agent-production.up.railway.app/voice-llm';
console.log('connecting to', url);
const ws = new WebSocket(url);
const done = (code: number) => setTimeout(() => process.exit(code), 100);
ws.on('open', () => console.log('✓ CONNECTED (WS upgrade accepted)'));
ws.on('message', (d) => console.log('✓ SERVER SENT:', String(d).slice(0, 300)));
ws.on('error', (e) => console.log('✗ ERROR:', (e as Error).message));
ws.on('unexpected-response', (_req, res) => console.log('✗ unexpected response:', res.statusCode));
ws.on('close', (code) => {
  console.log('closed, code', code);
  done(code === 1000 ? 0 : 1);
});
setTimeout(() => {
  console.log('(timeout)');
  ws.terminate();
  done(2);
}, 6000);
