import assert from "node:assert/strict";
import test from "node:test";
import {
    PUBLIC_SHOWCASE_HOST,
    SHOWCASE_RESPONSE_LISTENER,
    createPublicSessionEndpoints,
    createPublicShowcaseTransportWithDependencies,
    isAllowlistedShowcasePayload,
    isMouseOnlyInput,
    isPublicBrokerSession,
} from "../tools/landsnap/landsnap-showcase-ps2-public-entry.js";
import {
    hasActivePublicShowcaseLease,
    hasReadyPublicShowcaseLease,
    installPublicShowcaseBootstrap,
} from "../scripts/landsnap-showcase-public.js";

const now = 1_700_000_000_000;
const publicLocation = Object.freeze({
    hostname: PUBLIC_SHOWCASE_HOST,
    origin: `https://${PUBLIC_SHOWCASE_HOST}`,
    protocol: "https:",
});
const brokerSession = Object.freeze({
    url: "/api/landsnap-showcase/session/v1/player/showcase-player-ticket-001",
    token: "signed-session-ticket-for-showcase-0001",
    expiresAt: now + 90_000,
});
const readyLease = Object.freeze({
    status: "ready",
    leaseId: "ready-showcase-lease-1234",
    readyClaimExpiresAt: now + 90_000,
    session: brokerSession,
});
const mouseOnlyInput = Object.freeze({ mouse: true, keyboard: false, touch: false, gamepad: false, xr: false });

const FakeFlags = Object.freeze({
    AutoConnect: "AutoConnect",
    AutoPlayVideo: "AutoPlayVideo",
    MouseInput: "MouseInput",
    KeyboardInput: "KeyboardInput",
    TouchInput: "TouchInput",
    GamepadInput: "GamepadInput",
    XRControllerInput: "XRControllerInput",
    FakeMouseWithTouches: "FakeMouseWithTouches",
    UseMic: "UseMic",
    UseCamera: "UseCamera",
    UseModalForTextInput: "UseModalForTextInput",
    AutoEnterVR: "AutoEnterVR",
    SuppressBrowserKeys: "SuppressBrowserKeys",
});
const FakeText = Object.freeze({ SignallingServerUrl: "ss" });
const FakeNumbers = Object.freeze({ MaxReconnectAttempts: "MaxReconnectAttempts" });

class FakeConfig {
    constructor(options) {
        this.options = options;
    }
}

class FakePixelStreaming {
    constructor(config, overrides) {
        this.config = config;
        this.overrides = overrides;
        this.events = new Map();
        this.responses = new Map();
        this.sent = [];
        FakePixelStreaming.latest = this;
    }

    addEventListener(name, listener) {
        this.events.set(name, listener);
    }

    addResponseEventListener(name, listener) {
        this.responses.set(name, listener);
    }

    connect() {
        this.connected = true;
    }

    disconnect() {
        this.disconnected = true;
    }

    emitUIInteraction(payload) {
        this.sent.push(payload);
        return true;
    }
}

const dependencies = Object.freeze({
    Config: FakeConfig,
    Flags: FakeFlags,
    NumericParameters: FakeNumbers,
    PixelStreaming: FakePixelStreaming,
    TextParameters: FakeText,
});

test("public player derives ticket and WSS paths only from the fixed same-origin broker session", () => {
    const endpoints = createPublicSessionEndpoints(brokerSession, publicLocation, now);
    assert.deepEqual(endpoints, {
        ticketUrl: `https://${PUBLIC_SHOWCASE_HOST}${brokerSession.url}`,
        signallingUrl: `wss://${PUBLIC_SHOWCASE_HOST}${brokerSession.url}`,
    });
    assert.equal(endpoints.ticketUrl.includes(brokerSession.token), false);
    assert.equal(endpoints.signallingUrl.includes(brokerSession.token), false);
    assert.equal(isPublicBrokerSession(brokerSession, publicLocation, now), true);
    assert.equal(isPublicBrokerSession({ ...brokerSession, url: "https://visitor.invalid/player" }, publicLocation, now), false);
    assert.equal(isPublicBrokerSession({ ...brokerSession, url: `${brokerSession.url}?ticket=visitor` }, publicLocation, now), false);
    assert.equal(isPublicBrokerSession({ ...brokerSession, token: "short" }, publicLocation, now), false);
    assert.equal(isPublicBrokerSession({ ...brokerSession, expiresAt: now }, publicLocation, now), false);
    assert.throws(
        () => createPublicSessionEndpoints(brokerSession, { ...publicLocation, hostname: "ns-tx.com", origin: "https://ns-tx.com" }, now),
        /unavailable/,
    );
});

