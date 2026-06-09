---
title: "AfterDark ends May with S17 V3 sync, siege walls, traffic, and a denser NPC layer"
date: 2026-05-29
game: AfterDarkRP
excerpt: "Since the May 21 update, AfterDark has had another unusually chunky week: S17 V3 moved from pipeline direction into a heavier synced map state, tactical walls became a real Siege-style testbed, ambient traffic and NPC authoring started layering into the city, and player identity/persistence work got sturdier under the hood."
tags:
  - AfterDarkRP
  - S17 V3
  - Tactical Walls
  - NPCs
  - Traffic
---

## Since the May 21 devlog

The May 21 update was already a large one. It covered the move into the **S17 V3** pipeline, Blender sync, BlenderMCP/Blender Bridge becoming practical tools, police rappelling, early vehicle infrastructure, reputation, dialogue, business loops, NPC foundations, VFX, and optimization.

This end-of-month update is not a quiet follow-up.

The week after that post turned into another broad production push. The difference is that the work is starting to feel less like separate systems being proven in isolation and more like AfterDark's city layer being assembled into a real test surface.

Since May 21, the repo has moved through:

- S17 V3 sync and map expansion,
- a much more serious tactical wall branch,
- Siege-style bullet/C4/breach experiments,
- traffic routes, traffic lights, parking points, and ambient car behavior,
- NPC schedules, home doors, resident outings, recovery points, and police dispatch spawners,
- player identity/persistence cleanup,
- respawn-cycle stability,
- admin access work,
- and more supporting docs/tooling around the parts that are becoming real production systems.

That is a lot for one week. It also makes the month-end story pretty clear: AfterDark is no longer just trying to prove that the pieces can exist. It is starting to wire those pieces into a city that can carry pressure.

## S17 V3 became more than a pipeline label

The last devlog framed **S17 V3** as the next map direction: a Blender-synced version of the world that should be easier to iterate than the previous V2 path.

This week, that became a lot more concrete.

The S17 V3 scene picked up a large synced content pass across Blender Bridge assets, road pieces, terrain, buildings, train-station support, ghetto-west structures, prison pieces, and scene metadata. The important part is not only the number of new assets. The important part is that the map is being rebuilt around a repeatable transfer loop.

That changes the feel of production.

S17 V2 was the stretch where the world got larger and more ambitious. S17 V3 is becoming the stretch where the world gets easier to keep alive while it changes. That matters because AfterDark needs a city that can absorb layout work, route tuning, NPC placement, traffic authoring, lighting passes, and gameplay anchors without every adjustment becoming a manual recovery job.

This is still messy because all real map pipeline work is messy while the loop is being proven. But it is a better kind of messy. It is the kind where the project is paying down future friction.

## Tactical walls became a real siege testbed

The biggest visible gameplay thread this week is the tactical wall work.

The earlier direction was already clear: generic props should not be the best defensive answer forever. If AfterDark wants property defense, police pressure, Builder/Fabricator support, and criminal breaching to matter, the game needs cover that is more readable than normal prop spam and more tunable than whatever players can stack together.

This week pushed that idea much further.

The tactical wall system now has multiple branches being tested against the same gameplay idea:

- an original breakable-cell branch,
- a fake-voxel tile-removal branch,
- a shader-mask branch for bullet and breach cutouts,
- and an experimental SDF mesh branch that can replay wall damage into generated mesh and collision.

That sounds technical because it is. But the design goal is simple: make wall damage readable, controllable, and game-shaped without depending on expensive runtime mesh boolean work.

Bullets should make understandable holes. C4 should create a larger breach. Collision needs to match what players can see well enough that shooting, movement, line-of-sight, and police/criminal pressure do not feel fake. The system also needs to stay host-authoritative because money, Builder work, C4, wall health, and breach state cannot be decided client-side.

The funny part is that this went from "tactical wall direction" to "this is actually starting to feel like Rainbow Six pressure" very quickly.

That does not mean the system is done. It means the prototype finally crossed the line from abstract feature idea into something that can be filmed, tested, criticized, and tuned.

## Builder support is starting to have a real job shape

The tactical wall work also matters because it gives the **Builder/Fabricator** direction more purpose.

The intended loop is not "everyone gets a magic build menu." It is closer to a support role:

- ordinary players or property occupants can request reinforcement,
- Builders need to come to the wall and fulfill the work on-site,
- reinforcement repairs and upgrades the wall,
- no-Builder fallback can exist as a safety valve,
- and sentry installs are currently only a placeholder counter until a real turret/counterplay pass exists.

