/**
 * Squad Runtime Provider seam.
 *
 * `SquadRuntimeProvider` is the extracted public surface of `SquadClient`
 * (adapter/client.ts) — the boundary between Squad's provider-neutral
 * orchestration layer and a concrete LLM runtime. Two implementations exist:
 *
 * - `CopilotRuntimeProvider` (adapter/providers/copilot.ts) — the original
 *   `SquadClient`, backed by `@github/copilot-sdk` and a spawned Copilot CLI.
 * - `ClaudeRuntimeProvider` (adapter/providers/claude.ts) — backed by
 *   `@anthropic-ai/claude-agent-sdk` `query()` and the claude CLI runtime.
 *
 * Everything downstream (`SquadClientWithPool`, agent lifecycle, coordinator
 * fan-out, CLI shell) already speaks the Squad-stable types in
 * `adapter/types.ts`, so it is provider-agnostic by construction; this module
 * only names the seam and provides the factory.
 *
 * @module adapter/provider
 */

import type {
  SquadSessionConfig,
  SquadSession,
  SquadSessionMetadata,
  SquadGetAuthStatusResponse,
  SquadGetStatusResponse,
  SquadModelInfo,
  SquadMessageOptions,
  SquadClientEventType,
  SquadClientEvent,
  SquadClientEventHandler,
} from './types.js';
import type { SquadConnectionState, SquadClientOptions } from './client.js';
import { readRuntimePreference } from '../config/models.js';
import type { StorageProvider } from '../storage/index.js';

/** Identifier of a concrete LLM runtime behind the provider seam. */
export type SquadRuntimeId = 'copilot' | 'claude';

/**
 * The runtime-provider contract, extracted from `SquadClient`'s public
 * surface. `SquadClient` satisfies this interface structurally (asserted in
 * test/claude-runtime-provider.test.ts); new runtimes implement it directly.
 *
 * Methods marked optional are Copilot-runtime affordances that other runtimes
 * may not be able to serve; callers must feature-detect them (they already do
 * — every non-core call site optional-chains).
 */
export interface SquadRuntimeProvider {
  getState(): SquadConnectionState;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): Promise<Error[]>;
  forceDisconnect(): Promise<void>;

  createSession(config?: SquadSessionConfig): Promise<SquadSession>;
  resumeSession(sessionId: string, config?: SquadSessionConfig): Promise<SquadSession>;
  listSessions(): Promise<SquadSessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  getLastSessionId(): Promise<string | undefined>;

  ping(message?: string): Promise<{ message: string; timestamp: string; protocolVersion?: number }>;
  getStatus(): Promise<SquadGetStatusResponse>;
  getAuthStatus(): Promise<SquadGetAuthStatusResponse>;
  listModels(): Promise<SquadModelInfo[]>;

  sendMessage(session: SquadSession, options: SquadMessageOptions): Promise<void>;
  sendAndWait(session: SquadSession, options: SquadMessageOptions, timeout?: number): Promise<unknown>;

  on<K extends SquadClientEventType>(eventType: K, handler: (event: SquadClientEvent & { type: K }) => void): () => void;
  on(handler: SquadClientEventHandler): () => void;
}

/** Environment variable that selects the runtime when no explicit id is given. */
export const SQUAD_RUNTIME_ENV = 'SQUAD_RUNTIME';

/**
 * Resolve the effective runtime id.
 *
 * Order: explicit argument → `SQUAD_RUNTIME` env var → `'copilot'`.
 * Unknown values throw rather than silently falling back, so a typo in
 * config cannot silently route work to the wrong (and possibly billed)
 * runtime.
 */
export function resolveRuntimeId(explicit?: string): SquadRuntimeId {
  const raw = explicit ?? process.env[SQUAD_RUNTIME_ENV] ?? 'copilot';
  const id = raw.trim().toLowerCase();
  if (id === 'copilot' || id === 'claude') return id;
  throw new Error(
    `Unknown squad runtime "${raw}". Valid values: "copilot", "claude" ` +
    `(set via the runtime option or the ${SQUAD_RUNTIME_ENV} environment variable).`
  );
}

/**
 * Which layer supplied the effective runtime id. Returned by
 * {@link resolveEffectiveRuntime} so callers can explain *why* a runtime is in
 * effect without re-deriving the precedence themselves.
 */
