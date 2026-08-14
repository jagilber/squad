// Spike B: does `squad watch --agent-cmd "claude --permission-mode bypassPermissions"`
// produce a working claude CLI invocation via buildAgentCommand/spawnAgent?
// Also falsify with a bogus binary.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildAgentCommand, buildCopilotCommand, spawnAgent } from '../packages/squad-cli/dist/cli/commands/watch/agent-spawn.js';

const pExecFile = promisify(execFile);
const ctx = { agentCmd: 'claude --permission-mode bypassPermissions', teamRoot: process.cwd() };
const prompt = 'Reply with exactly the token SPIKE-B-OK and nothing else.';

const a = buildAgentCommand(prompt, ctx);
const b = buildCopilotCommand(prompt, ctx);
console.log('[spike] buildAgentCommand  =>', a.cmd, JSON.stringify(a.args));
console.log('[spike] buildCopilotCommand =>', b.cmd, JSON.stringify(b.args));
console.log('[spike] mcp-config injection skipped:', !b.args.some((x) => String(x).includes('additional-mcp-config') || x === '--yolo'));

// 1) Faithful path: exactly what watch/execute does (stdio ignored, {success,error})
const res = await spawnAgent(a.cmd, a.args, process.cwd(), 180000);
console.log('[spike] spawnAgent result:', JSON.stringify(res));

// 2) Same argv with stdout captured, to prove claude actually answered
try {
  const { stdout } = await pExecFile(a.cmd, a.args, { timeout: 180000, shell: process.platform === 'win32' });
  console.log('[spike] stdout tail:', stdout.slice(-200).trim());
  console.log('[spike] VERDICT claude-path:', stdout.includes('SPIKE-B-OK') ? 'WORKS' : 'RAN BUT UNEXPECTED OUTPUT');
} catch (e) {
  console.log('[spike] captured run failed:', (e?.message || String(e)).slice(0, 300));
  console.log('[spike] VERDICT claude-path: FAILED');
}

// 3) Falsification: bogus binary must fail informatively
const bogus = buildAgentCommand(prompt, { agentCmd: 'definitely-not-a-real-binary-xyz', teamRoot: process.cwd() });
const bogusRes = await spawnAgent(bogus.cmd, bogus.args, process.cwd(), 15000);
console.log('[spike] falsification:', bogusRes.success ? 'FAILED — bogus binary reported success' : `OK — errored: ${String(bogusRes.error).slice(0, 160)}`);
process.exit(0);
