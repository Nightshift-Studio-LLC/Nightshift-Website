---
title: "LandSnap Version 2: rigid hinge fitting for uneven terrain"
date: 2026-08-03
game: LandSnap
draft: true
excerpt: "A brief look at a LandSnap Version 2 fitting method that keeps an object's footprint rigid while finding its best orientation against uneven terrain."
tags:
  - LandSnap
  - Unreal Engine
  - Terrain Fitting
  - Editor Tooling
hero: ../../../images/landsnap/FAB-thumbnail.png
---

:::highlight-blue
## Version 2 research note

- Keep the object footprint rigid instead of moving its corners independently.
- Hold one edge as a hinge and rotate the opposite edge toward the terrain.
- Search a single angle for the smallest combined placement error.
- Accept the best rigid compromise when uneven terrain prevents a perfect fit.
:::

## Conform without deforming

One of the fitting problems under consideration for LandSnap Version 2 is how to settle a wide object against uneven terrain without bending its footprint.

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
