---
title: AfterDarkRP pushes S17 and Ghetto 01 toward a testable state with major asset work, LODs, and systems support
date: 2026-03-31
game: AfterDarkRP
excerpt: "This week was heavier than a simple visual pass: S17 picked up a major asset and scene push across Ghetto_01, Downtown, and TrainStation alongside baseline LOD coverage, light/time optimization, Blender cleanup, connector planning, atmosphere work, and supporting gameplay/UI changes aimed at making Ghetto_01 testable instead of fragile."
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

That core reality has not changed, but the week itself was broader than the screenshots make it look. This was not just a materials pass or a light polish week. **A large part of this stretch was real production groundwork for getting S17, and especially Ghetto_01, into a testable state.**

The map reads better now, but more importantly it is being assembled into something sturdier: more roads, more connectors, more usable block structure, more props, more background support, more baseline LOD coverage, and more systems work around the world that the eventual playtests will actually depend on.

## Major S17 asset and scene push

The clearest thing the game repo shows from this stretch is that the work was not small. The main March 31 commit added a **large S17 asset drop** and pushed the scene itself forward across multiple districts.

That includes:

- new **street lights** and **traffic lights** with LOD variants,
- new **background buildings** to improve the skyline and wider city shell,
- a large batch of new **Downtown** roads and junction pieces,
- a large batch of new **Ghetto_01** roads and junction pieces,
- additional **TrainStation** road and building support,
- terrain model updates,
- new prefabs for street lighting and dev/test support,
- and direct scene work in `s17-afterdarkrp.scene`.

That matters because this is the kind of work that turns a district from a rough idea into an actual place with routes, sightlines, connectors, pressure points, and enough structure to start trusting the map under movement.

## Optimization work is part of the story

This pass was not only about making screenshots look better. A real part of the work went into **interior optimization**, **LOD creation**, **light optimization**, and a broader **atmosphere pass** so the district has a better chance of holding up once more of the city is active at once.

- Each building is being pushed toward having at least a **basic LOD setup** so the wider district can be viewed and navigated without every structure paying full cost all the time.
- Interior spaces are being trimmed and simplified so they stop carrying unnecessary cost before they are even in full gameplay use.
- Lighting is being optimized so the nighttime atmosphere can stay intact without turning every block into a performance problem or dumping huge frame loss into the minimum case.
- Atmosphere work is being pushed alongside that optimization so the district keeps a stronger nighttime mood instead of reading like pure greybox utility while the city is still under construction.

The practical target is simple: **do not lose 90 frames at the minimum just because the district exists**. That is why this phase matters. Ghetto 01 is supposed to become playable space, not just a set of promo angles. If the district cannot hold together under real movement and real camera reads, then deeper systems testing still gets delayed.

The repo side of this week also backs that up directly. This stretch added dedicated **light optimization** code and time-system changes instead of leaving the performance side as a vague future fix.

## Cleanup work that is not obvious in the screenshots

Some of the most important work from this stretch is the least visible in the new captures.

- A lot more cleanup was done in **Blender** to get assets, structure, and scene pieces into a better state before they become harder to maintain later.
- Connector planning for the map moved forward so district-to-district flow and future expansion are being thought through more deliberately instead of being improvised at the end.
- Material and scene support work continued in parallel so new roads, buildings, and world pieces could actually slot into the active map instead of just existing as loose exports.

That kind of cleanup does not read as loudly as a new street angle, but it is part of the same effort: make Ghetto 01 easier to finish, easier to extend, and easier to trust once real testing starts.

## The world systems moved too

This week was not only map work. The same stretch also touched a lot of the support code that makes the district usable once people are actually in it.

- crime mission systems moved,
- police dispatch and witness systems moved,
- multi-use interaction changed,
- door logic changed,
- business operator job files and panels changed,
- and startup audit / dev support work also moved.

That is important because the current milestone is not "make a nice screenshot." It is **make a map state that gameplay systems can survive inside**. Environment work and gameplay support work are converging instead of advancing as separate tracks.

