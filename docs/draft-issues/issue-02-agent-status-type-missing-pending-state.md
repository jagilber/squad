# Bug: AgentStatus type missing 'pending' state — inconsistent with AgentLifecycleState

## Repository
`bradygaster/squad`

## Component
`packages/squad-sdk/src/agents/lifecycle.ts`

## Description

The `AgentStatus` type in `lifecycle.ts` was defined as:
```ts
type AgentStatus = 'spawning' | 'active' | 'idle' | 'error' | 'destroyed';
```

But the `AgentLifecycleState` type in `agents/index.ts` (the public API re-export) was:
```ts
type AgentLifecycleState = 'pending' | 'spawning' | 'active' | 'idle' | 'error' | 'destroyed';
```

These two types represent the same concept but were out of sync — `AgentStatus` was
missing the `'pending'` state that `AgentLifecycleState` already defined. This means:

1. Code using `AgentStatus` (internal lifecycle management) cannot represent an agent
   that has been requested but not yet started spawning
2. Any runtime value of `'pending'` would be a type error against `AgentStatus` but
   valid against `AgentLifecycleState`
3. The public API promises a state that the internal implementation cannot produce

## Root Cause

`lifecycle.ts` line 25 simply omitted `'pending'` from the union type, likely an
oversight when the type was originally defined or when `AgentLifecycleState` was later
expanded in `agents/index.ts`.

## Fix

Add `'pending'` to the `AgentStatus` union type in `lifecycle.ts` to match
`AgentLifecycleState` in `agents/index.ts`:

```ts
export type AgentStatus = 'pending' | 'spawning' | 'active' | 'idle' | 'error' | 'destroyed';
```

## Evidence

- `agents/index.ts:105` — `AgentLifecycleState` includes `'pending'`
- `agents/lifecycle.ts:25` — `AgentStatus` was missing `'pending'`
- Both types are used across the codebase for the same concept (agent state tracking)

## Tests

11 tests in `test/lifecycle-states.test.ts`:
- Validates all 6 states including `'pending'` are recognized
- Tests valid state transitions (pending→spawning, spawning→active, etc.)
- Tests invalid transitions are rejected
- Verifies `'pending'` is a valid initial state
