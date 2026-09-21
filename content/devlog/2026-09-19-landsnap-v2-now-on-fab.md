---
title: "LandSnap Version 2 is now available on Fab"
date: 2026-09-19
game: LandSnap
draft: false
excerpt: "LandSnap Version 2 is live on Fab with a rebuilt placement workflow, more accurate rigid terrain fitting, expanded editor support, and an interactive Pixel Streaming demo."
tags:
  - LandSnap
  - Fab
  - Unreal Engine 5.8
  - Pixel Streaming
  - Editor Tooling
hero: ../../../images/landsnap/FAB-thumbnail-v2.png
cta:
  eyebrow: "Interactive product demo"
  title: "LandSnap Showcase"
  description: "Open the controlled streamed Unreal Editor workspace to explore prepared scenes, review placement results, and run deliberate LandSnap actions."
  label: "Open the interactive Showcase"
  href: "https://showcase.ns-tx.com/"
---

:::highlight-blue
## LandSnap Version 2 is live on Fab

- The version 2 update is approved and available now for Unreal Engine 5.8.
- The LandSnap page now includes an interactive Pixel Streaming demo with prepared scenes and deliberate placement actions.
- One configurable LandSnap action, global AutoSnap, Placement Studio review, and the optional LandSnapMCP editor module now ship together.
:::

LandSnap Version 2 is a focused rebuild of the day-to-day placement pass. The goal is still simple: spend time building the level, not correcting transforms after every move.

The workflow is now centered on one configurable LandSnap action. Enable AutoSnap when you want eligible single-object edits to settle automatically, or run Snap Selected for a deliberate pass across a selection. AutoSnap avoids resnapping while you are making height adjustments, so it stays out of the way when vertical placement is intentional.

Version 2 also expands the kinds of editor content LandSnap can place: Niagara and Cascade particles, skeletal assets, volumes, splines, tagged surfaces, and experimental Mesh Terrain workflows, including optional deformation with custom map support.

Large rigid objects receive a more accurate terrain-fitting solve that preserves their shape instead of forcing every sampled point to touch. That extra precision can take a little longer in very large mass-placement passes, so LandSnap now processes those selections in bounded batches. If a pass is cancelled, completed snaps remain intact instead of being lost.

Placement Studio makes setup and debugging easier in the editor. It combines controls, error flags, a dedicated Outliner, Needs Review, and heuristic repair for placements that need another look. LandSnapMCP is included in the same Fab install for teams using compatible agent tooling, while the core editor workflow remains fully usable on its own.

The LandSnap page now also features a controlled Pixel Streaming demo: open a prepared Unreal workspace, inspect the scene, and run deliberate LandSnap actions before deciding whether the tool fits your workflow. Demo access depends on the live showcase server and its session queue.

## The technical stack behind the Showcase

Shipping that demo required more than embedding a video player. The Showcase combines **Unreal Engine 5.8.2 Stream Level Editor**, **Pixel Streaming 2**, and **WebRTC** to deliver a live, interactive workspace through the browser.

Epic's UE 5.8 frontend core is bundled with **esbuild** into a custom Nightshift player, while the surrounding interface stays lightweight with plain HTML, CSS, and JavaScript. A purpose-built session layer coordinates demo availability and lifecycle, and a restricted interaction bridge maps the web controls to the prepared LandSnap operations used in each scene.

The complete path is backed by automated contract tests, malformed-payload coverage, responsive browser checks, and a separate security review. That keeps the visitor experience simple while the streaming, session, and interaction layers remain independently testable.
