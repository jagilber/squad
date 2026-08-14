// Spike A: does copilot-sdk 1.0.9 (CLI 1.0.79) honor SquadSessionConfig.provider (BYOK)?
// Method: point provider.baseUrl at a local HTTP listener; if the runtime routes the
// session's model traffic there, BYOK is live. Falsifiable: no request => not honored.
import http from 'node:http';
import { SquadClient } from '../packages/squad-sdk/dist/adapter/client.js';

const requests = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    requests.push({ method: req.method, url: req.url, auth: {
      'x-api-key': req.headers['x-api-key'],
      authorization: req.headers['authorization'],
      'anthropic-version': req.headers['anthropic-version'],
    }, body: body.slice(0, 400) });
    console.log(`[fake-anthropic] ${req.method} ${req.url}`);
    let stream = false;
    try { stream = JSON.parse(body || '{}').stream === true; } catch {}
    if (stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`);
      ev('message_start', { type: 'message_start', message: { id: 'msg_spike', type: 'message', role: 'assistant', model: 'spike', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
      ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'BYOK-OK' } });
      ev('content_block_stop', { type: 'content_block_stop', index: 0 });
      ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } });
      ev('message_stop', { type: 'message_stop' });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_spike', type: 'message', role: 'assistant', model: 'spike', content: [{ type: 'text', text: 'BYOK-OK' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 2 } }));
    }
  });
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`[spike] fake anthropic endpoint: ${base}`);

const timeout = setTimeout(() => { console.log('[spike] TIMEOUT (90s)'); finish(1); }, 90000);

async function finish(code) {
  clearTimeout(timeout);
  console.log(`[spike] requests received by fake endpoint: ${requests.length}`);
  for (const r of requests) console.log(JSON.stringify(r, null, 1));
  console.log(`[spike] VERDICT: ${requests.length > 0 ? 'BYOK provider IS honored (traffic routed to custom baseUrl)' : 'BYOK provider NOT honored (no traffic to custom baseUrl)'}`);
  server.close();
  try { await client.forceDisconnect?.(); } catch {}
  process.exit(code);
}

const client = new SquadClient({ useStdio: true, logLevel: 'error', autoStart: true });
try {
  await client.connect();
  console.log('[spike] connected to copilot runtime');
  const session = await client.createSession({
    model: 'claude-haiku-4-5',
    provider: { type: 'anthropic', baseUrl: base, apiKey: 'spike-test-key' },
    systemMessage: { mode: 'replace', content: 'You are a test. Reply with one word.' },
  });
  console.log(`[spike] session created: ${session.sessionId}`);
  session.on('message', (m) => console.log('[spike] message event:', JSON.stringify(m).slice(0, 200)));
  session.on('error', (e) => console.log('[spike] error event:', JSON.stringify(e).slice(0, 300)));
  session.on('idle', () => { console.log('[spike] idle'); finish(0); });
  await session.sendMessage({ prompt: 'ping' });
  console.log('[spike] message sent, waiting for idle...');
} catch (e) {
  console.log('[spike] EXCEPTION:', e?.message || e);
  finish(2);
}
