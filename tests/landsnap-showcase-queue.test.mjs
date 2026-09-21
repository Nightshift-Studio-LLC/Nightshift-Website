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
    isPublicShowcaseHost,
    isReadyQueueLease,
    parseQueueLease,
    stabilizeQueueTiming,
} from "../scripts/landsnap-showcase-queue.js";

const opaqueId = "showcase-broker-lease-0001";
const readyLease = (now) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "ready",
    leaseId: opaqueId,
    expiresAt: now + SHOWCASE_LEASE_DURATION_MS,
    heartbeatAfterMs: 15_000,
    sessionUrl: "/api/landsnap-showcase/session/v1/player/showcase-player-ticket-001",
    sessionToken: "signed-session-ticket-for-showcase-0001",
    sessionExpiresAt: now + 90_000,
});

const startingLease = (now) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "starting",
    leaseId: opaqueId,
    expectedReadyAt: now + 30_000,
    pollAfterMs: 1_000,
});

const waitingLease = (now, position = 1) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "waiting",
    position,
    activeLeaseExpiresAt: now + 80_000,
    pollAfterMs: 1_000,
});

test("queue parser accepts only broker-issued starting, waiting, or ready records", () => {
    const now = 1_700_000_000_000;
    const parsedReady = parseQueueLease(readyLease(now), now);
    assert.deepEqual(parsedReady, {
        status: "ready",
        leaseId: opaqueId,
        expiresAt: now + SHOWCASE_LEASE_DURATION_MS,
        heartbeatAfterMs: 15_000,
        session: {
            url: "/api/landsnap-showcase/session/v1/player/showcase-player-ticket-001",
            token: "signed-session-ticket-for-showcase-0001",
            expiresAt: now + 90_000,
        },
    });
    assert.equal(isReadyQueueLease(parsedReady, now), true);
    assert.equal(parseQueueLease({ ...readyLease(now), endpoint: "wss://visitor.invalid" }, now), null);
    assert.equal(parseQueueLease({ ...readyLease(now), sessionUrl: "https://visitor.invalid/player" }, now), null);
    assert.equal(parseQueueLease({ ...readyLease(now), sessionExpiresAt: now - 1 }, now), null);
    assert.equal(parseQueueLease({ ...waitingLease(now), position: 0 }, now), null);
    assert.equal(parseQueueLease({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, status: "ready" }, now), null);
});

test("waiting estimates use the five-minute maximum while making early release an explicit possibility", () => {
    const now = 1_700_000_000_000;
    const next = parseQueueLease(waitingLease(now, 1), now);
    const third = parseQueueLease(waitingLease(now, 3), now);
    assert.equal(calculateQueueWaitMs(next, now), 80_000);
    assert.equal(calculateQueueWaitMs(third, now), 80_000 + 2 * SHOWCASE_LEASE_DURATION_MS);
    assert.equal(formatQueueCountdown(80_000), "01:20");
    const presentation = getQueuePresentation(third, now);
    assert.equal(presentation.estimate, "11:20 estimated");
    assert.match(presentation.message, /number 3 in line/i);
    assert.match(presentation.note, /five-minute limit/i);
    assert.match(presentation.note, /ends early/i);
});

test("repeated status polls cannot reset a launch or queue countdown backward", () => {
    const now = 1_700_000_000_000;
    const firstStart = parseQueueLease(startingLease(now), now);
    const laterStart = parseQueueLease({ ...startingLease(now), expectedReadyAt: now + 60_000 }, now);
    assert.equal(stabilizeQueueTiming(firstStart, laterStart).expectedReadyAt, now + 30_000);

    const firstWait = parseQueueLease(waitingLease(now, 1), now);
    const laterWait = parseQueueLease({ ...waitingLease(now, 1), activeLeaseExpiresAt: now + 120_000 }, now);
    assert.equal(stabilizeQueueTiming(firstWait, laterWait).activeLeaseExpiresAt, now + 80_000);

    const promoted = parseQueueLease(waitingLease(now, 2), now);
    assert.equal(stabilizeQueueTiming(firstWait, promoted).activeLeaseExpiresAt, now + 80_000);
});

