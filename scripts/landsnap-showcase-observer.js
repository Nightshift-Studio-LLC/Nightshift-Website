/*
 * Optional queued observer for the LandSnap Showcase.
 *
 * This is deliberately separate from the presenter lease and transport. The
 * observer ticket is one-use, is claimed into a path-scoped cookie, and only
 * receives a read-only signalling transport. Closing it must never release or
 * otherwise mutate the presenter's queue lease.
 *
 * The feature is capability gated and disabled by default until the server
 * advertises the observer contract. Do not turn this on with a query string:
 * capability comes from deployment code so an untrusted URL cannot expose a
 * half-configured waiting-room control.
 */

import { isPublicShowcaseHost } from "./landsnap-showcase-queue.js?v=20260923-warm-editor-lifecycle";

export const OBSERVER_PROTOCOL_VERSION = "landsnap-showcase-observer-v1";
export const OBSERVER_SESSION_PATH = "/api/landsnap-showcase/observer/v1/session";
export const OBSERVER_SESSION_URL_PATTERN = /^\/api\/landsnap-showcase\/session\/v1\/observer\/[A-Za-z0-9_-]{16,128}$/;
export const OBSERVER_FEATURE_FLAG = "observer";
export const OBSERVER_INPUT_POLICY = Object.freeze({
    gamepad: false,
    keyboard: false,
    mouse: false,
    touch: false,
    xr: false,
});

const SESSION_KEYS = Object.freeze(["sessionToken", "sessionTokenExpiresAt", "sessionUrl", "status"]);
const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{24,512}$/;
const MAX_TICKET_LIFETIME_MS = 30 * 1000;

const isPlainRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (record, expected) => {
    const keys = Object.keys(record).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};

const isSafeFutureTimestamp = (value, now) => Number.isSafeInteger(value)
    && value > now
    && value <= now + MAX_TICKET_LIFETIME_MS;

export const isObserverSessionUrl = (value, locationRef = globalThis.location) => {
    if (typeof value !== "string" || !OBSERVER_SESSION_URL_PATTERN.test(value)) return false;
    if (typeof locationRef?.origin !== "string") return false;
    try {
        const endpoint = new URL(value, locationRef.origin);
        return endpoint.origin === locationRef.origin
            && endpoint.pathname === value
            && endpoint.search === ""
            && endpoint.hash === "";
    } catch {
        return false;
    }
};

/** Parse only the currently agreed success shape; error bodies stay opaque. */
export const parseObserverTicket = (raw, {
    now = Date.now(),
    locationRef = globalThis.location,
} = {}) => {
    if (!isPlainRecord(raw)
        || !hasExactKeys(raw, SESSION_KEYS)
        || raw.status !== "ready"
        || !isObserverSessionUrl(raw.sessionUrl, locationRef)
        || typeof raw.sessionToken !== "string"
        || !TOKEN_PATTERN.test(raw.sessionToken)
        || !isSafeFutureTimestamp(raw.sessionTokenExpiresAt, now)) return null;

    return Object.freeze({
        status: "ready",
        sessionUrl: raw.sessionUrl,
        sessionToken: raw.sessionToken,
        sessionTokenExpiresAt: raw.sessionTokenExpiresAt,
    });
};

export const createObserverSignallingUrl = (ticket, locationRef = globalThis.location, now = Date.now()) => {
    const parsed = parseObserverTicket(ticket, { locationRef, now });
    if (!parsed) throw new TypeError("The Showcase observer ticket is unavailable.");
    const endpoint = new URL(parsed.sessionUrl, locationRef.origin);
    endpoint.protocol = "wss:";
    return endpoint.toString();
};

export const isObserverCapabilityEnabled = (windowRef = globalThis.window) =>
    windowRef?.LandSnapShowcaseCapabilities?.[OBSERVER_FEATURE_FLAG] === true;

