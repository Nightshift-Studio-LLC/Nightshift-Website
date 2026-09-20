/*
 * Browser-side control surface for the LandSnap Showcase.
 *
 * This module deliberately exposes no console, text-entry, settings, stats, or
 * generic command capability. The fixed bridge action names below are the only
 * Unreal-facing strings in the website code. Keep this registry aligned with
 * the separately owned Unreal Showcase bridge.
 */

export const SHOWCASE_PROTOCOL_VERSION = "landsnap-showcase-v1";

export const SHOWCASE_CALIBRATION_PRESETS = Object.freeze({
    "prepare-small-row": Object.freeze({ action: "prepare_small_row", label: "Prepare Small Row", outlinerLabel: "Small row fixtures" }),
    "prepare-medium-row": Object.freeze({ action: "prepare_medium_row", label: "Prepare Medium Row", outlinerLabel: "Medium row fixtures" }),
    "prepare-large-row": Object.freeze({ action: "prepare_large_row", label: "Prepare Large Row", outlinerLabel: "Large row fixtures" }),
    "prepare-small-coverage": Object.freeze({ action: "prepare_small_coverage", label: "Prepare Small Coverage", outlinerLabel: "Small coverage fixtures" }),
    "prepare-medium-coverage": Object.freeze({ action: "prepare_medium_coverage", label: "Prepare Medium Coverage", outlinerLabel: "Medium coverage fixtures" }),
    "prepare-large-coverage": Object.freeze({ action: "prepare_large_coverage", label: "Prepare Large Coverage", outlinerLabel: "Large coverage fixtures" }),
});

export const SHOWCASE_COMMANDS = Object.freeze({
    "snap-selected": Object.freeze({ action: "snap_selected" }),
    undo: Object.freeze({ action: "undo" }),
    redo: Object.freeze({ action: "redo" }),
    "reset-scene": Object.freeze({ action: "reset_scene" }),
    "previous-scenario": Object.freeze({ action: "previous_scenario" }),
    "next-scenario": Object.freeze({ action: "next_scenario" }),
    "toggle-autosnap": Object.freeze({ action: "toggle_autosnap" }),
    ...SHOWCASE_CALIBRATION_PRESETS,
    "clean-scene": Object.freeze({ action: "clean_scene" }),
    "select-previous-fixture": Object.freeze({ action: "select_previous_fixture" }),
    "select-next-fixture": Object.freeze({ action: "select_next_fixture" }),
    "focus-selected-fixture": Object.freeze({ action: "focus_selected_fixture" }),
});

export const STREAM_INPUT_POLICY = Object.freeze({
    mouse: true,
    keyboard: false,
    touch: false,
    gamepad: false,
    xr: false,
});

export const SHOWCASE_STREAMER_ID = "Editor";

export const SHOWCASE_NOTIFICATION_CODES = Object.freeze({
    connecting: Object.freeze({
        level: "warning",
        title: "Connecting to server",
        message: "Starting the Showcase stream. Controls will unlock when the editor is ready.",
    }),
    server_offline: Object.freeze({
        level: "error",
        title: "Server offline",
        message: "The Showcase stream is unavailable. Controls will return when it reconnects.",
    }),
    session_expiring: Object.freeze({
        level: "warning",
        title: "Session ending soon",
        message: "Less than one minute remains in this Showcase session.",
    }),
});

