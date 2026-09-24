# LandSnap Showcase web integration

## Scope

The production Showcase is the dedicated `https://showcase.ns-tx.com/` host on the Nukebox. `pages/Studio/Landsnap.html#showcase` keeps the complete Showcase in its existing expandable section through one fixed, responsive iframe; it never redirects the top-level page or loads queue, player, or Pixel Streaming code itself. `pages/Studio/LandSnapShowcase.html` is the direct-shell source that the dedicated host serves inside that frame. The Showcase uses one restricted visitor session at a time with Unreal Engine 5.8.3 and Pixel Streaming 2 with **Stream Level Editor**. One supervised editor starts at Windows sign-in and remains warm between visitors; Full Editor remains a trusted local workflow only.

The dedicated host must allow only `https://ns-tx.com` as a framing ancestor (for example, with `Content-Security-Policy: frame-ancestors https://ns-tx.com`) and must not send an `X-Frame-Options` policy that blocks the product-page frame. This framing allowance does not widen the queue or player routes: the dedicated origin still owns their secure cookies, ticket exchange, and WebSocket relay.

The dedicated host owns the queue, broker relay, signalling, and warm-editor supervisor. It is reached through the server's direct DNS and port-forwarded HTTPS/WebSocket and WebRTC routes. There is no Worker, tunnel, visitor-selected endpoint, or browser-to-host control route in this static site. The supervisor, not a visitor request, owns editor startup, restart, and reset readiness.

The website never launches or restarts Unreal, starts a host, selects a streamer, exposes a signalling endpoint, or sends a host-control action. `scripts/landsnap-showcase-local.js` is the one loopback-only exception for local acceptance work: it imports the bundled Epic UE 5.8 frontend only on `127.0.0.1`, `localhost`, or `[::1]`, then locks the local `Editor` streamer in code. No URL, hash, query parameter, storage value, or visitor-controlled field can alter that configuration.

## One-session broker contract

The visitor presses **Try Demo** inside the embedded `showcase.ns-tx.com` shell to begin. Until that click, the browser does not make an admission request. The direct shell accepts that origin only and can use only these fixed, same-origin routes:

```text
POST /api/landsnap-showcase/queue/v1/lease
GET  /api/landsnap-showcase/queue/v1/events
```

The broker identifies the visitor with a secure, HttpOnly, SameSite cookie scoped to the queue path. The page sends only one exact request body; it never sends a client identifier, session duration, endpoint, streamer, host setting, queue position, or Unreal command.

```json
{"protocol":"landsnap-showcase-queue-v2","operation":"join|status|heartbeat|leave"}
```

`join` is sent only by **Try Demo**. Afterward the page uses `status` while the editor is warming, while the visitor is queued, and whenever the page resumes or reconnects. It uses `heartbeat` only for an issued ready or active lease. Hiding or backgrounding the page suspends polling, SSE, and local timers without releasing the lease; returning calls `status` and never sends a second `join`. `leave` is reserved for an explicit visitor exit or a verified terminal cleanup path. All broker responses and SSE messages use `Cache-Control: no-store` and one exact state-specific JSON shape:

```json
{"protocol":"landsnap-showcase-queue-v2","status":"idle","pollAfterMs":1000}
{"protocol":"landsnap-showcase-queue-v2","status":"starting","phase":"preparing","leaseId":"opaque-server-id","expectedReadyAt":1730000000000,"preparationExpiresAt":1730000000000,"preparationRemainingMs":30000,"preparationOverdue":false,"pollAfterMs":1000}
{"protocol":"landsnap-showcase-queue-v2","status":"waiting","position":1,"estimatedWaitMs":300000,"activeLeaseDeadline":1730000300000,"pollAfterMs":1000}
{"protocol":"landsnap-showcase-queue-v2","status":"ready","phase":"ready","leaseId":"opaque-server-id","readyClaimExpiresAt":1730000090000,"heartbeatAfterMs":15000,"sessionUrl":"/api/landsnap-showcase/session/v1/player/opaque-player-id","sessionToken":"short-lived-signed-opaque-ticket","sessionTokenExpiresAt":1730000090000}
{"protocol":"landsnap-showcase-queue-v2","status":"active","phase":"active","leaseId":"opaque-server-id","sessionExpiresAt":1730000300000,"heartbeatAfterMs":15000}
{"protocol":"landsnap-showcase-queue-v2","status":"ended","reason":"visitor_left","endedAt":1730000300000,"pollAfterMs":1000}
```

`leaseId` and the player ID are opaque URL-safe server identifiers. The client accepts only the shown relative player-route form, with no query string or fragment. `sessionToken` is an opaque, broker-signed ticket, must expire by the ready-claim deadline, and is additionally capped by the page at two minutes. The five-minute usable-session deadline does not exist until the broker returns `active`. The player route is a same-origin broker relay—not a direct signalling URL—and it must reject expired, replayed, or cookie-mismatched tickets.

Before opening Pixel Streaming, the dedicated shell makes one exact ticket exchange: `POST sessionUrl` with `Authorization: Bearer sessionToken`, `credentials: include`, `cache: no-store`, and `redirect: error`. The broker consumes the ticket, returns `204 No Content`, and sets a Secure, HttpOnly, SameSite cookie scoped to that player path. The frontend then opens `wss://showcase.ns-tx.com` on that same validated player path. The ticket is never appended to a URL, stored in the DOM, logged, or exposed to a visitor-controlled configuration field.

