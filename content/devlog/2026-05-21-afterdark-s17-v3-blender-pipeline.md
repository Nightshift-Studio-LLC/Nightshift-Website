---
title: "AfterDark moves into the S17 V3 pipeline with Blender sync, police rappelling, and deeper systems work"
date: 2026-05-21
game: AfterDarkRP
excerpt: "Since the April 27 devlog, AfterDark has moved from a larger S17 V2 map push into a bigger production pipeline shift: S17 V3 is being built around Blender sync, BlenderMCP and Blender Bridge are becoming real workflow tools, police rappelling is in, vehicles are spawning, and the codebase has picked up major foundations for reputation, NPCs, business loops, tactical cover, optimization, and future district control."
tags:
  - AfterDarkRP
  - S17
  - Blender
  - Systems
  - Vehicles
  - Police
---

:::youtube
https://www.youtube.com/watch?v=XGttfrv_8Zk|AfterDark May 21 development preview|Short development preview for the May 21 AfterDark update.
:::

## Since the April 27 AfterDarkRP devlog

The last public update was mostly about **S17 Version 2**: bigger world scale, lighting and material passes, map rules, prop/toolgun policy, and the first real resident NPC/navigation layer.

This update is wider than that.

The short version is that AfterDark is not just getting more content dropped into the same workflow. The workflow itself is changing. S17 is moving toward **Version 3**, and the reason is practical: the new version is being built around a Blender-synced pipeline so map iteration can happen faster, with less manual friction between asset work, scene work, and in-game testing.

That matters because AfterDark has a lot of ground to cover. The map has to support district-level control, police response, criminal movement, NPC presence, business loops, and tactical pressure without turning into an open-world free-for-all. The work since April 27 has been about getting the project into a shape where those pieces can start landing on a sturdier foundation.

There is still a lot to polish. Some of this is rough. Some of it is early. But the direction is much clearer now.

## S17 is moving to Version 3

S17 V2 proved the larger direction was worth pursuing, but it also made the production problem obvious: a map this large cannot be fun to iterate on if every meaningful change requires too much manual transfer, cleanup, and re-authoring.

That is why the project is moving toward **S17 V3**.

The goal is not "new version number because new version number." The goal is to make the map easier to keep alive while it is changing. S17 V3 is being aimed at a tighter Blender-to-s&box flow, where world work can be adjusted, exported, synced, tested, and revised faster.

That should matter for almost every part of AfterDark:

- street and district layout,
- tactical wall and cover placement,
- police route planning,
- NPC spawn and schedule authoring,
- scene anchors for businesses, vendors, crime targets, and meetings,
- lighting and visibility passes,
- and eventually territory control.

The older approach was getting the world larger. The next approach has to make the world faster to iterate.

## BlenderMCP and Blender Bridge are now part of the production story

The biggest behind-the-scenes change is that **BlenderMCP is now a real thing in the workflow**.

That means Blender is no longer just a separate art tool sitting outside the game pipeline. It can be directed, inspected, and used more deliberately from the tooling side. That should speed up repetitive work, review passes, asset cleanup, and the kind of map iteration that used to cost too much attention per change.

Alongside that, **Blender Bridge** is becoming part of the AfterDark pipeline. This is the piece that makes the S17 V3 direction more practical: content can move toward the game with a more explicit sync path instead of relying on a fragile manual loop.

This does not mean everything is suddenly automatic or solved. It means the pipeline is finally moving toward the kind of loop AfterDark needs:

1. change the world,
2. sync the world,
3. test the world,
4. fix what broke,
5. repeat without losing the night to glue work.

That is the boring production advantage that becomes a big deal over time.

## Character work is also getting a real pipeline

Another important piece is the current character pipeline work: adapting **Character Creator 5** output into Sandbox/AfterDark in a way that can actually hold up in the project.

This is not just "new character assets." It is a pipeline problem:

- getting character exports into the right shape,
- handling model and animation expectations,
- validating the s&box side,
- making sure characters are not just visible but usable,
- and building a path where future character work does not have to be rediscovered from scratch.

