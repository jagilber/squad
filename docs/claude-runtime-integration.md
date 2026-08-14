# Running Squad on Claude (instead of / alongside GitHub Copilot)

*Review date: 2026-08-14 · squad v0.12.0 (fork jagilber/squad, synced to bradygaster/squad) ·
copilot-sdk 1.0.9 · Copilot CLI 1.0.79 · claude CLI present · copilot-ui v0.6.66 ·
Claude Agent SDK 0.3.224*

## TL;DR

- Squad's runtime coupling to Copilot is **one file**: `packages/squad-sdk/src/adapter/client.ts`
  (the only `@github/copilot-sdk` import in the repo). Everything else — `.squad/` state, routing,
  charters, skills, the whole `adapter/types.ts` surface — is provider-neutral by enforced design.
- **Two zero/near-zero-code paths already work (measured, 2026-08-14):**
  - **BYOK (Claude models via Anthropic API, Copilot CLI still the harness):**
    `SquadSessionConfig.provider = { type: 'anthropic', baseUrl, apiKey }` is honored by
    copilot-sdk 1.0.9 — the runtime POSTed `/v1/messages` with `x-api-key` and
    `anthropic-version: 2023-06-01` to a test endpoint and round-tripped the reply into squad
    `message`/`idle` events. No Squad code change needed; there is just no config key that sets it yet.
  - **Path C (claude CLI as the whole agent):**
    `squad watch --execute --agent-cmd "claude --permission-mode bypassPermissions"` works
    unmodified — `buildAgentCommand` appends `-p <prompt>` (also claude's print flag), the
    Copilot-only `--yolo --additional-mcp-config` injection is skipped, and a real run returned the
    expected output. Falsified with a bogus binary → informative error.
- For the **full port** (squad agents actually running on the Claude Agent SDK harness — Claude's
  tool loop, hooks, permissions, subscription identity), the staged plan is:
  **Stage 1**: a small shim in copilot-ui (which already hosts a complete Claude Agent SDK provider
  AND a complete squad host in one process, deliberately unwired). **Stage 2**: a proper
  `SquadRuntimeProvider` seam in squad-sdk (upstreamable).

---

## 1. Where the Copilot dependency actually lives

| Path | What it is | Coupling |
|---|---|---|
| A — prompt runtime (primary) | `copilot --agent squad`; coordinator = `.github/agents/squad.agent.md`; no squad process | Host tool names (`create_session` / `task` / `runSubagent`) in prompt + `detectSpawnPlatform()` (`coordinator/spawn-backend.ts:360`) |
| B — SDK | `@bradygaster/squad-sdk` | **`src/adapter/client.ts:10`** — sole `@github/copilot-sdk` import; `new CopilotClient` at :443-463 |
| C — CLI watch/Ralph | `squad watch` shells out | `copilot -p <prompt>`; `--agent-cmd` override exists |
| D — .NET preview | `Squad.Agents.AI` | `GitHub.Copilot.SDK` (separate effort) |

`adapter/types.ts` header: *"All Squad code should import types from this adapter layer, never
directly from the Copilot SDK."* — verified to hold repo-wide. The seam was designed in; it has
exactly one implementation today.

## 2. Measured spike results (2026-08-14)

### Spike A — copilot-sdk BYOK (`provider: { type: 'anthropic' }`)
Script: `.spike/spike-a-byok.mjs`. Local HTTP listener as `baseUrl`; `SquadClient` (stdio) →
`createSession({ model: 'claude-haiku-4-5', provider: { type: 'anthropic', baseUrl, apiKey } })` →
`sendMessage`.

**Result: HONORED.** One `POST /v1/messages` arrived with headers
`x-api-key: <key>`, `anthropic-version: 2023-06-01`; body was native Anthropic wire format
(`system` blocks with `cache_control: ephemeral`, `max_tokens: 32000`). The fake reply surfaced as a
squad `message` event and the session reached `idle`. Falsification armed: no-traffic timeout would
have reported NOT honored.

Notes: copilot-sdk 1.0.9 also exposes experimental *named* `providers[]` + `models[]` (additive,
mixable with CAPI per sub-agent) — relevant for per-agent provider routing later. BYOK disables
session telemetry automatically. **Scope caveat:** BYOK swaps the model API only; the Copilot CLI
remains the agent harness (its tool loop, its permissions). It does not use claude-CLI subscription
identity — it needs an `ANTHROPIC_API_KEY` (per-token billing).

### Spike B — `--agent-cmd claude` (Path C)
Script: `.spike/spike-b-agentcmd.mjs`.

- `buildAgentCommand` / `buildCopilotCommand` with `agentCmd: 'claude --permission-mode bypassPermissions'`
  both yield `claude --permission-mode bypassPermissions -p <prompt>`; the
  `--yolo --additional-mcp-config` injection (`copilot-invocation.ts`) is skipped: **verified**.
- `spawnAgent` (the exact watch/execute code path) → `{ success: true }`.
- Same argv with squad's `escapeArgs()` and stdout captured → claude returned the exact requested
  token: **WORKS**. (First capture attempt without `escapeArgs` mangled the prompt on Windows
  `shell: true` — anyone scripting this must use squad's escaping, as squad itself does.)
- Falsification: bogus binary → `{ success: false, error: 'Command failed: …not recogn…' }`.

**Caveat:** the spawned claude gets squad's *prompt* but not squad's MCP state tools; anything the
watch prompt assumes about `squad_state_*` tools won't exist in the claude session unless claude is
given equivalent MCP config (claude CLI: `--mcp-config`).

## 3. The three routes for a full port

### Route B (Stage 1) — copilot-ui shim (fastest proof)
copilot-ui (`jagilber-dev/copilot-ui`) already contains **both halves**: a complete Claude Agent SDK
provider (`server/providers/claude/`, ~15 files, ClaudeTransport seam, 10 test suites) and the most
complete squad host outside squad itself (`server/squad/`, 40 modules, squad-sdk 0.11.0). They are
deliberately unwired — `CLAUDE_CAPABILITIES.squadAgents = false` (`server/providers/types.ts:136`),
refusal in `server/rpc/messagingLane.ts:56-86`, spec 665 AG-2 "no Squad-on-Claude **until
requested**". The squad layer duck-types its client (`server/squad/state.ts:29` `squadClient:
unknown`, single `setSquadClient()` injection; sessions need only `sessionId/on/sendMessage`), and
`ollamaAgent.ts` (`@minillm`) is shipped precedent for a non-Copilot cast member. So the shim is a
genuinely small adapter: Claude-provider-backed object satisfying `createSession/resumeSession/pool`.

Constraint to respect: the Claude lane is single-identity, subscription-only (`claudeEnv.ts`
strips `ANTHROPIC_API_KEY`), loopback-only, refuses containers — an N-agent squad fan-out bills N
concurrent sessions to one subscription.

### Route A (Stage 2) — `SquadRuntimeProvider` in squad-sdk (clean, upstreamable)
Extract the interface from `SquadClient`'s public surface; move the current body verbatim to
`adapter/providers/copilot.ts`; add `adapter/providers/claude.ts` on `@anthropic-ai/claude-agent-sdk`
`query()`. The concept mapping is unusually good (≈1:1): hooks (PreToolUse/PostToolUse/
UserPromptSubmit/SessionStart/SessionEnd), permission decisions (`allow/deny/ask` + modified args +
additional context → `canUseTool`), `mcpServers`, `customAgents` → `agents`, systemMessage
append/replace → `systemPrompt`, `SquadTool` → in-process SDK MCP server, identical tool-name wire
regex (`normalizeToolNameForCopilot` → rename `…ForWire`, keep alias). Known friction: event-name
translation table (analogue of `EVENT_MAP`), `reasoningEffort` → thinking-budget map, `contextTier`
→ 1M-context option, `listModels()` synthesizing Copilot-shaped `billing/capabilities`, model-ID map
(Copilot `claude-sonnet-4.6` ↔ Anthropic dated IDs), and the `GitHubModelCategory` cost-ceiling axis
which is structurally Copilot-only. New config: `.squad/config.json` `"runtime": "copilot"|"claude"`
(+ `SQUAD_RUNTIME`). Tests currently mock `@github/copilot-sdk` directly and must move to mocking
the provider interface.

### Route C — Claude Code native (`.squad/` semantics without squad's runtime)
Replicate charters/history/routing/decisions with Claude Code agents + hooks + a memory scaffold.
Documented with limits in index-server (`agent-persistence-squad-vs-claude-code`): write-back is
advisory, unbounded history self-defeats (~squad's own three-tier memory lesson). Also: Path A
parity would mean emitting `.claude/agents/squad.md` from `squad.agent.md` via the existing
template-sync machinery and adding Claude Code's `Task` tool to the spawn ladder — deferred.

### Alternatives noted
- **agent-manager** (jagilber-org/mcp-agent-manager): already orchestrates Anthropic + Copilot-ACP
  providers with routing strategies — a Claude multi-agent runtime, but without `.squad/` team
  semantics. Use it if the team semantics aren't the point.
- **gh-aw workflows**: `workflows/*.md` set no `engine:` (default Copilot); `engine: claude` is a
  one-line-per-workflow change — independent of everything above.

## 4. Decision & staged plan

**Decision (2026-08-14): do both, staged.**

1. **Stage 0 (done)** — spikes above; this report.
   **Stage 2 core (done, branch `claude-runtime-provider`)** — `SquadRuntimeProvider` seam
   (`adapter/provider.ts`), `adapter/providers/claude.ts` + `copilot.ts`, `SQUAD_RUNTIME` env
   selection, wire-name alias, MCP package-name fix; 26 seam-faked tests + adjacent suites green.
   **Spike C (measured 2026-08-14): the provider works end-to-end on the real agent SDK** —
   Copilot-flavored `claude-haiku-4.5` mapped and served as `claude-haiku-4-5-20251001`; a
   dotted-name squad tool (`squad.report_status`) round-tripped through the in-process MCP server;
   events `turn_start/message_delta/message/usage/turn_end/idle` all fired; `sendAndWait` returned
   the expected result (28 in / 354 out tokens). Script: `.spike/spike-c-claude-provider.mjs`.
2. **Stage 1** — copilot-ui shim: `server/squad/claudeSquadClient.ts` backed by the existing Claude
   provider machinery; branch client construction on active provider; un-gate
   `CLAUDE_CAPABILITIES.squadAgents`, `messagingLane` refusal, TitleBar forced-disable; tests via
   `mockClaudeTransport`; `npm run verify` green; e2e with a `.squad/` workspace.
3. **Stage 2** — squad-sdk `SquadRuntimeProvider` + `adapter/providers/claude.ts` as above; validated
   event/option mappings from Stage 1 feed the implementation; upstream PR candidate.
4. **Stage 3** — promote validated findings to the shared index.

Incidental fix queued for Stage 2: `config/init.ts:670` and `cli/core/upgrade.ts:76` reference the
nonexistent package `@anthropic/github-mcp-server` (should be `@modelcontextprotocol/server-github`).
