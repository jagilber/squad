---
title: "v0.8.21: SDK-First Mode — Define Your Squad in TypeScript"
date: 2026-03-10
author: "McManus (DevRel)"
wave: 7
tags: [squad, release, v0.8.21, sdk-first, builders, typescript, azure-functions]
status: published
hero: "v0.8.21 introduces SDK-First Mode: define your AI team in TypeScript with 8 builder functions, compile to markdown with `squad build`, and deploy anywhere. No more manual YAML. Azure Function sample included."
---

# v0.8.21: SDK-First Mode — Define Your Squad in TypeScript

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _Squad now lets you define your entire team—agents, routing, ceremonies, telemetry, governance—in a single TypeScript config file. Type-safe. Validated at runtime. Compiled to markdown. Deployed anywhere._

---

## What Shipped

### SDK-First Mode (Phase 1)

**Eight builder functions** for type-safe team configuration:

- `defineTeam()` — Team metadata, project context, member roster
- `defineAgent()` — Agent role, model, tools, capabilities, and status
- `defineRouting()` — Pattern-based routing with tiers and priorities
- `defineCeremony()` — Ceremony scheduling (standups, retros, retrospectives)
- `defineHooks()` — Governance hooks (write guards, blocked commands, PII scrubbing)
- `defineCasting()` — Casting configuration (universe allowlists, overflow strategy)
- `defineTelemetry()` — OpenTelemetry instrumentation (metrics, traces, spans)
- `defineSquad()` — Top-level config composition

**`squad build` command** with three modes:

```bash
squad build              # Compile squad.config.ts to .squad/ markdown
squad build --check     # Validate without writing
squad build --dry-run   # Preview what would be generated
squad build --watch     # File monitoring (stub for Phase 2)
```

Generates:
- `.squad/team.md` — team roster and context
- `.squad/routing.md` — routing rules with priorities
- `.squad/agents/{name}/charter.md` — agent charters with capabilities
- `.squad/ceremonies.md` — ceremony schedules (if defined)

Protected files (`.squad/decisions.md`, `.squad/history.md`) are **never overwritten**.

### Quick Start

```typescript
import {
  defineSquad,
  defineTeam,
  defineAgent,
  defineRouting,
} from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({
    name: 'Content Review Squad',
    description: 'Specialist reviewers for multi-angle content analysis',
    projectContext: 'HTTP-triggered review pipeline',
    members: ['tone-reviewer', 'technical-reviewer', 'copy-editor'],
  }),

  agents: [
    defineAgent({
      name: 'tone-reviewer',
      role: 'Tone & Voice Analyst',
      model: 'claude-sonnet-4',
      tools: ['grep', 'view'],
      capabilities: [
        { name: 'content-analysis', level: 'expert' },
        { name: 'audience-mapping', level: 'proficient' },
      ],
    }),
    defineAgent({
      name: 'technical-reviewer',
      role: 'Technical Accuracy Checker',
      model: 'claude-sonnet-4',
      tools: ['grep', 'view', 'powershell'],
      capabilities: [
        { name: 'code-review', level: 'expert' },
        { name: 'fact-checking', level: 'expert' },
      ],
    }),
    defineAgent({
      name: 'copy-editor',
      role: 'Copy Editor',
      model: 'claude-sonnet-4',
      tools: ['grep', 'view'],
      capabilities: [
        { name: 'grammar-check', level: 'expert' },
        { name: 'readability-analysis', level: 'proficient' },
      ],
    }),
  ],

  routing: defineRouting({
    rules: [
      {
        pattern: 'tone-*',
        agents: ['tone-reviewer'],
        tier: 'direct',
        priority: 1,
      },
      {
        pattern: 'technical-*',
        agents: ['technical-reviewer'],
        tier: 'standard',
        priority: 1,
      },
      {
        pattern: 'copy-*',
        agents: ['copy-editor'],
        tier: 'direct',
        priority: 1,
      },
      {
        pattern: 'review-*',
        agents: ['tone-reviewer', 'technical-reviewer', 'copy-editor'],
        tier: 'full',
        priority: 0,
      },
    ],
    defaultAgent: 'tone-reviewer',
    fallback: 'coordinator',
  }),
});
```