That matters because AfterDark needs more than map geometry. It needs police, criminals, civilians, vendors, business NPCs, tutorial characters, and eventually district-specific life. If the character pipeline stays fragile, all of that gets slower. If the pipeline becomes reliable, the city can start gaining population and identity much faster.

## Standalone Sandbox parity is still the base layer

Under all of this, AfterDark is still being driven as a **standalone s&box game that mounts Facepunch Sandbox**.

That pivot is still important. The project is not trying to rebuild every proven Sandbox system from scratch. The direction is to mount the useful base, borrow what already works, and keep AfterDark's DarkRP systems authoritative where they need to be authoritative.

That work included the earlier standalone/parity push:

- a project-owned sandbox-style player pawn,
- spawn/menu/HUD reconciliation,
- duplicate and stale pawn cleanup,
- reconnect and ownership guardrails,
- native HUD suppression where it conflicts with AfterDark UI,
- and a continued push to keep stock Sandbox behavior available where it helps.

That foundation is what lets the rest of the project move. Vehicles, weapons, police tools, NPCs, UI, and map-authored systems all get more painful if the base player/bootstrap layer is unreliable.

## Police rappelling is the feature highlight

The most visible gameplay feature in this pass is **police rappelling**.

This is already in code as a government-job gated rappel kit. The kit can deploy a rope, attach/detach the player, remove the rope, and keep the rappel state on the pawn so the player can swap away from the kit while still being constrained by the deployed rope.

:::youtube
https://youtu.be/EdP7hvlbXYY|Police rappelling test|Police rappelling test showing the new government-job traversal kit in motion.
:::

That opens up a more interesting police role than "run directly through the front door every time."

The direction is tactical traversal, not superhero traversal. I want police to have better ways to enter, pressure, and reposition, but I do not want AfterDark to become a game where everyone is flying across the map or bypassing the shape of the city for free.

That distinction is important:

- Police need response tools.
- Criminals need escape pressure.
- The map still needs to feel gridlocked.
- Districts still need to matter.
- Vertical movement should create moments, not erase the city.

Rappelling fits that because it is situational. It is about a wall, an entry, a rooftop, a controlled approach, or a tactical angle. It is not meant to turn the whole map into a playground of instant movement.

There may be room later for things like parachutes, but that has to be handled carefully. Traversal can ruin a map fast if it stops respecting the map.

## Tactical walls, nerfed props, and the destruction direction

The next big combat direction is tactical cover.

AfterDark is moving toward a setup where generic player props are not the best answer to every fight. There is now a foundation for **soft-cover prop behavior**, where generic props can be tuned down with lower health and bullet passthrough behavior instead of becoming perfect protection.

That matters because DarkRP-style building can easily become a meta game of "who knows the oldest prop trick."

The classic problem is the fence situation: players build a thin prop setup that lets them see feet or abuse visibility while still blocking too much return pressure. At some point, smart players are going to build smart. There is no magic rule that stops every clever angle.

The better answer is to make the intended tactical pieces more attractive than the worst prop habits.

That is where **tactical walls** and future destruction come in. If players have stronger, more readable, more game-shaped cover options, the game can push them toward siege-like pressure instead of weird prop-fort behavior.

The target is not full chaos destruction immediately. The target is a more controlled combat language:

- generic props are useful but weaker,
- tactical walls become the better defensive choice,
- police tools create pressure,
- criminals can still build and hold space,
- and destruction becomes something the game can tune instead of something that accidentally breaks the whole loop.

Explosives are not the immediate headline here. The direction is there, but it needs to land at the right time and in the right way.

## Vehicles are now real gameplay infrastructure

Vehicles also deserve more credit than the current draft gave them.

AfterDark now has legitimate vehicles spawning through the project, and the system is already more than "we imported a truck." There is vehicle controller work, spawner/vendor state, monowheel work, vehicle UI state, and early upgrade-system direction.

The important design point is that vehicles should probably lean more police-sided than criminal-sided, at least at first.

