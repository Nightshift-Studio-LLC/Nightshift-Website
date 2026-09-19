/*
 * Fixed, deployment-owned admission gate for the LandSnap Showcase.
 *
 * This module intentionally has no endpoint, streamer, or credential inputs.
 * The queue service uses a same-origin secure HttpOnly cookie to identify a
 * browser session; it never trusts a visitor-supplied session identifier.
 */

export const SHOWCASE_QUEUE_PROTOCOL_VERSION = "landsnap-showcase-queue-v1";
export const SHOWCASE_LEASE_DURATION_MS = 5 * 60 * 1000;
export const SHOWCASE_QUEUE_PATH = "/api/landsnap-showcase/queue/v1/lease";
export const SHOWCASE_QUEUE_EVENTS_PATH = "/api/landsnap-showcase/queue/v1/events";

const PUBLIC_SHOWCASE_HOSTS = new Set(["ns-tx.com", "www.ns-tx.com"]);
const LOCAL_SHOWCASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const RESPONSE_KEYS = Object.freeze({
    active: Object.freeze(["expiresAt", "heartbeatAfterMs", "leaseId", "protocol", "status"]),
    waiting: Object.freeze(["activeLeaseExpiresAt", "pollAfterMs", "position", "protocol", "status"]),
});
const MIN_POLL_MS = 1_000;
const MAX_POLL_MS = 5_000;
const MIN_HEARTBEAT_MS = 5_000;
const MAX_HEARTBEAT_MS = 60_000;
const QUEUE_OPERATIONS = new Set(["join", "heartbeat", "leave"]);

const own = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
const isPlainRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
const hasExactKeys = (record, expected) => {
    const keys = Object.keys(record).sort();
    return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};
const isSafeTimestamp = (value) => Number.isSafeInteger(value) && value > 0;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

export const isLocalShowcaseHost = (hostname) =>
    typeof hostname === "string" && LOCAL_SHOWCASE_HOSTS.has(hostname.toLowerCase());

export const isPublicShowcaseHost = (hostname) =>
    typeof hostname === "string" && PUBLIC_SHOWCASE_HOSTS.has(hostname.toLowerCase());

export const parseQueueLease = (raw, now = Date.now()) => {
    if (!isPlainRecord(raw) || raw.protocol !== SHOWCASE_QUEUE_PROTOCOL_VERSION) return null;

    if (raw.status === "active") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.active)
            || typeof raw.leaseId !== "string"
            || !/^[A-Za-z0-9_-]{16,128}$/.test(raw.leaseId)
            || !isSafeTimestamp(raw.expiresAt)
            || !Number.isSafeInteger(raw.heartbeatAfterMs)) return null;

        const expiresAt = Math.min(raw.expiresAt, now + SHOWCASE_LEASE_DURATION_MS);
        if (expiresAt <= now) return null;
        return Object.freeze({
            status: "active",
            leaseId: raw.leaseId,
            expiresAt,
            heartbeatAfterMs: clamp(raw.heartbeatAfterMs, MIN_HEARTBEAT_MS, MAX_HEARTBEAT_MS),
        });
    }

    if (raw.status === "waiting") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.waiting)
            || !Number.isSafeInteger(raw.position)
            || raw.position < 1
            || raw.position > 100
            || !isSafeTimestamp(raw.activeLeaseExpiresAt)
            || !Number.isSafeInteger(raw.pollAfterMs)) return null;

        return Object.freeze({
            status: "waiting",
            position: raw.position,
            activeLeaseExpiresAt: Math.max(raw.activeLeaseExpiresAt, now),
            pollAfterMs: clamp(raw.pollAfterMs, MIN_POLL_MS, MAX_POLL_MS),
        });
    }

    return null;
};

export const isActiveQueueLease = (lease, now = Date.now()) =>
    isPlainRecord(lease)
    && lease.status === "active"
    && typeof lease.leaseId === "string"
    && isSafeTimestamp(lease.expiresAt)
    && lease.expiresAt > now;

/**
 * Position one is the next visitor after the current active lease, so it has
 * no queued visitors ahead of it. The estimate is exactly the active time
 * remaining plus one five-minute lease for every queued visitor ahead.
 */
export const calculateQueueWaitMs = (lease, now = Date.now()) => {
    if (!lease || lease.status !== "waiting") return 0;
    const activeRemaining = Math.max(0, lease.activeLeaseExpiresAt - now);
    return activeRemaining + SHOWCASE_LEASE_DURATION_MS * Math.max(0, lease.position - 1);
};

export const formatQueueCountdown = (milliseconds) => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "00:00";
    const seconds = Math.ceil(milliseconds / 1_000);
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const createRequestPayload = (operation) => {
    if (!QUEUE_OPERATIONS.has(operation)) throw new TypeError("Unknown Showcase queue operation.");
    return Object.freeze({
        protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
        operation,
    });
};

