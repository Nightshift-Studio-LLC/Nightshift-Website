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