That is a better direction than turning property defense into pure menu friction. The Builder becomes someone you want in your orbit when you are trying to hold space. That creates social pressure, money sinks, and a more readable siege rhythm.

There is still an important design question around property ownership. Placement and reinforcement eligibility probably need to resolve around homes, bases, or owned property boundaries. That is not fully locked yet. The important thing for this update is that the wall system is now substantial enough to make that question worth answering.

## C4, smoke, flashbangs, and breach pressure moved with it

The siege work did not stay isolated to the wall prefab.

This week also touched C4, detonation behavior, breach visuals, smoke grenades, flashbangs, tazer data, and related weapon/prefab support. The pieces are pointing toward a more complete combat language:

- police and criminals need ways to pressure cover,
- walls need to visibly respond to that pressure,
- utility should create openings without becoming instant chaos,
- and the map still needs to preserve route value after the breach tools arrive.

The line to watch here is restraint. AfterDark needs violent tools, but it cannot let every tool erase the map. C4 should matter because it creates a committed breach moment, not because it turns every fight into a flat room-clearing routine.

That is the current shape of the work: make the breach readable first, then tune how much authority it deserves.

## Traffic is becoming an ambient city layer

Another major change this week is the first serious **traffic layer**.

This is not a full player-owned vehicle economy or carjacking system. It is a lightweight ambient vehicle layer for making the city feel less empty and giving streets more motion.

The current traffic pass adds authoring concepts for:

- traffic spawn zones,
- one-way route splines,
- route handoffs,
- parking waypoints,
- traffic lights and timing groups,
- delete zones at road exits,
- simple lane-switch attempts,
- staggered cruise speeds,
- Bronco wheel presentation while spline-driven,
- short-range headlights,
- and host-owned cleanup for traffic vehicles.

That may sound like background set dressing, but it changes how S17 reads. Roads stop being empty strips of geometry and start becoming lanes with flow, timing, danger, and visual noise.

It also gives the map a stronger test surface. If traffic can run through S17 V3 without collapsing performance or route logic, the city gains a baseline pulse that future police, crime, NPC, and business systems can play against.

## NPCs and residents got more city structure

NPC work also expanded heavily.

The earlier resident layer had home doors, route support, resident profiles, and basic outing behavior. This week pushed that into a broader authored-city model:

- home doors can carry profile, district, activity, disposition, clothing, schedule, and knock-callout behavior,
- residents can leave, return, virtualize when inactive, and rehydrate when players come back,
- resident wardrobes are becoming slot-aware instead of only a flat clothing path list,
- residents now carry presentation metadata for future voice and ambience,
- schedules can use home, work, hobby, or patrol behavior,
- patrol routes can use splines or waypoint chains,
- authored NPCs can recover through hospital recovery waypoints,
- and NPC police dispatch spawners can start populating patrol pressure.

The useful thing here is that NPCs are no longer just "place a citizen somewhere and hope it feels alive." The map is gaining authoring grammar: homes, routes, work points, patrols, parking, recovery points, and district tags.

That is exactly what S17 needs. A big map only feels like a city when its inhabitants have enough structure to appear, move, vanish, recover, and reappear without requiring every single NPC to be a bespoke handcrafted event.

## Citizen data expanded

One quieter but important part of the NPC work is the expanded resident/citizen data.

Residents now have more than a name and a route. The profile layer is starting to track presentation gender, heritage, voice set, ambient sound tags, moral disposition, activity identity, and wardrobe details. That metadata is not supposed to become gameplay authority by itself. It is there so the city can make better flavor choices later: who sounds like they belong in a district, who looks like they live there, who might be a buyer, snitch, worker, late-bar regular, night worker, or office commuter.

That matters because the long-term city direction depends on population texture. If every civilian is just a generic moving obstacle, the city will look populated but feel empty. If the data model is there, the game can slowly start selecting better dialogue, ambient sound, schedules, disguise interactions, witness behavior, or district reactions.

This is still a foundation pass. But it is the right kind of foundation.

## NPC police are pressure, not the justice system

The NPC police direction is worth calling out separately because it can easily drift into the wrong design if it is not kept bounded.

NPC police are not meant to replace player police. They are not supposed to become the source of truth for justice state. Heat and wanted state still belong to the player-facing crime/status systems. NPC contact should add pressure, last-known-position moments, chase/search behavior, and ambient police life.

