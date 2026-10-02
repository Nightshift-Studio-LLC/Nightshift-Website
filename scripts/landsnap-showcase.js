import { parseTutorialState, getTutorialCopy } from "./landsnap-showcase-guide.js?v=20261002-guided-reconciled-v1";

/*
 * Browser-side control surface for the LandSnap Showcase.
 *
 * This module deliberately exposes no console, text-entry, settings, stats, or
 * generic command capability. The fixed bridge action names below are the only
 * Unreal-facing strings in the website code. Keep this registry aligned with
 * the separately owned Unreal Showcase bridge.
 */

export const SHOWCASE_PROTOCOL_VERSION = "landsnap-showcase-v1";
export const SHOWCASE_EMBEDDED_CLASS = "landsnap-showcase-embedded";
export const SHOWCASE_PARENT_ORIGIN = "https://ns-tx.com";
export const SHOWCASE_SHELL_READY_MESSAGE = "landsnap-showcase-shell-ready";
export const SHOWCASE_SHELL_READY_VERSION = 1;
export const SHOWCASE_LIFECYCLE_MESSAGE = "landsnap-showcase-lifecycle";
export const SHOWCASE_LIFECYCLE_VERSION = 1;
export const SHOWCASE_START_REQUEST_EVENT = "landsnap-showcase-start-requested";
export const SHOWCASE_LIFECYCLE_STATES = Object.freeze([
    "idle",
    "queued",
    "preparing",
    "connecting",
    "ready",
    "cleanup",
    "failure",
]);
const SHOWCASE_LIFECYCLE_STATE_SET = new Set(SHOWCASE_LIFECYCLE_STATES);

export const setShowcaseEmbeddedMode = (documentRef, windowRef) => {
    const embedded = Boolean(windowRef && windowRef.self !== windowRef.top);
    documentRef?.body?.classList?.toggle?.(SHOWCASE_EMBEDDED_CLASS, embedded);
    return embedded;
};

export const announceShowcaseShellReady = (windowRef) => {
    if (!windowRef || windowRef.self === windowRef.top || typeof windowRef.parent?.postMessage !== "function") return false;
    const targetOrigin = isLoopbackHost(windowRef.location?.hostname)
        ? windowRef.location.origin
        : SHOWCASE_PARENT_ORIGIN;
    windowRef.parent.postMessage({
        type: SHOWCASE_SHELL_READY_MESSAGE,
        version: SHOWCASE_SHELL_READY_VERSION,
    }, targetOrigin);
    return true;
};

export const announceShowcaseLifecycle = (windowRef, state) => {
    if (!SHOWCASE_LIFECYCLE_STATE_SET.has(state)
        || !windowRef
        || windowRef.self === windowRef.top
        || typeof windowRef.parent?.postMessage !== "function") return false;
    const targetOrigin = isLoopbackHost(windowRef.location?.hostname)
        ? windowRef.location.origin
        : SHOWCASE_PARENT_ORIGIN;
    windowRef.parent.postMessage({
        type: SHOWCASE_LIFECYCLE_MESSAGE,
        version: SHOWCASE_LIFECYCLE_VERSION,
        state,
    }, targetOrigin);
    return true;
};

export const getShowcaseLifecycleFromLease = (lease) => {
    if (lease?.status === "waiting") return "queued";
    if (lease?.status === "starting") return "preparing";
    if (lease?.status === "ready") return "idle";
    if (lease?.status === "active") return "ready";
    if (["cleanup", "expired", "ended"].includes(lease?.status)) return "cleanup";
    if (lease?.status === "unavailable") return "failure";
    return "idle";
};

