# Issue: Subagent compaction events not propagated to coordinator or UI

## Repository
`bradygaster/squad`

## Component
`packages/squad-sdk/src/coordinator/fan-out.ts`
`packages/squad-sdk/src/adapter/types.ts`

## Status
**NEEDS VERIFICATION** — Gap identified via code review, not yet confirmed with a
reproducing test.

## Description

When the coordinator spawns subagent sessions via `spawnSingle()`, those sessions can
hit context window limits and trigger background compaction. However:

1. The coordinator **never subscribes** to `session.compaction_start` or
   `session.compaction_complete` events from spawned sessions
2. Per-agent context utilization is **not tracked** or surfaced
3. The coordinator has **no awareness** that a subagent is degraded during compaction
4. The UI sees the agent as `'busy'` with no indication of *why* it's slow

### What exists today

**copilot-ui handles compaction for its own session:**
- `SessionStatus` includes `'compacting'` state (`types/index.ts:197`)
- Listens for `session.compaction_start/complete` events (`useEventHandler.ts:217-221`)
- Tracks `ContextUsage` with token counts (`messageReducer.ts:155`)
- Has `/compact` and `/context` slash commands for manual control
- Default `backgroundCompactionThreshold: 0.80` (80%)

**squad-sdk defines the config types but doesn't use them for subagents:**
- `InfiniteSessionConfig` with `backgroundCompactionThreshold` (`adapter/types.ts:720-738`)
- `max_context_window_tokens` field exists (`adapter/types.ts:948`)
- But `spawnSingle()` in `fan-out.ts` never wires compaction event listeners
- No per-agent context tracking in `CostTracker` or `SessionPool`

### The gap

When a subagent's context window fills up:
1. The Copilot SDK triggers background compaction automatically
2. The subagent becomes slow/unresponsive during compaction
3. The coordinator doesn't know — it's still waiting for a response
4. The UI shows the agent as `'busy'` with no degradation indicator
5. The user sees a "hang" that eventually resolves (or doesn't, if compaction fails)

This is distinct from Issue #4 (hung agents with no timeout). Here the agent **is
working** — it's just compacting — but nobody in the stack knows about it.

## Verification Plan

1. Confirm `spawnSingle()` does not subscribe to any session-level events from the
   spawned session (check return type of `createSession()`)
2. Check if the Copilot SDK emits `session.compaction_start/complete` on the session
   object or only on a global event bus
3. Write a test with a mock session that emits compaction events and verify the
   coordinator/EventBus does not propagate them

## Potential Fix (if verified)

1. **Event forwarding**: In `spawnSingle()`, after creating a session, subscribe to
   `session.compaction_start/complete` and re-emit on the squad EventBus as
   `agent.compaction_start` / `agent.compaction_complete` with the agent name
2. **Context tracking**: Extend `CostTracker` or create a `ContextTracker` that
   records per-agent context utilization from `session.context_usage` events
3. **Status propagation**: When an agent starts compacting, emit an event the UI can
   use to show a `'compacting'` badge on the agent (copilot-ui already has the
   `'compacting'` session status — just needs per-agent granularity)

## Related

- Issue #4: No watchdog for hung agent sessions (timeout gap)
- copilot-ui `useEventHandler.ts:217-221` — handles compaction for main session only
- copilot-ui `types/index.ts:197` — `SessionStatus` already includes `'compacting'`
- `adapter/types.ts:720-738` — `InfiniteSessionConfig` defines compaction thresholds
