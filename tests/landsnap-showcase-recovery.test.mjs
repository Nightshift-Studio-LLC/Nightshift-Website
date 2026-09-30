import assert from "node:assert/strict";
import test from "node:test";
import { createPublicShowcaseTransportWithDependencies, SHOWCASE_RESPONSE_LISTENER } from "../tools/landsnap/landsnap-showcase-ps2-public-entry.js";
import { installPublicShowcaseBootstrap } from "../scripts/landsnap-showcase-public.js";
import { createQueueLeaseController, parseQueueLease, getQueuePresentation, SHOWCASE_START_REQUEST_EVENT, SHOWCASE_QUEUE_PROTOCOL_VERSION } from "../scripts/landsnap-showcase-queue.js";

const locationRef = { hostname: "showcase.ns-tx.com", origin: "https://showcase.ns-tx.com", protocol: "https:" };
const input = { mouse: true, keyboard: false, touch: false, gamepad: false, xr: false };
const clockStart = 1_700_000_000_000;
const leaseId = "showcase-recovery-lease-0001";
const readyRecord = (now, token = "signed-recovery-ticket-for-showcase-0001") => ({
    protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, status: "ready", phase: "ready", leaseId,
    readyClaimExpiresAt: now + 90_000, heartbeatAfterMs: 15_000,
    sessionUrl: "/api/landsnap-showcase/session/v1/player/showcase-recovery-player-0001",
    sessionToken: token, sessionTokenExpiresAt: now + 90_000,
});
const endedRecord = (now) => ({ protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, status: "ended", reason: "peer_disconnected", endedAt: now, pollAfterMs: 1_000 });
const readyLease = (now, token) => parseQueueLease(readyRecord(now, token), now);
const keys = (names) => Object.fromEntries(names.split(" ").map((name) => [name, name]));
class FakeStream {
    constructor() { this.events = new Map(); this.responses = new Map(); this.sent = []; FakeStream.latest = this; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    addResponseEventListener(name, fn) { this.responses.set(name, fn); }
    connect() { this.connects = (this.connects || 0) + 1; }
    disconnect() { this.disconnects = (this.disconnects || 0) + 1; }
    emitUIInteraction(payload) { this.sent.push(payload); return true; }
    event(name) { this.events.get(name)?.(); }
    reply(code, request = this.sent.at(-1)) {
        this.responses.get(SHOWCASE_RESPONSE_LISTENER)(JSON.stringify({
            version: "landsnap-showcase-v1", type: "operation-result", action: "session_ready",
            requestId: request.requestId, result: code === "session_ready" ? "success" : "rejected", code,
        }));
    }
}
const dependencies = {
    Config: class {}, PixelStreaming: FakeStream,
    Flags: keys("AutoConnect AutoPlayVideo MouseInput KeyboardInput TouchInput GamepadInput XRControllerInput FakeMouseWithTouches UseMic UseCamera UseModalForTextInput AutoEnterVR SuppressBrowserKeys"),
    NumericParameters: keys("MaxReconnectAttempts"), OptionParameters: keys("PreferredCodec"), TextParameters: keys("SignallingServerUrl"),
};
const fakeTimers = () => {
    const pending = new Map(); let sequence = 0;
    return {
        setTimeout(fn, delay) { pending.set(++sequence, { fn, delay }); return sequence; },
        clearTimeout(id) { pending.delete(id); },
        flush() { const [id, timer] = pending.entries().next().value || []; if (!timer) return false; pending.delete(id); timer.fn(); return true; },
        get count() { return pending.size; },
    };
};
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

test("a fourth correlated initializing reply is progress, not a failed handshake", async () => {
    const timers = fakeTimers(); const states = [];
    const transport = createPublicShowcaseTransportWithDependencies(dependencies, locationRef, async () => ({ status: 204 }), () => clockStart, timers);
    transport.onConnectionState((state) => states.push(state));
    await transport.mount({ replaceChildren() {} }, { input, session: readyLease(clockStart).session });
    const stream = FakeStream.latest; stream.event("dataChannelOpen");
    for (let attempt = 0; attempt < 4; attempt += 1) { stream.reply("session_initializing"); assert.equal(timers.flush(), true); }
    assert.equal(states.includes("error"), false);
    transport.disconnect(); assert.equal(timers.count, 0);
});

for (const earlyChannel of [false, true]) {
    test(`six-minute startup with broker renewals survives ${earlyChannel ? "correlated initializing replies" : "a late data channel"}`, async () => {
        let now = clockStart; const timers = fakeTimers(); const states = []; let ready = 0;
        const transport = createPublicShowcaseTransportWithDependencies(dependencies, locationRef, async () => ({ status: 204 }), () => now, timers);
        transport.onConnectionState((state) => states.push(state));
        transport.onSessionReady(() => { ready += 1; });
        assert.equal(transport.updateReadyLease(readyLease(now)), true);
        await transport.mount({ replaceChildren() {} }, { input, session: readyLease(now).session });
        const stream = FakeStream.latest;
        if (earlyChannel) stream.event("dataChannelOpen");
        for (let elapsed = 0; elapsed < 360_000; elapsed += 15_000) {
            if (earlyChannel) stream.reply("session_initializing");
            now += 15_000;
            assert.equal(transport.updateReadyLease(readyLease(now, `signed-recovery-ticket-for-showcase-${elapsed}`)), true);
            if (earlyChannel) assert.equal(timers.flush(), true);
            else assert.equal(timers.count, 0, "no readiness timer runs without a data channel");
            assert.equal(states.includes("error"), false);
            assert.equal(ready, 0);
            assert.equal(stream.disconnects || 0, 0);
        }
        if (!earlyChannel) stream.event("dataChannelOpen");
        stream.reply("session_ready");
        assert.equal(ready, 1);
        assert.equal(timers.count, 0);
        assert.equal(stream.connects, 1);
        transport.disconnect();
        stream.event("dataChannelOpen"); stream.reply("session_ready");
        assert.equal(ready, 1, "retired peers cannot reactivate the session");
        assert.equal(timers.count, 0);
    });
}

test("ready renewal rejects changed ownership, changed player paths and expired tickets", async () => {
    let now = clockStart; const timers = fakeTimers(); const states = [];
    const transport = createPublicShowcaseTransportWithDependencies(dependencies, locationRef, async () => ({ status: 204 }), () => now, timers);
    transport.onConnectionState((state) => states.push(state));
    const lease = readyLease(now);
    assert.equal(transport.updateReadyLease(lease), true);
    await transport.mount({ replaceChildren() {} }, { input, session: lease.session });
    assert.equal(transport.updateReadyLease({ ...lease, leaseId: "showcase-recovery-lease-0002" }), false);
    assert.equal(transport.updateReadyLease({ ...lease, session: { ...lease.session, url: `${lease.session.url}-changed` } }), false);
    now = lease.readyClaimExpiresAt;
    assert.equal(transport.updateReadyLease(lease), false);
    FakeStream.latest.event("dataChannelOpen");
    assert.equal(states.at(-1), "error");
    assert.equal(FakeStream.latest.sent.length, 0);
    assert.equal(timers.count, 0);
});

test("terminal readiness rejection stops immediately and late success cannot activate", async () => {
    for (const code of ["operation_rejected", "operation_failed"]) {
        const timers = fakeTimers(); const states = []; let ready = 0;
        const transport = createPublicShowcaseTransportWithDependencies(dependencies, locationRef, async () => ({ status: 204 }), () => clockStart, timers);
        transport.onConnectionState((state) => states.push(state)); transport.onSessionReady(() => { ready += 1; });
        await transport.mount({ replaceChildren() {} }, { input, session: readyLease(clockStart).session });
        const stream = FakeStream.latest; stream.event("dataChannelOpen"); stream.reply(code);
        assert.equal(states.at(-1), "error"); assert.equal(timers.count, 0);
        stream.reply("session_ready");
        assert.equal(ready, 0);
        stream.event("dataChannelOpen"); stream.event("webRtcConnected");
        assert.equal(stream.sent.length, 1, "a terminally rejected peer cannot start another handshake");
        assert.equal(states.at(-1), "error");
        transport.disconnect();
    }
});

test("cleanup during ticket exchange cannot create or reconnect a retired peer", async () => {
    let resolveTicket; const previous = FakeStream.latest; let cleared = 0;
    const transport = createPublicShowcaseTransportWithDependencies(dependencies, locationRef, () => new Promise((resolve) => { resolveTicket = resolve; }), () => clockStart, fakeTimers());
    const mounting = transport.mount({ replaceChildren() { cleared += 1; } }, { input, session: readyLease(clockStart).session });
    transport.disconnect(); resolveTicket({ status: 204 }); await mounting;
    assert.equal(FakeStream.latest, previous); assert.equal(cleared, 0);
    assert.equal(transport.updateReadyLease(readyLease(clockStart)), false);
});

const fakeWindow = (lease) => {
    const listeners = new Map();
    const windowRef = {
        location: locationRef, LandSnapShowcaseQueueLease: lease,
        CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
        addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
        dispatchEvent(event) { listeners.get(event.type)?.forEach((fn) => fn(event)); },
        emit(type) { this.dispatchEvent(new this.CustomEvent(type)); },
        lease(next) { this.LandSnapShowcaseQueueLease = next; this.emit("landsnap-showcase-lease-change"); },
    };
    return windowRef;
};
const fakeTransport = () => {
    const listeners = new Set();
    return {
        mount() {}, emitUIInteraction() {}, onResponse() {}, onSessionReady() {},
        updateReadyLease(lease) { this.lease = lease; },
        onConnectionState(fn) { listeners.add(fn); fn("disconnected"); },
        state(state) { listeners.forEach((fn) => fn(state)); },
        disconnect() { this.disconnects = (this.disconnects || 0) + 1; this.state("disconnected"); },
    };
};

test("transient transport recovery preserves the peer; a closed peer replaces only with a fresh same-lease ticket", async () => {
    const now = Date.now(); const windowRef = fakeWindow(readyLease(now)); const transports = [];
    await installPublicShowcaseBootstrap(windowRef, async () => { const transport = fakeTransport(); transports.push(transport); return transport; });
    windowRef.emit(SHOWCASE_START_REQUEST_EVENT); await settle();
    const first = transports[0]; first.state("connecting"); first.state("connected"); first.state("disconnected");
    windowRef.lease(readyLease(now)); await settle();
    assert.equal(transports.length, 1, "the consumed ticket is never replayed");
    first.state("connected");
    windowRef.lease(readyLease(now, "signed-recovery-ticket-for-showcase-0002")); await settle();
    assert.equal(transports.length, 1, "a recovered peer survives ordinary ticket rotation");
    first.state("disconnected");
    windowRef.lease(readyLease(now, "signed-recovery-ticket-for-showcase-0003")); await settle();
    assert.equal(transports.length, 2); assert.equal(first.disconnects, 1);
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, transports[1]);
    windowRef.lease(parseQueueLease(endedRecord(now), now)); await settle();
    assert.equal(transports[1].disconnects, 1); assert.equal(windowRef.LandSnapShowcasePixelStreaming, undefined);
    windowRef.lease(readyLease(now)); await settle();
    assert.equal(transports.length, 2, "terminal outcomes revoke the Start Demo authorization");
});

