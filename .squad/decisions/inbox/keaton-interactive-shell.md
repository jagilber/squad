### 2026-02-21T21:00:00Z: Interactive Shell — Architectural Shift
**By:** Keaton (Lead), per bradygaster directive  
**What:** Squad becomes its own interactive CLI shell. `squad` with no args enters a REPL where users talk directly to the team. Copilot SDK is the LLM backend — Squad shells out to it for completions, not the other way around.

**Why:** 
- **Unreliable handoffs:** Copilot CLI's agent delegation is non-deterministic and invisible to users
- **Zero visibility:** Background agents run with no status indication — users have no mental model of what Squad is doing
- **UX mismatch:** Squad is building a coordination platform. The coordination UX is the product. Delegating UX to external tooling is an architectural mismatch.

**How:**
- Terminal UI with `ink` (React for CLIs) — agent status panel, message stream, input prompt as React components
- SDK session management: `SquadClientWithPool`, `StreamingPipeline.onDelta()` for streaming, tool dispatch via `SquadSessionConfig.tools`
- Agent spawning: Direct SDK session creation (no Copilot CLI), one session per agent tracked in registry
- Subcommand coexistence: `squad` enters shell, `squad init` / `squad watch` / etc. unchanged

**Impact:**
- This becomes Wave 0 (foundation) — blocks all other waves
- Wave 1 (npm distribution): Shell bundled in cli.js
- Wave 2 (SquadUI): Deferred until shell completes (SquadUI becomes frontend for shell)
- Wave 3 (public docs): Adjusted to explain shell as primary interface

**What stays:**
- squad.agent.md still works for Copilot-native users
- VS Code mode still works (runSubagent)
- All CLI subcommands unchanged
- Team state (.squad/) format unchanged

**Decisions needed:**
1. Terminal UI library: ink (recommended) vs. blessed / raw readline
2. Streaming: Event-driven (recommended) vs. polling
3. Session lifecycle: One per agent (recommended) vs. shared pool
4. Background cleanup: Explicit close (recommended) vs. timeout

**References:**
- Proposal: docs/proposals/squad-interactive-shell.md
- User directive: .squad/decisions/inbox/copilot-directive-2026-02-21T202535Z.md
- GitHub issue: #232 (Epic: Squad Interactive Shell — Own the Coordination UX)
