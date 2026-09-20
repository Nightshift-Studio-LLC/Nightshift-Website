import assert from "node:assert/strict";
import test from "node:test";
import {
    installPublicShowcaseAdapterBootstrap,
    installPublicShowcaseTransport,
} from "../scripts/landsnap-showcase-public-adapter.js";

const now = Date.now();
const readyLease = () => ({
    status: "ready",
    leaseId: "showcase-public-lease-0001",
    expiresAt: now + 120_000,
    session: {
        url: "/api/landsnap-showcase/session/v1/player/showcase-public-player-0001",
        token: "showcase-public-ticket-with-enough-length-0001",
        expiresAt: now + 90_000,
    },
});

const createWindow = (hostname = "ns-tx.com") => {
    const listeners = new Map();
    return {
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
        location: { hostname },
        addEventListener(type, listener) { listeners.set(type, listener); },
        removeEventListener(type) { listeners.delete(type); },
        dispatchEvent(event) { listeners.get(event.type)?.(event); },
        listeners,
    };
};

const transport = () => ({
    disconnect() { this.disconnected = true; },
    emitUIInteraction() { return true; },
    mount() {},
    onConnectionState() {},
    onResponse() {},
    onSessionReady() {},
});

test("the public adapter cannot install before an exact ready lease", async () => {
    const windowRef = createWindow();
    let factoryCalls = 0;
    windowRef.LandSnapShowcaseCreatePublicTransport = async () => { factoryCalls += 1; return transport(); };
    const result = await installPublicShowcaseTransport(windowRef, { status: "starting" });
    assert.equal(result, null);
    assert.equal(factoryCalls, 0);
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, undefined);
});

test("the public adapter passes only the broker session and fixed mouse input after ready", async () => {
    const windowRef = createWindow();
    const lease = readyLease();
    windowRef.LandSnapShowcaseQueueLease = lease;
    let received;
    windowRef.LandSnapShowcaseCreatePublicTransport = async (options) => { received = options; return transport(); };
    const result = await installPublicShowcaseTransport(windowRef, lease);
    assert.equal(result, windowRef.LandSnapShowcasePixelStreaming);
    assert.deepEqual(received.input, { mouse: true, keyboard: false, touch: false, gamepad: false, xr: false });
    assert.deepEqual(received.session, lease.session);
});

test("a stale asynchronous factory result is disconnected instead of becoming a transport", async () => {
    const windowRef = createWindow();
    const lease = readyLease();
    windowRef.LandSnapShowcaseQueueLease = lease;
    let resolveFactory;
    const created = transport();
    windowRef.LandSnapShowcaseCreatePublicTransport = () => new Promise((resolve) => { resolveFactory = resolve; });
    const pending = installPublicShowcaseTransport(windowRef, lease);
    windowRef.LandSnapShowcaseQueueLease = { status: "unavailable" };
    resolveFactory(created);
    assert.equal(await pending, null);
    assert.equal(created.disconnected, true);
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, undefined);
});

test("the asynchronous factory guard rejects a heartbeat-rotated session token", async () => {
    const windowRef = createWindow();
    const lease = readyLease();
    windowRef.LandSnapShowcaseQueueLease = lease;
    let resolveFactory;
    const created = transport();
    windowRef.LandSnapShowcaseCreatePublicTransport = () => new Promise((resolve) => { resolveFactory = resolve; });
    const pending = installPublicShowcaseTransport(windowRef, lease);
    windowRef.LandSnapShowcaseQueueLease = {
        ...lease,
        session: {
            ...lease.session,
            token: "showcase-public-rotated-ticket-0002",
            expiresAt: lease.session.expiresAt + 10_000,
        },
    };
    resolveFactory(created);
    assert.equal(await pending, null);
    assert.equal(created.disconnected, true);
    assert.equal(windowRef.LandSnapShowcasePixelStreaming, undefined);
});

test("the bootstrap only listens on the approved public hosts", () => {
    const loopback = createWindow("127.0.0.1");
    assert.equal(installPublicShowcaseAdapterBootstrap(loopback), null);
    assert.equal(loopback.listeners.size, 0);
    const publicWindow = createWindow();
    const binding = installPublicShowcaseAdapterBootstrap(publicWindow);
    assert.equal(typeof binding.detach, "function");
    assert.equal(publicWindow.listeners.has("landsnap-showcase-lease-change"), true);
    binding.detach();
    assert.equal(publicWindow.listeners.has("landsnap-showcase-lease-change"), false);
});
