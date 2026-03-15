# Issue: CostTracker has zero test coverage

## Repository
`bradygaster/squad`

## Component
`packages/squad-sdk/src/runtime/cost-tracker.ts`

## Description

The `CostTracker` class (~220 lines) is a fully implemented cost aggregation system
that tracks per-agent token usage, estimated costs, and integrates with the runtime
EventBus. Despite being production code that handles financial metrics, it had
**zero test coverage**.

Key untested functionality:
- `recordUsage()` — accumulates input/output tokens and cost per agent
- `getSummary()` — returns aggregated cost data across all agents
- `formatSummary()` — produces human-readable cost reports
- `wireToEventBus()` — subscribes to `session:message` events for automatic tracking
- `reset()` — clears all accumulated data
- Fallback behavior for malformed event data

## Risk

Cost tracking directly affects billing visibility and resource planning. Untested
cost aggregation code could silently produce incorrect totals, miss events, or fail
on edge cases (e.g., unknown agents, missing token counts, concurrent resets).

## Fix

Added 18 tests in `test/cost-tracker.test.ts` covering:
- Basic usage recording and accumulation
- Multi-agent tracking and isolation
- Summary generation with correct totals
- Formatted output structure
- EventBus integration (`session:message` subscription)
- Reset behavior
- Edge cases: zero-cost entries, missing fields, unknown agents

## Notes

- No source changes were needed — the implementation is solid
- Uses the **runtime** EventBus (`subscribe()` method), not the client EventBus (`on()` method)
- Import path: `@bradygaster/squad-sdk/runtime/event-bus`
