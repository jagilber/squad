/**
 * Tests for `createSquadClientWithPool` (T3) — the runtime-aware factory that
 * wires `createRuntimeProvider` into `SquadClientWithPool`.
 *
 * Two things are under test:
 *  1. The pooled client works end-to-end over the Claude runtime (faked at the
 *     `ClaudeSdkFacade` seam — only the process boundary is replaced).
 *  2. The synchronous `new SquadClientWithPool(config)` surface is unchanged
 *     and still defaults to Copilot (external consumers pin 0.11/0.12).
 *
 * @module test/claude-runtime-pooled-client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  SquadClientWithPool,
  createSquadClientWithPool,
  type CreateSquadClientWithPoolConfig,
} from '../packages/squad-sdk/src/client/index.js';
import { ClaudeRuntimeProvider, type ClaudeSdkFacade } from '../packages/squad-sdk/src/adapter/providers/claude.js';
import { SQUAD_RUNTIME_ENV } from '../packages/squad-sdk/src/adapter/provider.js';

// ── Fake SDK facade (copied verbatim from test/claude-runtime-provider.test.ts;
//    it must end its stream on abortController.abort() or close() tests hang) ──

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

/**
 * `sdk` is a Claude-provider option, not a member of `SquadClientOptions`, so
 * it is threaded through an intersection type rather than a cast — the factory
 * forwards unknown client options to the provider verbatim.
 */
type ClaudeFactoryConfig = CreateSquadClientWithPoolConfig & { sdk: ClaudeSdkFacade };

let squadDir: string;
const writeSquadConfig = (obj: Record<string, unknown>) =>
  writeFileSync(join(squadDir, 'config.json'), JSON.stringify({ version: 1, ...obj }, null, 2));

beforeEach(() => {
  squadDir = mkdtempSync(join(tmpdir(), 'squad-pooled-runtime-'));
});

afterEach(() => {
  rmSync(squadDir, { recursive: true, force: true });
  delete process.env[SQUAD_RUNTIME_ENV];
  vi.restoreAllMocks();
});

// ============================================================================
// Backwards compatibility of the synchronous constructor
// ============================================================================

describe('SquadClientWithPool (synchronous constructor — pinned public surface)', () => {
  it('still constructs a Copilot-backed client from a single config argument', async () => {
    const client = new SquadClientWithPool({ pool: { maxConcurrent: 5 } });
    expect(client.runtimeId).toBe('copilot');
    expect(client.pool).toBeDefined();
    expect(client.eventBus).toBeDefined();
    expect(client.pool.atCapacity).toBe(false);
    expect(client.isConnected()).toBe(false);
    expect(client.getState()).toBe('disconnected');
    await client.pool.shutdown();
  });

  it('ignores SQUAD_RUNTIME entirely — the sync path is Copilot by construction', async () => {
    process.env[SQUAD_RUNTIME_ENV] = 'claude';
    const client = new SquadClientWithPool();
    expect(client.runtimeId).toBe('copilot');
    await client.pool.shutdown();
  });
});

// ============================================================================
// Runtime resolution precedence
// ============================================================================

describe('createSquadClientWithPool runtime precedence', () => {
  it('defaults to copilot with no arguments', async () => {
    const client = await createSquadClientWithPool();
    expect(client.runtimeId).toBe('copilot');
    await client.pool.shutdown();
  });

  it('reads the runtime from .squad/config.json', async () => {
    writeSquadConfig({ runtime: 'claude' });
    const { facade } = makeFakeSdk();
    const client = await createSquadClientWithPool({ squadDir, sdk: facade } as ClaudeFactoryConfig);
    expect(client.runtimeId).toBe('claude');
    await client.shutdown();
  });

  it('SQUAD_RUNTIME env beats the config file', async () => {
    writeSquadConfig({ runtime: 'copilot' });
    process.env[SQUAD_RUNTIME_ENV] = 'claude';
    const { facade } = makeFakeSdk();
    const client = await createSquadClientWithPool({ squadDir, sdk: facade } as ClaudeFactoryConfig);
    expect(client.runtimeId).toBe('claude');
    await client.shutdown();
  });

  it('an explicit runtime option beats both env and config', async () => {
    writeSquadConfig({ runtime: 'claude' });
    process.env[SQUAD_RUNTIME_ENV] = 'claude';
    const client = await createSquadClientWithPool({ squadDir, runtime: 'copilot' });
    expect(client.runtimeId).toBe('copilot');
    await client.pool.shutdown();
  });

  it('ignores the config file when squadDir is not supplied', async () => {
    writeSquadConfig({ runtime: 'claude' });
    const client = await createSquadClientWithPool({});
    expect(client.runtimeId).toBe('copilot');
    await client.pool.shutdown();
  });

  it('throws "Unknown squad runtime" for a garbage value in the config file', async () => {
    writeSquadConfig({ runtime: 'gemini' });
    await expect(createSquadClientWithPool({ squadDir })).rejects.toThrow(
      /Unknown squad runtime "gemini"/
    );
  });

  it('throws "Unknown squad runtime" for a garbage SQUAD_RUNTIME value', async () => {
    process.env[SQUAD_RUNTIME_ENV] = 'gemini';
    await expect(createSquadClientWithPool({ squadDir })).rejects.toThrow(
      /Unknown squad runtime "gemini"/
    );
  });
});

