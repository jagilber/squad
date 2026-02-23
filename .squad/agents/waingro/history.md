# Waingro — History

## Project Context
- **Project:** Squad — programmable multi-agent runtime for GitHub Copilot
- **Owner:** Brady
- **Stack:** TypeScript (strict, ESM), Node.js ≥20, Ink 6 (React for CLI), Vitest
- **CLI entry:** packages/squad-cli/src/cli-entry.ts
- **Key concern:** Cross-platform (Windows + macOS + Linux), TTY and non-TTY modes

## Learnings

### 2026-02-23: Hostile QA — Issue #327
**Tested 32 adversarial scenarios across 7 hostile condition categories:**
- Tiny terminal (40x10): All 5 pass. CLI degrades gracefully at small sizes.
- Missing config: All 5 pass. CLI works without .squad/ directory for non-interactive commands.
- Invalid input: All 5 pass. Control chars, 10KB+ args, empty/whitespace args handled.
- Corrupt config: All 5 pass. Empty .squad/, empty team.md, invalid content, .squad-as-file all survive.
- Non-TTY pipe mode: All 4 pass. Version/help/status/error all work piped.
- UTF-8 edge cases: All 5 pass. Emoji, CJK, RTL, zero-width, mixed scripts all handled.
- Rapid input: All 3 pass. 5 concurrent, alternating, and parallel commands all stable.

**Bugs found:**
1. **BUG: `--version` output omits "squad" prefix.** `cli-entry.ts:48` says `console.log(\`squad ${VERSION}\`)` but actual output is bare `0.8.5.1`. The existing `version.feature` test also fails on this. Likely the VERSION import returns the number directly and `console.log` produces different output than expected, OR the build artifact differs.
2. **BUG: Empty/whitespace CLI args trigger interactive shell launch in non-TTY.** When `args[0]` is `""` or `"   "`, `cmd` is falsy, so `runShell()` is called. In non-TTY mode, Ink renders and exits with code 1. Should detect non-TTY and show help or error instead.
3. **Observation: Node.js rejects null bytes in spawn args** (`ERR_INVALID_ARG_VALUE`). This is Node-level, not a Squad bug, but the CLI should sanitize or reject args containing null bytes before they reach spawn.

**Key patterns:**
- Acceptance test step registration order matters — greedy regex `I run "(.+)"` in cli-steps matches before more-specific hostile patterns. Register specific patterns first.
- The nasty-inputs corpus at `test/acceptance/fixtures/nasty-inputs.ts` has 80+ adversarial strings for fuzz testing.
- Corrupt .squad/ configurations are handled gracefully — no crashes or unhandled exceptions observed.
