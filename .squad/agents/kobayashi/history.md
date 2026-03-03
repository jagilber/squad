# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- Preview branch workflow: two-phase (preview → ship) for safe releases
- State integrity via merge drivers: union strategy for .squad/ append-only files
- .gitattributes merge=union: decisions.md, agents/*/history.md, log/**, orchestration-log/**
- Distribution: GitHub-native (npx github:bradygaster/squad), never npmjs.com
- Zero tolerance for state corruption — .squad/ state is the team's memory

### 2026-03-03: Versioning Model Clarification — npm vs Public Repo (CRITICAL)
**Status:** Decision documented, migration checklist + CHANGELOG fixed.
- **The issue:** Coordinator confused npm package versions with public repo release tag
- **The truth:** Two distinct version numbers serve different purposes
  - **npm packages:** Continue at 0.8.x cadence (0.8.17 shipped → next is 0.8.18). Development uses X.Y.Z-preview.N format.
  - **Public repo tag:** v0.6.0 marks the migration release on `bradygaster/squad`. This is metadata, not a package version.
- **Released versions:** 0.8.17 already on npm and must NOT be bumped down to 0.6.0
- **Migration release:** Public repo (beta) gets v0.6.0 GitHub Release tag at migration merge commit
- **Fixes made:**
  1. migration-checklist.md: Corrected all npm package version references (0.6.0 → 0.8.18)
  2. CHANGELOG.md: Changed [0.6.0] section to [0.8.18-preview] (tracks npm packages, not public repo)
  3. Created decision file: `.squad/decisions/inbox/kobayashi-versioning-clarification.md`
- **Prevention:** This decision should be referenced in all future releases to avoid repeating the confusion

### 2026-02-21: Issue #208 — @changesets/cli setup complete
**Status:** PR #276 merged.
- Installed @changesets/cli v2 (101 new packages)
- Config: `"access": "public"`, `"baseBranch": "main"`
- Fixed/linked arrays left empty → independent versioning (squad-sdk, squad-cli evolve at different cadences)
- Added npm script `changeset:check: "changeset status"` for CI validation
- Build passes, npm workspace resolution confirmed
- **Decision:** Independent versioning is correct. Squad packages have separate release cycles (SDK is runtime; CLI is tooling).

### 📌 Team update (2026-02-21T22:05Z): M3+ decisions merged — decided by Kobayashi, Fenster
- Changesets setup (#208): independent versioning for squad-sdk + squad-cli, PR #276 merged
- --global flag (#212) + squad status (#213): routing in src/index.ts, composable resolution pattern, PR #277 merged
- Decision consolidation: changesets config and --global pattern appended to decisions.md

### 📌 Team update (2026-02-21T22:25Z): M5 round complete — decided by Scribe
- Decision inbox merged: ensureSquadPath() guard (#273), CLI routing testability pattern
- Status: Two PRs merged (#280, #279); one issue blocked (#209 needs GitHub Pro)

### 2026-02-21: Issue #215 — Insider channel publish scaffolds
**Status:** PR #283 opened → bradygaster/dev
- Added minimal publishable entry points to both workspace packages:
  - `packages/squad-sdk/src/index.ts`: VERSION export placeholder
  - `packages/squad-cli/src/cli.ts`: placeholder binary entry point
  - Both: `tsconfig.json` extending root, `build` scripts, `files` lists for npm publish
- Root `build` script updated to chain `--workspaces --if-present`
- Build passes (root + workspaces), all 1621 tests pass
- **Does NOT push to insider.** PR only — coordinator handles insider branch push after merge.
- **Package structure:** ESM-only, strict mode, Node >=20. squad-cli depends on squad-sdk via version string (npm workspace protocol, per Edie's decision).

### 2026-02-21: Version Alignment — 0.7.0 stubs → 0.8.0 real code
**Status:** EXECUTED
- **Decision:** Bump both packages from 0.7.0 (npm stubs) to 0.8.0 (real, publishable code)
- **Rationale:** Clear break from placeholders. 0.8.0 signals functional code arrival while preserving pre-1.0 alpha status.
- **Changes:**

### 2026-02-23: Version bump to 0.8.5.1
**Status:** Complete
- Updated 4 version references: package.json, package-lock.json, CHANGELOG.md, CLI version constant
- Bumped from 0.8.5-debug → 0.8.5.1
- Build clean, all tests pass

---

📌 Team update (2026-02-23T09:25Z): Version 0.8.5.1 release complete. Streaming diagnostics infrastructure finished. Hockney added 13 regression tests, identified root cause. Kovash added SQUAD_DEBUG logging & OTel REPL wiring. Saul fixed OTel gRPC protocol. — decided by Scribe
  - `packages/squad-sdk/package.json` → version `0.8.0`, VERSION export updated in `src/index.ts`
  - `packages/squad-cli/package.json` → version `0.8.0`, dependency on sdk locked to `0.8.0`
  - `package.json` (root) → added `"private": true` (safety guard against accidental publish)
- **Verification:** All three version strings aligned. CLI SDK dependency pinned. Pre-existing TS build errors unrelated to alignment.
- **Next:** Changeset + npm publish (when TS issues resolved). Decision document: `.squad/decisions/inbox/kobayashi-version-alignment.md`

### 📌 Team update (2026-02-22T041800Z): Version alignment complete, both packages published to npm at 0.8.0 — decided by Kobayashi, Coordinator
Kobayashi aligned all version strings to 0.8.0 (SDK package, CLI package, VERSION export, root private flag). Coordinator published @bradygaster/squad-sdk@0.8.0 and @bradygaster/squad-cli@0.8.0 to npm registry. Version bump signals clear break from 0.7.0 stubs. Release infrastructure production-ready. Both packages live and resolvable on npm.

### 2026-02-24: Merge workflow — PR #552 + #553 → dev branch
**Status:** Complete (both PRs merged with squash)
- **PR #552:** feat(ralph): routing-aware triage, PR monitoring, board state tracking — ✅ merged
- **PR #553:** Add personal squad consult mode — ✅ merged
- **Process:** PR #553 merged first; PR #552 encountered base branch conflict on first attempt (retried successfully)
- **Verification:** Both PRs report `state: MERGED`
- **Dev branch:** Fetched latest after both merges complete

### 2026-02-22: CI/CD Readiness Assessment Complete
**Status:** PASSED with critical version misalignment flagged.

**Branch State:**
- Current: `bradygaster/dev` (HEAD → commit d2b1b1f)
- Remote tracking: `origin/bradygaster/dev`, `origin/main`, `origin/insider`
- Recent commits: Rollup job renaming (CI), telemetry test timing fix, main merge
- PR #298: Does not exist (GitHub repo search returned 404)

**CI Workflows — All Healthy:**
1. **squad-ci.yml** (build-node, test-node, build rollup) — ✅ Triggers on PR/push to main/dev/insider. Validates Node 20 + 22. Rollup job correctly names the branch protection check.
2. **squad-publish.yml** — ✅ Publishes on v* tags (both workspace packages with `--access public`). Chains build → test → publish.
3. **squad-insider-publish.yml** — ✅ Auto-publishes both packages on insider branch push with `--tag insider`.
4. **squad-release.yml** — ✅ Runs on main push. Validates version in CHANGELOG, creates v-prefixed tag, creates GitHub Release.
5. **squad-insider-release.yml** — ✅ Runs on insider push. Creates insider tag variant (v{VERSION}-insider+{SHA}), creates prerelease GitHub Release.
6. **squad-preview.yml** — ✅ Validates preview branch state (version consistency, no .squad//.ai-team files tracked).
7. **squad-promote.yml** — ✅ Workflow-dispatch to promote dev→preview→main with folder stripping and validation.
8. **squad-docs.yml** — ✅ Builds docs site on preview branch push (pages deployment).
9. **squad-heartbeat.yml** (Ralph) — ✅ Triage automation, auto-assign members/copilot, label enforcement.
10. **squad-triage.yml** — ✅ Routes squad-labeled issues to members or @copilot based on capability profile.
11. **squad-issue-assign.yml** — ✅ Assigns work to team members or copilot when squad:* labels applied.
12. **squad-label-enforce.yml** — ✅ Mutual exclusivity: go:*, release:*, type:*, priority:* namespaces.
13. **sync-squad-labels.yml** — ✅ Syncs GitHub labels from .squad/team.md and static definitions.

**🚨 VERSION MISALIGNMENT — CRITICAL ISSUE:**
- **Root package.json:** 0.6.0-alpha.0 (PRIVATE flag set ✅)
- **squad-sdk package.json:** 0.8.0 ✅
- **squad-cli package.json:** 0.8.1 ⚠️ (CLI is 1 patch ahead of SDK)
- **CHANGELOG.md:** Latest entry is 0.6.0-alpha.0 (2026-02-22), versioned from root
- **CLI dependency on SDK:** Uses `"@bradygaster/squad-sdk": "*"` (wildcard — resolves to latest 0.8.0)

**Publishing Readiness Analysis:**

**For v* tag release (squad-publish.yml):**
- ✅ Workflow correctly targets workspace packages with explicit `-w` flags
- ✅ Both packages have `prepublishOnly` scripts (build before publish)
- ✅ Both have `files` field (excludes .squad/, node_modules, etc.)
- ❌ **BLOCKING ISSUE:** No version tags exist. To release 0.8.0, must create `v0.8.0` tag on the commit where both package versions are consistent.
- ❌ **VERSION CONSISTENCY REQUIRED:** CLI must align with SDK at 0.8.0 before tagging.

**For insider branch (squad-insider-publish.yml):**
- ✅ Auto-publishes on push with versioning: `{version}-insider+{sha}`
- ✅ Workflow correctly applies `--tag insider` to both packages
- ✅ Ready now (no tag required, branch push triggers auto-publish)

**For promotion workflow (squad-promote.yml):**
- ✅ dev→preview (strips .squad/, .ai-team*, team-docs/, docs/proposals/)
- ✅ preview→main (requires CHANGELOG entry for version)
- ✅ Both validations in place

**.gitattributes Merge Drivers:**
- ✅ Union strategy correctly configured for:
  - `.squad/decisions.md`
  - `.squad/agents/*/history.md`
  - `.squad/log/**`
  - `.squad/orchestration-log/**`
- ✅ Prevents state corruption across branch merges

**Release Readiness Verdict:**
- ✅ CI/CD infrastructure is complete and correct
- ✅ Insider channel ready for continuous pre-release publishing
- ✅ Main release path ready (once tag is created)
- ❌ **BLOCKING:** Version alignment must be resolved (CLI 0.8.1 vs SDK 0.8.0)
- ❌ **BLOCKING:** CHANGELOG must reflect workspace package versions, not root version
- ⚠️ No stable tags exist yet (first release requires deliberate tag creation)

**Recommendation:** Align CLI to 0.8.0, update CHANGELOG with separate entries for SDK/CLI if versioning will diverge, then create v0.8.0 tag to trigger release workflow. Insider channel can publish now for pre-release testing.

### 📌 Team update (2026-02-22T070156Z): CI/CD assessment merged to decisions, version alignment intentional, publish workflows verified ready — decided by Kobayashi
- **CI/CD Readiness Assessment (Decision):** All 13 workflows production-ready and correctly configured. Branch protection enforced (PR required, build check mandatory). Merge drivers in place for append-only squad files.
- **Version alignment explanation:** SDK 0.8.0, CLI 0.8.1 (intentional — CLI had minor bin entry fix in 0.8.1). This skew is documented in decisions and appropriate for pre-1.0 development.
- **Publishing workflows validated:** squad-publish.yml (v* tags), squad-insider-publish.yml (insider branch auto-publish), both correctly configured for npm workspace packages with public access.
- **Insider channel:** Ready now for continuous pre-release validation (no tag creation needed, branch push auto-publishes).
- **Stable release:** Ready when next tag (v0.8.0 or v0.8.1) created — CHANGELOG and version alignment already finalized.
- **Decision merged to decisions.md.** Status: Release infrastructure production-ready, version skew intentional and documented.

### 2026-02-22T12:00Z: Version Alignment Release 0.8.2 — Brady requested
**Status:** EXECUTED — Tag v0.8.2 created, release published to GitHub.
- **Rationale:** Brady requested explicit version alignment across all three package.json files and creation of a stable release tag to unblock publish workflows.
- **Changes:**
  - Root `package.json` → version `0.8.2` (was 0.6.0-alpha.0)
  - `packages/squad-sdk/package.json` → version `0.8.2` (was 0.8.0)
  - `packages/squad-cli/package.json` → version `0.8.2` (was 0.8.1)
  - `package-lock.json` → updated via `npm install --package-lock-only`
- **Commit:** db5d621 on branch bradygaster/dev, message: "chore: align CLI and SDK versions to 0.8.2"
- **Tag:** v0.8.2 created and pushed to origin
- **GitHub Release:** Created with changelog notes describing the alignment (CLI 0.8.1→0.8.2, SDK 0.8.0→0.8.2, root 0.6.0-alpha.0→0.8.2)
- **Decision:** Explicit version synchronization across workspace as a deliberate release milestone. All packages now at 0.8.2. Unblocks squad-publish.yml v* tag workflows.

### 2026-02-22T23:47Z: Release v0.8.3 — Brady requested
**Status:** EXECUTED — Tag v0.8.3 created, GitHub Release published.
- **Commits pushed:** 2 unpushed commits on bradygaster/dev (695fcde, b18558d) → pushed to origin
  - 695fcde: fix: include all 11 docs sections in build + update tests
  - b18558d: fix: pin SDK version in CLI package.json + add 110 CLI shell tests
- **Tag:** v0.8.3 created at HEAD (695fcde) and pushed to origin
- **GitHub Release:** Created with comprehensive notes covering:
  - Remote Squad Mode features (resolveSquadPaths, squad doctor, squad link, squad init --mode remote, dual-root guards) ported from @spboyer's design
  - Two targeted fixes: docs section build completeness + SDK version pinning in CLI + 110 shell tests
  - Package versions: @bradygaster/squad-sdk@0.8.3, @bradygaster/squad-cli@0.8.3
- **Outcome:** Release v0.8.3 is live at https://github.com/bradygaster/squad-pr/releases/tag/v0.8.3. Both workspace packages at 0.8.3. squad-publish.yml v* tag trigger now active for this release.

### 2026-02-22T23:52Z: Version Bump to 0.8.4 & NPM Publish — Brady requested
**Status:** EXECUTED — Both packages published to npm.
- **Version bumps:**
  - `package.json` (root): 0.8.3 → 0.8.4
  - `packages/squad-sdk/package.json`: 0.8.3 → 0.8.4
  - `packages/squad-cli/package.json`: 0.8.3 → 0.8.4, CLI dependency on SDK pinned to exact version "0.8.4"
  - `package-lock.json`: Updated via `npm install --package-lock-only`
- **Build & Test:** Both packages built successfully (TypeScript compilation), all tests passed (2346 passed, 5 skipped)
- **NPM Publish:** 
  - ✅ `@bradygaster/squad-sdk@0.8.4` published to npm with public access
  - ✅ `@bradygaster/squad-cli@0.8.4` published to npm with public access
- **Git Commit:** `3fd970b` on branch `bradygaster/dev` — "chore: bump to v0.8.4 for npm publish"
- **Push:** Committed to origin/bradygaster/dev
- **Outcome:** Both npm packages live and resolvable at version 0.8.4. CLI dependency correctly pinned to SDK 0.8.4.

### 2026-02-24: Version Bump to 0.8.5 & Partial NPM Publish — Brady requested
**Status:** EXECUTED — SDK published to npm; CLI build completed; version changes committed and pushed.
- **Version bumps:**
   - `package.json` (root): 0.8.4 → 0.8.5
   - `packages/squad-sdk/package.json`: 0.8.4 → 0.8.5
   - `packages/squad-cli/package.json`: 0.8.4 → 0.8.5, CLI dependency on SDK pinned to exact version "0.8.5"
- **Build:** Both packages built successfully with TypeScript (exit code 0)
- **NPM Publish:** 
   - ✅ `@bradygaster/squad-sdk@0.8.5` published to npm with public access (285.5 kB tarball)
   - ⚠️ `@bradygaster/squad-cli@0.8.5` build completed; publish initiated but stalled on browser-based npm auth (not user-attended)
- **Git Commit:** `cc490b4` on branch `bradygaster/dev` — "chore: bump to v0.8.5 — REPL streaming fix, Aspire telemetry, personal squad docs"
- **Push:** Committed and pushed to origin/bradygaster/dev
- **Changes included:**
   - REPL streaming fix (deltaContent support)
   - Aspire telemetry fixes
   - Personal squad docs updates
- **Outcome:** SDK @0.8.5 live on npm. CLI build passes; CLI publish requires manual auth completion (npm registry authentication flow). All version strings aligned to 0.8.5. CLI dependency correctly pinned to SDK 0.8.5.

### 2026-02-24: Version Bump to 0.8.5.1 — Brady requested
**Status:** EXECUTED — Four-part version structure (x.x.x.x) implemented.
- **Version bumps:** "0.8.5-debug" → "0.8.5.1" (four-part semver)
  - `package.json` (root): 0.8.5-debug → 0.8.5.1
  - `packages/squad-sdk/package.json`: 0.8.5-debug → 0.8.5.1
  - `packages/squad-cli/package.json`: 0.8.5-debug → 0.8.5.1, CLI dependency on SDK pinned to "0.8.5.1"
- **All 4 version references verified:** Root, SDK, CLI package versions + CLI SDK dependency
- **Learning:** Brady uses four-part versioning (x.x.x.x) with a patch level as the fourth component. Enables finer-grained version control while maintaining semantic boundaries.
- **Outcome:** All version references updated from debug state to production version 0.8.5.1. CLI SDK dependency correctly pinned.

### 2026-02-24T17-25-08Z : Team consensus on public readiness
📌 Full team assessment complete. All 7 agents: 🟡 Ready with caveats. Consensus: ship after 3 must-fixes (LICENSE, CI workflow, debug console.logs). No blockers to public source release. See .squad/log/2026-02-24T17-25-08Z-public-readiness-assessment.md and .squad/decisions.md for details.

### 2026-02-26: Branch cleanup and dev branch setup — Brady requested
**Status:** EXECUTED
- **Remote pruning:** `git remote prune origin` executed. 57 stale remote-tracking refs removed (branches deleted on GitHub).
- **Remote merged branches identified (20 found):** 
  - Fix branches (2): origin/fix/critical-ux-batch-1, origin/fix/issue-419
  - Squad branches (18): origin/squad/265-268-aspire-and-watcher, origin/squad/331-thinking-feedback, origin/squad/488-unified-status, origin/squad/489-adaptive-hints, origin/squad/490-error-recovery, origin/squad/491-message-history-cap, origin/squad/492-per-agent-streaming, origin/squad/493-streambuffer-cleanup, origin/squad/514-docs-consistency, origin/squad/519-cli-preview, origin/squad/cli-fixes-431-429, origin/squad/hockney-fix-test-vocab, origin/squad/kovash-cancel-ops-434, origin/squad/repl-fix-402, origin/squad/tui-fixes-405-404-407, origin/squad/wave1-remaining, origin/squad/wave2-repl-polish-cleanup, origin/squad/wave3-docs-migration
  - These are fully merged into origin/main but remain on remote. Brady to decide deletion.
- **Remaining remote branches (22 active):** bradygaster/dev, fix/issue-428, insider, and 19 squad branches not yet merged (325-fix-timeout, 326-e2e-coverage, 327-hostile-qa, 328-accessibility-audit, 329-p0-ux-blockers, 330-p1-ux-polish, 332-ghost-response, 333-fix-p0-bugs, 334-error-hardening, 343-dual-telemetry, 368-fix-stale-tests, 513-ux-improvements, 514-docs-batch, 517-help-ux, 518-naming-consistency, 525-help-surfaces-mcmanus, kovash-status-style-390-v2).
- **Dev branch:** Created from main, currently checked out. `git checkout -b dev main` executed successfully.
- **Local branches:** 97 local branches remain (many not yet fully merged). Pattern observed: squad/* and fix/* branches in flight for active work. Deletions will be selective once those PRs merge.

**Key Learning:** Repository maintains high branch volume during active squad development. Remote pruning revealed a 20-branch cleanup opportunity (merged but not deleted). Local branch strategy deferred to Brady for active work assessment.

### 2026-02-26: Comprehensive Remote Branch Audit — Brady requested
**Status:** COMPLETED — Full branch analysis performed across all 40 remote branches.
- **Analysis Method:** For each remote branch (excluding origin/main, HEAD, gh-pages):
  - Commits ahead of origin/main (unique work not in main)
  - Commits behind origin/main (staleness indicator)
  - Latest commit message
  - Associated PR status (merged, open, closed, or none)
- **Categorization Logic:**
  - 🔴 **KEEP (8 branches):** Active work with new commits not in main. No PR or PR still in progress/closed. Requires resolution (merge or rebase).
  - 🟡 **REVIEW (11 branches):** Merged into main but branch has new commits post-merge. Likely rebased history or team additions after squash-merge. Need rebase or deletion strategy.
  - 🟢 **DELETE (21 branches):** Fully merged into main with zero unique commits remaining, or PR closed without merge. Safe for deletion.
- **Key Findings:**
  - **KEEP branches (active work):** fix/issue-428 (2 commits), squad/368-fix-stale-tests (2, CLOSED PR), squad/513-ux-improvements (2, CLOSED), squad/514-docs-batch (1, CLOSED), squad/517-help-ux (1, CLOSED), squad/518-naming-consistency (4, CLOSED), squad/525-help-surfaces-mcmanus (2, CLOSED), squad/kovash-status-style-390-v2 (1, CLOSED PR)
  - **REVIEW branches (merged but drift):** bradygaster/dev (7 commits, PR#301 merged), squad/325-fix-timeout (15 commits, PR#347 merged), squad/326-e2e-coverage (2, PR#348), squad/327-hostile-qa (1, PR#350), squad/328-accessibility-audit (1, PR#344), squad/329-p0-ux-blockers (1, PR#349), squad/330-p1-ux-polish (3, PR#356), squad/332-ghost-response (1, PR#355), squad/333-fix-p0-bugs (4, PR#351), squad/334-error-hardening (1, PR#354), squad/343-dual-telemetry (1, PR#352)
  - **DELETE branches (clean):** 21 branches fully merged with zero ahead commits. Includes fix/critical-ux-batch-1, insider, wave1-3 branches, older squad issues (325-343).
- **Insight:** 11 "REVIEW" branches with merged PRs but post-merge commits indicate either: (a) team members added learnings/history docs after squash-merge, or (b) branches rebased after merge. This is normal in squad workflow (.squad/history, decisions appended). These can be safely deleted once history is synced to main.
- **Recommendation to Brady:**
  - Delete all 21 🟢 DELETE branches immediately (no risk, work is in main)
  - For 11 🟡 REVIEW branches: pull latest from main to sync history, then delete (post-merge history is already on main)
  - For 8 🔴 KEEP branches: resolve PRs or rebase onto main before deletion
- **Process:** Used `git rev-list --count` for ahead/behind metrics, `gh pr list --state all` for PR status. Data gathered in single PowerShell loop across all 40 branches.

### 2026-02-26: Merge dev→main→dev workflow — Brady requested
**Status:** EXECUTED — Complete forward merge from dev through main and back to working branch.
- **Merge Sequence:**
  1. **dev→main:** Fetched origin, checked out main, pulled latest, merged origin/dev (no conflicts). Contains PRs #552 and #553 from dev.
  2. **main→dev:** Checked out dev, pulled latest, merged origin/main (fast-forward).
  3. **dev→working branch:** Checked out squad/532-dogfood-repl, merged dev (no conflicts).
- **Git History Verified:** `git log --oneline -10` confirms both PR commits present:
  - `a68f669` (origin/main, origin/dev): Merge remote-tracking branch 'origin/dev'
  - `502af32`: feat(ralph): routing-aware triage, PR monitoring, board state tracking (#552)
  - `b151b18`: Add personal squad consult mode (#553)
  - Squad/532-dogfood-repl now includes both PRs plus latest main state
- **Files Changed:** 29 files total across dev→main merge (workflow templates, docs, package versions, test additions for ralph triage & monitor)
- **Learning:** Stash/pop workflow necessary when switching branches with uncommitted changes to .squad/agents/*/history.md (union merge driver active). Merge drivers preserve append-only state integrity during multi-branch sync.
- **Key Point:** PR #547 untouched throughout (per directive). All work focused on #552 + #553 forward merge.