// ============================================================================
// The pooled client over the Claude runtime
// ============================================================================

describe('createSquadClientWithPool over the Claude runtime', () => {
  async function makeClient() {
    writeSquadConfig({ runtime: 'claude' });
    const { facade, calls } = makeFakeSdk();
    const client = await createSquadClientWithPool({
      squadDir,
      pool: { maxConcurrent: 2 },
      sdk: facade,
    } as ClaudeFactoryConfig);
    return { client, calls };
  }

  it('injects a ClaudeRuntimeProvider as the pooled client transport', async () => {
    const { client } = await makeClient();
    // The provider is private; prove it indirectly through connect() state,
    // which only the Claude provider can reach without a Copilot CLI present.
    await client.connect();
    expect(client.isConnected()).toBe(true);
    expect(client.getState()).toBe('connected');
    await client.shutdown();
  });

  it('createSession routes through the provider, joins the pool, and emits on the event bus', async () => {
    const { client, calls } = await makeClient();
    const busEvents: string[] = [];
    client.eventBus.on('session.created', (e) => { busEvents.push(e.type); });

    const session = await client.createSession({ model: 'claude-sonnet-4.6' });

    expect(calls).toHaveLength(1);
    expect(calls[0].options['model']).toBe('claude-sonnet-4-6'); // dots → dashes
    expect(client.pool.size).toBe(1);
    expect(client.pool.get(session.sessionId)).toBeDefined();
    // Two, not one: pre-existing behaviour of the sync path — the pool's own
    // `session.added` is mapped to `session.created` AND `createSession()`
    // emits it explicitly. Recorded here so a future de-dup is a deliberate change.
    expect(busEvents).toEqual(['session.created', 'session.created']);

    await client.shutdown();
  });

  it('a pooled session sends turns and receives translated squad events', async () => {
    const { client, calls } = await makeClient();
    const session = await client.createSession({ model: 'claude-haiku-4.5' });

    const seen: string[] = [];
    for (const t of ['message', 'usage', 'turn_end', 'idle'] as const) {
      session.on(t, (e) => seen.push(e.type));
    }

    await session.sendMessage({ prompt: 'ping from the pool' });
    await flush();
    expect(calls[0].received[0]).toMatchObject({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'ping from the pool' }] },
    });

    calls[0].emit({ type: 'assistant', message: { model: 'claude-haiku-4-5', content: [{ type: 'text', text: 'pong' }] } });
    calls[0].emit({ type: 'result', subtype: 'success', is_error: false, result: 'pong', usage: { input_tokens: 3, output_tokens: 1 } });
    await flush();

    expect(seen).toEqual(['message', 'usage', 'turn_end', 'idle']);
    await client.shutdown();
  });

  it('deleteSession removes the session from the pool and the provider', async () => {
    const { client } = await makeClient();
    const session = await client.createSession({});
    expect(client.pool.size).toBe(1);

    await client.deleteSession(session.sessionId);
    expect(client.pool.size).toBe(0);
    expect(await client.listSessions()).toHaveLength(0);

    await client.shutdown();
  });

  it('enforces pool capacity independently of the runtime', async () => {
    const { client } = await makeClient(); // maxConcurrent: 2
    await client.createSession({});
    await client.createSession({});
    await expect(client.createSession({})).rejects.toThrow(/at capacity/);
    await client.shutdown();
  });

  it('shutdown drains the pool and disconnects the provider', async () => {
    const { client } = await makeClient();
    await client.connect();
    await client.createSession({});
    await client.shutdown();
    expect(client.pool.size).toBe(0);
    expect(client.isConnected()).toBe(false);
  });

  it('constructs the same provider class the standalone factory does', async () => {
    // Guards against the factory quietly falling back to the Copilot client.
    const { facade } = makeFakeSdk();
    const provider = new ClaudeRuntimeProvider({ sdk: facade });
    expect(provider.getState()).toBe('disconnected');
    const { client } = await makeClient();
    expect(client.runtimeId).toBe('claude');
    await client.shutdown();
  });
});