Then:

```bash
npm install @bradygaster/squad-sdk
npx squad build
# Generates .squad/team.md, .squad/routing.md, .squad/agents/*/charter.md
```

### Azure Function Sample

New sample: `samples/azure-function-squad/` — a **Content Review Squad** that wires an HTTP-triggered Azure Function to a multi-agent review pipeline.

**What it demonstrates:**

- `defineSquad()` composing team + agents + routing
- Three specialist agents (tone, technical, copy) defined with `defineAgent()`
- Pattern-based routing with `defineRouting()`
- Real TypeScript integration with Azure Functions v4
- Structured JSON responses with per-agent findings

**Usage:**

```bash
cd samples/azure-function-squad
npm install
func start  # Requires Azure Functions Core Tools

# In another terminal:
curl -X POST http://localhost:7071/api/squad-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Building multi-agent systems with the Squad SDK is straightforward. Define your agents with defineAgent(), compose them into a team with defineTeam(), and wire up routing with defineRouting(). The SDK validates everything at runtime — no schema files needed."
  }'
```

**Response:**

```json
{
  "reviews": [
    {
      "agent": "tone-reviewer",
      "role": "Tone & Voice Analyst",
      "score": 7,
      "findings": [
        {
          "severity": "suggestion",
          "message": "Tone is neutral. Consider adding variety to maintain reader interest."
        }
      ],
      "summary": "Analyzed 42 words. Tone is informational, energetic."
    },
    {
      "agent": "technical-reviewer",
      "role": "Technical Accuracy Checker",
      "score": 9,
      "findings": [],
      "summary": "Technical review complete. Code blocks verified."
    },
    {
      "agent": "copy-editor",
      "role": "Copy Editor",
      "score": 8,
      "findings": [
        {
          "severity": "suggestion",
          "message": "Passive voice detected. Consider rewriting in active voice."
        }
      ],
      "summary": "Reviewed 6 sentences. Avg sentence length: 12 words."
    }
  ],
  "overallScore": 8,
  "consensus": "✅ Content is publication-ready with minor suggestions."
}
```

The Azure sample is a drop-in starting point for serverless multi-agent workflows. Replace the mock review handlers with live Squad runtime calls using `SquadClient`, and you have a production-ready review pipeline.

---

## Documentation

### New Guides

- **[SDK-First Mode](../sdk-first-mode.md)** — Comprehensive guide covering concepts, builder reference, patterns, and when to use SDK-First vs. markdown-only
- **[SDK Reference](../reference/sdk.md)** — Full builder function signatures, type definitions, runtime validation rules, and examples

### What Changed

- README includes quick reference for SDK-First teams
- CHANGELOG updated with Phase 1 deliverables
- All sample code demonstrates the builder pattern

---

## Testing & Stability

**Test Coverage:**

- 36 builder function tests (`test/builders.test.ts`) — validates runtime type guards for each builder
- 24 build command tests (`test/build-command.test.ts`) — `--check`, `--dry-run`, protected file guards
- 29 markdown→SDK conversion round-trip tests (`test/sdk-conversion.test.ts`) — ensures config round-trips cleanly
- **Total test suite:** 3600+ tests, all passing

---

## Technical Details

### SDK Mode Detection

The coordinator now auto-detects SDK-First mode:

```typescript
// squad.config.ts exists?
if (fs.existsSync(resolve('.', 'squad.config.ts'))) {
  // Squad is in SDK-First mode
  // Coordinator uses compiled markdown + SDK awareness
}
```

Fallback: if `squad.config.ts` is missing, Squad operates in traditional markdown-first mode (backward compatible).

### OTel Readiness Assessment

All 8 telemetry modules (`defineHooks`, `defineTelemetry`, meter providers, span processors, exporters) compile and validate with zero runtime errors. This unblocks **Phase 3: OpenTelemetry Integration** — where agents report metrics and traces to Prometheus, Jaeger, and Datadog.

---

## By the Numbers

