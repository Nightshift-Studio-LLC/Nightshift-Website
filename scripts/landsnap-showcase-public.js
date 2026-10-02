/*
 * Installs the dedicated-host Pixel Streaming transport only after a valid
 * broker lease arrives. Public product pages never import the frontend.
 */
import {
    SHOWCASE_START_REQUEST_EVENT,
    isPublicShowcaseHost,
} from "./landsnap-showcase-queue.js?v=20260930-session-recovery-v1";

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
    loadTransport = () => import("./vendor/landsnap-showcase-ps2-public.js?v=20260930-session-recovery-v1")
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
    let launchIdentity = null;
    let transportFailed = false;

    const clearActive = () => {
        const previousTransport = activeTransport;
        if (windowRef.LandSnapShowcasePixelStreaming === activeTransport) {
            delete windowRef.LandSnapShowcasePixelStreaming;
        }
        activeKey = null;
        activeLeaseId = null;
        activeSessionUrl = null;
        activeTransport = null;
        transportFailed = false;
        if (previousTransport && typeof previousTransport.disconnect === "function") previousTransport.disconnect();
    };
    const installForLease = async () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (hasActivePublicShowcaseLease(lease)
            && activeLeaseId === lease.leaseId
            && isTransport(activeTransport)) return activeTransport;
        if (!hasReadyPublicShowcaseLease(lease)) {
            if (!hasActivePublicShowcaseLease(lease)) launchIdentity = null;
            loading = null;
            clearActive();
            return null;
        }
        const identity = `${lease.leaseId}:${lease.session.url}`;
        if (launchIdentity !== identity) {
            loading = null;
            clearActive();
            return null;
        }
        const key = `${lease.leaseId}:${lease.session.url}:${lease.session.token}`;
        // A ready heartbeat may refresh the short-lived ticket while the same
        // lease is already mounted. The ticket authorized the existing relay;
        // rotating it must not tear down that transport mid-stream.
        if (activeLeaseId === lease.leaseId
            && activeSessionUrl === lease.session.url
            && isTransport(activeTransport)
            && (!transportFailed || activeKey === key)) {
            if (!transportFailed) activeTransport.updateReadyLease?.(lease);
            return activeTransport;
        }
        if (activeKey === key && isTransport(activeTransport)) return activeTransport;
        if (loading?.identity === identity) return loading.promise;

        clearActive();
        const promise = Promise.resolve(loadTransport()).then((transport) => {
            if (!isTransport(transport)) throw new TypeError("The dedicated Showcase transport is unavailable.");
            const currentLease = windowRef.LandSnapShowcaseQueueLease;
            if (!hasReadyPublicShowcaseLease(currentLease)
                || loading?.promise !== promise
                || launchIdentity !== identity
                || currentLease.leaseId !== lease.leaseId
                || currentLease.session.url !== lease.session.url) {
                if (typeof transport.disconnect === "function") transport.disconnect();
                return null;
            }
            activeKey = `${currentLease.leaseId}:${currentLease.session.url}:${currentLease.session.token}`;
            activeLeaseId = lease.leaseId;
            activeSessionUrl = lease.session.url;
            activeTransport = transport;
            transportFailed = false;
            transport.updateReadyLease?.(currentLease);
            let connectionAttempted = false;
            transport.onConnectionState((state) => {
                if (activeTransport !== transport) return;
                if (state === "connecting" || state === "connected") {
                    connectionAttempted = true;
                    transportFailed = false;
                } else if (connectionAttempted && (state === "disconnected" || state === "error")) {
                    // No SDK auto-reconnect or replay of a consumed ticket.
                    // A subsequent broker-issued ready ticket may replace it.
                    transportFailed = true;
                }
            });
            windowRef.LandSnapShowcasePixelStreaming = transport;
            dispatchReady(windowRef, transport);
            return transport;
        }).finally(() => {
            if (loading?.promise === promise) loading = null;
        });
        loading = { identity, promise };
        return promise;
    };

    const requestStart = () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        if (!hasReadyPublicShowcaseLease(lease)) return;
        launchIdentity = `${lease.leaseId}:${lease.session.url}`;
        void installForLease();
    };
    windowRef.addEventListener(SHOWCASE_START_REQUEST_EVENT, requestStart);
    windowRef.addEventListener("landsnap-showcase-lease-change", () => { void installForLease(); });
    return installForLease();
};

if (typeof window !== "undefined") {
    void installPublicShowcaseBootstrap().catch(() => undefined);
}