export const SHOWCASE_CALIBRATION_PRESETS = Object.freeze({
    "prepare-small-row": Object.freeze({ action: "prepare_small_row", label: "Prepare Small Row", outlinerLabel: "Small row objects" }),
    "prepare-medium-row": Object.freeze({ action: "prepare_medium_row", label: "Prepare Medium Row", outlinerLabel: "Medium row objects" }),
    "prepare-large-row": Object.freeze({ action: "prepare_large_row", label: "Prepare Large Row", outlinerLabel: "Large row objects" }),
    "prepare-small-coverage": Object.freeze({ action: "prepare_small_coverage", label: "Prepare Small Coverage", outlinerLabel: "Small coverage objects" }),
    "prepare-medium-coverage": Object.freeze({ action: "prepare_medium_coverage", label: "Prepare Medium Coverage", outlinerLabel: "Medium coverage objects" }),
    "prepare-large-coverage": Object.freeze({ action: "prepare_large_coverage", label: "Prepare Large Coverage", outlinerLabel: "Large coverage objects" }),
});

export const SHOWCASE_GUIDE_COMMANDS = Object.freeze({
    "guide-start": Object.freeze({ action: "guide_start" }),
    "guide-next": Object.freeze({ action: "guide_next" }),
    "guide-back": Object.freeze({ action: "guide_back" }),
    "guide-skip": Object.freeze({ action: "guide_skip" }),
    "guide-replay": Object.freeze({ action: "guide_replay" }),
    "guide-unreal-floor": Object.freeze({ action: "guide_unreal_floor" }),
    "guide-unreal-align": Object.freeze({ action: "guide_unreal_align" }),
    "guide-unreal-pivot": Object.freeze({ action: "guide_unreal_pivot" }),
    "guide-unreal-pivot-align": Object.freeze({ action: "guide_unreal_pivot_align" }),
    "guide-unreal-bounds": Object.freeze({ action: "guide_unreal_bounds" }),
    "guide-unreal-bounds-align": Object.freeze({ action: "guide_unreal_bounds_align" }),
    "guide-prop-basketball": Object.freeze({ action: "guide_prop_basketball" }),
    "guide-prop-house": Object.freeze({ action: "guide_prop_house" }),
    "guide-prop-shed": Object.freeze({ action: "guide_prop_shed" }),
    "guide-autosnap-on": Object.freeze({ action: "guide_autosnap_on" }),
    "guide-autosnap-off": Object.freeze({ action: "guide_autosnap_off" }),
});
const GUIDE_ACTIONS = new Set(Object.values(SHOWCASE_GUIDE_COMMANDS).map(({ action }) => action));

export const SHOWCASE_COMMANDS = Object.freeze({
    ...SHOWCASE_GUIDE_COMMANDS,
    "compare-unreal": Object.freeze({ action: "compare_unreal_snap" }),
    "compare-landsnap": Object.freeze({ action: "compare_landsnap" }),
    "reset-comparison": Object.freeze({ action: "reset_comparison" }),
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
    "select-all-fixtures": Object.freeze({ action: "select_all_fixtures" }),
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
        title: "Connecting to stream",
        message: "We’re connecting the live stream. A slow connection can take a little longer; your demo timer has not started yet.",
    }),
    server_offline: Object.freeze({
        level: "error",
        title: "Demo interrupted",
        message: "The live demo disconnected. We’ll try to restore your place automatically.",
    }),
    session_expiring: Object.freeze({
        level: "warning",
        title: "Demo ending soon",
        message: "Less than one minute remains in your demo.",
    }),
});

