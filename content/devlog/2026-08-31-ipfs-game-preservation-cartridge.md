---
title: "InterPlanetary File System and game preservation: the cartridge that outlives the store"
date: 2026-08-31
game: Nightshift
draft: true
excerpt: "A Nightshift concept for a physical game cartridge built around an immutable IPFS release manifest, local verified play, visible preservation runway, and long-term stewardship that can survive the company providing it."
tags:
  - Nightshift
  - Game Preservation
  - IPFS
  - Physical Media
  - Distribution
  - Studio Concepts
---

:::highlight-blue
## The idea

- Give a game release a permanent physical identity instead of tying it to one storefront.
- Store an immutable release manifest and IPFS CID on a physical cartridge.
- Download, verify, and cache the game so it remains playable offline after retrieval.
- Show how long the release has been preserved and how much funded pinning runway remains.
- Let owners contribute directly to continued replication, retrieval testing, and storage.
- Support official publisher signatures and royalties to the original IP owner.
- Publish an open recovery protocol so the archive can survive Nightshift itself.
:::

## A physical identity for software

Nightshift keeps coming back to the same problem with game preservation: digital software is still treated as if it belongs to the storefront instead of the player.

A customer buys a game, but the useful lifetime of that purchase often depends on one company's servers, account system, authentication path, and willingness to keep an old release available. Stores close. Hardware fails. Accounts get migrated. Download servers disappear. Patches replace earlier builds. Entire versions can become difficult or impossible to recover through an official channel.

The cartridge concept is an attempt to separate **ownership, distribution, and preservation** without pretending those are the same problem.

The physical cartridge would not need to hold only a traditional ROM chip. It could carry the durable identity of one specific release:

```text
GAME_ID
PLATFORM_ID
RELEASE_ID
ROOT_CID
MANIFEST_CID
SIGNATURES
LICENSE_POLICY
FALLBACK_LOCATORS
```

Inserted into a compatible console or reader, the cartridge identifies the release, locates its package through IPFS, verifies the retrieved bytes against the manifest, caches a local copy, and launches the appropriate execution environment.

After a successful retrieval, network access should not be required every time the game is played. The local cache is the immediate playable copy. IPFS is the recovery and distribution layer that can restore the exact release when local storage fails or a new compatible reader needs to reconstruct it.

The cartridge is not just storage. It is a **physical, cryptographically verifiable identity for software**.

## The release is more than one executable

The immutable object should describe the release as a historical artifact, not merely point at one binary.

A preservation package could include:

```text
/release
    manifest.json
    game-data/
    patches/
    manual/
    artwork/
    credits/
    localization/
    compatibility.json
    preservation.json
    rights.json
    signatures/
```

The manifest would define exactly which files belong to that version, their hashes, the platform and region, required emulator or hardware behavior, patch lineage, known compatibility details, and the signatures attached by a publisher, archive, or owner.

Because the package is content-addressed, a silent change produces a different CID. A corrected release, official patch, translation, or later preservation edition can exist beside the earlier object without erasing its history.

That does not make every package authentic or lawful by itself. A hash proves byte identity, not copyright ownership, permission, safety, or historical accuracy. Those claims need separate signatures, rights records, and evidence that a reader can display clearly.

## Preservation should be visible

Most preservation infrastructure is invisible until it fails. The cartridge could make its condition part of the experience every time it starts.

```text
ARCHIVE STATUS

Release:                 USA 1.0
Preserved since:         March 14, 2027
Preservation age:        6 years, 4 months
Local copy:              Verified
Last retrieval audit:    Today
Active archival replicas: 12
Funded runway:           38 years

[ PLAY ]
[ SUPPORT PRESERVATION ]
```

The important measure is not only how many megabytes are pinned. It is time.

**This release has been preserved for six years. Its current reserve is estimated to support another thirty-eight.**

That gives the owner something understandable to care about. A contribution is not an abstract subscription payment. It purchases more replicated storage, monitoring, retrieval tests, and time for a specific artifact.

For a small cartridge-era game, a modest reserve might support decades of storage. A modern game measured in hundreds of gigabytes would have very different costs. The interface should show the real package size, replica policy, current providers, recent retrieval results, and the assumptions behind its runway estimate instead of presenting one magical number.

