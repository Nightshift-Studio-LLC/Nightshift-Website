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
    phase: "ready",
    leaseId: opaqueId,
    readyClaimExpiresAt: now + 90_000,
    heartbeatAfterMs: 15_000,
    sessionUrl: "/api/landsnap-showcase/session/v1/player/showcase-player-ticket-001",
    sessionToken: "signed-session-ticket-for-showcase-0001",
    sessionTokenExpiresAt: now + 90_000,
});

const activeLease = (now) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "active",
    phase: "active",
    leaseId: opaqueId,
    sessionExpiresAt: now + SHOWCASE_LEASE_DURATION_MS,
    heartbeatAfterMs: 15_000,
});

const startingLease = (now, { overdue = false, remainingMs = 10 * 60_000 } = {}) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "starting",
    phase: "preparing",
    leaseId: opaqueId,
    preparationExpiresAt: now + remainingMs,
    expectedReadyAt: now + remainingMs,
    preparationRemainingMs: remainingMs,
    preparationOverdue: overdue,
    pollAfterMs: 1_000,
});

const waitingLease = (now, position = 1, estimatedWaitMs = 80_000) => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
    status: "waiting",
    position,
    estimatedWaitMs,
    activeLeaseDeadline: now + estimatedWaitMs,
    pollAfterMs: 1_000,
});

