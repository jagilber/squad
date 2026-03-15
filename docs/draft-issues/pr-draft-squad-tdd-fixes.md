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

### Test Coverage (50 new tests)

| Test File | Tests | What It Covers |
|---|---|---|
| `test/coordinator-mcp.test.ts` | 5 | MCP config pass-through in fan-out spawning |
| `test/cost-tracker.test.ts` | 18 | CostTracker: recordUsage, getSummary, formatSummary, wireToEventBus, reset |
| `test/lifecycle-states.test.ts` | 11 | AgentStatus type validation, state transitions |
| `test/session-resume.test.ts` | 16 | Session store null-guard audit, ID generation, expiry |

### Files Changed

```
packages/squad-sdk/src/coordinator/fan-out.ts   (+ mcpServers to AgentSpawnConfig)
packages/squad-sdk/src/agents/lifecycle.ts       (+ 'pending' to AgentStatus)
test/coordinator-mcp.test.ts                     (new)
test/cost-tracker.test.ts                        (new)
test/lifecycle-states.test.ts                    (new)
test/session-resume.test.ts                      (new)
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

- [ ] File GitHub issues for the 3 items, get issue numbers
- [ ] Rename branch to `jagilber/{issue-numbers}-squad-tdd-fixes`
- [ ] Run `npx changeset add` — select `@bradygaster/squad-sdk`, type `minor`
- [ ] Rebase on `upstream/dev` before opening PR
- [ ] PR targets `dev` branch (not `main`)
- [ ] Add `Closes #X, #Y, #Z` to PR description

## Test Results

- **50 new tests**: All passing ✅
- **Full suite**: 4138/4210 pass (5 pre-existing failures unchanged — unrelated to
  these changes: `listRoles` export missing, Docker integration tests)
- **No regressions introduced**

## Notes

- Cost tracker and session store had zero test coverage before this PR — no source
  changes were needed, only tests added
- The `AgentLifecycleState` type (public API in `agents/index.ts`) already included
  `'pending'`; this fix aligns the internal `AgentStatus` type to match
- MCP gap confirmed via: git blame, commit history, design docs search, ADR review —
  no evidence of intentional omission

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
