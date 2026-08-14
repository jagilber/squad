// Spike C: ClaudeRuntimeProvider end-to-end against the REAL agent SDK + claude CLI.
// Verifies: session creation, squad-tool round-trip via in-process MCP server,
// event stream (message_delta/usage/turn_end/idle), sendAndWait result.
import { ClaudeRuntimeProvider } from '../packages/squad-sdk/dist/adapter/providers/claude.js';

const provider = new ClaudeRuntimeProvider();
const events = [];
let toolCalled = null;

const timer = setTimeout(() => { console.log('[spike] TIMEOUT 180s'); report(1); }, 180_000);
async function report(code) {
  clearTimeout(timer);
  console.log('[spike] event types seen:', [...new Set(events.map(e => e.type))].join(', '));
  console.log('[spike] tool called with:', JSON.stringify(toolCalled));
  const usage = events.find(e => e.type === 'usage');
  console.log('[spike] usage:', JSON.stringify(usage));
  await provider.disconnect().catch(() => {});
  process.exit(code);
}

try {
  await provider.connect();
  console.log('[spike] connected; auth:', JSON.stringify(await provider.getAuthStatus()));
  const session = await provider.createSession({
    model: 'claude-haiku-4.5', // Copilot-flavored id — provider must map it
    systemMessage: { mode: 'append', content: 'You are a spike test agent. Be terse.' },
    tools: [{
      name: 'squad.report_status',
      description: 'Report the squad status for an agent. ALWAYS call this when asked about squad status.',
      parameters: { type: 'object', properties: { agent: { type: 'string', description: 'agent name' } }, required: ['agent'] },
      handler: async (args) => { toolCalled = args; return { agent: args.agent, status: 'idle' }; },
    }],
    onPermissionRequest: () => ({ kind: 'approve-once' }),
  });
  console.log('[spike] session created:', session.sessionId);
  for (const t of ['message_delta', 'message', 'usage', 'turn_start', 'turn_end', 'idle', 'error']) {
    session.on(t, (e) => { events.push(e); if (t === 'error') console.log('[spike] error event:', JSON.stringify(e).slice(0, 300)); });
  }
  const result = await session.sendAndWait(
    { prompt: 'Use the squad report_status tool for agent "tester", then reply with exactly: SPIKE-C-OK <status>' },
    150_000,
  );
  console.log('[spike] result:', String(result).slice(0, 200));
  const ok = String(result).includes('SPIKE-C-OK') && toolCalled?.agent === 'tester';
  console.log('[spike] VERDICT:', ok ? 'WORKS (tool round-trip + result)' : 'PARTIAL — inspect output');
  await report(ok ? 0 : 1);
} catch (e) {
  console.log('[spike] EXCEPTION:', e?.stack?.slice(0, 500) ?? e);
  await report(2);
}
