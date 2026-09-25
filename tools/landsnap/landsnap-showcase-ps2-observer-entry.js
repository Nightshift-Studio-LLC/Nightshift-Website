/*
 * Receive-only Pixel Streaming 2 entrypoint for the LandSnap Showcase.
 *
 * This adapter is intentionally separate from the presenter transport. The
 * observer ticket has already been claimed before this module is loaded, so
 * there is no lease mutation here. All browser input flags stay disabled and
 * this adapter never emits UIInteraction or a session_ready message.
 *
 * The UE 5.8 frontend SDK still sends its built-in RequestInitialSettings and
 * RequestQualityControl messages when the data-channel protocol arrives. We
 * leave that version-pinned SDK behavior unchanged until the server contract
 * explicitly decides whether to ignore or reject those observer messages.
 */
import {
    Config,
    Flags,
    NumericParameters,
    OptionParameters,
    PixelStreaming,
    TextParameters,
} from "@epicgames-ps/lib-pixelstreamingfrontend-ue5.8";

export const OBSERVER_SHOWCASE_HOST = "showcase.ns-tx.com";
export const OBSERVER_SESSION_PATH = /^\/api\/landsnap-showcase\/session\/v1\/observer\/[A-Za-z0-9_-]{16,128}$/;
export const OBSERVER_INPUT_SETTINGS = Object.freeze({
    gamepad: false,
    keyboard: false,
    mouse: false,
    touch: false,
    xr: false,
});
export const OBSERVER_VIDEO_TIMEOUT_MS = 20_000;

const hasExactKeys = (record, expected) => {
    const keys = Object.keys(record).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isPlainRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

export const isObserverSignallingUrl = (value, locationRef = globalThis.location) => {
    if (typeof value !== "string" || !locationRef?.origin) return false;
    try {
        const endpoint = new URL(value, locationRef.origin);
        return endpoint.protocol === "wss:"
            && endpoint.origin === locationRef.origin.replace(/^https:/, "wss:")
            && OBSERVER_SESSION_PATH.test(endpoint.pathname)
            && endpoint.search === ""
            && endpoint.hash === "";
    } catch {
        return false;
    }
};

export const createObserverShowcaseSettings = ({
    Flags: localFlags,
    NumericParameters: localNumbers,
    OptionParameters: localOptions,
    TextParameters: localText,
    signallingUrl,
}) => Object.freeze({
    [localText.SignallingServerUrl]: signallingUrl,
    [localOptions.PreferredCodec]: "VP8",
    [localFlags.AutoConnect]: false,
    [localFlags.AutoPlayVideo]: true,
    [localFlags.MouseInput]: false,
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
    [localFlags.IsQualityController]: false,
    [localFlags.AFKDetection]: false,
    [localFlags.MatchViewportResolution]: false,
    [localNumbers.MaxReconnectAttempts]: 0,
});

const assertMountOptions = (options, locationRef) => {
    if (!isPlainRecord(options) || !hasExactKeys(options, ["input", "session"])) {
        throw new TypeError("Showcase observer mount options are invalid.");
    }
    if (!isPlainRecord(options.input)
        || !hasExactKeys(options.input, Object.keys(OBSERVER_INPUT_SETTINGS))
        || Object.values(options.input).some((value) => value !== false)
        || !isPlainRecord(options.session)
        || !isObserverSignallingUrl(options.session.signallingUrl, locationRef)) {
        throw new TypeError("Showcase observer accepts only its validated receive-only session.");
    }
};

export const createObserverShowcaseTransportWithDependencies = ({
    Config: LocalConfig,
    Flags: LocalFlags,
    NumericParameters: LocalNumbers,
    OptionParameters: LocalOptions,
    PixelStreaming: LocalPixelStreaming,
    TextParameters: LocalText,
    timers = globalThis,
    locationRef = globalThis.location,
} = {}) => {
    if (typeof LocalConfig !== "function" || typeof LocalPixelStreaming !== "function") {
        throw new TypeError("The Pixel Streaming 2 observer frontend is unavailable.");
    }

    let stream = null;
    let mounted = false;
    let settled = false;
    let timeoutHandle = null;
    let resolveMount = null;
    let rejectMount = null;

    const clearMountTimeout = () => {
        if (timeoutHandle !== null && typeof timers.clearTimeout === "function") {
            timers.clearTimeout(timeoutHandle);
        }
        timeoutHandle = null;
    };
    const settleMount = (error) => {
        if (settled) return;
        settled = true;
        clearMountTimeout();
        if (error) rejectMount?.(error);
        else resolveMount?.();
        resolveMount = null;
        rejectMount = null;
    };
    const failMount = (message) => settleMount(new TypeError(message));

    return Object.freeze({
        async mount(mountElement, options) {
            if (mounted || !mountElement || typeof mountElement.replaceChildren !== "function") {
                throw new TypeError("The Showcase observer stream mount is unavailable.");
            }
            assertMountOptions(options, locationRef);
            mounted = true;
            settled = false;
            mountElement.replaceChildren();
            const config = new LocalConfig({
                useUrlParams: false,
                initialSettings: createObserverShowcaseSettings({
                    Flags: LocalFlags,
                    NumericParameters: LocalNumbers,
                    OptionParameters: LocalOptions,
                    TextParameters: LocalText,
                    signallingUrl: options.session.signallingUrl,
                }),
            });
            stream = new LocalPixelStreaming(config, { videoElementParent: mountElement });

            return new Promise((resolve, reject) => {
                resolveMount = resolve;
                rejectMount = reject;
                stream.addEventListener("videoInitialized", () => settleMount());
                stream.addEventListener("webRtcFailed", () => failMount("The Showcase observer WebRTC connection failed."));
                stream.addEventListener("webRtcDisconnected", () => {
                    if (!settled) failMount("The Showcase observer disconnected before video started.");
                });
                timeoutHandle = typeof timers.setTimeout === "function"
                    ? timers.setTimeout(() => failMount("The Showcase observer video did not start in time."), OBSERVER_VIDEO_TIMEOUT_MS)
                    : null;
                try {
                    stream.connect();
                } catch (error) {
                    settleMount(error instanceof Error ? error : new TypeError("The Showcase observer could not connect."));
                }
            });
        },
        emitUIInteraction() {
            return false;
        },
        disconnect() {
            clearMountTimeout();
            if (!settled) settleMount(new TypeError("The Showcase observer was disconnected before video started."));
            if (stream && typeof stream.disconnect === "function") stream.disconnect();
            stream = null;
            mounted = false;
        },
    });
};

export const createObserverShowcaseTransport = () => createObserverShowcaseTransportWithDependencies({
    Config,
    Flags,
    NumericParameters,
    OptionParameters,
    PixelStreaming,
    TextParameters,
});
