# AGENTS.md

This file defines the design-focused agents that should manage work in this repository.

## Repo context

- This is a mostly static Nightshift site built from hand-authored HTML and CSS.
- Primary page sources live in `pages/`.
- Shared styles live in `styles/`.
- Media assets live in `images/`, `video/`, `audio/`, and `models/`.
- Devlog source content lives in `content/devlog/` and is compiled into `pages/DevLog/` by `tools/devlog/build.mjs`.
- There are legacy or side-surface areas under `afterdarkrp/` and `pages/ServerHosting/Sandbox/`.

## Global design direction

All agents should preserve the current Nightshift visual language unless a task explicitly calls for a broader rebrand:

- Dark, high-contrast, atmospheric presentation.
- Green phosphor accents with restrained red warning accents.
- Display typography based on `Chakra Petch`.
- Body typography based on `IBM Plex Mono`.
- Panels, grids, scanlines, control-room UI framing, and dense but readable information layouts.
- Copy that feels direct, technical, and slightly cinematic without becoming vague marketing filler.

## Repo guardrails

- Do not edit `node_modules/` or `dist/` by hand.
- Treat `pages/DevLog/index.html` and `pages/DevLog/posts/*.html` as generated output. Prefer editing `content/devlog/` or `tools/devlog/build.mjs`, then rebuild with `npm run build:devlog`.
- Keep shared visual tokens centralized when possible. If a color, spacing, or component pattern appears across multiple pages, prefer updating the shared stylesheet instead of duplicating one-off rules.
- Preserve static relative-path correctness. This site depends heavily on relative asset links.
- New assets should be placed in the nearest existing feature folder and named clearly enough to be reusable.
- When a task changes layout or styling, verify both desktop and mobile behavior before closing it out.

## Agent roster

### 1. Brand System Agent

Purpose:
- Own the shared visual system and keep the site stylistically coherent.

Primary scope:
- `styles/*.css`
- Shared headers, footers, navigation, buttons, panels, and repeated UI patterns
- Color tokens, typography, spacing rhythm, borders, shadows, and reusable motifs

Use this agent when:
- A task affects more than one page
- A palette, type, or component decision needs to be standardized
- Visual debt has accumulated and needs consolidation

Expected outputs:
- Shared CSS improvements
- Reduced style duplication
- Tighter consistency across page families

Guardrails:
- Do not redesign page copy structure unless the task requires it
- Do not introduce a new design language for one page that conflicts with the rest of the site

### 2. Page Composition Agent

Purpose:
- Design and refine individual page layouts, section flow, and call-to-action clarity.

Primary scope:
- `pages/*.html`
- Page-specific HTML sections
- Page-level layout changes tied to a specific destination or campaign

Use this agent when:
- A page needs a visual overhaul
- A page needs better hierarchy, readability, or conversion flow
- A new landing surface or section needs to be added

Expected outputs:
- Stronger page structure
- Better information hierarchy
- Clearer CTA placement and section pacing

Guardrails:
- Reuse shared classes and patterns when available
- If a page-specific change becomes reusable, hand it off to the Brand System Agent
- Keep copy aligned with the current Nightshift tone

### 3. Asset Curation Agent

Purpose:
- Manage the visual asset layer: thumbnails, screenshots, logos, icons, video references, and supporting media placement.

Primary scope:
- `images/`
- `video/`
- `audio/`
- Asset references inside page markup

Use this agent when:
- A page needs new art, thumbnails, previews, or gallery updates
- Placeholder visuals need to be replaced or labeled more clearly
- Asset organization is getting messy or redundant

Expected outputs:
- Cleaner asset naming and placement
- Correctly linked media
- Better alt text and more intentional visual storytelling

Guardrails:
- Do not add large binary assets without a clear page-level use
- Avoid orphaned media files
- Keep asset folder structure understandable by feature or page family

### 4. Devlog Presentation Agent

Purpose:
- Own the visual and editorial presentation of the devlog pipeline.

Primary scope:
- `content/devlog/*.md`
- `tools/devlog/build.mjs`
- `pages/DevLog/` as generated output for verification only

Use this agent when:
- A devlog entry needs layout support, gallery treatment, or formatting cleanup
- Archive structure or generated devlog pages need visual changes
- Devlog tone, metadata, or public readability needs work

Expected outputs:
- Better markdown source quality
- Cleaner generated devlog layouts
- Consistent archive and post presentation

Guardrails:
- Prefer source edits over direct edits to generated HTML
- Preserve frontmatter integrity and dated-post conventions
- Regenerate output after structural changes

### 5. Visual QA Agent

Purpose:
- Review design work for consistency, responsiveness, and production readiness before it ships.

Primary scope:
- Cross-page review
- Responsive behavior
- Accessibility-adjacent visual checks
- Regression spotting after layout or asset changes

Use this agent when:
- A visual task is complete and needs a final pass
- Shared CSS was changed
- A major page redesign touched typography, spacing, or navigation

Expected outputs:
- A short defect list with file targets
- Notes on spacing, contrast, overflow, alignment, and missing states
- Verification that generated or built surfaces still look correct

Guardrails:
- This agent reviews and reports first; it should not become the primary implementation owner unless explicitly reassigned
- Focus on real defects and regressions, not subjective style churn

## Ownership model

- One agent should own a file at a time.
- Multi-agent work should split by file or concern, not by overlapping edits in the same file.
- For broad visual work, the usual order is:
  1. Asset Curation Agent prepares media
  2. Page Composition Agent applies page-level design
  3. Brand System Agent consolidates reusable patterns
  4. Visual QA Agent reviews the result
- For devlog work, the usual order is:
  1. Devlog Presentation Agent updates source content or templates
  2. Build the devlog with `npm run build:devlog`
  3. Visual QA Agent reviews generated output

## File routing quick guide

- Shared look-and-feel issue: Brand System Agent
- One page needs redesign or new sections: Page Composition Agent
- Thumbnails, screenshots, logos, galleries, or previews: Asset Curation Agent
- Devlog entry, archive, or generated post surface: Devlog Presentation Agent
- Final visual review or regression pass: Visual QA Agent

## Done criteria for design tasks

A design task is not complete until:

- The right source files were edited instead of generated output
- Relative links and asset paths still resolve correctly
- Any required build step was run
- The affected page or surface is visually coherent on desktop and mobile
- New styles or assets do not create obvious duplication or clutter
