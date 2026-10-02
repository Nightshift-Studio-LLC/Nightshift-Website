import assert from "node:assert/strict";
import test from "node:test";
import {
    OBSERVER_INPUT_POLICY,
    OBSERVER_PROTOCOL_VERSION,
    OBSERVER_SESSION_PATH,
    createObserverController,
    createObserverServiceClient,
    createObserverSignallingUrl,
    isObserverCapabilityEnabled,
    isObserverSessionUrl,
    installObserverSurface,
    parseObserverTicket,
} from "../scripts/landsnap-showcase-observer.js";
import {
    OBSERVER_INPUT_SETTINGS,
    createObserverShowcaseSettings,
    createObserverShowcaseTransportWithDependencies,
    isObserverSignallingUrl,
} from "../tools/landsnap/landsnap-showcase-ps2-observer-entry.js";

const locationRef = {
    hostname: "showcase.ns-tx.com",
    protocol: "https:",
    origin: "https://showcase.ns-tx.com",
};
const now = 1_700_000_000_000;
const ticket = {
    protocol: OBSERVER_PROTOCOL_VERSION,
    status: "ready",
    sessionUrl: "/api/landsnap-showcase/session/v1/observer/observer-ticket-0001",
    sessionToken: "signed-observer-session-ticket-0001",
    sessionTokenExpiresAt: now + 20_000,
};

test("observer ticket parsing is strict and keeps the endpoint same-origin", () => {
    assert.equal(isObserverSessionUrl(ticket.sessionUrl, locationRef), true);
    assert.equal(isObserverSessionUrl("/api/landsnap-showcase/session/v1/player/presenter-0001", locationRef), false);
    assert.deepEqual(parseObserverTicket(ticket, { now, locationRef }), ticket);
    assert.equal(parseObserverTicket({ ...ticket, protocol: "landsnap-showcase-observer-v2" }, { now, locationRef }), null);
    assert.equal(parseObserverTicket({ ...ticket, extra: true }, { now, locationRef }), null);
    assert.equal(parseObserverTicket({ ...ticket, sessionUrl: "https://elsewhere.invalid/observer" }, { now, locationRef }), null);
    assert.equal(parseObserverTicket({ ...ticket, sessionTokenExpiresAt: now - 1 }, { now, locationRef }), null);
    assert.equal(createObserverSignallingUrl(ticket, locationRef, now), "wss://showcase.ns-tx.com/api/landsnap-showcase/session/v1/observer/observer-ticket-0001");
});

test("observer service sends the separate watch protocol, claims once, and never uses presenter queue paths", async () => {
    const calls = [];
    const service = createObserverServiceClient({
        locationRef,
        now: () => now,
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            return calls.length === 1
                ? { ok: true, status: 200, async json() { return ticket; } }
                : { ok: true, status: 204 };
        },
    });
    const requested = await service.requestTicket();
    const claimed = await service.claim(requested, () => now);
    assert.deepEqual(requested, ticket);
    assert.equal(claimed.signallingUrl.startsWith("wss://showcase.ns-tx.com/"), true);
    assert.equal(calls[0].url, `https://showcase.ns-tx.com${OBSERVER_SESSION_PATH}`);
    assert.equal(calls[0].options.body, JSON.stringify({ protocol: OBSERVER_PROTOCOL_VERSION, operation: "watch" }));
    assert.equal(calls[0].options.credentials, "include");
    assert.equal(calls[1].url, ticket.sessionUrl);
    assert.equal(calls[1].options.headers.Authorization, `Bearer ${ticket.sessionToken}`);
    assert.equal(calls.some(({ url }) => url.includes("/queue/v1/lease")), false);
});

test("observer controller passes an input-disabled policy and cleanup only disconnects the observer", async () => {
    const calls = [];
    const service = {
        async requestTicket() { return ticket; },
        async claim(value) { calls.push(["claim", value]); return { ...value, signallingUrl: createObserverSignallingUrl(value, locationRef, now) }; },
    };
    const mount = {};
    let disconnected = 0;
    const states = [];
    const controller = createObserverController({
        service,
        transportFactory: async (options) => {
            calls.push(["factory", options]);
            return {
                async mount(element, mountOptions) { calls.push(["mount", element, mountOptions]); },
                disconnect() { disconnected += 1; },
            };
        },
        now: () => now,
        onState: (state) => states.push(state),
    });
    await controller.start(mount);
    assert.equal(controller.getState(), "watching");
    assert.deepEqual(calls[1][1].input, OBSERVER_INPUT_POLICY);
    assert.deepEqual(calls[2][2].input, OBSERVER_INPUT_POLICY);
    controller.stop();
    assert.equal(disconnected, 1);
    assert.deepEqual(states, ["requesting", "claiming", "connecting", "watching", "idle"]);
});

