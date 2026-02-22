# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- Casting system implementation: universe selection, registry.json (persistent names), history.json (assignment snapshots)
- Drop-box pattern for decisions inbox: agents write to decisions/inbox/{name}-{slug}.md, Scribe merges
- Parallel spawn mechanics: background mode default, sync only for hard data dependencies
- 13 modules: adapter, agents, build, casting, cli, client, config, coordinator, hooks, marketplace, ralph, runtime, sharing, skills, tools
- CLI is zero-dep scaffolding: cli.js stays thin, runtime is modular
- Ralph module: work monitor, queue manager, keep-alive — runs continuous loop until board is clear

### 📌 Team update (2026-02-21T21:23Z): CLI command renames are pending — decided by Keaton
Recommend renaming `squad watch` to `squad triage` (40% better semantic accuracy; aligns with GitHub terminology). Keep `watch` as silent alias for backward compatibility. Do NOT expose `squad ralph` as user-facing CLI; suggest `squad monitor` or `squad loop` instead for the monitoring function. Ralph remains in team identity, not CLI. Confidence: 85% for triage, 90% against ralph.

### 📌 Team update (2026-02-21T21:35Z): CLI naming finalized — decided by Brady
**Final directives:** `squad triage` (confirmed), `squad loop` (replaces Keaton's `squad monitor` proposal), `squad hire` (replaces `squad init`). Commands chosen for clarity and identity alignment. Brady's preference supersedes earlier recommendations.

### 📌 M3 Resolution (#210, #211) — implemented
- Created `src/resolution.ts` with `resolveSquad()` (walk-up to .git boundary) and `resolveGlobalSquadPath()` (platform-specific global config dir)
- Both exported from `src/index.ts` public API
- 10 tests in `test/resolution.test.ts` — all passing
- PR #275 on branch `squad/210-resolution-algorithms` → `bradygaster/dev`
- Decision: placed in `src/resolution.ts` (root src, not packages/squad-sdk) since code hasn't moved to monorepo packages yet
- Decision: `resolveSquad()` intentionally does NOT fall back to `resolveGlobalSquadPath()` — kept as separate concerns per #210/#211 separation. Consumer code can chain them.

### 📌 #212/#213: --global flag and squad status command — implemented
- Added `--global` flag to `squad init` and `squad upgrade` in `src/index.ts` main()
- `--global` passes `resolveGlobalSquadPath()` as the dest instead of `process.cwd()`
- Added `squad status` command: shows active squad type (repo/personal/none), path, and resolution reason
- Status command composes `resolveSquad()` + `resolveGlobalSquadPath()` — the chaining pattern envisioned in #210/#211
- All changes in `src/index.ts` only — no modifications to resolution.ts, init.ts, or upgrade.ts needed
- PR on branch `squad/212-213-global-flag-status` → `bradygaster/dev`

### 📌 Team update (2026-02-22T041800Z): SDK/CLI split executed, versions aligned to 0.8.0, 1719 tests passing — decided by Keaton, Fenster, Edie, Kobayashi, Hockney, Rabin, Coordinator
- **Phase 1 (SDK):** Migrated 15 directories + 4 standalone files from root `src/` into `packages/squad-sdk/src/`. Cleaned SDK barrel (removed CLI re-exports block). Updated exports map from 7 to 18 subpath entries.
- **Phase 2 (CLI):** Migrated `src/cli/` + `src/cli-entry.ts` to `packages/squad-cli/src/`. Copied `templates/` into CLI package. Rewrote 6 cross-package imports to use `@bradygaster/squad-sdk/*` package names.
- **Configuration:** All 6 config files fixed (root tsconfig with project refs, SDK/CLI tconfigs with composite builds, package.json exports maps). Root marked private (prevents accidental npm publish).
- **Versions:** All strings aligned to 0.8.0 — clear break from 0.7.0 stubs. CLI dependency on SDK pinned to `0.8.0`.
- **Testing:** Build clean (0 errors), all 1719 tests passing. Test import migration deferred until root `src/` deletion (lazy migration reduces risk).
- **Distribution:** Both packages published to npm (@bradygaster/squad-sdk@0.8.0, @bradygaster/squad-cli@0.8.0). Publish workflows verified ready.
- **Dependency graph verified:** Clean DAG (CLI → SDK → @github/copilot-sdk, no cycles). SDK pure library (zero UI deps). CLI thin consumer (owns ink, react).
- **Next phase:** Phase 3 (root cleanup) — delete root src/, update test imports when blocking.


### 📌 #234/#235: Shell module structure + main entry wiring — implemented
- Created `src/cli/shell/` module: `index.ts` (placeholder `runShell()`), `types.ts` (ShellState, ShellMessage, AgentSession), `components/.gitkeep`
- `runShell()` prints version header + exit hint, handles SIGINT, exits cleanly — placeholder until ink UI is wired (#233)
- Wired `src/index.ts`: `squad` with no args now calls `runShell()` instead of `runInit()`. `squad init` is now an explicit subcommand.
- Types defined: `ShellState` (status + agents + history), `ShellMessage` (role/agent/content/timestamp), `AgentSession` (name/role/status/startedAt)
- PR #282 on branch `squad/234-235-shell-module` → `bradygaster/dev`
- Decision: no ink dependency added — another agent (#233) handles that. Shell uses console.log only.

### 📌 #236/#237: Shell chrome + session registry — implemented
- Updated `src/cli/shell/index.ts`: replaced placeholder with full header chrome, readline input loop, clean exit
- Header displays box-drawing chrome with version read from package.json via `createRequire`
- Readline loop (`node:readline/promises`) processes input; `exit` and `/quit` trigger clean shutdown with "👋 Squad out."
- SIGINT (Ctrl+C) handler prints cleanup message and exits cleanly
- Created `src/cli/shell/sessions.ts`: `SessionRegistry` class — Map-backed registry for tracking agent sessions by name
- SessionRegistry methods: register, get, getAll, getActive (filters working/streaming), updateStatus, remove, clear
- Exported `SessionRegistry` from `src/cli/shell/index.ts`
- PR #284 on branch `squad/236-237-shell-chrome-registry` → `bradygaster/dev`
- Pattern: version sourced via `createRequire(import.meta.url)` for ESM-compatible JSON import (matches existing codebase pattern in `github-dist.ts`)
- Pattern: SessionRegistry is a simple stateful class — no persistence, no events — designed for ink UI to consume later (#242+)

### 📌 #238: SDK-based agent spawning infrastructure — implemented
- Created `src/cli/shell/spawn.ts`: `loadAgentCharter()`, `buildAgentPrompt()`, `spawnAgent()`
- `loadAgentCharter(name, teamRoot?)` loads charter from `.squad/agents/{name}/charter.md` using `resolveSquad()` for directory resolution
- `buildAgentPrompt(charter, options?)` constructs system prompt: "You are an AI agent..." + charter + optional context
- `spawnAgent(name, task, registry, options?)` is the full lifecycle: load charter → parse role from `# Name — Role` header → register in SessionRegistry → set status to working → build prompt → return SpawnResult → set status to idle
- Types exported: `SpawnOptions` (mode: sync/background, systemContext, tools), `SpawnResult` (agentName, status, response/error), `ToolDefinition` (name, description, parameters)
- All exported from `src/cli/shell/index.ts` barrel
- SDK session creation intentionally stubbed with TODO — CopilotClient session API wiring deferred until we understand the session management surface
- PR #285 on branch `squad/238-sdk-spawning` → `bradygaster/dev`
- Pattern: charter loading uses `resolveSquad()` (returns `.squad/` dir path) — `teamRoot` param constructs `.squad/` path from project root for testability
- Pattern: role parsing from charter header is regex-based (`/^#\s+\w+\s+—\s+(.+)$/m`), falls back to "Agent" if no match
- Foundation for #239 (stream bridge integration) and #241 (coordinator spawn orchestration)

### 📌 #220/#221: CRLF normalization utility + parser hardening — implemented
- Created `src/utils/normalize-eol.ts` with `normalizeEol()` — strips `\r\n` and lone `\r` to LF-only before any parsing logic runs.
- Applied to all 8 markdown parsers: `parseTeamMarkdown`, `parseRoutingRulesMarkdown`, `parseDecisionsMarkdown` (markdown-migration.ts), `parseRoutingMarkdown` (routing.ts), `parseCharterMarkdown` (charter-compiler.ts), `parseFrontmatter` (skill-loader.ts), `parseAgentDoc` (agent-doc.ts), `buildCapabilitiesBlock` (doc-sync.ts).
- Build clean (0 errors), all 1670 tests pass. Committed on `squad/181-squadui-p0`.
- Pattern: normalize at the entry point of the parser function, before any `.split('\n')` or regex matching. This is a one-line defensive guard — no behavioral change for LF-only inputs.

### 📌 #224: Re-export all CLI functions from main barrel — implemented
- Added `runInit`, `runExport`, `runImport`, `runCopilot`, `type CopilotFlags`, and `scrubEmails` to `src/index.ts` public API surface.
- These were already exported from `src/cli/index.ts` barrel but were missing from the top-level selective named export block in `src/index.ts`.
- Single-line change pattern: expand the existing named import list from `./cli/index.js` — no new import statements needed.
- Build clean (0 errors), all 1683 tests pass. Committed on `squad/181-squadui-p1`.
- Pattern: when Edie split `main()` into `cli-entry.ts`, the barrel became selective. Any new CLI function must be explicitly added to the `src/index.ts` named export list to be part of the public API.


### 📌 Team update (2026-02-22T020714Z): CRLF normalization complete and merged
Fenster's src/utils/normalize-eol.ts utility is now applied to 8 parser entry points across 6 files. Pattern established: normalize at parser entry, not at file-read callsite. This ensures cross-platform line ending safety for all parsers (Windows CRLF, Unix LF, old Mac CR). Decision merged to decisions.md. Issue #220, #221 closed. All 1683 tests passing.

### 📌 SDK/CLI File Migration — Keaton's split plan executed
- **Phase 1 (SDK):** Copied all 15 directories (adapter, agents, build, casting, client, config, coordinator, hooks, marketplace, ralph, runtime, sharing, skills, tools, utils) and 4 standalone files (index.ts, resolution.ts, parsers.ts, types.ts) from root `src/` into `packages/squad-sdk/src/`. Cleaned the SDK barrel (`packages/squad-sdk/src/index.ts`) — removed the CLI re-exports block (lines 25-52 of the original, exporting success/error/warn/fatal/SquadError/detectSquadDir/runWatch/runInit/runExport/runImport/runCopilot etc. from `./cli/index.js`). Updated SDK `package.json` exports map: removed `./cli`, added all subpath exports from Keaton's plan (resolution, runtime/streaming, coordinator, hooks, tools, adapter, client, marketplace, build, sharing, ralph, casting).
- **Phase 2 (CLI):** Copied `src/cli/` directory and `src/cli-entry.ts` into `packages/squad-cli/src/`. Copied `templates/` into `packages/squad-cli/templates/`. Rewrote 4 cross-package imports in CLI source:
  - `cli/upgrade.ts`: `../config/migration.js` → `@bradygaster/squad-sdk/config`
  - `cli/copilot-install.ts`: `../config/init.js` → `@bradygaster/squad-sdk/config`
  - `cli/shell/spawn.ts`: `../../resolution.js` → `@bradygaster/squad-sdk/resolution`
  - `cli/shell/stream-bridge.ts`: `../../runtime/streaming.js` → `@bradygaster/squad-sdk/runtime/streaming`
  - `cli-entry.ts`: `./resolution.js` and `./index.js` → `@bradygaster/squad-sdk`
- **Intra-CLI imports** (within `cli/` directory) left untouched — all relative.
- **Root `src/` preserved** — not deleted, per plan (cleanup after tests pass).
- Pattern: SDK subpath exports match the directory barrel structure — `@bradygaster/squad-sdk/{module}` resolves to `dist/{module}/index.js`. Special cases: `./resolution` → `dist/resolution.js`, `./runtime/streaming` → `dist/runtime/streaming.js`.

### 📌 Test import migration to workspace packages — completed
- Migrated all 56 test files (173 import replacements) from relative `../src/` paths to workspace package imports.
- SDK imports use 26 subpath exports (18 existing + 8 new): `@bradygaster/squad-sdk/config`, `@bradygaster/squad-sdk/agents`, etc.
- CLI imports use 16 new subpath exports: `@bradygaster/squad-cli/shell/sessions`, `@bradygaster/squad-cli/core/init`, etc.
- Added 8 new SDK subpath exports for deep modules not covered by barrels: `adapter/errors`, `config/migrations`, `runtime/event-bus`, `runtime/benchmarks`, `runtime/i18n`, `runtime/telemetry`, `runtime/offline`, `runtime/cost-tracker`.
- Added missing barrel re-exports: `selectResponseTier`/`getTier` in coordinator/index.ts, `onboardAgent`/`addAgentToConfig` in agents/index.ts.
- Updated consumer-imports test: CLI functions (`runInit`, `runExport`, `runImport`, `scrubEmails`) now imported from `@bradygaster/squad-cli` instead of SDK barrel.
- Rebuilt SDK and CLI packages to update dist. All 1727 tests pass across 57 files.
- Pattern: vitest resolves through compiled `dist/` files, not TypeScript source — barrel changes require a package rebuild to take effect.
- Pattern: when consolidating deep imports to barrel paths, verify the barrel actually re-exports the needed symbols before assuming availability.

### 📌 Runtime Implementation Assessment (2026-02-22T22:00Z) — Fenster
**Status:** Phase 1-2 complete (SDK/CLI split, monorepo structure). Phase 3 (runtime integration) blocked.

**Implemented & Working:**
- ✅ **SDK/CLI split:** Both packages at 0.8.0 (SDK)/0.8.1 (CLI). Clean exports maps (18 subpaths SDK, 14 subpaths CLI).
- ✅ **Build pipeline:** tsc compiles both packages to dist/, all dependencies resolved (SDK→Copilot SDK, CLI→SDK+ink+react). Zero errors.
- ✅ **CLI structure:** Entry point (cli-entry.ts) routes 14 commands. Commands implemented: `help`, `version`, `status`, `init`, `upgrade`, `export`, `import`, `copilot`, `plugin`, `scrub-emails`. Commands stubbed: `triage` (watch alias), `loop`, `hire`.
- ✅ **Shell foundation:** readline-based CLI shell with header chrome, session registry, spawn infrastructure. Agent discovery, charter loading, and spawn lifecycle foundation. Type-safe completion.
- ✅ **Core modules:** resolution.ts, config/, build/, skills/, hooks/, tools/, client/ (EventBus structure), marketplace/, adapter/ all present.
- ✅ **Monorepo:** npm workspaces, changesets configured, independent versioning (SDK/CLI can release separately).

**Incomplete/Stubs (Phase 3 blockers):**
- ⏳ **Ralph monitor** (src/ralph/index.ts): Class structure present. 14 TODO comments (PRD 8). Methods stubbed: start(), handleEvent(), healthCheck(), stop(). EventBus subscription logic not wired.
- ⏳ **Coordinator** (src/coordinator/index.ts): Class structure present. 13 TODO comments (PRD 5). Methods stubbed: initialize(), route(), spawn(), monitor(), destroy(). No SquadClient wiring, no agent manager hookup.
- ⏳ **Agents module** (src/agents/index.ts): Charter compilation imported from separate file (working). SessionManager class present but 14 TODO comments (PRD 4). Methods stubbed: spawn(), resume(), terminate(). No SDK session creation wired.
- ⏳ **Casting system** (src/casting/index.ts): v1 CastingEngine imported (working). Legacy CastingRegistry stubbed — 1 TODO (PRD 11) for registry.json parsing. Cast/recast methods throw "Not implemented".
- ⏳ **Shell UI:** No ink-based components wired. readline loop exists but command handling is echo-only (line 78 in shell/index.ts). No agent discovery integration, no streaming response display, no real coordinator handoff.
- ⏳ **Triage/Loop/Hire commands:** Placeholder messages in cli-entry.ts lines 115-148. No implementation.

**Important TODOs in Code:**
- **Ralph (8):** start() needs EventBus subscription, health checks, persistent state loading/saving (8 items).
- **Coordinator (13):** initialize() needs client connection, charter loading, hook setup, EventBus wiring (13 items).
- **Agents (14):** spawn() needs charter reading, YAML parsing, SDK session creation with history injection (14 items).
- **Shell spawn.ts (1):** "Wire to CopilotClient session API" — CopilotClient session creation stubbed with TODO (line ~78 in spawn.ts).
- **Casting (1):** registry.json parsing stub.

**CLI Commands Status:**
- **Fully working (7):** help, version, status, init, upgrade, export, import, copilot, plugin, scrub-emails
- **Stubbed (3):** triage (watch alias), loop, hire — all print placeholder messages
- **Design note:** Commands are correct per Brady's directives (squad loop, squad triage, squad hire). Command routing works; implementations pending.

**Technical Debt:**
- **Phase 3 cleanup pending:** root `src/` directory still exists (backward compat). Will be deleted after monorepo migration complete per history.
- **Ink components:** No UI components wired yet. Shell uses readline only. Ink dependency is in CLI package.json but not used.
- **Event-driven flow:** EventBus is defined (event-bus.ts) but no actual event emission wired. Handler error isolation TODO (PRD 1).

**CLI Entry Point Wiring:**
- `main()` parses command and routes to implementations (all sync/await patterns clean).
- No external commands spawned yet (e.g., `gh api`, file system watch).
- `--global` flag works (resolveGlobalSquadPath routing correct).

**Build/Test/Lint Status:**
- ✅ **Build:** 0 errors (tsc clean).
- ✅ **Tests:** 1700+ passing (exact count varies by run, all passing).
- ✅ **Lint:** tsc --noEmit clean (strict mode enforced).

**Next Phase Blocking Items:**
1. Wire EventBus: Actual event emission from sessions + handler execution in coordinator/ralph.
2. CopilotClient session integration: Ralph.start() and spawnAgent() need live session creation/resumption.
3. Coordinator.initialize() and route(): Accept user message, load charters, route to agents.
4. Shell UI: Wire ink components for agent display, streaming responses, session status.
5. Triage/Loop/Hire: Implement placeholder commands (low priority, can defer).

**Assessment for Brady:** Core runtime foundation is solid — SDK/CLI split is complete, command routing works, type safety is enforced. Phase 3 (integrating with CopilotClient, EventBus event emission, Coordinator logic) is the next lift. Ralph and Coordinator are well-structured but need internal wiring. No broken code — just incomplete TODOs. Estimate 2-3 weeks to wire Phase 3 fully.
