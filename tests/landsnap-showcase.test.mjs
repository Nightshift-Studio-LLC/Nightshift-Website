import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
    SHOWCASE_COMMANDS,
    SHOWCASE_NOTIFICATION_CODES,
    SHOWCASE_LIFECYCLE_MESSAGE,
    SHOWCASE_LIFECYCLE_VERSION,
    SHOWCASE_PARENT_ORIGIN,
    SHOWCASE_PROTOCOL_VERSION,
    SHOWCASE_SHELL_READY_MESSAGE,
    SHOWCASE_SHELL_READY_VERSION,
    SHOWCASE_START_REQUEST_EVENT,
    announceShowcaseLifecycle,
    announceShowcaseShellReady,
    attachShowcaseSurface,
    createShowcaseCommand,
    getShowcaseLifecycleFromLease,
    initializeShowcaseSurface,
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
    assert.equal(getShowcaseLifecycleFromLease({ status: "ready" }), "idle");
    assert.equal(getShowcaseLifecycleFromLease({ status: "active" }), "ready");
    assert.equal(getShowcaseLifecycleFromLease({ status: "expired" }), "cleanup");
    assert.equal(getShowcaseLifecycleFromLease({ status: "ended" }), "cleanup");
    assert.equal(getShowcaseLifecycleFromLease({ status: "unavailable" }), "failure");
});

test("each public control has one fixed no-argument command envelope", () => {
    const expected = {
        "compare-unreal": "compare_unreal_snap",
        "compare-landsnap": "compare_landsnap",
        "reset-comparison": "reset_comparison",
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
        code: "completed",
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

test("session_ready acknowledgement stays inside the bounded lifecycle response gate", () => {
    assert.deepEqual(parseShowcaseResult(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "session_ready",
        requestId: "request_123",
        result: "success",
        code: "session_ready",
    })), {
        requestId: "request_123",
        action: "session_ready",
        result: "success",
        code: "session_ready",
        message: "The showcase session is ready.",
    });
    assert.equal(parseShowcaseResult(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action: "session_ready",
        requestId: "request_123",
        result: "error",
        code: "session_ready",
    })), null);
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
    assert.equal(parseShowcaseResult(cleanup)?.message, "The prepared demo objects were removed from the scene. Prepare another example in Advanced controls to compare again.");
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

test("comparison results name the actual action and reject mismatched success codes", () => {
    const result = (action, code = "completed", type = "success") => JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action,
        requestId: "request_123",
        result: type,
        code,
    });
    assert.match(parseShowcaseResult(result("compare_unreal_snap")).message, /native End \/ Snap to Floor.*rotation is preserved/);
    assert.match(parseShowcaseResult(result("compare_landsnap")).message, /LandSnap.*same starting transforms/);
    assert.match(parseShowcaseResult(result("reset_comparison", "comparison_reset")).message, /starting positions, rotation and scale/);
    assert.equal(parseShowcaseResult(result("reset_comparison")), null);
    assert.equal(parseShowcaseResult(result("compare_unreal_snap", "comparison_reset")), null);
    assert.equal(parseShowcaseResult(result("snap_selected", "comparison_reset")), null);
    assert.equal(parseShowcaseResult(result("compare_unreal_snap", "comparison_unavailable", "rejected"))?.code, "comparison_unavailable");
    assert.equal(parseShowcaseResult(result("compare_unreal_snap", "comparison_unavailable", "success")), null);
});

test("the child shell starts with medium mesh size, full coverage layout and an honest native comparator", async () => {
    const html = await readFile(new URL("../pages/Studio/LandSnapShowcase.html", import.meta.url), "utf8");
    const capabilities = await readFile(new URL("../scripts/landsnap-showcase-capabilities.js", import.meta.url), "utf8");
    assert.match(capabilities, /Object\.freeze\(\{ observer: true \}\)/, "comparison release preserves live observer UI capability");
    assert.match(html, /option value="medium" selected>Medium/);
    assert.match(html, /option value="coverage" selected>Full coverage/);
    assert.doesNotMatch(html, /option value="row" selected/);
    assert.match(html, /data-command="prepare-medium-coverage"/);
    assert.match(html, /Unreal: Snap to Floor \(End\)/);
    assert.match(html, /Native End drops objects to the floor while preserving rotation/);
    assert.match(html, /every demo starts with a fresh full-coverage example and all objects selected/);
    for (const command of ["compare-unreal", "compare-landsnap", "reset-comparison"]) {
        assert.match(html, new RegExp(`data-command="${command}"[^>]*disabled`));
    }
    const advanced = html.slice(html.indexOf('<details class="landsnap-showcase-advanced">'), html.indexOf("</details>", html.indexOf('<details class="landsnap-showcase-advanced">')));
    for (const command of ["snap-selected", "undo", "redo", "toggle-autosnap", "clean-scene", "reset-scene"]) {
        assert.ok(advanced.includes(`data-command="${command}"`), `${command} stays accessible in Advanced controls`);
    }
    assert.match(html, /data-command="focus-selected-fixture"/);
});

