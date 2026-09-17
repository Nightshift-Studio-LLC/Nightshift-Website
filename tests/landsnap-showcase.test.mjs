import assert from "node:assert/strict";
import test from "node:test";
import {
    SHOWCASE_COMMANDS,
    SHOWCASE_PROTOCOL_VERSION,
    createShowcaseCommand,
    parseShowcaseResult,
} from "../scripts/landsnap-showcase.js";

test("each public control has one fixed no-argument command envelope", () => {
    const expected = {
        "snap-selected": "snap_selected",
        undo: "undo",
        redo: "redo",
        "reset-scene": "reset_scene",
        "previous-scenario": "previous_scenario",
        "next-scenario": "next_scenario",
        "toggle-autosnap": "toggle_autosnap",
        "prepare-calibration": "prepare_calibration",
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

test("AutoSnap and calibration messages stay inside the fixed eight-action protocol", () => {
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
        action: "prepare_calibration",
        requestId: "request_123",
        result: "success",
        code: "calibration_ready",
    });
    assert.equal(parseShowcaseResult(autosnap)?.message, "AutoSnap is enabled for the prepared showcase objects.");
    assert.equal(parseShowcaseResult(calibration)?.message, "Calibration row prepared: 12 Medium Domino cubes are selected for LandSnap.");
    assert.equal(parseShowcaseResult(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "prepare_calibration",
        requestId: "request_123",
        result: "error",
        code: "calibration_unavailable",
    }))?.message, "The calibration row is unavailable in this Showcase session.");
    assert.equal(parseShowcaseResult(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "prepare_calibration",
        requestId: "request_123",
        result: "success",
        code: "calibration_unavailable",
    })), null);
});
