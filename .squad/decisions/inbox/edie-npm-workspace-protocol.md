# Decision: Use `*` instead of `workspace:*` for npm workspaces

**Author:** Edie  
**Date:** 2026-02-22  
**Status:** Applied

## Context
Brady's task requested using `workspace:*` for the CLI→SDK dependency. However, this project uses npm workspaces (not pnpm or Yarn). The `workspace:` protocol is a pnpm/Yarn feature and npm rejects it with `EUNSUPPORTEDPROTOCOL`.

## Decision
Use `"*"` as the version specifier instead. Under npm workspaces, when a dependency name matches a local workspace package, npm automatically resolves to the local package regardless of the version specifier. `"*"` accepts any version, ensuring the local SDK is always used during development.

## Trade-off
`"*"` will be published as-is to npm (unlike pnpm's `workspace:*` which gets replaced with the real version at publish time). Before publishing the CLI package, the SDK dependency version should be pinned to the actual release version. A `prepublishOnly` script or CI step could automate this.

## Alternatives Considered
- **Switch to pnpm**: Would support `workspace:*` natively, but is a much larger change than requested
- **Keep fixed version `0.8.0`**: Works but requires manual version bumps on every SDK release