The broker owns the atomic state transition:

1. At Windows sign-in, the supervisor starts one fixed restricted editor and keeps it registered. `idle` means the streamer is reset-ready and no visitor owns the slot.
2. If a visitor arrives while the host is not reset-ready, reserve the slot and return `starting`/`preparing` while the supervisor warms or restarts the editor. A warm reset-ready editor does not cold-start per lease.
3. If another visitor owns the claimed or active slot, enqueue later visitors and return `waiting` with their real one-based position and server estimate. The first admitted visitor is never shown as waiting.
4. Only after the fixed `Editor` streamer is registered and the editor reports `reset_ready` may the broker return `ready` with a signed, short-lived player ticket.
5. `ready` means the browser may connect; it does not start the five-minute clock. The broker returns `active` and creates the usable-session deadline only after WebRTC/data-channel readiness and the editor's `session_ready` milestone agree.
6. Disconnect, expiry, explicit leave, or failure ends the visitor lease transactionally, resets the prepared scene, and returns the same supervised editor to reset-ready `idle`. The supervisor restarts the editor only when recovery requires it, then promotes the queue.

The browser waits behind a neutral gray overlay for both `starting` and `waiting`. `starting` is presented as warming/preparing, never as a queue position. The displayed **Estimated wait** for `waiting` is based on the active session’s remaining five-minute maximum plus a maximum lease for each visitor ahead. It is explicitly an estimate: a visitor may leave early, so the actual wait can be shorter.

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

The page imports the public player only for an exact `showcase.ns-tx.com` ready lease. It mounts only with the broker-provided session ticket, has no configured streamer ID, and keeps controls disabled until both the transport is connected and Pixel Streaming reports its data channel open. A disconnect, player error, ticket expiry, or lease expiry clears the local stream UI, disconnects the transport, and re-requests broker `status`. The browser does not attempt to restart Unreal.

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

The local and dedicated-host bootstraps use Epic’s `@epicgames-ps/lib-pixelstreamingfrontend-ue5.8` 0.1.2 core package without Epic’s stock player UI. Before connecting they disable URL parameters, keyboard, touch, gamepad, XR, fake-touch mouse, microphone, camera, text-modal input, auto-VR, and reconnect attempts. The only enabled browser input is mouse.

The adapter must use `emitUIInteraction()` for the fixed payload registry below. It must never call `emitCommand()`, `emitConsoleCommand()`, text entry, URL/frame APIs, settings, stats, or developer APIs. The browser is not a trust boundary: retain private control ports, broker authorization, rate limits, supervised reset isolation, fail-closed restart behavior, and a host launch without `-AllowPixelStreamingCommands`.

## Bridge protocol

`SHOWCASE_COMMANDS` in `scripts/landsnap-showcase.js` is the only command-name registry. The Unreal bridge must accept only complete, no-argument interaction records with a local request ID:

```json
{"version":"landsnap-showcase-v1","type":"command","action":"snap_selected|undo|redo|reset_scene|previous_scenario|next_scenario|toggle_autosnap|prepare_small_row|prepare_medium_row|prepare_large_row|prepare_small_coverage|prepare_medium_coverage|prepare_large_coverage|clean_scene|select_previous_fixture|select_next_fixture|focus_selected_fixture","requestId":"locally-generated-id"}
```

The bridge independently validates the exact object shape, action, session state, scenario/selection bounds, and one-operation-at-a-time policy. It replies with bounded JSON containing only `version`, `type`, `action`, `requestId`, `result`, and a known `code`. The browser ignores malformed, oversized, unsolicited, stale, or unknown responses and maps codes to fixed local text; it never renders bridge-provided copy or HTML.

## Validation

1. Run `npm run build:landsnap-showcase`, serve this repository on loopback, and open `http://127.0.0.1:4173/pages/Studio/LandSnapShowcase.html` for the deterministic local fixture. Confirm `pages/Studio/Landsnap.html#showcase` keeps its top-level URL and embeds only `https://showcase.ns-tx.com/`.
2. On the dedicated host, confirm the initial gray panel shows **Try Demo** only when the supervised editor is reset-ready, and no admission request is made until it is pressed. Confirm a host that is genuinely warming reports `starting`/`preparing`, not a fake queue position.
3. With broker fixtures, verify `idle`, `starting`, real queued position, explicitly-estimated wait, early-release promotion, `ready`, `active`, `ended`, ticket expiry, malformed records, offline broker behavior, and stream loss. Confirm only `active` exposes the five-minute countdown and no raw signalling URL or server-control field is accepted.
4. Confirm the public adapter cannot import or mount until a valid ready ticket arrives. Verify its one ticket-exchange POST returns `204`, the WebSocket uses the same player path without a query token, controls remain disabled until the data channel opens, and `active` is observed only after `session_ready`.
5. For loopback only, start **Stream Level Editor**, not Full Editor, and verify keyboard input generates no Pixel Streaming messages while the fixed mouse-only path works.
6. Run `npm run test:landsnap-showcase` and `npm run security:payloads`. Check desktop and a 320px-wide viewport: queue text remains readable, controls stack, focus is visible, and no horizontal overflow appears.

This proves the static site contract and local frontend gate. It does not prove the broker, relay isolation, private port exposure, sign-in supervisor, warm-editor recovery, rate limits, session cookie enforcement, or Unreal-side behavior; those need deployment-level verification.
