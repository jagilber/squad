/**
 * Claude Code prompt runtime — `.claude/agents/squad.md` emission (T4, Path A).
 *
 * Squad's coordinator prompt is authored once (`.squad-templates/squad.agent.md`,
 * Copilot front matter) and emitted twice: verbatim to
 * `.github/agents/squad.agent.md`, and front-matter-translated to
 * `.claude/agents/squad.md` so Claude Code registers it as a subagent.
 *
 * This suite pins:
 *   1. the front-matter translation rules (`toClaudeSubagentDoc`)
 *   2. the manifest declaration of the new destination
 *   3. byte parity between the TS translator (what `squad init`/`upgrade` ship)
 *      and the duplicated JS translator in scripts/sync-templates.mjs
 *      (what this repo's own .claude/agents/squad.md is built from)
 *   4. the coordinator prompt naming Claude Code's `Agent` tool as a 4th
 *      spawn platform, in every synced copy
 *
 * On the tool name: the first cut of this feature said `Task`. Measured against
 * the real CLI (claude 2.1.224) the spawn tool is `Agent` and `Task` does not
 * exist — a prompt that names `Task` tells the coordinator to call a tool that
 * is not there, so these assertions require `Agent` specifically. See
 * CLAUDE_SPAWN_TOOL_NAMES in squad-sdk/src/coordinator/spawn-backend.ts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { toClaudeSubagentDoc, toClaudeAgentName, CLAUDE_AGENT_RELATIVE_PATH } from '@bradygaster/squad-sdk';
import { TEMPLATE_MANIFEST } from '../packages/squad-cli/src/cli/core/templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
}

const CANONICAL = '.squad-templates/squad.agent.md';

/** Every copy of the coordinator prompt that carries Copilot front matter. */
const SQUAD_AGENT_LOCATIONS = [
  CANONICAL,
  'templates/squad.agent.md.template',
  '.github/agents/squad.agent.md',
  'packages/squad-cli/templates/squad.agent.md.template',
  'packages/squad-sdk/templates/squad.agent.md.template',
] as const;

// ---------------------------------------------------------------------------
// 1. Front-matter translation rules
// ---------------------------------------------------------------------------

describe('toClaudeSubagentDoc — Copilot → Claude Code front matter', () => {
  const SAMPLE = [
    '---',
    'name: Squad',
    'description: "Your AI team."',
    'tools: ["*"]',
    '---',
    '',
    '<!-- version: 1.2.3 -->',
    '',
    'Body line.',
    '',
  ].join('\n');

  const out = toClaudeSubagentDoc(SAMPLE);

  it('lowercases the agent name (Claude Code requires a slug)', () => {
    expect(out).toMatch(/^---\nname: squad\n/);
  });

  it('preserves the description', () => {
    expect(out).toContain('description: "Your AI team."');
  });

  it('drops `tools` entirely — Claude Code has no `*` wildcard, and omitting `tools` means inherit-all', () => {
    expect(out).not.toContain('tools:');
    expect(out).not.toContain('"*"');
  });

  it('pins the coordinator to the session model with `model: inherit`', () => {
    expect(out).toContain('model: inherit');
  });

  it('emits exactly one front-matter block', () => {
    const fences = out.split('\n').filter(l => l === '---').length;
    expect(fences).toBe(2);
  });

  it('copies the body verbatim, including the version stamp', () => {
    expect(out).toContain('<!-- version: 1.2.3 -->');
    expect(out).toContain('Body line.');
  });

  it('drops mcp-servers front matter (Claude Code reads MCP from .mcp.json)', () => {
    const withMcp = [
      '---',
      'name: Squad',
      'description: "x"',
      'mcp-servers:',
      '  - name: squad_state',
      '---',
      '',
      'Body.',
    ].join('\n');
    const res = toClaudeSubagentDoc(withMcp);
    expect(res).not.toContain('mcp-servers');
    expect(res).not.toContain('squad_state');
  });

  it('falls back to sane defaults when front matter is missing', () => {
    const res = toClaudeSubagentDoc('Just a body, no front matter.\n');
    expect(res).toMatch(/^---\nname: squad\n/);
    expect(res).toContain('description: "');
    expect(res).toContain('Just a body, no front matter.');
  });

  it('toClaudeAgentName slugifies to [a-z0-9-]', () => {
    expect(toClaudeAgentName('Squad')).toBe('squad');
    expect(toClaudeAgentName('My Squad Agent!')).toBe('my-squad-agent');
    expect(toClaudeAgentName('   ')).toBe('squad');
  });
});

