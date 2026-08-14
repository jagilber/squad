/**
 * Claude runtime provider — {@link SquadRuntimeProvider} backed by the
 * Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 *
 * Sessions are long-lived `query()` calls in streaming-input mode: each
 * `sendMessage()` pushes one user turn into the query's async input stream,
 * and the message pump translates the SDK's stream into Squad's short event
 * vocabulary (`message_delta`, `message`, `usage`, `turn_start`, `turn_end`,
 * `idle`, `error`) — the same names `CopilotSessionAdapter` produces, so
 * every downstream consumer works unchanged.
 *
 * Design notes:
 * - The SDK is reached exclusively through the injectable {@link ClaudeSdkFacade}
 *   (transport seam, mirrors copilot-ui's `ClaudeTransport`): tests fake the
 *   facade, production resolves it with a dynamic `import()` so the optional
 *   dependency never loads on the Copilot path.
 * - Squad `tools` (in-process handler tools) are exposed to the model as an
 *   in-process SDK MCP server named `squad`. Wire names reuse the same
 *   normalization as the Copilot path (Anthropic enforces the same
 *   `^[a-zA-Z0-9_-]+$` tool-name grammar).
 * - Credentials: the claude CLI's own logged-in identity (or
 *   `ANTHROPIC_API_KEY` when set). Nothing here strips or injects keys.
 *
 * @module adapter/providers/claude
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { normalizeToolsInConfig } from '../client.js';
import type { SquadConnectionState, SquadClientOptions } from '../client.js';
import type { SquadRuntimeProvider } from '../provider.js';
import type {
  SquadSessionConfig,
  SquadSession,
  SquadSessionEvent,
  SquadSessionEventHandler,
  SquadSessionEventType,
  SquadSessionMetadata,
  SquadGetAuthStatusResponse,
  SquadGetStatusResponse,
  SquadModelInfo,
  SquadMessageOptions,
  SquadClientEventType,
  SquadClientEvent,
  SquadClientEventHandler,
  SquadTool,
} from '../types.js';

// ============================================================================
// SDK facade (transport seam)
// ============================================================================

/** Minimal message shape consumed from the agent SDK stream. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkMessage = any;

/**
 * The object `query()` returns: the SDK message stream **and** the control
 * surface hanging off it.
 *
 * `interrupt()` is the agent SDK's turn-level cancellation control (see
 * `Query.interrupt()` in `@anthropic-ai/claude-agent-sdk/sdk.d.ts`). It is
 * documented as "only supported when streaming input/output is used" — which
 * is exactly the mode this provider runs in — and it aborts the *in-flight
 * turn* while leaving the query (and therefore the session) alive to accept
 * further input. It is typed optional here because older CLI/SDK builds may
 * not expose it; {@link ClaudeSessionAdapter.abort} degrades loudly when it is
 * missing rather than pretending turn-level abort happened.
 */
export type ClaudeQuery = AsyncIterable<SdkMessage> & {
  interrupt?(): Promise<unknown>;
};

/** The slice of `@anthropic-ai/claude-agent-sdk` this provider consumes. */
export interface ClaudeSdkFacade {
  query(params: { prompt: AsyncIterable<SdkMessage>; options?: Record<string, unknown> }): ClaudeQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(name: string, description: string, inputSchema: any, handler: (args: any, extra: unknown) => Promise<any>): unknown;
  createSdkMcpServer(options: { name: string; version?: string; tools?: unknown[] }): unknown;
}

