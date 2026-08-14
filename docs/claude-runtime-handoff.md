# HANDOFF: Squad-on-Claude — status, remaining work, and execution specs

*Written 2026-08-14. Design is complete and measured; remaining work is execution against the
specs below. A cheaper model can pick up any unchecked item independently — each item lists its
files, pattern to follow, and verification command.*

## Where things live

| Artifact | Location |
|---|---|
| Squad work branch | `C:\github\jagilber\squad` branch **`claude-runtime-provider`** (off main @ v0.12.0) |
| CUI work branch | `C:\github\jagilber-dev\copilot-ui` branch **`squad-on-claude`** (in progress by agent) |
| Architecture review + measured spike results | `docs/claude-runtime-integration.md` (this repo) |
| Spike scripts (rerunnable) | `.spike/spike-a-byok.mjs`, `.spike/spike-b-agentcmd.mjs`, `.spike/spike-c-claude-provider.mjs` |
| Promoted knowledge | index-server entry **`squad-on-claude-runtime-integration`** (query it first; it has every gotcha) |

## Status matrix

| Item | Status | Proof |
|---|---|---|
| Spike A: copilot-sdk BYOK `provider:{type:'anthropic'}` | ✅ MEASURED WORKING | `.spike/spike-a-byok.mjs` — observed `POST /v1/messages` + `x-api-key` at custom baseUrl |
| Spike B: `squad watch --agent-cmd "claude …"` | ✅ MEASURED WORKING | `.spike/spike-b-agentcmd.mjs` — exact token round-trip; bogus-binary falsification green |
| `SquadRuntimeProvider` seam (`adapter/provider.ts`) | ✅ COMMITTED | commit `2ecc3c59`; interface + `createRuntimeProvider` + `SQUAD_RUNTIME` env |
| `ClaudeRuntimeProvider` (`adapter/providers/claude.ts`) | ✅ COMMITTED + REAL-SDK VERIFIED | Spike C: tool round-trip, 6 event types, `sendAndWait` result on real claude CLI |
| Tests (26 seam-faked) + adjacent suites | ✅ GREEN | `npx vitest run test/claude-runtime-provider.test.ts test/adapter-client.test.ts test/tool-name-normalization.test.ts test/model-selector-policy.test.ts test/cli/upgrade.test.ts` |
| MCP package-name bug (`@anthropic/github-mcp-server` → `@modelcontextprotocol/server-github`) | ✅ FIXED | init.ts / upgrade.ts / upgrade.test.ts |
| Index-server write-back | ✅ DONE | entry `squad-on-claude-runtime-integration` v1.0.0 |
| CUI shim (Stage 1) | ⬜ NOT STARTED (spec: `docs/cui-squad-on-claude-handoff.md`) | branch `squad-on-claude` exists in copilot-ui with ZERO commits (implementation agent was stopped before writing code) |
| Config plumbing (`.squad/config.json` `runtime` key) | ⬜ TODO (spec below) | |
| Wire factory into `SquadClientWithPool` / squad-cli | ⬜ TODO (spec below) | |
| Path A: `.claude/agents/squad.md` emission | ✅ DONE (T4) | `toClaudeSubagentDoc()` (`squad-sdk/src/config/claude-agent.ts`) + TEMPLATE_MANIFEST entry + `sync-templates.mjs` derived target; `detectSpawnPlatform` `Task`→`'claude'`; tests `test/claude-agent-emission.test.ts`, `test/spawn-backend.test.ts`, `test/cli/upgrade.test.ts` |
| gh-aw `engine: claude` variants | ⬜ OPTIONAL one-liner | |

## Remaining work — execution specs

### T1. Implement the CUI shim (Stage 1) — MOVED
Full self-contained spec: **`docs/cui-squad-on-claude-handoff.md`** (paste it into the copilot-ui
repo). Repo `C:\github\jagilber-dev\copilot-ui`, branch `squad-on-claude` (exists, zero commits —
nothing landed). Summary of the contract, for reference only:
- New `server/squad/claudeSquadClient.ts`: duck-typed client `{ isConnected, connect, disconnect,
  shutdown?, createSession(opts), resumeSession(id,opts), pool:{add,remove,findByAgent,size} }`,
  session wrapper `{ sessionId, on(event,h), sendMessage({prompt}) }` backed by the EXISTING
  Claude provider (`server/providers/claude/claudeProvider.ts` `createClaudeProvider(deps)` —
  copy construction from `server/client/clientFactory.ts:130-160`, honor `CLAUDE_MOCK`).
