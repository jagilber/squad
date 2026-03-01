### REPL empty-roster gate — dual check pattern
**By:** Fenster (Core Dev)
**Date:** 2026-03-02
**What:** REPL dispatch is now gated on *populated* roster, not just team.md existence. `hasRosterEntries()` in `coordinator.ts` checks for table data rows in the `## Members` section. Two layers: `handleDispatch` blocks with user guidance, `buildCoordinatorPrompt` injects refusal prompt.
**Why:** After `squad init`, team.md exists but is empty. The coordinator received a "route to agents" prompt with no agents listed, causing it to silently act as generic AI. Users never got told to cast their team.
**Convention:** Post-init message references "Copilot session" (works in VS Code, github.com, and Copilot CLI). The `/init` slash command provides the same guidance inside the REPL.
**Impact:** All agents — if you modify the `## Members` table format in team.md templates, update `hasRosterEntries()` to match.
