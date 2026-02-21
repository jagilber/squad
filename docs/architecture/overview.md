# Squad SDK v1 — Architecture Overview

> **⚠️ INTERNAL ONLY — DO NOT PUBLISH**

## Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     squad.config.ts                      │
│              (defineConfig / loadConfig)                  │
└────────────────────────┬────────────────────────────────┘
                         │ validates & compiles
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Config Layer                           │
│  SquadConfig · ModelRegistry · RoutingRules · AgentSources│
│  Migration · DocSync · Init                              │
└────────────────────────┬────────────────────────────────┘
                         │ feeds
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Coordinator Layer                       │
│  Coordinator · FanOut (spawnParallel)                     │
│  RoutingDecision · ResponseTier                          │
└──────┬──────────────────────────────────┬───────────────┘
       │ manages                          │ enforces
       ▼                                  ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│    Agents Layer       │   │     Tools & Hooks Layer       │
│  CharterCompiler      │   │  ToolRegistry (5 tools)       │
│  ModelSelector        │   │  HookPipeline (5 policies)    │
│  AgentLifecycleManager│   │  ReviewerLockoutHook          │
│  Onboarding           │   │                               │
│  HistoryShadow        │   │                               │
└──────────┬────────────┘   └──────────────┬───────────────┘
           │ uses                           │ uses
           ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│                   Runtime Layer                           │
│  loadConfig · EventBus · HealthMonitor                   │
└────────────────────────┬────────────────────────────────┘
                         │ wraps
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Adapter Layer                           │
│  SquadClient · SessionPool · EventBus (client)           │
│  SquadClientWithPool · ErrorHierarchy                    │
└────────────────────────┬────────────────────────────────┘
                         │ wraps
                         ▼
┌─────────────────────────────────────────────────────────┐
│               @github/copilot-sdk                        │
└─────────────────────────────────────────────────────────┘
```

## Key Abstractions

| Abstraction | Module | Purpose |
|-------------|--------|---------|
| **SquadClient** | `src/adapter/client.ts` | Wraps Copilot SDK with lifecycle management and auto-reconnection |
| **SessionPool** | `src/client/session-pool.ts` | Bounded concurrent session management with idle cleanup |
| **EventBus** | `src/client/event-bus.ts` | Pub/sub for session lifecycle events |
| **HealthMonitor** | `src/runtime/health.ts` | Connection health checks (healthy/degraded/unhealthy) |
| **ToolRegistry** | `src/tools/index.ts` | Typed tool definitions with JSON schema validation |
| **HookPipeline** | `src/hooks/index.ts` | Pre/post tool-use policy enforcement |
| **CharterCompiler** | `src/agents/charter-compiler.ts` | Transforms charter.md → SDK agent config |
| **ModelSelector** | `src/agents/model-selector.ts` | 4-layer model resolution (user → charter → task → default) |
| **AgentLifecycleManager** | `src/agents/lifecycle.ts` | Agent spawn/destroy cycle with idle reaping |
| **Coordinator** | `src/coordinator/index.ts` | Central orchestrator for routing and agent sessions |
| **SquadConfig** | `src/config/schema.ts` | Root typed configuration interface |
| **MigrationRegistry** | `src/config/migration.ts` | Semver-based config migration chains |

## Config Flow

```
squad.config.ts
    │
    ▼
loadConfig()          — discovers and loads config file
    │
    ▼
validateConfig()      — runtime type validation
    │
    ▼
compileRoutingRules() — builds regex-based router
    │
    ▼
compileCharter()      — per-agent: charter.md → CompiledCharter
    │
    ▼
resolveModel()        — per-agent: 4-layer model resolution
    │
    ▼
AgentLifecycleManager — spawns agents with compiled config
    │
    ▼
spawnParallel()       — fan-out via Promise.allSettled
```

## Error Strategy

All errors extend `SquadError` with severity (`INFO`→`CRITICAL`), category, and recoverability metadata. The adapter layer wraps raw SDK errors via `ErrorFactory`. Upper layers use recoverability to decide retry vs. escalate.

## Event Architecture

Two event bus instances serve different scopes:
- **Client EventBus** (`src/client/event-bus.ts`) — Session-level events within the pool
- **Runtime EventBus** (`src/runtime/event-bus.ts`) — Lifecycle and operational events for the coordinator

Events flow upward: session pool → client event bus → `aggregateSessionEvents()` → coordinator event bus.
