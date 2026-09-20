# LandSnap Showcase web integration

## Scope

The production Showcase is the dedicated `https://showcase.ns-tx.com/` host on the Nukebox. `pages/Studio/Landsnap.html#showcase` is an informational handoff that links visitors to that fixed destination; it never loads the queue, player, or Pixel Streaming frontend. `pages/Studio/LandSnapShowcase.html` is the direct-shell source that the dedicated host serves. The Showcase uses one restricted session at a time with Unreal Engine 5.8.2 and Pixel Streaming 2 with **Stream Level Editor**. Full Editor remains a trusted local workflow only.

The dedicated host owns the queue, broker relay, signalling, and on-demand Unreal process. It is reached through the server's direct DNS and port-forwarded HTTPS/WebSocket and WebRTC routes. There is no Worker, tunnel, visitor-selected endpoint, or browser-to-host control route in this static site.

The website never launches Unreal, starts a host, selects a streamer, exposes a signalling endpoint, or sends a host-control action. `scripts/landsnap-showcase-local.js` is the one loopback-only exception for local acceptance work: it imports the bundled Epic UE 5.8 frontend only on `127.0.0.1`, `localhost`, or `[::1]`, then locks the local `Editor` streamer in code. No URL, hash, query parameter, storage value, or visitor-controlled field can alter that configuration.

## One-session broker contract

The visitor presses **Try Demo** on `showcase.ns-tx.com` to begin. Until that click, the browser does not make an admission request. The direct shell accepts that origin only and can use only these fixed, same-origin routes:

```text
POST /api/landsnap-showcase/queue/v1/lease
GET  /api/landsnap-showcase/queue/v1/events
```

The broker identifies the visitor with a secure, HttpOnly, SameSite cookie scoped to the queue path. The page sends only one exact request body; it never sends a client identifier, session duration, endpoint, streamer, host setting, queue position, or Unreal command.

```json
{"protocol":"landsnap-showcase-queue-v2","operation":"join|status|heartbeat|leave"}
```

`join` is sent only by **Try Demo**. Afterward the page uses `status` while a session is starting or queued, `heartbeat` only for an issued ready lease, and `leave` when the Showcase closes or the page hides. All broker responses and SSE messages use `Cache-Control: no-store` and one exact JSON shape:

```json
{"protocol":"landsnap-showcase-queue-v2","status":"starting","leaseId":"opaque-server-id","expectedReadyAt":1730000000000,"pollAfterMs":1000}
{"protocol":"landsnap-showcase-queue-v2","status":"waiting","position":1,"activeLeaseExpiresAt":1730000000000,"pollAfterMs":1000}
{"protocol":"landsnap-showcase-queue-v2","status":"ready","leaseId":"opaque-server-id","expiresAt":1730000000000,"heartbeatAfterMs":15000,"sessionUrl":"/api/landsnap-showcase/session/v1/player/opaque-player-id","sessionToken":"short-lived-signed-opaque-ticket","sessionExpiresAt":1730000000000}
```

`leaseId` and the player ID are opaque URL-safe server identifiers. The client accepts only the shown relative player-route form, with no query string or fragment. `sessionToken` is an opaque, broker-signed ticket, must expire before the five-minute lease, and is additionally capped by the page at two minutes. The player route is a same-origin broker relay—not a direct signalling URL—and it must reject expired, replayed, or cookie-mismatched tickets.

The broker owns the atomic state transition:

1. If no host is starting or leased, reserve the single slot for the cookie-bound visitor, return `starting`, and start one fresh restricted Unreal session **from the broker**.
2. If that slot is starting or ready, enqueue later visitors and return `waiting` with their one-based position.
3. Only after the isolated server passes its readiness check may the broker return `ready` with a signed, short-lived player ticket.
4. If the session disconnects, expires, or fails, release or invalidate it transactionally and promote the queue. A `leave` must release a ready lease before replying.

The browser waits behind a neutral gray overlay for both `starting` and `waiting`. The displayed **Estimated wait** is based on the active session’s remaining five-minute maximum plus a maximum lease for each visitor ahead. It is explicitly an estimate: a visitor may leave early, so the actual wait can be shorter.

The SSE feed is an optional immediate-update path. The client’s one-to-five-second fixed polling fallback is authoritative if that feed is unavailable. No response may include a direct signalling host, a WebSocket URL, a streamer ID, Unreal launch parameters, credentials, shell command, or server-control operation.

## Player handoff and reconnect behavior

The queue response is authorization to attempt the fixed broker player relay; it is not permission to expose or configure Pixel Streaming. The dedicated host may install `window.LandSnapShowcasePixelStreaming` only after the broker gives a valid `ready` record. The adapter receives the broker session object directly in memory:

