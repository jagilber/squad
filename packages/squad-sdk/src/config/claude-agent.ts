/**
 * Claude Code subagent emission (`.claude/agents/squad.md`).
 *
 * Squad's coordinator prompt is authored once, in `.squad-templates/squad.agent.md`,
 * with GitHub-Copilot-flavored front matter. Claude Code discovers subagents from
 * `.claude/agents/<name>.md` and requires its own front-matter dialect, so the same body
 * is re-emitted with translated front matter rather than maintained twice.
 *
 * Front-matter translation rules (Copilot → Claude Code):
 *
 * | Copilot key   | Claude Code result                                              |
 * |---------------|-----------------------------------------------------------------|
 * | `name: Squad` | `name: squad` — Claude Code agent names are lowercase/hyphenated |
 * | `description` | passed through (single-line, quoted)                             |
 * | `tools: ["*"]`| **omitted** — omitting `tools` means "inherit every tool", which  |
 * |               | is what `*` meant. Claude Code's `tools` is a comma-separated     |
 * |               | string of literal tool names and has no wildcard, so copying      |
 * |               | `["*"]` verbatim would register an agent with a bogus tool.       |
 * | (none)        | `model: inherit` — keep the coordinator on the session's model    |
 * |               | instead of silently downgrading to the default subagent model.    |
 * | `mcp-servers` | dropped — Claude Code does not read MCP config from agent files.  |
 *
 * The body (including the `<!-- version: X.Y.Z -->` stamp) is copied verbatim, so
 * the existing version-stamping helpers work unchanged on the emitted file.
 *
 * @module config/claude-agent
 */

/** Repo-relative path of the emitted Claude Code subagent file. */
export const CLAUDE_AGENT_RELATIVE_PATH = '.claude/agents/squad.md';

/** Front-matter keys that are meaningless (or actively wrong) on Claude Code. */
const DROPPED_KEYS = new Set(['tools', 'mcp-servers', 'mcp_servers', 'model']);

const DEFAULT_NAME = 'squad';
const DEFAULT_DESCRIPTION =
  "Your AI team. Describe what you're building, get a team of specialists that live in your repo.";

/** Split `content` into its YAML front matter block and the remaining body. */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  // Normalize only for detection — the body is returned with original line endings.
  if (!/^---\r?\n/.test(content)) return { frontmatter: '', body: content };
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1] ?? '', body: content.slice(match[0].length) };
}

/** Read a top-level scalar key out of a (flat) YAML front-matter block. */
function readScalar(frontmatter: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm');
  const raw = re.exec(frontmatter)?.[1]?.trim();
  if (raw === undefined || raw === '') return undefined;
  // Strip a single layer of matching quotes.
  const unquoted = /^"(.*)"$/.exec(raw)?.[1] ?? /^'(.*)'$/.exec(raw)?.[1] ?? raw;
  return unquoted.trim() || undefined;
}

/**
 * Normalize an agent name to Claude Code's convention: lowercase letters,
 * digits and hyphens only.
 */
export function toClaudeAgentName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || DEFAULT_NAME;
}

/** Escape a value for use inside a double-quoted YAML scalar. */
function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

/**
 * Derive the `.claude/agents/squad.md` document from the canonical
 * `squad.agent.md` content.
 *
 * Pure function — no filesystem access — so both the CLI upgrade path and the
 * SDK init path can call it, and tests can assert on its output directly.
 *
 * @param agentMarkdown Contents of `squad.agent.md` (or its `.template` mirror).
 * @returns The same body under Claude-Code-compatible front matter.
 */
export function toClaudeSubagentDoc(agentMarkdown: string): string {
  const { frontmatter, body } = splitFrontmatter(agentMarkdown);

  const name = toClaudeAgentName(readScalar(frontmatter, 'name') ?? DEFAULT_NAME);
  const description = readScalar(frontmatter, 'description') ?? DEFAULT_DESCRIPTION;

  // Carry through any other simple scalar keys we don't explicitly drop, so a
  // future front-matter addition isn't silently lost on the Claude Code copy.
  const passthrough: string[] = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    const key = /^([A-Za-z0-9_-]+):/.exec(line)?.[1];
    if (!key) continue;
    if (key === 'name' || key === 'description') continue;
    if (DROPPED_KEYS.has(key)) continue;
    passthrough.push(line.trimEnd());
  }

  const header = [
    '---',
    `name: ${name}`,
    `description: ${yamlQuote(description)}`,
    ...passthrough,
    // `inherit` keeps the coordinator on the session model rather than the
    // default subagent model — a coordinator downgraded to a small model
    // stops dispatching and starts doing the work itself.
    'model: inherit',
    '---',
  ].join('\n');

  // Body is emitted verbatim — including its leading blank line, so the
  // emitted file is line-for-line comparable with squad.agent.md below the
  // front matter.
  return header + '\n' + (body.startsWith('\n') || body.startsWith('\r\n') ? body : '\n' + body);
}