test("promotion closes observer transport and invokes the controller handoff without ending its lease", async () => {
    let disconnected = 0;
    let promoted = 0;
    const controller = createObserverController({
        service: { async requestTicket() { return ticket; }, async claim(value) { return { ...value, signallingUrl: createObserverSignallingUrl(value, locationRef, now) }; } },
        transportFactory: async () => ({ async mount() {}, disconnect() { disconnected += 1; } }),
        onPromote: () => { promoted += 1; },
    });
    await controller.start({});
    assert.equal(controller.promote(), true);
    assert.equal(controller.getState(), "idle");
    assert.equal(disconnected, 1);
    assert.equal(promoted, 1);
});

test("stopping while the adapter is loading disconnects it before any mount", async () => {
    let factoryStarted;
    const factoryReady = new Promise((resolve) => { factoryStarted = resolve; });
    let resolveFactory;
    const factoryResult = new Promise((resolve) => { resolveFactory = resolve; });
    let mountCalls = 0;
    let disconnectCalls = 0;
    const controller = createObserverController({
        service: { async requestTicket() { return ticket; }, async claim(value) { return { ...value, signallingUrl: createObserverSignallingUrl(value, locationRef, now) }; } },
        transportFactory: async () => {
            factoryStarted();
            return factoryResult;
        },
    });
    const start = controller.start({});
    await factoryReady;
    controller.stop();
    resolveFactory({
        async mount() { mountCalls += 1; },
        disconnect() { disconnectCalls += 1; },
    });
    await start;
    assert.equal(mountCalls, 0);
    assert.equal(disconnectCalls, 1);
    assert.equal(controller.getState(), "idle");
});

test("an old adapter cannot replace a new connection after stop and restart", async () => {
    let releaseOld;
    const oldAdapter = new Promise((resolve) => { releaseOld = resolve; });
    let factoryCalls = 0;
    let oldDisconnects = 0;
    let newDisconnects = 0;
    const controller = createObserverController({
        service: { async requestTicket() { return ticket; }, async claim(value) { return { ...value, signallingUrl: createObserverSignallingUrl(value, locationRef, now) }; } },
        transportFactory: async () => {
            factoryCalls += 1;
            return factoryCalls === 1 ? oldAdapter : {
                async mount() {},
                disconnect() { newDisconnects += 1; },
            };
        },
    });
    const firstStart = controller.start({});
    while (factoryCalls === 0) await Promise.resolve();
    controller.stop();
    await controller.start({});
    releaseOld({
        async mount() { throw new Error("Old adapter must not mount."); },
        disconnect() { oldDisconnects += 1; },
    });
    await firstStart;
    assert.equal(controller.getState(), "watching");
    assert.equal(oldDisconnects, 1);
    assert.equal(newDisconnects, 0);
    controller.stop();
    assert.equal(newDisconnects, 1);
});

test("observer errors are reported and a failed claim cannot create a transport", async () => {
    let factories = 0;
    const states = [];
    const controller = createObserverController({
        service: {
            async requestTicket() { throw new Error("capacity"); },
            async claim() { throw new Error("must not claim"); },
        },
        transportFactory: async () => { factories += 1; return null; },
        onState: (state) => states.push(state),
    });
    await assert.rejects(controller.start({}), /capacity/);
    assert.equal(controller.getState(), "error");
    assert.equal(factories, 0);
    assert.equal(isObserverCapabilityEnabled({}), false);
    assert.equal(isObserverCapabilityEnabled({ LandSnapShowcaseCapabilities: { observer: true } }), true);
});

