/**
 * Tests for the Claude runtime provider (adapter/providers/claude.ts) and the
 * SquadRuntimeProvider seam (adapter/provider.ts).
 *
 * The agent SDK is faked at the ClaudeSdkFacade seam — only the process
 * boundary is replaced; everything under test is the real implementation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ClaudeRuntimeProvider,
  ClaudeSessionAdapter,
  toClaudeModelId,
  toZodRawShape,
  type ClaudeSdkFacade,
} from '../packages/squad-sdk/src/adapter/providers/claude.js';
import {
  resolveRuntimeId,
  createRuntimeProvider,
  SQUAD_RUNTIME_ENV,
  type SquadRuntimeProvider,
} from '../packages/squad-sdk/src/adapter/provider.js';
import { SquadClient, normalizeToolNameForWire, normalizeToolNameForCopilot } from '../packages/squad-sdk/src/adapter/client.js';
import type { SquadSessionEvent } from '../packages/squad-sdk/src/adapter/types.js';

// ── Fake SDK facade ─────────────────────────────────────────────────────────

interface FakeQueryCall {
  options: Record<string, unknown>;
  emit: (msg: unknown) => void;
  end: () => void;
  received: unknown[];
}

function makeFakeSdk() {
  const calls: FakeQueryCall[] = [];
  const facade: ClaudeSdkFacade = {
    query({ prompt, options }) {
      const outbox: unknown[] = [];
      let resolveNext: ((r: IteratorResult<unknown>) => void) | null = null;
      let ended = false;
      // Mirror the real SDK: an aborted query ends its message stream.
      const abort = (options?.['abortController'] as AbortController | undefined);
      const call: FakeQueryCall = {
        options: options ?? {},
        received: [],
        emit(msg) {
          if (resolveNext) {
            const r = resolveNext; resolveNext = null;
            r({ value: msg, done: false });
          } else outbox.push(msg);
        },
        end() {
          ended = true;
          if (resolveNext) {
            const r = resolveNext; resolveNext = null;
            r({ value: undefined, done: true });
          }
        },
      };
      abort?.signal.addEventListener('abort', () => call.end());
      calls.push(call);
      // Drain the input stream in the background (records sent user turns).
      void (async () => {
        for await (const m of prompt) call.received.push(m);
      })();
      return {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<unknown>> {
              if (outbox.length > 0) return Promise.resolve({ value: outbox.shift(), done: false });
              if (ended) return Promise.resolve({ value: undefined, done: true });
              return new Promise((res) => { resolveNext = res; });
            },
          };
        },
      } as ReturnType<ClaudeSdkFacade['query']>;
    },
    tool(name, description, inputSchema, handler) {
      return { name, description, inputSchema, handler };
    },
    createSdkMcpServer(opts) {
      return { type: 'sdk', name: opts.name, tools: opts.tools };
    },
  };
  return { facade, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete process.env[SQUAD_RUNTIME_ENV];
  vi.restoreAllMocks();
});

// ── Model id mapping ────────────────────────────────────────────────────────

describe('toClaudeModelId', () => {
  it('normalizes Copilot-flavored claude ids (dots → dashes)', () => {
    expect(toClaudeModelId('claude-sonnet-4.6')).toBe('claude-sonnet-4-6');
    expect(toClaudeModelId('claude-opus-4.8')).toBe('claude-opus-4-8');
    expect(toClaudeModelId('claude-haiku-4.5')).toBe('claude-haiku-4-5');
  });

  it('passes through family aliases', () => {
    expect(toClaudeModelId('opus')).toBe('opus');
    expect(toClaudeModelId('sonnet')).toBe('sonnet');
  });

  it('returns undefined for non-claude models (CLI default applies)', () => {
    expect(toClaudeModelId('gpt-5-mini')).toBeUndefined();
    expect(toClaudeModelId('gemini-2.5-pro')).toBeUndefined();
    expect(toClaudeModelId(undefined)).toBeUndefined();
  });
});

// ── JSON Schema → zod shape ─────────────────────────────────────────────────

describe('toZodRawShape', () => {
  it('converts a JSON schema with required/optional/enums', () => {
    const shape = toZodRawShape({
      type: 'object',
      properties: {
        target: { type: 'string', description: 'who' },
        count: { type: 'integer' },
        status: { type: 'string', enum: ['idle', 'busy'] },
      },
      required: ['target'],
    });
    expect(Object.keys(shape).sort()).toEqual(['count', 'status', 'target']);
    expect(shape['target'].safeParse('x').success).toBe(true);
    expect(shape['target'].safeParse(undefined).success).toBe(false); // required
    expect(shape['count'].safeParse(undefined).success).toBe(true);   // optional
    expect(shape['status'].safeParse('busy').success).toBe(true);
    expect(shape['status'].safeParse('nope').success).toBe(false);
  });

  it('returns empty shape for missing parameters', () => {
    expect(toZodRawShape(undefined)).toEqual({});
  });
});

// ── Runtime resolution / factory ────────────────────────────────────────────

describe('resolveRuntimeId / createRuntimeProvider', () => {
  it('defaults to copilot', () => {
    expect(resolveRuntimeId()).toBe('copilot');
  });

  it('honors the SQUAD_RUNTIME env var', () => {
    process.env[SQUAD_RUNTIME_ENV] = 'claude';
    expect(resolveRuntimeId()).toBe('claude');
  });

  it('explicit id wins over env', () => {
    process.env[SQUAD_RUNTIME_ENV] = 'claude';
    expect(resolveRuntimeId('copilot')).toBe('copilot');
  });

  it('throws on unknown runtime ids instead of silently falling back', () => {
    expect(() => resolveRuntimeId('gemini')).toThrow(/Unknown squad runtime/);
  });

  it('constructs the claude provider from the factory', async () => {
    const provider = await createRuntimeProvider({ runtime: 'claude' });
    expect(provider).toBeInstanceOf(ClaudeRuntimeProvider);
  });

  it('SquadClient structurally satisfies SquadRuntimeProvider', () => {
    // Compile-time structural check; also assert the surface at runtime.
    const check: SquadRuntimeProvider = new SquadClient() as SquadRuntimeProvider;
    for (const method of ['connect', 'disconnect', 'createSession', 'resumeSession', 'listModels', 'sendAndWait'] as const) {
      expect(typeof (check as Record<string, unknown>)[method]).toBe('function');
    }
  });

  it('exports the runtime-neutral tool-name alias', () => {
    expect(normalizeToolNameForWire).toBe(normalizeToolNameForCopilot);
    expect(normalizeToolNameForWire('memory.classify')).toBe('memory_classify');
  });
});

// ── Session config translation ──────────────────────────────────────────────

describe('ClaudeRuntimeProvider.createSession config translation', () => {
  it('maps model, effort, system message, tool filters, agents, MCP servers', async () => {
    const { facade, calls } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    await provider.connect();
    await provider.createSession({
      model: 'claude-sonnet-4.6',
      reasoningEffort: 'high',
      workingDirectory: 'C:/work',
      systemMessage: { mode: 'append', content: 'You are FLIGHT.' },
      availableTools: ['squad_route'],
      excludedTools: ['dangerous.tool'],
      customAgents: [{ name: 'tester', description: 'runs tests', prompt: 'You test.', tools: ['Read'] }],
      mcpServers: {
        idx: { type: 'local', command: 'node', args: ['server.js'] },
        web: { type: 'http', url: 'http://127.0.0.1:9' },
         
      } as any,
    });
    expect(calls).toHaveLength(1);
    const o = calls[0].options;
    expect(o['model']).toBe('claude-sonnet-4-6');
    expect(o['effort']).toBe('high');
    expect(o['cwd']).toBe('C:/work');
    expect(o['systemPrompt']).toEqual({ type: 'preset', preset: 'claude_code', append: 'You are FLIGHT.' });
    expect(o['allowedTools']).toEqual(['squad_route']);
    // excludedTools went through wire-name normalization (dots → underscores)
    expect(o['disallowedTools']).toEqual(['dangerous_tool']);
    expect((o['agents'] as Record<string, unknown>)['tester']).toMatchObject({ description: 'runs tests', tools: ['Read'] });
    const mcp = o['mcpServers'] as Record<string, Record<string, unknown>>;
    expect(mcp['idx']).toMatchObject({ type: 'stdio', command: 'node' });
    expect(mcp['web']).toMatchObject({ type: 'http' });
  });

  it('replace-mode system message replaces rather than appends', async () => {
    const { facade, calls } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    await provider.createSession({ systemMessage: { mode: 'replace', content: 'Only this.' } });
    expect(calls[0].options['systemPrompt']).toBe('Only this.');
  });

  it('wraps squad handler tools into an in-process MCP server named squad', async () => {
    const { facade, calls } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    const handler = vi.fn().mockResolvedValue({ ok: true });
    await provider.createSession({
      tools: [{
        name: 'squad.route',
        description: 'route work',
        parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
        handler,
      }],
    });
    const mcp = calls[0].options['mcpServers'] as Record<string, { type: string; name: string; tools: Array<{ name: string; handler: (a: unknown, e: unknown) => Promise<{ content: Array<{ type: string; text: string }> }> }> }>;
    expect(mcp['squad']).toBeDefined();
    expect(mcp['squad'].type).toBe('sdk');
    // Wire name is normalized (dot → underscore), matching the Copilot path.
    expect(mcp['squad'].tools[0].name).toBe('squad_route');
    // Handler results are wrapped as MCP text content.
    const result = await mcp['squad'].tools[0].handler({ target: 'tester' }, {});
    expect(handler).toHaveBeenCalledWith({ target: 'tester' }, expect.objectContaining({ sessionId: expect.any(String) }));
    expect(result.content[0]).toEqual({ type: 'text', text: JSON.stringify({ ok: true }) });
  });

  it('maps the squad permission handler onto canUseTool', async () => {
    const { facade, calls } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    await provider.createSession({
      onPermissionRequest: (req) => ({ kind: req.toolName === 'bad' ? 'denied-by-rules' : 'approve-once' }) as never,
    });
    const canUseTool = calls[0].options['canUseTool'] as (n: string, i: Record<string, unknown>) => Promise<{ behavior: string }>;
    expect((await canUseTool('good', { a: 1 })).behavior).toBe('allow');
    expect((await canUseTool('bad', {})).behavior).toBe('deny');
  });

  it('resume sets options.resume instead of sessionId', async () => {
    const { facade, calls } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    const session = await provider.resumeSession('prior-123', {});
    expect(session.sessionId).toBe('prior-123');
    expect(calls[0].options['resume']).toBe('prior-123');
    expect(calls[0].options['sessionId']).toBeUndefined();
  });

  it('resumeSession refuses an empty id', async () => {
    const { facade } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    await expect(provider.resumeSession('', {})).rejects.toThrow(/non-empty/);
  });
});

// ── Event translation & messaging ───────────────────────────────────────────

describe('ClaudeSessionAdapter events', () => {
  async function makeSession() {
    const { facade, calls } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    const session = await provider.createSession({ model: 'claude-haiku-4.5' });
    return { session, call: calls[0], provider };
  }

  it('translates stream deltas, whole messages, and result into squad events', async () => {
    const { session, call } = await makeSession();
    const events: SquadSessionEvent[] = [];
    for (const t of ['message_delta', 'message', 'usage', 'turn_end', 'idle', 'error'] as const) {
      session.on(t, (e) => events.push(e));
    }
    call.emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } } });
    call.emit({ type: 'assistant', message: { model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'Hello' }] } });
    call.emit({ type: 'result', subtype: 'success', is_error: false, result: 'Hello', usage: { input_tokens: 10, output_tokens: 5 }, modelUsage: { 'claude-haiku-4-5': {} } });
    await flush();
    const types = events.map((e) => e.type);
    expect(types).toEqual(['message_delta', 'message', 'usage', 'turn_end', 'idle']);
    expect(events[0]['deltaContent']).toBe('Hel');
    expect(events[1]['content']).toBe('Hello');
    expect(events[2]).toMatchObject({ inputTokens: 10, outputTokens: 5, model: 'claude-haiku-4-5' });
  });

  it('supports dotted event-name registration (assistant.message_delta)', async () => {
    const { session, call } = await makeSession();
    const events: SquadSessionEvent[] = [];
    session.on('assistant.message_delta' as never, (e) => events.push(e));
    call.emit({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } } });
    await flush();
    expect(events).toHaveLength(1);
  });

  it('emits error (then idle) for an error result', async () => {
    const { session, call } = await makeSession();
    const types: string[] = [];
    for (const t of ['error', 'turn_end', 'idle'] as const) session.on(t, (e) => types.push(e.type));
    call.emit({ type: 'result', subtype: 'error_during_execution', is_error: true, usage: {} });
    await flush();
    expect(types[0]).toBe('error');
    expect(types).toContain('turn_end');
  });

  it('sendMessage pushes a user turn into the query input and emits turn_start', async () => {
    const { session, call } = await makeSession();
    const types: string[] = [];
    session.on('turn_start', (e) => types.push(e.type));
    await session.sendMessage({ prompt: 'do the thing' });
    await flush();
    expect(types).toEqual(['turn_start']);
    expect(call.received).toHaveLength(1);
    expect(call.received[0]).toMatchObject({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'do the thing' }] },
    });
  });

  it('sendAndWait resolves with the result payload', async () => {
    const { session, call } = await makeSession();
    const waiter = session.sendAndWait!({ prompt: 'ping' }, 5_000);
    await flush();
    call.emit({ type: 'result', subtype: 'success', is_error: false, result: 'pong', usage: {} });
    await expect(waiter).resolves.toBe('pong');
  });

  it('sendAndWait times out informatively when no result arrives', async () => {
    const { session } = await makeSession();
    await expect(session.sendAndWait!({ prompt: 'ping' }, 20)).rejects.toThrow(/did not produce a result within 20ms/);
  });

  it('close() ends the session and refuses further sends', async () => {
    const { session, provider } = await makeSession();
     
    await (session as any).close();
    await expect(session.sendMessage({ prompt: 'x' })).rejects.toThrow(/closed/);
    expect(await provider.listSessions()).toHaveLength(0);
  });

  it('lifecycle events fire on create/close', async () => {
    const { facade } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    const seen: string[] = [];
    provider.on((e) => seen.push(e.type));
    const session = await provider.createSession({});
    await provider.deleteSession(session.sessionId);
    await flush();
    expect(seen[0]).toBe('session.created');
    expect(seen).toContain('session.deleted');
  });
});
