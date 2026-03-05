# Decision: Contributors Hall of Fame Format (Issue #210)

**Date:** 2026-03-07  
**Author:** McManus (DevRel)  
**Decision:** ACCEPTED — Contributors page format and release process integration  
**Status:** Complete

## Problem Statement

Brady requested a contributors page for issue #210 with this directive: "These contributors are THE Squad — we need to celebrate their work. EVERY release must include an updated contributors page."

The existing CONTRIBUTORS.md had a placeholder: "Coming soon: Hall of fame for all contributors."

## What We Decided

1. **Two-tier structure for CONTRIBUTORS.md:**
   - **Tier 1: The Squad roster** — All 20 members with roles and domains (full transparency on team structure)
   - **Tier 2: Release contributors** — Per-release section (v0.8.21, v0.8.22, etc.) listing what each agent shipped

2. **Format choices:**
   - Roster table: Name | Role | Domain (scannable, clear ownership)
   - Release section: Contributor | What They Shipped (concrete, celebratory, outcome-focused)
   - Plain language, no jargon—what did they *actually* ship?

3. **Release process integration:**
   - Added "Review and update CONTRIBUTORS.md with v0.X.X section" to docs/release-checklist.md
   - Placed in "Pre-Release Steps (All Releases)" — every release, no exceptions
   - Ensures Brady's requirement: "EVERY release includes an updated contributors page"

4. **Tone adherence:**
   - No hype ("superb," "incredible," "cutting-edge")
   - Real credits: "moved dashboard to standalone container, expanded test coverage from 18 to 45 tests"
   - Each claim sourced from actual work: git log + charter ownership mapping

## Why This Approach

1. **Celebrates the team without glossing over roles** — Roster shows breadth; release section shows depth
2. **Sustainable for releases** — Simple template (one table per release) fits into existing release workflow
3. **Tone ceiling maintained** — Celebratory format doesn't sacrifice clarity or honesty
4. **Sets future precedent** — v0.8.22+ releases can follow the same format (copy-paste friendly)
5. **Brady's directive honored** — Proceduralized: every release must update contributors

## Precedent

Similar pattern used in other docs:
- CHANGELOG.md links versions to outcomes (Breaking Changes → Added → Fixed)
- rock-paper-scissors README lists player strategies with emojis + descriptions
- CLI --help text describes commands with concrete outcomes, not marketing

## Future Maintenance

Each release:
1. Pull latest `dev`
2. Run `git --no-pager log v0.8.X..v0.8.(X+1)` to find contributors
3. Cross-reference charter.md files to map agents to contributions
4. Add new section to CONTRIBUTORS.md (copy template from v0.8.21)
5. Update release-checklist.md to check this off (procedural enforcement)

---

**Reviewed by:** (pending Keaton/Brady sign-off)  
**Merged by:** (Scribe will move to .squad/decisions.md after approval)
