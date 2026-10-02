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
    renderQueueSurface,
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

test("queue state changes focus controls without scrolling the embedded shell past the card", () => {
    const now = 1_700_000_000_000;
    const scrollingElement = { scrollTop: 358, scrollLeft: 9 };
    const bodyClasses = new Map();
    const rootClasses = new Map();
    const focusCalls = [];
    const control = () => ({
        hidden: true,
        disabled: true,
        focus(options) { focusCalls.push(options); },
    });
    const surface = {
        document: {
            activeElement: null,
            scrollingElement,
            documentElement: {
                classList: {
                    toggle(name, enabled) { rootClasses.set(name, enabled); },
                },
            },
            body: {
                classList: {
                    toggle(name, enabled) { bodyClasses.set(name, enabled); },
                    contains(name) { return name === "landsnap-showcase-embedded"; },
                },
            },
        },
        overlay: {
            hidden: true,
            dataset: {},
            setAttribute() {},
            removeAttribute() {},
        },
        alert: null,
        alertIcon: null,
        alertText: null,
        title: null,
        message: null,
        tryDemo: control(),
        startDemo: control(),
        retry: control(),
        leave: control(),
        endSession: null,
        sessionCountdown: null,
        position: null,
        estimate: null,
        metrics: null,
        preparation: null,
        note: null,
        launchProgress: null,
        backgrounds: [],
        wasVisible: false,
        queueState: null,
        returnFocus: null,
    };

    renderQueueSurface(surface, { status: "idle" }, now);
    assert.equal(scrollingElement.scrollTop, 0);
    assert.equal(scrollingElement.scrollLeft, 0);
    assert.deepEqual(focusCalls.at(-1), { preventScroll: true });
    assert.equal(bodyClasses.get("landsnap-showcase-queue-open"), true);
    assert.equal(rootClasses.get("landsnap-showcase-queue-open"), true);

    scrollingElement.scrollTop = 333;
    renderQueueSurface(surface, parseQueueLease(readyLease(now), now), now);
    assert.equal(scrollingElement.scrollTop, 0);
    assert.deepEqual(focusCalls.at(-1), { preventScroll: true });
    assert.equal(surface.startDemo.hidden, false);
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

test("queue presentation follows the supervised warm-editor lifecycle without technical copy", () => {
    const now = 1_700_000_000_000;
    assert.deepEqual(getQueuePresentation({ status: "idle" }, now), {
        visible: true,
        state: "idle",
        alert: "Demo ready",
        title: "Start when you’re ready",
        message: "Your five-minute session starts after the stream connects. If the demo is busy, we’ll show your place in line.",
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
    assert.equal(starting.alert, "Preparing");
    assert.equal(starting.title, "Preparing your demo");
    assert.match(starting.message, /restarting/i);
    assert.doesNotMatch(starting.message, /Unreal|server|supervisor/i);
    assert.equal(starting.showMetrics, false);
    assert.equal(starting.showPreparation, true);
    assert.equal(starting.preparation, "This should only take a moment");
    assert.equal(starting.showLaunchProgress, false);
    assert.equal(starting.showTryDemo, false);
    assert.equal(starting.showLeave, true);
    const delayed = getQueuePresentation(startingLease(now, { overdue: true, remainingMs: 3 * 60_000 }), now);
    assert.equal(delayed.alert, "Preparing");
    assert.equal(delayed.countdown, "—");
    assert.match(delayed.message, /longer than expected/i);
    const ready = getQueuePresentation(parseQueueLease(readyLease(now), now), now);
    assert.equal(ready.visible, true);
    assert.equal(ready.alert, "Demo ready");
    assert.equal(ready.title, "Your demo is ready");
    assert.match(ready.message, /choose Start Demo/i);
    assert.match(ready.message, /will not begin until the stream connects/i);
    assert.equal(ready.showStartDemo, true);
    assert.equal(ready.showLeave, true);
    assert.equal(ready.showEndSession, false);
    assert.equal(ready.showSessionCountdown, false);
    const connecting = getQueuePresentation(parseQueueLease(readyLease(now), now), now, { launchRequested: true });
    assert.equal(connecting.visible, true);
    assert.equal(connecting.state, "connecting");
    assert.equal(connecting.title, "Opening LandSnap Showcase");
    assert.equal(connecting.showStartDemo, false);
    assert.equal(connecting.showEndSession, false);
    const active = getQueuePresentation(parseQueueLease(activeLease(now), now), now);
    assert.equal(active.visible, false);
    assert.equal(active.showEndSession, true);
    assert.equal(active.showSessionCountdown, true);
    assert.equal(active.sessionCountdown, "05:00 remaining");
    const ended = getQueuePresentation({ status: "ended" }, now);
    assert.equal(ended.title, "Your demo has ended");
    assert.equal(ended.showRetry, true);
    assert.equal(getQueuePresentation({ status: "expired" }, now).showRetry, true);
    assert.equal(getQueuePresentation({ status: "cleanup" }, now).showRetry, false);
    const unavailable = getQueuePresentation({ status: "unavailable" }, now);
    assert.equal(unavailable.message, "Please try again.");
    assert.equal(unavailable.showRetry, true);
    assert.equal(unavailable.showLeave, false);
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

test("SSE starts after join and stale subscription events cannot overwrite a newer ready lease", async () => {
    const now = 1_700_000_000_000;
    const secondLeaseId = "showcase-broker-lease-0002";
    const sources = [];
    let joinCount = 0;
    let resolveSecondJoin;
    const secondJoin = new Promise((resolve) => { resolveSecondJoin = resolve; });
    const service = {
        async request(operation) {
            assert.equal(operation, "join");
            joinCount += 1;
            return joinCount === 1 ? readyLease(now) : secondJoin;
        },
        subscribe(onMessage) {
            const source = {
                closed: false,
                onMessage,
                close() { this.closed = true; },
            };
            sources.push(source);
            return source;
        },
    };
    const controller = createQueueLeaseController({
        service,
        now: () => now,
        setTimer() { return 1; },
        clearTimer() {},
    });

    await controller.start();
    assert.equal(controller.getLease().status, "ready");
    assert.equal(sources.length, 1);

    const restart = controller.restart();
    assert.equal(controller.getLease().status, "requesting");
    assert.equal(sources[0].closed, true);
    assert.equal(sources.length, 1, "restart must not subscribe before its join response");

    sources[0].onMessage(JSON.stringify({
        protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
        status: "idle",
        pollAfterMs: 1_000,
    }));
    assert.equal(controller.getLease().status, "requesting");

    resolveSecondJoin({ ...readyLease(now), leaseId: secondLeaseId });
    await restart;
    assert.equal(controller.getLease().status, "ready");
    assert.equal(controller.getLease().leaseId, secondLeaseId);
    assert.equal(sources.length, 2);

    sources[0].onMessage(JSON.stringify({
        protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
        status: "idle",
        pollAfterMs: 1_000,
    }));
    assert.equal(controller.getLease().status, "ready");
    assert.equal(controller.getLease().leaseId, secondLeaseId);

    sources[1].onMessage(JSON.stringify(activeLease(now)));
    assert.equal(controller.getLease().status, "ready", "a different lease id must not replace the subscribed lease");
    sources[1].onMessage(JSON.stringify({ ...activeLease(now), leaseId: secondLeaseId }));
    assert.equal(controller.getLease().status, "active");
    assert.equal(controller.getLease().leaseId, secondLeaseId);
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
        locationRef: { hostname: "showcase.ns-tx.com", origin: "https://showcase.ns-tx.com", protocol: "https:" },
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
    assert.equal(calls.length, 1, "the product origin cannot send a relative lease POST");
    for (const locationRef of [
        { hostname: "showcase.ns-tx.com", origin: "http://showcase.ns-tx.com", protocol: "http:" },
        { hostname: "showcase.ns-tx.com", origin: "https://ns-tx.com", protocol: "https:" },
    ]) {
        const invalidOriginClient = createQueueServiceClient({ locationRef, fetchImpl: async () => { throw new Error("must not fetch"); } });
        await assert.rejects(invalidOriginClient.request("join"), /unavailable/);
    }

    const controller = createQueueLeaseController({
        service: { async request() { throw new Error("offline"); } },
        now: () => now,
        setTimer() { return 1; },
        clearTimer() {},
    });
    assert.equal((await controller.start()).status, "unavailable");
});

test("fresh cookie-bound controller restores waiting/preparing/ready with status and no admission join", async () => {
    const now = 1_700_000_000_000;
    for (const record of [waitingLease(now, 2), startingLease(now), readyLease(now)]) {
        const operations = [];
        let subscriptions = 0;
        const controller = createQueueLeaseController({
            service: {
                async request(operation) { operations.push(operation); return record; },
                subscribe() { subscriptions += 1; return { close() {} }; },
            },
            now: () => now, setTimer: () => 1, clearTimer() {},
        });
        const restored = await controller.resume();
        assert.equal(restored.status, record.status);
        assert.deepEqual(operations, ["status"], "reload must never implicitly join or start a player");
        assert.equal(subscriptions, 1, "one current subscription after status restoration");
        await controller.resume();
        assert.deepEqual(operations, ["status"], "duplicate pageshow/resume does not issue another request");
        controller.suspend();
    }
});

test("fresh status restore cannot revive a controller retired by explicit exit", async () => {
    const now = 1_700_000_000_000;
    let resolveStatus;
    const pending = new Promise((resolve) => { resolveStatus = resolve; });
    const operations = [];
    let subscriptions = 0;
    const controller = createQueueLeaseController({
        service: {
            async request(operation) { operations.push(operation); return operation === "status" ? pending : null; },
            subscribe() { subscriptions += 1; return { close() {} }; },
        },
        now: () => now, setTimer: () => 1, clearTimer() {},
    });
    const restoring = controller.resume();
    await controller.leave();
    resolveStatus(readyLease(now));
    await restoring;
    assert.deepEqual(operations, ["status", "leave"]);
    assert.equal(controller.getLease().status, "idle");
    assert.equal(controller.isStarted(), false);
    assert.equal(subscriptions, 0, "retired restoration cannot open a current subscription");
});