## Materials and street read are improving

The clearest change in the latest captures is that **Ghetto 01 is starting to hold together as an actual street space**. Buildings have more convincing surface treatment, window reads are stronger, traffic lights and intersections are giving the roads more structure, the atmosphere pass is helping the district feel less sterile, and the district silhouette is less abstract than it was in the previous post.

It is still not a final-art pass, and it is still visibly in progress, but the environment is doing a better job of communicating:

- where routes open up,
- where intersections matter,
- how the block massing frames the player,
- and what kind of district identity this part of the city is aiming for.

That matters because map work at this stage is not just decoration. It is about getting the space readable enough that roleplay movement, pressure, and encounter flow can actually be evaluated.

## New captures

:::gallery
image|../../../images/afterdarkrp/Devlogs/3-31-26/01.png|AfterDarkRP Ghetto 01 intersection preview with improved building materials and traffic lights|Intersection view showing stronger material definition, clearer traffic control, and a more usable sense of street scale while optimization work continues under the hood.
image|../../../images/afterdarkrp/Devlogs/3-31-26/02.png|AfterDarkRP district angle showing building massing and road layout in Ghetto 01|Another district angle where the road layout, sidewalk edge, and corner massing are starting to read like a city block instead of a temporary shell, with LOD work helping the wider view hold together better.
image|../../../images/afterdarkrp/Devlogs/3-31-26/03.png|AfterDarkRP street preview showing lit windows and a longer Ghetto 01 road read|Longer street read with better window treatment and a stronger atmosphere pass while lighting and environment optimization continue to tighten the district.
video|../../../images/afterdarkrp/Devlogs/3-31-26/materials.mp4||Short material-pass preview showing the district in motion while building surfaces, LOD behavior, interior cleanup, and lighting reads keep getting dialed in.
:::

## What has not changed yet

The honest version is still the same one from the March 22 entry: deeper systems validation is gated by having a stronger playable map state first.

That means this stretch is still more about **making the world testable** than about claiming one single headline feature. But calling it "just environment work" would undersell it. The underlying systems work described in the last devlog still matters, and this week added more of it, but the immediate requirement is still getting Ghetto 01 into better condition for real in-engine and eventually server-sided checks.

Right now that includes practical environment-side work such as:

- optimizing interiors before they become a bigger drag on the build,
- creating and validating LODs across the district shell,
- tightening lights so the scene keeps its mood without wasting budget,
- pushing the atmosphere pass so the district feels intentional while still in active production,
- cleaning environment work in Blender before it compounds,
- and planning map connectors so the district grows in a controlled way.

## Parallel site work

Outside the map itself, the public-facing site also kept moving in smaller ways during this stretch.

- The devlog/archive surface was cleaned up so entries are easier to browse by month.
- Devlog routing and supporting links were tightened up across the public site.
- Production tracking now runs through **Linear**, which gives the project a cleaner way to track map, systems, and support work instead of leaving planning scattered.
- Studio-facing pages continued getting maintenance while AfterDarkRP environment work stayed active.

None of that replaces gameplay progress, but it does keep the public-facing side of the project from drifting while the heavier map pass continues.

## What comes next

- Keep integrating the larger S17 road, prop, and district shell buildout so the map stops feeling piecemeal.
- Keep tightening Ghetto 01 materials, silhouettes, and intersection readability.
- Continue the interior, LOD, and light optimization passes so the map is easier to trust under live play conditions.
- Keep pushing the atmosphere pass so the district mood lands without wasting performance.
- Keep cleaning assets and environment structure in Blender where the screenshots still hide the real work.
- Push connector planning further so the map can expand without route logic turning messy later.
- Push the district further out of placeholder territory so traversal and encounter flow are easier to judge.
- Return to deeper system validation once the map supports cleaner real-world testing conditions.

This is still a map-first phase. The difference now is that the work is no longer just about making the district look better. It is about building enough world, performance headroom, and gameplay support around **S17 and Ghetto_01** that the next round of testing is worth doing.
