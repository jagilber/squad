# Honest Roster Assessment — 2026-03-12

**By:** Keaton (Lead)  
**Requested by:** Brady  
**Context:** Recent test discipline failures (v0.8.21-0.8.23 API changes without test updates, docs files breaking CI) + community requests for CFO and Product Strategist roles.

---

## Executive Summary

**The team is too big.** We have 24 active agents, many of whom ship excellent work — but when 24 people are responsible, nobody is responsible. The test failures aren't talent gaps; they're diffusion of responsibility. We don't need MORE roles. We need CLEARER ownership and HARDER gates.

**Recommendation:** Consolidate roles, strengthen process gates, add ONE new role (Quality Owner), defer CFO/Strategist requests.

---

## 1. Current Roster Assessment

### ✅ **Core Value Agents — Keep, No Changes**

These agents are essential, active, and non-redundant:

- **Keaton (Lead)** — Architecture decisions, trade-offs, scope control. Active across every sprint. Earning keep.
- **Verbal (Prompt Engineer)** — Coordinator logic, prompt architecture. Core infrastructure. Active and specialized.
- **Fenster (Core Dev)** — Runtime, casting, CLI, spawning. High-value contributor. Active on nearly every feature.
- **Edie (TypeScript Engineer)** — Type system, SDK builders, ESM module patterns. Specialized expertise. Active.
- **Kujan (SDK Expert)** — SDK architecture, OTel integration, library patterns. Deep domain knowledge. Active.
- **Fortier (Node.js Runtime)** — EventBus, async patterns, ESM/CJS decisions. Runtime owner. Active.
- **Trejo (Release Manager)** — Version decisions, release timing, CHANGELOG. Owns release process. Active.
- **Drucker (CI/CD Engineer)** — GitHub Actions, validation gates, publish pipeline. Critical after v0.8.22 disaster. Active.
- **Baer (Security)** — Secret guardrails, PII hooks, auth patterns. Security is non-negotiable. Active.
- **McManus (DevRel)** — Docs, community engagement, tone ceiling enforcement. Docs are a strength. Active.
- **Scribe (Session Logger)** — Decision merging, memory management. Silent infrastructure. Active.

**Status:** 11 agents. All critical, non-redundant, highly active.

---

### 🟡 **Specialized Technical Agents — Keep With Caveat**

These agents have clear domains but could be more active or better integrated:

- **Rabin (Distribution)** — npm packaging, monorepo, distribution strategy. Specialized. Active during distribution changes, dormant otherwise. **Verdict:** Keep. Distribution is complex enough to warrant dedicated ownership.

- **Kovash (REPL & Interactive Shell)** — Shell UX, input handling, readline patterns. Specialized. Active during REPL work (v0.8.22, v0.8.23). **Verdict:** Keep. REPL is a core UX feature.

- **Strausz (VS Code Extension)** — Extension architecture, webview integration. Specialized but dormant since beta. **Verdict:** Keep BUT audit activity. If no extension work in next 2 releases, move to alumni.

- **Saul (Aspire & Observability)** — OTel telemetry, Aspire integration, metrics. Specialized. Active on observability features. **Verdict:** Keep. Observability is a product differentiator.

- **Fortier (Node.js Runtime)** — Already listed above. Confirmed keep.

**Status:** 4 agents. Specialized but justified. Watch Strausz for activity.

---

### 🟠 **Design/UX Agents — Redundancy Risk**

Three agents own overlapping "design" domains:

- **Redfoot (Graphic Designer)** — ASCII art, banner design, visual identity. Specialized but limited scope. Activity: Low.
- **Marquez (CLI UX Designer)** — CLI command patterns, help text, error messages. UX authority. Activity: Medium.
- **Cheritto (TUI Engineer)** — Terminal rendering, ink components, layout. Implementation. Activity: Medium.

**Problem:** Redfoot's scope is narrow (ASCII art). Marquez and Cheritto overlap on CLI UX.

**Recommendation:**
- **Merge Redfoot → Marquez.** Marquez owns CLI UX AND visual design (banners, help text, error formatting). Cheritto implements Marquez's designs in ink/TUI code.
- **Role split:** Marquez = UX design (what/why), Cheritto = TUI implementation (how).
- **Rationale:** ASCII art doesn't justify a dedicated agent. Marquez already owns CLI UX; adding visual design is natural. Cheritto focuses on technical rendering, not design decisions.

**Status:** 3 agents → 2 agents. Consolidate Redfoot into Marquez.

---

### 🔴 **Test/Quality Agents — Ownership Gap**

Four agents touch testing:

- **Hockney (Tester)** — Unit tests, coverage, edge cases, vitest config. Active. High-value.
- **Breedan (E2E Test Engineer)** — End-to-end scenarios, TerminalHarness, acceptance tests. Active. Specialized.
- **Waingro (Product Dogfooder)** — Adversarial testing, hostile inputs, Gherkin scenarios. Active during hostile testing sprint. Dormant otherwise.
- **Nate (Accessibility Reviewer)** — Accessibility, screen reader compat, keyboard nav. Specialized. Activity: Low.

