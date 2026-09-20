/*
 * Public Showcase transport installer.
 *
 * This module is safe to include in the static page because it installs no
 * transport at module load. A deployment-owned factory must be present, and a
 * current broker lease must already be valid, before the Pixel Streaming
 * surface exists on window.
 */

import { isPublicShowcaseHost, isReadyQueueLease } from "./landsnap-showcase-queue.js";

const MOUSE_ONLY_INPUT = Object.freeze({ mouse: true, keyboard: false, touch: false, gamepad: false, xr: false });

const isTransport = (value) => value
    && typeof value.mount === "function"
    && typeof value.emitUIInteraction === "function"
    && typeof value.onConnectionState === "function"
    && typeof value.onSessionReady === "function"
    && typeof value.onResponse === "function"
    && typeof value.disconnect === "function";

const sessionKey = (lease) => `${lease.session.url}\u0000${lease.session.token}\u0000${lease.session.expiresAt}`;

export const installPublicShowcaseTransport = async (windowRef = globalThis.window, lease = windowRef?.LandSnapShowcaseQueueLease) => {
    if (!windowRef || !isPublicShowcaseHost(windowRef.location?.hostname) || !isReadyQueueLease(lease)) return null;
    if (isTransport(windowRef.LandSnapShowcasePixelStreaming)) return windowRef.LandSnapShowcasePixelStreaming;
    const factory = windowRef.LandSnapShowcaseCreatePublicTransport;
    if (typeof factory !== "function") return null;

    const key = sessionKey(lease);
    const transport = await factory(Object.freeze({
        input: MOUSE_ONLY_INPUT,
        session: Object.freeze({ ...lease.session }),
    }));
    const current = windowRef.LandSnapShowcaseQueueLease;
    if (!isTransport(transport) || !isReadyQueueLease(current) || sessionKey(current) !== key) {
        if (transport && typeof transport.disconnect === "function") transport.disconnect();
        return null;
    }

    windowRef.LandSnapShowcasePixelStreaming = transport;
    windowRef.dispatchEvent(new windowRef.CustomEvent("landsnap-showcase-transport-ready", { detail: transport }));
    return transport;
};

export const installPublicShowcaseAdapterBootstrap = (windowRef = globalThis.window) => {
    if (!windowRef || !isPublicShowcaseHost(windowRef.location?.hostname)) return null;
    const receiveLease = (event) => {
        void installPublicShowcaseTransport(windowRef, event?.detail).catch(() => undefined);
    };
    windowRef.addEventListener("landsnap-showcase-lease-change", receiveLease);
    void installPublicShowcaseTransport(windowRef).catch(() => undefined);
    return Object.freeze({ detach: () => windowRef.removeEventListener("landsnap-showcase-lease-change", receiveLease) });
};

if (typeof window !== "undefined") installPublicShowcaseAdapterBootstrap(window);
