#!/usr/bin/env node
/**
 * sync-templates.mjs — Copy canonical templates from .squad-templates/
 * to every target directory that needs them.
 *
 * Targets:
 *   templates/                        (root mirror)
 *   packages/squad-cli/templates/     (CLI package)
 *   packages/squad-sdk/templates/     (SDK package)
 *   .github/agents/squad.agent.md     (GitHub agent — squad.agent.md only)
 *   .claude/agents/squad.md           (Claude Code subagent — derived from
 *                                      squad.agent.md with translated front
 *                                      matter; see toClaudeSubagentDoc below)
 *
 * Only copies files that exist in .squad-templates/. Target directories
 * that don't exist are skipped with a warning.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Guard: require explicit invocation to prevent accidental auto-triggering
// during agent work (e.g., file watchers, git hooks).
// Pass --sync flag or set SQUAD_SYNC_TEMPLATES=1 env var.
// ---------------------------------------------------------------------------
const explicitFlag = process.argv.includes('--sync');
const envFlag = process.env.SQUAD_SYNC_TEMPLATES === '1';
const directInvocation = process.argv.length <= 2;
if (!directInvocation && !explicitFlag && !envFlag) {
  console.log('⛔ sync-templates requires explicit invocation.');
  console.log('   Use: node scripts/sync-templates.mjs --sync');
  console.log('   Or:  SQUAD_SYNC_TEMPLATES=1 node scripts/sync-templates.mjs');
  process.exit(0);
}

const SOURCE = join(ROOT, '.squad-templates');

const MIRROR_TARGETS = [
  join(ROOT, 'templates'),
  join(ROOT, 'packages', 'squad-cli', 'templates'),
  join(ROOT, 'packages', 'squad-sdk', 'templates'),
];

// squad.agent.md also goes to .github/agents/
const AGENT_MD_TARGET = join(ROOT, '.github', 'agents');
const AGENT_MD_FILE = 'squad.agent.md';

// ...and, front-matter-translated, to .claude/agents/squad.md so the repo
// dogfoods its own coordinator under the Claude Code runtime too.
const CLAUDE_AGENT_TARGET = join(ROOT, '.claude', 'agents', 'squad.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all file paths relative to `dir`. */
function collectFiles(dir, base = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Translate Copilot agent front matter into Claude Code subagent front matter.
 *
 * MUST stay behaviourally identical to `toClaudeSubagentDoc()` in
 * packages/squad-sdk/src/config/claude-agent.ts — that TS function is what
 * `squad init` / `squad upgrade` ship, this copy is what the repo's own
 * .claude/agents/squad.md is built from. test/claude-agent-emission.test.ts
 * pins the two together byte-for-byte; if you edit one, edit both.
 */
function toClaudeSubagentDoc(agentMarkdown) {
  const DROPPED = new Set(['tools', 'mcp-servers', 'mcp_servers', 'model']);
  let frontmatter = '';
  let body = agentMarkdown;
  if (/^---\r?\n/.test(agentMarkdown)) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(agentMarkdown);
    if (m) {
      frontmatter = m[1] ?? '';
      body = agentMarkdown.slice(m[0].length);
    }
  }

  const readScalar = (key) => {
    const raw = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(frontmatter)?.[1]?.trim();
    if (raw === undefined || raw === '') return undefined;
    const unquoted = /^"(.*)"$/.exec(raw)?.[1] ?? /^'(.*)'$/.exec(raw)?.[1] ?? raw;
    return unquoted.trim() || undefined;
  };

  const rawName = readScalar('name') ?? 'squad';
  const name = rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'squad';
  const description = readScalar('description')
    ?? "Your AI team. Describe what you're building, get a team of specialists that live in your repo.";

  const passthrough = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    const key = /^([A-Za-z0-9_-]+):/.exec(line)?.[1];
    if (!key) continue;
    if (key === 'name' || key === 'description') continue;
    if (DROPPED.has(key)) continue;
    passthrough.push(line.trimEnd());
  }

  const quoted = `"${description.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
  const header = [
    '---',
    `name: ${name}`,
    `description: ${quoted}`,
    ...passthrough,
    'model: inherit',
    '---',
  ].join('\n');

  return header + '\n' + (body.startsWith('\n') || body.startsWith('\r\n') ? body : '\n' + body);
}

/** Copy a single file, creating parent dirs as needed. Returns true if written. */
function copyFile(src, dest) {
  const content = readFileSync(src);
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  writeFileSync(dest, content);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!existsSync(SOURCE)) {
  console.log('⏭️  .squad-templates/ not found — nothing to sync');
  process.exit(0);
}

const sourceFiles = collectFiles(SOURCE);
let totalCopied = 0;

for (const relFile of sourceFiles) {
  const srcPath = join(SOURCE, relFile);
  const targets = [];

  // Mirror to each target directory
  // Rename squad.agent.md → squad.agent.md.template in mirror targets
  // so Copilot CLI 1.0.11 doesn't discover template copies as *.agent.md
  for (const targetDir of MIRROR_TARGETS) {
    if (!existsSync(targetDir)) {
      // Skip targets whose root doesn't exist (e.g., package not checked out)
      continue;
    }
    const destName = relFile === AGENT_MD_FILE ? AGENT_MD_FILE + '.template' : relFile;
    targets.push(join(targetDir, destName));
  }

  // Special case: squad.agent.md also goes to .github/agents/
  if (relFile === AGENT_MD_FILE && existsSync(AGENT_MD_TARGET)) {
    targets.push(join(AGENT_MD_TARGET, AGENT_MD_FILE));
  }

  if (targets.length === 0) continue;

  for (const dest of targets) {
    copyFile(srcPath, dest);
  }

  // Derived target: .claude/agents/squad.md (same body, Claude Code front matter).
  // Unlike the mirror targets this one is NOT byte-identical to the source, so it
  // is written separately and reported separately.
  let derivedNote = '';
  if (relFile === AGENT_MD_FILE) {
    const derived = toClaudeSubagentDoc(readFileSync(srcPath, 'utf-8'));
    const destDir = dirname(CLAUDE_AGENT_TARGET);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    writeFileSync(CLAUDE_AGENT_TARGET, derived);
    derivedNote = ` (+ .claude/agents/squad.md, front matter translated)`;
  }

  totalCopied++;
  const label = targets.length === 1
    ? `1 target`
    : `${targets.length} targets`;
  console.log(`  ✅ ${relFile} → ${label}${derivedNote}`);
}

console.log(`\n📋 Synced ${totalCopied} file(s) from .squad-templates/`);
