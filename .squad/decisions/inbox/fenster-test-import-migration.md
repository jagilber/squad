# Decision: Test Import Migration Strategy

**Author:** Fenster (Core Dev)
**Date:** 2026-02-22
**Status:** Implemented

## Context

All 56 test files imported from root `src/` via relative paths (`../src/...`). With the SDK/CLI workspace split, tests needed to import from `@bradygaster/squad-sdk` and `@bradygaster/squad-cli` packages instead.

## Decision

1. **Barrel-first imports**: Where a barrel/index file re-exports symbols from sub-modules, tests import from the barrel path (e.g., `@bradygaster/squad-sdk/config` instead of individual files like `config/schema.js`, `config/routing.js`).

2. **New subpath exports for orphaned modules**: 8 runtime/adapter modules not covered by existing barrels got new subpath exports in the SDK package.json (e.g., `./runtime/event-bus`, `./adapter/errors`).

3. **Missing barrel re-exports surfaced and fixed**: `selectResponseTier`/`getTier` were missing from coordinator barrel; `onboardAgent`/`addAgentToConfig` were missing from agents barrel. Both were only available from the root SDK barrel (`@bradygaster/squad-sdk`), not from their domain subpath. Fixed by adding re-exports to the barrels.

4. **CLI functions moved to CLI package**: Consumer-imports test updated to import CLI functions from `@bradygaster/squad-cli` (not SDK), reflecting the intentional separation.

## Consequence

- `grep -r "from '../src/" test/` returns zero results
- All 1727 tests pass
- SDK has 26 subpath exports, CLI has 17 (including root `.`)
- Vitest resolves through compiled dist/ — barrel changes require `npm run build` in the package
