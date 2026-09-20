import assert from "node:assert/strict";
import test from "node:test";
import broker, {
    SHOWCASE_QUEUE_PATH,
    SHOWCASE_QUEUE_EVENTS_PATH,
    SHOWCASE_QUEUE_PROTOCOL_VERSION,
    ShowcaseQueue,
} from "../src/index.js";

class MemoryStorage {
    constructor() { this.values = new Map(); }
    async get(key) { return this.values.get(key); }
    async put(key, value) { this.values.set(key, structuredClone(value)); }
    async setAlarm(value) { this.alarm = value; }
}

class MemoryDurableObjectState {
    constructor() { this.storage = new MemoryStorage(); }
    async blockConcurrencyWhile(callback) { return callback(); }
}

class FakeOrchestrator {
    constructor() {
        this.calls = [];
        this.ready = false;
        this.readyOnStart = false;
        this.playerId = "showcase-player-private-0001";
    }

    async fetch(request) {
        const payload = await request.json();
        this.calls.push(payload);
        if ((payload.operation === "status" && this.ready) || (payload.operation === "start" && this.readyOnStart)) {
            return Response.json({ status: "ready", playerId: this.playerId });
        }
        if (payload.operation === "start" || payload.operation === "status") {
            return Response.json({ status: "starting", expectedReadyAt: Date.now() + 30_000 });
        }
        return Response.json({ status: "unavailable" });
    }
}

const origin = "https://ns-tx.com";
const ticketSecret = "showcase-test-ticket-secret-that-is-long-enough";
const operation = (name) => ({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, operation: name });
const firstCookie = (response) => response.headers.get("set-cookie").split(";")[0];

const createHarness = () => {
    const orchestrator = new FakeOrchestrator();
    const state = new MemoryDurableObjectState();
    const env = {
        SHOWCASE_ALLOWED_ORIGINS: "https://ns-tx.com,https://www.ns-tx.com",
        SHOWCASE_MAX_QUEUE: "100",
        SHOWCASE_ORCHESTRATOR: orchestrator,
        SHOWCASE_RELAY: {
            async fetch(request) {
                env.relayRequest = request;
                return { status: 101, webSocket: {} };
            },
        },
        SHOWCASE_TICKET_HMAC_KEY: ticketSecret,
    };
    const queue = new ShowcaseQueue(state, env);
    env.SHOWCASE_QUEUE = {
        idFromName(name) {
            assert.equal(name, "landsnap-showcase-v1");
            return "single-showcase-queue";
        },
        get() { return queue; },
    };
    return { env, orchestrator };
};

const request = (path, {
    body,
    cookie = "",
    headers = {},
    method = "POST",
} = {}) => new Request(`${origin}${path}`, {
    method,
    headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
});

test("only the exact browser queue shape can reserve a cookie-bound starting lease", async () => {
    const { env, orchestrator } = createHarness();
    const response = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(response.headers.get("set-cookie"), /SameSite=Strict/);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload).sort(), ["expectedReadyAt", "leaseId", "pollAfterMs", "protocol", "status"]);
    assert.equal(payload.protocol, SHOWCASE_QUEUE_PROTOCOL_VERSION);
    assert.equal(payload.status, "starting");
    assert.deepEqual(orchestrator.calls.map((call) => Object.keys(call).sort()), [["leaseId", "operation"]]);
    assert.equal(orchestrator.calls[0].operation, "start");

    const malformed = await broker.fetch(request(SHOWCASE_QUEUE_PATH, {
        body: { ...operation("join"), endpoint: "wss://untrusted.invalid" },
    }), env);
    assert.equal(malformed.status, 400);
    assert.equal(orchestrator.calls.length, 1);
});

test("cross-origin callers are rejected before queue or host-control dispatch", async () => {
    const { env, orchestrator } = createHarness();
    const response = await broker.fetch(new Request(`${origin}${SHOWCASE_QUEUE_PATH}`, {
        method: "POST",
        headers: { Origin: "https://attacker.invalid", "content-type": "application/json" },
        body: JSON.stringify(operation("join")),
    }), env);
    assert.equal(response.status, 403);
    assert.equal(orchestrator.calls.length, 0);
});

