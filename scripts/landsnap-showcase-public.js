/*
 * Installs the dedicated-host Pixel Streaming transport only after a valid
 * broker lease arrives. Public product pages never import the frontend.
 */
import { isPublicShowcaseHost } from "./landsnap-showcase-queue.js?v=20260923-warm-editor-lifecycle";

const SESSION_URL_PATTERN = /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{24,512}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const isTransport = (value) => value
    && typeof value.mount === "function"
    && typeof value.emitUIInteraction === "function"
    && typeof value.onConnectionState === "function"
    && typeof value.onResponse === "function"
    && typeof value.onSessionReady === "function";

export const hasReadyPublicShowcaseLease = (lease, now = Date.now()) => lease
    && lease.status === "ready"
    && typeof lease.leaseId === "string"
    && OPAQUE_ID_PATTERN.test(lease.leaseId)
    && Number.isSafeInteger(lease.readyClaimExpiresAt)
    && lease.readyClaimExpiresAt > now
    && lease.session
    && typeof lease.session.url === "string"
    && SESSION_URL_PATTERN.test(lease.session.url)
    && typeof lease.session.token === "string"
    && SESSION_TOKEN_PATTERN.test(lease.session.token)
    && Number.isSafeInteger(lease.session.expiresAt)
    && lease.session.expiresAt > now;

export const hasActivePublicShowcaseLease = (lease, now = Date.now()) => lease
    && lease.status === "active"
    && typeof lease.leaseId === "string"
    && OPAQUE_ID_PATTERN.test(lease.leaseId)
    && Number.isSafeInteger(lease.sessionExpiresAt)
    && lease.sessionExpiresAt > now;

const dispatchReady = (windowRef, transport) => {
    windowRef.dispatchEvent(new windowRef.CustomEvent("landsnap-showcase-transport-ready", {
        detail: transport,
    }));
};

/**
 * The public frontend is code-split and loaded only for one broker-issued
 * session on the fixed dedicated host. It never consumes a visitor endpoint.
 */
export const installPublicShowcaseBootstrap = async (
    windowRef = globalThis.window,
    loadTransport = () => import("./vendor/landsnap-showcase-ps2-public.js")
        .then(({ createPublicShowcaseTransport }) => createPublicShowcaseTransport()),
) => {
    if (!windowRef || !isPublicShowcaseHost(windowRef.location?.hostname) || windowRef.location?.protocol !== "https:") {
        return null;
    }

    let activeKey = null;
    let activeLeaseId = null;
    let activeSessionUrl = null;
    let activeTransport = null;
    let loading = null;

    const clearActive = () => {
        if (activeTransport && typeof activeTransport.disconnect === "function") activeTransport.disconnect();
        if (windowRef.LandSnapShowcasePixelStreaming === activeTransport) {
            delete windowRef.LandSnapShowcasePixelStreaming;
        }
        activeKey = null;
        activeLeaseId = null;
        activeSessionUrl = null;
        activeTransport = null;
    };
    const installForLease = async () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (hasActivePublicShowcaseLease(lease)
            && activeLeaseId === lease.leaseId
            && isTransport(activeTransport)) return activeTransport;
        if (!hasReadyPublicShowcaseLease(lease)) {
            clearActive();
            return null;
        }
        const key = `${lease.leaseId}:${lease.session.url}:${lease.session.token}`;
        // A ready heartbeat may refresh the short-lived ticket while the same
        // lease is already mounted. The ticket authorized the existing relay;
        // rotating it must not tear down that transport mid-stream.
        if (activeLeaseId === lease.leaseId
            && activeSessionUrl === lease.session.url
            && isTransport(activeTransport)) return activeTransport;
        if (activeKey === key && isTransport(activeTransport)) return activeTransport;
        if (loading?.key === key) return loading.promise;

        clearActive();
        const promise = Promise.resolve(loadTransport()).then((transport) => {
            if (!isTransport(transport)) throw new TypeError("The dedicated Showcase transport is unavailable.");
            if (!hasReadyPublicShowcaseLease(windowRef.LandSnapShowcaseQueueLease)) {
                if (typeof transport.disconnect === "function") transport.disconnect();
                return null;
            }
            activeKey = key;
            activeLeaseId = lease.leaseId;
            activeSessionUrl = lease.session.url;
            activeTransport = transport;
            windowRef.LandSnapShowcasePixelStreaming = transport;
            dispatchReady(windowRef, transport);
            return transport;
        }).finally(() => {
            if (loading?.key === key) loading = null;
        });
        loading = { key, promise };
        return promise;
    };

    windowRef.addEventListener("landsnap-showcase-lease-change", () => { void installForLease(); });
    return installForLease();
};

if (typeof window !== "undefined") {
    void installPublicShowcaseBootstrap().catch(() => undefined);
}