// ---------------------------------------------------------------------------
// 2. Manifest declaration
// ---------------------------------------------------------------------------

describe('TEMPLATE_MANIFEST declares the Claude Code subagent', () => {
  const entry = TEMPLATE_MANIFEST.find(e => e.destination === '../.claude/agents/squad.md');

  it('has an entry routing squad.agent.md.template → ../.claude/agents/squad.md', () => {
    expect(
      entry,
      'TEMPLATE_MANIFEST is missing the ../.claude/agents/squad.md entry — ' +
        '`squad init`/`squad upgrade` will not emit the Claude Code coordinator',
    ).toBeDefined();
    expect(entry!.source).toBe('squad.agent.md.template');
    expect(entry!.overwriteOnUpgrade).toBe(true);
  });

  it('shares its source with the .github/agents entry (one body, two dialects)', () => {
    const githubEntry = TEMPLATE_MANIFEST.find(
      e => e.destination === '../.github/agents/squad.agent.md',
    );
    expect(githubEntry).toBeDefined();
    expect(entry!.source).toBe(githubEntry!.source);
  });

  it('exports the emitted path constant', () => {
    expect(CLAUDE_AGENT_RELATIVE_PATH).toBe('.claude/agents/squad.md');
  });
});

// ---------------------------------------------------------------------------
// 3. sync-templates.mjs output == toClaudeSubagentDoc output
// ---------------------------------------------------------------------------

