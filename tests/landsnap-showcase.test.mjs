import assert from "node:assert/strict";
import test from "node:test";
import {
    SHOWCASE_COMMANDS,
    SHOWCASE_NOTIFICATION_CODES,
    SHOWCASE_LIFECYCLE_MESSAGE,
    SHOWCASE_LIFECYCLE_VERSION,
    SHOWCASE_PARENT_ORIGIN,
    SHOWCASE_PROTOCOL_VERSION,
    SHOWCASE_SHELL_READY_MESSAGE,
    SHOWCASE_SHELL_READY_VERSION,
    announceShowcaseLifecycle,
    announceShowcaseShellReady,
    createShowcaseCommand,
    getShowcaseLifecycleFromLease,
    isShowcaseSessionExpiring,
    parseShowcaseResult,
    setShowcaseEmbeddedMode,
} from "../scripts/landsnap-showcase.js";

test("the direct Showcase shell removes standalone chrome when framed", () => {
    const toggles = [];
    const documentRef = {
        body: {
            classList: {
                toggle(name, enabled) { toggles.push([name, enabled]); },
            },
        },
    };
    const top = {};
    assert.equal(setShowcaseEmbeddedMode(documentRef, { self: {}, top }), true);
    assert.equal(setShowcaseEmbeddedMode(documentRef, { self: top, top }), false);
    assert.deepEqual(toggles, [
        ["landsnap-showcase-embedded", true],
        ["landsnap-showcase-embedded", false],
    ]);
});

test("the framed shell announces readiness only to its exact parent origin", () => {
    const calls = [];
    const parent = { postMessage(message, origin) { calls.push({ message, origin }); } };
    const top = {};
    assert.equal(announceShowcaseShellReady({
        self: {},
        top,
        parent,
        location: { hostname: "showcase.ns-tx.com", origin: "https://showcase.ns-tx.com" },
    }), true);
    assert.deepEqual(calls, [{
        message: { type: SHOWCASE_SHELL_READY_MESSAGE, version: SHOWCASE_SHELL_READY_VERSION },
        origin: SHOWCASE_PARENT_ORIGIN,
    }]);

    assert.equal(announceShowcaseShellReady({ self: top, top, parent, location: {} }), false);
    assert.equal(announceShowcaseShellReady({
        self: {},
        top,
        parent,
        location: { hostname: "127.0.0.1", origin: "http://127.0.0.1:4174" },
    }), true);
    assert.equal(calls.at(-1).origin, "http://127.0.0.1:4174");
});

test("the framed shell sends only fixed lifecycle states to the exact parent origin", () => {
    const calls = [];
    const parent = { postMessage(message, origin) { calls.push({ message, origin }); } };
    const top = {};
    const windowRef = {
        self: {},
        top,
        parent,
        location: { hostname: "showcase.ns-tx.com", origin: "https://showcase.ns-tx.com" },
    };

    assert.equal(announceShowcaseLifecycle(windowRef, "queued"), true);
    assert.deepEqual(calls, [{
        message: {
            type: SHOWCASE_LIFECYCLE_MESSAGE,
            version: SHOWCASE_LIFECYCLE_VERSION,
            state: "queued",
        },
        origin: SHOWCASE_PARENT_ORIGIN,
    }]);
    assert.equal(announceShowcaseLifecycle(windowRef, "waiting"), false);
    assert.equal(calls.length, 1);

    assert.equal(getShowcaseLifecycleFromLease({ status: "idle" }), "idle");
    assert.equal(getShowcaseLifecycleFromLease({ status: "waiting" }), "queued");
    assert.equal(getShowcaseLifecycleFromLease({ status: "starting" }), "preparing");
    assert.equal(getShowcaseLifecycleFromLease({ status: "ready" }), "connecting");
    assert.equal(getShowcaseLifecycleFromLease({ status: "active" }), "ready");
    assert.equal(getShowcaseLifecycleFromLease({ status: "expired" }), "cleanup");
    assert.equal(getShowcaseLifecycleFromLease({ status: "ended" }), "cleanup");
    assert.equal(getShowcaseLifecycleFromLease({ status: "unavailable" }), "failure");
});

