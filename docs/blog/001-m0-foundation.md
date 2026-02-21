# M0: Foundation — Adapter Layer, Session Pool, Health Monitor

> **⚠️ INTERNAL ONLY — DO NOT PUBLISH**

**Milestone:** M0 · **Work Items:** 9 · **Tests:** 126
**Date:** Sprint 0

---

## What We Built

M0 laid the foundation for the entire v1 SDK replatform. The goal was simple: wrap the `@github/copilot-sdk` in an adapter layer that gives us control over connection lifecycle, error handling, and session management — without leaking SDK internals into the rest of the codebase.

### SquadClient — The Adapter

`SquadClient` wraps the raw Copilot SDK client with lifecycle management and auto-reconnection. It tracks connection state through a five-state machine (`disconnected → connecting → connected → reconnecting → error`) and exposes a clean async interface for the rest of the system.

The adapter pattern was a deliberate choice. By isolating all SDK calls behind `SquadClient`, we can evolve the SDK dependency independently of our runtime. If the SDK changes its API surface, only the adapter layer needs updating.

### Error Hierarchy

We built a structured error hierarchy rooted in `SquadError`, with severity levels (`INFO` through `CRITICAL`) and categories (`SDK_CONNECTION`, `SESSION_LIFECYCLE`, `TOOL_EXECUTION`, `MODEL_API`, etc.). Every error carries context about recoverability, which the reconnection logic uses to decide whether to retry.

Key error types: `SDKConnectionError`, `SessionLifecycleError`, `ToolExecutionError`, `ModelAPIError`, `ConfigurationError`, `AuthenticationError`, `RateLimitError`. The `ErrorFactory` wraps raw SDK errors with Squad context, and `TelemetryCollector` tracks latency and error rates.

### Session Pool

`SessionPool` manages concurrent agent sessions with capacity limits, idle cleanup, and periodic health checks. Sessions move through `creating → active → idle → destroyed` states. The pool enforces `maxConcurrent` limits and automatically reclaims idle sessions after a configurable timeout.

### Event Bus

The `EventBus` provides pub/sub for session lifecycle events (`session.created`, `session.destroyed`, `session.status_changed`, etc.). It's the backbone for decoupled communication between the pool, health monitor, and coordinator layers above.

### Health Monitor

`HealthMonitor` periodically checks client connection health and reports `healthy | degraded | unhealthy` with response timing. This feeds into the coordinator's decision about whether to spawn new agents or wait for recovery.

### `SquadClientWithPool`

The top-level `SquadClientWithPool` class composes `SquadClient` + `SessionPool` + `EventBus` into a single high-level client that the runtime layers consume.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Adapter pattern over direct SDK use | Isolates SDK changes; single integration surface |
| 5-state connection machine | Clean reconnection semantics without race conditions |
| Event-driven architecture | Decouples pool, health, and coordinator without circular deps |
| Structured error hierarchy | Enables automatic retry/recovery decisions at each layer |
| Pool-based session management | Bounded concurrency prevents resource exhaustion |

## Test Coverage

126 tests across adapter, client, event-bus, errors, and health modules. All tests use Vitest with in-memory mocks — no live SDK connection required.
