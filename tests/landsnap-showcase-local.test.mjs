import assert from "node:assert/strict";
import test from "node:test";
import {
    LOCAL_SIGNALING_ENDPOINT,
    LOCAL_STREAMER_ID,
    SHOWCASE_RESPONSE_LISTENER,
    createLocalShowcaseTransportWithDependencies,
    isAllowlistedShowcasePayload,
    isLocalShowcaseHost,
    isMouseOnlyInput,
} from "../tools/landsnap/landsnap-showcase-ps2-local-entry.js";
import {
    installLocalShowcaseBootstrap,
    isLocalShowcaseHost as isLocalBootstrapHost,
} from "../scripts/landsnap-showcase-local.js";

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
const FakeOptions = Object.freeze({ StreamerId: "StreamerId" });
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

    emitUIInteraction(payload) {
        this.sent.push(payload);
        return true;
    }
}

const dependencies = Object.freeze({
    Config: FakeConfig,
    Flags: FakeFlags,
    NumericParameters: FakeNumbers,
    OptionParameters: FakeOptions,
    PixelStreaming: FakePixelStreaming,
    TextParameters: FakeText,
});
const mouseOnlyInput = Object.freeze({ mouse: true, keyboard: false, touch: false, gamepad: false, xr: false });

test("local transport is loopback-only and hard-codes the UE 5.8 Editor configuration", () => {
    assert.equal(isLocalShowcaseHost("127.0.0.1"), true);
    assert.equal(isLocalShowcaseHost("localhost"), true);
    assert.equal(isLocalShowcaseHost("ns-tx.com"), false);
    assert.equal(isLocalBootstrapHost("ns-tx.com"), false);

    const transport = createLocalShowcaseTransportWithDependencies(dependencies, "127.0.0.1");
    const states = [];
    transport.onConnectionState((state) => states.push(state));
    const mount = { replaceChildren: () => { mount.cleared = true; } };
    transport.mount(mount, { streamerId: "Editor", input: mouseOnlyInput });

    const stream = FakePixelStreaming.latest;
    assert.equal(mount.cleared, true);
    assert.equal(stream.connected, true);
    assert.equal(stream.overrides.videoElementParent, mount);
    assert.equal(stream.config.options.useUrlParams, false);
    assert.deepEqual(stream.config.options.initialSettings, {
        ss: LOCAL_SIGNALING_ENDPOINT,
        StreamerId: LOCAL_STREAMER_ID,
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
        SuppressBrowserKeys: false,
        MaxReconnectAttempts: 0,
    });
    assert.deepEqual(states, ["disconnected", "connecting"]);
    assert.throws(
        () => transport.mount(mount, { streamerId: "Other", input: mouseOnlyInput }),
        /unavailable/,
    );
});

test("local transport forwards only allowlisted UI interactions and raw UE Response strings", () => {
    const transport = createLocalShowcaseTransportWithDependencies(dependencies, "localhost");
    const mount = { replaceChildren() {} };
    const responses = [];
    transport.onResponse((response) => responses.push(response));
    transport.mount(mount, { streamerId: "Editor", input: mouseOnlyInput });

    const valid = Object.freeze({
        version: "landsnap-showcase-v1",
        type: "command",
        action: "snap_selected",
        requestId: "request_123",
    });
    assert.equal(isMouseOnlyInput(mouseOnlyInput), true);
    assert.equal(isMouseOnlyInput({ ...mouseOnlyInput, keyboard: true }), false);
    assert.equal(isAllowlistedShowcasePayload(valid), true);
    assert.equal(transport.emitUIInteraction(valid), true);
    assert.equal(transport.emitUIInteraction({ ...valid, action: "console_command" }), false);
    assert.deepEqual(FakePixelStreaming.latest.sent, [valid]);

    FakePixelStreaming.latest.responses.get(SHOWCASE_RESPONSE_LISTENER)("{\"response\":\"raw\"}");
    assert.deepEqual(responses, ["{\"response\":\"raw\"}"]);
});

test("bootstrap never loads or attaches a transport for the public site", async () => {
    let loaderCalls = 0;
    const publicWindow = {
        location: { hostname: "ns-tx.com" },
        CustomEvent: class {},
        dispatchEvent() {},
    };
    const result = await installLocalShowcaseBootstrap(publicWindow, async () => {
        loaderCalls += 1;
        return {};
    });
    assert.equal(result, null);
    assert.equal(loaderCalls, 0);
});
