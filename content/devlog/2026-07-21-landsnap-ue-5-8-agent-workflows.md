---
title: "LandSnap 1.1.0 moves to Unreal Engine 5.8 with agent-ready workflows"
date: 2026-07-21
game: LandSnap
excerpt: "LandSnap 1.1.0 updates the editor tool for Unreal Engine 5.8, adds Mesh Terrain and particle-system snapping, introduces a dockable control panel, and exposes an opt-in command layer for MCP-connected agents."
tags:
  - LandSnap
  - Unreal Engine 5.8
  - MCP
  - Agent Workflows
  - Editor Tooling
hero: ../../../images/landsnap/FAB-thumbnail.png
---

:::highlight-blue
## LandSnap 1.1.0

- Updated the plugin descriptor and tested target for Unreal Engine 5.8.
- Added experimental UE 5.8 Mesh Terrain support.
- Added pivot-safe Niagara and Cascade particle-system snapping.
- Added a dockable panel for snap actions and live settings.
- Added an opt-in command layer for MCP-connected agents and editor automation.
:::

## Built for Unreal Engine 5.8

LandSnap 1.1.0 moves the plugin's tested target to **Unreal Engine 5.8** and expands what counts as terrain inside the editor.

Alongside standard Landscape actors, LandSnap can now recognize UE 5.8's experimental Mesh Terrain surfaces. The integration uses reflected Mesh Partition actor and component recognition, so the plugin can support the new terrain path without forcing a hard Mesh Partition module dependency.

For level design, the goal stays the same: select what needs to settle, run LandSnap, and get a predictable, undoable placement pass without hand-adjusting every actor.

## More than static meshes

Niagara and legacy Cascade particle actors now have an explicit snapping path. LandSnap places them from the emitter pivot by default and preserves their rotation unless surface-normal alignment is intentionally enabled.

Particle systems also skip the mesh-focused convex, concave, and bounce-correction passes. Their simulated visual bounds can change between frames, so pivot placement gives them a much more stable contract.

The release also adds a dockable **LandSnap Panel** under **Window -> LandSnap Panel**. It keeps **LandSnap Selected**, **LandSnap Splines**, and the live searchable settings object in one Details-style workspace. Toolbar buttons and hotkeys are still available; the panel is simply a tighter place to operate and tune the tool.

## Agent support through MCP-connected tools

The other major addition is an agent-facing command layer designed for external MCP-connected editor agents and automation tools.

LandSnap does not bundle an MCP server or store an AI provider key. Instead, it exposes a small set of Unreal Editor console commands that an MCP tool can call:

- `LandSnap.Agent.Status`
- `LandSnap.Agent.SnapSelected`
- `LandSnap.Agent.SnapSplines`
- `LandSnap.Agent.Search`
- `LandSnap.Agent.SearchAndSnap`

Automation is disabled by default and must be explicitly enabled with the operating-system environment variable `LANDSNAP_AGENT_ENABLED=1` before Unreal Editor starts.

The search layer can match actor text, class, tags, World Outliner folders, and placed-asset folders. Results are bounded, sorted by score and object path, and written to the log as single-line JSON. That gives an agent a repeatable inspection step before it changes anything.

The intended flow is deliberately cautious:

1. Run `LandSnap.Agent.Search` as a dry run.
2. Review the deterministic matches in the Unreal log.
3. Run `LandSnap.Agent.SearchAndSnap` with the same filters.
4. Keep the existing editor transaction and Undo/Redo path available if the result needs another pass.

That turns commands such as "find the rocks in this Outliner folder and settle them to the terrain" into a structured editor operation instead of a fragile chain of clicks.

## A tighter placement tool

Version 1.1.0 builds on the existing size tiers, tagged-surface filters, convex and experimental concave footprint handling, spline tools, normal alignment, and bounce-floater correction. The new work makes those systems easier to operate manually and easier to expose safely to an agent-driven workflow.

The result is still intentionally editor-only. There is no runtime component and no gameplay cost: LandSnap remains a focused world-building tool for faster, more consistent placement.

Read the current product overview: [LandSnap](../../Studio/Landsnap.html)