export const createObserverServiceClient = ({
    fetchImpl = globalThis.fetch,
    locationRef = globalThis.location,
    now = Date.now,
} = {}) => {
    const serviceUrl = isPublicShowcaseHost(locationRef?.hostname)
        && locationRef?.protocol === "https:"
        && typeof locationRef?.origin === "string"
        ? new URL(OBSERVER_SESSION_PATH, locationRef.origin).toString()
        : null;

    return Object.freeze({
        async requestTicket() {
            if (!serviceUrl || typeof fetchImpl !== "function") {
                throw new TypeError("Showcase observer service is unavailable.");
            }
            const response = await fetchImpl(serviceUrl, {
                method: "POST",
                mode: "same-origin",
                credentials: "include",
                cache: "no-store",
                headers: Object.freeze({
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    protocol: OBSERVER_PROTOCOL_VERSION,
                    operation: "watch",
                }),
            });
            if (!response || !response.ok) {
                throw new TypeError("Showcase observer request was not granted.");
            }
            const ticket = parseObserverTicket(await response.json(), { locationRef, now: now() });
            if (!ticket) throw new TypeError("Showcase observer returned an invalid ticket.");
            return ticket;
        },
        async claim(ticket, now = Date.now) {
            const parsed = parseObserverTicket(ticket, { now: now(), locationRef });
            if (!parsed || typeof fetchImpl !== "function") {
                throw new TypeError("Showcase observer ticket is invalid or expired.");
            }
            const response = await fetchImpl(parsed.sessionUrl, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                redirect: "error",
                headers: Object.freeze({
                    Authorization: `Bearer ${parsed.sessionToken}`,
                    Accept: "application/json",
                }),
            });
            if (!response || response.status !== 204) {
                throw new TypeError("Showcase observer ticket was rejected.");
            }
            return Object.freeze({
                ...parsed,
                signallingUrl: createObserverSignallingUrl(parsed, locationRef, now()),
            });
        },
    });
};

/**
 * Coordinates ticket claim and the injected read-only PS2 adapter. The
 * adapter owns the WebRTC details; this boundary prevents input flags or a
 * presenter transport from being accidentally reused for observers.
 */
export const createObserverController = ({
    service,
    transportFactory,
    now = Date.now,
    onState = () => {},
    onPromote = () => {},
} = {}) => {
    if (!service || typeof service.requestTicket !== "function" || typeof service.claim !== "function") {
        throw new TypeError("A Showcase observer service is required.");
    }

    let state = "idle";
    let transport = null;
    let ticket = null;
    let stopped = false;
    let generation = 0;

    const publish = (next) => {
        state = next;
        onState(next);
        return state;
    };

    const stop = () => {
        stopped = true;
        generation += 1;
        if (transport && typeof transport.disconnect === "function") transport.disconnect();
        transport = null;
        ticket = null;
        publish("idle");
        return state;
    };

    const start = async (mountElement) => {
        if (state !== "idle" || !mountElement || typeof transportFactory !== "function") {
            throw new TypeError("Showcase observer transport is unavailable.");
        }
        stopped = false;
        const currentGeneration = ++generation;
        publish("requesting");
        try {
            const requested = await service.requestTicket();
            if (stopped || generation !== currentGeneration) return state;
            publish("claiming");
            const claimed = await service.claim(requested, now);
            if (stopped || generation !== currentGeneration) return state;
            ticket = claimed;
            const createdTransport = await transportFactory({
                input: OBSERVER_INPUT_POLICY,
                mountElement,
                session: claimed,
                signallingUrl: claimed.signallingUrl,
            });
            if (stopped || generation !== currentGeneration) {
                if (createdTransport && typeof createdTransport.disconnect === "function") createdTransport.disconnect();
                return state;
            }
            transport = createdTransport;
            if (!transport || typeof transport.mount !== "function") {
                throw new TypeError("Showcase observer transport is unavailable.");
            }
            publish("connecting");
            await transport.mount(mountElement, {
                input: OBSERVER_INPUT_POLICY,
                session: ticket,
            });
            if (stopped || generation !== currentGeneration) return state;
            publish("watching");
            return state;
        } catch (error) {
            if (!stopped && generation === currentGeneration) {
                if (transport && typeof transport.disconnect === "function") transport.disconnect();
                transport = null;
                ticket = null;
                publish("error");
            }
            throw error;
        }
    };

    const promote = () => {
        if (!["watching", "connecting", "claiming", "requesting"].includes(state)) return false;
        stop();
        onPromote();
        return true;
    };

    return Object.freeze({
        getState: () => state,
        start,
        stop,
        promote,
    });
};