export const createQueueServiceClient = ({
    fetchImpl = globalThis.fetch,
    eventSourceFactory = typeof EventSource === "function" ? (url) => new EventSource(url, { withCredentials: true }) : null,
    locationRef = globalThis.location,
} = {}) => {
    const hostname = locationRef?.hostname;
    const serviceUrl = isPublicShowcaseHost(hostname)
        ? new URL(SHOWCASE_QUEUE_PATH, locationRef.origin).toString()
        : null;
    const eventsUrl = isPublicShowcaseHost(hostname)
        ? new URL(SHOWCASE_QUEUE_EVENTS_PATH, locationRef.origin).toString()
        : null;

    return Object.freeze({
        async request(operation) {
            if (!serviceUrl || typeof fetchImpl !== "function") throw new TypeError("Showcase queue service is unavailable.");
            const response = await fetchImpl(serviceUrl, {
                method: "POST",
                mode: "same-origin",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(createRequestPayload(operation)),
            });
            if (!response || !response.ok) throw new TypeError("Showcase queue service rejected the lease request.");
            return response.json();
        },
        subscribe(onMessage) {
            if (!eventsUrl || typeof eventSourceFactory !== "function") return null;
            const source = eventSourceFactory(eventsUrl);
            if (!source || typeof source !== "object") return null;
            source.onmessage = (event) => onMessage(event?.data);
            return source;
        },
        releaseWithBeacon(sendBeacon = globalThis.navigator?.sendBeacon) {
            if (!serviceUrl || typeof sendBeacon !== "function") return false;
            const body = new Blob([JSON.stringify(createRequestPayload("leave"))], { type: "application/json" });
            return sendBeacon(serviceUrl, body) === true;
        },
    });
};

/** Local-only deterministic fixture. It is not reachable from a public host. */
export const createLocalQueueFixture = ({ now = Date.now } = {}) => Object.freeze({
    async request(operation) {
        if (operation === "leave") return Object.freeze({ released: true });
        return Object.freeze({
            protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
            status: "active",
            leaseId: "local-showcase-fixture-lease",
            expiresAt: now() + SHOWCASE_LEASE_DURATION_MS,
            heartbeatAfterMs: 15_000,
        });
    },
    subscribe() { return null; },
    releaseWithBeacon() { return true; },
});

export const createQueueLeaseController = ({
    service,
    now = Date.now,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
    onUpdate = () => {},
} = {}) => {
    if (!service || typeof service.request !== "function") throw new TypeError("A fixed Showcase queue service is required.");

    let lease = Object.freeze({ status: "unavailable" });
    let timer = null;
    let eventSource = null;
    let started = false;

    const publish = () => {
        onUpdate(lease);
        return lease;
    };
    const stopTimer = () => {
        if (timer !== null && typeof clearTimer === "function") clearTimer(timer);
        timer = null;
    };
    const schedule = (delay) => {
        stopTimer();
        if (!started || typeof setTimer !== "function") return;
        timer = setTimer(() => { void refresh(); }, delay);
    };
    const apply = (raw) => {
        const next = parseQueueLease(raw, now());
        if (!next) {
            lease = Object.freeze({ status: "unavailable" });
            publish();
            schedule(MAX_POLL_MS);
            return lease;
        }
        lease = next;
        publish();
        schedule(next.status === "active" ? next.heartbeatAfterMs : next.pollAfterMs);
        return lease;
    };
    const refresh = async () => {
        try {
            return apply(await service.request(lease.status === "active" ? "heartbeat" : "join"));
        } catch {
            lease = Object.freeze({ status: "unavailable" });
            publish();
            schedule(MAX_POLL_MS);
            return lease;
        }
    };
    const handleEvent = (raw) => {
        if (typeof raw !== "string" || raw.length > 1_024) return lease;
        try {
            return apply(JSON.parse(raw));
        } catch {
            return lease;
        }
    };

    return Object.freeze({
        async start() {
            if (started) return lease;
            started = true;
            if (typeof service.subscribe === "function") {
                try {
                    eventSource = service.subscribe(handleEvent);
                } catch {
                    eventSource = null;
                }
            }
            return refresh();
        },
        tick() {
            if (lease.status === "active" && !isActiveQueueLease(lease, now())) {
                lease = Object.freeze({ status: "unavailable" });
                publish();
                schedule(MIN_POLL_MS);
            }
            return lease;
        },
        receive: handleEvent,
        getLease: () => lease,
        async leave() {
            started = false;
            stopTimer();
            if (eventSource && typeof eventSource.close === "function") eventSource.close();
            eventSource = null;
            try {
                await service.request("leave");
            } catch {
                // Page shutdown still makes a best-effort fixed-endpoint beacon below.
            }
            lease = Object.freeze({ status: "unavailable" });
            return publish();
        },
        releaseOnPageHide() {
            started = false;
            stopTimer();
            if (eventSource && typeof eventSource.close === "function") eventSource.close();
            eventSource = null;
            if (typeof service.releaseWithBeacon === "function") service.releaseWithBeacon();
            lease = Object.freeze({ status: "unavailable" });
            return publish();
        },
    });
};