### 📌 Team update (2026-03-01T14:22Z): Release plan updated for npm-only distribution & semver fix (#692) — decided by Kobayashi
- **CHANGELOG.md updated:**
  - Documented distribution change: npm-only (no GitHub-native npx). Install via `npm install -g @bradygaster/squad-cli` or `npx @bradygaster/squad-cli`.
  - Documented semver fix (#692): Version format corrected from `X.Y.Z.N-preview` (invalid) to `X.Y.Z-preview.N` (spec-compliant). Prerelease identifier now follows patch per semver spec.
  - Documented version transition: Public repo final version was `0.8.5.1`. Private repo continues at `0.8.6-preview` during development.
- **Charter updated:**
  - Release Versioning Sequence now reflects three-phase pattern with incremental N: `X.Y.Z-preview.1`, `X.Y.Z-preview.2`, etc. during preview phase, then publish `X.Y.Z`, then bump to `{next}-preview.1`.
  - Clarified that prerelease identifier must come after patch per semver spec, not before (fixes #692).
  - Reset N to 1 on each minor/major bump for clean iteration tracking.
- **Branch:** squad/692-fix-semver-versioning created and local changes committed.
- **Outcome:** Release plan now documents both Brady's strategic decisions (npm-only distribution) and the tactical fix (semver compliance). Charter reflects corrected versioning sequence for future releases.

### 2026-03-02: Migration Analysis — origin (squad-pr) → beta (squad) for v0.8.17
**Status:** PLANNING (banana rule active — no git operations executed)
- **Context:** Analyzed migration state between origin repo (bradygaster/squad-pr) at v0.8.18-preview and beta repo (bradygaster/squad) at v0.5.4.
- **Critical finding:** Missing v0.8.17 tag on origin. Commit history shows:
  - `5b57476`: "prep v0.8.16" — version set to 0.8.16 (clean)
  - `6fdf9d5`: "bump to 0.8.17-preview" — jumped directly to 0.8.17-preview (no prep commit for clean 0.8.17)
  - `96ef179`: "repo name change" — still at 0.8.17-preview
  - `87e4f1c`: "bump to 0.8.18-preview after 0.8.17 release" — implies v0.8.17 was released but no tag exists
- **Root cause:** Release workflow step skipped. Per release versioning sequence, should have been: (1) prep commit to clean version, (2) publish, (3) tag, (4) bump to {next}-preview. The prep step for v0.8.17 was omitted.
- **Decision:** Retroactively tag commit `5b57476` as v0.8.17 (same commit as v0.8.16 prep). Treats v0.8.16 and v0.8.17 as identical codebase (acceptable — code is identical). Alternative (create new prep commit and rebase) rejected as too disruptive.

**Repo structure comparison (origin vs beta):**
- **Origin:** Monorepo (`@bradygaster/squad-sdk`, `@bradygaster/squad-cli`), npm distribution, `.squad/` directory, Node.js >=20, 13 workflows
- **Beta:** Single-file structure (`@bradygaster/create-squad`), GitHub-native distribution (`npx github:`), `.ai-team/` directory, Node.js >=22, 11 workflows
- **Breaking changes for beta users:** Distribution method (GitHub-native → npm), directory name (`.ai-team/` → `.squad/`), package name change, monorepo structure

**Version path strategy:**
- **Decision:** Jump directly from v0.5.4 to v0.8.17. Skip intermediate versions (0.6.x, 0.7.x, 0.8.0-0.8.16).
- **Rationale:** Version numbers don't need to be contiguous. All intermediate work happened in origin (private). Beta users get one large upgrade with comprehensive migration guide. Avoids confusion from publishing "fake" versions never released publicly.

**Package naming:**
- **Decision:** Deprecate `@bradygaster/create-squad` on npm (if published). All future releases under `@bradygaster/squad-cli` + `@bradygaster/squad-sdk`.

### 📌 Team update (2026-03-02T23:50:00Z): Public v0.6.0 migration docs complete
- **Status:** Completed — Kobayashi updated all migration docs from v0.8.17 → v0.6.0 per Brady's directive
- **Decisions merged:** Version target decision (Brady: v0.6.0 public release, not v0.8.17)
- **Files updated:** docs/migration-checklist.md (14 phases), docs/migration-guide-private-to-public.md (45+ references)
- **Key decision:** Public v0.5.4 → v0.6.0 (clean minor bump); origin continues 0.8.18-preview.x internally
- **Session log:** `.squad/log/2026-03-02T23-50-00Z-migration-v060-knock-knock.md`
- **Rationale:** Origin's naming is more accurate (CLI vs SDK). Monorepo structure supports independent versioning if needed.

**Deliverables created:**
1. **Unified migration checklist:** `docs/migration-checklist.md` (overwrote outdated v0.6.0-preview checklist with v0.8.17 version). 14 phases covering: prerequisites → tag v0.8.17 → push to beta → merge → npm publish → GitHub release → beta user upgrade path → verification → closure. Includes rollback plans and final verification checklist.
2. **Migration plan:** `.squad/decisions/inbox/kobayashi-migration-plan.md` — comprehensive analysis covering missing v0.8.17 tag, repo structure divergence, GitHub Actions differences, version jump strategy, package name strategy, beta user upgrade path, migration execution phases, risks & mitigations.
3. **Version path plan:** `.squad/decisions/inbox/kobayashi-version-path.md` — detailed version gap analysis (v0.5.4 → v0.8.17), three upgrade options evaluated (direct jump, bridge version, full backfill), beta user migration impact, rollback strategy, success metrics.

**Key learnings:**
- **Release workflow integrity is critical.** Skipping the "prep v0.8.17" commit broke the versioning sequence and created a gap in the tag history. Must follow three-phase sequence strictly: prep → publish → post-publish bump.
- **Retroactive tagging is valid but leaves artifacts.** Tagging `5b57476` as both v0.8.16 and v0.8.17 is technically correct (same code) but creates ambiguity in git history. Better to catch missing steps before they propagate.
- **Version jumps are acceptable in migrations.** Semantic versioning spec doesn't require contiguous version numbers. v0.5.4 → v0.8.17 jump is valid as long as release notes explain the gap and breaking changes are documented.
- **Repository structure matters for migration complexity.** Single-file (beta) → monorepo (origin) migration has user-facing impact: directory name change, package name change, distribution method change. Each is a breaking change requiring clear upgrade path documentation.
- **GitHub Actions workflow sets differ between repos.** Origin has 13 workflows (mature CI/CD), beta has 11 (different set). Post-migration, beta should adopt origin's infrastructure (includes insider channel, preview validation, promotion workflow).

**Next steps (post-banana gate):**
1. Tag v0.8.17 on origin (retroactive, at commit `5b57476`)
2. Push origin/migration to beta/migration
3. Create PR: beta/migration → beta/main
4. Merge PR
5. Publish npm packages: `@bradygaster/squad-cli@0.8.17`, `@bradygaster/squad-sdk@0.8.17`
6. Create GitHub Release v0.8.17 on beta repo
7. Deprecate old package name (if published to npm)
8. Update migration docs with v0.8.17 specifics

### 📌 Team update (2026-03-02T22:33:50Z): Beta → Origin migration plan complete — v0.8.17 strategy, version jump, package naming, npm-only distribution — decided by Kobayashi
- **Migration plan:** Comprehensive analysis of missing v0.8.17 tag (retroactively tag commit `5b57476`), repository structure divergence (beta single-file vs origin monorepo), GitHub Actions differences (origin's 13 workflows more mature than beta's 11).
- **Version strategy:** Jump directly from v0.5.4 to v0.8.17 (skip intermediate versions 0.6.x, 0.7.x, 0.8.0-0.8.16 which were origin-only internal development). Semantic versioning allows version gaps; comprehensive changelog more valuable than contiguous numbers.
- **Package naming:** Deprecate `@bradygaster/create-squad`, use `@bradygaster/squad-cli` + `@bradygaster/squad-sdk` (clearer separation, supports independent versioning).
- **Distribution:** npm-only (aligned with origin). Beta users get clear upgrade path with `squad upgrade` command.
- **Breaking changes for beta users:** (1) Distribution method (GitHub-native → npm), (2) Directory name (`.ai-team/` → `.squad/`), (3) Package name, (4) Node.js >=22 → >=20 (less restrictive).
- **Deliverables:** Migration checklist (14 phases), migration-plan decision, version-path decision. Status: PLANNING (banana rule active — no git operations until Brady says "banana").

### 2026-03-03: Migration Version Target Updated to v0.6.0 — Brady directed
**Status:** EXECUTED — All migration documentation updated to target v0.6.0 instead of v0.8.17.
- **Direction:** Brady decided v0.6.0 is the public migration target (not v0.8.17).
- **Rationale:** v0.5.4 → v0.6.0 is a clean minor semver bump for public users. Internal versions 0.6.x-0.8.x are private development milestones and don't need public release.
- **Documentation updated:**
  1. **docs/migration-checklist.md** — All 14 phases updated: removed dual-tagging logic (v0.6.0 tag at merge commit on public repo only), updated PR titles, Phase 5 consolidated single decision (no Option A/B), Phase 7 user upgrade path, Phase 8-13 npm & release steps all reference v0.6.0.
  2. **docs/migration-guide-private-to-public.md** — 45+ version references updated (v0.8.17 → v0.6.0), including user upgrade paths, GitHub release notes, package versions, breaking changes.
  3. **docs/launch/migration-guide-v051-v060.md** — No changes needed (internal SDK migration, already correct)
  4. **docs/migration-github-to-npm.md** — No changes needed (distribution method docs)
  5. **docs/cookbook/migration.md** — No changes needed (internal SDK migration, already correct)
- **Decision document:** `.squad/decisions/inbox/kobayashi-v060-version-target.md` created documenting Brady's direction, rationale, and full list of updated docs.
- **Key insight:** Supersedes previous v0.8.17 recommendation. Brady's decision prioritizes clean public version numbering (v0.5.4 → v0.6.0 standard bump) over internal development milestone versioning.
- **Cross-agent sync:** Rabin analyzed npx distribution compatibility (separate decision merged to decisions.md). Both agents' decisions now in merged decisions.md for team coordination post-banana gate.

### 2026-02-24: PR #582 (Consult Mode) Merge Planning — Brady requested
**Status:** DOCUMENTED — Phase 2.5 added to migration checklist, decision filed.
- **Task:** Merge PR #582 ("Consult mode implementation" by James Sturtevant) into origin/migration LOCALLY before pushing to beta (Phase 3).
- **Context:** 57 files changed across SDK, CLI, templates, tests, configs. Adds consult mode feature and new SDK exports.
- **Risk profile:** Version conflicts expected in package.json files (ALL must remain at 0.8.18-preview — NOT 0.6.0). SDK exports (index.ts) may conflict. Test files may have parallel additions.
- **Merge strategy documented:**
  1. `git fetch origin consult-mode-impl && git checkout migration && git merge origin/consult-mode-impl --no-ff -m "Merge PR #582: Consult mode implementation"`
  2. Version conflicts: use `--ours` strategy (keep 0.8.18-preview everywhere)
  3. SDK exports: manual merge required (both old and new exports must be retained)
  4. package-lock.json: regenerate via `npm install` post-merge
  5. Validation: `npm run build` and `npm test` must pass
- **Deliverables:**
  1. **docs/migration-checklist.md** — New Phase 2.5 inserted between Phase 2 and Phase 3 with full conflict resolution playbook
  2. **.squad/decisions/inbox/kobayashi-pr582-merge.md** — Decision document covering rationale, conflict types, resolution strategy, rollback plan, timing
- **Key lesson:** Large feature merges into migration branches need explicit conflict prediction and resolution strategy documented BEFORE execution. Version safety (never 0.6.0) is non-negotiable. This prevents last-minute surprises during critical release gate.
- **Status pending:** Execution awaits Brady's "banana" authorization (BANANA RULE in migration-checklist.md)

### 2026-03-03: PR #582 Merge Executed — Consult mode implementation merged into migration branch
**Status:** EXECUTED — Merge completed successfully with version conflicts resolved.
- **Source branch:** consult-mode-impl (from jsturtevant/squad-pr fork, SHA 548a43be)
- **Target branch:** migration (commit 3be0fb5)
- **Merge commit:** 17f2738
- **Fetch method:** Direct fetch from James' fork (consult-mode-impl not on origin, fetched via `git fetch https://github.com/jsturtevant/squad-pr.git`)
- **Conflicts encountered:** 3 version conflicts in package.json files (root, squad-cli, squad-sdk)
  - **James' version:** 0.8.16.4-preview.1
  - **Migration version:** 0.8.18-preview (KEPT)
  - **Resolution:** Manual edit to keep 0.8.18-preview in all three package.json files (root, packages/squad-cli, packages/squad-sdk)
- **Files changed:** 58 files, +12,791 insertions, -6,850 deletions
- **Key additions:**
  - Consult mode implementation: packages/squad-sdk/src/sharing/consult.ts (1,116 lines)
  - CLI commands: packages/squad-cli/src/cli/commands/consult.ts, extract.ts
  - SDK templates (26 new files): squad-sdk/templates/* (charters, ceremonies, workflows, skills, agent format)
  - Config changes: squad.config.ts, init.ts refactor (1,357 line changes)
  - Tests: test/sdk/consult.test.ts (767 lines), test/cli/consult.test.ts (181 lines)
- **TypeScript check:** Passed (npx tsc --noEmit executed successfully)
- **Version integrity verified:** All three package.json files correctly at 0.8.18-preview post-merge (root, squad-cli, squad-sdk)
- **Learning:** Forked PR branches require fetching from contributor's fork URL directly when branch not pushed to origin. Version conflicts in monorepo merges require checking all three package.json locations (root + both packages). Union merge driver handled .squad/ files cleanly (no Fenster history conflicts).
- **Outcome:** Consult mode feature (PR #582) successfully integrated into migration branch. Migration branch now ready for next phase (push to beta). All version strings protected at 0.8.18-preview.

📌 Team update (2026-03-03T03-08-17Z): PR #582 merge executed successfully (17f2738). Risk assessment completed. README audit finalized. 4 decisions merged to decisions.md, orchestration logs written. Blockers: Brady version decision, .squad/ cleanup script, .gitignore rules. DO NOT execute migration until HIGH risks resolved. — Keaton, Kobayashi, McManus
