---
title: "AfterDark tests a privacy-first age gate with AgeKey and YubiKey"
date: 2026-08-14
game: AfterDarkRP
excerpt: "AfterDark is evaluating whether AgeKey and YubiKey can support an adult gate with less identity exposure—and what metadata, correlation, and acquisition risks remain."
tags:
  - AfterDarkRP
  - Age Assurance
  - Privacy
  - AgeKey
  - YubiKey
  - FIDO2
  - Passkeys
---

:::highlight-blue
## Evaluation status

- AgeKey plus YubiKey is a test candidate, not a live or shipped AfterDark gate.
- The target is a signed adult-threshold result without Nightshift collecting the player's source identity evidence.
- That is data minimization, not `perfect privacy`: the detailed notice describes server metadata, session logs, cookies, and possible site telemetry.
- A FIDO2 security key could make the credential device-bound, but the actual AgeKey, browser, and YubiKey path still has to pass hands-on testing.
- The deciding product test is Windows PC and VR: the authentication handoff, WebAuthn prompt, YubiKey PIN and touch, and recovery path all have to work in that context. Linux is only a possible future target if s&box supports it down the line, not a current claim or MVP gate.
- The concept is promising enough to prototype, but not ready to depend on without protocol, threat-model, retention, audit, provider, and change-control answers.
:::

## Why AfterDark needs an age gate

AfterDark is an adult-themed, user-generated sandbox. Its systems and player-created situations can involve mature material, so access cannot rest on a decorative birthday prompt or a checkbox that anyone can click through.

At the same time, a useful age gate should not become an excuse to collect more personal information than the game needs. Nightshift needs an answer to a narrow question: does this player meet the required age threshold? A full date of birth, government ID image, face scan, card record, or legal identity would create a much larger privacy and security burden without improving the in-game decision.