/** Resolve the real SDK facade via dynamic import (production path). */
export async function loadDefaultClaudeSdk(): Promise<ClaudeSdkFacade> {
  let mod: Record<string, unknown>;
  try {
    // The specifier is computed so TypeScript does not require the optional
    // peer dependency's type declarations to be installed.
    const specifier = '@anthropic-ai/claude-agent-sdk';
    mod = await import(specifier);
  } catch (err) {
    throw new Error(
      'The claude runtime requires the optional dependency "@anthropic-ai/claude-agent-sdk". ' +
      'Install it (npm i @anthropic-ai/claude-agent-sdk) or select the copilot runtime. ' +
      `Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return mod as unknown as ClaudeSdkFacade;
}

// ============================================================================
// Model id mapping (Copilot-flavored ids → Anthropic/claude-CLI ids)
// ============================================================================

/**
 * Map a Squad/Copilot-flavored model id (e.g. `claude-sonnet-4.6`) to an id
 * the claude CLI accepts. Strategy:
 * 1. exact override map
 * 2. dot→dash normalization for `claude-*` ids (`claude-sonnet-4.6` → `claude-sonnet-4-6`)
 * 3. family alias fallback (`opus` / `sonnet` / `haiku` / `fable`)
 * 4. non-Claude models (gpt-*, gemini-*) → `undefined` (CLI default applies)
 *
 * Family aliases are returned bare and left for the CLI to resolve to its
 * current newest member, rather than being pinned to a hard-coded catalog id
 * here — so this mapping cannot go stale as new models ship.
 *
 * The alias set is EMPIRICAL, not guessed. Measured against claude 2.1.224 on
 * 2026-08-14 — `claude --model <alias> -p ...` returned a normal completion for
 * each of opus, sonnet, haiku and fable. Re-measure before adding to this list;
 * an alias the CLI does not accept is not an error, it silently serves a
 * different model (see CLAUDE_MODEL_ALIASES tests).
 */
export const CLAUDE_MODEL_ALIASES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

const CLAUDE_ALIAS_RE = new RegExp(`^(${CLAUDE_MODEL_ALIASES.join('|')})$`);

export function toClaudeModelId(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const m = model.trim().toLowerCase();
  if (!m.includes('claude') && !CLAUDE_ALIAS_RE.test(m)) {
    return undefined; // gpt-*, gemini-*, … — not servable on this runtime
  }
  if (CLAUDE_ALIAS_RE.test(m)) return m;
  const dashed = m.replace(/\./g, '-');
  if (/^claude-[a-z]+-\d/.test(dashed)) return dashed;
  // Unrecognized claude-ish id — fall back to the family alias.
  for (const family of CLAUDE_MODEL_ALIASES) {
    if (m.includes(family)) return family;
  }
  return undefined;
}

// ============================================================================
// JSON Schema → zod raw shape (for the SDK's tool() helper)
// ============================================================================

/**
 * Convert a Squad tool `parameters` value into a zod raw shape for the agent
 * SDK's `tool()` helper. Accepts either a zod object schema (its `.shape` is
 * used directly) or a plain JSON Schema object (converted best-effort:
 * string/number/integer/boolean/enum/array/object).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toZodRawShape(parameters: unknown): Record<string, any> {
  if (!parameters || typeof parameters !== 'object') return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = parameters as any;
  if (p.shape && typeof p.shape === 'object') return p.shape; // zod object schema
  if (p._def?.shape) return typeof p._def.shape === 'function' ? p._def.shape() : p._def.shape;
  const props: Record<string, unknown> = p.properties ?? {};
  const required: string[] = Array.isArray(p.required) ? p.required : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shape: Record<string, any> = {};
  for (const [key, raw] of Object.entries(props)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = raw as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let schema: any;
    if (Array.isArray(prop?.enum) && prop.enum.length > 0) {
      schema = z.enum(prop.enum as [string, ...string[]]);
    } else {
      switch (prop?.type) {
        case 'string': schema = z.string(); break;
        case 'number':
        case 'integer': schema = z.number(); break;
        case 'boolean': schema = z.boolean(); break;
        case 'array': schema = z.array(z.unknown()); break;
        case 'object': schema = z.record(z.string(), z.unknown()); break;
        default: schema = z.unknown();
      }
    }
    if (typeof prop?.description === 'string') schema = schema.describe(prop.description);
    if (!required.includes(key)) schema = schema.optional();
    shape[key] = schema;
  }
  return shape;
}

// ============================================================================
// Session adapter
// ============================================================================

/** Simple push-based async iterable used as the query's streaming input. */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private resolvers: Array<(r: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const resolve = this.resolvers.shift();
    if (resolve) resolve({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    for (const resolve of this.resolvers.splice(0)) {
      resolve({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.items.length > 0) {
          return Promise.resolve({ value: this.items.shift() as T, done: false });
        }
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.resolvers.push(resolve));
      },
    };
  }
}

/** Squad short-name ↔ dotted-name aliases, mirroring CopilotSessionAdapter. */
const DOTTED_ALIAS: Record<string, string> = {
  'message_delta': 'assistant.message_delta',
  'message': 'assistant.message',
  'usage': 'assistant.usage',
  'reasoning_delta': 'assistant.reasoning_delta',
  'reasoning': 'assistant.reasoning',
  'turn_start': 'assistant.turn_start',
  'turn_end': 'assistant.turn_end',
  'intent': 'assistant.intent',
  'idle': 'session.idle',
  'error': 'session.error',
};
const SHORT_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(DOTTED_ALIAS).map(([k, v]) => [v, k])
);

// ── Transcript ─────────────────────────────────────────────────────────────

/**
 * Hard cap on how many turns a single {@link ClaudeSessionAdapter} retains for
 * {@link ClaudeSessionAdapter.getMessages}.
 *
 * A long-lived session streams unboundedly, so the transcript is a bounded
 * ring: once it is full the **oldest** entries are evicted. Eviction is never
 * silent — `getMessages()` prepends a `role: 'system'` notice carrying
 * `truncated: { droppedCount, limit }`, and the running count is also readable
 * via {@link ClaudeSessionAdapter.droppedTranscriptEntries}.
 *
 * 500 entries ≈ 250 user/assistant exchanges, which comfortably covers the
 * "does this session have history / when was it last active" questions hosts
 * ask of `getMessages()` without pinning an unbounded amount of model output
 * in memory.
 */
export const CLAUDE_TRANSCRIPT_MAX_ENTRIES = 500;

/** One retained turn of a Claude session transcript. */
export interface ClaudeTranscriptEntry {
  /**
   * `user` / `assistant` are real turns. `system` is only ever used for the
   * synthetic truncation notice `getMessages()` prepends.
   */
  role: 'user' | 'assistant' | 'system';
  /** Flattened text of the turn (may be empty for a tool-only assistant turn). */
  content: string;
  /** ISO-8601 time the entry was recorded by this adapter. */
  timestamp: string;
  sessionId: string;
  /** Model reported by the SDK for an assistant turn, when present. */
  model?: string;
  /** Names of tools the assistant invoked in this turn, when any. */
  toolUses?: string[];
  /** Attachments carried by a user turn, as supplied to `sendMessage()`. */
  attachments?: SquadMessageOptions['attachments'];
  /** Set only on the synthetic truncation notice. */
  truncated?: { droppedCount: number; limit: number };
}

/**
 * `SquadSession` over a streaming-input agent-SDK query.
 */
export class ClaudeSessionAdapter implements SquadSession {
  readonly sessionId: string;
  private readonly input: AsyncQueue<SdkMessage>;
  private readonly stream: ClaudeQuery;
  private readonly handlers = new Map<string, Set<SquadSessionEventHandler>>();
  private readonly resultWaiters: Array<(result: unknown) => void> = [];
  private readonly model: string | undefined;
  private readonly abortController: AbortController;
  private readonly transcript: ClaudeTranscriptEntry[] = [];
  private readonly transcriptLimit = CLAUDE_TRANSCRIPT_MAX_ENTRIES;
  private transcriptDropped = 0;
  /** Set by `abort()` so the interrupted turn's `result` is not reported as an error. */
  private interruptRequested = false;
  private closed = false;
  private pumpDone: Promise<void>;

  constructor(opts: {
    sessionId: string;
    input: AsyncQueue<SdkMessage>;
    /** The `query()` return value — message stream *and* control surface. */
    stream: ClaudeQuery;
    model?: string;
    abortController: AbortController;
    onClosed?: (sessionId: string) => void;
  }) {
    this.sessionId = opts.sessionId;
    this.input = opts.input;
    this.stream = opts.stream;
    this.model = opts.model;
    this.abortController = opts.abortController;
    this.pumpDone = this.pump(opts.stream, opts.onClosed);
  }

  /** How many transcript entries have been evicted by the bounded-ring cap. */
  get droppedTranscriptEntries(): number {
    return this.transcriptDropped;
  }

  // ── Event surface ──────────────────────────────────────────────────────

  on(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
    const key = SHORT_ALIAS[eventType] ?? eventType;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler);
  }

  off(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
    const key = SHORT_ALIAS[eventType] ?? eventType;
    this.handlers.get(key)?.delete(handler);
  }

  private dispatch(event: SquadSessionEvent): void {
    const targets = this.handlers.get(event.type);
    if (!targets) return;
    for (const handler of [...targets]) {
      try {
        handler(event);
      } catch {
        // A consumer handler throwing must not kill the pump.
      }
    }
  }

  // ── Message surface ────────────────────────────────────────────────────

  /**
   * Push one user turn into the query's streaming input.
   *
   * `options.attachments` are translated into additional `text` content blocks
   * appended after the prompt, so every attachment's path reaches the model
   * (see {@link renderAttachment} for the per-variant mapping). Nothing is ever
   * dropped silently: an attachment this adapter cannot map is passed through
   * as JSON **and** raises a session `error` event.
   */
  async sendMessage(options: SquadMessageOptions): Promise<void> {
    if (this.closed) throw new Error(`Claude session ${this.sessionId} is closed.`);
    const content = this.buildUserContent(options);
    this.dispatch({ type: 'turn_start' });
    this.recordTranscript({
      role: 'user',
      content: content.map((b) => b.text).join('\n\n'),
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    });
    this.input.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: this.sessionId,
    });
  }

  /** Prompt block + one block per attachment. */
  private buildUserContent(options: SquadMessageOptions): Array<{ type: 'text'; text: string }> {
    const blocks: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: options.prompt }];
    for (const attachment of options.attachments ?? []) {
      blocks.push({ type: 'text', text: this.renderAttachment(attachment) });
    }
    return blocks;
  }

  /**
   * Render one {@link SquadMessageOptions.attachments} entry as prompt text.
   *
   * Mapping (the agent SDK's user turns are text content blocks, so every
   * variant becomes a labelled text block the model can act on — the claude
   * CLI's own file tools resolve the emitted paths):
   *
   * | variant     | rendered as                                                       |
   * |-------------|-------------------------------------------------------------------|
   * | `file`      | `[attachment:file] <path> (<displayName>)`                          |
   * | `directory` | `[attachment:directory] <path> (<displayName>)`                     |
   * | `selection` | `[attachment:selection] <filePath>#L<start>-L<end> (<displayName>)` plus the selected text in a fenced block when `text` is supplied |
   *
   * `selection` line numbers are rendered 1-based (the contract's
   * `line`/`character` are 0-based, editor-style).
   *
   * A variant this adapter does not recognize, or one missing its path, is
   * emitted as `[attachment:unmapped] <json>` **and** reported through a
   * session `error` event — visible degradation, never a silent drop.
   */
  private renderAttachment(attachment: NonNullable<SquadMessageOptions['attachments']>[number]): string {
    const a = attachment as unknown as Record<string, unknown>;
    const displayName = typeof a['displayName'] === 'string' && a['displayName'] ? ` (${a['displayName']})` : '';
    const kind = typeof a['type'] === 'string' ? a['type'] : '';

    if (kind === 'file' || kind === 'directory') {
      const path = typeof a['path'] === 'string' ? a['path'].trim() : '';
      if (!path) return this.unmappedAttachment(attachment, `${kind} attachment has no "path"`);
      return `[attachment:${kind}] ${path}${displayName}`;
    }

    if (kind === 'selection') {
      const filePath = typeof a['filePath'] === 'string' ? a['filePath'].trim() : '';
      if (!filePath) return this.unmappedAttachment(attachment, 'selection attachment has no "filePath"');
      const sel = a['selection'] as { start?: { line?: number }; end?: { line?: number } } | undefined;
      const start = typeof sel?.start?.line === 'number' ? sel.start.line + 1 : undefined;
      const end = typeof sel?.end?.line === 'number' ? sel.end.line + 1 : undefined;
      const range = start !== undefined && end !== undefined ? `#L${start}-L${end}` : '';
      const text = typeof a['text'] === 'string' && a['text'] ? `\n\`\`\`\n${a['text']}\n\`\`\`` : '';
      return `[attachment:selection] ${filePath}${range}${displayName}${text}`;
    }

    return this.unmappedAttachment(attachment, `unsupported attachment type ${JSON.stringify(kind)}`);
  }

  /** Loud fallback: keep the payload in the prompt and surface an error event. */
  private unmappedAttachment(attachment: unknown, reason: string): string {
    const json = JSON.stringify(attachment);
    this.dispatch({
      type: 'error',
      message:
        `Claude session ${this.sessionId}: ${reason}. The attachment was forwarded to the model ` +
        `as raw JSON rather than dropped, but it will not be interpreted as a file reference: ${json}`,
    });
    return `[attachment:unmapped] ${json}`;
  }

  async sendAndWait(options: SquadMessageOptions, timeout = 60_000): Promise<unknown> {
    const waiter = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.resultWaiters.indexOf(settle);
        if (idx >= 0) this.resultWaiters.splice(idx, 1);
        reject(new Error(`Claude session ${this.sessionId} did not produce a result within ${timeout}ms.`));
      }, timeout);
      const settle = (result: unknown) => {
        clearTimeout(timer);
        resolve(result);
      };
      this.resultWaiters.push(settle);
    });
    await this.sendMessage(options);
    return waiter;
  }

  /**
   * Abort the **current turn**, leaving the session usable.
   *
   * Implemented with the agent SDK's own `query.interrupt()` control request,
   * which is available precisely because this provider runs in streaming-input
   * mode. The query — and therefore the underlying CLI session, its context and
   * its resume id — survives, so a subsequent `sendMessage()` works normally.
   * The interrupted turn still produces a `result` frame; the pump recognizes
   * its `terminal_reason` (`aborted_streaming` / `aborted_tools`) and closes the
   * turn with `turn_end` + `idle` instead of a spurious `error`.
   *
   * Degradation, both loud:
   * - If the loaded SDK build exposes no `interrupt()`, this falls back to
   *   aborting the whole session (the pre-existing behaviour) **and** emits an
   *   `error` event saying so — subsequent `sendMessage()` calls will throw
   *   `Claude session <id> is closed.`
   * - If `interrupt()` rejects, the error is emitted as a session `error` event
   *   and rethrown; the session is left alone rather than silently torn down.
   *
   * No-op on an already-closed session.
   */
  async abort(): Promise<void> {
    if (this.closed) return;

    const interrupt = this.stream.interrupt;
    if (typeof interrupt !== 'function') {
      this.dispatch({
        type: 'error',
        message:
          `Claude session ${this.sessionId}: the loaded @anthropic-ai/claude-agent-sdk build exposes no ` +
          `query.interrupt(), so abort() terminated the whole session rather than just the current turn. ` +
          `Further sendMessage() calls on this session will throw.`,
      });
      this.abortController.abort();
      return;
    }

    this.interruptRequested = true;
    try {
      await interrupt.call(this.stream);
    } catch (err) {
      this.interruptRequested = false;
      const message = err instanceof Error ? err.message : String(err);
      this.dispatch({
        type: 'error',
        message: `Claude session ${this.sessionId}: interrupt failed, the turn may still be running — ${message}`,
      });
      throw err instanceof Error ? err : new Error(message);
    }
  }

  /**
   * The session transcript accumulated by the message pump.
   *
   * Contains the user turns this adapter sent (including their rendered
   * attachments) and the assistant turns the SDK streamed back, oldest first.
   * Bounded at {@link CLAUDE_TRANSCRIPT_MAX_ENTRIES}; when entries have been
   * evicted the returned array is prefixed with a `role: 'system'` notice
   * carrying `truncated: { droppedCount, limit }` so truncation is visible to
   * the caller rather than silent.
   *
   * Note this is *this adapter's* view of the conversation, not a re-read of
   * the CLI's on-disk transcript: it covers the turns seen since the session
   * object was constructed. For a resumed session it therefore starts empty and
   * grows from the resume point — which is exactly what a host probing for
   * "has this session been active" needs, and is honest about what it knows.
   */
  async getMessages(): Promise<unknown[]> {
    if (this.transcriptDropped > 0) {
      const notice: ClaudeTranscriptEntry = {
        role: 'system',
        content:
          `[squad] transcript truncated: ${this.transcriptDropped} earlier entr` +
          `${this.transcriptDropped === 1 ? 'y was' : 'ies were'} evicted to stay within the ` +
          `${this.transcriptLimit}-entry per-session cap (CLAUDE_TRANSCRIPT_MAX_ENTRIES).`,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        truncated: { droppedCount: this.transcriptDropped, limit: this.transcriptLimit },
      };
      return [notice, ...this.transcript];
    }
    return [...this.transcript];
  }

  /** Append one entry, evicting oldest entries past the cap. */
  private recordTranscript(entry: ClaudeTranscriptEntry): void {
    this.transcript.push(entry);
    while (this.transcript.length > this.transcriptLimit) {
      this.transcript.shift();
      this.transcriptDropped += 1;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.input.close();
    this.abortController.abort();
    await this.pumpDone.catch(() => undefined);
    this.handlers.clear();
  }

  // ── Stream pump: SDK messages → Squad events ───────────────────────────

  private async pump(stream: AsyncIterable<SdkMessage>, onClosed?: (id: string) => void): Promise<void> {
    try {
      for await (const msg of stream) {
        this.translate(msg);
      }
    } catch (err) {
      if (!this.abortController.signal.aborted) {
        this.dispatch({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      this.closed = true;
      this.dispatch({ type: 'idle' });
      onClosed?.(this.sessionId);
    }
  }

  private translate(msg: SdkMessage): void {
    switch (msg?.type) {
      case 'stream_event': {
        const event = msg.event;
        if (event?.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            this.dispatch({ type: 'message_delta', deltaContent: event.delta.text });
          } else if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
            this.dispatch({ type: 'reasoning_delta', deltaContent: event.delta.thinking });
          }
        }
        break;
      }
      case 'assistant': {
        const blocks: Array<{ type: string; text?: string; thinking?: string; name?: string }> =
          msg.message?.content ?? [];
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
        if (text) this.dispatch({ type: 'message', content: text, model: msg.message?.model });
        const thinking = blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking ?? '').join('');
        if (thinking) this.dispatch({ type: 'reasoning', content: thinking });
        const toolUses = blocks.filter((b) => b.type === 'tool_use').map((b) => b.name ?? 'unknown');
        if (blocks.length > 0) {
          this.recordTranscript({
            role: 'assistant',
            content: text,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            ...(typeof msg.message?.model === 'string' ? { model: msg.message.model } : {}),
            ...(toolUses.length ? { toolUses } : {}),
          });
        }
        break;
      }
      case 'result': {
        // A turn cancelled by abort()/interrupt() is not a failure — the SDK
        // reports it as an error subtype with an `aborted_*` terminal_reason.
        const aborted =
          this.interruptRequested ||
          msg.terminal_reason === 'aborted_streaming' ||
          msg.terminal_reason === 'aborted_tools';
        this.interruptRequested = false;
        const isError = !aborted && (msg.subtype !== 'success' || msg.is_error === true);
        if (isError) {
          this.dispatch({
            type: 'error',
            message: typeof msg.result === 'string' ? msg.result : `Claude turn failed (${msg.subtype})`,
          });
        }
        const usage = msg.usage ?? {};
        const modelFromUsage = msg.modelUsage ? Object.keys(msg.modelUsage)[0] : undefined;
        this.dispatch({
          type: 'usage',
          inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : 0,
          outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
          model: modelFromUsage ?? this.model ?? 'unknown',
        });
        this.dispatch({ type: 'turn_end' });
        this.dispatch({ type: 'idle' });
        const result = typeof msg.result === 'string' ? msg.result : msg;
        for (const settle of this.resultWaiters.splice(0)) settle(result);
        break;
      }
      default:
        break; // system/init, hook frames, … — no Squad equivalent
    }
  }
}

