# Bug: MCP server config not passed through to spawned agent sessions

## Repository
`bradygaster/squad`

## Component
`packages/squad-sdk/src/coordinator/fan-out.ts`

## Description

When the coordinator fan-out spawns agent sessions via `spawnSingle()`, MCP server
configurations are silently dropped. The `AgentSpawnConfig` interface does not include
an `mcpServers` field, and `createSession()` is called with only `{ model, clientName }`
— any MCP servers configured for the agent are never forwarded to the session.

This means agents spawned through the coordinator cannot access MCP tools that were
configured for them, even if the calling code provides MCP config.

## Root Cause

`fan-out.ts` line 125 (before fix):
```ts
const session = await deps.createSession({
  model,
  clientName: `squad-agent-${config.agentName}`,
});
```

No `mcpServers` property exists on `AgentSpawnConfig`, so there is no way for callers
to pass MCP config, and even if they did, `createSession()` would never receive it.

## Fix

1. Add `mcpServers?` to the `AgentSpawnConfig` interface
2. Thread `config.mcpServers` into the `createSession()` call when present

## Evidence

- `AgentSpawnConfig` (line 14-28) had no MCP field
- `spawnSingle()` (line 109) only passed `model` and `clientName` to `createSession()`
- `AgentLifecycleState` in `agents/index.ts` already anticipates MCP-aware agents

## Tests

5 tests in `test/coordinator-mcp.test.ts`:
- Accepts `mcpServers` in spawn config
- Passes MCP config through to `createSession()`
- Omits MCP config when not provided
- Works in parallel fan-out scenarios
- Supports per-agent MCP config
