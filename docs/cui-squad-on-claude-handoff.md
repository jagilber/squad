# HANDOFF (copilot-ui): Squad-on-Claude shim — full implementation spec

*Paste this into the copilot-ui repo (e.g. `docs/` or an agent charter). Written 2026-08-14 by the
design session; the design phase is complete and measured. This document is self-contained — no
other context is required, but the squad-side companion is
`C:\github\jagilber\squad\docs\claude-runtime-handoff.md` and the shared knowledge entry is
index-server `squad-on-claude-runtime-integration`.*

## Current state (verified 2026-08-14)

- Branch **`squad-on-claude`** exists in this repo but has **zero commits** (points at main
  `7adf0416`). No shim code has been written. Start there.
- The squad side is DONE and real-SDK-verified: `@bradygaster/squad-sdk` (fork
  `C:\github\jagilber\squad`, branch `claude-runtime-provider`) now has a `ClaudeRuntimeProvider`.
  This CUI shim is the *independent, CUI-local* route — it does NOT depend on that fork; it reuses
  CUI's own Claude lane. (Longer term, bumping squad-sdk and using its provider is the cleaner
  path; the shim is the smallest-diff path that works with pinned squad-sdk 0.11.0.)

## Goal

Squad mode works when the Claude lane is the active provider: squad agents spawn as Claude Agent
SDK sessions through CUI's existing Claude provider machinery. This lifts spec 665's AG-2
("no Squad-on-Claude until requested") — it has been requested.

## Why this is small

`server/squad/state.ts:29-30` holds `squadClient: unknown` with a single `setSquadClient()`
injection point, and every call site duck-types. The complete surface actually used (verified by
grep across `server/squad/` and `server/rpc/`):

- client: `isConnected()`, `connect()`, `disconnect()`, optional `shutdown()`,
  `createSession(opts)`, `resumeSession(id, opts)`,
  `pool: { add(entry), remove(id), findByAgent(name)→{status}|undefined, size }`,
  optional `eventBus` (optional-chained at `coordinator.ts:220` — may stay undefined)
- session: `{ sessionId: string, on(event, handler), sendMessage({prompt}): Promise<void> }`
  (`sessionSpawn.ts:273`, `agentRouter.ts:81,120`)

`createSession` opts passed by `sessionSpawn.ts`: `{ tools, streaming, workingDirectory,
systemMessage:{mode:'append',content}, model, availableTools, excludedTools, mcpServers, provider,
onPermissionRequest, onUserInputRequest }`. `tools` are squad ToolRegistry tools WITH in-process
`handler` functions (`squad_route`, `read_agent`, `write_agent`, `list_squad_agents`).

## Implementation

### 1. New `server/squad/claudeSquadClient.ts`
`createClaudeSquadClient()` returning the duck-typed client above.

- **connect()**: build the Claude provider exactly like `server/client/clientFactory.ts:130-160`:
  dynamic-import `createClaudeProvider`/`loadDefaultClaudeTransport` from
  `server/providers/claude/claudeProvider.ts`; honor `CLAUDE_MOCK=true` →
  `createMockClaudeTransport()`; deps = `{ transport, resolveCwd: () =>
  cwdManager.getResolvedCwd(), sanitizeEnv: sanitizeClaudeEnv, requestPermission:
  createClaudeProviderPermissionDelegate(state) }`.
- **pool**: minimal in-memory Map-backed pool. Note `size` is read as a PROPERTY
  (`pool?.size ?? 0` at `toolsAndMarketplace.ts:182,312`) — implement as getter, not method.
- **createSession(opts)** — translate squad opts → provider `SessionConfig`
  (`ClaudeProvider.createSession` deliberately accepts copilot-sdk-shaped SessionConfig):
  - pass through `workingDirectory`, `systemMessage`, `mcpServers`, `availableTools`,
    `excludedTools`;
  - **model**: `config.model` (copilot-flavored, e.g. `claude-sonnet-4.6`) is DISCARDED with a
    WARN by `resolveClaudeModel` — set the **`claudeModel` slot** instead. Mapping (measured on
    the real CLI): dots→dashes (`claude-sonnet-4.6`→`claude-sonnet-4-6`); family alias fallback
    `opus`/`sonnet`/`haiku`; non-Claude ids → leave unset (CLI default) with an INFO log.
  - **tools** (handler tools): wrap into an in-process SDK MCP server named `squad` — follow
    `server/rpc/claudeCuiMcpServer.ts` exactly (`tool()` + `createSdkMcpServer` from
    `@anthropic-ai/claude-agent-sdk`, zod raw shapes). Convert each squad tool's JSON-schema
    `parameters` to zod (string/number/boolean/enum/array/object; required-array → non-optional).
    Attach via the config's `mcpServers` (or the `claudeCuiServer` slot pattern in
    `claudeOptionMapping.ts` if you add a parallel `claudeSquadServer` slot — small in-grain edit).
  - `opts.onPermissionRequest`: v1 accepts that claude-lane permissions flow through the
    provider-level delegate instead (log once). `opts.onUserInputRequest`: not wired v1 (log once).