test("comparison release preserves the verified live observer capability and transport bytes", async () => {
    // Immutable d8934c9 assets verified on the live host on 2026-09-30.
    const liveObserverHashes = {
        "scripts/landsnap-showcase-capabilities.js": "24673cfd696ade5e26cbff15af3a11b98dbe3254c54ee18ffcd27a99a99d0ea4",
        "scripts/landsnap-showcase-observer.js": "d741a2bca8ecabcaca72023efab0193917e934997c8a0022dcb73ef8c7e40eb6",
        "scripts/vendor/landsnap-showcase-ps2-observer.js": "3d51d2bce30f2aaf6d42c38cf02a4c05f84c6bc7b5649ee1c243b18096ec530d",
    };
    for (const [path, expectedHash] of Object.entries(liveObserverHashes)) {
        const bytes = await readFile(new URL(`../${path}`, import.meta.url));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, path);
    }
});

test("comparison controls wait for prepared-session acknowledgement, correlate actions, and recover after a new preset", () => {
    const priorWindow = globalThis.window;
    const priorButton = globalThis.HTMLButtonElement;
    class FakeButton {
        constructor(command) {
            this.dataset = { command };
            this.disabled = true;
            this.attributes = new Map();
            this.listeners = new Map();
            this.label = { textContent: "" };
        }
        setAttribute(name, value) { this.attributes.set(name, value); }
        querySelector() { return this.label; }
        addEventListener(name, listener) { this.listeners.set(name, listener); }
        removeEventListener(name) { this.listeners.delete(name); }
        click() { this.listeners.get("click")?.({ currentTarget: this }); }
    }
    globalThis.HTMLButtonElement = FakeButton;
    globalThis.window = { setTimeout() { return 1; }, clearTimeout() {} };
    const buttons = Object.fromEntries([
        "compare-unreal", "compare-landsnap", "reset-comparison", "snap-selected",
        "clean-scene", "reset-scene", "prepare-medium-coverage", "toggle-autosnap",
    ].map((command) => [command, new FakeButton(command)]));
    const operation = { textContent: "" };
    const outliner = { textContent: "" };
    const size = { value: "small", setAttribute() {}, addEventListener() {}, removeEventListener() {} };
    const layout = { value: "row", setAttribute() {}, addEventListener() {}, removeEventListener() {} };
    const elements = {
        "landsnap-showcase-stream-mount": { dataset: {}, setAttribute() {} },
        "landsnap-showcase-operation-status": operation,
        "landsnap-showcase-outliner-target": outliner,
        "landsnap-showcase-calibration-size": size,
        "landsnap-showcase-calibration-layout": layout,
        "landsnap-showcase-prepare-fixtures": buttons["prepare-medium-coverage"],
        "landsnap-showcase-toggle-autosnap": buttons["toggle-autosnap"],
    };
    let stateListener;
    let readyListener;
    let responseListener;
    const sent = [];
    const transport = {
        mount() {},
        emitUIInteraction(payload) { sent.push(payload); return true; },
        onConnectionState(listener) { stateListener = listener; },
        onSessionReady(listener) { readyListener = listener; },
        onResponse(listener) { responseListener = listener; },
    };
    const documentRef = {
        getElementById(id) { return elements[id] || null; },
        querySelectorAll() { return Object.values(buttons); },
    };
    const respond = (action, code, result = "success") => responseListener(JSON.stringify({
        version: SHOWCASE_PROTOCOL_VERSION,
        type: "operation-result",
        action,
        requestId: sent.at(-1).requestId,
        result,
        code,
    }));
    let surface;
    try {
        surface = attachShowcaseSurface(documentRef, transport, { brokerSession: {} });
        stateListener("connected");
        assert.equal(buttons["compare-unreal"].disabled, true, "connection alone does not prove fixtures are ready");
        readyListener();
        assert.equal(buttons["compare-unreal"].disabled, false);
        assert.equal(size.value, "medium");
        assert.equal(layout.value, "coverage");
        assert.equal(outliner.textContent, "All full-coverage objects selected");
        assert.match(operation.textContent, /Fresh full-coverage objects are selected/);

        buttons["compare-unreal"].click();
        assert.equal(sent.at(-1).action, "compare_unreal_snap");
        assert.equal(Object.hasOwn(sent.at(-1), "args"), false);
        respond("snap_selected", "completed");
        assert.equal(buttons["compare-unreal"].disabled, true, "a same-id response for another action cannot finish comparison");
        respond("compare_unreal_snap", "completed");
        assert.match(operation.textContent, /rotation is preserved/);
        assert.equal(buttons["compare-landsnap"].disabled, false);

        buttons["toggle-autosnap"].click();
        respond("toggle_autosnap", "autosnap_enabled");
        assert.equal(buttons["toggle-autosnap"].attributes.get("aria-pressed"), "true");
        buttons["compare-landsnap"].click();
        respond("compare_landsnap", "completed");
        assert.match(operation.textContent, /same starting transforms/);
        assert.equal(buttons["toggle-autosnap"].attributes.get("aria-pressed"), "false");

        for (const [command, action, code] of [
            ["clean-scene", "clean_scene", "scene_cleaned"],
            ["reset-scene", "reset_scene", "scene_reset"],
        ]) {
            buttons["toggle-autosnap"].click();
            respond("toggle_autosnap", "autosnap_enabled");
            buttons[command].click();
            respond(action, code);
            assert.equal(buttons["compare-unreal"].disabled, true);
            assert.equal(buttons["reset-comparison"].disabled, true);
            assert.equal(buttons["snap-selected"].disabled, false, "advanced controls remain available");
            assert.equal(buttons["toggle-autosnap"].attributes.get("aria-pressed"), action === "reset_scene" ? "false" : "true");
            assert.match(operation.textContent, /Prepare another example in Advanced controls/);
            const count = sent.length;
            buttons["compare-unreal"].click();
            assert.equal(sent.length, count, "disabled comparison cannot emit a request");
            buttons["prepare-medium-coverage"].click();
            respond("prepare_medium_coverage", "calibration_ready");
            assert.equal(buttons["compare-unreal"].disabled, false);
        }
        buttons["reset-comparison"].click();
        respond("reset_comparison", "comparison_reset");
        assert.equal(buttons["compare-unreal"].disabled, false, "reset retains the prepared example");
        assert.match(operation.textContent, /starting positions, rotation and scale/);
        buttons["compare-unreal"].click();
        respond("compare_unreal_snap", "comparison_unavailable", "rejected");
        assert.equal(buttons["compare-unreal"].disabled, true);
        assert.match(operation.textContent, /Advanced controls/);
    } finally {
        surface?.detach();
        if (priorWindow === undefined) delete globalThis.window;
        else globalThis.window = priorWindow;
        if (priorButton === undefined) delete globalThis.HTMLButtonElement;
        else globalThis.HTMLButtonElement = priorButton;
    }
});

