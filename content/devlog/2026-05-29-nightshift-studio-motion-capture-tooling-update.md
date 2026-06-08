---
title: "Nightshift studio update: motion capture, character tooling, and the next production layer"
date: 2026-05-29
game: Nightshift
excerpt: "A more personal studio update on the production side: Nightshift is starting work on a motion capture rig, continuing to build the character and Blender tooling stack, and looking at the remaining gaps around clothing, hair, and faster content creation."
tags:
  - Studio
  - Motion Capture
  - Blender
  - Tooling
  - Characters
draft: true
---

## Studio note

This is a different kind of update from the AfterDark end-of-month devlog.

The AfterDark post is about the game: S17 V3, tactical walls, traffic, NPCs, player data, and the week-to-week progress inside the actual project. This one is more personal and more studio-facing. It is about the production layer around the game.

Nightshift has been building toward a tool stack where a small team can make more than a small team normally should be able to make. That has been the quiet project underneath the visible one.

The game is the point, but the studio tooling is what decides how fast the game can become real.

## The honest schedule note

The practical wrinkle is that this studio/tooling work is happening while day-job operations are taking more focus than expected. We had already started moving around a new POS direction there, then that choice got dropped, which means the evaluation, migration planning, cleanup, and decision process has to happen again.

Since this is internal operations work, not an outside client project, it is not really "client work" interrupting the game. It is work I am responsible for suddenly needing priority. Nightshift is still moving, but the time split is real now. Progress is still happening; it is just sharing space with a bigger operations reset than expected.

## The next big piece is motion capture

The next major studio/tooling push is a **motion capture rig**.

That feels like one of the final big production pieces we need before the character side of the pipeline starts feeling complete enough to trust. We already have a lot of the surrounding pieces taking shape: Character Creator, iClone, Blender, BlenderMCP, Blender Bridge, s&box import/receiver work, and the AfterDark-side character pipeline.

Motion capture fills a different gap.

Animation is one of the places where a project can look expensive or cheap very quickly. A map can be rough and still communicate intent. A system can be early and still be readable. But bad character motion is hard to hide. It affects combat, dialogue, police action, civilian life, cinematics, roleplay staging, and every future trailer beat.

The goal is not to become a huge mocap studio overnight. The rig will be built over time, starting with **six SlimeVR Butterfly IMU sensors** and expanding from there as the workflow proves itself.

The software side is just as important as the hardware. The current direction is to run a Nightshift fork of the open-source SlimeVR stack and connect that into **Agentic Blender**, so capture, cleanup, retargeting, and export prep can become part of the same controllable production loop instead of a pile of disconnected apps.

The practical goal is to build a rig that lets Nightshift capture usable movement, clean it up, retarget it, and feed it into the character pipeline without every animation beat becoming a separate mountain.

That matters for AfterDark because the game needs a lot of human behavior:

- police movement,
- criminal intimidation,
- civilian idle life,
- shop and business behavior,
- social scenes,
- takedowns and custody,
- tazer/shock reactions,
- cinematic walk cycles,
- and small ambient gestures that make a city feel less empty.

Buying or borrowing animation packs can help, but it will never cover everything. At some point the studio needs a way to make its own motion.

## Why this is a studio milestone, not just a gadget

The mocap rig matters because it changes what kinds of ideas are cheap enough to try.

Without capture, every custom human action has a cost wall in front of it. You either find an existing animation that is close enough, hand-key something, or cut the idea down until it fits the assets you already have.

With capture, the question becomes different:

- Can we act it out?
- Can a six-sensor starting rig capture enough useful body motion to justify the next expansion?
- Can we clean it up?
- Can we retarget it?
- Can we get it into s&box reliably?
- Can we reuse it across roles, NPCs, cinematics, and gameplay?

That is a healthier production question. It still has work inside it, but it points toward repeatable content instead of one-off survival.

It also fits the larger Nightshift approach: build the pipeline once, then let the pipeline make more ambitious work possible later.

## Character tooling is getting closer

This also connects to the current character work.

The studio has been pushing toward a character pipeline where imported characters are not just visible, but usable: correct scale, usable skeletons, animation graph/list setup, working renderers, usable body/clothing structure, and a repeatable s&box receiver path.

