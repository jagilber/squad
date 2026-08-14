/**
 * Tests for the `.squad/config.json` `runtime` / `runtimeConfig` plumbing
 * (T2) — the persistent counterpart to the `SQUAD_RUNTIME` env var.
 *
 * Deliberate design under test: `readRuntimePreference` does NOT validate the
 * stored value. A typo must reach `resolveRuntimeId()` and throw
 * `Unknown squad runtime "<value>"` rather than being filtered to null and
 * silently routing (billed) work to the default runtime.
 *
 * @module test/runtime-config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readRuntimePreference,
  writeRuntimePreference,
  readRuntimeConfig,
  writeRuntimeConfig,
  readModelPreference,
  VALID_SQUAD_RUNTIMES,
} from '../packages/squad-sdk/src/config/models.js';
import {
  resolveRuntimeId,
  resolveEffectiveRuntime,
  SQUAD_RUNTIME_ENV,
} from '../packages/squad-sdk/src/adapter/provider.js';

let squadDir: string;
const configPath = () => join(squadDir, 'config.json');

beforeEach(() => {
  squadDir = mkdtempSync(join(tmpdir(), 'squad-runtime-cfg-'));
});

afterEach(() => {
  rmSync(squadDir, { recursive: true, force: true });
  delete process.env[SQUAD_RUNTIME_ENV];
});

// ============================================================================
// readRuntimePreference / writeRuntimePreference
// ============================================================================

describe('readRuntimePreference', () => {
  it('returns null when config.json does not exist', () => {
    expect(readRuntimePreference(squadDir)).toBeNull();
  });

  it('returns null when config.json has no runtime key', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, defaultModel: 'claude-sonnet-4.6' }));
    expect(readRuntimePreference(squadDir)).toBeNull();
  });

  it('returns null for an empty-string runtime', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: '' }));
    expect(readRuntimePreference(squadDir)).toBeNull();
  });

  it('returns null (never throws) on unparseable JSON', () => {
    writeFileSync(configPath(), '{ this is not json');
    expect(readRuntimePreference(squadDir)).toBeNull();
  });

  it('returns an UNKNOWN value verbatim rather than filtering it to null', () => {
    // This is the whole point: validation belongs to resolveRuntimeId.
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'gemini' }));
    expect(readRuntimePreference(squadDir)).toBe('gemini');
  });
});

describe('writeRuntimePreference', () => {
  it('round-trips every valid runtime through a temp .squad/config.json', () => {
    for (const runtime of VALID_SQUAD_RUNTIMES) {
      writeRuntimePreference(squadDir, runtime);
      expect(readRuntimePreference(squadDir)).toBe(runtime);
      // And the value survives resolveRuntimeId unchanged.
      expect(resolveRuntimeId(readRuntimePreference(squadDir)!)).toBe(runtime);
    }
  });

  it('creates config.json with version 1 when absent', () => {
    writeRuntimePreference(squadDir, 'claude');
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(parsed).toEqual({ version: 1, runtime: 'claude' });
  });

  it('merges without clobbering other fields', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.8', economyMode: true }));
    writeRuntimePreference(squadDir, 'claude');
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(parsed).toEqual({ version: 1, defaultModel: 'claude-opus-4.8', economyMode: true, runtime: 'claude' });
    expect(readModelPreference(squadDir)).toBe('claude-opus-4.8');
  });

  it('null clears the key and leaves the rest of the config intact', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'claude', defaultModel: 'claude-opus-4.8' }));
    writeRuntimePreference(squadDir, null);
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(parsed.runtime).toBeUndefined();
    expect(parsed.defaultModel).toBe('claude-opus-4.8');
    expect(readRuntimePreference(squadDir)).toBeNull();
  });
});

// ============================================================================
// runtimeConfig (free-form, runtime-specific options)
// ============================================================================

describe('readRuntimeConfig / writeRuntimeConfig', () => {
  it('returns null when unset', () => {
    expect(readRuntimeConfig(squadDir)).toBeNull();
    writeFileSync(configPath(), JSON.stringify({ version: 1 }));
    expect(readRuntimeConfig(squadDir)).toBeNull();
  });

  it('round-trips an options object alongside the runtime key', () => {
    writeRuntimePreference(squadDir, 'claude');
    writeRuntimeConfig(squadDir, { maxTurns: 12, permissionMode: 'acceptEdits' });
    expect(readRuntimeConfig(squadDir)).toEqual({ maxTurns: 12, permissionMode: 'acceptEdits' });
    expect(readRuntimePreference(squadDir)).toBe('claude');
  });

  it('ignores a non-object runtimeConfig instead of throwing', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtimeConfig: ['nope'] }));
    expect(readRuntimeConfig(squadDir)).toBeNull();
  });

  it('null or empty clears the key', () => {
    writeRuntimeConfig(squadDir, { a: 1 });
    writeRuntimeConfig(squadDir, null);
    expect(readRuntimeConfig(squadDir)).toBeNull();
    writeRuntimeConfig(squadDir, { a: 1 });
    writeRuntimeConfig(squadDir, {});
    expect(readRuntimeConfig(squadDir)).toBeNull();
  });
});

// ============================================================================
// The failure mode this plumbing exists to preserve
// ============================================================================

describe('unknown runtime in .squad/config.json', () => {
  it('produces the existing "Unknown squad runtime" throw, with the offending value', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'gemini' }));
    const fromConfig = readRuntimePreference(squadDir);
    expect(fromConfig).toBe('gemini');
    expect(() => resolveRuntimeId(fromConfig!)).toThrowError(
      'Unknown squad runtime "gemini". Valid values: "copilot", "claude" ' +
      '(set via the runtime option or the SQUAD_RUNTIME environment variable).'
    );
  });

  it('rejects a near-miss typo rather than fuzzy-matching it', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'cloude' }));
    expect(() => resolveRuntimeId(readRuntimePreference(squadDir)!)).toThrow(/Unknown squad runtime "cloude"/);
  });

  it('accepts surrounding whitespace and casing (resolveRuntimeId normalizes)', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: '  Claude ' }));
    expect(resolveRuntimeId(readRuntimePreference(squadDir)!)).toBe('claude');
  });
});

// ============================================================================
// resolveEffectiveRuntime — the ONE shared 4-layer resolver
// ============================================================================

describe('resolveEffectiveRuntime', () => {
  it('defaults to copilot and says so', () => {
    expect(resolveEffectiveRuntime()).toEqual({ id: 'copilot', source: 'default', value: 'copilot' });
  });

  it('reports source "default" when squadDir has no runtime key', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.8' }));
    expect(resolveEffectiveRuntime({ squadDir })).toEqual({ id: 'copilot', source: 'default', value: 'copilot' });
  });

  it('reports source "config" when the runtime comes from .squad/config.json', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'claude' }));
    expect(resolveEffectiveRuntime({ squadDir })).toEqual({ id: 'claude', source: 'config', value: 'claude' });
  });

  it('reports source "env" and lets SQUAD_RUNTIME beat the config file', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'claude' }));
    process.env[SQUAD_RUNTIME_ENV] = 'copilot';
    expect(resolveEffectiveRuntime({ squadDir })).toEqual({ id: 'copilot', source: 'env', value: 'copilot' });
  });

  it('reports source "explicit" and lets an explicit id beat env and config', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'claude' }));
    process.env[SQUAD_RUNTIME_ENV] = 'claude';
    expect(resolveEffectiveRuntime({ squadDir, runtime: 'copilot' })).toEqual({
      id: 'copilot', source: 'explicit', value: 'copilot',
    });
  });

  it('ignores the config file entirely when squadDir is omitted', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'claude' }));
    expect(resolveEffectiveRuntime()).toMatchObject({ id: 'copilot', source: 'default' });
  });

  it('normalizes casing/whitespace but reports the raw value it resolved from', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: '  Claude ' }));
    expect(resolveEffectiveRuntime({ squadDir })).toEqual({ id: 'claude', source: 'config', value: '  Claude ' });
  });

  it('throws on an unknown value at the config layer', () => {
    writeFileSync(configPath(), JSON.stringify({ version: 1, runtime: 'gemini' }));
    expect(() => resolveEffectiveRuntime({ squadDir })).toThrow(/Unknown squad runtime "gemini"/);
  });

  it('throws on an unknown value at the env layer', () => {
    process.env[SQUAD_RUNTIME_ENV] = 'gemini';
    expect(() => resolveEffectiveRuntime({ squadDir })).toThrow(/Unknown squad runtime "gemini"/);
  });

  it('throws on an unknown explicit value', () => {
    expect(() => resolveEffectiveRuntime({ runtime: 'gemini' })).toThrow(/Unknown squad runtime "gemini"/);
  });

  it('treats an empty SQUAD_RUNTIME exactly as bare resolveRuntimeId does (throws)', () => {
    process.env[SQUAD_RUNTIME_ENV] = '';
    expect(() => resolveEffectiveRuntime({ squadDir })).toThrow(/Unknown squad runtime/);
    expect(() => resolveRuntimeId()).toThrow(/Unknown squad runtime/);
  });
});
