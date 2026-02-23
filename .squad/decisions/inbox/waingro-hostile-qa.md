# Decision: Hostile QA Bug Catalog — Issue #327

**By:** Waingro
**Date:** 2026-02-23
**Status:** Reported — awaiting triage

## Bugs Found

### BUG-1: `--version` output omits "squad" prefix (P1)
- **Location:** `packages/squad-cli/src/cli-entry.ts:48`
- **Expected:** `squad 0.8.5.1`
- **Actual:** `0.8.5.1`
- **Impact:** Existing `version.feature` acceptance test fails. Scripts parsing version output may break.
- **Repro:** `node packages/squad-cli/dist/cli-entry.js --version`

### BUG-2: Empty/whitespace args launch interactive shell in non-TTY (P2)
- **Location:** `packages/squad-cli/src/cli-entry.ts:102`
- **Expected:** Detect non-TTY and show help or error
- **Actual:** Launches Ink shell which fails with exit code 1
- **Repro:** `echo "" | node packages/squad-cli/dist/cli-entry.js ""`
- **Suggested fix:** Check `process.stdout.isTTY` before calling `runShell()`. If non-TTY and no args, print help.

## Observations (non-bugs)

- Node.js rejects null bytes in spawn args at the platform level. Not a Squad bug, but CLI could sanitize.
- All corrupt config scenarios handled gracefully — no crashes.
- All unicode edge cases (emoji, CJK, RTL, zero-width, mixed scripts) pass cleanly.
- Concurrent command execution is stable (5 parallel processes).
- Tiny terminal (40x10) works for all non-interactive commands.

## Test Coverage Added
- 32 hostile QA Gherkin scenarios across 7 feature files
- 80+ adversarial string corpus in `test/acceptance/fixtures/nasty-inputs.ts`
- Step definitions in `test/acceptance/steps/hostile-steps.ts`
