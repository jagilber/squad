/**
 * SDK-tier coverage for the documented squad_route contract.
 *
 * These tests treat the SDK as a black box: they import only from the
 * package's published subpath exports (the same ones embedders use when
 * following docs/src/content/docs/reference/sdk.md and api-reference.md).
 *
 * Goal: lock in the documented promise that
 *
 *   const registry = new ToolRegistry('./.squad', undefined, undefined, undefined, () => deps);
 *   const tool = registry.getTool('squad_route');
 *   await tool.handler({ targetAgent, task }, ctx);
 *
 * actually spawns a session via the fan-out path, and that constructing
 * the registry without fan-out dependencies surfaces a documented
 * failure rather than a silent fake-success (regression guard for
 * jagilber/squad#9).
 *
 * @module test/sdk/squad-route
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry, type RouteRequest } from '@bradygaster/squad-sdk/tools';
import { SessionPool, EventBus } from '@bradygaster/squad-sdk/client';
import type { FanOutDependencies } from '@bradygaster/squad-sdk/coordinator';
import type { AgentCharter } from '@bradygaster/squad-sdk/agents';

/**
 * Build mocked FanOutDependencies wired only at the documented public boundary
 * (charter compile, model resolve, session create). Real EventBus + SessionPool
 * are used so embedder-side wiring failures would surface here.
 */
function buildEmbedderFanOutDeps(
  overrides: Partial<FanOutDependencies> = {},
): FanOutDependencies {
  return {
    compileCharter:
      overrides.compileCharter ??
      vi.fn(async (agentName: string): Promise<AgentCharter> => ({
        name: agentName,
        displayName: `${agentName} Agent`,
        role: 'Developer',
        expertise: ['TypeScript'],
        style: 'Professional',
        prompt: `You are ${agentName}`,
        modelPreference: 'claude-sonnet-4.5',
      })),
    resolveModel:
      overrides.resolveModel ??
      vi.fn(async (charter: AgentCharter, override?: string) =>
        override ?? charter.modelPreference ?? 'claude-sonnet-4.5',
      ),
    createSession:
      overrides.createSession ??
      vi.fn(async () => ({
        sessionId: `embedder-session-${Math.random().toString(36).slice(2, 11)}`,
        sendMessage: vi.fn(async () => undefined),
      })),
    sessionPool:
      overrides.sessionPool ??
      new SessionPool({
        maxConcurrent: 10,
        idleTimeout: 60_000,
        healthCheckInterval: 30_000,
      }),
    eventBus: overrides.eventBus ?? new EventBus(),
  };
}