That is why [AgeKey](https://agekey.org/) is worth evaluating. Its stated model is a reusable age credential built on passkey technology. After an initial age-assurance provider establishes an age signal, the user can save that result as an AgeKey and later prove requested thresholds such as 18+ without repeatedly disclosing an exact birth date or identity.

According to the [AgeKey introduction](https://docs.agekey.org/intro/), the returning-user flow produces a signed OpenID Connect result with yes-or-no answers for the requested thresholds. The relying service can also constrain which verification methods it accepts and how recent the underlying verification must be.

## PC and VR first

AfterDark's current product target is PC first, with Windows as the primary platform and VR also relevant. This is not a mobile game. The age gate therefore has to work from a Windows PC game session and from a player wearing a headset, where authentication may need to move safely to a trusted desktop browser, headset browser, or dedicated authentication surface and then return control to the correct game session.

If s&box supports Linux down the line, Linux could become a future AfterDark target. Any such pass would need its own browser, WebAuthn, YubiKey, and game-to-browser handoff testing across the Linux environments the platform actually supports. This is not a claim of current Linux support, an independent AfterDark commitment, or an MVP release gate.

Mobile can still be useful as an optional authenticator companion for credential enrollment, recovery, or NFC use. It is not a required AfterDark game platform. Console compatibility is a deferred possibility, not MVP scope, and would depend on each platform's WebAuthn and security-key policies plus its account-linking rules.

## Marketing claim versus privacy notice

The [AgeKey About page](https://agekey.org/about) says, "Nothing is kept online, not your face, not your ID, not even your exact age." It also presents the product as having no cookies, tracking, or data retention. That is a strong and appealing summary of the privacy goal.

The [OpenAge Privacy Notice](https://openageinitiative.org/privacy-policy) describes a more detailed operating picture. It says the underlying identity or age evidence is collected by third-party age-assurance providers, is not stored in the AgeKey, and is never shared with OpenAge. It also says OpenAge stores the AgeKey public key with the confirmed age range, verification method and provider, and verification timestamp. Public-key and session-log data is collected automatically. AgeKey.org may collect IP address, cookie identifiers, browser type, domain or ISP, device information, and usage data; the cookie policy lists essential `session` and `publicKey` cookies as well as Google Analytics. Retention is based on the purpose for which the information was collected.

Those statements are not enough to accuse the provider of deception or conclude that the architecture is broken. The marketing shorthand and the detailed notice appear to describe different layers and scopes: one focuses on source evidence such as a face, ID, or exact age, while the other covers the metadata and telemetry needed to operate the credential and website. For AfterDark, that distinction has to be explicit in the protocol and threat model rather than inferred from a slogan.

## Acquisition threat model

The OpenAge notice says stored information may transfer as part of a merger, acquisition, or similar transaction. If OpenAge truly never collected the underlying ID image, face data, or exact date of birth, a future buyer cannot retroactively acquire that nonexistent OpenAge dataset. The third-party verifier may still hold source evidence under its own separate privacy and retention policy, which needs its own review.

A buyer could receive the public keys, confirmed age ranges, method and provider records, timestamps, session logs, and other information OpenAge does store. It could also change future product behavior, policies, APIs, subprocessors, or retention periods. The acquisition question is therefore not only "Can someone buy the ID database?" It is also "What metadata exists today, what can it reveal when joined, and what prevents a future owner from collecting more tomorrow?"

OpenAge's [launch release](https://www.businesswire.com/news/home/20251110709762/en/Newly-Launched-OpenAge-Initiative-Introduces-AgeKey) says site-specific passkey identifiers and a double-blind architecture prevent correlation between issuer and verifier or between different verifiers. That is an important claim, not something Nightshift should dismiss. It is also a claim worth protocol documentation or independent audit, especially because the privacy notice describes public keys and session logs.

Before relying on it, the prototype review should answer:

- Can creation IP, public key, verification requests, and the relying site be correlated anywhere in the service or its logs?
- Does the OIDC `client_id` or registered redirect reveal the relying party to AgeKey, and if so, how is that separated from credential creation and use history?
- Are site-specific identifiers derived or issued in a way that prevents cross-site joining by the provider, an acquirer, a subprocessor, or a compromised logging system?
- What deletion, rotation, breach, takeover, and policy-change controls apply to public keys, metadata, analytics, and session logs?

## Design as if the provider is untrusted

AfterDark should get the privacy benefit even if AgeKey is treated as an external party that may fail, log too much, change ownership, or change policy. The minimum-trust integration should:

- request only a signed adult-threshold boolean, with the narrowest acceptable method and recency constraints;
- never send a stable AfterDark account ID to the provider;
- keep `state` and `nonce` opaque, random, short-lived, single-use, and bound to server-side session state;
- validate signature and JWKS, issuer, audience, state, nonce, request integrity, issue time, expiry, threshold, and replay status on the server;
- prevent the token and complete callback URL from reaching application, proxy, analytics, crash, or support logs;
- store only a short-lived AfterDark gate result, plus any narrowly justified audit reference for a defined retention period;
- review proxy, analytics, support, and incident tooling as part of the data flow, not as an afterthought; and
- fail closed on invalid responses, replay, provider outage, or uncertain state.

That does not make the provider literally untrusted—the signed result still comes from it. It limits how much AfterDark discloses and how much damage a provider-side failure or policy change can cause.

## Where the YubiKey fits

A FIDO2-capable YubiKey can store device-bound passkeys. Instead of leaving the AgeKey credential synchronized through a general platform account, a player could potentially keep it on a physical security key and authorize use with the key's FIDO2 PIN and required touch.

Yubico documents passkey storage on supported FIDO2-certified keys in its [FIDO2 and passkey guide](https://docs.yubico.com/software/yubikey/tools/authenticator/auth-guide/fido2.html). That establishes the hardware capability, but it does not prove that AgeKey's current registration prompt will offer `Security key`, that each target Windows browser will route the prompt correctly, or that the PC and VR handoff will work cleanly. Exact AgeKey, browser, operating-system, VR, and hardware-key compatibility is an empirical pass-or-fail test. Linux browser and handoff compatibility would belong to a later pass only if s&box makes Linux a supported target; mobile USB or NFC is a secondary enrollment, recovery, or authenticator-companion test.

## Proposed test flow

1. Create or obtain an AgeKey through an external age-assurance provider. The initial verifier handles whatever source proof its method requires; Nightshift does not receive the ID image, face data, card details, exact date of birth, or equivalent evidence.
2. At the passkey creation prompt, choose `Security key`, select the YubiKey, then complete the ceremony with its FIDO2 PIN and physical touch. Record whether the credential is actually stored on the key rather than silently falling back to a platform passkey.
3. From the Windows PC game or VR runtime, begin a fresh gate request and hand off to a trusted browser or authentication surface. Redirect to AgeKey with the required age threshold and unique `state` and `nonce` values, following the documented [Use AgeKey flow](https://docs.agekey.org/guides/use-agekey/).
4. On the returning-user prompt, choose and use the YubiKey again. Enter the FIDO2 PIN and touch the key, then allow AgeKey to redirect the browser back to the registered AfterDark callback and resume the correct server-bound game session.
5. Validate the signed result on the server before granting access: verify the signature against the provider's JWKS, expected issuer, audience, matching `state` and `nonce`, issue and expiry times, the requested threshold result, request integrity, and one-time use or other replay controls.
6. Convert a successful result into a short-lived AfterDark gate or session decision. Retain only the minimum result and narrowly justified audit reference for the minimum necessary period; do not retain the original verification evidence.

## Test matrix before any integration decision

The prototype needs more than a happy-path screenshot. It should explicitly cover:

1. **Enrollment:** new AgeKey creation through the external verifier, with `Security key` visibly selected and the credential confirmed on the YubiKey.
2. **Repeat use:** a returning player completes the threshold check using the same YubiKey without repeating identity proof.
3. **Cancel and deny:** backing out, declining consent, removing the key mid-prompt, or denying the passkey request leaves access closed and produces a clear recovery path.
4. **False threshold:** a valid signed result with the required threshold set to false never opens the gate.
5. **Expired and replayed result:** expired tokens, reused callbacks, mismatched state, mismatched nonce, wrong audience, and stale sessions all fail closed.
6. **Key removal, loss, and recovery:** unplugging a key during use, losing the only key, replacing it, and using a documented backup or re-verification path do not create either a bypass or permanent lockout.
7. **Current Windows PC browsers:** test each supported Windows desktop browser and authentication surface, including the handoff from the running PC game, trusted-origin visibility, focus changes, timeout behavior, and return to the correct game session.
8. **VR authentication:** test headset-to-browser handoff; whether the WebAuthn prompt is visible, readable, and controllable in VR; whether entering a YubiKey PIN and finding and touching the key is practical while wearing the headset; and whether cancellation, timeout, or a removed key returns the player safely instead of trapping them outside both the browser and game. Where appropriate, provide a clearly paired desktop companion fallback.
9. **Possible future Linux compatibility:** if s&box supports Linux down the line and AfterDark adopts that target, test the supported Linux distributions, desktop browsers, WebAuthn security-key prompt, PIN and touch behavior, trusted-origin presentation, game-to-browser handoff, and return to the correct session. This is a conditional compatibility question, not a current support claim or MVP gate.
10. **Optional mobile and NFC companion:** test Android or iOS USB and NFC only where useful for credential enrollment, recovery, or an authenticator-companion path. This is not a mobile-game requirement or a condition for the PC release.
11. **Deferred consoles:** document console compatibility as a future question governed by platform WebAuthn and external-security-key policies, browser availability, deep-link restrictions, and account-linking rules. Do not make it MVP scope.
12. **Provider outage:** timeouts, unreachable discovery or JWKS endpoints, and an unavailable verification service fail closed with a useful message instead of trapping the player in a loop.
13. **Accessibility and fallback:** the flow is keyboard-readable, screen-reader understandable, usable across the relevant PC and VR surfaces, and offers a legitimate alternate verification route for players who cannot use a hardware key.
14. **Retention and logs:** inspect application, proxy, analytics, and support logs to confirm that signed tokens, query fragments, exact birth data, identity evidence, and unnecessary device details are not being retained.

## What this does not solve by itself

AgeKey can reduce how often sensitive proof is shared with relying services, but the first credential still depends on an underlying verification method and provider. An ID scan, payment-card check, face-based estimate, or another source has its own accuracy, accessibility, jurisdiction, retention, and bias questions. A reusable credential does not make weak initial proof stronger.

One product boundary also needs an answer before code starts. AgeKey's [developer introduction](https://docs.agekey.org/intro/) positions direct AgeKey integration primarily for age-assurance providers and platforms that orchestrate multiple methods, while pointing ordinary game and app implementers toward OpenAge. The prototype needs provider confirmation on whether AfterDark should use the AgeKey OpenID Connect endpoints directly or integrate through that broader layer.

It also does not guarantee legal compliance. Required thresholds, acceptable methods, parental-consent rules, audit obligations, data-processing terms, incident handling, and regional availability all need qualified review before AfterDark relies on the result.

## Current verdict

AgeKey with a YubiKey is promising enough for a contained prototype. The core direction is still good: ask for a threshold, validate a signed result, and keep Nightshift away from the player's source identity evidence. It is not `perfect privacy`, and the public marketing page is not a substitute for reading the detailed notice.

The deciding hardware test is Windows PC and VR, not generic mobile coverage. AgeKey's passkey ceremony must consistently expose the FIDO2 YubiKey path in supported Windows browsers and authentication surfaces, survive the handoff from both desktop and headset play, keep the WebAuthn prompt usable in VR, and provide a workable cancellation, loss, and recovery story. Linux compatibility is only a possible future testing track if s&box supports that platform; it is not an MVP promise. Mobile enrollment or NFC can help as a companion path; console support stays deferred. Before AfterDark depends on any of it, Nightshift also needs clear protocol and threat-model documentation, retention and subprocessor terms, credible audit evidence for non-correlation, and answers for takeover, policy changes, API changes, and shutdown.

If those questions have good answers, this could become a materially more private adult gate than collecting identity proof ourselves. If they do not, it does not ship. For now, this remains an evaluation path—not an integration announcement or a compliance guarantee.