That distinction matters.

The target loop is:

1. A crime or witness event raises heat.
2. Player police still get the readable dispatch truth.
3. Nearby patrol NPCs can notice a wanted player.
4. NPC responders can create short-term pressure if the authored scene supports it.
5. Losing NPC contact reduces immediate pressure.
6. Wanted state remains until normal justice/reset behavior clears it.

That gives the city teeth without letting NPCs solve the whole roleplay loop by themselves.

## Player identity and persistence got sturdier

Another quieter improvement is the player directory and persistence work.

The new player directory direction centralizes how AfterDark thinks about live players and durable accounts. Session connection IDs are still useful for active ownership and RPC paths, but durable account identity should prefer Steam IDs when the engine exposes them. Older fallback keys can be copied forward so existing save data is not orphaned when a better identity key appears.

This is not screenshot material, but it matters a lot for the kind of server AfterDark wants to be.

Wallets, jobs, admin access, respawn state, arrests, dispatch targets, persistent player data, and moderation tools all get more fragile when "which player is this?" is answered differently in different systems. The player directory gives those systems a common place to ask.

The admin whitelist work is part of the same stability story. Admin access needs to be treated as an access right, not a public roleplay identity, and it should resolve through durable account identity rather than display-name luck.

## Respawn and runtime recovery kept getting attention

There was also a practical stability pass around respawn cycles, NPC recovery, local spawn cleanup, and runtime safety.

This is the kind of work that matters most when systems start stacking:

- players need to come back cleanly,
- NPCs need to recover without leaving dead authored content permanently broken,
- traffic and spawned actors need cleanup rules,
- admin/debug surfaces need to see what is happening,
- and the game needs to avoid stale ownership or pawn state confusing the rest of the loop.

AfterDark is entering the phase where a lot of failures stop being isolated. A player respawn issue can affect justice. A stale pawn can affect dispatch. A broken NPC can affect witness behavior. A traffic cleanup mistake can affect the map. So the less glamorous recovery work is increasingly part of the feature work, not separate from it.

## There is still footage to record

Some of this needs video before it should be treated as a finished public-facing beat.

The main footage still needed for this update is:

- siege wall bullet damage,
- C4 breach behavior,
- Builder/reinforcement flow if it is readable enough,
- S17 V3 route and map movement,
- traffic running through authored roads,
- NPC/resident movement on S17 V3,
- and NPC police presence if the current scene state is stable enough to show cleanly.

The tactical wall footage matters especially because screenshots do not explain the system well. The point is the sequence: wall intact, first hits, holes, collision, breach, pressure, and the reason this is better than normal prop spam.

## What the end of May adds up to

The month started with S17 still being framed through the larger V2 map push.

By the end of May, the project is in a different place:

- S17 V3 is now the active sync direction,
- Blender Bridge is carrying a much larger part of the world pipeline,
- tactical walls have become a real siege-system prototype,
- C4 and utility tools are starting to connect to breach pressure,
- traffic exists as a first ambient city layer,
- NPC homes, schedules, routes, wardrobes, recovery, and police patrol pressure are expanding,
- player identity and persistence are less scattered,
- and the map is gaining enough authored structure that future gameplay can attach to real places instead of abstract systems.

That is a big shift.

The earlier question was "can AfterDark build enough world and systems to justify the city?" The newer question is "how do we tune all of this so the city stays readable, performant, and fun under pressure?"

That is a better problem to have.

## What comes next

The immediate next step is not to invent a new headline. It is to make this week's work more presentable and more testable.

- Capture clean footage of tactical walls, C4 breaches, traffic, and NPC movement.
- Keep S17 V3 sync stable while the map continues to change.
- Tune tactical wall visuals and collision until the holes are believable from normal play angles.
- Keep Builder reinforcement scoped as a support-role loop instead of a generic construction menu.
- Keep traffic ambient and bounded before adding heavier behavior like panic, damage, and player interaction.
- Keep NPC police as pressure layered on top of player police, not a replacement for the justice loop.
- Keep expanding resident data only where it helps the city feel authored, not where it creates unnecessary simulation debt.

The end of May is heavier than expected, but in a good way. A lot of the work is still rough, and some of it needs footage before it should be public-facing. But the project now has a much clearer direction: S17 V3 as the synced city, tactical walls as the first serious siege surface, traffic as ambient motion, and NPCs as the beginning of a city population instead of decoration.
