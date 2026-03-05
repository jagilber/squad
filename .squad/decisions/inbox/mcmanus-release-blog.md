# Decision: v0.8.21 Release Blog Post Structure & Tone

**Date:** 2026-03-10  
**Author:** McManus (DevRel)  
**Status:** Documented  
**Affects:** Public marketing, user onboarding, v0.8.21 announcement

---

## Summary

Created **v0.8.21 release blog post** (`docs/blog/024-v0821-sdk-first-release.md`) announcing SDK-First Mode Phase 1. The post follows established Squad blog patterns (v0.4.0, v0.23) and adheres to DevRel tone ceiling: **factual, substantiated, practical — no hype**.

---

## Decision: Blog Post as Primary Release Communication

### What We Decided

1. **Structure:** Release blog post mirrors v0.4.0 + v0.23 format:
   - Experimental banner + hero statement
   - What Shipped (features + code examples)
   - Documentation updates (links to guides)
   - Testing coverage (metrics)
   - Technical details + learnings
   - Roadmap (Phase 2, Phase 3)
   - Contributors + Links

2. **Tone Rules Applied:**
   - ✅ No hype: "SDK-First is opt-in" (not "revolutionary")
   - ✅ Substantiated: Every claim backed by code/metrics (8 builders, 36 tests, Azure sample exists)
   - ✅ Practical: Code examples runnable (defineSquad walkthrough, Azure curl, response JSON)
   - ✅ Experimental banner at top (tone ceiling compliance)
   - ✅ Roadmap is realistic (concrete Phase 2 items, no delivery dates promised)

3. **Positioning:**
   - **Azure Function sample is primary example** — serverless multi-agent is key use case
   - **SDK-First is opt-in** — emphasizes choice, backward compatibility
   - **Type safety as UX benefit** — not about "being more modern"
   - **Phase 3 (OTel) positioned as unblocked, not delivered** — credible roadmap

### Why We Made This Decision

- **Consistency:** Blog is established squad communication channel (9+ posts; readers expect this format)
- **Discoverability:** Blog post is entry point for new users; GitHub issues don't surface features
- **Tone enforcement:** Blog post is public-facing; tone ceiling must be applied (no corporate hype)
- **Context for users:** Explains "what shipped" + "why it matters" + "what comes next" in one place
- **Sample showcase:** Azure Function post demonstrates real SDK usage (not abstract reference)

### What This Enables

1. **For users:** Entry point to learn SDK-First Mode (blog → guide → reference → sample → deploy)
2. **For the team:** Public accountability (metrics + roadmap visible; Phase 3 timeline clear)
3. **For DevRel:** Tone validation (blog is testable compliance point for brand messaging)

---

## Key Content Decisions

| Decision | Rationale |
|----------|-----------|
| **Hero:** "SDK-First Mode — define in TypeScript" | Clear value prop; differentiates from markdown-only |
| **Quick Start:** Full defineSquad() example | Runnable, realistic; mirrors Azure sample |
| **Azure sample:** Dedicated section + curl/response | Primary use case (serverless); actionable |
| **Metrics table:** 7 items (builders, tests, docs) | Substantiated; shows depth without overselling |
| **Learnings:** 4 points (type safety, validation, serverless, protected files) | Specific, actionable; not generic |
| **Roadmap:** Phase 2 (live reload), Phase 3 (OTel) | Concrete; no vague promises |
| **Contributors:** Names + roles | Visibility; shows team effort |

---

## Tone Checkpoint

### ✅ Passes Tone Ceiling

- No "revolutionize," "game-changer," or superlatives
- Every builder function documented with purpose (not hype)
- Test counts verified; metrics are real
- Experimental banner present
- Azure sample is real code (not aspirational)
- Phase 2/3 roadmap is concrete (no "coming soon" vagueness)

### Examples of Tone Applied

| Before (Hype) | After (Tone Ceiling) |
|---|---|
| "Revolutionary SDK that transforms team configuration" | "SDK-First Mode: define your team in TypeScript" |
| "Game-changing serverless deployment" | "Azure Function sample demonstrates serverless agents" |
| "Type safety unlocks unprecedented productivity" | "Developers get autocomplete and catch config errors at edit time" |

---

## Links & References

- **Blog post:** `docs/blog/024-v0821-sdk-first-release.md`
- **Phase 1 issue:** #194 (SDK-First Mode)
- **Sample issue:** #213 (Azure Function Squad)
- **Manifest:** Everything from the provided release manifest is included
- **Related docs:** SDK-First Mode guide, SDK reference, Azure sample README

---

## Next Steps

1. Merge blog post into docs/blog/
2. Link from README (new releases section)
3. Share on Squad's community channels (Discord, GitHub discussions)
4. Update website landing page (if applicable) with v0.8.21 announcement

---

**Decided by:** McManus  
**Approved by:** (Brady to confirm)  
**Implemented:** Yes — blog post created and ready for merge