test("surface waits for Start Demo, then keeps the mounted transport across a same-lease ready ticket refresh", async () => {
    const now = Date.now();
    const session = {
        url: "/api/landsnap-showcase/session/v1/player/showcase-player-ticket-001",
        token: "signed-session-ticket-for-showcase-0001",
        expiresAt: now + 90_000,
    };
    const windowRef = {
        self: null,
        top: null,
        parent: { postMessage() {} },
        location: { hostname: "showcase.ns-tx.com", origin: "https://showcase.ns-tx.com", protocol: "https:" },
        LandSnapShowcaseQueueLease: {
            status: "ready",
            leaseId: "ready-showcase-lease-1234",
            readyClaimExpiresAt: now + 90_000,
            session,
        },
        LandSnapShowcaseQueue: { recheck() {} },
        LandSnapShowcasePixelStreaming: null,
        addEventListener(type, listener) { this.listeners ??= new Map(); this.listeners.set(type, listener); },
        dispatchEvent() {},
    };
    windowRef.self = windowRef;
    windowRef.top = windowRef;

    const mount = {
        replaceChildren() {},
        setAttribute() {},
        dataset: {},
    };
    const connection = { querySelector() { return null; }, setAttribute() {}, textContent: "" };
    const operation = { textContent: "" };
    const control = {
        disabled: true,
        dataset: { command: "snap-selected" },
        setAttribute() {},
        addEventListener() {},
        removeEventListener() {},
    };
    const expander = { open: true, addEventListener() {}, removeEventListener() {} };
    const documentRef = {
        getElementById(id) {
            return {
                "landsnap-showcase-stream-mount": mount,
                "landsnap-showcase-connection-state": connection,
                "landsnap-showcase-operation-status": operation,
            }[id] || null;
        },
        querySelector(selector) { return selector === "[data-landsnap-showcase-expander]" ? expander : null; },
        querySelectorAll() { return [control]; },
    };
    let mounts = 0;
    let disconnects = 0;
    const transport = {
        mount() { mounts += 1; },
        emitUIInteraction() { return false; },
        onConnectionState(listener) { listener("connected"); },
        onResponse() {},
        onSessionReady() {},
        disconnect() { disconnects += 1; },
    };
    windowRef.LandSnapShowcasePixelStreaming = transport;

    initializeShowcaseSurface(documentRef, windowRef);
    await Promise.resolve();
    assert.equal(mounts, 0, "a ready lease alone must not mount the transport");
    windowRef.listeners.get(SHOWCASE_START_REQUEST_EVENT)();
    await Promise.resolve();
    assert.equal(mounts, 1, "Start Demo mounts the authorized transport exactly once");
    windowRef.LandSnapShowcaseQueueLease = {
        ...windowRef.LandSnapShowcaseQueueLease,
        session: { ...session, token: "signed-session-ticket-for-showcase-0002" },
    };
    windowRef.listeners.get("landsnap-showcase-lease-change")();
    await Promise.resolve();

    assert.equal(mounts, 1);
    assert.equal(disconnects, 0);

    let replacementMounts = 0;
    const replacementTransport = {
        mount() { replacementMounts += 1; },
        emitUIInteraction() { return false; },
        onConnectionState(listener) { listener("connected"); },
        onResponse() {},
        onSessionReady() {},
        disconnect() {},
    };
    windowRef.LandSnapShowcasePixelStreaming = replacementTransport;
    windowRef.LandSnapShowcaseQueueLease = {
        ...windowRef.LandSnapShowcaseQueueLease,
        session: {
            ...session,
            url: "/api/landsnap-showcase/session/v1/player/showcase-player-ticket-002",
            token: "signed-session-ticket-for-showcase-0003",
        },
    };
    windowRef.listeners.get("landsnap-showcase-lease-change")();
    await Promise.resolve();
    assert.equal(disconnects, 1, "a changed player URL must retire the old transport");
    assert.equal(replacementMounts, 0, "a changed player URL must wait for a new Start Demo click");
    windowRef.listeners.get(SHOWCASE_START_REQUEST_EVENT)();
    await Promise.resolve();
    assert.equal(replacementMounts, 1, "Start Demo may attach the newly authorized transport");

    mounts = 0;
    disconnects = 0;
    const loopbackWindowRef = {
        ...windowRef,
        location: { hostname: "127.0.0.1", origin: "http://127.0.0.1:4173", protocol: "http:" },
        LandSnapShowcasePixelStreaming: transport,
        listeners: new Map(),
        addEventListener(type, listener) { this.listeners.set(type, listener); },
    };
    loopbackWindowRef.self = loopbackWindowRef;
    loopbackWindowRef.top = loopbackWindowRef;

    initializeShowcaseSurface(documentRef, loopbackWindowRef);
    assert.equal(mounts, 0, "the loopback ready lease also waits for Start Demo");
    assert.doesNotThrow(() => loopbackWindowRef.listeners.get(SHOWCASE_START_REQUEST_EVENT)());
    await Promise.resolve();
    assert.equal(mounts, 1, "loopback Start Demo mounts without requiring a broker session URL");
    loopbackWindowRef.listeners.get("landsnap-showcase-lease-change")();
    assert.equal(mounts, 1, "the same loopback lease does not remount after authorization");
});
