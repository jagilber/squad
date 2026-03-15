# PR: feat: MCP config pass-through, AgentStatus pending state, and TDD test coverage

## Repository
`bradygaster/squad` ← `jagilber/squad` branch `jagilber/squad-tdd-fixes`

## Target Branch
`dev` (per CONTRIBUTING.md — fork PRs target `dev`, not `main`)

## Summary

Two bug fixes and 50 new tests covering coordinator fan-out, cost tracking, lifecycle
states, and session store.

## Changes

### Bug Fixes

1. **MCP server config not passed to spawned agent sessions** (Issue #TBD)
   - Added `mcpServers?` field to `AgentSpawnConfig` interface in `fan-out.ts`
   - Threaded MCP config through `spawnSingle()` → `createSession()`
   - File: `packages/squad-sdk/src/coordinator/fan-out.ts`
   - Not an intentional omission — no ADRs, design docs, TODOs, or git history
     suggest MCP was deliberately excluded from fan-out. The repo documents MCP
     usage in `docs/features/mcp.md` but the coordinator never wired it through.

2. **AgentStatus missing 'pending' state** (Issue #TBD)
   - `AgentStatus` in `lifecycle.ts` was missing `'pending'` that `AgentLifecycleState`
     in `agents/index.ts` already defined — types were out of sync
   - Added `'pending'` to `AgentStatus` union type
   - File: `packages/squad-sdk/src/agents/lifecycle.ts`

3. **CostTracker zero test coverage** (Issue #TBD)
   - ~220 lines of production cost-tracking code with no tests
   - No source changes needed — implementation is solid
   - Added 18 tests covering all public methods and edge cases

### Test Coverage (62 new tests)

| Test File | Tests | What It Covers |
|---|---|---|
| `test/coordinator-mcp.test.ts` | 5 | MCP config pass-through in fan-out spawning |
| `test/cost-tracker.test.ts` | 18 | CostTracker: recordUsage, getSummary, formatSummary, wireToEventBus, reset |
| `test/lifecycle-states.test.ts` | 11 | AgentStatus type validation, state transitions |
| `test/session-resume.test.ts` | 16 | Session store null-guard audit, ID generation, expiry |
| `test/hung-agent-watchdog.test.ts` | 5 | **RED** TDD: proves no timeout/watchdog for hung agents (Issue #4) |
| `test/subagent-compaction.test.ts` | 7 | **RED** TDD: proves compaction events not propagated (Issue #5) |

### Infrastructure Fix

- **vitest.config.ts**: Added `deps.inline: ['@github/copilot-sdk']` and
  `resolve.alias: {'vscode-jsonrpc/node': 'vscode-jsonrpc/node.js'}` to fix
  ESM module resolution. `vscode-jsonrpc` has no `exports` map so ESM subpath
  imports fail without the `.js` extension. This also unblocked 15 test files
  that previously couldn't load (including `coordinator-mcp.test.ts`).

### Files Changed

```
packages/squad-sdk/src/coordinator/fan-out.ts   (+ mcpServers to AgentSpawnConfig)
packages/squad-sdk/src/agents/lifecycle.ts       (+ 'pending' to AgentStatus)
vitest.config.ts                                 (+ deps.inline, resolve.alias)
test/coordinator-mcp.test.ts                     (new)
test/cost-tracker.test.ts                        (new)
test/lifecycle-states.test.ts                    (new)
test/session-resume.test.ts                      (new)
test/hung-agent-watchdog.test.ts                 (new — RED TDD)
test/subagent-compaction.test.ts                 (new — RED TDD)
```

## Convention Compliance

| Check | Status | Notes |
|---|---|---|
| Commit prefix | ✅ `feat:` | Matches repo practice |
| Co-authored-by trailer | ✅ Present | Required per CONTRIBUTING.md |
| Test location | ✅ `test/*.test.ts` | Matches vitest config and existing tests |
| Test style | ✅ `describe/it/vi.fn()` | Mirrors `fan-out.test.ts`, `coordinator.test.ts` |
| Package imports | ✅ `@bradygaster/squad-sdk/...` | No relative paths |
| Branch naming | ⚠️ `jagilber/squad-tdd-fixes` | Missing issue number — update once issues are filed |

## Pre-Merge Checklist

- [ ] File GitHub issues for the 5 items, get issue numbers
- [ ] Rename branch to `jagilber/{issue-numbers}-squad-tdd-fixes`
- [ ] Run `npx changeset add` — select `@bradygaster/squad-sdk`, type `minor`
- [ ] Rebase on `upstream/dev` before opening PR
- [ ] PR targets `dev` branch (not `main`)
- [ ] Add `Closes #X, #Y, #Z` to PR description (issues 1-3 are fixed; 4-5 are TDD-verified RED)

## Test Results

- **62 new tests**: 51 passing ✅ + 11 intentionally RED (TDD verification)
- **Full suite**: 4120 pass, 35 fail (24 pre-existing, 11 our intentional RED)
- **No regressions introduced** — 239 more tests passing vs previous baseline
  thanks to the vitest deps.inline fix unblocking 15 previously-broken test files
- **Pre-existing failures**: aspire-integration(1), docs-build(1), repl-ux-e2e(5),
  session-adapter(18 — was hidden behind module load failure, now surfaced)

## Notes

- Cost tracker and session store had zero test coverage before this PR — no source
  changes were needed, only tests added
- The `AgentLifecycleState` type (public API in `agents/index.ts`) already included
  `'pending'`; this fix aligns the internal `AgentStatus` type to match
- MCP gap confirmed via: git blame, commit history, design docs search, ADR review —
  no evidence of intentional omission

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
