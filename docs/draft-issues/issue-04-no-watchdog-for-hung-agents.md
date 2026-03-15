# Issue: No watchdog for hung agent sessions or tool executions

## Repository
`bradygaster/squad`

## Component
`packages/squad-sdk/src/client/session-pool.ts`
`packages/squad-sdk/src/agents/lifecycle.ts`

## Status
**NEEDS VERIFICATION** — Gap identified via code review, not yet confirmed with a
reproducing test.

## Description

Squad has health check and idle detection mechanisms, but none of them detect a
**hung agent** — one whose tool call or LLM request never returns.

### What exists today

| Mechanism | Location | What it does | Limitation |
|---|---|---|---|
| SessionPool health check | `session-pool.ts:176` | Emits `pool.health_check` event every 30s | Only emits an event — doesn't ping sessions or check responsiveness |
| SessionPool idle cleanup | `session-pool.ts:186` | Removes sessions with status `'idle'` after 5min | Only acts on `'idle'` — a stuck `'active'` session is invisible |
| LifecycleManager idle checker | `lifecycle.ts:308` | Marks `'active'` agents as `'idle'` after 5min of no `lastActivityAt` update | Transitions to `'idle'`, but doesn't abort or notify about hung calls |
| HealthMonitor | `health.ts:73` | One-shot `check()` with ping + timeout | Checks client connection health, not individual agent/tool sessions |

### The gap

If an MCP tool call, LLM request, or agent task hangs indefinitely:
1. The agent stays in `'active'` status forever
2. After 5 minutes of no activity updates, it transitions to `'idle'`
3. The idle cleanup may eventually remove the session
4. But there's **no abort, no notification, no retry, no timeout** on the actual
   hung operation
5. The UI (copilot-ui) sees the agent as `'busy'` indefinitely with no way to
   recover without manual intervention

### Impact

Users experience tools/agents "hanging" with no feedback. The only recovery is to
manually stop and restart the session.

## Verification Plan

1. Write a test that spawns an agent with a mock `createSession` that never resolves
2. Verify no timeout or abort fires
3. Confirm the agent stays in `'active'`/`'idle'` without error notification
4. Check if `HealthMonitor.check()` detects the hung state (likely not — it pings the
   client connection, not individual sessions)

## Potential Fix (if verified)

- Add a configurable `taskTimeout` to `AgentSpawnConfig` or `LifecycleManagerConfig`
- In `spawnSingle()`, wrap `createSession()` and subsequent operations with
  `Promise.race([operation, timeoutPromise])`
- On timeout: transition agent to `'error'` status, emit `agent.timeout` event,
  clean up the session
- Surface timeout events through the EventBus so the UI can notify the user

## Notes

- This may explain user-reported "hanging" in copilot-ui — the UI has no mechanism
  to detect or recover from a hung squad agent either
- The existing `TIMEOUTS.HEALTH_CHECK_MS` (5000ms) in `runtime/constants.ts` is only
  used by `HealthMonitor` for its ping timeout, not for agent operations
