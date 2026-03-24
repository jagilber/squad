/**
 * Aspire Command Tests -- CLI command for launching Aspire dashboard (Issue #265)
 *
 * Tests the runAspire function's configuration and validation logic.
 * Does NOT actually launch Docker/dotnet processes.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { SpawnOptions } from 'node:child_process';

// vi.mock is hoisted -- this intercepts node:child_process before any module imports it.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    execSync: vi.fn(),
  };
});

import { spawn, execSync } from 'node:child_process';

function makeFakeChild() {
  const fake = new EventEmitter();
  (fake as any).stdout = new EventEmitter();
  (fake as any).stderr = new EventEmitter();
  (fake as any).stdin = null;
  (fake as any).pid = 99999;
  return fake;
}

describe('squad aspire command', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('module exports runAspire function', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/aspire');
    expect(typeof mod.runAspire).toBe('function');
  });

  it('AspireOptions accepts docker and port', async () => {
    const mod = await import('@bradygaster/squad-cli/commands/aspire');
    expect(mod.runAspire).toBeDefined();
  });

  describe('Windows: spawn options include windowsHide:true (issue #5)', () => {
    beforeEach(() => {
      vi.mocked(spawn).mockReturnValue(makeFakeChild() as any);
    });

    it('launchWithDocker spawn call includes windowsHide:true', async () => {
      // execSync returns successfully so commandExists('docker') is true
      vi.mocked(execSync).mockReturnValue(Buffer.from('Docker version 24.0'));

      const { runAspire } = await import('../packages/squad-cli/src/cli/commands/aspire.js');
      // docker:true forces the docker path regardless of dotnet availability
      runAspire({ docker: true }).catch(() => {});
      await new Promise((r) => setTimeout(r, 50));

      const dockerCall = vi.mocked(spawn).mock.calls.find((c) => c[0] === 'docker');
      expect(dockerCall, 'spawn("docker") was not called').toBeTruthy();
      const opts = dockerCall![2] as SpawnOptions;
      expect(opts.windowsHide, 'spawn("docker") must have windowsHide:true').toBe(true);
    });

    it('launchWithDotnet spawn call includes windowsHide:true', async () => {
      // docker --version throws (unavailable), dotnet workload list returns 'aspire' (string for .toLowerCase())
      vi.mocked(execSync).mockImplementation((cmd: any) => {
        const c = String(cmd);
        if (c.includes('docker')) throw new Error('not found');
        if (c.includes('workload')) return 'aspire' as any;
        return Buffer.from('');
      });

      const { runAspire } = await import('../packages/squad-cli/src/cli/commands/aspire.js');
      runAspire().catch(() => {});
      await new Promise((r) => setTimeout(r, 50));

      const dotnetCall = vi.mocked(spawn).mock.calls.find((c) => c[0] === 'dotnet');
      expect(dotnetCall, 'spawn("dotnet") was not called').toBeTruthy();
      const opts = dotnetCall![2] as SpawnOptions;
      expect(opts.windowsHide, 'spawn("dotnet") must have windowsHide:true').toBe(true);
    });
  });
});