test("public transport primes the exact player path, uses no streamer selection, and enables only mouse plus allowlisted UI", async () => {
    const calls = [];
    const states = [];
    let sessionReady = 0;
    const transport = createPublicShowcaseTransportWithDependencies(
        dependencies,
        publicLocation,
        async (url, options) => {
            calls.push({ url, options });
            return { status: 204 };
        },
        () => now,
    );
    const mount = { replaceChildren: () => { mount.cleared = true; } };
    transport.onConnectionState((state) => states.push(state));
    transport.onSessionReady(() => { sessionReady += 1; });

    await transport.mount(mount, { session: brokerSession, input: mouseOnlyInput });
    const stream = FakePixelStreaming.latest;
    assert.equal(mount.cleared, true);
    assert.equal(stream.connected, true);
    assert.equal(stream.overrides.videoElementParent, mount);
    assert.deepEqual(calls, [{
        url: `https://${PUBLIC_SHOWCASE_HOST}${brokerSession.url}`,
        options: {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            redirect: "error",
            headers: { Authorization: `Bearer ${brokerSession.token}`, Accept: "application/json" },
        },
    }]);
    assert.equal(stream.config.options.useUrlParams, false);
    assert.deepEqual(stream.config.options.initialSettings, {
        ss: `wss://${PUBLIC_SHOWCASE_HOST}${brokerSession.url}`,
        AutoConnect: false,
        AutoPlayVideo: true,
        MouseInput: true,
        KeyboardInput: false,
        TouchInput: false,
        GamepadInput: false,
        XRControllerInput: false,
        FakeMouseWithTouches: false,
        UseMic: false,
        UseCamera: false,
        UseModalForTextInput: false,
        AutoEnterVR: false,
        SuppressBrowserKeys: true,
        MaxReconnectAttempts: 0,
    });
    assert.equal(JSON.stringify(stream.config.options.initialSettings).includes(brokerSession.token), false);
    assert.deepEqual(states, ["disconnected", "connecting"]);
    stream.events.get("webRtcConnected")();
    stream.events.get("dataChannelOpen")();
    assert.equal(sessionReady, 1);

    const valid = Object.freeze({
        version: "landsnap-showcase-v1",
        type: "command",
        action: "snap_selected",
        requestId: "request_123",
    });
    assert.equal(isMouseOnlyInput(mouseOnlyInput), true);
    assert.equal(isMouseOnlyInput({ ...mouseOnlyInput, keyboard: true }), false);
    assert.equal(isAllowlistedShowcasePayload(valid), true);
    assert.equal(isAllowlistedShowcasePayload({ ...valid, action: "console_command" }), false);
    assert.equal(transport.emitUIInteraction(valid), true);
    assert.equal(transport.emitUIInteraction({ ...valid, action: "console_command" }), false);
    assert.deepEqual(stream.sent, [valid]);

    const responses = [];
    transport.onResponse((response) => responses.push(response));
    stream.responses.get(SHOWCASE_RESPONSE_LISTENER)("{\"response\":\"raw\"}");
    assert.deepEqual(responses, ["{\"response\":\"raw\"}"]);
});

test("public transport rejects hostile session records, ticket failures, and every non-dedicated host", async () => {
    assert.equal(createPublicShowcaseTransportWithDependencies(dependencies, { ...publicLocation, hostname: "ns-tx.com" }), null);

    const transport = createPublicShowcaseTransportWithDependencies(
        dependencies,
        publicLocation,
        async () => ({ status: 403 }),
        () => now,
    );
    await assert.rejects(
        transport.mount({ replaceChildren() {} }, {
            session: { ...brokerSession, url: "https://visitor.invalid/player" },
            input: mouseOnlyInput,
        }),
        /validated mouse-only broker session/,
    );
    await assert.rejects(
        transport.mount({ replaceChildren() {} }, { session: brokerSession, input: mouseOnlyInput }),
        /rejected the player ticket/,
    );
});

test("public bootstrap imports only for an exact-host, complete ready lease", async () => {
    const liveNow = Date.now();
    const liveLease = {
        ...readyLease,
        readyClaimExpiresAt: liveNow + 90_000,
        session: { ...brokerSession, expiresAt: liveNow + 90_000 },
    };
    const listeners = new Map();
    const dispatched = [];
    const windowRef = {
        location: publicLocation,
        LandSnapShowcaseQueueLease: liveLease,
        CustomEvent: class {
            constructor(type, init) {
                this.type = type;
                this.detail = init?.detail;
            }
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        dispatchEvent(event) {
            dispatched.push(event);
            listeners.get(event.type)?.(event);
        },
    };
    const transport = {
        mount() {},
        emitUIInteraction() {},
        onConnectionState() {},
        onResponse() {},
        onSessionReady() {},
        disconnect() { transport.disconnected = true; },
    };
    let loads = 0;
    const installed = await installPublicShowcaseBootstrap(windowRef, async () => {
        loads += 1;
        return transport;
    });
    assert.equal(installed, transport);
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, transport);
    assert.equal(loads, 1);
    assert.equal(dispatched.at(-1).type, "landsnap-showcase-transport-ready");
    assert.equal(hasReadyPublicShowcaseLease(liveLease, liveNow), true);
    assert.equal(hasReadyPublicShowcaseLease({ ...liveLease, leaseId: "short" }, liveNow), false);

    windowRef.LandSnapShowcaseQueueLease = {
        ...liveLease,
        session: { ...liveLease.session, token: "signed-session-ticket-for-showcase-0002" },
    };
    listeners.get("landsnap-showcase-lease-change")?.();
    await Promise.resolve();
    assert.equal(loads, 1, "a refreshed ticket must not load a second transport");
    assert.equal(transport.disconnected, undefined, "a refreshed ticket must not disconnect the same lease");
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, transport);

    const activeLease = {
        status: "active",
        leaseId: liveLease.leaseId,
        sessionExpiresAt: liveNow + 300_000,
    };
    assert.equal(hasActivePublicShowcaseLease(activeLease, liveNow), true);
    windowRef.LandSnapShowcaseQueueLease = activeLease;
    listeners.get("landsnap-showcase-lease-change")?.();
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, transport);
    assert.equal(transport.disconnected, undefined);

    let nonHostLoads = 0;
    const noHostResult = await installPublicShowcaseBootstrap({
        ...windowRef,
        location: { ...publicLocation, hostname: "ns-tx.com", origin: "https://ns-tx.com" },
    }, async () => { nonHostLoads += 1; return transport; });
    assert.equal(noHostResult, null);
    assert.equal(nonHostLoads, 0);
});