```js
window.LandSnapShowcasePixelStreaming = {
  mount(mountElement, { session: { url, token, expiresAt }, input }) { /* fixed relay only */ },
  emitUIInteraction(payload) { /* exact allowlisted interaction only */ },
  onConnectionState(listener) { /* connecting|connected|disconnected|error */ },
  onSessionReady(listener) { /* invoke only after the existing session_ready handshake */ },
  onResponse(listener) { /* raw bounded UE operation result */ },
  disconnect() { /* terminate the current relay transport */ }
};
```

The page mounts the public player only with the broker-provided session ticket and keeps controls disabled until both the transport is connected and the existing `session_ready` handshake fires. A disconnect, player error, ticket expiry, or lease expiry clears the local stream UI, disconnects the transport, and re-requests broker `status`. The browser does not attempt to restart Unreal.

Loopback acceptance retains its fixed local transport shape:

```js
window.LandSnapShowcasePixelStreaming = {
  mount(mountElement, { streamerId: "Editor", input }) { /* local PS2 video only */ },
  emitUIInteraction(payload) { /* exact allowlisted interaction only */ },
  onConnectionState(listener) { /* connecting|connected|disconnected|error */ },
  onResponse(listener) { /* raw bounded UE operation result */ }
};
```

It is never installed on a public host. The local fixture is deterministic and does not exercise the public broker or relay.

## Pixel Streaming safeguards

The local bootstrap uses Epic’s `@epicgames-ps/lib-pixelstreamingfrontend-ue5.8` 0.1.2 core package without Epic’s stock player UI. Before connecting it disables URL parameters, keyboard, touch, gamepad, XR, fake-touch mouse, microphone, camera, text-modal input, auto-VR, and reconnect attempts. The only enabled browser input is mouse.

The adapter must use `emitUIInteraction()` for the fixed payload registry below. It must never call `emitCommand()`, `emitConsoleCommand()`, text entry, URL/frame APIs, settings, stats, or developer APIs. The browser is not a trust boundary: retain private control ports, broker authorization, rate limits, disposable session isolation, and a host launch without `-AllowPixelStreamingCommands`.

## Bridge protocol

`SHOWCASE_COMMANDS` in `scripts/landsnap-showcase.js` is the only command-name registry. The Unreal bridge must accept only complete, no-argument interaction records with a local request ID:

```json
{"version":"landsnap-showcase-v1","type":"command","action":"snap_selected|undo|redo|reset_scene|previous_scenario|next_scenario|toggle_autosnap|prepare_small_row|prepare_medium_row|prepare_large_row|prepare_small_coverage|prepare_medium_coverage|prepare_large_coverage|clean_scene|select_previous_fixture|select_next_fixture|focus_selected_fixture","requestId":"locally-generated-id"}
```

The bridge independently validates the exact object shape, action, session state, scenario/selection bounds, and one-operation-at-a-time policy. It replies with bounded JSON containing only `version`, `type`, `action`, `requestId`, `result`, and a known `code`. The browser ignores malformed, oversized, unsolicited, stale, or unknown responses and maps codes to fixed local text; it never renders bridge-provided copy or HTML.

## Validation

1. Run `npm run build:landsnap-showcase`, serve this repository on loopback, and open `http://127.0.0.1:4173/pages/Studio/LandSnapShowcase.html` for the deterministic local fixture. Confirm `pages/Studio/Landsnap.html#showcase` only links to `https://showcase.ns-tx.com/`.
2. On the dedicated host, confirm the initial gray panel shows **Try Demo** and no admission request is made until it is pressed.
3. With broker fixtures, verify `starting`, queued position, explicitly-estimated wait, early-release promotion, ready ticket expiry, malformed records, offline broker behavior, and stream loss. Confirm no raw signalling URL or server-control field is accepted.
4. Confirm the public adapter cannot mount until a valid ready ticket arrives, and controls remain disabled until its existing `session_ready` handshake.
5. For loopback only, start **Stream Level Editor**, not Full Editor, and verify keyboard input generates no Pixel Streaming messages while the fixed mouse-only path works.
6. Run `npm run test:landsnap-showcase` and `npm run security:payloads`. Check desktop and a 320px-wide viewport: queue text remains readable, controls stack, focus is visible, and no horizontal overflow appears.

This proves the static site contract and local frontend gate. It does not prove the broker, relay isolation, private port exposure, host-start process, rate limits, session cookie enforcement, or Unreal-side behavior; those need deployment-level verification.