**The test discipline failure:**
- Fenster/Hockney changed APIs during v0.8.21-0.8.23 without updating test count assertions.
- @copilot added docs files (contributors.md, contributing.md) without updating `EXPECTED_GUIDES` in `docs-build.test.ts`.
- Result: 23 test failures blocked external contributor Tamir's PR #279.

**Root cause analysis:**
- **NOT a talent gap.** Hockney is excellent. Breedan is excellent. Tests exist.
- **Process gap:** No enforced gate that says "if you change an API or add a file counted by tests, you MUST update tests in the same commit."
- **Ownership diffusion:** Hockney owns test coverage. Breedan owns E2E. Waingro owns adversarial. Nobody owns "integration between tests and code changes."

**The roster gap:** We lack a **Quality Owner** — someone who reviews PRs for test discipline, enforces "API change = test update" as a hard gate, and catches stale assertions BEFORE they break CI for contributors.

**Recommendation:**
- **Promote Hockney → Quality Owner.** Expand charter: owns test coverage AND test discipline enforcement. Reviews PRs for test impacts. Blocks PRs that change APIs without test updates.
- **Merge Waingro → Hockney.** Adversarial testing becomes part of Hockney's quality ownership. Hostile scenarios are edge cases, which Hockney already owns.
- **Keep Breedan.** E2E is specialized (TerminalHarness, Playwright, acceptance tests). Non-redundant with Hockney's unit/integration focus.
- **Defer Nate.** Accessibility is important but not blocking right now. Move to alumni; spawn on-demand for a11y audits.

**Status:** 4 agents → 2 agents (Hockney as Quality Owner, Breedan as E2E). Add **hard gate** to Hockney's charter: "API changes without test updates = PR blocked."

---

### 🔴 **Missing Role: Integration/Quality Owner**

**Should we add a dedicated integration owner?**

**Answer:** No. Promoting Hockney to Quality Owner solves this. The problem isn't lack of a role; it's lack of enforcement. Hockney already has the expertise. Expand the charter, give him the authority to block PRs, and make test discipline a GATE (not a suggestion).

---

## 2. Recent Failures Root Cause

**Failures:**
1. Fenster/Hockney changed APIs (v0.8.21-0.8.23) without updating test count assertions (`EXPECTED_GUIDES`, CLI error messages).
2. @copilot added docs files without updating `docs-build.test.ts` expectations.
3. 23 test failures blocked contributor Tamir's PR #279.

**Root Cause:**
- **Roster gap?** No. Hockney owns tests. Fenster knows to update tests (his charter says so). @copilot has test discipline in its charter.
- **Process gap?** YES. No automated enforcement. No PR review gate. Agents "know" the rule but skip it under time pressure or oversight.

**What we need:**
1. **Automated gate:** CI checks for stale test assertions (e.g., `docs-build.test.ts` counts files on disk; fail if counts mismatch).
2. **Human gate:** Hockney (as Quality Owner) reviews EVERY PR for test impacts. Blocks merges that violate test discipline.
3. **Harder charter rules:** Fenster's charter says "update tests in the SAME commit." Make this a BLOCKER, not a suggestion. Hockney enforces it.

**Recommendation:**
- **Process change:** Hockney becomes Quality Owner with authority to block PRs for test discipline violations.
- **Automation:** Drucker adds CI check: "Verify test count assertions match disk reality."
- **Charter update:** Fenster, Edie, Fortier, all code-writing agents get a new rule: "Test updates are NOT optional. Quality Owner (Hockney) blocks PRs that skip this."

**Not a roster gap. It's a gates-and-enforcement gap.**

---

## 3. Missing Roles — Community Requests

### **CFO / Financial Agent (Issue #157, @dfberry)**

**Request:** "Add a CFO or accountant to squads to report on team cost per squad member."

**Analysis:**
- **What would a CFO actually DO?** Track token usage per agent, estimate costs, report budget burn, warn when usage exceeds thresholds.
- **Is this a day-one need?** No. Squad is open-source. Cost tracking matters for enterprise customers, not for the core team or OSS users.
- **Implementation path:** This is a FEATURE (cost tracking SDK hook, telemetry, reporting dashboard), not a ROLE. If we ship cost tracking, Kujan (SDK Expert) or Saul (Observability) can own it. We don't need a dedicated agent sitting idle until someone asks for a cost report.

**Recommendation:**
- **Defer.** File issue: "Feature: Cost tracking and budget reporting." Tag it for v0.9.x or enterprise tier.
- **Rationale:** We don't add agents speculatively. Add them when there's sustained work. Cost tracking isn't blocking any current roadmap item.
- **When to revisit:** If enterprise customers demand cost dashboards, or if Squad Cloud launches and we need usage-based billing. Then spawn a cost/budget agent on-demand.

---

### **Product Strategist (Brady's mention)**

**Request:** "Product Vision / Strategist agent for long-term roadmap and feature prioritization."

