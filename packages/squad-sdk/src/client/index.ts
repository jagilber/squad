/**
 * Squad Client — High-Level API with Session Pool Management (PRD 1)
 * 
 * This module provides the main Squad client API that combines:
 * - SquadClient adapter (from adapter/client.ts) for connection management
 * - SessionPool for multi-session lifecycle management
 * - EventBus for cross-session event handling
 * 
 * Applications should import from this module, not from adapter/ directly.
 */

// Re-export core types and classes from adapter layer
export {
  SquadClient,
  normalizeToolNameForCopilot,
  normalizeToolNameForWire,
  normalizeToolsInConfig,
  type SquadClientOptions,
  type SquadConnectionState,
} from '../adapter/client.js';

// Runtime-provider seam: interface + factory + runtime resolution.
export {
  createRuntimeProvider,
  resolveRuntimeId,
  resolveEffectiveRuntime,
  SQUAD_RUNTIME_ENV,
  type SquadRuntimeProvider,
  type SquadRuntimeId,
  type SquadRuntimeSource,
  type EffectiveRuntime,
  type ResolveEffectiveRuntimeOptions,
  type CreateRuntimeProviderOptions,
} from '../adapter/provider.js';

export type {
  SquadSession,
  SquadSessionConfig,
  SquadSessionMetadata,
  SquadGetStatusResponse,
  SquadGetAuthStatusResponse,
  SquadModelInfo,
  SquadClientEventType,
  SquadClientEvent,
  SquadClientEventHandler,
  SquadPermissionHandler,
  SquadPermissionRequest,
  SquadPermissionRequestResult,
} from '../adapter/types.js';

// Session status type for pool management
export type SessionStatus = 'creating' | 'active' | 'idle' | 'error' | 'destroyed';

// Re-export pool and event bus
export { SessionPool, type SessionPoolConfig, type PoolEvent, DEFAULT_POOL_CONFIG } from './session-pool.js';
export { EventBus, type SquadEvent, type SquadEventType } from './event-bus.js';

// --- High-Level Client with Pool Management ---

import { SquadClient as BaseSquadClient, type SquadClientOptions } from '../adapter/client.js';
import type { SquadSession, SquadSessionConfig, SquadClientEventType, SquadClientEvent, SquadClientEventHandler } from '../adapter/types.js';
import {
  createRuntimeProvider,
  resolveEffectiveRuntime,
  type SquadRuntimeProvider,
  type SquadRuntimeId,
} from '../adapter/provider.js';
import type { StorageProvider } from '../storage/index.js';
import { SessionPool, type SessionPoolConfig } from './session-pool.js';
import { EventBus, type SquadEventType } from './event-bus.js';

export interface SquadClientWithPoolConfig extends SquadClientOptions {
  /** Session pool configuration */
  pool?: Partial<SessionPoolConfig>;
}

/**
 * Pre-resolved runtime wiring handed to the {@link SquadClientWithPool}
 * constructor by {@link createSquadClientWithPool}.
 *
 * This is a second, optional constructor argument on purpose: the existing
 * one-argument `new SquadClientWithPool(config)` form keeps its exact prior
 * behaviour (construct a Copilot `SquadClient` from `config`), which external
 * consumers pinned to squad-sdk 0.11/0.12 depend on.
 */
export interface SquadClientWithPoolRuntime {
  /** Already-constructed provider to use instead of a fresh Copilot client. */
  provider: SquadRuntimeProvider;
  /** The runtime id `provider` was constructed for. */
  runtimeId: SquadRuntimeId;
}

/** Options accepted by {@link createSquadClientWithPool}. */
export interface CreateSquadClientWithPoolConfig extends SquadClientWithPoolConfig {
  /**
   * Explicit runtime id. Highest precedence — see
   * {@link createSquadClientWithPool} for the full order.
   */
  runtime?: SquadRuntimeId | string;
  /**
   * Path to the `.squad/` directory whose `config.json` carries the persistent
   * `runtime` key. Omit to skip the config-file layer entirely.
   */
  squadDir?: string;
  /** Storage provider used to read `.squad/config.json` (tests inject here). */
  storage?: StorageProvider;
}

