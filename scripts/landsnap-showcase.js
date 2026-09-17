/*
 * Browser-side control surface for the LandSnap Showcase.
 *
 * This module deliberately exposes no console, text-entry, settings, stats, or
 * generic command capability. The six bridge action names below are the only
 * Unreal-facing strings in the website code. Keep this registry aligned with
 * the separately owned Unreal Showcase bridge.
 */

export const SHOWCASE_PROTOCOL_VERSION = "landsnap-showcase-v1";

export const SHOWCASE_COMMANDS = Object.freeze({
    "snap-selected": Object.freeze({ action: "snap_selected" }),
    undo: Object.freeze({ action: "undo" }),
    redo: Object.freeze({ action: "redo" }),
    "reset-scene": Object.freeze({ action: "reset_scene" }),
    "previous-scenario": Object.freeze({ action: "previous_scenario" }),
    "next-scenario": Object.freeze({ action: "next_scenario" }),
});

export const STREAM_INPUT_POLICY = Object.freeze({
    mouse: true,
    keyboard: false,
    touch: false,
    gamepad: false,
    xr: false,
});

export const SHOWCASE_STREAMER_ID = "Editor";

const ACTIONS = new Set(Object.values(SHOWCASE_COMMANDS).map(({ action }) => action));
const CONNECTION_STATES = new Set(["connecting", "connected", "disconnected", "error"]);
const RESULT_TYPES = new Set(["success", "rejected", "error"]);
const RESULT_MESSAGES = Object.freeze({
    completed: "The showcase action completed.",
    no_selection: "Select one of the prepared objects before running LandSnap.",
    nothing_to_undo: "There is no showcase action to undo.",
    nothing_to_redo: "There is no showcase action to redo.",
    scenario_changed: "The showcase scenario changed.",
    scene_reset: "The showcase scene was reset.",
    operation_rejected: "That action is not available in the current showcase state.",
    operation_failed: "The showcase could not complete that action. Try again or reset the scene.",
});
const RESPONSE_KEYS = Object.freeze(["action", "code", "requestId", "result", "type", "version"]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_RESPONSE_LENGTH = 384;
let requestSequence = 0;

const own = (record, key) => Object.prototype.hasOwnProperty.call(record, key);

const sameKeys = (record, expected) => {
    const keys = Object.keys(record).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isPlainRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const makeRequestId = () => {
    requestSequence += 1;
    return `ls-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
};

/**
 * Builds the only data-channel payload this page can transmit. No arguments are
 * permitted: any browser-controlled value is rejected before it reaches the
 * Pixel Streaming frontend.
 */
export const createShowcaseCommand = (commandId, requestId = makeRequestId(), args) => {
    if (args !== undefined) {
        throw new TypeError("Showcase commands do not accept arguments.");
    }
    if (typeof commandId !== "string" || !own(SHOWCASE_COMMANDS, commandId)) {
        throw new TypeError("Unknown Showcase command.");
    }
    if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
        throw new TypeError("Invalid Showcase request id.");
    }

    return Object.freeze({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "command",
        action: SHOWCASE_COMMANDS[commandId].action,
        requestId,
    });
};

/**
 * Accept only a bounded, schema-checked acknowledgement from the Unreal bridge.
 * The bridge never supplies visitor-visible copy; its result code is mapped to a
 * local string below to prevent untrusted response text from changing the UI.
 */
export const parseShowcaseResult = (raw) => {
    if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RESPONSE_LENGTH) {
        return null;
    }

    let candidate;
    try {
        candidate = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!isPlainRecord(candidate) || !sameKeys(candidate, RESPONSE_KEYS)) return null;
    if (candidate.version !== SHOWCASE_PROTOCOL_VERSION || candidate.type !== "operation-result") return null;
    if (typeof candidate.requestId !== "string" || !REQUEST_ID_PATTERN.test(candidate.requestId)) return null;
    if (typeof candidate.action !== "string" || !ACTIONS.has(candidate.action)) return null;
    if (typeof candidate.result !== "string" || !RESULT_TYPES.has(candidate.result)) return null;
    if (typeof candidate.code !== "string" || !own(RESULT_MESSAGES, candidate.code)) return null;

    return Object.freeze({
        requestId: candidate.requestId,
        action: candidate.action,
        result: candidate.result,
        message: RESULT_MESSAGES[candidate.code],
    });
};

const isTransport = (value) => value
    && typeof value.mount === "function"
    && typeof value.emitUIInteraction === "function"
    && typeof value.onConnectionState === "function"
    && typeof value.onResponse === "function";

const getSurface = (documentRef) => ({
    mount: documentRef.getElementById("landsnap-showcase-stream-mount"),
    connection: documentRef.getElementById("landsnap-showcase-connection-state"),
    operation: documentRef.getElementById("landsnap-showcase-operation-status"),
    scenario: documentRef.getElementById("landsnap-showcase-scenario-name"),
    controls: [...documentRef.querySelectorAll("[data-command]")],
});

const setText = (element, value) => {
    if (element) element.textContent = value;
};

/**
 * Wires a purpose-built Pixel Streaming 2 transport into the static page. The
 * transport is supplied by the deployment-specific PS2 bootstrap, not by a URL,
 * query parameter, page dataset, or visitor-controlled form field.
 */
export const attachShowcaseSurface = (documentRef, transport) => {
    const surface = getSurface(documentRef);
    if (!surface.mount || !surface.connection || !surface.operation || !surface.controls.length) return null;

    let connectionState = "disconnected";
    let pendingRequest = null;
    let pendingTimer = null;

    const clearPending = () => {
        if (pendingTimer !== null) window.clearTimeout(pendingTimer);
        pendingTimer = null;
        pendingRequest = null;
    };

    const render = () => {
        const ready = connectionState === "connected" && pendingRequest === null;
        surface.controls.forEach((control) => {
            control.disabled = !ready;
            control.setAttribute("aria-disabled", String(!ready));
        });
        surface.mount.dataset.connectionState = connectionState;
        surface.mount.setAttribute("aria-busy", String(connectionState === "connecting"));
        surface.connection.dataset.connectionState = connectionState;
        if (surface.scenario) {
            surface.scenario.textContent = connectionState === "connected" ? "Prepared scene" : "Awaiting stream";
        }
    };

    const displayConnection = (state) => {
        const labels = {
            connecting: "Connecting to the showcase…",
            connected: "Connected — Stream Level Editor",
            disconnected: "Disconnected — showcase controls are unavailable",
            error: "Connection unavailable — try again later",
        };
        connectionState = state;
        setText(surface.connection, labels[state]);
        render();
    };

    const displayOperation = (message) => setText(surface.operation, message);

    const handleResponse = (raw) => {
        const response = parseShowcaseResult(raw);
        if (!response || !pendingRequest || response.requestId !== pendingRequest.requestId) return;

        clearPending();
        displayOperation(response.message);
        render();
    };

    const handleControl = (event) => {
        const control = event.currentTarget;
        if (connectionState !== "connected" || pendingRequest || !(control instanceof HTMLButtonElement)) return;

        let request;
        try {
            request = createShowcaseCommand(control.dataset.command);
        } catch {
            displayOperation("That showcase control is unavailable.");
            return;
        }

        let accepted = false;
        try {
            accepted = transport.emitUIInteraction(request) === true;
        } catch {
            accepted = false;
        }
        if (!accepted) {
            displayConnection("error");
            displayOperation("The showcase command could not be sent.");
            return;
        }

        pendingRequest = request;
        displayOperation("Showcase action sent — awaiting result…");
        render();
        pendingTimer = window.setTimeout(() => {
            if (!pendingRequest || pendingRequest.requestId !== request.requestId) return;
            clearPending();
            displayOperation("The showcase did not confirm that action. Try again or reset the scene.");
            render();
        }, 10_000);
    };

    if (!isTransport(transport)) {
        setText(surface.mount, "A purpose-built Showcase transport is required before this local review page can connect.");
        displayConnection("disconnected");
        displayOperation("No showcase action has been sent.");
        return null;
    }

    surface.controls.forEach((control) => control.addEventListener("click", handleControl));

    transport.onConnectionState((nextState) => {
        if (typeof nextState !== "string" || !CONNECTION_STATES.has(nextState)) return;
        if (nextState !== "connected") clearPending();
        displayConnection(nextState);
    });
    transport.onResponse(handleResponse);
    displayConnection("connecting");
    displayOperation("Preparing the Stream Level Editor viewport…");

    Promise.resolve(transport.mount(surface.mount, Object.freeze({
        streamerId: SHOWCASE_STREAMER_ID,
        input: STREAM_INPUT_POLICY,
    }))).catch(() => displayConnection("error"));

    return Object.freeze({
        detach() {
            clearPending();
            surface.controls.forEach((control) => control.removeEventListener("click", handleControl));
        },
    });
};

/**
 * A deployment-owned transport can arrive after this shell module (the local
 * bootstrap loads the frontend only for loopback origins). Re-attach exactly
 * once when that happens, without adding duplicate control listeners.
 */
export const initializeShowcaseSurface = (documentRef, windowRef) => {
    let attached = attachShowcaseSurface(documentRef, windowRef.LandSnapShowcasePixelStreaming);
    const handleTransportReady = (event) => {
        const transport = event?.detail || windowRef.LandSnapShowcasePixelStreaming;
        if (!transport) return;
        if (attached) attached.detach();
        attached = attachShowcaseSurface(documentRef, transport);
    };

    windowRef.addEventListener("landsnap-showcase-transport-ready", handleTransportReady);
    return Object.freeze({
        detach() {
            windowRef.removeEventListener("landsnap-showcase-transport-ready", handleTransportReady);
            if (attached) attached.detach();
        },
    });
};

if (typeof document !== "undefined") {
    initializeShowcaseSurface(document, window);
}
