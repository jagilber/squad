/**
 * TDD Verification: Issue #5 — Subagent compaction events not propagated
 *
 * These tests prove the bug EXISTS (RED tests). They demonstrate that:
 * 1. aggregateSessionEvents() does not subscribe to compaction events
 * 2. spawnSingle() never calls aggregateSessionEvents() for event forwarding
 * 3. Coordinator EventBus never receives compaction events from subagents
 * 4. No per-agent context utilization tracking exists
 *
 * When the fix is implemented, these tests should be updated to pass (GREEN).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  spawnParallel,
  aggregateSessionEvents,
  type AgentSpawnConfig,
  type FanOutDependencies,
} from '@bradygaster/squad-sdk/coordinator';
import { EventBus } from '@bradygaster/squad-sdk/client';
import { SessionPool } from '@bradygaster/squad-sdk/client';
import type { AgentCharter } from '@bradygaster/squad-sdk/agents';

describe('Issue #5: Subagent compaction events not propagated', () => {
  let eventBus: EventBus;
  let sessionPool: SessionPool;

  beforeEach(() => {
    eventBus = new EventBus();
    sessionPool = new SessionPool({
      maxConcurrent: 10,
      idleTimeout: 60000,
      healthCheckInterval: 30000,
    });
  });

  afterEach(() => {
    sessionPool.shutdown();
  });

  describe('aggregateSessionEvents does not subscribe to compaction events', () => {
    it('should forward session.compaction_start to coordinator — but does not subscribe', () => {
      // Arrange
      const coordinatorEventBus = new EventBus();
      const receivedEvents: any[] = [];

      // Listen for any compaction-related events
      coordinatorEventBus.onAny((event) => {
        receivedEvents.push(event);
      });

      // Create a mock session that emits compaction events
      const eventHandlers: Record<string, Function[]> = {};
      const mockSession = {
        on: vi.fn((eventType: string, handler: any) => {
          if (!eventHandlers[eventType]) {
            eventHandlers[eventType] = [];
          }
          eventHandlers[eventType]!.push(handler);
        }),
      };

      // Act: Wire up event aggregation
      aggregateSessionEvents('session-123', 'fenster', mockSession, coordinatorEventBus);

      // Simulate the session emitting a compaction_start event
      if (eventHandlers['session.compaction_start']) {
        for (const handler of eventHandlers['session.compaction_start']) {
          handler({ reason: 'context_window_80_percent', timestamp: Date.now() });
        }
      }

      // Assert: The coordinator should have received the compaction event
      // EXPECTED (once fixed): receivedEvents should contain a compaction event
      // ACTUAL: aggregateSessionEvents only subscribes to 6 hardcoded event types
      //   ('message.delta', 'message.complete', 'tool.start', 'tool.complete',
      //    'session.error', 'session.complete') — compaction events are NOT included
      const compactionEvents = receivedEvents.filter(
        e => e.type === 'session.compaction_start' || e.type === ('agent.compaction_start' as any)
      );
      expect(compactionEvents.length).toBeGreaterThan(0);
    });

    it('should forward session.compaction_complete to coordinator — but does not subscribe', () => {
      // Arrange
      const coordinatorEventBus = new EventBus();
      const receivedEvents: any[] = [];

      coordinatorEventBus.onAny((event) => {
        receivedEvents.push(event);
      });

      const eventHandlers: Record<string, Function[]> = {};
      const mockSession = {
        on: vi.fn((eventType: string, handler: any) => {
          if (!eventHandlers[eventType]) {
            eventHandlers[eventType] = [];
          }
          eventHandlers[eventType]!.push(handler);
        }),
      };

      // Act
      aggregateSessionEvents('session-456', 'verbal', mockSession, coordinatorEventBus);

      // Simulate compaction_complete event
      if (eventHandlers['session.compaction_complete']) {
        for (const handler of eventHandlers['session.compaction_complete']) {
          handler({
            tokensReclaimed: 15000,
            newContextSize: 45000,
            timestamp: Date.now(),
          });
        }
      }

      // Assert
      const compactionEvents = receivedEvents.filter(
        e => e.type === 'session.compaction_complete' || e.type === ('agent.compaction_complete' as any)
      );
      expect(compactionEvents.length).toBeGreaterThan(0);
    });

    it('should subscribe to compaction events in the eventTypes list', () => {
      // Arrange: Set up mock session to capture what events are subscribed to
      const subscribedEvents: string[] = [];
      const mockSession = {
        on: vi.fn((eventType: string, _handler: any) => {
          subscribedEvents.push(eventType);
        }),
      };

      // Act
      aggregateSessionEvents('session-789', 'hockney', mockSession, eventBus);

      // Assert: Compaction events should be in the subscription list
      // EXPECTED (once fixed): subscribedEvents should include compaction events
      // ACTUAL: only subscribes to 6 hardcoded event types
      expect(subscribedEvents).toContain('session.compaction_start');
      expect(subscribedEvents).toContain('session.compaction_complete');
    });
  });

  describe('spawnSingle does not wire up event aggregation for spawned sessions', () => {
    it('should aggregate events from spawned sessions — but createSession returns no event emitter', async () => {
      // Arrange: createSession returns a session with an .on() method
      const sessionEventHandlers: Record<string, Function[]> = {};
      const mockSession = {
        sessionId: 'session-spawn-test',
        sendMessage: vi.fn(async () => {}),
        on: vi.fn((eventType: string, handler: any) => {
          if (!sessionEventHandlers[eventType]) {
            sessionEventHandlers[eventType] = [];
          }
          sessionEventHandlers[eventType]!.push(handler);
        }),
      };

      const mockDeps: FanOutDependencies = {
        compileCharter: vi.fn(async (agentName: string) => ({
          name: agentName,
          displayName: `${agentName} Agent`,
          role: 'Developer',
          expertise: ['TypeScript'],
          style: 'Professional',
          prompt: `You are ${agentName}`,
          modelPreference: 'claude-sonnet-4.5',
        } as AgentCharter)),
        resolveModel: vi.fn(async () => 'claude-sonnet-4.5'),
        createSession: vi.fn(async () => mockSession),
        sessionPool,
        eventBus,
      };

      const receivedEvents: any[] = [];
      eventBus.onAny((event) => {
        receivedEvents.push(event);
      });

      // Act: Spawn an agent
      const configs: AgentSpawnConfig[] = [
        { agentName: 'fenster', task: 'Do something' },
      ];
      await spawnParallel(configs, mockDeps);

      // Now simulate the spawned session emitting a compaction event
      if (sessionEventHandlers['session.compaction_start']) {
        for (const handler of sessionEventHandlers['session.compaction_start']) {
          handler({ reason: 'context_window_full', timestamp: Date.now() });
        }
      }

      // Assert: The coordinator's EventBus should have received the compaction event
      // EXPECTED (once fixed): spawnSingle() should call aggregateSessionEvents()
      //   which should subscribe to compaction events and forward them to eventBus
      // ACTUAL: spawnSingle() never calls aggregateSessionEvents() and
      //   even if it did, aggregateSessionEvents doesn't include compaction events
      const compactionEvents = receivedEvents.filter(
        e => String(e.type).includes('compaction')
      );
      expect(compactionEvents.length).toBeGreaterThan(0);
    });

    it('should call aggregateSessionEvents after session creation — but currently does not', async () => {
      // Arrange: Track if session.on() is ever called by spawnSingle
      const onSpy = vi.fn();
      const mockSession = {
        sessionId: 'session-agg-test',
        sendMessage: vi.fn(async () => {}),
        on: onSpy,
      };

      const mockDeps: FanOutDependencies = {
        compileCharter: vi.fn(async (agentName: string) => ({
          name: agentName,
          displayName: `${agentName} Agent`,
          role: 'Developer',
          expertise: ['TypeScript'],
          style: 'Professional',
          prompt: `You are ${agentName}`,
          modelPreference: 'claude-sonnet-4.5',
        } as AgentCharter)),
        resolveModel: vi.fn(async () => 'claude-sonnet-4.5'),
        createSession: vi.fn(async () => mockSession),
        sessionPool,
        eventBus,
      };

      // Act
      await spawnParallel(
        [{ agentName: 'fenster', task: 'Test task' }],
        mockDeps
      );

      // Assert: session.on() should have been called to subscribe to events
      // EXPECTED (once fixed): spawnSingle() should wire up event aggregation
      //   by calling session.on() for various event types
      // ACTUAL: spawnSingle() never calls session.on() — it only calls
      //   session.sendMessage() and then emits 'session.created' directly
      expect(onSpy).toHaveBeenCalled();
    });
  });

  describe('SquadEventType does not include compaction events', () => {
    it('should support compaction event types on the coordinator EventBus', () => {
      // This test verifies that the SquadEventType union should include
      // compaction-related event types for subagent context management.

      // Currently defined SquadEventType values:
      const knownEventTypes = [
        'session.created',
        'session.destroyed',
        'session.status_changed',
        'session.message',
        'session.tool_call',
        'session.error',
        'agent.milestone',
        'coordinator.routing',
        'pool.health',
      ];

      // EXPECTED (once fixed): Should also include:
      // - 'agent.compaction_start'
      // - 'agent.compaction_complete'
      // - 'agent.context_usage'
      const compactionEventTypes = [
        'agent.compaction_start',
        'agent.compaction_complete',
      ];

      // Verify these events can be emitted without type errors
      // (Currently they must be cast with `as any`)
      for (const eventType of compactionEventTypes) {
        // If this were a proper SquadEventType, we wouldn't need `as any`
        const isKnownType = knownEventTypes.includes(eventType);
        expect(isKnownType).toBe(true);
      }
    });
  });

  describe('No per-agent context utilization tracking', () => {
    it('should track context usage per agent — but no tracking exists', async () => {
      // Arrange: Spawn an agent and simulate context usage events
      const mockSession = {
        sessionId: 'session-context-test',
        sendMessage: vi.fn(async () => {}),
        on: vi.fn(),
      };

      const mockDeps: FanOutDependencies = {
        compileCharter: vi.fn(async (agentName: string) => ({
          name: agentName,
          displayName: `${agentName} Agent`,
          role: 'Developer',
          expertise: ['TypeScript'],
          style: 'Professional',
          prompt: `You are ${agentName}`,
          modelPreference: 'claude-sonnet-4.5',
        } as AgentCharter)),
        resolveModel: vi.fn(async () => 'claude-sonnet-4.5'),
        createSession: vi.fn(async () => mockSession),
        sessionPool,
        eventBus,
      };

      // Act: Spawn agent
      await spawnParallel(
        [{ agentName: 'fenster', task: 'Process large codebase' }],
        mockDeps
      );

      // Assert: There should be a way to query context usage per agent
      // EXPECTED (once fixed): SessionPool or CostTracker should track
      //   per-agent context utilization
      // ACTUAL: SessionPool.SquadSession only has id, agentName, status, createdAt
      //   — no context usage fields
      const session = sessionPool.get('session-context-test');
      expect(session).toBeDefined();

      // Verify the session object has context tracking fields
      // These fields don't exist yet — this will fail
      const sessionAny = session as any;
      expect(sessionAny.contextUsage).toBeDefined();
    });
  });
});
