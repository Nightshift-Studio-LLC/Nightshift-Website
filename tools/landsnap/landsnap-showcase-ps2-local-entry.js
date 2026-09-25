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
export const SESSION_READY_ACTION = "session_ready";
export const SESSION_READY_MAX_ATTEMPTS = 3;
export const SESSION_READY_RETRY_DELAY_MS = 1_000;

const LOCAL_HOSTS = Object.freeze(["127.0.0.1", "localhost", "[::1]"]);
const INPUT_KEYS = Object.freeze(["gamepad", "keyboard", "mouse", "touch", "xr"]);
const BRIDGE_KEYS = Object.freeze(["action", "requestId", "type", "version"]);
const COMMAND_ACTIONS = new Set([
    SESSION_READY_ACTION,
    "snap_selected",
    "undo",
    "redo",
    "reset_scene",
    "previous_scenario",
    "next_scenario",
    "toggle_autosnap",
    "prepare_small_row",
    "prepare_medium_row",
    "prepare_large_row",
    "prepare_small_coverage",
    "prepare_medium_coverage",
    "prepare_large_coverage",
    "clean_scene",
    "select_previous_fixture",
    "select_next_fixture",
    "focus_selected_fixture",
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const PROTOCOL_VERSION = "landsnap-showcase-v1";
const RESPONSE_KEYS = Object.freeze(["action", "code", "requestId", "result", "type", "version"]);
let sessionReadyRequestSequence = 0;

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

const parseSessionReadyResponse = (raw) => {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 384) return false;
    let candidate;
    try {
        candidate = JSON.parse(raw);
    } catch {
        return false;
    }
    return isPlainRecord(candidate)
        && hasExactKeys(candidate, RESPONSE_KEYS)
        && candidate.version === PROTOCOL_VERSION
        && candidate.type === "operation-result"
        && candidate.action === SESSION_READY_ACTION
        && typeof candidate.requestId === "string"
        && REQUEST_ID_PATTERN.test(candidate.requestId)
        && ((candidate.result === "success" && candidate.code === SESSION_READY_ACTION)
            || (candidate.result === "rejected" && candidate.code === "session_initializing"))
        ? candidate
        : null;
};

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
    timers = globalThis,
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
    let sessionReady = false;
    let sessionReadyRequestId = null;
    let sessionReadyAttempt = 0;
    let sessionReadyRetryTimer = null;
    const sessionReadyListeners = new Set();

    const reportState = (nextState) => {
        connectionState = nextState;
        listeners.forEach((listener) => listener(nextState));
    };
    const clearSessionReadyRetry = () => {
        if (sessionReadyRetryTimer !== null && typeof timers.clearTimeout === "function") {
            timers.clearTimeout(sessionReadyRetryTimer);
        }
        sessionReadyRetryTimer = null;
    };
    const sendSessionReady = () => {
        if (!stream || sessionReady || sessionReadyAttempt >= SESSION_READY_MAX_ATTEMPTS) return;
        sessionReadyAttempt += 1;
        sessionReadyRequestId = `session_ready_${++sessionReadyRequestSequence}`;
        if (stream.emitUIInteraction({
            version: PROTOCOL_VERSION,
            type: "command",
            action: SESSION_READY_ACTION,
            requestId: sessionReadyRequestId,
        }) !== true) reportState("error");
    };
    const failSessionReady = () => {
        clearSessionReadyRetry();
        sessionReadyRequestId = null;
        reportState("error");
    };
    const scheduleSessionReadyRetry = () => {
        clearSessionReadyRetry();
        if (sessionReadyAttempt >= SESSION_READY_MAX_ATTEMPTS || typeof timers.setTimeout !== "function") {
            failSessionReady();
            return;
        }
        sessionReadyRetryTimer = timers.setTimeout(() => {
            sessionReadyRetryTimer = null;
            sendSessionReady();
        }, SESSION_READY_RETRY_DELAY_MS);
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
        stream.addEventListener("webRtcFailed", () => reportState("error"));
        // dataChannelOpen can precede reset_ready/encoder setup, so local
        // acceptance follows the production acknowledgement and retry contract.
        stream.addEventListener("dataChannelOpen", () => {
            if (sessionReady || sessionReadyRequestId || sessionReadyRetryTimer !== null) return;
            sendSessionReady();
        });
        stream.addEventListener("webRtcDisconnected", () => {
            // A missing acknowledgement is bounded by the supervised local
            // session lifecycle; never retry without a correlated response.
            clearSessionReadyRetry();
            sessionReadyRequestId = null;
            sessionReadyAttempt = 0;
            sessionReady = false;
            reportState("disconnected");
        });
        stream.addResponseEventListener(SHOWCASE_RESPONSE_LISTENER, (response) => {
            const candidate = parseSessionReadyResponse(response);
            if (candidate && candidate.requestId === sessionReadyRequestId) {
                if (candidate.result === "success") {
                    clearSessionReadyRetry();
                    sessionReadyRequestId = null;
                    sessionReady = true;
                    sessionReadyListeners.forEach((listener) => listener());
                } else scheduleSessionReadyRetry();
            }
            responseListeners.forEach((listener) => listener(response));
        });
        reportState("connecting");
        stream.connect();
    };

    return Object.freeze({
        mount,
        emitUIInteraction(payload) {
            if (!stream || !isAllowlistedShowcasePayload(payload) || payload.action === SESSION_READY_ACTION) return false;
            return stream.emitUIInteraction(payload) === true;
        },
        disconnect() {
            clearSessionReadyRetry();
            sessionReadyRequestId = null;
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
        onSessionReady(listener) {
            if (typeof listener !== "function") return;
            sessionReadyListeners.add(listener);
            if (sessionReady) listener();
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