IPFS content addressing does not guarantee permanence. Content remains available only while somebody continues storing and serving it. The preservation service therefore has to do the unglamorous work: maintain geographically and organizationally independent replicas, monitor availability, run retrieval audits, renew storage, and disclose when coverage weakens.

## Fund the artifact, not an account lock-in

One possible business is straightforward: sell cartridges and compatible readers, then provide managed preservation around them.

Owners could add money to an individual or shared preservation reserve. If thousands of cartridges reference the same canonical release, they do not need thousands of separately billed copies of identical bytes. Their support can fund a common set of well-audited replicas, with optional personal or private copies layered on top.

```text
More owners
    -> larger shared reserve
    -> more independent replicas
    -> lower preservation cost per owner
    -> longer recovery runway
```

Nightshift or another operator could earn a disclosed margin for cartridge hardware, managed pinning, integrity monitoring, premium redundancy, publisher archival services, and physical preservation editions.

The product should still work without requiring permanent loyalty to that operator. The cartridge owner needs to be able to inspect the manifest, verify the CID, export the package, choose another compatible preservation provider, or operate a node independently.

The business is stewardship, not captivity.

## Preservation can still pay the original creator

Separating preservation from storefront dependence does not require taking ownership away from the original IP holder.

An official preservation edition could be signed by the publisher, identify the canonical release, state the rights attached to it, and route part of later preservation support back to the participating rightsholder. The publisher retains its IP, trademarks, licensing authority, and ability to publish new editions. The network gives one declared release continuity beyond a particular store or CDN.

A transparent contribution could be divided among:

- archival storage and retrieval infrastructure,
- a royalty for the participating rightsholder,
- the cartridge and preservation service,
- and an independent preservation reserve or foundation.

The exact split is a policy and contract decision, not something the protocol should hide. The useful principle is that an older release can remain commercially productive without requiring its original publisher to operate an obsolete storefront forever.

There could eventually be three clearly labeled preservation classes:

1. **Official** - a publisher-signed canonical release with active rights and royalty routing.
2. **Licensed archival** - a release maintained by an authorized archive or preservation organization.
3. **Personal archive** - software supplied by an owner who is responsible for having the right to preserve it, kept private or distributed only as permitted.

This is not a proposal for Nightshift to select copyrighted games from a catalog and distribute them without authorization. A defensible early service would be closer to **bring your own authorized bits**, alongside public-domain, open-source, independently published, and directly licensed releases. Publisher participation is the path to official commercial editions.

## It has to survive us

The strongest promise this system could make is not that Nightshift will exist forever.

It is that the preserved game does not need Nightshift to exist forever.

If the company providing the cartridge, application, or managed pinning service disappeared, the owner should still have:

- the immutable manifest and root CID,
- a verified local copy when one has been cached,
- the public cartridge and package specifications,
- independent tools capable of reading and verifying the release,
- enough compatibility metadata to rebuild an execution path,
- and a network of replicas controlled by more than one organization.

That requires an open cartridge protocol, documented manifest format, reproducible verification tools, provider portability, and no single private service that must approve recovery. A succession plan should explain how reserves, signing records, domain names, package indexes, and maintenance responsibilities move if the original operator closes.

A preservation company whose bankruptcy destroys the archive has only recreated the storefront problem with a longer timer.

The architecture has to assume the company is temporary and the artifact is not.

## The first practical cartridge

The first version does not need a universal console or a giant licensed catalog. It needs to prove one small recovery loop honestly.

Start with an authorized game package and one open cartridge specification. Put the release and manifest CIDs on the physical device. Retrieve the package from multiple independent IPFS nodes, verify every file, cache it locally, disconnect the network, and play it. Then erase the local cache and prove that a separate compatible reader can recover the same release without contacting a Nightshift-controlled service.

The preservation screen should show only evidence the system can support: when the package entered the archive, which replicas are currently reachable, when retrieval was last tested, what reserve is actually funded, and how the runway estimate was calculated.

If that works, the cartridge has already proved the essential idea:

> A game can have a permanent physical identity without depending on one permanent company.

That is the concept Nightshift wants to explore: not a novelty ROM cart, not another account-bound launcher, and not a promise that IPFS solves preservation by itself.

It is a cartridge designed to remember exactly what a game is, recover it from a distributed archive, verify that nothing changed, and keep the cost and condition of its continued survival visible to the person who owns it.