test("a late import cannot install after terminal cleanup even if the same identity reappears", async () => {
    const now = Date.now(); const windowRef = fakeWindow(readyLease(now)); let resolveImport;
    await installPublicShowcaseBootstrap(windowRef, () => new Promise((resolve) => { resolveImport = resolve; }));
    windowRef.emit(SHOWCASE_START_REQUEST_EVENT);
    windowRef.lease(parseQueueLease(endedRecord(now), now)); windowRef.lease(readyLease(now));
    const transport = fakeTransport(); resolveImport(transport); await settle();
    assert.equal(transport.disconnects, 1); assert.equal(windowRef.LandSnapShowcasePixelStreaming, undefined);
});

test("slow preparation lasts six minutes without a usable-session clock or automatic leave", async () => {
    let now = clockStart; const operations = [];
    const raw = { protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION, status: "starting", phase: "preparing", leaseId,
        preparationExpiresAt: now + 600_000, expectedReadyAt: now + 600_000, preparationRemainingMs: 600_000,
        preparationOverdue: false, pollAfterMs: 1_000 };
    const controller = createQueueLeaseController({ service: { async request(op) { operations.push(op); return raw; } }, now: () => now, setTimer() { return 1; }, clearTimer() {} });
    await controller.start();
    for (let elapsed = 0; elapsed < 360_000; elapsed += 15_000) {
        now += 15_000; controller.tick(); await controller.recheck();
        assert.equal(controller.getLease().status, "starting");
        assert.equal(getQueuePresentation(controller.getLease(), now).showSessionCountdown, undefined);
    }
    assert.equal(operations.filter((op) => op === "join").length, 1); assert.equal(operations.includes("leave"), false);
});

