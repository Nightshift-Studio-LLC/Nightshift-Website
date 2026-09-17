# LandSnap Showcase website integration

## Scope

`pages/Studio/LandSnapShowcase.html` is a published Showcase shell. It is intentionally not linked from a production route and never contains a stream URL, session token, or player settings that a visitor can select.

The browser surface targets Unreal Engine 5.8.2 and Pixel Streaming 2 with **Stream Level Editor**. Full Editor remains limited to a trusted local workflow. `scripts/landsnap-showcase-local.js` is a loopback-only bootstrap: it imports the bundled Epic UE 5.8 frontend only when the page is served from `127.0.0.1`, `localhost`, or `[::1]`. It connects only to `ws://127.0.0.1` with streamer `Editor`; neither value is editable by a visitor, URL, hash, or storage value.

The production `https://ns-tx.com/pages/Studio/LandSnapShowcase.html` shell always stays disconnected. It does not import the frontend bundle or connect to a signalling server. A future public rollout must replace this local-only route with a separately reviewed fixed authenticated WSS/session bootstrap.

## Local PS2 acceptance bootstrap

The bootstrap is built from Epic's `@epicgames-ps/lib-pixelstreamingfrontend-ue5.8` 0.1.2 core package, pinned in `package.json`; it does not include Epic's stock player UI library. Build it after dependency installation:

```powershell
npm install
npm run build:landsnap-showcase
```

Then serve this repository on loopback and open `http://127.0.0.1:4173/pages/Studio/LandSnapShowcase.html`. The site-owned bootstrap mounts only the frontend's video container in `#landsnap-showcase-stream-mount`, uses `emitUIInteraction()` for exact allowlisted payloads, and relays raw UE **Send Pixel Streaming Response** strings through the existing `onResponse()` contract.

Before constructing the frontend it sets `useUrlParams: false`, locks the signaller and streamer values, enables mouse input, disables keyboard, touch, gamepad, XR, fake-touch mouse, microphone, camera, text-modal input, and auto-VR, and disables reconnect attempts. It exposes no settings, stats, console, iframe, textbox, URL-selection, or generic command path.

## Required PS2 bootstrap contract

Load the deployment-owned PS2 bootstrap before `scripts/landsnap-showcase.js`. The supplied loopback bootstrap assigns the following adapter to `window.LandSnapShowcasePixelStreaming` only on a loopback origin:

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

1. Run `npm run build:landsnap-showcase`, serve this repository from a loopback static server, and open `http://127.0.0.1:4173/pages/Studio/LandSnapShowcase.html`.
2. Start **Stream Level Editor**, not Full Editor. The fixed local bootstrap connects the UE 5.8 frontend to `ws://127.0.0.1` with streamer `Editor`.
3. Verify the viewport appears, raw keyboard input produces no Pixel Streaming messages, and the six buttons remain unavailable until the data channel is connected.
4. Verify each button sends one exact allowlisted interaction and waits for its matching acknowledgement. Confirm malformed or stale responses do not alter status.
5. Run `npm run test:landsnap-showcase` and `npm run security:payloads`. Check desktop and a 320px-wide viewport: controls stack, focus remains visible, live statuses remain readable, and there is no horizontal overflow.

This validation proves the website shell and its local transport integration only. It does not authorize or prove public hosting, session isolation, rate limiting, broker authentication, port exposure, or Unreal-side behavior.