test("queue parser accepts only the exact separated broker lifecycle records", () => {
    const now = 1_700_000_000_000;
    const parsedReady = parseQueueLease(readyLease(now), now);
    assert.deepEqual(parsedReady, {
        status: "ready",
        leaseId: opaqueId,
        readyClaimExpiresAt: now + 90_000,
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
    assert.equal(parseQueueLease({ ...readyLease(now), sessionTokenExpiresAt: now - 1 }, now), null);
    assert.equal(parseQueueLease({ ...readyLease(now), expiresAt: now + SHOWCASE_LEASE_DURATION_MS }, now), null);
    assert.equal(parseQueueLease({ ...waitingLease(now), position: 0 }, now), null);
    assert.equal(parseQueueLease({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, status: "ready" }, now), null);
    assert.deepEqual(parseQueueLease(activeLease(now), now), {
        status: "active",
        leaseId: opaqueId,
        sessionExpiresAt: now + SHOWCASE_LEASE_DURATION_MS,
        heartbeatAfterMs: 15_000,
    });
    assert.deepEqual(parseQueueLease({
        protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
        status: "ended",
        reason: "visitor_left",
        endedAt: now,
        pollAfterMs: 1_000,
    }, now), { status: "ended", reason: "visitor_left", endedAt: now, pollAfterMs: 1_000 });
    assert.deepEqual(parseQueueLease({
        protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
        status: "idle",
        pollAfterMs: 1_000,
    }, now), { status: "idle", pollAfterMs: 1_000 });
});

test("waiting renders only the broker estimate for a real second visitor", () => {
    const now = 1_700_000_000_000;
    const next = parseQueueLease(waitingLease(now, 1), now);
    const third = parseQueueLease(waitingLease(now, 3, 680_000), now);
    assert.equal(calculateQueueWaitMs(next, now), 80_000);
    assert.equal(calculateQueueWaitMs(third, now), 680_000);
    assert.equal(formatQueueCountdown(80_000), "01:20");
    const presentation = getQueuePresentation(third, now);
    assert.equal(presentation.estimate, "11:20 estimated");
    assert.match(presentation.message, /number 3 in line/i);
    assert.match(presentation.note, /updates/i);
});

test("repeated status polls cannot reset a launch or queue countdown backward", () => {
    const now = 1_700_000_000_000;
    const firstStart = parseQueueLease(startingLease(now), now);
    const laterStart = parseQueueLease(startingLease(now, { remainingMs: 12 * 60_000 }), now);
    assert.equal(stabilizeQueueTiming(firstStart, laterStart).preparationExpiresAt, now + 10 * 60_000);

    const firstWait = parseQueueLease(waitingLease(now, 1), now);
    const laterWait = parseQueueLease(waitingLease(now, 1, 120_000), now);
    assert.equal(stabilizeQueueTiming(firstWait, laterWait).estimatedWaitEndsAt, now + 80_000);

    const promoted = parseQueueLease(waitingLease(now, 2), now);
    assert.equal(stabilizeQueueTiming(firstWait, promoted).estimatedWaitEndsAt, now + 80_000);
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
    assert.equal(starting.alert, "Preparing your demo");
    assert.equal(starting.title, "Preparing your demo");
    assert.match(starting.message, /Unreal Editor/i);
    assert.equal(starting.showMetrics, false);
    assert.equal(starting.showPreparation, true);
    assert.equal(starting.preparation, "Usually ready in about 6–7 minutes");
    assert.equal(starting.showLaunchProgress, true);
    assert.equal(starting.showTryDemo, false);
    assert.equal(starting.showLeave, true);
    const delayed = getQueuePresentation(startingLease(now, { overdue: true, remainingMs: 3 * 60_000 }), now);
    assert.equal(delayed.alert, "Still preparing");
    assert.equal(delayed.countdown, "—");
    assert.match(delayed.message, /little longer/i);
    const ready = getQueuePresentation(parseQueueLease(readyLease(now), now), now);
    assert.equal(ready.visible, false);
    assert.equal(ready.showEndSession, true);
    assert.equal(ready.showSessionCountdown, false);
    const active = getQueuePresentation(parseQueueLease(activeLease(now), now), now);
    assert.equal(active.visible, false);
    assert.equal(active.showEndSession, true);
    assert.equal(active.showSessionCountdown, true);
    assert.equal(active.sessionCountdown, "05:00 remaining");
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

test("ticket refresh never starts the clock and only active session expiry ends the demo", async () => {
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
    assert.equal(controller.tick().status, "ready");
    await Promise.resolve();
    assert.deepEqual(operations, ["join", "status", "status"]);
    controller.receive(JSON.stringify(activeLease(now)));
    assert.equal(controller.getLease().status, "active");
    now += SHOWCASE_LEASE_DURATION_MS;
    assert.equal(controller.tick().status, "expired");
});

test("backgrounding suspends the same visitor and resume rehydrates with status without resetting the wait", async () => {
    let now = 1_700_000_000_000;
    const operations = [];
    const sources = [];
    const timers = [];
    const firstDeadline = now + 80_000;
    const service = {
        async request(operation) {
            operations.push(operation);
            if (operation === "join") return waitingLease(now, 2);
            return waitingLease(now, 2, 120_000);
        },
        subscribe() {
            const source = { closed: false, close() { this.closed = true; } };
            sources.push(source);
            return source;
        },
        releaseWithBeacon() { throw new Error("backgrounding must not leave"); },
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

    await controller.start();
    assert.equal(controller.getLease().estimatedWaitEndsAt, firstDeadline);
    controller.suspend();
    assert.equal(controller.isStarted(), true);
    assert.equal(controller.isSuspended(), true);
    assert.equal(sources[0].closed, true);

    now += 5_000;
    await controller.resume();
    assert.deepEqual(operations, ["join", "status"]);
    assert.equal(controller.isSuspended(), false);
    assert.equal(sources.length, 2);
    assert.equal(controller.getLease().position, 2);
    assert.equal(controller.getLease().estimatedWaitEndsAt, firstDeadline);
});

test("a transient reconnect failure preserves the broker lease and its ticket", async () => {
    const now = 1_700_000_000_000;
    const operations = [];
    const service = {
        async request(operation) {
            operations.push(operation);
            if (operation === "join") return readyLease(now);
            throw new Error("briefly offline");
        },
        subscribe() { return { close() {} }; },
    };
    const controller = createQueueLeaseController({
        service,
        now: () => now,
        setTimer() { return 1; },
        clearTimer() {},
    });

    await controller.start();
    const ticket = controller.getLease().session.token;
    controller.suspend();
    await controller.resume();
    assert.deepEqual(operations, ["join", "status"]);
    assert.equal(controller.getLease().status, "ready");
    assert.equal(controller.getLease().session.token, ticket);
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