That is not because criminals should have no mobility. It is because AfterDark depends on the map having pressure and shape. If everyone can cross the city too freely, then districts stop mattering, police response becomes noise, and the continuous map loses the gridlocked feeling it needs.

The better role for vehicles is as a **macro response tool**:

- police can get across the city fast enough to matter,
- criminals still care about route choice and local escape,
- districts remain readable,
- and vehicles support escalation without replacing the whole map.

This is especially important for the long-term district-control plan. If territory and NPC behavior eventually respond to who controls what area, the map needs to keep its sections meaningful. Vehicles should help connect those sections, not flatten them.

## Reputation is rough, but important

Reputation also landed as a real foundation.

It is rough right now, but it matters because it gives the game a place to start remembering player behavior beyond one immediate interaction. The current version includes a good/evil style track, a catalog of reputation actions, persistence hooks, notifications, and links into crime/fine/dialogue behavior.

That opens the door for a lot of future systems:

- police abuse of power,
- criminal behavior,
- helping civilians,
- public service,
- business protection,
- dialogue choices,
- and eventually district/NPC reactions.

I do not want to oversell it. Reputation is not suddenly a finished morality system. It is the beginning of a memory layer the rest of the game can start using.

That is still a big deal.

## Dialogue groundwork is pointing toward the spy role

There is also new work around cinematic dialogue, progression flags, safe-mode conversations, and dialogue-driven reputation effects.

This connects to something bigger I have been planning: the **spy role**.

The spy role is one of the ideas that could make AfterDark feel more distinct than a normal DarkRP server, but it cannot be the first thing the game asks players to understand. Everything else has to work first.

The police/criminal loop has to work.

The map has to work.

NPCs have to work.

Businesses have to work.

Traversal has to work.

If those foundations are weak, the spy role becomes noise. If those foundations are strong, it can become a role built around infiltration, dialogue, information, reputation, and social pressure instead of just another combat loadout.

So for now, the important part is the foundation: dialogue state, progression tracking, safe interaction windows, and reputation effects.

## Business loops are getting more physical

Business gameplay also picked up more concrete support.

There is work now around business telephones, meeting points, worker NPC support, operator desks, and intel turning into legal city meetings. That is a better direction than business being only a menu or payout timer.

The goal is for businesses to create reasons to move, defend, coordinate, and care about territory.

That matters for the long-term shape of AfterDark. Civilian/business play should not feel like a detached side job while police and criminals get all the map pressure. It should eventually feed the same city:

- where your business is,
- who can reach it,
- who protects it,
- who controls the district,
- and whether the local NPC layer makes that space feel alive or threatened.

The current business work is still foundation, but it is pointing in the right direction: more physical, more contestable, more connected to the actual world.

## NPCs are becoming part of the map plan

NPC work has continued in a few directions at once.

The earlier devlog talked about resident NPC and route authoring. Since then, the code has kept expanding around NPC runtime safety, schedules, patrol-style behavior, death visuals, fear/knockout behavior, tutorial NPCs, vendor NPCs, and visual LOD.

The visual LOD side is important because S17 cannot be full of expensive characters if the frame rate collapses. The city needs people, but those people have to be affordable enough to exist in numbers.

Longer term, this ties into district control.

The plan is for district control to eventually affect how NPCs spawn, who appears where, and how territory feels. If one group controls a district, that should eventually matter. Not just as a UI label, but as the local population, pressure, opportunities, and risks.

That is not all built yet. But the pieces are starting to point at it.

## Visual effects got a stronger first pass

The visual effects work also moved.

Gore is now in the project in a much more concrete way: blood pools, decals, dismemberment support, neck-cap assets, blood growth behavior, bone-follow helpers, and NPC death visual support.

It is not polished yet. It is not final. But the violet gore direction is starting to exist in the project instead of only in the target aesthetic.

That will get extended a lot over time.

