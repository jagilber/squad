# PAO

> Public Affairs Officer

## Learnings

### Docs Build Architecture
docs/ directory contains blog/, concepts/, cookbook/, getting-started/, guide/ sections. Build script produces HTML output for all sections. Blog posts follow numbered naming convention (001-xxx.md through 026-xxx.md).

### Dynamic Blog Test Pattern
docs-build.test.ts discovers blog posts from filesystem instead of hardcoded list. Adding/removing blog posts no longer requires test updates. Other sections (getting-started, guides) still use hardcoded expected lists since they change rarely.

### Contributor Recognition
CONTRIBUTING.md and CONTRIBUTORS.md exist at repo root. Contributors Guide page added in v0.8.24. Each release should include contributor recognition updates.

### Blog Post Format (v0.8.25)
Release blog posts use YAML frontmatter with: title, date, author, wave, tags, status, hero. Hero is one-sentence summary. Body includes experimental warning, What Shipped section with tables/code blocks, Why This Matters section, Quick Stats, What's Next. Keep practical and developer-focused, 200-400 words for infrastructure releases. Tone ceiling enforced: no hype, explain value.

### Roster & Contributor Recognition (v0.8.25)
Squad moved to Apollo 13/NASA Mission Control naming scheme (Flight, Procedures, EECOM, FIDO, PAO, CAPCOM, CONTROL, Surgeon, Booster, GNC, Network, RETRO, INCO, GUIDO, Telemetry, VOX, DSKY, Sims, Handbook). CONTRIBUTORS.md tracks both team roster and community contributors; contributor table entries grow with PRs (append PR counts rather than replace, maintaining attribution history).

### Scannability Framework (v0.8.25)
Format selection is a scannability decision, not style preference. Paragraphs for narrative/concepts (3-4 sentences max). Bullets for scannable items (features, options, non-sequential steps). Tables for comparisons or structured reference data (config, API params). Quotes/indents for callouts/warnings. Decision test: if reader hunts for one item in a paragraph, convert to bullets/table. This framework is now a hard rule in charter under SCANNABILITY REVIEW.
