# Agent Context

This repository is the source for the Nightshift static site at `ns-tx.com`.

## First Reads

1. `AGENTS.md` - agent roles, design direction, guardrails, and done criteria.
2. `llms.txt` - public-facing LLM summary and route map.
3. `package.json` - build and verification commands.

## Repository Shape

- `index.html` is the current root home page.
- `pages/` contains the main hand-authored Nightshift pages.
- `pages/games/` contains individual game/project detail pages.
- `content/devlog/` contains editable devlog markdown.
- `tools/devlog/build.mjs` compiles devlog markdown into `pages/DevLog/`.
- `styles/` contains shared and page-family CSS.
- `images/`, `video/`, `audio/`, and `models/` contain static assets.
- `react-app/` is a small React/Vite surface that builds into `dist/react-app/`.
- `afterdarkrp/` is a separate public AfterDarkRP surface with nested clean URLs and redirect shims.
- `pages/ServerHosting/Sandbox/` is a legacy or side surface.

## Source Ownership Rules

- Edit devlog source in `content/devlog/`, not generated post HTML.
- Edit shared visual patterns in `styles/` instead of duplicating page-local CSS when a pattern is reused.
- Keep page-specific structure in the relevant HTML file when the change only belongs to one page.
- Keep new assets close to the feature/page that uses them.
- Avoid touching `dist/`, `node_modules/`, or generated devlog HTML directly.

## Build And Verification Commands

```sh
npm run build:devlog
npm run build:react
```

Run `npm run build:devlog` after changes to:

- `content/devlog/*.md`
- `tools/devlog/build.mjs`

Run `npm run build:react` after changes to:

- `react-app/src/*`
- `react-app/index.html`
- `vite.config.mjs`

For layout or styling changes, inspect desktop and mobile behavior before closing work.

## Current Visual System

The active brand direction is Nightshift:

- Dark atmospheric backgrounds.
- Phosphor green interface accents.
- Occasional restrained red warning accents.
- Technical typography and dense but readable panels.
- UI language based on systems, signals, control rooms, maps, logs, and build telemetry.

Avoid introducing unrelated bright palettes, soft SaaS styling, or broad redesigns unless the task explicitly asks for a rebrand.

## Route Notes

- Root home page: `/`
- Main pages: `/pages/games.html`, `/pages/studio.html`, `/pages/contact.html`, `/pages/DevLog/index.html`
- Detail pages: `/pages/games/*.html`
- AfterDarkRP clean URLs: `/afterdarkrp/about/`, `/afterdarkrp/guide/`, `/afterdarkrp/rules/`, `/afterdarkrp/changelog/`
- Several `.html` files under `afterdarkrp/` and `pages/ServerHosting/Sandbox/` are redirect shims.

## Git Hygiene

- The worktree may contain user changes. Do not revert unrelated edits.
- At the time this file was added, there were pre-existing image deletes and an untracked `images/afterdarkrp/Devlogs/4-29-2026/` folder. Treat those as user work unless asked otherwise.