There was also weapon/combat VFX work, including tazer tracer and muzzleflash support. These details matter because AfterDark depends on readable pressure. If a weapon fires, if a player gets hit, if a police tool is used, or if a scene turns violent, the feedback needs to be visible enough to read without becoming visual clutter.

## Optimization is now part of the design work

The optimization work since the last devlog is not just cleanup. It directly supports the design.

S17 V3 can only work if the map can carry more geometry, more light, more NPC presence, more VFX, more UI, and more gameplay anchors without falling apart.

Recent work includes:

- fixing the animation error that was dragging the project down,
- runtime point-light budgeting,
- light optimizer improvements,
- NPC visual LOD and proxy behavior,
- world panel visibility and culling,
- native HUD suppression work,
- local spawn cleanup,
- frame-rate reclaim passes,
- and broader scene cleanup.

This matters because AfterDark's city needs density. It needs dark streets, lit interiors, NPCs, props, vehicles, UI, police pressure, and criminal escape routes. Optimization is what lets those things coexist instead of forcing the map to become empty just to run.

The practical result is already showing up: after the animation error fix and the latest optimization work, the project is back around **130 FPS** in the current test path. That number is not a final benchmark, but it is a good sign that S17 V3 can keep getting heavier without immediately collapsing under its own ambition.

## The codebase changed a lot

There has also been a lot of less-visible code movement.

Some of the bigger areas:

- the full NSDarkRP to AfterDark rename,
- standalone Sandbox parity,
- pickup model replication,
- UI theme and HUD work,
- vehicle spawning and upgrade direction,
- police rappel kit and rope state,
- tazer damage/VFX support,
- soft-cover prop ballistic profiles,
- reputation and persistence,
- cinematic dialogue and progression,
- business telephone and meeting loops,
- NPC visual/runtime systems,
- player outfit/status/respawn handling,
- crime, dispatch, weed, and mayor law iteration,
- Blender Bridge and MCP tooling,
- and character receiver tooling for the new character pipeline.

That list is long because the project is in a broad foundation phase. It is not a clean single-feature sprint. It is the kind of messy but necessary phase where a lot of systems get their first serious shape at the same time.

## What this all adds up to

The April 27 update was about getting the larger world direction moving.

This update is about making that direction more buildable.

AfterDark now has a clearer path toward:

- **S17 V3** as the Blender-synced map direction,
- faster world iteration through BlenderMCP and Blender Bridge,
- a real character import/adaptation pipeline,
- police traversal through rappelling,
- vehicles as controlled response mobility,
- tactical cover and eventual destruction pressure,
- reputation/dialogue foundations,
- business loops that happen in the world,
- NPC systems that can later support district behavior,
- stronger VFX identity,
- and performance systems that make the city more plausible.

It is a lot. It is also not all finished.

But it feels like the project is moving out of "can this exist?" and into "how do all these parts start reinforcing each other?"

## Note from the dev

Client work has still been a large part of the available time, so this has not been a clean full-month sprint on AfterDark. The difference is that this last week finally had more focused project time again, and that window turned into a productive one: the S17 V3 pipeline direction got clearer, the Blender sync work started mattering directly to the map, rappelling became a visible police feature, vehicles became more real, and several of the deeper systems started connecting instead of sitting as isolated experiments.

## What comes next

The immediate priorities are about turning these foundations into a playable shape:

- keep S17 V3 synced cleanly with Blender,
- use the rappel feature as the first clear police traversal highlight,
- keep traversal controlled so the map stays district-bound instead of becoming too open,
- push tactical walls and prop nerfing toward a better siege-style combat language,
- keep vehicles useful without letting them erase route pressure,
- continue the CC5-to-Sandbox character pipeline until it is boring and repeatable,
- polish the violet gore/VFX direction,
- keep reputation rough but connected,
- and keep district control in view without pretending it is already finished.

The feature highlight for this round will probably be police rappelling because it is quick to understand. You can see it in a short clip and immediately understand what it changes.

The larger story is slower, but more important: AfterDark is building the pipeline and systems it needs to become a real city instead of a pile of disconnected features.