// The lifecycle acknowledgement uses the same bounded response gate but is
// internal and never becomes a visitor-facing control.
const ACTIONS = new Set([...Object.values(SHOWCASE_COMMANDS).map(({ action }) => action), "session_ready"]);
const CONNECTION_STATES = new Set(["connecting", "connected", "disconnected", "error"]);
const SHOWCASE_SESSION_WARNING_MS = 60_000;
const RESULT_TYPES = new Set(["success", "rejected", "error"]);
const CALIBRATION_ACTIONS = new Set(Object.values(SHOWCASE_CALIBRATION_PRESETS).map(({ action }) => action));
const CALIBRATION_PRESET_BY_ACTION = new Map(Object.values(SHOWCASE_CALIBRATION_PRESETS).map((preset) => [preset.action, preset]));
const COMPARISON_ACTIONS = new Set(["compare_unreal_snap", "compare_landsnap", "reset_comparison"]);
const COMPARISON_READY_MESSAGE = "Fresh full-coverage objects are selected. Try Unreal Snap to Floor, then LandSnap to compare the same starting transforms.";
const COMPLETED_MESSAGES_BY_ACTION = Object.freeze({
    compare_unreal_snap: "Unreal's native End / Snap to Floor completed from the shared starting transforms. Object rotation is preserved.",
    compare_landsnap: "LandSnap completed from the same starting transforms. Inspect the terrain contact and angles, or reset to compare again.",
});
const RESULT_MESSAGES = Object.freeze({
    guided_completed: "The editor completed this guided action. Inspect the live placement; completion does not certify terrain contact.",
    guide_unavailable: "The saved guide props or camera are unavailable. Use the existing comparison controls, or retry after the scene is ready.",
    session_ready: "The showcase session is ready.",
    completed: "The showcase action completed.",
    comparison_reset: "The comparison objects are back at their starting positions, rotation and scale, with all objects selected and AutoSnap off.",
    comparison_unavailable: "Prepare a demo example in Advanced controls to restore the comparison buttons.",
    no_selection: "Select one of the prepared objects before running LandSnap.",
    nothing_to_undo: "There is no showcase action to undo.",
    nothing_to_redo: "There is no showcase action to redo.",
    scenario_changed: "The showcase scenario changed.",
    scene_reset: "The showcase scene was reset. Prepare another example in Advanced controls to compare again.",
    autosnap_enabled: "AutoSnap is enabled for the prepared showcase objects.",
    autosnap_disabled: "AutoSnap is disabled for the prepared showcase objects.",
    calibration_ready: "Calibration scene prepared with the selected size and layout.",
    calibration_unavailable: "That demo setup is unavailable right now.",
    scene_cleaned: "The prepared demo objects were removed from the scene. Prepare another example in Advanced controls to compare again.",
    fixture_selected: "A demo object is selected.",
    fixture_focused: "The selected demo object is focused in the viewport.",
    fixture_unavailable: "Prepare a demo scene before selecting an object.",
    authored_scene_reset: "The saved opening, camera and full selection have been restored. Both comparisons are ready.",
    authored_setup_locked: "This demo uses the saved opening. Prepare and Remove Demo Objects are unavailable. Use Reset Comparison to restore the opening.",
    operation_rejected: "That action is not available in the current showcase state.",
    operation_failed: "The showcase could not complete that action. Try again or reset the scene.",
});
const RESULT_CODES_BY_ACTION = Object.freeze({
    ...Object.fromEntries([...GUIDE_ACTIONS].map((action) => [action, new Set(["guided_completed", "guide_unavailable", "operation_rejected", "operation_failed"])])),
    session_ready: new Set(["session_ready"]),
    compare_unreal_snap: new Set(["completed", "comparison_unavailable", "operation_rejected", "operation_failed"]),
    compare_landsnap: new Set(["completed", "comparison_unavailable", "operation_rejected", "operation_failed"]),
    reset_comparison: new Set(["comparison_reset", "comparison_unavailable", "operation_rejected", "operation_failed"]),
    snap_selected: new Set(["completed", "no_selection", "operation_rejected", "operation_failed"]),
    undo: new Set(["completed", "nothing_to_undo", "operation_rejected", "operation_failed"]),
    redo: new Set(["completed", "nothing_to_redo", "operation_rejected", "operation_failed"]),
    reset_scene: new Set(["scene_reset", "authored_scene_reset", "operation_rejected", "operation_failed"]),
    previous_scenario: new Set(["scenario_changed", "operation_rejected", "operation_failed"]),
    next_scenario: new Set(["scenario_changed", "operation_rejected", "operation_failed"]),
    toggle_autosnap: new Set(["autosnap_enabled", "autosnap_disabled", "operation_rejected", "operation_failed"]),
    ...Object.fromEntries([...CALIBRATION_ACTIONS].map((action) => [action, new Set(["calibration_ready", "calibration_unavailable", "authored_setup_locked", "operation_rejected", "operation_failed"])])),
    clean_scene: new Set(["scene_cleaned", "authored_setup_locked", "operation_rejected", "operation_failed"]),
    select_previous_fixture: new Set(["fixture_selected", "fixture_unavailable", "operation_rejected", "operation_failed"]),
    select_next_fixture: new Set(["fixture_selected", "fixture_unavailable", "operation_rejected", "operation_failed"]),
    select_all_fixtures: new Set(["fixture_selected", "fixture_unavailable", "operation_rejected", "operation_failed"]),
    focus_selected_fixture: new Set(["fixture_focused", "fixture_unavailable", "operation_rejected", "operation_failed"]),
});
const RESULT_TYPE_BY_CODE = Object.freeze({
    guided_completed: "success",
    guide_unavailable: "rejected",
    session_ready: "success",
    completed: "success",
    comparison_reset: "success",
    comparison_unavailable: "rejected",
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
    authored_scene_reset: "success",
    authored_setup_locked: "rejected",
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
        code: candidate.code,
        message: candidate.action === "select_all_fixtures" && candidate.code === "fixture_selected"
            ? "All prepared demo objects are selected. Choose Snap Selected to run LandSnap."
            : candidate.code === "completed" && own(COMPLETED_MESSAGES_BY_ACTION, candidate.action)
                ? COMPLETED_MESSAGES_BY_ACTION[candidate.action]
            : RESULT_MESSAGES[candidate.code],
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
    && Number.isSafeInteger(lease.readyClaimExpiresAt)
    && lease.readyClaimExpiresAt > now
    && lease.session
    && typeof lease.session.url === "string"
    && /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/.test(lease.session.url)
    && typeof lease.session.token === "string"
    && /^[A-Za-z0-9._~-]{24,512}$/.test(lease.session.token)
    && Number.isSafeInteger(lease.session.expiresAt)
    && lease.session.expiresAt > now;

const hasActiveQueueLease = (lease, now = Date.now()) => lease
    && lease.status === "active"
    && typeof lease.leaseId === "string"
    && Number.isSafeInteger(lease.sessionExpiresAt)
    && lease.sessionExpiresAt > now;

export const isShowcaseSessionExpiring = (lease, now = Date.now()) => hasActiveQueueLease(lease, now)
    && lease.sessionExpiresAt - now <= SHOWCASE_SESSION_WARNING_MS;

const getSurface = (documentRef) => ({
    guide: documentRef.getElementById("landsnap-showcase-guide"),
    guideTitle: documentRef.getElementById("landsnap-showcase-guide-title"),
    guideMethod: documentRef.getElementById("landsnap-showcase-guide-method"),
    guideDescription: documentRef.getElementById("landsnap-showcase-guide-description"),
    guideLookFor: documentRef.getElementById("landsnap-showcase-guide-look-for"),
    guideState: documentRef.getElementById("landsnap-showcase-guide-state"),
    mount: documentRef.getElementById("landsnap-showcase-stream-mount"),
    connection: documentRef.getElementById("landsnap-showcase-connection-state"),
    operation: documentRef.getElementById("landsnap-showcase-operation-status"),
    scenario: documentRef.getElementById("landsnap-showcase-scenario-name"),
    calibrationSize: documentRef.getElementById("landsnap-showcase-calibration-size"),
    calibrationLayout: documentRef.getElementById("landsnap-showcase-calibration-layout"),
    calibrationPrepare: documentRef.getElementById("landsnap-showcase-prepare-fixtures"),
    autoSnap: documentRef.getElementById("landsnap-showcase-toggle-autosnap"),
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
    onSessionReady = () => {},
    onLifecycleChange = () => {},
} = {}) => {
    const surface = getSurface(documentRef);
    if (!surface.mount || !surface.operation || !surface.controls.length) return null;

    let connectionState = "disconnected";
    let pendingRequest = null;
    let pendingTimer = null;
    let sessionExpiring = false;
    let sessionReady = brokerSession === null && !surface.guide;
    let tutorialState = null;
    let guideStartSent = false;
    let guideStartTimer = null;
    let guideStartGeneration = 0;
    let comparisonPrepared = false;
    let streamLossReported = false;
    let detached = false;
    let mountRequested = false;
    let lastLifecycleState = null;

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
        const code = mountRequested && (connectionState === "disconnected" || connectionState === "error")
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

    const clearGuideStart = () => {
        if (guideStartTimer !== null) window.clearTimeout(guideStartTimer);
        guideStartTimer = null;
        guideStartGeneration += 1;
    };

    const clearPending = () => {
        if (pendingTimer !== null) window.clearTimeout(pendingTimer);
        pendingTimer = null;
        pendingRequest = null;
    };

    const render = () => {
        const ready = connectionState === "connected" && sessionReady && pendingRequest === null && guideStartTimer === null;
        surface.controls.forEach((control) => {
            const action = SHOWCASE_COMMANDS[control.dataset.command]?.action;
            const guideAction = GUIDE_ACTIONS.has(action);
            const guideReady = tutorialState?.phase !== "running";
            const step = tutorialState?.step;
            if (guideAction) {
                control.hidden = (action === "guide_replay" && step !== "sandbox")
                    || (action === "guide_skip" && step === "sandbox")
                    || (action.startsWith("guide_prop_") && step !== "sandbox")
                    || (action.startsWith("guide_autosnap_") && step !== "sandbox");
                if (action === "guide_next") control.textContent = step === "landsnap" ? "Try it yourself" : "Next";
                if (action.startsWith("guide_prop_")) control.setAttribute("aria-pressed", String(action === `guide_prop_${tutorialState?.prop}`));
                if (action.startsWith("guide_autosnap_")) control.setAttribute("aria-pressed", String(action === (tutorialState?.autoSnap ? "guide_autosnap_on" : "guide_autosnap_off")));
            }
            const enabled = ready && guideReady && (!COMPARISON_ACTIONS.has(action) || comparisonPrepared)
                && (!guideAction || ((tutorialState !== null || action === "guide_start" || action === "guide_skip")
                    && !(action === "guide_back" && step === "intro")
                    && !(action === "guide_next" && step === "sandbox")));
            if (guideAction && action === "guide_next") control.hidden = step === "sandbox";
            control.disabled = !enabled;
            control.setAttribute("aria-disabled", String(!enabled));
        });
        [surface.calibrationSize, surface.calibrationLayout].forEach((control) => {
            if (!control) return;
            control.disabled = !ready;
            control.setAttribute("aria-disabled", String(!ready));
        });
        if (surface.guide) {
            const copy = getTutorialCopy(tutorialState);
            setText(surface.guideTitle, copy.title);
            setText(surface.guideMethod, copy.method);
            setText(surface.guideDescription, copy.description);
            setText(surface.guideLookFor, copy.lookFor);
            setText(surface.guideState, pendingRequest || tutorialState?.phase === "running"
                ? "Editor operation running — waiting for its real result."
                : tutorialState?.phase === "failed" ? "This step could not complete. Retry or skip to the sandbox."
                : !sessionReady ? "Waiting for the editor to be ready."
                : tutorialState ? `Confirmed editor state · AutoSnap ${tutorialState.autoSnap ? "on" : "off"}`
                : "Waiting for the saved guide setup. Use Start guide to retry.");
        }
        surface.mount.dataset.connectionState = connectionState;
        surface.mount.setAttribute("aria-busy", String(connectionState === "connecting"));
        if (surface.connection) {
            const connectionLabel = connectionState === "connecting"
                ? "Connecting to stream"
                : connectionState === "connected" && sessionReady
                    ? "Session ready"
                    : connectionState === "connected"
                        ? "Finishing setup"
                        : mountRequested ? "Demo interrupted" : "Demo not started";
            const label = surface.connection.querySelector("strong");
            setText(label || surface.connection, connectionLabel);
        }
        renderNotification();
        if (surface.scenario) {
            surface.scenario.textContent = connectionState === "connected" && sessionReady ? "Prepared scene" : "Awaiting stream";
        }
        const lifecycleState = ready
            ? "ready"
            : connectionState === "connecting" || (connectionState === "connected" && !sessionReady)
                ? "connecting"
                : mountRequested && (connectionState === "disconnected" || connectionState === "error")
                    ? "failure"
                    : null;
        if (lifecycleState && lifecycleState !== lastLifecycleState) {
            lastLifecycleState = lifecycleState;
            onLifecycleChange(lifecycleState);
        }
    };

    const displayConnection = (state) => {
        connectionState = state;
        render();
    };

    const displayOperation = (message) => setText(surface.operation, message);

    const showAutoSnapDisabled = () => {
        if (!surface.autoSnap) return;
        surface.autoSnap.setAttribute("aria-pressed", "false");
        const label = surface.autoSnap.querySelector("span:last-child");
        setText(label, "AutoSnap: Off");
    };

    const showFreshSessionExample = () => {
        comparisonPrepared = true;
        if (surface.calibrationSize) surface.calibrationSize.value = "medium";
        if (surface.calibrationLayout) surface.calibrationLayout.value = "coverage";
        syncCalibrationCommand();
        setText(surface.outlinerTarget, "All full-coverage objects selected");
        showAutoSnapDisabled();
        displayOperation(surface.guide ? "The editor is ready. Starting the saved prop guide." : COMPARISON_READY_MESSAGE);
    };

    const updateOutliner = (response) => {
        if (response.result !== "success") return;
        const preset = CALIBRATION_PRESET_BY_ACTION.get(response.action);
        if (preset) {
            comparisonPrepared = true;
            setText(surface.outlinerTarget, `${preset.outlinerLabel} - all selected`);
            showAutoSnapDisabled();
        } else if (response.action === "reset_scene" && response.code === "authored_scene_reset") {
            comparisonPrepared = true;
            setText(surface.outlinerTarget, "All full-coverage objects selected");
            showAutoSnapDisabled();
        } else if (response.action === "clean_scene" || response.action === "reset_scene") {
            comparisonPrepared = false;
            setText(surface.outlinerTarget, "No demo objects prepared");
            if (response.action === "reset_scene") showAutoSnapDisabled();
        } else if (response.action === "select_all_fixtures") {
            setText(surface.outlinerTarget, "All demo objects selected");
        } else if (COMPARISON_ACTIONS.has(response.action)) {
            setText(surface.outlinerTarget, "All comparison objects selected");
            showAutoSnapDisabled();
        } else if (response.action === "select_previous_fixture" || response.action === "select_next_fixture") {
            setText(surface.outlinerTarget, "Selected demo object");
        } else if (response.action === "focus_selected_fixture") {
            setText(surface.outlinerTarget, "Focused demo object");
        }
    };

    const handleResponse = (raw) => {
        const nextTutorial = parseTutorialState(raw);
        if (surface.guide && nextTutorial) {
            if (tutorialState && nextTutorial.revision <= tutorialState.revision) return;
            tutorialState = nextTutorial;
            setText(surface.outlinerTarget, nextTutorial.step === "sandbox" ? `Selected ${nextTutorial.prop}` : "Saved prop group selected");
            render();
            return;
        }
        const response = parseShowcaseResult(raw);
        if (!response || !pendingRequest
            || response.requestId !== pendingRequest.requestId
            || response.action !== pendingRequest.action) return;

        clearPending();
        displayOperation(response.message);
        if (surface.autoSnap && (response.code === "autosnap_enabled" || response.code === "autosnap_disabled")) {
            const enabled = response.code === "autosnap_enabled";
            surface.autoSnap.setAttribute("aria-pressed", String(enabled));
            const label = surface.autoSnap.querySelector("span:last-child");
            if (label) label.textContent = `AutoSnap: ${enabled ? "On" : "Off"}`;
        }
        updateOutliner(response);
        if (response.code === "comparison_unavailable") comparisonPrepared = false;
        render();
    };

    const sendCommand = (commandId) => {
        if (connectionState !== "connected" || !sessionReady || pendingRequest
            || tutorialState?.phase === "running") return false;
        let request;
        try { request = createShowcaseCommand(commandId); }
        catch { displayOperation("That showcase control is unavailable."); return false; }
        // Set pending before emitting: synchronous transports cannot lose a result.
        pendingRequest = request;
        let accepted = false;
        try { accepted = transport.emitUIInteraction(request) === true; } catch {}
        if (!accepted) {
            clearPending();
            displayConnection("error");
            displayOperation("The showcase command could not be sent.");
            return false;
        }
        if (pendingRequest !== request) return true;
        displayOperation("Showcase action sent — awaiting the editor result.");
        render();
        // Guided LandSnap may be progressive. Never unlock a second operation
        // merely because a timer elapsed while the real solver is still running.
        if (!GUIDE_ACTIONS.has(request.action)) pendingTimer = window.setTimeout(() => {
            if (!pendingRequest || pendingRequest.requestId !== request.requestId) return;
            clearPending();
            displayOperation("The showcase did not confirm that action. Try again or reset the scene.");
            render();
        }, 10_000);
        return true;
    };
    const maybeStartGuide = () => {
        if (!surface.guide || guideStartSent || guideStartTimer !== null || pendingRequest
            || !sessionReady || connectionState !== "connected" || detached) return;
        const generation = guideStartGeneration;
        // The native per-source limit includes the readiness probe. Wait beyond
        // its 100 ms interval rather than bypassing that owner-side safeguard.
        guideStartTimer = window.setTimeout(() => {
            if (generation !== guideStartGeneration || detached) return;
            guideStartTimer = null;
            if (connectionState === "connected" && sessionReady && !pendingRequest
                && tutorialState?.phase !== "running") guideStartSent = sendCommand("guide-start");
            render();
        }, 200);
        render();
    };
    const handleControl = (event) => {
        const control = event.currentTarget;
        if (!(control instanceof HTMLButtonElement) || control.disabled) return;
        sendCommand(control.dataset.command);
    };

    if (!isTransport(transport, brokerSession !== null || Boolean(surface.guide))) {
        setText(surface.mount, "Start a demo session to load the interactive view.");
        render();
        displayOperation("Start the demo to enable these actions.");
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
        if (nextState !== "connected") {
            clearGuideStart();
            clearPending();
            if (surface.guide) { sessionReady = false; tutorialState = null; guideStartSent = false; }
        }
        if (nextState === "connected") {
            streamLossReported = false;
            if (brokerSession === null && !surface.guide) {
                sessionReady = true;
                showFreshSessionExample();
            }
        } else if (brokerSession !== null
            && mountRequested
            && (wasConnected || nextState === "disconnected" || nextState === "error")
            && !streamLossReported) {
            sessionReady = false;
            streamLossReported = true;
            onStreamLoss();
        }
        displayConnection(nextState);
        maybeStartGuide();
    });
    if (brokerSession !== null || surface.guide) {
        transport.onSessionReady(() => {
            if (detached) return;
            sessionReady = true;
            showFreshSessionExample();
            render();
            onSessionReady();
            maybeStartGuide();
        });
    }
    transport.onResponse(handleResponse);
    displayConnection("connecting");
    displayOperation("Your fresh comparison example is being prepared.");

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
            clearGuideStart();
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
    let authorizationLeaseId = null;
    let authorizationSessionUrl = null;
    let launchIdentity = null;
    const expander = typeof documentRef.querySelector === "function"
        ? documentRef.querySelector("[data-landsnap-showcase-expander]")
        : null;

    const getAuthorization = () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (!hasReadyQueueLease(lease)) return null;
        const identity = `${lease.leaseId}:${lease.session.url}`;
        if (launchIdentity !== identity) return null;
        if (isLoopbackHost(windowRef.location?.hostname)) {
            return Object.freeze({ kind: "loopback", session: null, key: identity });
        }
        return Object.freeze({
            kind: "broker",
            session: lease.session,
            key: `${lease.leaseId}:${lease.session.token}`,
        });
    };

    const publishLeaseLifecycle = () => {
        announceShowcaseLifecycle(windowRef, getShowcaseLifecycleFromLease(windowRef.LandSnapShowcaseQueueLease));
    };

    const renderTransportBoundary = () => {
        if (expander && !expander.open) {
            if (attached) attached.detach();
            if (attachedTransport && typeof attachedTransport.disconnect === "function") attachedTransport.disconnect();
            attached = null;
            attachedTransport = null;
            authorizationKey = null;
            authorizationLeaseId = null;
            authorizationSessionUrl = null;
            return;
        }
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (hasActiveQueueLease(lease)
            && attached
            && authorizationLeaseId === lease.leaseId) {
            attached.setSessionExpiryWarning(lease);
            return;
        }
        const authorization = getAuthorization();
        const transport = authorization ? windowRef.LandSnapShowcasePixelStreaming : null;
        const authorizedSessionUrl = authorization?.session?.url || null;
        if (authorization
            && attached
            && attachedTransport === transport
            && authorizationLeaseId === lease?.leaseId
            && authorizationSessionUrl === authorizedSessionUrl) {
            attached.setSessionExpiryWarning(lease);
            return;
        }
        if (authorizationKey === authorization?.key && attachedTransport === transport) {
            attached?.setSessionExpiryWarning(windowRef.LandSnapShowcaseQueueLease);
            return;
        }

        if (attached) attached.detach();
        if (attachedTransport && typeof attachedTransport.disconnect === "function") {
            attachedTransport.disconnect();
        }
        if (!authorization || !transport) {
            attached = null;
            attachedTransport = null;
            authorizationKey = null;
            authorizationLeaseId = null;
            authorizationSessionUrl = null;
            return;
        }
        attachedTransport = transport || null;
        attached = attachShowcaseSurface(documentRef, transport, {
            brokerSession: authorization?.session || null,
            onStreamLoss: () => { void windowRef.LandSnapShowcaseQueue?.recheck?.(); },
            onSessionReady: () => { void windowRef.LandSnapShowcaseQueue?.recheck?.(); },
            onLifecycleChange: (state) => announceShowcaseLifecycle(windowRef, state),
        });
        authorizationKey = authorization?.key || null;
        authorizationLeaseId = hasReadyQueueLease(lease) ? lease.leaseId : null;
        authorizationSessionUrl = hasReadyQueueLease(lease) ? authorizedSessionUrl : null;
        attached?.setSessionExpiryWarning(windowRef.LandSnapShowcaseQueueLease);
    };

    renderTransportBoundary();
    publishLeaseLifecycle();
    windowRef.addEventListener("landsnap-showcase-transport-ready", renderTransportBoundary);
    const handleStartRequest = () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (!hasReadyQueueLease(lease)) return;
        launchIdentity = `${lease.leaseId}:${lease.session.url}`;
        announceShowcaseLifecycle(windowRef, "connecting");
        renderTransportBoundary();
    };
    windowRef.addEventListener(SHOWCASE_START_REQUEST_EVENT, handleStartRequest);
    const handleLeaseTick = (event) => attached?.setSessionExpiryWarning(event?.detail);
    windowRef.addEventListener("landsnap-showcase-lease-tick", handleLeaseTick);
    const handleLeaseChange = () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        const readyIdentity = hasReadyQueueLease(lease) ? `${lease.leaseId}:${lease.session.url}` : null;
        if (lease?.status !== "active" && launchIdentity !== readyIdentity) launchIdentity = null;
        renderTransportBoundary();
        publishLeaseLifecycle();
    };
    windowRef.addEventListener("landsnap-showcase-lease-change", handleLeaseChange);
    if (expander) expander.addEventListener("toggle", renderTransportBoundary);
    return Object.freeze({
        detach() {
            windowRef.removeEventListener("landsnap-showcase-transport-ready", renderTransportBoundary);
            windowRef.removeEventListener(SHOWCASE_START_REQUEST_EVENT, handleStartRequest);
            windowRef.removeEventListener("landsnap-showcase-lease-tick", handleLeaseTick);
            windowRef.removeEventListener("landsnap-showcase-lease-change", handleLeaseChange);
            if (expander) expander.removeEventListener("toggle", renderTransportBoundary);
            if (attached) attached.detach();
            if (attachedTransport && typeof attachedTransport.disconnect === "function") attachedTransport.disconnect();
            attached = null;
            attachedTransport = null;
            authorizationKey = null;
            authorizationLeaseId = null;
            authorizationSessionUrl = null;
        },
    });
};

if (typeof document !== "undefined") {
    setShowcaseEmbeddedMode(document, window);
    announceShowcaseShellReady(window);
    initializeShowcaseSurface(document, window);
}
