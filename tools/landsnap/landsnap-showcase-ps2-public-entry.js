/*
 * Dedicated-host entrypoint for the LandSnap Pixel Streaming 2 player.
 * The broker's short-lived ticket is exchanged for a path-scoped HttpOnly
 * cookie before the fixed, same-origin WebSocket is opened.
 */
import {
    Config,
    Flags,
    NumericParameters,
    PixelStreaming,
    TextParameters,
} from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.8";

export const PUBLIC_SHOWCASE_HOST = "showcase.ns-tx.com";
export const SHOWCASE_RESPONSE_LISTENER = "landsnap-showcase-response";
export const SHOWCASE_PLAYER_PATH = /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/;

const INPUT_KEYS = Object.freeze(["gamepad", "keyboard", "mouse", "touch", "xr"]);
const BRIDGE_KEYS = Object.freeze(["action", "requestId", "type", "version"]);
const SESSION_KEYS = Object.freeze(["expiresAt", "token", "url"]);
const COMMAND_ACTIONS = new Set([
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
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{24,512}$/;
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

export const isPublicShowcaseHost = (hostname) =>
    typeof hostname === "string" && hostname.toLowerCase() === PUBLIC_SHOWCASE_HOST;

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

export const isPublicBrokerSession = (session, locationRef = globalThis.location, now = Date.now()) => {
    if (!isPlainRecord(session)
        || !hasExactKeys(session, SESSION_KEYS)
        || typeof session.url !== "string"
        || !SHOWCASE_PLAYER_PATH.test(session.url)
        || typeof session.token !== "string"
        || !SESSION_TOKEN_PATTERN.test(session.token)
        || !Number.isSafeInteger(session.expiresAt)
        || session.expiresAt <= now
        || !isPublicShowcaseHost(locationRef?.hostname)
        || locationRef?.protocol !== "https:"
        || typeof locationRef?.origin !== "string") return false;

    try {
        const endpoint = new URL(session.url, locationRef.origin);
        return endpoint.origin === locationRef.origin
            && endpoint.pathname === session.url
            && endpoint.search === ""
            && endpoint.hash === "";
    } catch {
        return false;
    }
};

/**
 * Creates the only production player paths. The ticket is deliberately
 * excluded from both URLs: it is exchanged for an HttpOnly cookie first.
 */
export const createPublicSessionEndpoints = (session, locationRef = globalThis.location, now = Date.now()) => {
    if (!isPublicBrokerSession(session, locationRef, now)) {
        throw new TypeError("The dedicated Showcase broker session is unavailable.");
    }
    const ticketUrl = new URL(session.url, locationRef.origin);
    const signallingUrl = new URL(ticketUrl);
    signallingUrl.protocol = "wss:";
    return Object.freeze({ ticketUrl: ticketUrl.toString(), signallingUrl: signallingUrl.toString() });
};

export const createPublicShowcaseSettings = ({
    Flags: localFlags,
    NumericParameters: localNumbers,
    TextParameters: localText,
    signallingUrl,
}) => Object.freeze({
    [localText.SignallingServerUrl]: signallingUrl,
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
    [localFlags.SuppressBrowserKeys]: true,
    [localNumbers.MaxReconnectAttempts]: 0,
});

const assertMountOptions = (options, locationRef, now) => {
    if (!isPlainRecord(options) || !hasExactKeys(options, ["input", "session"])) {
        throw new TypeError("Showcase mount options must be fixed by the broker session.");
    }
    if (!isMouseOnlyInput(options.input) || !isPublicBrokerSession(options.session, locationRef, now)) {
        throw new TypeError("The public Showcase accepts only its validated mouse-only broker session.");
    }
};

/**
 * Exchanges an in-memory broker ticket for the host's path-scoped HttpOnly
 * WebSocket cookie. The host consumes the ticket here; URLs never contain it.
 */
export const primePublicShowcaseSession = async (fetchImpl, session, locationRef, now = Date.now) => {
    if (typeof fetchImpl !== "function") throw new TypeError("The dedicated Showcase broker is unavailable.");
    const { ticketUrl } = createPublicSessionEndpoints(session, locationRef, now());
    const response = await fetchImpl(ticketUrl, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        headers: Object.freeze({ Authorization: `Bearer ${session.token}`, Accept: "application/json" }),
    });
    if (!response || response.status !== 204) {
        throw new TypeError("The dedicated Showcase broker rejected the player ticket.");
    }
    if (!isPublicBrokerSession(session, locationRef, now())) {
        throw new TypeError("The dedicated Showcase player ticket expired before connect.");
    }
};

export const createPublicShowcaseTransportWithDependencies = (
    dependencies,
    locationRef = globalThis.location,
    fetchImpl = globalThis.fetch,
    now = Date.now,
) => {
    const {
        Config: LocalConfig,
        Flags: LocalFlags,
        NumericParameters: LocalNumbers,
        PixelStreaming: LocalPixelStreaming,
        TextParameters: LocalText,
    } = dependencies;

    if (!isPublicShowcaseHost(locationRef?.hostname) || locationRef?.protocol !== "https:") return null;
    if (typeof LocalConfig !== "function" || typeof LocalPixelStreaming !== "function") {
        throw new TypeError("The Pixel Streaming 2 frontend is unavailable.");
    }

    const listeners = new Set();
    const responseListeners = new Set();
    const sessionReadyListeners = new Set();
    let connectionState = "disconnected";
    let stream = null;
    let mounted = false;
    let sessionReady = false;

    const reportState = (nextState) => {
        connectionState = nextState;
        listeners.forEach((listener) => listener(nextState));
    };
    const reportSessionReady = () => {
        if (sessionReady) return;
        sessionReady = true;
        sessionReadyListeners.forEach((listener) => listener());
    };

    return Object.freeze({
        async mount(mountElement, options) {
            if (mounted || !mountElement || typeof mountElement.replaceChildren !== "function") {
                throw new TypeError("The public Showcase stream mount is unavailable.");
            }
            assertMountOptions(options, locationRef, now());
            mounted = true;
            reportState("connecting");
            try {
                await primePublicShowcaseSession(fetchImpl, options.session, locationRef, now);
                const { signallingUrl } = createPublicSessionEndpoints(options.session, locationRef, now());
                mountElement.replaceChildren();
                const config = new LocalConfig({
                    useUrlParams: false,
                    initialSettings: createPublicShowcaseSettings({
                        Flags: LocalFlags,
                        NumericParameters: LocalNumbers,
                        TextParameters: LocalText,
                        signallingUrl,
                    }),
                });
                stream = new LocalPixelStreaming(config, { videoElementParent: mountElement });
                stream.addEventListener("webRtcConnecting", () => reportState("connecting"));
                stream.addEventListener("webRtcConnected", () => reportState("connected"));
                stream.addEventListener("webRtcDisconnected", () => reportState("disconnected"));
                stream.addEventListener("webRtcFailed", () => reportState("error"));
                stream.addEventListener("dataChannelOpen", reportSessionReady);
                stream.addResponseEventListener(SHOWCASE_RESPONSE_LISTENER, (response) => {
                    responseListeners.forEach((listener) => listener(response));
                });
                stream.connect();
            } catch (error) {
                reportState("error");
                throw error;
            }
        },
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
        onSessionReady(listener) {
            if (typeof listener !== "function") return;
            sessionReadyListeners.add(listener);
            if (sessionReady) listener();
        },
    });
};

export const createPublicShowcaseTransport = () => createPublicShowcaseTransportWithDependencies({
    Config,
    Flags,
    NumericParameters,
    PixelStreaming,
    TextParameters,
});