test("an authoritative terminal event defeats an older in-flight ready response", async () => {
    let resolveStatus; const operations = [];
    const controller = createQueueLeaseController({ service: { request(op) { operations.push(op); return op === "join" ? Promise.resolve(readyRecord(clockStart)) : new Promise((resolve) => { resolveStatus = resolve; }); } }, now: () => clockStart, setTimer() { return 1; }, clearTimer() {} });
    await controller.start(); const checking = controller.recheck();
    controller.receive(JSON.stringify(endedRecord(clockStart)));
    resolveStatus(readyRecord(clockStart)); await checking;
    assert.equal(controller.getLease().status, "ended"); assert.equal(getQueuePresentation(controller.getLease(), clockStart).showRetry, true);
    assert.deepEqual(operations, ["join", "status"]);
});

test("delayed status cannot resurrect a lease after explicit exit", async () => {
    let resolveStatus; const operations = []; const updates = [];
    const controller = createQueueLeaseController({ service: { request(op) { operations.push(op); if (op === "status") return new Promise((resolve) => { resolveStatus = resolve; }); return Promise.resolve(op === "join" ? readyRecord(clockStart) : {}); } }, now: () => clockStart, setTimer() { return 1; }, clearTimer() {}, onUpdate(lease) { updates.push(lease.status); } });
    await controller.start(); const checking = controller.recheck(); await controller.leave();
    resolveStatus(readyRecord(clockStart)); await checking;
    assert.equal(controller.getLease().status, "idle"); assert.equal(controller.isStarted(), false);
    assert.deepEqual(updates, ["requesting", "ready", "cleanup", "idle"]);
    assert.deepEqual(operations, ["join", "status", "leave"]);
});
