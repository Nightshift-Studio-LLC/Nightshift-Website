---
title: AfterDarkRP map work continues while code progress narrows around Ghetto 01
date: 2026-03-22
game: Nightshift
excerpt: Map work is still moving, and code is still progressing, but AfterDarkRP has slowed around a narrower target: getting Ghetto 01 playable and reaching the point where server-sided code can actually be tested. Weed growing is close, with the sell loop still left to lock.
tags:
  - Nightshift
  - AfterDarkRP
  - Map
  - Client Work
  - Website
hero: ../../../images/afterdarkrp/Devlogs/3-18-26/ghetto_01_preview-ingame.png
---

## Where things stand

The honest short version is that **map work is still moving**, and **code is still making progress**, but AfterDarkRP has not had the same amount of uninterrupted focus lately because client work has been taking priority inside the studio. Since the last public post on **March 13, 2026**, progress has been real, but it has been narrower and more environment-facing than systems-heavy.

That is why this entry is mostly about the city itself. The main visible movement right now is continued work on the map, especially around the Ghetto 01 space, where blockout, proportions, and street readability are getting pushed forward. The practical slowdown is that deeper system testing only goes so far until Ghetto 01 is playable enough to support it and until server-sided code can actually be run and checked properly.

## New map reads

The latest captures are a better read on where the environment is landing than another long systems list would be. They show the district taking on a more usable shape, but they also make clear where the current blockers are: route control, road layout, and getting the space into a state where live server-side testing starts making sense.

<div class="devlog-gallery">
<figure>
<img src="../../../images/afterdarkrp/Devlogs/3-18-26/ghetto_01_preview-ingame.png" alt="AfterDarkRP Ghetto 01 in-engine street preview">
<figcaption>Latest in-engine Ghetto 01 street read with the district still in active blockout and material placeholder territory.</figcaption>
</figure>
<figure>
<img src="../../../images/afterdarkrp/Devlogs/3-18-26/ghetto_01_preview5.png" alt="AfterDarkRP Ghetto 01 preview showing another district angle">
<figcaption>Another new Ghetto 01 angle showing the current massing, street rhythm, and overall district silhouette.</figcaption>
</figure>
<figure>
<img src="../../../images/afterdarkrp/Devlogs/3-18-26/roadblock.png" alt="AfterDarkRP roadblock map progress preview">
<figcaption>Roadblock pass showing one of the environmental control points being shaped while the district moves toward playable flow.</figcaption>
</figure>
</div>

The goal at this stage is not final art polish. It is to make route shape, skyline breakup, street pressure, and district identity feel right before a deeper materials and detail pass.

## Code progress is still happening

This is not a case where map work replaced code entirely. Code is still moving. The main difference is that the remaining programming work is increasingly gated by playability and test conditions instead of just implementation time.

The clearest example is weed growing. The loop is close, and the main missing piece right now is the **sell loop** rather than the whole production chain. That is a much better place to be than a few weeks ago, but it also means the next useful testing pass depends on having a space that can actually support the loop under real server conditions.

## Other changes since March 13, 2026

Even with less direct AfterDarkRP feature time, the public-facing side of the project and studio has still changed quite a bit since the last blog post.

- The AfterDarkRP site was converted to cleaner directory-style routes across the main public pages, which makes the project read more like a real product surface instead of a loose set of files.
- The Nightshift site went through a broader visual overhaul across the studio, game, contact, and devlog pages.
- Studio-facing surfaces now make website services, direct support, and FAB tooling more visible on the main site.
- Placeholder sample art is now labeled more clearly across the game pages and older devlog entries so mock assets do not read like final production captures.

## What that means for AfterDarkRP

The tradeoff is straightforward: some of the last stretch went into client work and public-facing studio cleanup instead of deep server feature pushes. I would rather say that directly than pretend there was a huge gameplay milestone where there was not.

AfterDarkRP is still active. The difference is that the current progress is concentrated on getting **Ghetto 01 playable**, keeping code moving where it can, and reaching the point where **server-sided code can actually be run and tested** instead of assumed.

## What comes next

- Keep pushing the map until Ghetto 01 has a stronger playable read in-engine.
- Finish the weed-growing sell loop once the map and testing conditions support a cleaner pass.
- Return more direct focus to AfterDarkRP systems as client work pressure eases.
- Continue tightening the public-facing site so the project stays readable while development pace shifts week to week.

The work is still moving. It is just moving through the map, testability, and studio schedule first.
