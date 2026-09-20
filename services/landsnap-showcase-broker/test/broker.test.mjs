import assert from "node:assert/strict";
import test from "node:test";
import broker, {
    SHOWCASE_QUEUE_PATH,
    SHOWCASE_QUEUE_EVENTS_PATH,
    SHOWCASE_QUEUE_PROTOCOL_VERSION,
    SHOWCASE_WAITING_MEMBER_TIMEOUT_MS,
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

const createHarness = ({ maxQueue = "100" } = {}) => {
    const orchestrator = new FakeOrchestrator();
    const state = new MemoryDurableObjectState();
    const env = {
        SHOWCASE_ALLOWED_ORIGINS: "https://ns-tx.com,https://www.ns-tx.com",
        SHOWCASE_MAX_QUEUE: maxQueue,
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
    return { env, orchestrator, queue, state };
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

const cookieVisitorId = (visitorCookie) => visitorCookie.split("=")[1];
const internalEventsRequest = (visitorId, signal) => new Request("https://landsnap-showcase-queue.internal/events", {
    headers: {
        "x-landsnap-showcase-internal": "1",
        "x-landsnap-showcase-visitor": visitorId,
    },
    signal,
});
const internalPostRequest = (path, body) => new Request(`https://landsnap-showcase-queue.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-landsnap-showcase-internal": "1" },
    body: JSON.stringify(body),
});
const resolvesWithin = async (promise, timeoutMs = 500) => {
    let timeout;
    const completed = await Promise.race([
        promise.then((value) => ({ completed: true, value })),
        new Promise((resolve) => { timeout = setTimeout(() => resolve({ completed: false }), timeoutMs); }),
    ]);
    clearTimeout(timeout);
    return completed;
};

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

test("stale waiting members are pruned before capacity checks and never promoted", async () => {
    const { env, orchestrator, state } = createHarness({ maxQueue: "1" });
    const first = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const firstCookieValue = firstCookie(first);
    const abandoned = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const abandonedVisitorId = cookieVisitorId(firstCookie(abandoned));

    const stored = await state.storage.get("showcase-state");
    stored.queue[0].lastSeenAt = Date.now() - SHOWCASE_WAITING_MEMBER_TIMEOUT_MS;
    await state.storage.put("showcase-state", stored);

    const live = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const liveCookie = firstCookie(live);
    const liveVisitorId = cookieVisitorId(liveCookie);
    assert.equal((await live.json()).status, "waiting");
    assert.deepEqual((await state.storage.get("showcase-state")).queue.map((entry) => entry.visitorId), [liveVisitorId]);

    await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("leave"), cookie: firstCookieValue }), env);
    const promoted = await state.storage.get("showcase-state");
    assert.equal(promoted.active.visitorId, liveVisitorId);
    assert.notEqual(promoted.active.visitorId, abandonedVisitorId);
    assert.equal(orchestrator.calls.filter((call) => call.operation === "start").length, 2);
});

test("authenticated waiting polls refresh liveness while SSE does not", async () => {
    const { env, queue, state } = createHarness();
    await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const waiting = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const waitingCookie = firstCookie(waiting);
    const waitingVisitorId = cookieVisitorId(waitingCookie);

    let stored = await state.storage.get("showcase-state");
    stored.queue[0].lastSeenAt = Date.now() - 30_000;
    stored.queue[0].queuedAt = stored.queue[0].lastSeenAt;
    await state.storage.put("showcase-state", stored);
    const beforeStatus = Date.now();
    const status = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("status"), cookie: waitingCookie }), env);
    assert.equal((await status.json()).status, "waiting");
    stored = await state.storage.get("showcase-state");
    assert.ok(stored.queue[0].lastSeenAt >= beforeStatus);

    stored.queue[0].lastSeenAt -= 1_000;
    await state.storage.put("showcase-state", stored);
    const beforeHeartbeat = Date.now();
    const heartbeat = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("heartbeat"), cookie: waitingCookie }), env);
    assert.equal((await heartbeat.json()).status, "waiting");
    stored = await state.storage.get("showcase-state");
    assert.ok(stored.queue[0].lastSeenAt >= beforeHeartbeat);

    const lastSeenAt = stored.queue[0].lastSeenAt;
    const controller = new AbortController();
    const events = await queue.fetch(internalEventsRequest(waitingVisitorId, controller.signal));
    assert.equal(events.status, 200);
    assert.equal((await state.storage.get("showcase-state")).queue[0].lastSeenAt, lastSeenAt);

    stored = await state.storage.get("showcase-state");
    stored.queue[0].lastSeenAt = Date.now() - SHOWCASE_WAITING_MEMBER_TIMEOUT_MS;
    stored.queue[0].queuedAt = stored.queue[0].lastSeenAt;
    await state.storage.put("showcase-state", stored);
    const prune = await queue.fetch(internalEventsRequest("another-nonmember-0001"));
    assert.equal(prune.status, 403);
    assert.equal(queue.subscribers.has(waitingVisitorId), false);
    await events.body?.cancel();
});

test("legacy waiting records receive a fresh bounded liveness window when loaded", async () => {
    const { env, state } = createHarness();
    await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const legacyVisitorId = "legacy-waiter-visitor-0001";
    const stored = await state.storage.get("showcase-state");
    stored.queue = [{ visitorId: legacyVisitorId, queuedAt: Date.now() - 10 * SHOWCASE_WAITING_MEMBER_TIMEOUT_MS }];
    await state.storage.put("showcase-state", stored);

    const loadedAt = Date.now();
    const status = await broker.fetch(request(SHOWCASE_QUEUE_PATH, {
        body: operation("status"),
        cookie: `__Secure-LandSnapShowcaseVisitor=${legacyVisitorId}`,
    }), env);
    assert.equal((await status.json()).status, "waiting");
    assert.ok((await state.storage.get("showcase-state")).queue[0].lastSeenAt >= loadedAt);
});

test("event streams reject non-members before allocating a subscriber", async () => {
    const { env, queue } = createHarness();
    const response = await broker.fetch(request(SHOWCASE_QUEUE_EVENTS_PATH, {
        cookie: "__Secure-LandSnapShowcaseVisitor=nonmember-visitor-0001",
        method: "GET",
    }), env);
    assert.equal(response.status, 403);
    assert.equal(queue.subscribers.size, 0);
});

test("event streams replace duplicates safely, honor the global cap, and close when membership ends", async () => {
    const { env, queue, state } = createHarness({ maxQueue: "1" });
    const active = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const activeCookie = firstCookie(active);
    const activeVisitorId = cookieVisitorId(activeCookie);
    const queued = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const queuedVisitorId = cookieVisitorId(firstCookie(queued));

    const firstController = new AbortController();
    const first = await queue.fetch(internalEventsRequest(activeVisitorId, firstController.signal));
    const firstSubscriber = queue.subscribers.get(activeVisitorId);
    const replacementController = new AbortController();
    const replacement = await queue.fetch(internalEventsRequest(activeVisitorId, replacementController.signal));
    const replacementSubscriber = queue.subscribers.get(activeVisitorId);
    assert.equal(queue.subscribers.size, 1);
    assert.notEqual(replacementSubscriber, firstSubscriber);
    firstController.abort();
    await Promise.resolve();
    assert.equal(queue.subscribers.get(activeVisitorId), replacementSubscriber);

    const queuedController = new AbortController();
    const queuedEvents = await queue.fetch(internalEventsRequest(queuedVisitorId, queuedController.signal));
    assert.equal(queuedEvents.status, 200);
    assert.equal(queue.subscribers.size, 2);

    const overflowVisitorId = "overflow-visitor-0001";
    const stored = await state.storage.get("showcase-state");
    const now = Date.now();
    stored.queue.push({ visitorId: overflowVisitorId, queuedAt: now, lastSeenAt: now });
    await state.storage.put("showcase-state", stored);
    const overflow = await queue.fetch(internalEventsRequest(overflowVisitorId));
    assert.equal(overflow.status, 503);
    assert.equal(queue.subscribers.size, 2);

    queuedController.abort();
    await queuedEvents.body?.cancel();
    await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("leave"), cookie: activeCookie }), env);
    assert.equal(queue.subscribers.has(activeVisitorId), false);

    replacementController.abort();
    await Promise.all([first.body?.cancel(), replacement.body?.cancel()]);
});

test("a stalled event subscriber cannot block later status or leave operations", async () => {
    const { env, queue } = createHarness();
    const joined = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const visitorCookie = firstCookie(joined);
    const visitorId = cookieVisitorId(visitorCookie);

    const stalledStatusStream = await queue.fetch(internalEventsRequest(visitorId));
    const status = await resolvesWithin(broker.fetch(request(SHOWCASE_QUEUE_PATH, {
        body: operation("status"),
        cookie: visitorCookie,
    }), env));
    assert.equal(status.completed, true);
    assert.equal(status.value.status, 200);
    assert.equal(queue.subscribers.size, 0);

    const stalledLeaveStream = await queue.fetch(internalEventsRequest(visitorId));
    const leave = await resolvesWithin(broker.fetch(request(SHOWCASE_QUEUE_PATH, {
        body: operation("leave"),
        cookie: visitorCookie,
    }), env));
    assert.equal(leave.completed, true);
    assert.equal(leave.value.status, 200);
    assert.equal(queue.subscribers.size, 0);
    await Promise.all([stalledStatusStream.body?.cancel(), stalledLeaveStream.body?.cancel()]);
});

test("repeated invalid relay requests persist one expired-state promotion", async () => {
    const { env, orchestrator, queue, state } = createHarness();
    await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const waiting = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const waitingVisitorId = cookieVisitorId(firstCookie(waiting));
    const stored = await state.storage.get("showcase-state");
    stored.active.expiresAt = Date.now() - 1;
    await state.storage.put("showcase-state", stored);

    const invalidRelay = {
        playerId: "invalid-player-id-0001",
        relayId: "invalid-relay-id-00001",
        visitorId: "invalid-visitor-id-0001",
    };
    const first = await queue.fetch(internalPostRequest("/relay", invalidRelay));
    const promoted = await state.storage.get("showcase-state");
    const second = await queue.fetch(internalPostRequest("/relay", invalidRelay));
    const persisted = await state.storage.get("showcase-state");

    assert.deepEqual(await first.json(), { authorized: false });
    assert.deepEqual(await second.json(), { authorized: false });
    assert.equal(promoted.active.visitorId, waitingVisitorId);
    assert.equal(persisted.active.leaseId, promoted.active.leaseId);
    assert.equal(orchestrator.calls.filter((call) => call.operation === "release").length, 1);
    assert.equal(orchestrator.calls.filter((call) => call.operation === "start").length, 2);
});

test("repeated invalid ticket requests persist one expired-state promotion", async () => {
    const { env, orchestrator, queue, state } = createHarness();
    const activeResponse = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const activeVisitorId = cookieVisitorId(firstCookie(activeResponse));
    const waiting = await broker.fetch(request(SHOWCASE_QUEUE_PATH, { body: operation("join") }), env);
    const waitingVisitorId = cookieVisitorId(firstCookie(waiting));
    const stored = await state.storage.get("showcase-state");
    const expiredLeaseId = stored.active.leaseId;
    stored.active.expiresAt = Date.now() - 1;
    await state.storage.put("showcase-state", stored);

    const invalidTicket = {
        expiresAt: Date.now() + 60_000,
        leaseId: expiredLeaseId,
        playerId: "invalid-player-id-0001",
        relayId: "invalid-relay-id-00001",
        ticketId: "invalid-ticket-id-0001",
        visitorId: activeVisitorId,
    };
    const first = await queue.fetch(internalPostRequest("/ticket", invalidTicket));
    const promoted = await state.storage.get("showcase-state");
    const second = await queue.fetch(internalPostRequest("/ticket", invalidTicket));
    const persisted = await state.storage.get("showcase-state");

    assert.deepEqual(await first.json(), { redeemed: false });
    assert.deepEqual(await second.json(), { redeemed: false });
    assert.equal(promoted.active.visitorId, waitingVisitorId);
    assert.equal(persisted.active.leaseId, promoted.active.leaseId);
    assert.deepEqual(persisted.usedTickets, []);
    assert.deepEqual(persisted.relays, []);
    assert.equal(orchestrator.calls.filter((call) => call.operation === "release").length, 1);
    assert.equal(orchestrator.calls.filter((call) => call.operation === "start").length, 2);
});