That pipeline is still a work in progress, but it is no longer theoretical. The goal is to make character import boring.

That sounds unromantic, but it is exactly what production needs. If every character export needs a fresh investigation, then the game cannot scale character variety. If the pipeline becomes boring, the city can gain police, residents, vendors, criminals, business workers, tutorial NPCs, and cinematic characters without each one becoming a crisis.

Motion capture sits on top of that. It only becomes truly useful if the characters receiving the animation are reliable.

## Clothing is probably the other big gap

The other remaining character-production gap is clothing.

The likely answer is still **Marvelous Designer**, but that is not locked as the only possible path. It may be the best tool for high-quality garment work, especially if the character pipeline starts needing more believable jackets, uniforms, streetwear, dresses, tactical gear, and layered outfits.

But there is another path worth keeping open: continuing to develop the **Blender MCP** side until clothing and hair workflows can be accelerated more directly inside Blender.

That does not necessarily mean replacing dedicated clothing tools. It might mean using BlenderMCP to handle repetitive setup, cleanup, fitting, naming, validation, export prep, and s&box-specific checks around whatever garment source we use.

The real decision is not "Marvelous Designer or Blender." The real decision is:

- what gives us the fastest repeatable character clothing pipeline,
- what gives us believable results without overbuilding,
- what can survive changes to body shape, animation, and export rules,
- and what fits a small studio that needs production leverage more than tool purity.

Marvelous Designer is probably still part of that answer. BlenderMCP may become the glue that makes it practical.

## Hair is part of the same question

Hair belongs in this conversation too.

It is easy to treat hair as a cosmetic detail until characters start appearing in close shots. Then it becomes one of the fastest ways to tell whether the pipeline is holding up.

The studio does not need final answers on every hair workflow right now, but it does need to avoid painting itself into a corner. Hair should be considered alongside clothing, character import, mocap retargeting, and NPC population variety. The goal is not just "make one good hero character." The goal is to eventually support a city full of people with enough variation that the world does not feel cloned.

That means the clothing/hair decision has to respect scale.

## BlenderMCP is becoming more than an experiment

BlenderMCP started as a way to make Blender more controllable from the tooling side. It is increasingly becoming part of the studio's actual production direction.

For AfterDark, that already matters in map work, asset cleanup, bridge validation, and iteration loops. For the wider studio, it could matter in character fitting, clothing prep, retarget checks, batch export cleanup, naming hygiene, scene validation, and maybe eventually hair and garment support.

The larger pattern is important:

Nightshift does not just need better assets. Nightshift needs better ways to make, inspect, fix, and move assets.

That is why the tooling stack matters so much. Every hour saved in repetitive transfer work becomes an hour that can go into gameplay, environment polish, animation, or actual design decisions.

## The studio direction

The studio direction is becoming clearer:

- use AfterDark as the live proving ground,
- keep the public site/devlog as the record of progress,
- keep Blender and s&box connected through better bridge tooling,
- build character import until it is repeatable,
- add mocap so custom motion becomes practical,
- solve clothing and hair in a way that scales,
- and keep using tooling to make ambitious work possible with a small footprint.

That is the real studio update.

The goal is not just to make one game by brute force. The goal is to build a production environment where each successful pipeline makes the next piece easier.

S17 V3 is part of that. Tactical walls are part of that. NPCs are part of that. Character import is part of that. Motion capture is the next obvious piece because animation is where the world starts needing human texture instead of only systems.

## What comes next

The next step is to make the mocap direction practical:

- decide what the first rig needs to capture well,
- start with the six SlimeVR Butterfly IMUs and document what motion quality that first kit can actually deliver,
- keep the first target focused on useful AfterDark movement instead of trying to solve every animation case,
- keep the Nightshift SlimeVR software fork pointed at Agentic Blender instead of treating capture as a manual side workflow,
- test the retarget path into the current character pipeline,
- identify what cleanup can happen in Blender,
- decide where iClone/Character Creator fit in the mocap loop,
- and keep the clothing/hair decision open until the production tradeoffs are clearer.

This is still early enough that the exact tool choices can change. The direction is the important part: Nightshift is moving from isolated creative tools toward a connected studio pipeline.

That is the piece I am most excited about. The game gets better when the studio gets faster, and the studio gets faster when the pipeline stops fighting every new idea.