test("observer PS2 settings disable every browser input and keep the ticket WSS same-origin", () => {
    const locationRef = { origin: "https://showcase.ns-tx.com", hostname: "showcase.ns-tx.com" };
    const flags = Object.fromEntries([
        "AutoConnect", "AutoPlayVideo", "MouseInput", "KeyboardInput", "TouchInput",
        "GamepadInput", "XRControllerInput", "FakeMouseWithTouches", "UseMic", "UseCamera",
        "UseModalForTextInput", "AutoEnterVR", "SuppressBrowserKeys", "IsQualityController",
        "AFKDetection", "MatchViewportResolution",
    ].map((key) => [key, key]));
    const settings = createObserverShowcaseSettings({
        Flags: flags,
        NumericParameters: { MaxReconnectAttempts: "MaxReconnectAttempts" },
        OptionParameters: { PreferredCodec: "PreferredCodec" },
        TextParameters: { SignallingServerUrl: "SignallingServerUrl" },
        signallingUrl: "wss://showcase.ns-tx.com/api/landsnap-showcase/session/v1/observer/observer-ticket-0001",
    });
    assert.deepEqual(OBSERVER_INPUT_SETTINGS, { gamepad: false, keyboard: false, mouse: false, touch: false, xr: false });
    assert.equal(settings.MouseInput, false);
    assert.equal(settings.KeyboardInput, false);
    assert.equal(settings.TouchInput, false);
    assert.equal(settings.GamepadInput, false);
    assert.equal(settings.XRControllerInput, false);
    assert.equal(settings.IsQualityController, false);
    assert.equal(settings.PreferredCodec, "VP8");
    assert.equal(isObserverSignallingUrl(settings.SignallingServerUrl, locationRef), true);
    assert.equal(isObserverSignallingUrl("wss://other.example/observer", locationRef), false);
});

test("observer transport waits for video and disconnects only its PS2 peer", async () => {
    const streams = [];
    class FakeConfig {
        constructor({ initialSettings }) { this.initialSettings = initialSettings; }
    }
    class FakePixelStreaming {
        constructor(config, overrides) {
            this.config = config;
            this.overrides = overrides;
            this.listeners = new Map();
            this.connected = 0;
            this.disconnected = 0;
            streams.push(this);
        }
        addEventListener(name, listener) { this.listeners.set(name, listener); }
        addResponseEventListener(name, listener) { this.responseListener = listener; }
        connect() { this.connected += 1; }
        disconnect() { this.disconnected += 1; }
        fire(name) { this.listeners.get(name)?.(); }
    }
    const transport = createObserverShowcaseTransportWithDependencies({
        Config: FakeConfig,
        Flags: Object.fromEntries([
            "AutoConnect", "AutoPlayVideo", "MouseInput", "KeyboardInput", "TouchInput",
            "GamepadInput", "XRControllerInput", "FakeMouseWithTouches", "UseMic", "UseCamera",
            "UseModalForTextInput", "AutoEnterVR", "SuppressBrowserKeys", "IsQualityController",
            "AFKDetection", "MatchViewportResolution",
        ].map((key) => [key, key])),
        NumericParameters: { MaxReconnectAttempts: "MaxReconnectAttempts" },
        OptionParameters: { PreferredCodec: "PreferredCodec" },
        TextParameters: { SignallingServerUrl: "SignallingServerUrl" },
        PixelStreaming: FakePixelStreaming,
        locationRef: { origin: "https://showcase.ns-tx.com", hostname: "showcase.ns-tx.com" },
        timers: { setTimeout, clearTimeout },
    });
    const mount = { replaceChildren() {} };
    const options = {
        input: OBSERVER_INPUT_SETTINGS,
        session: { signallingUrl: "wss://showcase.ns-tx.com/api/landsnap-showcase/session/v1/observer/observer-ticket-0001" },
    };
    const mounted = transport.mount(mount, options);
    await Promise.resolve();
    assert.equal(transport.emitUIInteraction({}), false);
    assert.equal(streams[0].connected, 1);
    streams[0].fire("videoInitialized");
    await mounted;
    transport.disconnect();
    assert.equal(streams[0].disconnected, 1);
});


test("watch surface is available only to waiters and stops its peer on admission", async () => {
    const events = new Map();
    const node = () => ({ hidden: true, disabled: true, dataset: {}, textContent: "", setAttribute() {}, addEventListener(type, fn) { this[type] = fn; } });
    const section = node(), action = node(), mount = node(), player = node(), status = node();
    const nodes = new Map([
        ["landsnap-showcase-observer", section], ["landsnap-showcase-observer-action", action],
        ["landsnap-showcase-observer-mount", mount], ["landsnap-showcase-observer-player", player],
        ["landsnap-showcase-observer-status", status],
    ]);
    const windowRef = {
        LandSnapShowcaseCapabilities: { observer: true }, LandSnapShowcaseQueueLease: { status: "starting" },
        addEventListener(type, fn) { events.set(type, fn); }, removeEventListener() {},
    };
    let requests = 0, disconnects = 0;
    const surface = installObserverSurface({ getElementById: id => nodes.get(id) }, windowRef, {
        service: { async requestTicket() { requests++; return {}; }, async claim() { return {}; } },
        transportFactory: async () => ({ async mount() {}, disconnect() { disconnects++; } }),
    });
    assert.equal(section.hidden, true, "preparing does not promise an active demo to watch");
    windowRef.LandSnapShowcaseQueueLease = { status: "waiting" };
    events.get("landsnap-showcase-lease-change")();
    assert.equal(section.hidden, false);
    assert.equal(action.disabled, false);
    assert.equal(requests, 0, "watching requires the visitor's explicit choice");
    await surface.controller.start(player);
    assert.equal(surface.controller.getState(), "watching");
    assert.equal(requests, 1);
    windowRef.LandSnapShowcaseQueueLease = { status: "ready" };
    events.get("landsnap-showcase-lease-change")();
    assert.equal(section.hidden, true);
    assert.equal(action.disabled, true, "admission keeps watching unavailable after cleanup");
    action.click();
    assert.equal(requests, 1, "an admitted visitor cannot request another observer ticket");
    assert.equal(disconnects, 1);
    assert.equal(surface.controller.getState(), "idle");
    surface.destroy();
});

