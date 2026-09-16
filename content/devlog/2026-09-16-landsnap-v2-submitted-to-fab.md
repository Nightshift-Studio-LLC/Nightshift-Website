---
title: "LandSnap Version 2 submitted to Fab: rebuilt placement workflows and rigid terrain fitting"
date: 2026-09-16
game: LandSnap
draft: false
excerpt: "LandSnap Version 2 has been submitted to Fab with AutoSnap, Placement Studio, progressive multi-actor placement, exact-target review, and the included LandSnapMCP editor module."
tags:
  - LandSnap
  - Unreal Engine
  - Terrain Fitting
  - Editor Tooling
hero: ../../../images/landsnap/FAB-thumbnail-v2.png
---

:::highlight-blue
## LandSnap Version 2 has been submitted to Fab

- Global AutoSnap follows eligible placement, duplication, movement, rotation, and scaling changes.
- Placement Studio puts LandSnap’s deterministic snapping controls, review, and repair in one dockable workspace.
- Large selections prepare across editor frames and publish in bounded groups under one Undo step.
- Exact-target verification keeps difficult placements visible in Needs Review.
- LandSnap and the included LandSnapMCP editor module now ship together in one Fab plugin; using the MCP integration remains optional.
:::

LandSnap Version 2 was submitted to Fab for review on September 16, 2026, with automatic publication enabled after approval. The existing LandSnap listing remains available while Fab reviews the update.

The release expands the editor workflow without adding a runtime gameplay dependency. AutoSnap provides an effectively real-time placement mode for individual edits, while Snap Selected handles deliberate one-shot operations across actors, Niagara and Cascade particle systems, spline points, and spline mesh components. Large mixed-size selections trade some speed for more accurate, deterministic placement and stay grouped under one Undo step.

Placement Studio is the compact control center for LandSnap’s deterministic snapping behavior. It keeps placement anchors, alignment, offsets, trace behavior, size tiers, and surface policy alongside review and repair, so a level designer can configure the exact placement contract a scene needs. Exact-target verification then sends unresolved actors to Needs Review instead of silently calling them successful, and bounded repair actions test deterministic alternatives without turning placement into an uncontrolled simulation.

The Fab package includes both editor modules in one install. The core LandSnap workflow remains independently usable. LandSnapMCP is optional, and its transport activation and agent mutation controls remain separate opt-ins.

The current public video demonstrates the original LandSnap workflow. A new Version 2 overview is in production; the updated product page and Fab gallery show the current interface and feature set.

:::gallery
image|../../../images/landsnap/landsnap-breakdown1.png|LandSnap terrain-placement breakdown showing a rigid actor settling against uneven terrain|Version 2 keeps rigid placement constraints visible while finding a practical terrain-supported orientation.
image|../../../images/landsnap/landsnap-breakdown2.png|LandSnap terrain contact and placement comparison|The placement pass evaluates contact rather than deforming the selected asset to force every point onto the surface.
image|../../../images/landsnap/landsnap-breakdown3-concave.png|LandSnap concave terrain-placement breakdown|Difficult terrain remains reviewable when no clean rigid placement satisfies the selected contract.
:::

## Conform without deforming

One of the fitting problems LandSnap Version 2 addresses is how to settle a wide object against uneven terrain without bending its footprint.

Snapping every corner to a separate terrain hit can force contact, but it also deforms the shape. That is not a valid result for a rigid prop, platform, foundation, or modular building piece.

The cleaner model gives the object only one degree of freedom. Two footprint vertices, `A` and `B`, define a fixed hinge axis. The remaining vertices, `C` and `D`, rotate around that axis together, so every edge length and angle in the footprint is preserved.

```text
u = (B - A) / ||B - A||
```

At each candidate hinge angle, LandSnap rotates the two free vertices and raycasts down to the terrain beneath them. Their height errors are combined into one score:

```text
E(theta) = e_C(theta)^2 + e_D(theta)^2
```

The desired rotation is simply the angle that produces the smallest score. Squaring the two errors prevents a corner above the terrain from canceling out one below it, and it makes a large miss more expensive than two small ones.

## A small, practical search

Terrain is triangulated, so the surface beneath a rotating corner can change during the fit. That makes the error piecewise-defined and rules out relying on one globally valid closed-form angle.

The practical solver is still tiny:

1. Limit the hinge to a safe rotation range.
2. Sample that range coarsely to find the best local bracket.
3. Refine the bracket with a short one-dimensional search.
4. Apply the winning angle as one rigid rotation.

A ternary or golden-section refinement can converge in only a handful of iterations when the selected bracket is locally smooth. The initial coarse pass matters because triangle changes, holes, and competing surface features can create more than one local minimum.

For steep terrain, the same fit can measure each corner against the triangle plane instead of comparing only world height:

```text
e(P, theta) = n . (P(theta) - T)
```

Here, `n` is the normalized triangle normal and `T` is the terrain hit point. This measures separation along the surface normal and should produce a more natural result on strong slopes.

## The useful limitation

One hinge angle normally cannot make both free corners touch arbitrary terrain exactly. That is not a failure of the solver; it is the unavoidable constraint that keeps the object rigid.

LandSnap is finding the best compromise:

```text
e_C^2 + e_D^2 -> minimum
```

If the placement contract allows the hinge itself to move, a small final suspension offset can remove the average remaining vertical error. If the hinge points are hard anchors, that translation stays disabled.

That is the Version 2 idea in one sentence: let the terrain choose the best rigid orientation, but never let it deform the asset to get there.

Read the current product overview: [LandSnap](../../Studio/Landsnap.html)