const ACTIONS = new Set(Object.values(SHOWCASE_COMMANDS).map(({ action }) => action));
const CONNECTION_STATES = new Set(["connecting", "connected", "disconnected", "error"]);
const SHOWCASE_SESSION_WARNING_MS = 60_000;
const RESULT_TYPES = new Set(["success", "rejected", "error"]);
const CALIBRATION_ACTIONS = new Set(Object.values(SHOWCASE_CALIBRATION_PRESETS).map(({ action }) => action));
const CALIBRATION_PRESET_BY_ACTION = new Map(Object.values(SHOWCASE_CALIBRATION_PRESETS).map((preset) => [preset.action, preset]));
const RESULT_MESSAGES = Object.freeze({
    completed: "The showcase action completed.",
    no_selection: "Select one of the prepared objects before running LandSnap.",
    nothing_to_undo: "There is no showcase action to undo.",
    nothing_to_redo: "There is no showcase action to redo.",
    scenario_changed: "The showcase scenario changed.",
    scene_reset: "The showcase scene was reset.",
    autosnap_enabled: "AutoSnap is enabled for the prepared showcase objects.",
    autosnap_disabled: "AutoSnap is disabled for the prepared showcase objects.",
    calibration_ready: "Calibration scene prepared with the selected size and layout.",
    calibration_unavailable: "That calibration preset is unavailable in this Showcase session.",
    scene_cleaned: "Prepared calibration fixtures were removed from the scene.",
    fixture_selected: "A prepared showcase fixture is selected.",
    fixture_focused: "The selected showcase fixture is focused in the viewport.",
    fixture_unavailable: "Prepare a calibration scene before selecting a showcase fixture.",
    operation_rejected: "That action is not available in the current showcase state.",
    operation_failed: "The showcase could not complete that action. Try again or reset the scene.",
});
const RESULT_CODES_BY_ACTION = Object.freeze({
    snap_selected: new Set(["completed", "no_selection", "operation_rejected", "operation_failed"]),
    undo: new Set(["completed", "nothing_to_undo", "operation_rejected", "operation_failed"]),
    redo: new Set(["completed", "nothing_to_redo", "operation_rejected", "operation_failed"]),
    reset_scene: new Set(["scene_reset", "operation_rejected", "operation_failed"]),
    previous_scenario: new Set(["scenario_changed", "operation_rejected", "operation_failed"]),
    next_scenario: new Set(["scenario_changed", "operation_rejected", "operation_failed"]),
    toggle_autosnap: new Set(["autosnap_enabled", "autosnap_disabled", "operation_rejected", "operation_failed"]),
    ...Object.fromEntries([...CALIBRATION_ACTIONS].map((action) => [action, new Set(["calibration_ready", "calibration_unavailable", "operation_rejected", "operation_failed"])])),
    clean_scene: new Set(["scene_cleaned", "operation_rejected", "operation_failed"]),
    select_previous_fixture: new Set(["fixture_selected", "fixture_unavailable", "operation_rejected", "operation_failed"]),
    select_next_fixture: new Set(["fixture_selected", "fixture_unavailable", "operation_rejected", "operation_failed"]),
    focus_selected_fixture: new Set(["fixture_focused", "fixture_unavailable", "operation_rejected", "operation_failed"]),
});
const RESULT_TYPE_BY_CODE = Object.freeze({
    completed: "success",
    no_selection: "rejected",
    nothing_to_undo: "rejected",
    nothing_to_redo: "rejected",
    scenario_changed: "success",
    scene_reset: "success",
    autosnap_enabled: "success",
    autosnap_disabled: "success",
    calibration_ready: "success",
    calibration_unavailable: "error",
    scene_cleaned: "success",
    fixture_selected: "success",
    fixture_focused: "success",
    fixture_unavailable: "rejected",
    operation_rejected: "rejected",
    operation_failed: "error",
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
    if (typeof candidate.code !== "string"
        || !own(RESULT_MESSAGES, candidate.code)
        || !RESULT_CODES_BY_ACTION[candidate.action]?.has(candidate.code)
        || RESULT_TYPE_BY_CODE[candidate.code] !== candidate.result) return null;

    return Object.freeze({
        requestId: candidate.requestId,
        action: candidate.action,
        result: candidate.result,
        message: RESULT_MESSAGES[candidate.code],
    });
};

const isTransport = (value, requiresSessionReady = false) => value
    && typeof value.mount === "function"
    && typeof value.emitUIInteraction === "function"
    && typeof value.onConnectionState === "function"
    && typeof value.onResponse === "function"
    && (!requiresSessionReady || typeof value.onSessionReady === "function");

const isLoopbackHost = (hostname) => typeof hostname === "string"
    && ["127.0.0.1", "localhost", "[::1]"].includes(hostname.toLowerCase());

const hasReadyQueueLease = (lease, now = Date.now()) => lease
    && lease.status === "ready"
    && typeof lease.leaseId === "string"
    && Number.isSafeInteger(lease.expiresAt)
    && lease.expiresAt > now
    && lease.session
    && typeof lease.session.url === "string"
    && /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/.test(lease.session.url)
    && typeof lease.session.token === "string"
    && /^[A-Za-z0-9._~-]{24,512}$/.test(lease.session.token)
    && Number.isSafeInteger(lease.session.expiresAt)
    && lease.session.expiresAt > now;

export const isShowcaseSessionExpiring = (lease, now = Date.now()) => hasReadyQueueLease(lease, now)
    && lease.expiresAt - now <= SHOWCASE_SESSION_WARNING_MS;

const getSurface = (documentRef) => ({
    mount: documentRef.getElementById("landsnap-showcase-stream-mount"),
    operation: documentRef.getElementById("landsnap-showcase-operation-status"),
    scenario: documentRef.getElementById("landsnap-showcase-scenario-name"),
    calibrationSize: documentRef.getElementById("landsnap-showcase-calibration-size"),
    calibrationLayout: documentRef.getElementById("landsnap-showcase-calibration-layout"),
    calibrationPrepare: documentRef.getElementById("landsnap-showcase-prepare-fixtures"),
    outlinerTarget: documentRef.getElementById("landsnap-showcase-outliner-target"),
    notification: documentRef.getElementById("landsnap-showcase-notification"),
    notificationTitle: documentRef.getElementById("landsnap-showcase-notification-title"),
    notificationMessage: documentRef.getElementById("landsnap-showcase-notification-message"),
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
export const attachShowcaseSurface = (documentRef, transport, {
    brokerSession = null,
    onStreamLoss = () => {},
} = {}) => {
    const surface = getSurface(documentRef);
    if (!surface.mount || !surface.operation || !surface.controls.length) return null;

    let connectionState = "disconnected";
    let pendingRequest = null;
    let pendingTimer = null;
    let sessionExpiring = false;
    let sessionReady = brokerSession === null;
    let streamLossReported = false;
    let detached = false;
    let mountRequested = false;

    const syncCalibrationCommand = () => {
        if (!surface.calibrationSize || !surface.calibrationLayout || !surface.calibrationPrepare) return;
        const commandId = `prepare-${surface.calibrationSize.value}-${surface.calibrationLayout.value}`;
        const preset = SHOWCASE_CALIBRATION_PRESETS[commandId];
        if (!preset) return;
        surface.calibrationPrepare.dataset.command = commandId;
        const label = surface.calibrationPrepare.querySelector("span:last-child");
        if (label) label.textContent = preset.label;
    };

    const renderNotification = () => {
        const code = connectionState === "disconnected" || connectionState === "error"
            ? "server_offline"
            : connectionState === "connecting" ? "connecting"
            : sessionExpiring ? "session_expiring" : null;
        const notification = code ? SHOWCASE_NOTIFICATION_CODES[code] : null;
        if (surface.notification) {
            surface.notification.hidden = notification === null;
            surface.notification.dataset.notificationLevel = notification?.level || "info";
        }
        if (notification) {
            setText(surface.notificationTitle, notification.title);
            setText(surface.notificationMessage, notification.message);
        }
    };

    const clearPending = () => {
        if (pendingTimer !== null) window.clearTimeout(pendingTimer);
        pendingTimer = null;
        pendingRequest = null;
    };

    const render = () => {
        const ready = connectionState === "connected" && sessionReady && pendingRequest === null;
        surface.controls.forEach((control) => {
            control.disabled = !ready;
            control.setAttribute("aria-disabled", String(!ready));
        });
        [surface.calibrationSize, surface.calibrationLayout].forEach((control) => {
            if (!control) return;
            control.disabled = !ready;
            control.setAttribute("aria-disabled", String(!ready));
        });
        surface.mount.dataset.connectionState = connectionState;
        surface.mount.setAttribute("aria-busy", String(connectionState === "connecting"));
        renderNotification();
        if (surface.scenario) {
            surface.scenario.textContent = connectionState === "connected" && sessionReady ? "Prepared scene" : "Awaiting stream";
        }
    };

    const displayConnection = (state) => {
        connectionState = state;
        render();
    };

    const displayOperation = (message) => setText(surface.operation, message);

    const updateOutliner = (response) => {
        if (!surface.outlinerTarget || response.result !== "success") return;
        const preset = CALIBRATION_PRESET_BY_ACTION.get(response.action);
        if (preset) {
            setText(surface.outlinerTarget, preset.outlinerLabel);
        } else if (response.action === "clean_scene") {
            setText(surface.outlinerTarget, "No prepared fixtures");
        } else if (response.action === "select_previous_fixture" || response.action === "select_next_fixture") {
            setText(surface.outlinerTarget, "Selected showcase fixture");
        } else if (response.action === "focus_selected_fixture") {
            setText(surface.outlinerTarget, "Focused showcase fixture");
        }
    };

    const handleResponse = (raw) => {
        const response = parseShowcaseResult(raw);
        if (!response || !pendingRequest || response.requestId !== pendingRequest.requestId) return;

        clearPending();
        displayOperation(response.message);
        updateOutliner(response);
        render();
    };

    const handleControl = (event) => {
        const control = event.currentTarget;
        if (connectionState !== "connected" || !sessionReady || pendingRequest || !(control instanceof HTMLButtonElement)) return;

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

    if (!isTransport(transport, brokerSession !== null)) {
        setText(surface.mount, "A purpose-built Showcase transport is required before this local review page can connect.");
        displayConnection("disconnected");
        displayOperation("Review is unavailable until the Showcase stream connects.");
        return null;
    }

    surface.controls.forEach((control) => control.addEventListener("click", handleControl));
    [surface.calibrationSize, surface.calibrationLayout].forEach((control) => {
        if (control) control.addEventListener("change", syncCalibrationCommand);
    });
    syncCalibrationCommand();

    transport.onConnectionState((nextState) => {
        if (detached) return;
        if (typeof nextState !== "string" || !CONNECTION_STATES.has(nextState)) return;
        const wasConnected = connectionState === "connected";
        if (nextState !== "connected") clearPending();
        if (nextState === "connected") {
            streamLossReported = false;
            if (brokerSession === null) sessionReady = true;
        } else if (brokerSession !== null
            && mountRequested
            && (wasConnected || nextState === "disconnected" || nextState === "error")
            && !streamLossReported) {
            sessionReady = false;
            streamLossReported = true;
            onStreamLoss();
        }
        displayConnection(nextState);
    });
    if (brokerSession !== null) {
        transport.onSessionReady(() => {
            if (detached) return;
            sessionReady = true;
            render();
        });
    }
    transport.onResponse(handleResponse);
    displayConnection("connecting");
    displayOperation("Review results will appear here after a LandSnap action.");

    const mountOptions = brokerSession === null
        ? Object.freeze({ streamerId: SHOWCASE_STREAMER_ID, input: STREAM_INPUT_POLICY })
        : Object.freeze({ session: brokerSession, input: STREAM_INPUT_POLICY });
    mountRequested = true;
    Promise.resolve(transport.mount(surface.mount, mountOptions)).catch(() => {
        if (detached) return;
        if (brokerSession !== null && !streamLossReported) {
            streamLossReported = true;
            onStreamLoss();
        }
        displayConnection("error");
    });

    return Object.freeze({
        detach() {
            detached = true;
            clearPending();
            surface.controls.forEach((control) => control.removeEventListener("click", handleControl));
            [surface.calibrationSize, surface.calibrationLayout].forEach((control) => {
                if (control) control.removeEventListener("change", syncCalibrationCommand);
            });
        },
        setSessionExpiryWarning(lease) {
            sessionExpiring = isShowcaseSessionExpiring(lease);
            renderNotification();
        },
    });
};

/**
 * A deployment-owned transport can arrive after this shell module (the local
 * bootstrap loads the frontend only for loopback origins). Re-attach exactly
 * once when that happens, without adding duplicate control listeners.
 */
export const initializeShowcaseSurface = (documentRef, windowRef) => {
    let attached = null;
    let attachedTransport = null;
    let authorizationKey = null;
    const expander = typeof documentRef.querySelector === "function"
        ? documentRef.querySelector("[data-landsnap-showcase-expander]")
        : null;

    const getAuthorization = () => {
        if (isLoopbackHost(windowRef.location?.hostname)) {
            return Object.freeze({ kind: "loopback", session: null, key: "loopback" });
        }
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (!hasReadyQueueLease(lease)) return null;
        return Object.freeze({
            kind: "broker",
            session: lease.session,
            key: `${lease.leaseId}:${lease.session.token}`,
        });
    };

    const renderTransportBoundary = () => {
        if (expander && !expander.open) {
            if (attached) attached.detach();
            if (attachedTransport && typeof attachedTransport.disconnect === "function") attachedTransport.disconnect();
            attached = null;
            attachedTransport = null;
            authorizationKey = null;
            return;
        }
        const authorization = getAuthorization();
        const transport = authorization ? windowRef.LandSnapShowcasePixelStreaming : null;
        if (authorizationKey === authorization?.key && attachedTransport === transport) {
            attached?.setSessionExpiryWarning(windowRef.LandSnapShowcaseQueueLease);
            return;
        }

        if (attached) attached.detach();
        if (attachedTransport && typeof attachedTransport.disconnect === "function") {
            attachedTransport.disconnect();
        }
        attachedTransport = transport || null;
        attached = attachShowcaseSurface(documentRef, transport, {
            brokerSession: authorization?.session || null,
            onStreamLoss: () => { void windowRef.LandSnapShowcaseQueue?.recheck?.(); },
        });
        authorizationKey = authorization?.key || null;
        attached?.setSessionExpiryWarning(windowRef.LandSnapShowcaseQueueLease);
    };

    renderTransportBoundary();
    windowRef.addEventListener("landsnap-showcase-transport-ready", renderTransportBoundary);
    windowRef.addEventListener("landsnap-showcase-lease-change", renderTransportBoundary);
    if (expander) expander.addEventListener("toggle", renderTransportBoundary);
    return Object.freeze({
        detach() {
            windowRef.removeEventListener("landsnap-showcase-transport-ready", renderTransportBoundary);
            windowRef.removeEventListener("landsnap-showcase-lease-change", renderTransportBoundary);
            if (expander) expander.removeEventListener("toggle", renderTransportBoundary);
            if (attached) attached.detach();
            if (attachedTransport && typeof attachedTransport.disconnect === "function") attachedTransport.disconnect();
        },
    });
};

if (typeof document !== "undefined") {
    initializeShowcaseSurface(document, window);
}