test("queue presentation starts idle, keeps the gray gate through startup, and hides only once ready", () => {
    const now = 1_700_000_000_000;
    assert.deepEqual(getQueuePresentation({ status: "idle" }, now), {
        visible: true,
        state: "idle",
        alert: "Ready when you are",
        title: "Start your demo",
        message: "If someone else is using it, we’ll show your place in line and an estimated wait.",
        position: "—",
        estimate: "—",
        countdown: "—",
        countdownSeconds: 0,
        showMetrics: false,
        showNote: false,
        showLaunchProgress: false,
        note: "",
        showTryDemo: true,
        showRetry: false,
        showLeave: false,
        showEndSession: false,
    });
    const starting = getQueuePresentation(startingLease(now), now);
    assert.equal(starting.visible, true);
    assert.equal(starting.alert, "Your demo is reserved");
    assert.equal(starting.title, "Starting your demo");
    assert.match(starting.message, /start automatically/i);
    assert.equal(starting.position, "Reserved");
    assert.equal(starting.estimate, "00:30 estimated");
    assert.equal(starting.showLaunchProgress, true);
    assert.equal(starting.showTryDemo, false);
    assert.equal(starting.showLeave, true);
    const delayed = getQueuePresentation(startingLease(now), now + 31_000);
    assert.equal(delayed.alert, "Taking a little longer");
    assert.equal(delayed.countdown, "00:00+");
    assert.match(delayed.message, /little longer/i);
    const ready = getQueuePresentation(parseQueueLease(readyLease(now), now), now);
    assert.equal(ready.visible, false);
    assert.equal(ready.showEndSession, true);
    const unavailable = getQueuePresentation({ status: "unavailable" }, now);
    assert.equal(unavailable.showRetry, true);
    assert.equal(unavailable.showLeave, true);
});

test("Try Demo joins once, then uses status until ready and heartbeat only for a ready lease", async () => {
    let now = 1_700_000_000_000;
    const operations = [];
    const timers = [];
    const service = {
        async request(operation) {
            operations.push(operation);
            if (operation === "join") return startingLease(now);
            if (operation === "status") return readyLease(now);
            return readyLease(now);
        },
        subscribe() { return { close() {} }; },
    };
    const controller = createQueueLeaseController({
        service,
        now: () => now,
        setTimer(callback, delay) {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimer() {},
    });

    assert.equal(controller.getLease().status, "idle");
    await controller.start();
    assert.deepEqual(operations, ["join"]);
    assert.equal(controller.getLease().status, "starting");
    await controller.recheck();
    assert.deepEqual(operations, ["join", "status"]);
    assert.equal(controller.getLease().status, "ready");
    await timers.at(-1).callback();
    assert.deepEqual(operations, ["join", "status", "heartbeat"]);
});

test("stream loss and ticket expiry clear the local lease before a fixed broker status check", async () => {
    let now = 1_700_000_000_000;
    const operations = [];
    const service = {
        async request(operation) {
            operations.push(operation);
            return operation === "join" ? readyLease(now) : startingLease(now);
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
    assert.equal(controller.getLease().status, "ready");
    await controller.recheck();
    assert.deepEqual(operations, ["join", "status"]);
    assert.equal(controller.getLease().status, "starting");
    controller.receive(JSON.stringify(readyLease(now)));
    now += 90_000;
    assert.equal(controller.tick().status, "unavailable");
});

test("only the dedicated Showcase host can use the fixed same-origin broker paths", async () => {
    const now = 1_700_000_000_000;
    const calls = [];
    const client = createQueueServiceClient({
        locationRef: { hostname: "showcase.ns-tx.com", origin: "https://showcase.ns-tx.com" },
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return { ok: false };
        },
        eventSourceFactory: (url) => ({ url }),
    });
    await assert.rejects(client.request("join"), /rejected/);
    assert.equal(isPublicShowcaseHost("showcase.ns-tx.com"), true);
    assert.equal(isPublicShowcaseHost("ns-tx.com"), false);
    assert.equal(calls[0].url, `https://showcase.ns-tx.com${SHOWCASE_QUEUE_PATH}`);
    assert.equal(calls[0].options.body, JSON.stringify({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, operation: "join" }));
    assert.equal(client.subscribe(() => {}).url, `https://showcase.ns-tx.com${SHOWCASE_QUEUE_EVENTS_PATH}`);
    await assert.rejects(client.request("launch"), /Unknown Showcase queue operation/);

    const productPageClient = createQueueServiceClient({
        locationRef: { hostname: "ns-tx.com", origin: "https://ns-tx.com" },
    });
    await assert.rejects(productPageClient.request("join"), /unavailable/);

    const controller = createQueueLeaseController({
        service: { async request() { throw new Error("offline"); } },
        now: () => now,
        setTimer() { return 1; },
        clearTimer() {},
    });
    assert.equal((await controller.start()).status, "unavailable");
});
