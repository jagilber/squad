# M1: Core Runtime — Tools, Hooks, Agents, Fan-Out

> **⚠️ INTERNAL ONLY — DO NOT PUBLISH**

**Milestone:** M1 · **Work Items:** 12 · **Tests:** 287 (cumulative)
**Date:** Sprint 1

---

## What We Built

M1 wired the runtime engine on top of M0's foundation. This milestone delivered the four systems that make Squad an actual multi-agent runtime: tool registration, hook-based policy enforcement, agent lifecycle management, and parallel fan-out.

### ToolRegistry — 5 Typed Tools

`ToolRegistry` manages the five built-in Squad tools, each defined with `defineTool()` and a JSON schema:

1. **route** — Routes a task to another agent (`RouteRequest`)
2. **decide** — Records a team decision (`DecisionRecord`)
3. **memory** — Reads/writes agent history entries (`MemoryEntry`)
4. **status** — Queries the session pool for agent status (`StatusQuery`)
5. **skill** — Reads/writes agent skill definitions (`SkillRequest`)

Tools are typed end-to-end: the schema validates input, the handler receives typed params, and `ToolResult` carries structured output with a success flag.

### HookPipeline — 5 Policies

`HookPipeline` runs pre- and post-tool hooks that enforce safety policies. Every tool invocation passes through the pipeline, which can `allow`, `block`, or `modify` the call.

Five built-in policies:
1. **File guards** — Restrict file access to allowed paths
2. **Shell restrictions** — Block dangerous shell commands
3. **Rate limiting** — Throttle tool calls per agent per window
4. **PII scrubbing** — Strip sensitive data from tool output
5. **Reviewer lockout** — `ReviewerLockoutHook` prevents agents from editing artifacts they're reviewing

The reviewer lockout pattern is important: it enforces separation of concerns at the tool level, not just by convention. An agent assigned as reviewer on a file physically cannot write to it.

### Charter Compilation & Model Selection

`compileCharter()` transforms a `charter.md` file into a `CompiledCharter` with resolved model, tools, and parsed metadata (identity, ownership, boundaries, collaboration rules). `compileCharterFull()` adds full resolution metadata.

Model selection uses a **4-layer priority resolution**:

1. **User override** — Explicit model in the request
2. **Charter preference** — Model declared in the agent's charter
3. **Task-aware auto** — Matches `TaskType` (code/prompt/docs/visual/planning/mechanical) to model tiers
4. **Default fallback** — Falls back through tier-based chains (premium → standard → fast)

`resolveModel()` returns a `ResolvedModel` with the selected model, its tier, resolution source, and the full fallback chain.

### Agent Lifecycle Manager

`AgentLifecycleManager` owns the full spawn→active→idle→destroy cycle. `SpawnAgentOptions` configures each agent with a name, task, task type, optional model override, context, and timeout. The manager tracks `AgentHandle` references with `sendMessage()` and `destroy()` capabilities.

Idle agents are automatically reaped after a configurable timeout. The lifecycle manager subscribes to the event bus for session state changes and updates agent status accordingly.

### Fan-Out with Promise.allSettled

`spawnParallel()` spawns multiple agents concurrently using `Promise.allSettled` for error isolation — a failing agent doesn't crash its siblings. Each `SpawnResult` carries status, timing, and error details independently.

`aggregateSessionEvents()` forwards per-agent session events to the coordinator's event bus, giving the coordinator a unified view of all active agents.

## Key Patterns

| Pattern | Why |
|---------|-----|
| 4-layer model resolution | Respects user intent while enabling smart defaults |
| Reviewer lockout at hook level | Structural enforcement, not just convention |
| `Promise.allSettled` fan-out | Error isolation — one agent failure doesn't cascade |
| Typed tool schemas | Compile-time + runtime validation of tool inputs |

## Test Coverage

287 cumulative tests. New coverage for tools, hooks, charter compiler, model selector, lifecycle manager, and fan-out. Hook tests exercise all five policy types with both allow and block scenarios.