/**
 * Squad Client with integrated session pool management.
 * 
 * This is the recommended client for applications that need to manage
 * multiple concurrent agent sessions. It provides:
 * - Connection lifecycle management (from SquadClient)
 * - Session pool with capacity limits and health checks
 * - Event bus for cross-session event handling
 * 
 * @example
 * ```typescript
 * const client = new SquadClientWithPool({
 *   pool: { maxConcurrent: 5 }
 * });
 * 
 * await client.connect();
 * 
 * const session1 = await client.createSession({ model: 'claude-sonnet-4.5' });
 * const session2 = await client.createSession({ model: 'claude-haiku-4.5' });
 * 
 * client.eventBus.on('session.created', (event) => {
 *   console.log('New session:', event.sessionId);
 * });
 * 
 * await client.shutdown();
 * ```
 */
export class SquadClientWithPool {
  private baseClient: SquadRuntimeProvider;
  public readonly pool: SessionPool;
  public readonly eventBus: EventBus;
  /**
   * Runtime backing this client. `'copilot'` for the synchronous constructor
   * (unchanged legacy behaviour); whatever
   * {@link createSquadClientWithPool} resolved otherwise.
   */
  public readonly runtimeId: SquadRuntimeId;

  constructor(config: SquadClientWithPoolConfig = {}, runtime?: SquadClientWithPoolRuntime) {
    // Legacy (one-arg) path is byte-compatible: a Copilot `SquadClient` built
    // straight from `config`, exactly as before the provider seam existed.
    this.baseClient = runtime?.provider ?? new BaseSquadClient(config);
    this.runtimeId = runtime?.runtimeId ?? 'copilot';
    this.pool = new SessionPool(config.pool);
    this.eventBus = new EventBus();
    
    // Wire pool events to event bus via type mapping
    const poolToSquadEvent: Record<string, SquadEventType> = {
      'session.added': 'session.created',
      'session.removed': 'session.destroyed',
      'session.status_changed': 'session.status_changed',
      'pool.at_capacity': 'pool.health',
      'pool.health_check': 'pool.health',
    };
    this.pool.on((event) => {
      const mappedType = poolToSquadEvent[event.type];
      if (mappedType) {
        this.eventBus.emit({
          type: mappedType,
          sessionId: event.sessionId,
          payload: event,
          timestamp: event.timestamp,
        });
      }
    });
  }
  
  /** Connect to the Copilot CLI server */
  async connect(): Promise<void> {
    return this.baseClient.connect();
  }
  
  /** Disconnect from the Copilot CLI server */
  async disconnect(): Promise<Error[]> {
    await this.pool.shutdown();
    return this.baseClient.disconnect();
  }
  
  /** Force disconnect without graceful cleanup */
  async forceDisconnect(): Promise<void> {
    await this.pool.shutdown();
    return this.baseClient.forceDisconnect();
  }
  
  /** Get current connection state */
  getState() {
    return this.baseClient.getState();
  }
  
  /** Check if connected */
  isConnected(): boolean {
    return this.baseClient.isConnected();
  }
  
  /**
   * Create a new session and add it to the pool.
   * Throws if the pool is at capacity.
   *
   * Note: this emits `session.created` on the event bus TWICE — once via the
   * pool's own `session.added` → `session.created` mapping in the constructor,
   * and once explicitly below. That duplicate is long-standing behaviour, not
   * an oversight, and `test/claude-runtime-pooled-client.test.ts` pins it
   * deliberately; de-duplicating it would silently halve the event count for
   * any consumer that counts them, so treat it as a breaking change.
   */
  async createSession(config: SquadSessionConfig = {}): Promise<SquadSession> {
    const session = await this.baseClient.createSession(config);
    
    // Convert to pool-compatible session format
    const poolSession = {
      id: session.sessionId,
      agentName: config.model ?? 'default',
      status: 'active' as const,
      createdAt: new Date(),
    };
    
    this.pool.add(poolSession);
    
    await this.eventBus.emit({
      type: 'session.created',
      sessionId: session.sessionId,
      payload: { session },
      timestamp: new Date(),
    });
    
    return session;
  }
  
