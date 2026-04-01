---
title: AfterDarkRP pushes Ghetto 01 further with optimization passes, LOD work, and stronger street readability
date: 2026-03-31
game: AfterDarkRP
excerpt: "Since the March 22 devlog, AfterDarkRP has kept pushing Ghetto 01 toward a playable read with interior optimization, LOD creation, light optimization, better material treatment, and cleaner intersections, even while deeper systems validation still waits on a stronger testable map state."
tags:
  - AfterDarkRP
  - Map
  - Materials
  - Environment
  - Ghetto 01
hero: ../../../images/afterdarkrp/Devlogs/3-31-26/03.png
---

## Since the last devlog

The last public update on **March 22, 2026** was mostly about a narrower push: keep moving the map, keep code progressing where possible, and get **Ghetto 01** into a state that can support more meaningful server-side testing.

That core reality has not changed, but the district does read better now than it did a week ago. The newest work is less about announcing a fresh gameplay system and more about pushing the environment out of raw blockout territory so the city starts feeling intentional, performant, and testable instead of merely assembled.

## Optimization work is part of the story

This pass was not only about making screenshots look better. A real part of the work went into **interior optimization**, **LOD creation**, and **light optimization** so the district has a better chance of holding up once more of the city is active at once.

- Interior spaces are being trimmed and simplified so they stop carrying unnecessary cost before they are even in full gameplay use.
- LOD work is being pushed so buildings and larger environment pieces can read correctly at distance without forcing the client to pay full detail all the time.
- Lighting is being optimized so the nighttime atmosphere can stay intact without turning every block into a performance problem.

That optimization layer matters because Ghetto 01 is supposed to become playable space, not just a set of promo angles. If the district cannot hold together under real movement and real camera reads, then deeper systems testing still gets delayed.

## Materials and street read are improving

The clearest change in the latest captures is that **Ghetto 01 is starting to hold together as an actual street space**. Buildings have more convincing surface treatment, window reads are stronger, traffic lights and intersections are giving the roads more structure, and the district silhouette is less abstract than it was in the previous post.

It is still not a final-art pass, and it is still visibly in progress, but the environment is doing a better job of communicating:

- where routes open up,
- where intersections matter,
- how the block massing frames the player,
- and what kind of district identity this part of the city is aiming for.

That matters because map work at this stage is not just decoration. It is about getting the space readable enough that roleplay movement, pressure, and encounter flow can actually be evaluated.

## New captures

<div class="devlog-gallery">
<figure>
<img src="../../../images/afterdarkrp/Devlogs/3-31-26/01.png" alt="AfterDarkRP Ghetto 01 intersection preview with improved building materials and traffic lights">
<figcaption>Intersection view showing stronger material definition, clearer traffic control, and a more usable sense of street scale while optimization work continues under the hood.</figcaption>
</figure>
<figure>
<img src="../../../images/afterdarkrp/Devlogs/3-31-26/02.png" alt="AfterDarkRP district angle showing building massing and road layout in Ghetto 01">
<figcaption>Another district angle where the road layout, sidewalk edge, and corner massing are starting to read like a city block instead of a temporary shell, with LOD work helping the wider view hold together better.</figcaption>
</figure>
<figure>
<img src="../../../images/afterdarkrp/Devlogs/3-31-26/03.png" alt="AfterDarkRP street preview showing lit windows and a longer Ghetto 01 road read">
<figcaption>Longer street read with better window treatment and stronger nighttime atmosphere while lighting and environment optimization continue to tighten the district.</figcaption>
</figure>
<figure>
<video controls autoplay muted loop preload="metadata" playsinline>
<source src="../../../images/afterdarkrp/Devlogs/3-31-26/materials.mp4" type="video/mp4">
Your browser does not support the video tag.
</video>
<figcaption>Short material-pass preview showing the district in motion while building surfaces, LOD behavior, interior cleanup, and lighting reads keep getting dialed in.</figcaption>
</figure>
</div>

## What has not changed yet

The honest version is still the same one from the March 22 entry: deeper systems validation is gated by having a stronger playable map state first.

That means this stretch is more about **making the world testable** than about claiming a large new code milestone. The underlying systems work described in the last devlog still matters, but the immediate requirement is getting Ghetto 01 into better condition for real in-engine and eventually server-sided checks.

Right now that includes practical environment-side work such as:

- optimizing interiors before they become a bigger drag on the build,
- creating and validating LODs across the district shell,
- and tightening lights so the scene keeps its mood without wasting budget.

## Parallel site work

Outside the map itself, the public-facing site also kept moving in smaller ways during this stretch.

- The devlog/archive surface was cleaned up so entries are easier to browse by month.
- Devlog routing and supporting links were tightened up across the public site.
- Studio-facing pages continued getting maintenance while AfterDarkRP environment work stayed active.

None of that replaces gameplay progress, but it does keep the public-facing side of the project from drifting while the heavier map pass continues.

## What comes next

- Keep tightening Ghetto 01 materials, silhouettes, and intersection readability.
- Continue the interior, LOD, and light optimization passes so the map is easier to trust under live play conditions.
- Push the district further out of placeholder territory so traversal and encounter flow are easier to judge.
- Return to deeper system validation once the map supports cleaner real-world testing conditions.

This is still a map-first phase. The difference now is that the district is beginning to read less like scaffolding and more like a place that can actually support the next round of testing.
