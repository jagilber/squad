import { describe, it, expect } from 'vitest';

describe('Consumer-perspective imports', () => {
  describe('main barrel exports', () => {
    it('exports key parser functions', async () => {
      const { parseTeamMarkdown, parseDecisionsMarkdown, parseRoutingMarkdown } =
        await import('../src/index.js');
      expect(typeof parseTeamMarkdown).toBe('function');
      expect(typeof parseDecisionsMarkdown).toBe('function');
      expect(typeof parseRoutingMarkdown).toBe('function');
    });

    it('exports CLI functions', async () => {
      const { runInit, runExport, runImport, scrubEmails } =
        await import('../src/index.js');
      expect(typeof runInit).toBe('function');
      expect(typeof runExport).toBe('function');
      expect(typeof runImport).toBe('function');
      expect(typeof scrubEmails).toBe('function');
    });

    it('exports VERSION as a string', async () => {
      const { VERSION } = await import('../src/index.js');
      expect(typeof VERSION).toBe('string');
      expect(VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('parsers barrel exports', () => {
    it('exports parser functions from parsers barrel', async () => {
      const { parseTeamMarkdown, parseCharterMarkdown } =
        await import('../src/parsers.js');
      expect(typeof parseTeamMarkdown).toBe('function');
      expect(typeof parseCharterMarkdown).toBe('function');
    });
  });

  describe('types barrel', () => {
    it('has zero runtime exports (pure type re-exports)', async () => {
      const types = await import('../src/types.js');
      // type-only re-exports produce no runtime values
      expect(Object.keys(types).length).toBe(0);
    });
  });

  describe('side-effect-free import', () => {
    it('importing the barrel does NOT trigger CLI behavior', async () => {
      const argvBefore = [...process.argv];
      await import('../src/index.js');
      // process.argv unchanged — no CLI side effects
      expect(process.argv).toEqual(argvBefore);
      // The test completing without hanging or exiting proves the import is clean
    });
  });
});