  /**
   * Resume an existing session and add it to the pool if not present.
   */
  async resumeSession(sessionId: string, config: SquadSessionConfig = {}): Promise<SquadSession> {
    const session = await this.baseClient.resumeSession(sessionId, config);
    
    if (!this.pool.get(sessionId)) {
      const poolSession = {
        id: session.sessionId,
        agentName: config.model ?? 'resumed',
        status: 'active' as const,
        createdAt: new Date(),
      };
      this.pool.add(poolSession);
    }
    
    return session;
  }
  
  /**
   * Delete a session and remove it from the pool.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.baseClient.deleteSession(sessionId);
    this.pool.remove(sessionId);
    
    await this.eventBus.emit({
      type: 'session.destroyed',
      sessionId,
      payload: null,
      timestamp: new Date(),
    });
  }
  
  /** List all sessions from the base client */
  async listSessions() {
    return this.baseClient.listSessions();
  }
  
  /** Send a ping to verify connectivity */
  async ping(message?: string) {
    return this.baseClient.ping(message);
  }
  
  /** Get CLI status information */
  async getStatus() {
    return this.baseClient.getStatus();
  }
  
  /** Get authentication status */
  async getAuthStatus() {
    return this.baseClient.getAuthStatus();
  }
  
  /** List available models */
  async listModels() {
    return this.baseClient.listModels();
  }
  
  /** Subscribe to client-level session lifecycle events */
  on<K extends SquadClientEventType>(eventType: K, handler: (event: SquadClientEvent & { type: K }) => void): () => void;
  on(handler: SquadClientEventHandler): () => void;
  on(
    eventTypeOrHandler: SquadClientEventType | SquadClientEventHandler,
    handler?: (event: SquadClientEvent) => void
  ): () => void {
    if (typeof eventTypeOrHandler === "string" && handler) {
      return this.baseClient.on(eventTypeOrHandler, handler);
    }
    return this.baseClient.on(eventTypeOrHandler as SquadClientEventHandler);
  }
  
  /**
   * Graceful shutdown — destroy all sessions and disconnect.
   */
  async shutdown(): Promise<void> {
    await this.pool.shutdown();
    await this.baseClient.disconnect();
  }
}

/**
 * Runtime-aware factory for {@link SquadClientWithPool}.
 *
 * Resolves which LLM runtime should back the client, constructs it through
 * {@link createRuntimeProvider}, and injects it. Async because the Claude
 * provider (and its optional `@anthropic-ai/claude-agent-sdk` dependency) is
 * imported dynamically, so the Copilot path never loads it.
 *
 * ## Runtime precedence
 *
 * Delegated wholesale to {@link resolveEffectiveRuntime} — the single
 * canonical implementation, shared with `squad doctor` so the two can never
 * disagree about which runtime is in effect. Summary (highest first):
 * `config.runtime` → `SQUAD_RUNTIME` env → `runtime` in
 * `<squadDir>/config.json` → `'copilot'`. See that function (and
 * `docs/claude-runtime-integration.md`) for the rationale.
 *
 * An unrecognized value at ANY layer throws `Unknown squad runtime "<value>"`
 * rather than falling back, so a typo cannot silently route (billed) work to
 * the wrong runtime.
 *
 * @example
 * ```typescript
 * const client = await createSquadClientWithPool({
 *   squadDir: '/repo/.squad',
 *   pool: { maxConcurrent: 5 },
 * });
 * console.log(client.runtimeId); // 'claude' when .squad/config.json says so
 * ```
 */
export async function createSquadClientWithPool(
  config: CreateSquadClientWithPoolConfig = {}
): Promise<SquadClientWithPool> {
  const { runtime, squadDir, storage, pool, ...clientOptions } = config;

  // Precedence lives in exactly one place — see resolveEffectiveRuntime.
  // It validates too, so an unknown value throws here before any provider
  // (or billing identity) is touched.
  const { id: runtimeId } = resolveEffectiveRuntime({ runtime, squadDir, storage });

  const provider = await createRuntimeProvider({ ...clientOptions, runtime: runtimeId });

  return new SquadClientWithPool({ ...clientOptions, pool }, { provider, runtimeId });
}