| Metric | Value |
|--------|-------|
| Issues closed | 1 (#194 — SDK-First Mode) |
| Issues filed & implemented | 1 (#213 — Azure Function sample) |
| Builder functions | 8 |
| Test cases | 89 (builders + build command + round-trip) |
| Documentation pages | 2 (SDK-First Mode guide + reference) |
| Sample projects | 1 (Azure Function Content Review Squad) |
| Code examples in docs | 12+ |
| Lines of SDK code | ~2000 (builders + validation + CLI integration) |

---

## What We Learned

- **Type safety is a UX feature.** Developers writing `squad.config.ts` get autocomplete and catch misconfiguration errors at edit time, not at runtime. This pays for itself immediately.
- **Builders need to validate deeply.** Each builder runs type guards on input — enum values, required fields, capability levels, routing priorities. This surfaces configuration bugs early.
- **Azure Functions unlock serverless agents.** The sample demonstrates that Squad agents can run in a stateless HTTP function. This opens up cost-efficient deployments for batch processing workloads (content review, code analysis, compliance checks).
- **Protected files are critical.** `.squad/decisions.md` and `.squad/history.md` must never be overwritten by generated files. This ensures human-written knowledge persists across recompiles.

---

## What's Coming Next

### Phase 2: Live Reload (Planned)

- `squad build --watch` fully implemented — hot reload of squad.config.ts changes
- Agents re-spawn with new config without restarting the CLI
- Decision file merging strategies for concurrent edits

### Phase 3: OpenTelemetry Integration (Unblocked)

- `defineTelemetry()` config → live instrumentation
- Agents export metrics and traces to Prometheus, Jaeger, and Datadog
- Cost tracking per agent (token spend, wall-clock time)
- Performance dashboards in Squad CLI (`squad aspire`)

### Beyond v0.8.21

- **Builder linting:** `squad lint` validates config against best practices (agent capability coverage, routing gaps, ceremony scheduling conflicts)
- **Config versioning:** `squad config migrate` helpers for breaking changes across SDK versions
- **Casting system integration:** `defineCasting()` → live universe selection and overflow handling in coordinator

---

## Upgrade Path

**From v0.8.20 → v0.8.21:**

```bash
npm install -g @bradygaster/squad-cli@latest
# Or
npm install --save-dev @bradygaster/squad-cli@latest
```

SDK-First Mode is **opt-in**. Existing markdown-based squads continue to work without changes.

To migrate to SDK-First:

1. Create `squad.config.ts` with builder functions
2. Run `squad build --dry-run` to preview generated files
3. Run `squad build` to generate `.squad/` markdown
4. Commit the config, version control the generated files, and sync your team

Alternatively, keep your markdown-first squad — both modes will coexist indefinitely.

---

## Try It Now

```bash
npm install -g @bradygaster/squad-cli@latest
mkdir my-sdk-squad && cd my-sdk-squad
git init

# Create squad.config.ts with builders
# (see quick start above, or copy from samples/azure-function-squad/)

# Build your squad
npx squad build

# See the generated markdown
cat .squad/team.md

# Run agents (same CLI, same experience)
npx squad start
```

Full sample: [github.com/bradygaster/squad/tree/main/samples/azure-function-squad](https://github.com/bradygaster/squad/tree/main/samples/azure-function-squad)

---

## Contributors

This release was shipped by the Squad core team:

- **@bradygaster** — Architecture, SDK builders, squad build command
- **@edie** (TypeScript + type safety) — Builder implementations, runtime validation
- **@mcmanus** (DevRel) — Documentation, sample walkthrough
- **@fenster** (Testing + reliability) — Test suite, round-trip validation

Thanks to community feedback from early SDK-First adopters.

---

## Links

- [GitHub Repository](https://github.com/bradygaster/squad)
- [SDK-First Mode Guide](../sdk-first-mode.md)
- [SDK Reference](../reference/sdk.md)
- [Azure Function Sample](../samples/azure-function-squad/)
- [Issue #194 (SDK-First Mode)](https://github.com/bradygaster/squad/issues/194)
- [Issue #213 (Azure Function Sample)](https://github.com/bradygaster/squad/issues/213)

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try SDK-First Mode →](../sdk-first-mode.md)_