describe('SDK contract: squad_route (documented snippet)', () => {
  const ctx = {
    sessionId: 'embedder-test-session',
    toolCallId: 'embedder-test-call',
    toolName: 'squad_route',
    arguments: {},
  };

  it('matches the registry construction example from docs/reference/sdk.md', () => {
    // sdk.md §"ToolRegistry" — embedder example:
    //   const registry = new ToolRegistry('./.squad');
    //   registry.getTool('squad_route');
    const registry = new ToolRegistry('./.squad-sdk-contract');
    const tool = registry.getTool('squad_route');

    expect(tool).toBeDefined();
    expect(tool!.name).toBe('squad_route');
    expect(tool!.description).toMatch(/route/i);
    // documented in sdk.md: parameters object is JSON-Schema-shaped
    expect(tool!.parameters).toMatchObject({ type: 'object' });
  });

  it('spawns a session when constructed with a fanOutDepsGetter (documented happy path)', async () => {
    const deps = buildEmbedderFanOutDeps();
    const registry = new ToolRegistry(
      './.squad-sdk-contract',
      undefined,
      undefined,
      undefined,
      () => deps,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      {
        targetAgent: 'fenster',
        task: 'Implement feature X',
        priority: 'high',
        context: 'Related to PRD-2',
      } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({ resultType: 'success' });
    // Documented contract: success carries a real sessionId from createSession.
    const sessionId = (result as { toolTelemetry?: { sessionId?: string } })
      .toolTelemetry?.sessionId;
    expect(sessionId).toBeTruthy();
    expect(sessionId).toMatch(/^embedder-session-/);
    expect((result as { textResultForLlm: string }).textResultForLlm).toContain(
      'fenster',
    );
    expect(deps.compileCharter).toHaveBeenCalledWith('fenster');
    expect(deps.createSession).toHaveBeenCalledOnce();
  });

  it('returns documented failure shape when constructed without fan-out deps (regression guard for #9)', async () => {
    // Pre-fix behavior: handler returned fake `success` with no session.
    // Post-fix: explicit failure with `error: "fan-out-deps-unavailable"`
    // and remediation text naming the fix (configure fanOutDepsGetter).
    const registry = new ToolRegistry('./.squad-sdk-contract');
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: 'fenster', task: 'Implement feature X' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'fan-out-deps-unavailable',
    });
    const text = (result as { textResultForLlm: string }).textResultForLlm;
    expect(text).toContain('fenster');
    // Remediation must point embedders at the fix.
    expect(text).toMatch(/fanOutDepsGetter|onPreToolUse/);
  });

  it('returns the documented failure shape when fanOutDepsGetter returns undefined', async () => {
    const registry = new ToolRegistry(
      './.squad-sdk-contract',
      undefined,
      undefined,
      undefined,
      () => undefined,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: 'fenster', task: 'Implement feature X' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'fan-out-deps-unavailable',
    });
  });

  it('surfaces underlying spawn failures rather than masking them as success', async () => {
    const deps = buildEmbedderFanOutDeps({
      compileCharter: vi.fn(async () => {
        throw new Error('charter-not-found');
      }),
    });
    const registry = new ToolRegistry(
      './.squad-sdk-contract',
      undefined,
      undefined,
      undefined,
      () => deps,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: 'ghost', task: 'Do thing' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({ resultType: 'failure' });
    // Spawn exceptions are caught and returned as spawn-exception
    const error = (result as { error: string }).error;
    expect(error === 'spawn-exception' || error.includes('charter-not-found')).toBe(true);
  });

  it('rejects targetAgent with invalid characters', async () => {
    const deps = buildEmbedderFanOutDeps();
    const registry = new ToolRegistry(
      './.squad-sdk-contract',
      undefined,
      undefined,
      undefined,
      () => deps,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: '../evil-path', task: 'pwn' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'invalid-agent-name',
    });
    expect(deps.compileCharter).not.toHaveBeenCalled();
  });

  it('rejects targetAgent with spaces', async () => {
    const deps = buildEmbedderFanOutDeps();
    const registry = new ToolRegistry(
      './.squad-sdk-contract',
      undefined,
      undefined,
      undefined,
      () => deps,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: 'agent with spaces', task: 'test' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'invalid-agent-name',
    });
  });

  it('trims and accepts a valid targetAgent name', async () => {
    const deps = buildEmbedderFanOutDeps();
    const registry = new ToolRegistry(
      './.squad-sdk-contract',
      undefined,
      undefined,
      undefined,
      () => deps,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: '  fenster  ', task: 'test trim' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({ resultType: 'success' });
    expect(deps.compileCharter).toHaveBeenCalledWith('fenster');
  });

  it('sanitizes spawn error messages (no raw squadRoot paths in textResultForLlm)', async () => {
    const squadRoot = './.squad-sdk-contract';
    const deps = buildEmbedderFanOutDeps({
      compileCharter: vi.fn(async () => {
        throw new Error(`ENOENT: ${squadRoot}/agents/ghost/charter.md not found`);
      }),
    });
    const registry = new ToolRegistry(
      squadRoot,
      undefined,
      undefined,
      undefined,
      () => deps,
    );
    const tool = registry.getTool('squad_route')!;

    const result = await tool.handler(
      { targetAgent: 'ghost', task: 'test' } as RouteRequest,
      ctx,
    );

    expect(result).toMatchObject({ resultType: 'failure' });
    const text = (result as { textResultForLlm: string }).textResultForLlm;
    // sanitizeErrorForLlm replaces squadRoot with [team-root]
    expect(text).not.toContain(squadRoot);
    expect(text).toContain('[team-root]');
  });

  it('lists squad_route in registry.getToolsForAgent (documented filter API)', () => {
    // sdk.md §"ToolRegistry":
    //   registry.getToolsForAgent(['squad_route', 'squad_decide']);
    const registry = new ToolRegistry('./.squad-sdk-contract');
    const filtered = registry.getToolsForAgent(['squad_route', 'squad_decide']);

    expect(filtered.map((t) => t.name).sort()).toEqual([
      'squad_decide',
      'squad_route',
    ]);
  });
});