const getQueueSurface = (documentRef) => ({
    overlay: documentRef.getElementById("landsnap-showcase-queue-overlay"),
    alert: documentRef.getElementById("landsnap-showcase-queue-alert"),
    alertText: documentRef.getElementById("landsnap-showcase-queue-alert-text"),
    title: documentRef.getElementById("landsnap-showcase-queue-title"),
    message: documentRef.getElementById("landsnap-showcase-queue-message"),
    position: documentRef.getElementById("landsnap-showcase-queue-position"),
    estimate: documentRef.getElementById("landsnap-showcase-queue-estimate"),
    countdown: documentRef.querySelector("#landsnap-showcase-queue-countdown time"),
    metrics: documentRef.querySelector(".landsnap-showcase-queue-metrics"),
    note: documentRef.querySelector(".landsnap-showcase-queue-note"),
});

export const getQueuePresentation = (lease, now = Date.now()) => {
    const waiting = lease?.status === "waiting";
    const active = lease?.status === "active";
    const delay = waiting ? calculateQueueWaitMs(lease, now) : 0;
    return Object.freeze({
        visible: !active,
        state: waiting ? "waiting" : active ? "active" : "unavailable",
        alert: waiting ? "Waiting for an available session" : "Waiting for server",
        title: waiting ? "A demo is already in progress" : "Showcase access unavailable",
        message: waiting
            ? `You are number ${lease.position} in the queue. Your streamed workspace will unlock as soon as the active visitor releases or expires their lease.`
            : "The demo server is unavailable. We’ll reconnect automatically when the Showcase is ready.",
        position: waiting ? String(lease.position) : "—",
        estimate: waiting ? `${formatQueueCountdown(delay)} remaining` : "—",
        countdown: waiting ? formatQueueCountdown(delay) : "—",
        countdownSeconds: waiting ? Math.ceil(delay / 1_000) : 0,
        showMetrics: waiting,
    });
};

const renderQueueSurface = (surface, lease, now = Date.now()) => {
    if (!surface.overlay) return;
    const presentation = getQueuePresentation(lease, now);
    surface.overlay.hidden = !presentation.visible;
    surface.overlay.dataset.queueState = presentation.state;
    if (surface.alert) surface.alert.hidden = !presentation.visible;
    if (surface.alertText) surface.alertText.textContent = presentation.alert;
    if (surface.title) surface.title.textContent = presentation.title;
    if (surface.message) surface.message.textContent = presentation.message;
    if (surface.position) surface.position.textContent = presentation.position;
    if (surface.estimate) surface.estimate.textContent = presentation.estimate;
    if (surface.countdown) {
        surface.countdown.textContent = presentation.countdown;
        surface.countdown.dateTime = `PT${presentation.countdownSeconds}S`;
    }
    if (surface.metrics) surface.metrics.hidden = !presentation.showMetrics;
    if (surface.note) surface.note.hidden = !presentation.showMetrics;
    if (presentation.state === "unavailable") surface.overlay.setAttribute("aria-busy", "true");
    else surface.overlay.removeAttribute("aria-busy");
};

const dispatchLeaseChange = (windowRef, lease) => {
    windowRef.LandSnapShowcaseQueueLease = lease;
    windowRef.dispatchEvent(new windowRef.CustomEvent("landsnap-showcase-lease-change", { detail: lease }));
};

export const installShowcaseQueueGate = (windowRef = globalThis.window, documentRef = globalThis.document) => {
    if (!windowRef || !documentRef) return null;
    const hostname = windowRef.location?.hostname;
    const surface = getQueueSurface(documentRef);
    const expander = typeof documentRef.querySelector === "function"
        ? documentRef.querySelector("[data-landsnap-showcase-expander]")
        : null;
    const local = isLocalShowcaseHost(hostname);
    const service = local
        ? createLocalQueueFixture()
        : createQueueServiceClient({ locationRef: windowRef.location });
    const controller = createQueueLeaseController({
        service,
        onUpdate: (lease) => {
            renderQueueSurface(surface, lease);
            dispatchLeaseChange(windowRef, lease);
        },
    });

    windowRef.LandSnapShowcaseQueue = controller;
    renderQueueSurface(surface, controller.getLease());
    const startQueue = () => void controller.start();
    if (expander) {
        expander.addEventListener("toggle", () => {
            if (expander.open) startQueue();
            else void controller.leave();
        });
        if (expander.open) startQueue();
    } else {
        startQueue();
    }
    const clock = windowRef.setInterval(() => {
        const lease = controller.tick();
        renderQueueSurface(surface, lease);
    }, 1_000);
    windowRef.addEventListener("pagehide", () => {
        windowRef.clearInterval(clock);
        controller.releaseOnPageHide();
    }, { once: true });
    return controller;
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
    installShowcaseQueueGate(window, document);
}