- **Trap:** `ClaudeSession.on()` never fires by design. Pump `session.onRawMessage(msg)` through
  `normalizeClaudeSessionEvent` (`server/protocol/claudeEventNormalizer.ts`, per-session
  `createClaudeStreamState()`) and dispatch envelopes to `on()` registrations — the normalizer
  already emits exactly the dotted names squad subscribes to (`server/squad/sessionEvents.ts:232`).
- Squad handler tools → in-process SDK MCP server; follow `server/rpc/claudeCuiMcpServer.ts`.
- Branch `ensureSquadClient()` (`server/squad/sdkClient.ts:326`) on the effective provider id.
- Un-gate: `server/providers/types.ts` `CLAUDE_CAPABILITIES.squadAgents→true`;
  `server/rpc/messagingLane.ts` allow claude lane in `squadAutoRoutingAllowed` and the
  `SQUAD_REQUIRES_COPILOT_MESSAGE` refusal; `src/components/TitleBar.tsx` stop forcing
  `squadMode:'disabled'`.
- Verify: repo typecheck + focused vitest (mock transport tests) + `npm run verify` if time allows.
  E2E: launch CUI with `AGENT_PROVIDER=claude` in a workspace containing `.squad/`, send an
  `@squad` prompt, confirm `squad.agent.spawned` and a working Claude session; regression-check
  the Copilot lane still runs squad.

### T2. Config plumbing: `.squad/config.json` `runtime` key
Repo squad, branch `claude-runtime-provider`.
- Add `runtime?: 'copilot'|'claude'` (and optional `runtimeConfig?: object`) to the config shape
  in `packages/squad-sdk/src/config/models.ts` (follow the exact pattern of
  `readModelPreference`/`writeModelPreference` — read/write `.squad/config.json`).
- `resolveRuntimeId` (adapter/provider.ts) currently resolves explicit → `SQUAD_RUNTIME` env →
  `'copilot'`. Extend the CALLERS (not the function) to pass the config value as the explicit arg:
  precedence env > config > default is acceptable; document whichever you implement.
- Add `squad config runtime <copilot|claude>` or fold into existing config CLI if one exists
  (check `packages/squad-cli/src/cli/commands/` for a config/models command to extend).
- Tests: read/write round-trip; unknown value in config → the existing throw (assert message).

### T3. Wire the factory into the pooled client
`packages/squad-sdk/src/client/index.ts` — `SquadClientWithPool` constructs `BaseSquadClient`
directly (line ~45+). Add an async factory `createSquadClientWithPool(config)` that awaits
`createRuntimeProvider({...config, runtime})` and injects it; keep the sync constructor
byte-compatible (default Copilot) for existing consumers (CUI pins 0.11/0.12). The pool wraps
sessions, not the client transport, so no pool changes expected. Tests: pooled client over the
fake Claude facade (reuse `makeFakeSdk` from `test/claude-runtime-provider.test.ts`).

### T4. Path A — Claude Code prompt runtime — ✅ DONE
Implemented as:
- `toClaudeSubagentDoc()` in `packages/squad-sdk/src/config/claude-agent.ts` — pure front-matter
  translator (`name: Squad`→`squad`, `tools: ["*"]` **dropped** because Claude Code has no
  wildcard and omitting `tools` already means inherit-all, `mcp-servers` dropped, `model: inherit`
  added). Body copied verbatim so the existing version stampers work unchanged.
- Declared in `TEMPLATE_MANIFEST` (`squad.agent.md.template` → `../.claude/agents/squad.md`) and
  written by the dedicated agent-template paths: `writeClaudeAgentTemplate()` in
  `cli/core/upgrade.ts` (which resolves its destination *from the manifest*, so the entry is
  load-bearing) and `initSquad()` in `squad-sdk/src/config/init.ts`.
- `scripts/sync-templates.mjs` emits the repo's own `.claude/agents/squad.md` as a derived target
  (it carries a duplicate of the translator; `test/claude-agent-emission.test.ts` pins the two
  byte-for-byte).
- `detectSpawnPlatform` now maps the Claude Code spawn tool → `'claude'` via
  `CLAUDE_SPAWN_TOOL_NAMES = ['Agent', 'Task']` (case-sensitive: lowercase `task` is still Copilot
  CLI, and `TaskStop` must not match); `SpawnPlatform` gained `'claude'`.
