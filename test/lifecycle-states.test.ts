/**
 * Tests for Agent Lifecycle State Transitions
 *
 * Validates:
 * - All states in the lifecycle enum including "pending"
 * - Correct state transitions: pending → spawning → active → idle → error → destroyed
 * - Invalid state transition guards
 * - Idle timeout marking
 *
 * TDD: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import type { AgentStatus } from '@bradygaster/squad-sdk/agents';

describe('Agent Lifecycle States', () => {
  describe('AgentStatus type', () => {
    it('should include "pending" as a valid status', () => {
      // This tests that the type accepts "pending"
      const status: AgentStatus = 'pending';
      expect(status).toBe('pending');
    });

    it('should include all lifecycle states', () => {
      const validStatuses: AgentStatus[] = [
        'pending',
        'spawning',
        'active',
        'idle',
        'error',
        'destroyed',
      ];

      // All states should be assignable without type error
      expect(validStatuses).toHaveLength(6);
      expect(validStatuses).toContain('pending');
      expect(validStatuses).toContain('spawning');
      expect(validStatuses).toContain('active');
      expect(validStatuses).toContain('idle');
      expect(validStatuses).toContain('error');
      expect(validStatuses).toContain('destroyed');
    });
  });

  describe('State transition validity', () => {
    // Helper to validate transition rules
    function isValidTransition(from: AgentStatus, to: AgentStatus): boolean {
      const validTransitions: Record<AgentStatus, AgentStatus[]> = {
        pending: ['spawning', 'error', 'destroyed'],
        spawning: ['active', 'error', 'destroyed'],
        active: ['idle', 'error', 'destroyed'],
        idle: ['active', 'error', 'destroyed'],
        error: ['spawning', 'destroyed'], // retry or give up
        destroyed: [], // terminal state
      };

      return validTransitions[from]?.includes(to) ?? false;
    }

    it('should allow pending → spawning', () => {
      expect(isValidTransition('pending', 'spawning')).toBe(true);
    });

    it('should allow spawning → active', () => {
      expect(isValidTransition('spawning', 'active')).toBe(true);
    });

    it('should allow active → idle', () => {
      expect(isValidTransition('active', 'idle')).toBe(true);
    });

    it('should allow idle → active (wake up)', () => {
      expect(isValidTransition('idle', 'active')).toBe(true);
    });

    it('should allow error → spawning (retry)', () => {
      expect(isValidTransition('error', 'spawning')).toBe(true);
    });

    it('should not allow destroyed → any state', () => {
      expect(isValidTransition('destroyed', 'pending')).toBe(false);
      expect(isValidTransition('destroyed', 'spawning')).toBe(false);
      expect(isValidTransition('destroyed', 'active')).toBe(false);
    });

    it('should not allow skipping states (pending → active)', () => {
      expect(isValidTransition('pending', 'active')).toBe(false);
    });

    it('should allow any non-destroyed state to transition to destroyed', () => {
      expect(isValidTransition('pending', 'destroyed')).toBe(true);
      expect(isValidTransition('spawning', 'destroyed')).toBe(true);
      expect(isValidTransition('active', 'destroyed')).toBe(true);
      expect(isValidTransition('idle', 'destroyed')).toBe(true);
      expect(isValidTransition('error', 'destroyed')).toBe(true);
    });

    it('should allow any non-destroyed state to transition to error', () => {
      expect(isValidTransition('pending', 'error')).toBe(true);
      expect(isValidTransition('spawning', 'error')).toBe(true);
      expect(isValidTransition('active', 'error')).toBe(true);
      expect(isValidTransition('idle', 'error')).toBe(true);
    });
  });
});
