# LandSnap Showcase website integration

## Scope

`pages/Studio/LandSnapShowcase.html` is a local-review page only. It is intentionally not linked from a production route, has no deployment configuration, and does not contain a stream URL, session token, or player settings.

The browser surface targets Unreal Engine 5.8.2 and Pixel Streaming 2 with **Stream Level Editor**. Full Editor remains limited to a trusted local workflow. For the present local development stream, the separately supplied Pixel Streaming bootstrap may connect to `http://127.0.0.1` and select streamer `Editor`; neither value is editable by a visitor or embedded in the public page.

## Required PS2 bootstrap contract

Load the deployment-owned PS2 bootstrap before `scripts/landsnap-showcase.js`. It must assign the following adapter to `window.LandSnapShowcasePixelStreaming`:

```js
window.LandSnapShowcasePixelStreaming = {
  mount(mountElement, { streamerId, input }) { /* mount the PS2 video here */ },
  emitUIInteraction(payload) { /* return true only after the PS2 data channel accepts it */ },
  onConnectionState(listener) { /* listener: connecting|connected|disconnected|error */ },
  onResponse(listener) { /* listener receives the raw UE response string */ }
};
```

The adapter must use the UE 5.8.2-compatible Pixel Streaming frontend's `emitUIInteraction()` path. It must never call `emitCommand()`, `emitConsoleCommand()`, textbox entry, URL/frame requests, settings, stats, or any developer API. Do not instantiate or enable keyboard, touch, gamepad, or XR input forwarding. The page requests a mouse-only policy; the bootstrap must enforce it before connecting.

No URL, hash, query parameter, `postMessage`, dataset value, storage value, or response content may select the endpoint, streamer, command, or input policy. A public deployment needs an authenticated, same-origin session allocation flow supplied by the broker. Browser-side controls do not secure the Unreal host: retain private streamer/control ports, short-lived authorization, rate limits, disposable session isolation, and a host launch without `-AllowPixelStreamingCommands`.

## Bridge protocol

The frozen `SHOWCASE_COMMANDS` registry in `scripts/landsnap-showcase.js` is the sole command-name mapping. The Unreal bridge must accept only these no-argument interaction objects:

```json
{"version":"landsnap-showcase-v1","type":"command","action":"snap_selected|undo|redo|reset_scene|previous_scenario|next_scenario","requestId":"locally-generated-id"}
```

It must independently validate the complete object shape, action, connection/session state, selection/scenario bounds, and one-operation-at-a-time policy. The browser is not a trust boundary.

Every bridge acknowledgement must be a bounded JSON string with exactly these fields:

```json
{"version":"landsnap-showcase-v1","type":"operation-result","action":"snap_selected","requestId":"locally-generated-id","result":"success|rejected|error","code":"completed|no_selection|nothing_to_undo|nothing_to_redo|scenario_changed|scene_reset|operation_rejected|operation_failed"}
```

The client ignores malformed, oversized, unsolicited, stale, or unknown responses and maps result codes to local text. It never renders bridge-provided text or HTML.

## Local validation

1. Serve this repository from a local static server and open `pages/Studio/LandSnapShowcase.html`.
2. In the trusted local bootstrap only, connect the PS2 frontend to `http://127.0.0.1` with streamer `Editor`; start **Stream Level Editor**, not Full Editor.
3. Verify the viewport appears, raw keyboard input produces no Pixel Streaming messages, and the six buttons remain unavailable until the data channel is connected.
4. Verify each button sends one exact allowlisted interaction and waits for its matching acknowledgement. Confirm malformed or stale responses do not alter status.
5. Run `node --test tests/landsnap-showcase.test.mjs` and `npm run security:payloads`. Check desktop and a 320px-wide viewport: controls stack, focus remains visible, live statuses remain readable, and there is no horizontal overflow.

This validation proves the website shell and its local transport integration only. It does not authorize or prove public hosting, session isolation, rate limiting, broker authentication, port exposure, or Unreal-side behavior.