- Coordinator prompt parameterized for a 4th platform — 22 lines / 37 occurrences referenced a
  spawn tool (the "~15 places" estimate was low); 9 rewritten, 4 new (Claude Code dispatch bullet,
  probe step, "`task` ≠ `Agent`" warning, Claude Code micro-playbook). `spawn-reference.md` and
  `client-compatibility-reference.md` updated to match.

**Measured facts about the Claude Code tool surface** (probed against the real CLI, claude 2.1.224,
via a `.claude/agents/toolprobe.md` subagent that reports its own tool list):

| Question | Measured answer |
|---|---|
| Name of the spawn tool | **`Agent`** — `claude -p "…SPAWN_TOOL: <exact name>…"` → `SPAWN_TOOL: Agent` |
| Does a `Task` tool exist? | **No.** `HAS_TASK: no`, at top level *and* inside a subagent |
| Do subagents get the spawn tool? | **Yes** — the probe subagent's own tool list contains `Agent` |

Consequences, both of which corrected an earlier wrong assumption in this document:
1. Squad's first cut keyed detection on `Task` only. That was **dead code on every real session** —
   the coordinator fell through to the inline fallback. Any future edit to the alias list must
   re-probe the CLI and record the version; do not add names defensively.
2. An earlier caveat here claimed nested dispatch would not work and that Path A only paid off as a
   top-level session, suggesting a redesign toward a `CLAUDE.md` include or a `tools:` line. **That
   is refuted** — subagents receive `Agent`, so a squad coordinator invoked as a subagent can still
   spawn teammates. The `.claude/agents/squad.md` subagent file is the right shape; do not redesign.

Still not closed: an end-to-end run of `claude` in a squad-initialized repo watching the coordinator
actually dispatch teammates through `Agent`. The tool-surface facts above are measured; the full
coordinator round-trip is not.

### T5. Optional polish
- gh-aw: add `engine: claude` variants of `workflows/squad.md` / `squad-implement-worker.md`.
- `squad doctor`: add a claude-runtime section (claude CLI on PATH, `resolveRuntimeId()` result,
  `getAuthStatus()` from the provider).
- Upstream PR to bradygaster/squad: commits `2ecc3c59` + the package-name fix are self-contained.

## Gotchas a cheaper model must not rediscover the hard way

1. **Rebuild before CLI-path tests**: `test/cli/*.test.ts` run against `dist/` — `npm run build
   --workspace @bradygaster/squad-sdk && npm run build --workspace @bradygaster/squad-cli` after
   source edits, or failures look like phantom regressions.
2. **Windows arg escaping**: anything spawning `claude -p <prompt>` with `shell:true` must use
   squad's `escapeArgs()` — otherwise the prompt silently mangles (measured; claude replies as if
   unprompted).
3. **Optional dep import**: `@anthropic-ai/claude-agent-sdk` is imported via a *computed
   specifier* in `loadDefaultClaudeSdk()` so tsc doesn't demand its types. Don't "clean up" into a
   literal import.
4. **`ClaudeSession.on()` in CUI is inert** — see T1 trap.
5. **Model ids**: squad speaks Copilot-flavored ids (`claude-sonnet-4.6`); the claude CLI wants
   dashes (`claude-sonnet-4-6`) or family aliases. `toClaudeModelId()` in
   `adapter/providers/claude.ts` is the single place this lives.
6. **`turn_start` is derived** (emitted at send time) — the agent SDK has no turn-start message.
7. **Billing**: BYOK path = ANTHROPIC_API_KEY per-token. Agent-SDK path = claude CLI subscription
   identity; N concurrent squad agents = N sessions on ONE subscription. Don't fan out wide
   without checking rate limits.
8. Test infra fake (`makeFakeSdk`) must end its stream on `abortController.abort()` or `close()`
   tests hang — already handled; copy it rather than re-inventing.

## Verification recipes (copy-paste)

```bash
# squad repo, branch claude-runtime-provider
npx tsc --noEmit -p packages/squad-sdk/tsconfig.json && npx tsc --noEmit -p packages/squad-cli/tsconfig.json
npx vitest run test/claude-runtime-provider.test.ts test/adapter-client.test.ts test/tool-name-normalization.test.ts test/cli/upgrade.test.ts
node .spike/spike-c-claude-provider.mjs   # real-SDK e2e (needs claude CLI login; ~$0.01)
node .spike/spike-a-byok.mjs              # copilot-sdk BYOK (needs copilot login; no API key needed)
```
Negative check (verification doctrine): break input on purpose — `SQUAD_RUNTIME=gemini` must throw
`Unknown squad runtime`, and spike C with a bogus model id must fall back to CLI default, not
silently pass.
