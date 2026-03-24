/**
 * RC-Tunnel Command Tests -- Devtunnel lifecycle management
 *
 * Tests module exports and pure utility functions.
 * Does NOT create real devtunnels (requires devtunnel CLI).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { SpawnOptions } from 'node:child_process';
import os from 'node:os';

// vi.mock is hoisted -- intercepts node:child_process before rc-tunnel.ts imports it.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    execSync: vi.fn(),
    execFileSync: vi.fn(),
  };
});

import { spawn, execFileSync } from 'node:child_process';

function makeFakeChild() {
  const fake = new EventEmitter();
  (fake as any).stdout = new EventEmitter();
  (fake as any).stderr = new EventEmitter();
  (fake as any).stdin = null;
  (fake as any).pid = 99999;
  return fake;
}

describe('CLI: rc-tunnel command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('module exports isDevtunnelAvailable function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.isDevtunnelAvailable).toBe('function');
  });

  it('module exports createTunnel function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.createTunnel).toBe('function');
  });

  it('module exports destroyTunnel function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.destroyTunnel).toBe('function');
  });

  it('module exports getMachineId function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.getMachineId).toBe('function');
  });

  it('module exports getGitInfo function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(typeof mod.getGitInfo).toBe('function');
  });

  it('isDevtunnelAvailable returns a boolean', async () => {
    // execFileSync('devtunnel', ['--version']) -- let it succeed or fail, just need boolean back
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('devtunnel 0.0.1'));
    const { isDevtunnelAvailable } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const result = isDevtunnelAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('getMachineId returns the system hostname', async () => {
    const { getMachineId } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const id = getMachineId();
    expect(id).toBe(os.hostname());
  });

  it('getGitInfo returns repo and branch from cwd', async () => {
    const { getGitInfo } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const info = getGitInfo(process.cwd());
    expect(info).toHaveProperty('repo');
    expect(info).toHaveProperty('branch');
    expect(typeof info.repo).toBe('string');
    expect(typeof info.branch).toBe('string');
  });

  it('getGitInfo returns "unknown" for non-git directories', async () => {
    const { getGitInfo } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    const info = getGitInfo(os.tmpdir());
    expect(info.repo).toBe('unknown');
    expect(info.branch).toBe('unknown');
  });

  it('destroyTunnel does not throw when no tunnel active', async () => {
    const { destroyTunnel } = await import('@bradygaster/squad-cli/commands/rc-tunnel');
    expect(() => destroyTunnel()).not.toThrow();
  });

  describe('Windows: spawn options include windowsHide:true (issue #6)', () => {
    it('createTunnel spawn("devtunnel") includes windowsHide:true', async () => {
      // execFileSync: first call is tunnel create (returns JSON), second is port add (returns empty)
      vi.mocked(execFileSync)
        .mockReturnValueOnce(Buffer.from(JSON.stringify({ tunnelId: 'test-tunnel-abc' })))
        .mockReturnValue(Buffer.from(''));

      vi.mocked(spawn).mockReturnValue(makeFakeChild() as any);

      const { createTunnel } = await import('../../packages/squad-cli/src/cli/commands/rc-tunnel.js');

      createTunnel(3000, { repo: 'test', branch: 'main', machine: 'testmachine' }).catch(() => {});
      await new Promise((r) => setTimeout(r, 50));

      const devtunnelCall = vi.mocked(spawn).mock.calls.find((c) => c[0] === 'devtunnel');
      expect(devtunnelCall, 'spawn("devtunnel") was not called').toBeTruthy();
      const opts = devtunnelCall![2] as SpawnOptions;
      expect(opts.windowsHide, 'spawn("devtunnel") must have windowsHide:true').toBe(true);
    });
  });
});
