/*
 * Dedicated-host entrypoint for the LandSnap Pixel Streaming 2 player.
 * The broker's short-lived ticket is exchanged for a path-scoped HttpOnly
 * cookie before the fixed, same-origin WebSocket is opened.
 */
import {
    Config,
    Flags,
    NumericParameters,
    OptionParameters,
    PixelStreaming,
    TextParameters,
} from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.8";

export const PUBLIC_SHOWCASE_HOST = "showcase.ns-tx.com";
export const SHOWCASE_RESPONSE_LISTENER = "landsnap-showcase-response";
export const SHOWCASE_PLAYER_PATH = /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/;
export const SESSION_READY_ACTION = "session_ready";
export const SESSION_READY_MAX_ATTEMPTS = 3;
export const SESSION_READY_RETRY_DELAY_MS = 1_000;
export const SESSION_READY_RESPONSE_TIMEOUT_MS = 5_000;

const INPUT_KEYS = Object.freeze(["gamepad", "keyboard", "mouse", "touch", "xr"]);
const BRIDGE_KEYS = Object.freeze(["action", "requestId", "type", "version"]);
const SESSION_KEYS = Object.freeze(["expiresAt", "token", "url"]);
const COMMAND_ACTIONS = new Set([
    SESSION_READY_ACTION,
    "compare_unreal_snap",
    "compare_landsnap",
    "reset_comparison",
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
const LEASE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
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
            || (candidate.result === "rejected" && ["session_initializing", "operation_rejected", "operation_failed"].includes(candidate.code))
            || (candidate.result === "error" && candidate.code === "operation_failed"))
        ? candidate
        : null;
};

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
    OptionParameters: localOptions,
    TextParameters: localText,
    signallingUrl,
}) => Object.freeze({
    [localText.SignallingServerUrl]: signallingUrl,
    // This dedicated host has proven stable VP8 decode support; prefer it over the SDK's H264 default.
    [localOptions.PreferredCodec]: "VP8",
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
    let sessionReadyRequestId = null;
    let sessionReadyAttempt = 0;
    let sessionReadyRetryTimer = null;
    let dataChannelOpen = false;
    let readyClaimExpiresAt = 0;
    let readyLeaseId = null;
    let readySessionUrl = null;
    let disposed = false;
    let readinessFailed = false;

    const reportState = (nextState) => {
        connectionState = nextState;
        listeners.forEach((listener) => listener(nextState));
    };
    const reportSessionReady = () => {
        if (disposed || readinessFailed || sessionReady || !dataChannelOpen) return;
        if (readyClaimExpiresAt <= now()) {
            failSessionReady();
            return;
        }
        clearSessionReadyRetry();
        sessionReadyRequestId = null;
        sessionReady = true;
        sessionReadyListeners.forEach((listener) => listener());
    };
    const clearSessionReadyRetry = () => {
        if (sessionReadyRetryTimer !== null && typeof timers.clearTimeout === "function") {
            timers.clearTimeout(sessionReadyRetryTimer);
        }
        sessionReadyRetryTimer = null;
    };
    const sendSessionReady = () => {
        if (disposed || readinessFailed || !stream || !dataChannelOpen || sessionReady || sessionReadyAttempt >= SESSION_READY_MAX_ATTEMPTS) return;
        if (readyClaimExpiresAt <= now()) {
            failSessionReady();
            return;
        }
        sessionReadyAttempt += 1;
        sessionReadyRequestId = `session_ready_${++sessionReadyRequestSequence}`;
        const accepted = stream.emitUIInteraction({
            version: PROTOCOL_VERSION,
            type: "command",
            action: SESSION_READY_ACTION,
            requestId: sessionReadyRequestId,
        });
        if (accepted !== true) {
            failSessionReady();
            return;
        }
        // A lost response must not hold a connected visitor indefinitely.
        // Each retry has a new ID, so a late response cannot activate it.
        if (!sessionReady && typeof timers.setTimeout === "function") {
            clearSessionReadyRetry();
            sessionReadyRetryTimer = timers.setTimeout(() => {
                sessionReadyRetryTimer = null;
                scheduleSessionReadyRetry();
            }, Math.min(SESSION_READY_RESPONSE_TIMEOUT_MS, Math.max(0, readyClaimExpiresAt - now())));
        }
    };
    const failSessionReady = () => {
        if (disposed) return;
        readinessFailed = true;
        clearSessionReadyRetry();
        sessionReadyRequestId = null;
        dataChannelOpen = false;
        reportState("error");
    };
    const scheduleSessionReadyRetry = () => {
        clearSessionReadyRetry();
        sessionReadyRequestId = null;
        if (disposed) return;
        if (readyClaimExpiresAt <= now() || sessionReadyAttempt >= SESSION_READY_MAX_ATTEMPTS || typeof timers.setTimeout !== "function") {
            failSessionReady();
            return;
        }
        sessionReadyRetryTimer = timers.setTimeout(() => {
            sessionReadyRetryTimer = null;
            sendSessionReady();
        }, Math.min(SESSION_READY_RETRY_DELAY_MS, Math.max(0, readyClaimExpiresAt - now())));
    };

    return Object.freeze({
        updateReadyLease(lease) {
            // Only the bootstrap's current validated same-lease ready record
            // can renew this handshake. The consumed ticket is not a session clock.
            if (disposed || !isPlainRecord(lease) || lease.status !== "ready"
                || typeof lease.leaseId !== "string" || !LEASE_ID_PATTERN.test(lease.leaseId)
                || !Number.isSafeInteger(lease.readyClaimExpiresAt) || lease.readyClaimExpiresAt <= now()
                || !isPublicBrokerSession(lease.session, locationRef, now())
                || lease.session.expiresAt > lease.readyClaimExpiresAt
                || (readyLeaseId !== null && readyLeaseId !== lease.leaseId)
                || (readySessionUrl !== null && readySessionUrl !== lease.session.url)) return false;
            readyLeaseId = lease.leaseId;
            readySessionUrl = lease.session.url;
            readyClaimExpiresAt = lease.readyClaimExpiresAt;
            return true;
        },
        async mount(mountElement, options) {
            if (disposed || mounted || !mountElement || typeof mountElement.replaceChildren !== "function") {
                throw new TypeError("The public Showcase stream mount is unavailable.");
            }
            assertMountOptions(options, locationRef, now());
            if (readySessionUrl !== null && readySessionUrl !== options.session.url) {
                throw new TypeError("The ready lease does not authorize this player path.");
            }
            readySessionUrl = options.session.url;
            if (readyClaimExpiresAt === 0) readyClaimExpiresAt = options.session.expiresAt;
            mounted = true;
            reportState("connecting");
            try {
                await primePublicShowcaseSession(fetchImpl, options.session, locationRef, now);
                if (disposed) return;
                const { signallingUrl } = createPublicSessionEndpoints(options.session, locationRef, now());
                mountElement.replaceChildren();
                const config = new LocalConfig({
                    useUrlParams: false,
                    initialSettings: createPublicShowcaseSettings({
                        Flags: LocalFlags,
                        NumericParameters: LocalNumbers,
                        OptionParameters: LocalOptions,
                        TextParameters: LocalText,
                        signallingUrl,
                    }),
                });
                stream = new LocalPixelStreaming(config, { videoElementParent: mountElement });
                stream.addEventListener("webRtcConnecting", () => { if (!disposed && !readinessFailed) reportState("connecting"); });
                stream.addEventListener("webRtcConnected", () => { if (!disposed && !readinessFailed) reportState("connected"); });
                stream.addEventListener("webRtcFailed", failSessionReady);
                // dataChannelOpen means the transport exists, while the editor may
                // still be finishing reset_ready/encoder setup. The broker promotes
                // ready to active only after Unreal confirms session_ready.
                stream.addEventListener("dataChannelOpen", () => {
                    if (disposed || readinessFailed) return;
                    dataChannelOpen = true;
                    if (sessionReady || sessionReadyRequestId || sessionReadyRetryTimer !== null) return;
                    sendSessionReady();
                });
                stream.addEventListener("webRtcDisconnected", () => {
                    if (disposed) return;
                    dataChannelOpen = false;
                    clearSessionReadyRetry();
                    sessionReadyRequestId = null;
                    sessionReadyAttempt = 0;
                    sessionReady = false;
                    reportState("disconnected");
                });
                stream.addResponseEventListener(SHOWCASE_RESPONSE_LISTENER, (response) => {
                    if (disposed) return;
                    const candidate = parseSessionReadyResponse(response);
                    if (candidate && candidate.requestId === sessionReadyRequestId) {
                        if (candidate.result === "success") reportSessionReady();
                        else if (candidate.code === "session_initializing") {
                            // A correlated initializing reply is progress, not
                            // silence or a terminal result. The broker claim
                            // still bounds startup, including renewed leases.
                            sessionReadyAttempt = 0;
                            scheduleSessionReadyRetry();
                        } else failSessionReady();
                    }
                    responseListeners.forEach((listener) => listener(response));
                });
                stream.connect();
            } catch (error) {
                if (disposed) return;
                reportState("error");
                throw error;
            }
        },
        emitUIInteraction(payload) {
            // session_ready is reserved for the transport lifecycle handshake.
            if (disposed || !stream || !isAllowlistedShowcasePayload(payload) || payload.action === SESSION_READY_ACTION) return false;
            return stream.emitUIInteraction(payload) === true;
        },
        disconnect() {
            if (disposed) return;
            disposed = true;
            sessionReady = false;
            dataChannelOpen = false;
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

export const createPublicShowcaseTransport = () => createPublicShowcaseTransportWithDependencies({
    Config,
    Flags,
    NumericParameters,
    OptionParameters,
    PixelStreaming,
    TextParameters,
});
