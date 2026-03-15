/**
 * Tests for Coordinator MCP Tooling Enforcement
 *
 * Validates that the coordinator passes MCP server configuration
 * to spawned agent sessions so agents have tool access.
 *
 * TDD: RED → GREEN — these tests should FAIL initially.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  spawnParallel,
  type AgentSpawnConfig,
  type FanOutDependencies,
} from '@bradygaster/squad-sdk/coordinator';
import { EventBus } from '@bradygaster/squad-sdk/client';
import { SessionPool } from '@bradygaster/squad-sdk/client';
import type { AgentCharter } from '@bradygaster/squad-sdk/agents';

describe('Coordinator MCP Enforcement', () => {
  let mockDeps: FanOutDependencies;
  let eventBus: EventBus;
  let sessionPool: SessionPool;
  let createSessionSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    eventBus = new EventBus();
    sessionPool = new SessionPool({ maxConcurrent: 10, idleTimeout: 60000, healthCheckInterval: 30000 });

    createSessionSpy = vi.fn(async (config: any) => ({
      sessionId: `session-${Math.random().toString(36).slice(2, 11)}`,
      sendMessage: vi.fn(async () => {}),
    }));

    mockDeps = {
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
      createSession: createSessionSpy,
      sessionPool,
      eventBus,
    };
  });

  it('should accept mcpServers in AgentSpawnConfig', () => {
    const config: AgentSpawnConfig = {
      agentName: 'verbal',
      task: 'review this code',
      mcpServers: {
        filesystem: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem'] },
      },
    };

    expect(config.mcpServers).toBeDefined();
    expect(config.mcpServers!.filesystem).toBeDefined();
  });

  it('should pass mcpServers to createSession when provided', async () => {
    const configs: AgentSpawnConfig[] = [
      {
        agentName: 'verbal',
        task: 'review code',
        mcpServers: {
          filesystem: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem'] },
        },
      },
    ];

    await spawnParallel(configs, mockDeps);

    expect(createSessionSpy).toHaveBeenCalledTimes(1);
    const sessionConfig = createSessionSpy.mock.calls[0]![0];
    expect(sessionConfig).toHaveProperty('mcpServers');
    expect(sessionConfig.mcpServers).toEqual({
      filesystem: { command: 'npx', args: ['@modelcontextprotocol/server-filesystem'] },
    });
  });

  it('should not include mcpServers when not provided', async () => {
    const configs: AgentSpawnConfig[] = [
      { agentName: 'fenster', task: 'write tests' },
    ];

    await spawnParallel(configs, mockDeps);

    expect(createSessionSpy).toHaveBeenCalledTimes(1);
    const sessionConfig = createSessionSpy.mock.calls[0]![0];
    expect(sessionConfig).not.toHaveProperty('mcpServers');
  });

  it('should pass mcpServers to each agent in parallel fan-out', async () => {
    const sharedMcp = {
      memory: { command: 'npx', args: ['@modelcontextprotocol/server-memory'] },
    };

    const configs: AgentSpawnConfig[] = [
      { agentName: 'verbal', task: 'review', mcpServers: sharedMcp },
      { agentName: 'fenster', task: 'test', mcpServers: sharedMcp },
      { agentName: 'hockney', task: 'document', mcpServers: sharedMcp },
    ];

    await spawnParallel(configs, mockDeps);

    expect(createSessionSpy).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const sessionConfig = createSessionSpy.mock.calls[i]![0];
      expect(sessionConfig.mcpServers).toEqual(sharedMcp);
    }
  });

  it('should support per-agent MCP server configuration', async () => {
    const configs: AgentSpawnConfig[] = [
      {
        agentName: 'verbal',
        task: 'review',
        mcpServers: { filesystem: { command: 'fs-server' } },
      },
      {
        agentName: 'fenster',
        task: 'test',
        mcpServers: { web: { command: 'web-server' } },
      },
    ];

    await spawnParallel(configs, mockDeps);

    const verbalConfig = createSessionSpy.mock.calls[0]![0];
    const fensterConfig = createSessionSpy.mock.calls[1]![0];
    expect(verbalConfig.mcpServers).toEqual({ filesystem: { command: 'fs-server' } });
    expect(fensterConfig.mcpServers).toEqual({ web: { command: 'web-server' } });
  });
});