/**
 * Keep the observer SDK out of the initial page load. The transport bundle is
 * fetched only after a visitor explicitly chooses the read-only watch action.
 */
export const createLazyObserverTransportFactory = () => async () => {
    const { createObserverShowcaseTransport } = await import("./vendor/landsnap-showcase-ps2-observer.js?v=20260925-observer-transport");
    return createObserverShowcaseTransport();
};

const installObserverSurface = (
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    {
        service = createObserverServiceClient({ locationRef: windowRef?.location }),
        transportFactory = windowRef?.LandSnapShowcaseObserverTransportFactory
            || createLazyObserverTransportFactory(),
    } = {},
) => {
    if (!documentRef
        || !windowRef
        || !isObserverCapabilityEnabled(windowRef)
        || typeof transportFactory !== "function") return null;
    const section = documentRef.getElementById("landsnap-showcase-observer");
    const action = documentRef.getElementById("landsnap-showcase-observer-action");
    const mount = documentRef.getElementById("landsnap-showcase-observer-mount");
    const player = documentRef.getElementById("landsnap-showcase-observer-player");
    const status = documentRef.getElementById("landsnap-showcase-observer-status");
    if (!section || !action || !mount || !player || !status || typeof action.addEventListener !== "function") return null;
    action.dataset.observerCapability = "available";
    mount.dataset.observerCapability = "available";

    const controller = createObserverController({ service, transportFactory,
        onState: (next) => {
            action.disabled = !["idle", "error"].includes(next);
            action.setAttribute("aria-disabled", String(action.disabled));
            mount.dataset.observerState = next;
            mount.setAttribute("aria-busy", String(["requesting", "claiming", "connecting"].includes(next)));
            status.textContent = next === "watching"
                ? "Watching the active demo in read-only mode."
                : next === "error"
                    ? "Read-only viewing is unavailable right now."
                    : next === "connecting"
                        ? "Connecting to the active demo in read-only mode."
                : "Waiting for a live session.";
        },
        onPromote: () => { void windowRef.LandSnapShowcaseQueue?.recheck?.(); },
    });
    const sync = () => {
        const lease = windowRef.LandSnapShowcaseQueueLease;
        const waiting = lease?.status === "waiting" || lease?.status === "starting";
        section.hidden = !waiting;
        if (controller.getState() === "idle" || controller.getState() === "error") {
            action.disabled = !waiting;
            action.setAttribute("aria-disabled", String(action.disabled));
        }
        if (!waiting && controller.getState() !== "idle") controller.stop();
    };
    const handlePromotion = () => { controller.promote(); };
    action.addEventListener("click", () => {
        if (controller.getState() === "error") controller.stop();
        if (controller.getState() !== "idle") return;
        void controller.start(player).catch(() => undefined);
    });
    windowRef.addEventListener("landsnap-showcase-lease-change", sync);
    windowRef.addEventListener("landsnap-showcase-observer-promoted", handlePromotion);
    sync();
    return Object.freeze({ controller, sync, destroy() {
        windowRef.removeEventListener("landsnap-showcase-lease-change", sync);
        windowRef.removeEventListener("landsnap-showcase-observer-promoted", handlePromotion);
        controller.stop();
    } });
};

export { installObserverSurface };

if (typeof window !== "undefined" && typeof document !== "undefined") {
    installObserverSurface(document, window);
}