describe('.claude/agents/squad.md (repo dogfood copy)', () => {
  beforeAll(() => {
    // Other suites run `squad init` against the repo root and can overwrite the
    // synced copies — re-sync immediately before comparing (same guard the
    // template-sync suite uses).
    execSync('node scripts/sync-templates.mjs', { cwd: ROOT, encoding: 'utf-8', timeout: 60_000 });
  });

  it('is emitted by scripts/sync-templates.mjs', () => {
    expect(
      existsSync(resolve(ROOT, CLAUDE_AGENT_RELATIVE_PATH)),
      '.claude/agents/squad.md missing — did sync-templates.mjs stop emitting the derived target?',
    ).toBe(true);
  });

  it('matches toClaudeSubagentDoc() byte-for-byte (mjs copy has not drifted from the TS source)', () => {
    const expected = toClaudeSubagentDoc(read(CANONICAL));
    const actual = read(CLAUDE_AGENT_RELATIVE_PATH);
    expect(
      actual,
      'scripts/sync-templates.mjs toClaudeSubagentDoc() has drifted from ' +
        'packages/squad-sdk/src/config/claude-agent.ts — edit both',
    ).toBe(expected);
  });

  it('has Claude-Code-valid front matter (name + description, no tools wildcard)', () => {
    const content = read(CLAUDE_AGENT_RELATIVE_PATH);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content)?.[1];
    expect(fm, 'no front-matter block').toBeDefined();
    expect(fm).toMatch(/^name: [a-z0-9-]+$/m);
    expect(fm).toMatch(/^description: .+$/m);
    expect(fm).not.toMatch(/^tools:/m);
  });

  it('carries the same coordinator body as .github/agents/squad.agent.md', () => {
    const stripFm = (s: string) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    expect(stripFm(read(CLAUDE_AGENT_RELATIVE_PATH))).toBe(
      stripFm(read('.github/agents/squad.agent.md')),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Coordinator prompt names Claude Code's `Agent` tool
// ---------------------------------------------------------------------------

describe('coordinator prompt parameterizes the spawn tool for Claude Code', () => {
  const locations = [...SQUAD_AGENT_LOCATIONS, CLAUDE_AGENT_RELATIVE_PATH];

  for (const loc of locations) {
    describe(loc, () => {
      it('lists Claude Code as a bullet in the DISPATCH MECHANISM block', () => {
        const content = read(loc);
        const idx = content.indexOf('DISPATCH MECHANISM');
        expect(idx, `${loc}: DISPATCH MECHANISM block missing`).toBeGreaterThanOrEqual(0);
        // Only the bullet list itself counts — prose elsewhere in the section
        // mentioning "Claude Code" is not a platform registration.
        const bullets = content
          .slice(idx, idx + 1200)
          .split(/\r?\n/)
          .filter(l => l.startsWith('- **'));
        const claudeBullet = bullets.find(l => l.startsWith('- **Claude Code:**'));
        expect(
          claudeBullet,
          `${loc}: DISPATCH MECHANISM has no "- **Claude Code:**" platform bullet ` +
            `(found: ${JSON.stringify(bullets.map(b => b.slice(0, 24)))})`,
        ).toBeDefined();
        expect(
          claudeBullet,
          `${loc}: Claude Code bullet must name the real spawn tool \`Agent\` — ` +
            'claude 2.1.224 exposes `Agent`, not `Task`',
        ).toMatch(/`Agent`/);
      });

      it('probes for `Agent` in the platform-detection probe', () => {
        const content = read(loc);
        const idx = content.indexOf('Platform detection probe');
        expect(idx, `${loc}: platform detection probe missing`).toBeGreaterThanOrEqual(0);
        const block = content.slice(idx, idx + 900);
        expect(block, `${loc}: probe must check for the Agent tool`).toMatch(/`Agent`/);
        expect(block, `${loc}: probe must name Claude Code mode`).toMatch(/Claude Code mode/);
      });

      it('includes `Agent` in the inline-dispatch gate so Claude Code is not treated as "no spawn tool"', () => {
        const content = read(loc);
        const idx = content.search(/Inline-dispatch gate/i);
        expect(idx, `${loc}: inline-dispatch gate missing`).toBeGreaterThanOrEqual(0);
        const tail = content.slice(idx, idx + 700);
        expect(tail, `${loc}: gate must name Agent alongside task/runSubagent`).toMatch(/`Agent`/);
      });

      it('has a Claude Code spawn micro-playbook naming the real tool', () => {
        const content = read(loc);
        expect(
          content,
          `${loc}: missing Claude Code (Agent) micro-playbook`,
        ).toMatch(/Claude Code \(`Agent`\) micro-playbook/);
        const idx = content.indexOf('Claude Code (`Agent`) micro-playbook');
        const block = content.slice(idx, idx + 900);
        expect(block, `${loc}: playbook must name subagent_type`).toMatch(/subagent_type/);
        // Measured: subagents DO receive the Agent tool, so nesting is not a
        // reason to fall back to inline work. The prompt must say so.
        expect(block, `${loc}: playbook must state nested dispatch works`).toMatch(/sub-?agent/i);
      });

      it('never names `Task` without also naming the real tool `Agent` on the same line', () => {
        const content = read(loc);
        // `Task` may only appear as a legacy alias mentioned ALONGSIDE `Agent`.
        // Requiring `Agent` on the same line (rather than just a "legacy" or
        // "older builds" phrase nearby) is what makes this check able to fail:
        // an earlier version keyed on the phrase, and a line reverted to
        // `- **Claude Code:** \`Task\` tool … Older builds named this tool \`Task\``
        // sailed straight through it.
        const badLines = content
          .split(/\r?\n/)
          .filter(l => /`Task`/.test(l) && !/`Agent`/.test(l));
        expect(
          badLines,
          `${loc}: these lines name \`Task\` with no \`Agent\` alongside it — current ` +
            `Claude Code (2.1.224) exposes \`Agent\` and has NO \`Task\` tool, so this ` +
            `tells the coordinator to call something that isn't there:\n${badLines.join('\n')}`,
        ).toEqual([]);
      });

      it('warns that `task` and `Agent` are different tools', () => {
        const content = read(loc);
        expect(
          content,
          `${loc}: prompt must call out that lowercase task (Copilot CLI) and Agent (Claude Code) differ`,
        ).toMatch(/`task`[^\n]*`Agent`[^\n]*different tools/);
      });
    });
  }
});