// ============================================================================
// Provider
// ============================================================================

/** Options for {@link ClaudeRuntimeProvider}. */
export interface ClaudeRuntimeProviderOptions extends SquadClientOptions {
  /** SDK facade override — the transport seam tests fake. */
  sdk?: ClaudeSdkFacade;
}

/**
 * {@link SquadRuntimeProvider} implementation over the Claude Agent SDK.
 */
export class ClaudeRuntimeProvider implements SquadRuntimeProvider {
  private state: SquadConnectionState = 'disconnected';
  private sdk: ClaudeSdkFacade | null = null;
  private readonly options: ClaudeRuntimeProviderOptions;
  private readonly sessions = new Map<string, ClaudeSessionAdapter>();
  private lastSessionId: string | undefined;
  private readonly lifecycleHandlers = new Set<SquadClientEventHandler>();
  private readonly typedLifecycleHandlers = new Map<string, Set<SquadClientEventHandler>>();

  constructor(options: ClaudeRuntimeProviderOptions = {}) {
    this.options = options;
    if (options.sdk) this.sdk = options.sdk;
  }

  getState(): SquadConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    this.state = 'connecting';
    try {
      if (!this.sdk) this.sdk = await loadDefaultClaudeSdk();
      this.state = 'connected';
    } catch (err) {
      this.state = 'error';
      throw err;
    }
  }

  async disconnect(): Promise<Error[]> {
    const errors: Error[] = [];
    for (const session of [...this.sessions.values()]) {
      try {
        await session.close();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    this.sessions.clear();
    this.state = 'disconnected';
    return errors;
  }

  async forceDisconnect(): Promise<void> {
    await this.disconnect();
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  async createSession(config: SquadSessionConfig = {}): Promise<SquadSession> {
    return this.startSession(config, undefined);
  }

  async resumeSession(sessionId: string, config: SquadSessionConfig = {}): Promise<SquadSession> {
    if (!sessionId || sessionId.trim() === '') {
      throw new Error('resumeSession requires a non-empty session id.');
    }
    return this.startSession(config, sessionId);
  }

  private async startSession(config: SquadSessionConfig, resumeId: string | undefined): Promise<SquadSession> {
    if (!this.isConnected() && (this.options.autoStart ?? true)) {
      await this.connect();
    }
    if (!this.isConnected() || !this.sdk) {
      throw new Error('Client not connected. Call connect() first.');
    }

    // Same wire-name normalization as the Copilot path (identical grammar).
    const normalized = normalizeToolsInConfig(config);
    const sessionId = resumeId ?? normalized.sessionId ?? randomUUID();
    const abortController = new AbortController();
    const options = this.buildQueryOptions(normalized, sessionId, resumeId, abortController);

    const input = new AsyncQueue<SdkMessage>();
    const stream = this.sdk.query({ prompt: input, options });

    const session = new ClaudeSessionAdapter({
      sessionId,
      input,
      stream,
      model: typeof options['model'] === 'string' ? (options['model'] as string) : undefined,
      abortController,
      onClosed: (id) => {
        this.sessions.delete(id);
        this.emitLifecycle({ type: 'session.deleted', sessionId: id });
      },
    });
    this.sessions.set(sessionId, session);
    this.lastSessionId = sessionId;
    this.emitLifecycle({ type: 'session.created', sessionId });
    return session;
  }

  /** Translate a (normalized) SquadSessionConfig into agent-SDK query options. */
  private buildQueryOptions(
    config: SquadSessionConfig,
    sessionId: string,
    resumeId: string | undefined,
    abortController: AbortController,
  ): Record<string, unknown> {
    const sdk = this.sdk!;
    const options: Record<string, unknown> = {
      cwd: config.workingDirectory ?? this.options.cwd ?? process.cwd(),
      includePartialMessages: true,
      abortController,
    };
    if (resumeId) options['resume'] = resumeId;
    else options['sessionId'] = sessionId;

    const model = toClaudeModelId(config.model);
    if (model) options['model'] = model;

    if (config.reasoningEffort) options['effort'] = config.reasoningEffort;

    // System message: append rides on the preset prompt, replace replaces it.
    const sm = config.systemMessage;
    if (sm?.content) {
      options['systemPrompt'] = sm.mode === 'replace'
        ? sm.content
        : { type: 'preset', preset: 'claude_code', append: sm.content };
    }

    if (config.availableTools?.length) options['allowedTools'] = config.availableTools;
    if (config.excludedTools?.length) options['disallowedTools'] = config.excludedTools;

    // Custom agents → SDK subagents.
    if (config.customAgents?.length) {
      const agents: Record<string, unknown> = {};
      for (const agent of config.customAgents) {
        agents[agent.name] = {
          description: agent.description ?? agent.displayName ?? agent.name,
          prompt: (agent as { prompt?: string }).prompt ?? '',
          ...(agent.tools ? { tools: agent.tools } : {}),
        };
      }
      options['agents'] = agents;
    }

    // MCP servers: Squad local/stdio → SDK stdio; http/sse pass through.
    const mcpServers: Record<string, unknown> = {};
    if (config.mcpServers) {
      for (const [name, server] of Object.entries(config.mcpServers)) {
        const s = server as unknown as Record<string, unknown>;
        const type = (s['type'] as string | undefined) ?? 'stdio';
        if (type === 'local' || type === 'stdio') {
          mcpServers[name] = { type: 'stdio', command: s['command'], args: s['args'] ?? [], env: s['env'], cwd: s['cwd'] };
        } else {
          mcpServers[name] = s;
        }
      }
    }

    // Squad handler tools → in-process SDK MCP server named `squad`.
    if (config.tools?.length) {
      const sdkTools = config.tools.map((t: SquadTool) =>
        sdk.tool(
          t.name,
          t.description ?? t.name,
          toZodRawShape(t.parameters),
          async (args: unknown) => {
            const result = await t.handler(args as never, { sessionId } as never);
            return {
              content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result ?? null) }],
            };
          },
        ),
      );
      mcpServers['squad'] = sdk.createSdkMcpServer({ name: 'squad', version: '1.0.0', tools: sdkTools });
    }
    if (Object.keys(mcpServers).length > 0) options['mcpServers'] = mcpServers;

    // Permissions: Squad handler → canUseTool.
    const permissionHandler = config.onPermissionRequest;
    if (permissionHandler) {
      options['canUseTool'] = async (toolName: string, input: Record<string, unknown>) => {
        const result = await permissionHandler(
          { kind: 'mcp', toolName, toolInput: input } as never,
          { sessionId },
        );
        const kind = (result as { kind?: string })?.kind ?? '';
        return kind.startsWith('approve')
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: `Denied by squad permission handler (${kind || 'no decision'})` };
      };
    }

    // Hooks: Pre/PostToolUse map ~1:1 onto SDK hook callbacks.
    const hooks = config.hooks;
    if (hooks?.onPreToolUse || hooks?.onPostToolUse) {
      const sdkHooks: Record<string, unknown[]> = {};
      if (hooks.onPreToolUse) {
        const pre = hooks.onPreToolUse;
        sdkHooks['PreToolUse'] = [{
          hooks: [async (input: { tool_name: string; tool_input: unknown }) => {
            const out = await pre(
              { toolName: input.tool_name, toolArgs: input.tool_input, sessionId } as never,
              { sessionId } as never,
            );
            if (!out) return {};
            return {
              hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                ...(out.permissionDecision ? { permissionDecision: out.permissionDecision } : {}),
                ...(out.permissionDecisionReason ? { permissionDecisionReason: out.permissionDecisionReason } : {}),
                ...(out.modifiedArgs !== undefined ? { updatedInput: out.modifiedArgs } : {}),
                ...(out.additionalContext ? { additionalContext: out.additionalContext } : {}),
              },
            };
          }],
        }];
      }
      if (hooks.onPostToolUse) {
        const post = hooks.onPostToolUse;
        sdkHooks['PostToolUse'] = [{
          hooks: [async (input: { tool_name: string; tool_input: unknown; tool_response?: unknown }) => {
            await post(
              { toolName: input.tool_name, toolArgs: input.tool_input, toolResult: input.tool_response, sessionId } as never,
              { sessionId } as never,
            );
            return {};
          }],
        }];
      }
      options['hooks'] = sdkHooks;
    }

    return options;
  }

  async listSessions(): Promise<SquadSessionMetadata[]> {
    const now = new Date();
    return [...this.sessions.keys()].map((sessionId) => ({
      sessionId,
      startTime: now,
      modifiedTime: now,
      isRemote: false,
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) await session.close();
    this.sessions.delete(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    return this.deleteSession(sessionId);
  }

  async getLastSessionId(): Promise<string | undefined> {
    return this.lastSessionId;
  }

  // ── Status / models ────────────────────────────────────────────────────

  async ping(message?: string): Promise<{ message: string; timestamp: string; protocolVersion?: number }> {
    return { message: message ?? 'pong', timestamp: new Date().toISOString() };
  }

  async getStatus(): Promise<SquadGetStatusResponse> {
    return { version: 'claude-agent-sdk', protocolVersion: undefined as never };
  }

  async getAuthStatus(): Promise<SquadGetAuthStatusResponse> {
    const hasApiKey = Boolean(process.env['ANTHROPIC_API_KEY']);
    const hasCliCredentials = existsSync(join(homedir(), '.claude', '.credentials.json'))
      || existsSync(join(homedir(), '.claude.json'));
    return {
      isAuthenticated: hasApiKey || hasCliCredentials,
      authType: hasApiKey ? 'api-key' : 'user',
      statusMessage: hasApiKey || hasCliCredentials
        ? 'Claude runtime: credentials detected'
        : 'Claude runtime: no ANTHROPIC_API_KEY and no claude CLI login found — run `claude` and log in, or set ANTHROPIC_API_KEY',
    };
  }

  async listModels(): Promise<SquadModelInfo[]> {
    // Static, provider-scoped catalog: the agent SDK exposes a live
    // supportedModels() only per-session, so this is the pre-session answer.
    const entry = (id: string, name: string): SquadModelInfo => ({
      id,
      name,
      capabilities: {
        supports: { vision: true, reasoningEffort: true },
        limits: { max_context_window_tokens: 200_000 },
      } as SquadModelInfo['capabilities'],
      supportedContextTiers: ['default'],
      defaultContextTier: 'default',
    });
    return [
      entry('opus', 'Claude Opus (latest)'),
      entry('sonnet', 'Claude Sonnet (latest)'),
      entry('haiku', 'Claude Haiku (latest)'),
    ];
  }

  // ── Messaging convenience (parity with SquadClient) ────────────────────

  async sendMessage(session: SquadSession, options: SquadMessageOptions): Promise<void> {
    await session.sendMessage(options);
  }

  async sendAndWait(session: SquadSession, options: SquadMessageOptions, timeout?: number): Promise<unknown> {
    if (!session.sendAndWait) throw new Error('Session does not support sendAndWait()');
    return session.sendAndWait(options, timeout);
  }

  // ── Client lifecycle events ────────────────────────────────────────────

  on<K extends SquadClientEventType>(eventType: K, handler: (event: SquadClientEvent & { type: K }) => void): () => void;
  on(handler: SquadClientEventHandler): () => void;
  on(
    eventTypeOrHandler: SquadClientEventType | SquadClientEventHandler,
    handler?: SquadClientEventHandler,
  ): () => void {
    if (typeof eventTypeOrHandler === 'string' && handler) {
      if (!this.typedLifecycleHandlers.has(eventTypeOrHandler)) {
        this.typedLifecycleHandlers.set(eventTypeOrHandler, new Set());
      }
      this.typedLifecycleHandlers.get(eventTypeOrHandler)!.add(handler);
      return () => this.typedLifecycleHandlers.get(eventTypeOrHandler)?.delete(handler);
    }
    const h = eventTypeOrHandler as SquadClientEventHandler;
    this.lifecycleHandlers.add(h);
    return () => this.lifecycleHandlers.delete(h);
  }

  private emitLifecycle(event: SquadClientEvent): void {
    for (const h of [...this.lifecycleHandlers]) {
      try { h(event); } catch { /* consumer error must not propagate */ }
    }
    for (const h of [...(this.typedLifecycleHandlers.get(event.type) ?? [])]) {
      try { h(event); } catch { /* consumer error must not propagate */ }
    }
  }
}