const tutorial = (overrides = {}) => ({
    type: "tutorial-state", version: "landsnap-guide-v1", revision: 1,
    step: "floor", method: "floor", phase: "ready", outcome: "executed", autoSnap: false, prop: "basketball",
    ...overrides,
});

test("observer receives sanitized tutorial snapshots and ignores stale, malformed and disconnected messages", async () => {
    const streams = [];
    const received = [];
    class FakeConfig { constructor() {} }
    class FakePixelStreaming {
        constructor() { this.listeners = new Map(); streams.push(this); }
        addEventListener(name, fn) { this.listeners.set(name, fn); }
        addResponseEventListener(name, fn) { this.response = fn; }
        connect() {}
        disconnect() {}
    }
    const transport = createObserverShowcaseTransportWithDependencies({
        Config: FakeConfig, PixelStreaming: FakePixelStreaming,
        Flags: {}, NumericParameters: {}, OptionParameters: {}, TextParameters: {},
        locationRef, timers: { setTimeout, clearTimeout },
    });
    const unsubscribe = transport.onTutorialState((state) => received.push(state));
    const options = { input: OBSERVER_INPUT_SETTINGS,
        session: { signallingUrl: "wss://showcase.ns-tx.com/api/landsnap-showcase/session/v1/observer/observer-ticket-0001" } };
    const mounted = transport.mount({ replaceChildren() {} }, options);
    streams[0].response(JSON.stringify(tutorial()));
    streams[0].response(JSON.stringify(tutorial({ revision: 0, step: "align" })));
    streams[0].response(JSON.stringify(tutorial({ revision: 2, arbitraryCommand: "delete" })));
    streams[0].response(JSON.stringify(tutorial({ revision: 2, step: "imaginary-mode" })));
    streams[0].response(JSON.stringify(tutorial({ revision: 2, autoSnap: "true" })));
    streams[0].response(JSON.stringify(tutorial({ revision: 2, step: "align", method: "align", phase: "running", outcome: "none" })));
    streams[0].listeners.get("videoInitialized")();
    await mounted;
    assert.deepEqual(received.map(({ revision }) => revision), [1, 2]);
    assert.equal(transport.emitUIInteraction({ action: "guide_next" }), false);
    const late = [];
    const unsubscribeLate = transport.onTutorialState((state) => late.push(state));
    assert.equal(late[0].revision, 2);
    unsubscribe(); unsubscribeLate();
    transport.disconnect();
    streams[0].response(JSON.stringify(tutorial({ revision: 3 })));
    assert.equal(received.length, 2);
});

test("observer tutorial context resets on stop and rejects old peers after reconnect", async () => {
    const callbacks = [];
    const received = [];
    let unsubscribed = 0;
    const controller = createObserverController({
        service: { async requestTicket() { return ticket; }, async claim(value) { return { ...value, signallingUrl: createObserverSignallingUrl(value, locationRef, now) }; } },
        transportFactory: async () => ({
            async mount() {}, disconnect() {},
            onTutorialState(fn) { callbacks.push(fn); return () => { unsubscribed += 1; }; },
        }),
        onTutorialState: (state) => received.push(state),
    });
    await controller.start({});
    callbacks[0](tutorial({ revision: 10 }));
    callbacks[0](tutorial({ revision: 9 }));
    callbacks[0]({ ...tutorial({ revision: 11 }), text: "<script>" });
    controller.stop();
    callbacks[0](tutorial({ revision: 11 }));
    await controller.start({});
    callbacks[1](tutorial({ revision: 0, step: "intro", method: "none", outcome: "none" }));
    callbacks[0](tutorial({ revision: 12 }));
    assert.deepEqual(received.map((state) => state?.revision ?? null), [10, null, 0]);
    controller.stop();
    assert.equal(unsubscribed, 2);
});
