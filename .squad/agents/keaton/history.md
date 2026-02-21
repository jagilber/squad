# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- Architecture patterns that compound — decisions that make future features easier
- Silent success mitigation lessons: ~7-10% of background spawns return no text, mitigated by RESPONSE ORDER block + filesystem checks
- Reviewer rejection lockout enforcement: if Keaton/Hockney/Baer rejects, original author is locked out
- Proposal-first workflow: docs/proposals/ before execution for meaningful changes
- 13 modules: adapter, agents, build, casting, cli, client, config, coordinator, hooks, marketplace, ralph, runtime, sharing, skills, tools
- Distribution: GitHub-native (npx github:bradygaster/squad), never npmjs.com
- v1 docs are internal only — no published docs site

### 2026-02-21: Interactive Shell Proposal
- **Problem:** Copilot CLI dependency creates unreliable handoffs, zero agent visibility, and external UX control
- **Solution:** Squad becomes its own REPL/shell — users launch `squad` with no args, enter interactive session
- **Architecture decision:** Copilot SDK as LLM backend (streaming, tool dispatch), Squad owns spawning + coordination UX
- **Terminal UI:** Recommend `ink` (React for CLIs) — battle-tested, component model, testable, cross-platform
- **No breaking changes:** All subcommands (init, watch, export) unchanged; squad.agent.md still works for Copilot-native users
- **Wave restructure:** This becomes Wave 0 (foundation) — blocks distribution (Wave 1), SquadUI (Wave 2), docs (Wave 3)
- **Key decisions needed:** ink vs. alternatives, session-per-agent vs. pooling, background cleanup strategy
- **File paths:** docs/proposals/squad-interactive-shell.md (proposal), GitHub issue #232 (epic tracking)
- **Pattern:** When product direction shifts, invalidate existing wave structure and rebuild from foundation