test("a ready private session becomes a short-lived opaque ticket with no upstream address", async () => {
    const { env, orchestrator } = createHarness();
    const joined = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const visitorCookie = firstCookie(joined);
    orchestrator.ready = true;
    const ready = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("heartbeat"), cookie: visitorCookie }), env);
    const payload = await ready.json();
    assert.deepEqual(Object.keys(payload).sort(), ["expiresAt", "heartbeatAfterMs", "leaseId", "protocol", "sessionExpiresAt", "sessionToken", "sessionUrl", "status"]);
    assert.equal(payload.status, "ready");
    assert.match(payload.sessionUrl, /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/);
    assert.match(payload.sessionToken, /^[A-Za-z0-9._~-]{24,512}$/);
    assert.doesNotMatch(JSON.stringify(payload), /wss?:|signall|streamer|orchestrator|internal/i);
});

test("an immediately ready private session still returns the compatible opaque ready lease", async () => {
    const { env, orchestrator } = createHarness();
    orchestrator.readyOnStart = true;
    const response = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const payload = await response.json();
    assert.equal(payload.status, "ready");
    assert.deepEqual(Object.keys(payload).sort(), ["expiresAt", "heartbeatAfterMs", "leaseId", "protocol", "sessionExpiresAt", "sessionToken", "sessionUrl", "status"]);
});

test("the authenticated event stream is returned without waiting for a browser reader", async () => {
    const { env } = createHarness();
    const joined = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const controller = new AbortController();
    const events = await broker.fetch(new Request(`${origin}${SHOWCASE_QUEUE_EVENTS_PATH}`, {
        headers: { Cookie: firstCookie(joined), Origin: origin },
        signal: controller.signal,
    }), env);
    assert.equal(events.status, 200);
    assert.equal(events.headers.get("content-type"), "text/event-stream; charset=utf-8");
    controller.abort();
    await events.body?.cancel();
});

test("ticket exchange is one-time, visitor-bound, and the relay gets no browser credential", async () => {
    const { env, orchestrator } = createHarness();
    const joined = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const visitorCookie = firstCookie(joined);
    orchestrator.ready = true;
    const ready = await (await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("heartbeat"), cookie: visitorCookie }), env)).json();

    const exchange = await broker.fetch(request(ready.sessionUrl, {
        cookie: visitorCookie,
        headers: { Authorization: `Bearer ${ready.sessionToken}` },
    }), env);
    assert.equal(exchange.status, 204);
    const relayCookie = firstCookie(exchange);
    assert.match(relayCookie, /^__Secure-LandSnapShowcasePlayer=/);

    const replay = await broker.fetch(request(ready.sessionUrl, {
        cookie: visitorCookie,
        headers: { Authorization: `Bearer ${ready.sessionToken}` },
    }), env);
    assert.equal(replay.status, 403);

    const socket = await broker.fetch(request(`${ready.sessionUrl}/ws`, {
        cookie: `${visitorCookie}; ${relayCookie}`,
        headers: { Upgrade: "websocket" },
        method: "GET",
    }), env);
    assert.equal(socket.status, 101);
    assert.equal(env.relayRequest.url, "https://landsnap-showcase-relay.internal/v1/player");
    assert.equal(env.relayRequest.headers.get("cookie"), null);
    assert.equal(env.relayRequest.headers.get("authorization"), null);
    assert.match(env.relayRequest.headers.get("x-landsnap-showcase-lease"), /^[A-Za-z0-9_-]{16,128}$/);
});

test("a second visitor queues behind the active lease and early leave starts the next isolated slot", async () => {
    const { env, orchestrator } = createHarness();
    const first = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const firstCookieValue = firstCookie(first);
    const second = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const waiting = await second.json();
    assert.equal(waiting.status, "waiting");
    assert.equal(waiting.position, 1);

    const leave = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("leave"), cookie: firstCookieValue }), env);
    assert.deepEqual(await leave.json(), { released: true });
    assert.equal(orchestrator.calls.filter((call) => call.operation === "start").length, 2);
    assert.equal(orchestrator.calls.filter((call) => call.operation === "release").length, 1);
});
