import assert from "node:assert/strict";
import test from "node:test";
import {
    SHOWCASE_LEASE_DURATION_MS,
    SHOWCASE_QUEUE_EVENTS_PATH,
    SHOWCASE_QUEUE_PATH,
    SHOWCASE_QUEUE_PROTOCOL_VERSION,
    calculateQueueWaitMs,
    createQueueLeaseController,
    createQueueServiceClient,
    formatQueueCountdown,
    getQueuePresentation,
    isActiveQueueLease,
    parseQueueLease,
} from "../scripts/landsnap-showcase-queue.js";

const activeLease = (now) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "active",
    leaseId: "active-showcase-lease-1234",
    expiresAt: now + SHOWCASE_LEASE_DURATION_MS,
    heartbeatAfterMs: 15_000,
});

const waitingLease = (now, position = 1) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "waiting",
    position,
    activeLeaseExpiresAt: now + 80_000,
    pollAfterMs: 1_000,
});

test("queue lease parser rejects malformed data and bounds every active lease to five minutes", () => {
    const now = 1_700_000_000_000;
    assert.deepEqual(parseQueueLease(activeLease(now), now), {
        status: "active",
        leaseId: "active-showcase-lease-1234",
        expiresAt: now + SHOWCASE_LEASE_DURATION_MS,
        heartbeatAfterMs: 15_000,
    });
    assert.equal(isActiveQueueLease(parseQueueLease(activeLease(now), now), now), true);
    assert.equal(parseQueueLease({ ...activeLease(now), endpoint: "wss://visitor.invalid" }, now), null);
    assert.equal(parseQueueLease({ ...waitingLease(now), position: 0 }, now), null);
    assert.equal(parseQueueLease({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, status: "active" }, now), null);
});

test("waiting estimates use active time remaining plus five minutes per queued visitor ahead", () => {
    const now = 1_700_000_000_000;
    const next = parseQueueLease(waitingLease(now, 1), now);
    const third = parseQueueLease(waitingLease(now, 3), now);
    assert.equal(calculateQueueWaitMs(next, now), 80_000);
    assert.equal(calculateQueueWaitMs(third, now), 80_000 + 2 * SHOWCASE_LEASE_DURATION_MS);
    assert.equal(formatQueueCountdown(80_000), "01:20");
});

test("queue presentation distinguishes a server outage from a visitor wait", () => {
    const now = 1_700_000_000_000;
    assert.deepEqual(getQueuePresentation({ status: "unavailable" }, now), {
        visible: true,
        state: "unavailable",
        alert: "Waiting for server",
        title: "Showcase access unavailable",
        message: "The demo server is unavailable. We’ll reconnect automatically when the Showcase is ready.",
        position: "—",
        estimate: "—",
        countdown: "—",
        countdownSeconds: 0,
        showMetrics: false,
    });
    assert.deepEqual(getQueuePresentation(waitingLease(now, 2), now), {
        visible: true,
        state: "waiting",
        alert: "Waiting for an available session",
        title: "A demo is already in progress",
        message: "You are number 2 in the queue. Your streamed workspace will unlock as soon as the active visitor releases or expires their lease.",
        position: "2",
        estimate: "06:20 remaining",
        countdown: "06:20",
        countdownSeconds: 380,
        showMetrics: true,
    });
});

test("an early active departure promotes the next queued visitor through the fixed event stream", async () => {
    let now = 1_700_000_000_000;
    let receiveEvent;
    const operations = [];
    const updates = [];
    const timers = [];
    const service = {
        async request(operation) {
            operations.push(operation);
            return waitingLease(now, 1);
        },
        subscribe(listener) {
            receiveEvent = listener;
            return { close() {} };
        },
    };
    const controller = createQueueLeaseController({
        service,
        now: () => now,
        setTimer(callback, delay) {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimer() {},
        onUpdate: (lease) => updates.push(lease),
    });

    await controller.start();
    assert.equal(controller.getLease().status, "waiting");
    assert.equal(controller.getLease().position, 1);
    receiveEvent(JSON.stringify(activeLease(now)));
    assert.equal(controller.getLease().status, "active");
    assert.deepEqual(operations, ["join"]);
    assert.equal(updates.at(-1).status, "active");
    assert.equal(timers.at(-1).delay, 15_000);
});

test("expired leases revoke local access and a client leave releases the fixed lease", async () => {
    let now = 1_700_000_000_000;
    const operations = [];
    const service = {
        async request(operation) {
            operations.push(operation);
            return operation === "leave" ? { released: true } : activeLease(now);
        },
        subscribe() { return null; },
    };
    const controller = createQueueLeaseController({
        service,
        now: () => now,
        setTimer() { return 1; },
        clearTimer() {},
    });

    await controller.start();
    now += SHOWCASE_LEASE_DURATION_MS;
    assert.equal(controller.tick().status, "unavailable");
    await controller.leave();
    assert.deepEqual(operations, ["join", "leave"]);
});

test("unavailable queue service fails closed and only uses the fixed deployment paths", async () => {
    const now = 1_700_000_000_000;
    const calls = [];
    const client = createQueueServiceClient({
        locationRef: { hostname: "ns-tx.com", origin: "https://ns-tx.com" },
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: false };
        },
        eventSourceFactory: (url) => ({ url }),
    });
    await assert.rejects(client.request("join"), /rejected/);
    assert.equal(calls[0].url, `https://ns-tx.com${SHOWCASE_QUEUE_PATH}`);
    assert.equal(calls[0].options.body, JSON.stringify({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, operation: "join" }));
    assert.equal(client.subscribe(() => {}).url, `https://ns-tx.com${SHOWCASE_QUEUE_EVENTS_PATH}`);

    const controller = createQueueLeaseController({
        service: { async request() { throw new Error("offline"); } },
        now: () => now,
        setTimer() { return 1; },
        clearTimer() {},
    });
    assert.equal((await controller.start()).status, "unavailable");
});
