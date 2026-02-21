# M2: Configuration System — Schema to Migration

> **⚠️ INTERNAL ONLY — DO NOT PUBLISH**

**Milestone:** M2 · **Work Items:** 13 · **Tests:** 545 (cumulative)
**Date:** Sprint 2

---

## What We Built

M2 replaced Squad's markdown-based configuration with a typed TypeScript config system. This is the milestone where Squad stops being "a prompt with conventions" and becomes a programmable runtime with a real configuration layer.

### Typed SquadConfig & defineConfig()

`SquadConfig` is the root configuration interface, covering team settings, agent definitions, routing rules, model preferences, hooks, ceremonies, and plugins. The `defineConfig()` function merges a partial config with `DEFAULT_CONFIG`, giving users a clean API:

```ts
export default defineConfig({
  team: { name: 'my-squad', root: '.squad' },
  agents: { /* ... */ },
  routing: { /* ... */ },
});
```

`validateConfig()` acts as a type guard, validating unknown objects against the schema at runtime. This dual static+runtime validation means config errors surface early — at load time, not when an agent tries to use a bad value.

### Config Loader

`loadConfig()` and `loadConfigSync()` handle discovery, loading, and validation of `squad.config.ts` files. `discoverConfigFile()` walks up from the working directory to find the nearest config file. The loader returns a `ConfigLoadResult` with the validated config and any `ConfigValidationError` diagnostics.

### Routing Rules Engine

`compileRoutingRules()` transforms declarative routing config into a compiled router with regex patterns for fast matching. `matchRoute()` maps incoming messages to agents, and `matchIssueLabels()` handles GitHub issue label routing. The routing system also parses legacy `routing.md` markdown tables via `parseRoutingMarkdown()`.

### Model Registry — 17 Models

`ModelRegistry` catalogs all supported models with capability metadata (`ModelInfo`). The registry supports lookup by name, indexing by tier and provider, and fallback chain resolution via `DEFAULT_FALLBACK_CHAINS`. Convenience functions `getModelInfo()`, `getFallbackChain()`, and `isModelAvailable()` simplify model queries.

The 17-model catalog spans premium, standard, and fast tiers across multiple providers, giving the task-aware model selector a rich set of options.

### Agent Sources & Discovery

Three agent source implementations handle different discovery patterns:
- **LocalAgentSource** — Reads agents from the local `.squad/` directory
- **GitHubAgentSource** — Fetches shared agents from GitHub repositories
- **MarketplaceAgentSource** — Discovers agents from the marketplace (future)

`AgentRegistry` composes multiple sources and provides unified agent discovery. `parseCharterMetadata()` extracts structured metadata from charter files.

### Init & Onboarding

`initSquad()` scaffolds a new Squad project with config files, agent directories, and documentation. `onboardAgent()` creates the agent directory, charter, and history shadow. `addAgentToConfig()` registers the new agent in the config file.

### Migration System

`MigrationRegistry` manages versioned config migrations with semver ordering. Migrations are registered as functions that transform config from one version to the next. The registry builds migration chains automatically — to go from v0.3.0 to v0.6.0, it chains all intermediate migrations.

`parseSemVer()` and `compareSemVer()` handle version parsing and comparison. This is the foundation for smooth upgrades as the config schema evolves.

### Markdown Migration — The Bridge

`migrateMarkdownToConfig()` converts legacy `.ai-team/` markdown files (team.md, routing.md, decisions) into typed `SquadConfig`. This is the bridge from beta to v1: teams with existing markdown configs can migrate automatically.

### Doc-Sync — The Bidirectional Bridge

`syncDocToConfig()` merges agent doc metadata into config, `syncConfigToDoc()` generates agent markdown from config, and `detectDrift()` identifies mismatches. This keeps markdown documentation and typed config in sync as either side changes.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| `defineConfig()` pattern | Familiar from Vite/Vitest; enables TypeScript autocomplete |
| Semver migration chains | Automatic multi-step upgrades without manual intervention |
| Markdown↔config bridge | Smooth beta→v1 migration; no forced rewrite |
| 17-model catalog | Future-proofs model selection as providers ship new models |
| Three agent source types | Local-first with escape hatches for shared/marketplace agents |

## Test Coverage

545 cumulative tests. Major additions: config schema validation, routing compilation and matching, model registry lookups, migration chain execution, markdown parsing and migration, doc-sync drift detection, and init scaffolding. Integration tests verify the full load→validate→compile pipeline.