export type SquadRuntimeSource = 'explicit' | 'env' | 'config' | 'default';

/** Options accepted by {@link resolveEffectiveRuntime}. */
export interface ResolveEffectiveRuntimeOptions {
  /** Explicit runtime id (highest precedence). */
  runtime?: SquadRuntimeId | string;
  /**
   * Path to the `.squad/` directory whose `config.json` may carry a `runtime`
   * key. Omit to skip the config-file layer entirely.
   */
  squadDir?: string;
  /** Storage provider used to read `.squad/config.json` (tests inject here). */
  storage?: StorageProvider;
}

/** Result of {@link resolveEffectiveRuntime}. */
export interface EffectiveRuntime {
  /** The validated, normalized runtime id. */
  id: SquadRuntimeId;
  /** Which layer it came from. */
  source: SquadRuntimeSource;
  /** The raw string `id` was resolved from (`'copilot'` when `source` is `'default'`). */
  value: string;
}

/**
 * Resolve the effective runtime id **and its provenance** across every input
 * layer. This is the single, canonical home of Squad's runtime precedence —
 * every consumer (the pooled-client factory, `squad doctor`, …) must call this
 * rather than re-implementing the layering, because a consumer that only
 * consults a subset reports a runtime different from the one that will
 * actually be constructed. (`squad doctor` did exactly that before this
 * helper existed: it called bare `resolveRuntimeId()`, never read
 * `.squad/config.json`, and confidently green-checked "copilot" on a repo
 * configured for claude.)
 *
 * ## Precedence, highest first
 *
 * 1. `options.runtime` — the explicit programmatic argument → `'explicit'`
 * 2. the `SQUAD_RUNTIME` environment variable → `'env'`
 * 3. `runtime` in `<squadDir>/config.json` → `'config'`
 * 4. `'copilot'` → `'default'`
 *
 * The env var deliberately sits above the config file so a shell can override
 * a checked-in project preference for a single run without editing tracked
 * state.
 *
 * Validation is delegated to {@link resolveRuntimeId} — which is left
 * untouched — so an unrecognized value at ANY layer throws
 * `Unknown squad runtime "<value>"` rather than falling back. A typo must
 * never silently route (billed) work to the default runtime.
 */
export function resolveEffectiveRuntime(
  options: ResolveEffectiveRuntimeOptions = {}
): EffectiveRuntime {
  const { runtime, squadDir, storage } = options;

  let raw: string | undefined;
  let source: SquadRuntimeSource;

  if (runtime !== undefined) {
    raw = runtime;
    source = 'explicit';
  } else if (process.env[SQUAD_RUNTIME_ENV] !== undefined) {
    // Note: an empty-string env var is NOT skipped — it reaches
    // resolveRuntimeId and throws, exactly as bare resolveRuntimeId() does.
    raw = process.env[SQUAD_RUNTIME_ENV];
    source = 'env';
  } else {
    const fromConfig = squadDir ? readRuntimePreference(squadDir, storage) : null;
    if (fromConfig !== null) {
      raw = fromConfig;
      source = 'config';
    } else {
      raw = undefined;
      source = 'default';
    }
  }

  // Throws on an unknown value; applies the 'copilot' default when raw is undefined.
  const id = resolveRuntimeId(raw);
  return { id, source, value: raw ?? 'copilot' };
}

/** Options accepted by {@link createRuntimeProvider}. */
export interface CreateRuntimeProviderOptions extends SquadClientOptions {
  /** Runtime to construct; defaults to {@link resolveRuntimeId} resolution. */
  runtime?: SquadRuntimeId | string;
}

/**
 * Construct a runtime provider for the resolved runtime id.
 *
 * The Claude provider is imported dynamically so the (optional)
 * `@anthropic-ai/claude-agent-sdk` dependency is never loaded on the
 * Copilot path.
 */
export async function createRuntimeProvider(
  options: CreateRuntimeProviderOptions = {}
): Promise<SquadRuntimeProvider> {
  const { runtime, ...clientOptions } = options;
  const id = resolveRuntimeId(runtime);
  if (id === 'claude') {
    const { ClaudeRuntimeProvider } = await import('./providers/claude.js');
    return new ClaudeRuntimeProvider(clientOptions);
  }
  const { SquadClient } = await import('./client.js');
  return new SquadClient(clientOptions);
}
