# LandSnap Showcase broker

This project is the public, same-origin admission boundary for the LandSnap
Showcase. It is intentionally separate from `analytics/worker/`: analytics
must never gain the ability to start an Unreal process or forward streaming
traffic.

## What it exposes

Only these browser-facing routes exist:

- `POST /api/landsnap-showcase/queue/v1/lease`
- `GET /api/landsnap-showcase/queue/v1/events`
- `POST /api/landsnap-showcase/session/v1/player/:playerId`
- `GET /api/landsnap-showcase/session/v1/player/:playerId/ws`

The first route accepts the exact public v2 queue shape already enforced by
`scripts/landsnap-showcase-queue.js`. A visitor is identified only by a secure,
HttpOnly, SameSite cookie. The Durable Object owns the single session and FIFO
queue, and no route returns an Unreal host, streamer ID, signalling URL, launch
argument, relay origin, or credential.

Waiting membership expires 60 seconds after its last authenticated `status` or
`heartbeat` poll. New queue entries record that liveness timestamp, and the
Durable Object removes invalid or stale entries before queue-capacity checks or
promotion so an abandoned visitor cannot consume a slot or start a host.
Opening or receiving the optional SSE feed never refreshes queue liveness;
polling remains authoritative. During the state-schema transition, a legacy
waiting record without `lastSeenAt` receives one fresh 60-second window from
the time it is first loaded, then is persisted in the current shape.

The SSE route accepts only the active visitor or a current waiting member. It
keeps at most one stream per visitor, safely replaces a prior stream, and caps
all streams at the configured queue maximum plus the active slot. Streams are
closed when their visitor no longer owns active or queued membership. Event
delivery never waits on browser backpressure; a stalled or broken writer is
evicted instead of blocking later Durable Object operations.

`ready` returns a short-lived signed ticket. The browser must exchange it once
at the same-origin player route for an HttpOnly relay cookie before it can ask
for the fixed `/ws` relay. The relay binding receives a lease/player pair only
after the Durable Object validates the visitor cookie, ticket replay state, and
lease expiry. It must reject all public traffic itself; Service Bindings are its
only trusted caller.

Heartbeat responses may rotate the short-lived ticket. The page treats the
lease ID and fixed player route as the mounted transport identity, so a ticket
rotation does not interrupt an already-authorized stream. A transport factory
that is still resolving must still match the current ticket before installation.

## Required deployment configuration

1. Keep GitHub Pages as the static origin, but place `ns-tx.com` and
   `www.ns-tx.com` behind the Cloudflare zone. Install only the two API route
   patterns in `wrangler.toml`; do not replace the public site route.
2. Deploy the private orchestrator and relay Workers first, with no public
   routes. The orchestrator reaches the restricted UE host through a Tunnel/VPC
   service and accepts only exact `start`, `status`, and `release` records. The
   relay accepts only the fixed player WebSocket handoff.
3. Copy `wrangler.toml.example` to the untracked local `wrangler.toml` and set
   Worker secrets outside Git:
   - `SHOWCASE_TICKET_HMAC_KEY` (independent, high-entropy signing secret)
   - deployment credentials such as `CLOUDFLARE_API_TOKEN` and account context
     in the deployment environment
   - Tunnel/VPC, UE host-runner, and TURN credentials only in the private
     services/host environment
4. Configure the Pixel Streaming host for a disposable Stream Level Editor
   session with relay-only TURN and ephemeral credentials. A proxied signalling
   WebSocket alone does not prevent direct WebRTC candidates from exposing the
   host.

There is deliberately no host URL, shared secret, Cloudflare account ID,
signalling endpoint, or direct-stream fallback in this repository. Deploying
this Worker is not authorized by adding the source files.
