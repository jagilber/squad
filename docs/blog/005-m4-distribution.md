# M4: Distribution — Build, Package, Ship

> **⚠️ INTERNAL ONLY — DO NOT PUBLISH**

**Milestone:** M4 · **Work Items:** 10 · **Tests:** 1111 (cumulative, 65 distribution+marketplace)
**Date:** Sprint 4

---

## What We Built

M4 turns the Squad SDK from a local runtime into a distributable package. Every component needed to build, bundle, and ship a Squad-powered Copilot extension is now in place — from the esbuild bundle strategy through npm packaging, GitHub release distribution, and the upgrade CLI.

### Bundle Strategy

`BundleBuilder` wraps esbuild with Squad-aware defaults: tree-shaking the SDK, externalizing `@github/copilot-sdk`, and producing a single ESM entry point. Bundle metadata (size, entry, externals) is captured so the packaging step can validate output before publish. The strategy keeps install size minimal while preserving full runtime capability.

### npm Packaging

`NpmPackageBuilder` generates a publish-ready `package.json` from `SquadConfig`, maps agent roles to npm keywords, and assembles the file list (`dist/`, manifest, README, icon). The builder validates required fields before writing — missing description or version blocks the pipeline early instead of failing on `npm publish`.

### GitHub Distribution

`GitHubDistBuilder` prepares release artifacts for GitHub Releases. It generates release notes from the config changelog, attaches the `.squad-pkg` archive, and tags the release with the manifest version. Teams that prefer GitHub over npm get first-class support without extra tooling.

### Upgrade CLI

The `squad upgrade` command checks the current installed version against the registry, downloads the latest compatible release, and applies it in-place. Version pinning is respected — if a project locks to `0.6.x`, the CLI won't jump to `0.7.0`. Offline detection queues the check for the next connection.

### Marketplace Readiness

The marketplace module (`ExtensionAdapter`, `ManifestCategory`, `validateManifest`, `packageForMarketplace`) bridges Squad configs to the Copilot Extensions API surface. `generateManifest` converts a `SquadConfig` into a marketplace manifest; `registerExtension` handles submission. Validation catches missing fields, bad semver, and invalid categories before they reach the API.

### Telemetry & Cost Tracking

`CostTracker` and the streaming telemetry pipeline now include distribution events: bundle size, publish duration, install latency. These flow through the same `EventBus` as runtime events, so dashboards get build-time and runtime data in one stream.

### CI/CD Integration

Distribution steps are designed to run in GitHub Actions. Build, bundle, validate, package, and publish are individual functions that compose into a workflow. The test suite includes a manual validation script (`docs/test-scripts/`) for pre-release smoke testing outside CI.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| esbuild over rollup | 10× faster builds; Squad bundles are simple enough to skip rollup's plugin ecosystem |
| `.squad-pkg` archive format | Self-describing package with manifest.json at root; avoids npm-specific assumptions |
| Offline queue for marketplace ops | Marketplace publish/install fail gracefully; queued ops sync on reconnect |
| Security validation before publish | Prompt injection and PII scans block bad charters from reaching the marketplace |
| Manual test scripts alongside CI | Covers interactive flows (upgrade prompts, offline recovery) that CI can't exercise |

## Test Coverage

1111 cumulative tests across the full pipeline. 65 are dedicated distribution and marketplace tests covering: manifest generation and validation, extension adapter conversion, event mapping, registration, packaging, package validation, bundle output verification, npm package generation, GitHub release preparation, and end-to-end export → import → marketplace roundtrips. Integration tests (M5-15) add coverage for security validation, conflict resolution, offline queueing, cache TTL, and the full browse → install → merge pipeline.