**Analysis:**
- **How does this differ from Keaton (Lead)?** Keaton already owns product direction, architectural decisions, scope analysis, and trade-offs. That's literally the Lead charter.
- **What would a Strategist ADD?** Market research? Competitive analysis? Customer interviews? Go-to-market planning?
- **Is that work happening now?** No. Brady owns product vision. Keaton translates vision into architecture. McManus (DevRel) handles community feedback and docs. We already have a "strategy layer."

**Recommendation:**
- **Defer.** This is a solution looking for a problem.
- **Rationale:** If Squad were a 50-person company, yes, a Product Strategist makes sense. But Squad is a 24-agent open-source project. Keaton + Brady + McManus already cover strategy, architecture, and community. Adding a Strategist creates role confusion ("Who decides scope? Keaton or the Strategist?").
- **When to revisit:** If Brady says "I need someone to own customer research and competitive analysis," spawn a Research/Strategy agent. But right now, that work isn't happening (and doesn't need to happen).

---

### **Other Missing Roles?**

**Security Auditor?** No. Baer owns security. If we need external audits, hire a consultant.

**Performance Engineer?** Maybe. If we hit performance bottlenecks (latency, memory leaks, throughput), spawn a Perf agent on-demand. Not needed now.

**Support/Community Manager?** No. McManus owns DevRel and community engagement. Ralph monitors work queues. We're covered.

**Documentation Specialist?** No. McManus owns docs. Cheritto owns docs site tooling. We're good.

**None of these are blocking gaps.**

---

## 4. Roles to Retire/Consolidate

### **Retire (Move to Alumni):**

1. **Nate (Accessibility Reviewer)** — Specialized, low activity, not blocking current work. Move to alumni. Spawn on-demand for a11y audits (screen reader compat, WCAG compliance).

2. **Soze (if exists)** — No charter found. If this is a placeholder or deprecated role, remove it.

### **Consolidate:**

1. **Redfoot → Marquez** — Merge graphic design (ASCII art, banners) into CLI UX Designer. Marquez now owns all CLI visual design. Cheritto implements designs.

2. **Waingro → Hockney** — Merge adversarial testing into Hockney's Quality Owner charter. Hostile scenarios = edge cases. Hockney already owns edge case discovery.

### **Expand (Not Add):**

1. **Hockney → Quality Owner** — Expand charter to include test discipline enforcement, PR review for test impacts, and blocking authority for test violations. This is a promotion, not a new role.

---

## 5. Final Recommendation — The Action List

### **Consolidate: 3 roles merged**
1. **Retire Nate** → Move to alumni, spawn on-demand.
2. **Merge Redfoot → Marquez** → Marquez owns CLI UX + visual design. Cheritto implements.
3. **Merge Waingro → Hockney** → Hockney owns adversarial testing as part of Quality ownership.

### **Expand: 1 role promoted**
4. **Promote Hockney → Quality Owner** — Test coverage + test discipline enforcement + PR review authority.

### **Add: 0 new roles**
- **No CFO.** Defer to v0.9.x feature request (cost tracking SDK).
- **No Product Strategist.** Keaton + Brady + McManus already own this.

### **Strengthen: Process gates (not roster)**
5. **Drucker:** Add CI check for stale test assertions (e.g., `docs-build.test.ts` counts must match disk).
6. **Hockney (Quality Owner):** Reviews every PR for test discipline. Blocks merges that skip test updates.
7. **Fenster/Edie/Fortier/all code agents:** Charter update: "Test updates are MANDATORY. Quality Owner blocks PRs that skip this."

### **Net Roster Change:**
- **Before:** 24 active agents.
- **After:** 21 active agents (24 - 3 retirements/merges).
- **Leaner, clearer ownership, harder gates.**

---

## Why This Works

**The test failures weren't caused by lack of people.** They were caused by diffusion of responsibility. When 24 people are responsible for quality, nobody feels responsible. When Hockney (Quality Owner) has blocking authority and a mandate to enforce test discipline, responsibility is clear.

**We don't need a CFO.** We need cost tracking as a feature. If enterprise customers demand it, we'll build it. Until then, it's speculative headcount.

**We don't need a Product Strategist.** Keaton already owns this. Adding a Strategist creates overlap and confusion.

**We DO need consolidation.** Three design roles → two. Four test roles → two. Clearer ownership, less hand-off friction, more accountability.

**The team will be smaller, sharper, and more effective.**

---

## Next Steps

1. **Brady approves or rejects this assessment.**
2. If approved:
   - Scribe updates `team.md` with consolidated roster.
   - Hockney's charter expanded to Quality Owner.
   - Drucker adds CI check for stale assertions.
   - Fenster/Edie/Fortier charters updated with mandatory test discipline.
   - Nate, Redfoot, Waingro charters moved to `.squad/agents/_alumni/`.
3. If rejected, Brady tells me why and I revise.

**No politics. No protecting headcount. Just honest assessment: what makes the team effective.**

— Keaton