- **Session wrapper + event pump (THE trap)**: `ClaudeSession.on()` is deliberately **inert — it
  never fires** (`claudeSession.ts:29-34`). Real channel: `session.onRawMessage(listener)`
  (`claudeSession.ts:148`). Pump: per session create `createClaudeStreamState()`, then
  `onRawMessage(msg => normalizeClaudeSessionEvent(msg, { sessionId, stream }))`
  (`server/protocol/claudeEventNormalizer.ts`) and dispatch each envelope to handlers registered
  via the wrapper's own `on(type, h)` — exact match on `envelope.type`. The normalizer already
  emits exactly the dotted names squad subscribes to (`server/squad/sessionEvents.ts:232-277`:
  `assistant.message_delta`, `assistant.message`, `assistant.turn_end`, `session.idle`,
  `session.error`, `tool.execution_start/complete`, `assistant.usage`, …). Copy the pump-hardening
  pattern from `server/session/sessionManager.ts:400-430` (normalizer throw → WARN, never kill the
  pump). Wrapper `sendMessage({prompt})` → `claudeSession.send(prompt)`.
- **resumeSession(id, opts)** → `provider.resumeSession` + same wrapping.
- **disconnect()/shutdown()**: dispose live sessions, clear pool.

### 2. Branch `ensureSquadClient()` — `server/squad/sdkClient.ts:326`
Resolve the effective provider (same helper `messagingLane.ts` uses — `effectiveLaneId()` — or
`server/providers/selection.ts`). When `'claude'`: construct the shim instead of
`SquadClientWithPool`, `setSquadClient(shim)`, still run the ToolRegistry / skill-handler /
HookPipeline setup (registry tools flow into createSession opts unchanged), `await shim.connect()`.
Keep the copilot path byte-identical.

### 3. Un-gate (three places)
- `server/providers/types.ts:136` — `CLAUDE_CAPABILITIES.squadAgents: false → true` (leave
  `squadSessionReset: false`). Update the D6 doc comment.
- `server/rpc/messagingLane.ts:56-86` — `squadAutoRoutingAllowed()`: allow when effective lane is
  `'claude'` (keep refusing acp/unknown). Find the caller of `SQUAD_REQUIRES_COPILOT_MESSAGE` and
  permit the claude lane for explicit `@squad`/`@coordinator`/`@squad-agent:*` sends.
- `src/components/TitleBar.tsx` — stop forcing `squadMode: 'disabled'` when claude is selected.

### 4. Tests
Vitest; conventions in `test/claudeProviderOptions.test.ts` + `test/helpers/claudeLaneHarness.ts`.
Minimum, all on the mock transport (`CLAUDE_MOCK` / `createMockClaudeTransport`):
- shim createSession returns wrapper with `sessionId`; `on('assistant.message', h)` fires when the
  mock emits; `sendMessage({prompt})` resolves; squad tools appear as an in-process MCP server in
  the captured query options; model mapping (copilot id → `claudeModel`, unmappable → unset).
- messagingLane: auto-routing allowed on claude; explicit `@squad` not refused on claude.
- Update (don't delete) any test asserting the old refusal.

### 5. Repo gates
`npx tsc --noEmit` (or repo typecheck script) + focused vitest on touched files; `npm run verify`
if time allows. constitution.json size ratchets: keep new files < ~400 lines, split if needed.

## E2E verification

Launch CUI with `AGENT_PROVIDER=claude` in a workspace containing `.squad/` (e.g.
`C:\github\jagilber\squad` — 22 agents), send an `@squad`-routed prompt, confirm
`squad.agent.spawned` events and a working Claude session. Regression: Copilot lane squad mode
still works. Negative check: claude lane with no `claude` CLI login must surface a clear error,
not silently fall through to Copilot.

## Constraints to respect

- Claude lane is single-identity, subscription-only (`claudeEnv.ts` strips ANTHROPIC_API_KEY),
  loopback-only, refuses containers. N concurrent squad agents = N sessions on ONE subscription —
  keep `squadMaxConcurrent` modest.
- `@minillm` precedent (`server/squad/ollamaAgent.ts`, exempted at `messagingLane.ts:84`) shows a
  non-Copilot squad participant is an accepted pattern in this codebase.
