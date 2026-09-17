/*
 * This source is bundled into scripts/vendor/landsnap-showcase-ps2-local.js.
 * It intentionally imports only Epic's core frontend; the stock player UI is
 * never added to the showcase page.
 */
import {
    Config,
    Flags,
    NumericParameters,
    OptionParameters,
    PixelStreaming,
    TextParameters,
} from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.8";

export const LOCAL_SIGNALING_ENDPOINT = "ws://127.0.0.1";
export const LOCAL_STREAMER_ID = "Editor";
export const SHOWCASE_RESPONSE_LISTENER = "landsnap-showcase-response";

const LOCAL_HOSTS = Object.freeze(["127.0.0.1", "localhost", "[::1]"]);
const INPUT_KEYS = Object.freeze(["gamepad", "keyboard", "mouse", "touch", "xr"]);
const BRIDGE_KEYS = Object.freeze(["action", "requestId", "type", "version"]);
const COMMAND_ACTIONS = new Set([
    "snap_selected",
    "undo",
    "redo",
    "reset_scene",
    "previous_scenario",
    "next_scenario",
    "toggle_autosnap",
    "prepare_calibration",
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const PROTOCOL_VERSION = "landsnap-showcase-v1";

const own = (record, key) => Object.prototype.hasOwnProperty.call(record, key);

const isPlainRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (record, expected) => {
    const keys = Object.keys(record).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

export const isLocalShowcaseHost = (hostname) =>
    typeof hostname === "string" && LOCAL_HOSTS.includes(hostname.toLowerCase());

export const isMouseOnlyInput = (input) => isPlainRecord(input)
    && hasExactKeys(input, INPUT_KEYS)
    && input.mouse === true
    && input.keyboard === false
    && input.touch === false
    && input.gamepad === false
    && input.xr === false;

export const isAllowlistedShowcasePayload = (payload) => isPlainRecord(payload)
    && hasExactKeys(payload, BRIDGE_KEYS)
    && payload.version === PROTOCOL_VERSION
    && payload.type === "command"
    && typeof payload.action === "string"
    && COMMAND_ACTIONS.has(payload.action)
    && typeof payload.requestId === "string"
    && REQUEST_ID_PATTERN.test(payload.requestId);

export const createLocalShowcaseSettings = ({
    Flags: localFlags,
    NumericParameters: localNumbers,
    OptionParameters: localOptions,
    TextParameters: localText,
}) => Object.freeze({
    [localText.SignallingServerUrl]: LOCAL_SIGNALING_ENDPOINT,
    [localOptions.StreamerId]: LOCAL_STREAMER_ID,
    [localFlags.AutoConnect]: false,
    [localFlags.AutoPlayVideo]: true,
    [localFlags.MouseInput]: true,
    [localFlags.KeyboardInput]: false,
    [localFlags.TouchInput]: false,
    [localFlags.GamepadInput]: false,
    [localFlags.XRControllerInput]: false,
    [localFlags.FakeMouseWithTouches]: false,
    [localFlags.UseMic]: false,
    [localFlags.UseCamera]: false,
    [localFlags.UseModalForTextInput]: false,
    [localFlags.AutoEnterVR]: false,
    [localFlags.SuppressBrowserKeys]: false,
    [localNumbers.MaxReconnectAttempts]: 0,
});

const assertMountOptions = (options) => {
    if (!isPlainRecord(options) || !hasExactKeys(options, ["input", "streamerId"])) {
        throw new TypeError("Showcase mount options must be fixed by the page surface.");
    }
    if (options.streamerId !== LOCAL_STREAMER_ID || !isMouseOnlyInput(options.input)) {
        throw new TypeError("Local Showcase only accepts the Editor mouse-only configuration.");
    }
};

export const createLocalShowcaseTransportWithDependencies = (
    dependencies,
    hostname = globalThis.location?.hostname,
) => {
    const {
        Config: LocalConfig,
        Flags: LocalFlags,
        NumericParameters: LocalNumbers,
        OptionParameters: LocalOptions,
        PixelStreaming: LocalPixelStreaming,
        TextParameters: LocalText,
    } = dependencies;

    if (!isLocalShowcaseHost(hostname)) return null;
    if (typeof LocalConfig !== "function" || typeof LocalPixelStreaming !== "function") {
        throw new TypeError("The Pixel Streaming 2 frontend is unavailable.");
    }

    const listeners = new Set();
    const responseListeners = new Set();
    let connectionState = "disconnected";
    let stream = null;
    let mounted = false;

    const reportState = (nextState) => {
        connectionState = nextState;
        listeners.forEach((listener) => listener(nextState));
    };

    const mount = (mountElement, options) => {
        if (mounted || !mountElement || typeof mountElement.replaceChildren !== "function") {
            throw new TypeError("The local Showcase stream mount is unavailable.");
        }
        assertMountOptions(options);
        mounted = true;
        mountElement.replaceChildren();

        const config = new LocalConfig({
            useUrlParams: false,
            initialSettings: createLocalShowcaseSettings({
                Flags: LocalFlags,
                NumericParameters: LocalNumbers,
                OptionParameters: LocalOptions,
                TextParameters: LocalText,
            }),
        });
        stream = new LocalPixelStreaming(config, { videoElementParent: mountElement });
        stream.addEventListener("webRtcConnecting", () => reportState("connecting"));
        stream.addEventListener("webRtcConnected", () => reportState("connected"));
        stream.addEventListener("webRtcDisconnected", () => reportState("disconnected"));
        stream.addEventListener("webRtcFailed", () => reportState("error"));
        stream.addResponseEventListener(SHOWCASE_RESPONSE_LISTENER, (response) => {
            responseListeners.forEach((listener) => listener(response));
        });
        reportState("connecting");
        stream.connect();
    };

    return Object.freeze({
        mount,
        emitUIInteraction(payload) {
            if (!stream || !isAllowlistedShowcasePayload(payload)) return false;
            return stream.emitUIInteraction(payload) === true;
        },
        disconnect() {
            if (stream && typeof stream.disconnect === "function") stream.disconnect();
        },
        onConnectionState(listener) {
            if (typeof listener !== "function") return;
            listeners.add(listener);
            listener(connectionState);
        },
        onResponse(listener) {
            if (typeof listener === "function") responseListeners.add(listener);
        },
    });
};

export const createLocalShowcaseTransport = () => createLocalShowcaseTransportWithDependencies({
    Config,
    Flags,
    NumericParameters,
    OptionParameters,
    PixelStreaming,
    TextParameters,
});