test("each public control has one fixed no-argument command envelope", () => {
    const expected = {
        "snap-selected": "snap_selected",
        undo: "undo",
        redo: "redo",
        "reset-scene": "reset_scene",
        "previous-scenario": "previous_scenario",
        "next-scenario": "next_scenario",
        "toggle-autosnap": "toggle_autosnap",
        "prepare-small-row": "prepare_small_row",
        "prepare-medium-row": "prepare_medium_row",
        "prepare-large-row": "prepare_large_row",
        "prepare-small-coverage": "prepare_small_coverage",
        "prepare-medium-coverage": "prepare_medium_coverage",
        "prepare-large-coverage": "prepare_large_coverage",
        "clean-scene": "clean_scene",
        "select-previous-fixture": "select_previous_fixture",
        "select-next-fixture": "select_next_fixture",
        "focus-selected-fixture": "focus_selected_fixture",
    };
    assert.deepEqual(Object.fromEntries(Object.entries(SHOWCASE_COMMANDS).map(([id, value]) => [id, value.action])), expected);

    for (const [id, action] of Object.entries(expected)) {
        assert.deepEqual(createShowcaseCommand(id, "request_123"), {
            version: SHOWCASE_PROTOCOL_VERSION,
            type: "command",
            action,
            requestId: "request_123",
        });
    }
});

test("commands reject forged IDs, invalid request IDs, and arguments", () => {
    assert.throws(() => createShowcaseCommand("console-command", "request_123"), /Unknown Showcase command/);
    assert.throws(() => createShowcaseCommand("snap-selected", "short"), /Invalid Showcase request id/);
    assert.throws(() => createShowcaseCommand("snap-selected", "request_123", { arbitrary: "input" }), /do not accept arguments/);
});

test("only an exact, correlated bridge result is accepted", () => {
    const valid = JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "snap_selected",
        requestId: "request_123",
        result: "success",
        code: "completed",
    });
    assert.deepEqual(parseShowcaseResult(valid), {
        requestId: "request_123",
        action: "snap_selected",
        result: "success",
        message: "The showcase action completed.",
    });

    const unexpectedField = JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "snap_selected",
        requestId: "request_123",
        result: "success",
        code: "completed",
        message: "<img src=x onerror=alert(1)>",
    });
    assert.equal(parseShowcaseResult(unexpectedField), null);
    assert.equal(parseShowcaseResult("{".repeat(385)), null);
    assert.equal(parseShowcaseResult(JSON.stringify({ type: "operation-result" })), null);
});

test("AutoSnap, calibration, cleanup, and outliner messages stay inside the fixed protocol", () => {
    const autosnap = JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "toggle_autosnap",
        requestId: "request_123",
        result: "success",
        code: "autosnap_enabled",
    });
    const calibration = JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "prepare_medium_row",
        requestId: "request_123",
        result: "success",
        code: "calibration_ready",
    });
    assert.equal(parseShowcaseResult(autosnap)?.message, "AutoSnap is enabled for the prepared showcase objects.");
    assert.equal(parseShowcaseResult(calibration)?.message, "Calibration scene prepared with the selected size and layout.");
    assert.equal(parseShowcaseResult(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "prepare_medium_row",
        requestId: "request_123",
        result: "error",
        code: "calibration_unavailable",
    }))?.message, "That demo setup is unavailable right now.");
    assert.equal(parseShowcaseResult(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "prepare_medium_row",
        requestId: "request_123",
        result: "success",
        code: "calibration_unavailable",
    })), null);

    const cleanup = JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "clean_scene",
        requestId: "request_123",
        result: "success",
        code: "scene_cleaned",
    });
    const outliner = JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "focus_selected_fixture",
        requestId: "request_123",
        result: "success",
        code: "fixture_focused",
    });
    assert.equal(parseShowcaseResult(cleanup)?.message, "The prepared demo objects were removed from the scene.");
    assert.equal(parseShowcaseResult(outliner)?.message, "The selected demo object is focused in the viewport.");
});

test("viewport notifications use fixed copy for connecting, stream failures, and expiring sessions", () => {
    const now = 1_700_000_000_000;
    const activeLease = {
        status: "active",
        leaseId: "active-showcase-lease-1234",
        sessionExpiresAt: now + 60_000,
    };

    assert.deepEqual(SHOWCASE_NOTIFICATION_CODES.connecting, {
        level: "warning",
        title: "Connecting to stream",
        message: "Your Unreal session is ready. We’re connecting the browser stream now.",
    });
    assert.deepEqual(SHOWCASE_NOTIFICATION_CODES.server_offline, {
        level: "error",
        title: "Demo interrupted",
        message: "The live demo disconnected. We’ll try to restore your place automatically.",
    });
    assert.equal(SHOWCASE_NOTIFICATION_CODES.session_expiring.level, "warning");
    assert.equal(isShowcaseSessionExpiring(activeLease, now), true);
    assert.equal(isShowcaseSessionExpiring({ ...activeLease, sessionExpiresAt: now + 60_001 }, now), false);
    assert.equal(isShowcaseSessionExpiring({ status: "ready", readyClaimExpiresAt: now + 60_000 }, now), false);
    assert.equal(isShowcaseSessionExpiring({ status: "waiting" }, now), false);
});
