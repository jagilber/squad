/**
 * Tests for CostTracker
 *
 * Comprehensive tests for the per-agent cost tracking module:
 * - recordUsage accumulation
 * - getSummary correctness
 * - formatSummary output
 * - wireToEventBus integration
 * - reset behavior
 * - fallback tracking
 *
 * TDD: RED → GREEN
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '@bradygaster/squad-sdk';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('recordUsage', () => {
    it('should record a single usage event', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(100);
      expect(summary.totalOutputTokens).toBe(50);
      expect(summary.totalEstimatedCost).toBeCloseTo(0.001);
    });

    it('should accumulate multiple usage events for the same agent', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 200,
        outputTokens: 100,
        estimatedCost: 0.002,
      });

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(300);
      expect(summary.totalOutputTokens).toBe(150);
      expect(summary.totalEstimatedCost).toBeCloseTo(0.003);

      const agentEntry = summary.agents.get('verbal');
      expect(agentEntry).toBeDefined();
      expect(agentEntry!.turnCount).toBe(2);
      expect(agentEntry!.inputTokens).toBe(300);
    });

    it('should track separate agents independently', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      tracker.recordUsage({
        sessionId: 'session-2',
        agentName: 'fenster',
        model: 'gpt-5',
        inputTokens: 200,
        outputTokens: 100,
        estimatedCost: 0.003,
      });

      const summary = tracker.getSummary();
      expect(summary.agents.size).toBe(2);
      expect(summary.agents.get('verbal')!.model).toBe('claude-sonnet-4.5');
      expect(summary.agents.get('fenster')!.model).toBe('gpt-5');
    });

    it('should track sessions independently from agents', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      tracker.recordUsage({
        sessionId: 'session-2',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 150,
        outputTokens: 75,
        estimatedCost: 0.0015,
      });

      const summary = tracker.getSummary();
      expect(summary.sessions.size).toBe(2);
      expect(summary.agents.size).toBe(1);
      expect(summary.agents.get('verbal')!.turnCount).toBe(2);
    });

    it('should use "unknown" for agents without a name', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      const summary = tracker.getSummary();
      expect(summary.agents.has('unknown')).toBe(true);
    });

    it('should track fallback count when isFallback is true', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
        isFallback: true,
      });

      const summary = tracker.getSummary();
      expect(summary.agents.get('verbal')!.fallbackCount).toBe(1);
    });
  });

  describe('recordFallback', () => {
    it('should increment fallback count for existing agent', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      tracker.recordFallback('verbal');

      const summary = tracker.getSummary();
      expect(summary.agents.get('verbal')!.fallbackCount).toBe(1);
    });

    it('should be a no-op for non-existent agent', () => {
      // Should not throw
      tracker.recordFallback('nonexistent');
      const summary = tracker.getSummary();
      expect(summary.agents.size).toBe(0);
    });
  });

  describe('getSummary', () => {
    it('should return empty summary when no usage recorded', () => {
      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.totalEstimatedCost).toBe(0);
      expect(summary.agents.size).toBe(0);
      expect(summary.sessions.size).toBe(0);
    });

    it('should return a copy of agents map (not a reference)', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      const summary1 = tracker.getSummary();
      const summary2 = tracker.getSummary();
      expect(summary1.agents).not.toBe(summary2.agents);
    });
  });

  describe('formatSummary', () => {
    it('should include header and totals', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.0125,
      });

      const output = tracker.formatSummary();
      expect(output).toContain('Squad Cost Summary');
      expect(output).toContain('1,000');
      expect(output).toContain('500');
      expect(output).toContain('$0.0125');
    });

    it('should include per-agent breakdown', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.01,
      });

      const output = tracker.formatSummary();
      expect(output).toContain('verbal');
      expect(output).toContain('claude-sonnet-4.5');
      expect(output).toContain('1 turns');
    });

    it('should show fallback count when present', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
        isFallback: true,
      });

      const output = tracker.formatSummary();
      expect(output).toContain('1 fallbacks');
    });

    it('should include per-session breakdown', () => {
      tracker.recordUsage({
        sessionId: 'session-abc',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      const output = tracker.formatSummary();
      expect(output).toContain('session-abc');
    });
  });

  describe('reset', () => {
    it('should clear all accumulated data', () => {
      tracker.recordUsage({
        sessionId: 'session-1',
        agentName: 'verbal',
        model: 'claude-sonnet-4.5',
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0.001,
      });

      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.agents.size).toBe(0);
      expect(summary.sessions.size).toBe(0);
    });
  });

  describe('wireToEventBus', () => {
    it('should record usage from session:message events', () => {
      const bus = new EventBus();
      tracker.wireToEventBus(bus);

      bus.emit({
        type: 'session:message' as any,
        sessionId: 'session-1',
        agentName: 'verbal',
        payload: {
          model: 'claude-sonnet-4.5',
          inputTokens: 500,
          outputTokens: 250,
          estimatedCost: 0.005,
        },
        timestamp: new Date(),
      });

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(500);
      expect(summary.totalOutputTokens).toBe(250);
    });

    it('should return an unsubscribe function that stops tracking', () => {
      const bus = new EventBus();
      const unsub = tracker.wireToEventBus(bus);

      bus.emit({
        type: 'session:message' as any,
        sessionId: 'session-1',
        payload: {
          model: 'test',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCost: 0.001,
        },
        timestamp: new Date(),
      });

      unsub();

      bus.emit({
        type: 'session:message' as any,
        sessionId: 'session-2',
        payload: {
          model: 'test',
          inputTokens: 200,
          outputTokens: 100,
          estimatedCost: 0.002,
        },
        timestamp: new Date(),
      });

      const summary = tracker.getSummary();
      // Only the first event should be recorded
      expect(summary.totalInputTokens).toBe(100);
    });

    it('should ignore events without token data in payload', () => {
      const bus = new EventBus();
      tracker.wireToEventBus(bus);

      bus.emit({
        type: 'session:message' as any,
        sessionId: 'session-1',
        payload: { status: 'complete' },
        timestamp: new Date(),
      });

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(0);
    });
  });
});
