/*
 * Fixed, broker-owned admission gate for the LandSnap Showcase.
 *
 * The browser can request, check, heartbeat, or release a cookie-bound demo
 * lease. It cannot launch Unreal, select a streamer, receive a signalling
 * endpoint, or issue a host-control action. A broker issues a short-lived
 * session ticket only after its isolated Unreal session reports ready.
 */

export const SHOWCASE_QUEUE_PROTOCOL_VERSION = "landsnap-showcase-queue-v2";
export const SHOWCASE_LEASE_DURATION_MS = 5 * 60 * 1000;
export const SHOWCASE_QUEUE_PATH = "/api/landsnap-showcase/queue/v1/lease";
export const SHOWCASE_QUEUE_EVENTS_PATH = "/api/landsnap-showcase/queue/v1/events";

// The public queue lives only on the dedicated Nukebox showcase origin.
// Product pages may link there, but they never become a broker origin.
const PUBLIC_SHOWCASE_HOSTS = new Set(["showcase.ns-tx.com"]);
const LOCAL_SHOWCASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const RESPONSE_KEYS = Object.freeze({
    starting: Object.freeze(["expectedReadyAt", "leaseId", "pollAfterMs", "protocol", "status"]),
    waiting: Object.freeze(["activeLeaseExpiresAt", "pollAfterMs", "position", "protocol", "status"]),
    ready: Object.freeze(["expiresAt", "heartbeatAfterMs", "leaseId", "protocol", "sessionExpiresAt", "sessionToken", "sessionUrl", "status"]),
});
const MIN_POLL_MS = 1_000;
const MAX_POLL_MS = 5_000;
const MIN_HEARTBEAT_MS = 5_000;
const MAX_HEARTBEAT_MS = 60_000;
const MAX_SESSION_TICKET_MS = 2 * 60 * 1000;
const QUEUE_OPERATIONS = new Set(["join", "status", "heartbeat", "leave"]);
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{24,512}$/;
const SESSION_URL_PREFIX = "/api/landsnap-showcase/session/v1/player/";

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
const createIdleLease = () => Object.freeze({ status: "idle" });
const createUnavailableLease = () => Object.freeze({ status: "unavailable" });
const isBrokerSessionUrl = (value) => typeof value === "string"
    && value.startsWith(SESSION_URL_PREFIX)
    && !value.includes("?")
    && !value.includes("#")
    && /^\/api\/landsnap-showcase\/session\/v1\/player\/[A-Za-z0-9_-]{16,128}$/.test(value);

export const isLocalShowcaseHost = (hostname) =>
    typeof hostname === "string" && LOCAL_SHOWCASE_HOSTS.has(hostname.toLowerCase());

export const isPublicShowcaseHost = (hostname) =>
    typeof hostname === "string" && PUBLIC_SHOWCASE_HOSTS.has(hostname.toLowerCase());

export const parseQueueLease = (raw, now = Date.now()) => {
    if (!isPlainRecord(raw) || raw.protocol !== SHOWCASE_QUEUE_PROTOCOL_VERSION) return null;

    if (raw.status === "starting") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.starting)
            || typeof raw.leaseId !== "string"
            || !OPAQUE_ID_PATTERN.test(raw.leaseId)
            || !isSafeTimestamp(raw.expectedReadyAt)
            || !Number.isSafeInteger(raw.pollAfterMs)) return null;

        return Object.freeze({
            status: "starting",
            leaseId: raw.leaseId,
            expectedReadyAt: Math.max(raw.expectedReadyAt, now),
            pollAfterMs: clamp(raw.pollAfterMs, MIN_POLL_MS, MAX_POLL_MS),
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

    if (raw.status === "ready") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.ready)
            || typeof raw.leaseId !== "string"
            || !OPAQUE_ID_PATTERN.test(raw.leaseId)
            || !isSafeTimestamp(raw.expiresAt)
            || !Number.isSafeInteger(raw.heartbeatAfterMs)
            || !isBrokerSessionUrl(raw.sessionUrl)
            || typeof raw.sessionToken !== "string"
            || !SESSION_TOKEN_PATTERN.test(raw.sessionToken)
            || !isSafeTimestamp(raw.sessionExpiresAt)) return null;

        const expiresAt = Math.min(raw.expiresAt, now + SHOWCASE_LEASE_DURATION_MS);
        const sessionExpiresAt = Math.min(raw.sessionExpiresAt, expiresAt, now + MAX_SESSION_TICKET_MS);
        if (expiresAt <= now || sessionExpiresAt <= now) return null;
        return Object.freeze({
            status: "ready",
            leaseId: raw.leaseId,
            expiresAt,
            heartbeatAfterMs: clamp(raw.heartbeatAfterMs, MIN_HEARTBEAT_MS, MAX_HEARTBEAT_MS),
            session: Object.freeze({
                url: raw.sessionUrl,
                token: raw.sessionToken,
                expiresAt: sessionExpiresAt,
            }),
        });
    }

    return null;
};

export const isReadyQueueLease = (lease, now = Date.now()) =>
    isPlainRecord(lease)
    && lease.status === "ready"
    && typeof lease.leaseId === "string"
    && isSafeTimestamp(lease.expiresAt)
    && lease.expiresAt > now
    && isPlainRecord(lease.session)
    && isBrokerSessionUrl(lease.session.url)
    && typeof lease.session.token === "string"
    && SESSION_TOKEN_PATTERN.test(lease.session.token)
    && isSafeTimestamp(lease.session.expiresAt)
    && lease.session.expiresAt > now;

/**
 * Position one is next after the active session. This is intentionally an
 * estimate: the active visitor may leave before their five-minute maximum.
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

/**
 * A repeated status response must not make the visitor's displayed deadline
 * move backward. The server remains authoritative about state and queue
 * position; this only keeps the estimate monotonic for the same reservation.
 */
export const stabilizeQueueTiming = (previous, next) => {
    if (previous?.status === "starting"
        && next?.status === "starting"
        && previous.leaseId === next.leaseId) {
        return Object.freeze({
            ...next,
            expectedReadyAt: Math.min(previous.expectedReadyAt, next.expectedReadyAt),
        });
    }
    if (previous?.status === "waiting"
        && next?.status === "waiting"
        && previous.position === next.position) {
        return Object.freeze({
            ...next,
            activeLeaseExpiresAt: Math.min(previous.activeLeaseExpiresAt, next.activeLeaseExpiresAt),
        });
    }
    return next;
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

/** Local-only deterministic fixture. It is never available from a public host. */
export const createLocalQueueFixture = ({ now = Date.now } = {}) => Object.freeze({
    async request(operation) {
        if (operation === "leave") return Object.freeze({ released: true });
        return Object.freeze({
            protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
            status: "ready",
            leaseId: "local-showcase-fixture-lease",
            expiresAt: now() + SHOWCASE_LEASE_DURATION_MS,
            heartbeatAfterMs: 15_000,
            sessionUrl: "/api/landsnap-showcase/session/v1/player/local-showcase-fixture",
            sessionToken: "local-showcase-session-ticket-0001",
            sessionExpiresAt: now() + MAX_SESSION_TICKET_MS,
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

    let lease = createIdleLease();
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
    const scheduleForLease = (next) => {
        if (next.status === "ready") {
            schedule(Math.min(next.heartbeatAfterMs, Math.max(MIN_POLL_MS, next.session.expiresAt - now() - 1_000)));
        } else if (next.status === "starting" || next.status === "waiting") {
            schedule(next.pollAfterMs);
        } else {
            schedule(MAX_POLL_MS);
        }
    };
    const apply = (raw) => {
        const next = parseQueueLease(raw, now());
        if (!next) {
            lease = createUnavailableLease();
            publish();
            schedule(MAX_POLL_MS);
            return lease;
        }
        lease = stabilizeQueueTiming(lease, next);
        publish();
        scheduleForLease(lease);
        return lease;
    };
    const nextOperation = () => lease.status === "ready" ? "heartbeat" : "status";
    const refresh = async (operation = nextOperation()) => {
        if (!started) return lease;
        try {
            return apply(await service.request(operation));
        } catch {
            lease = createUnavailableLease();
            publish();
            schedule(MAX_POLL_MS);
            return lease;
        }
    };
    const handleEvent = (raw) => {
        if (!started || typeof raw !== "string" || raw.length > 1_024) return lease;
        try {
            return apply(JSON.parse(raw));
        } catch {
            return lease;
        }
    };
    const closeEventSource = () => {
        if (eventSource && typeof eventSource.close === "function") eventSource.close();
        eventSource = null;
    };

    return Object.freeze({
        async start() {
            if (started) return lease;
            started = true;
            lease = Object.freeze({ status: "starting" });
            publish();
            if (typeof service.subscribe === "function") {
                try {
                    eventSource = service.subscribe(handleEvent);
                } catch {
                    eventSource = null;
                }
            }
            return refresh("join");
        },
        tick() {
            if (lease.status === "ready" && !isReadyQueueLease(lease, now())) {
                lease = createUnavailableLease();
                publish();
                schedule(MIN_POLL_MS);
            }
            return lease;
        },
        receive: handleEvent,
        getLease: () => lease,
        isStarted: () => started,
        async recheck() {
            if (!started) return lease;
            stopTimer();
            lease = createUnavailableLease();
            publish();
            return refresh("status");
        },
        async leave() {
            started = false;
            stopTimer();
            closeEventSource();
            try {
                await service.request("leave");
            } catch {
                // Page shutdown still makes a best-effort fixed-endpoint beacon below.
            }
            lease = createIdleLease();
            return publish();
        },
        releaseOnPageHide() {
            started = false;
            stopTimer();
            closeEventSource();
            if (typeof service.releaseWithBeacon === "function") service.releaseWithBeacon();
            lease = createIdleLease();
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
    tryDemo: documentRef.getElementById("landsnap-showcase-try-demo"),
    retry: documentRef.getElementById("landsnap-showcase-retry"),
    leave: documentRef.getElementById("landsnap-showcase-leave"),
    endSession: documentRef.getElementById("landsnap-showcase-end-session"),
    position: documentRef.getElementById("landsnap-showcase-queue-position"),
    estimate: documentRef.getElementById("landsnap-showcase-queue-estimate"),
    countdown: documentRef.querySelector("#landsnap-showcase-queue-countdown time"),
    metrics: documentRef.querySelector(".landsnap-showcase-queue-metrics"),
    note: documentRef.querySelector(".landsnap-showcase-queue-note"),
    launchProgress: documentRef.getElementById("landsnap-showcase-launch-progress"),
});

export const getQueuePresentation = (lease, now = Date.now()) => {
    const state = lease?.status || "idle";
    const waiting = state === "waiting";
    const ready = state === "ready";
    const starting = state === "starting";
    const delay = waiting ? calculateQueueWaitMs(lease, now) : 0;
    const startupDelay = starting && Number.isSafeInteger(lease?.expectedReadyAt)
        ? Math.max(0, lease.expectedReadyAt - now)
        : 0;
    const startupEstimatePassed = starting && Number.isSafeInteger(lease?.expectedReadyAt) && startupDelay === 0;

    if (state === "idle") {
        return Object.freeze({
            visible: true,
            state,
            alert: "One five-minute demo session",
            title: "Start the LandSnap Showcase",
            message: "Try Demo asks the broker for a single isolated Unreal Editor session. The player stays locked until the server reports ready.",
            position: "—",
            estimate: "—",
            countdown: "—",
            countdownSeconds: 0,
            showMetrics: false,
            showNote: false,
            showLaunchProgress: false,
            note: "",
            showTryDemo: true,
            showRetry: false,
            showLeave: false,
            showEndSession: false,
        });
    }

    if (starting) {
        return Object.freeze({
            visible: true,
            state,
            alert: startupEstimatePassed ? "Still starting" : "Demo initiated",
            title: "Starting the LandSnap Showcase",
            message: startupEstimatePassed
                ? "Startup is taking longer than the server estimate. Your reserved launch is still active, and this page will open the player automatically when the stream reports ready."
                : "Your request was received and the only demo slot is reserved for you. Keep this page open; the player will unlock automatically when the stream reports ready.",
            position: "Reserved",
            estimate: startupEstimatePassed ? "Still working" : `${formatQueueCountdown(startupDelay)} estimated`,
            countdown: startupEstimatePassed ? "00:00+" : formatQueueCountdown(startupDelay),
            countdownSeconds: Math.ceil(startupDelay / 1_000),
            showMetrics: true,
            showNote: true,
            showLaunchProgress: true,
            note: startupEstimatePassed
                ? "The estimate has passed, but the server has not reported a failure. You can leave the launch if you do not want to keep waiting."
                : "This is the server's startup estimate, not a guaranteed completion time. The session opens only after the stream is actually ready.",
            showTryDemo: false,
            showRetry: false,
            showLeave: true,
            showEndSession: false,
        });
    }

    if (waiting) {
        return Object.freeze({
            visible: true,
            state,
            alert: "Waiting for an available session",
            title: "A demo is already in progress",
            message: `You are number ${lease.position} in the queue. This wait is an estimate based on the five-minute maximum; sessions can end early.`,
            position: String(lease.position),
            estimate: `${formatQueueCountdown(delay)} estimated`,
            countdown: formatQueueCountdown(delay),
            countdownSeconds: Math.ceil(delay / 1_000),
            showMetrics: true,
            showNote: true,
            showLaunchProgress: false,
            note: "Estimated wait uses the five-minute maximum. Sessions can end early and advance the queue sooner.",
            showTryDemo: false,
            showRetry: false,
            showLeave: true,
            showEndSession: false,
        });
    }

    return Object.freeze({
        visible: !ready,
        state: ready ? "ready" : "unavailable",
        alert: "Waiting for server",
        title: "Showcase access unavailable",
        message: "The demo server is unavailable. We’ll recheck the broker automatically while your request is active.",
        position: "—",
        estimate: "—",
        countdown: "—",
        countdownSeconds: 0,
        showMetrics: false,
        showNote: false,
        showLaunchProgress: false,
        note: "",
        showTryDemo: false,
        showRetry: !ready,
        showLeave: !ready,
        showEndSession: ready,
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
    if (surface.tryDemo) {
        surface.tryDemo.hidden = !presentation.showTryDemo;
        surface.tryDemo.disabled = !presentation.showTryDemo;
    }
    if (surface.retry) {
        surface.retry.hidden = !presentation.showRetry;
        surface.retry.disabled = !presentation.showRetry;
    }
    if (surface.leave) {
        surface.leave.hidden = !presentation.showLeave;
        surface.leave.disabled = !presentation.showLeave;
    }
    if (surface.endSession) {
        surface.endSession.hidden = !presentation.showEndSession;
        surface.endSession.disabled = !presentation.showEndSession;
    }
    if (surface.position) surface.position.textContent = presentation.position;
    if (surface.estimate) surface.estimate.textContent = presentation.estimate;
    if (surface.countdown) {
        surface.countdown.textContent = presentation.countdown;
        surface.countdown.dateTime = `PT${presentation.countdownSeconds}S`;
    }
    if (surface.metrics) surface.metrics.hidden = !presentation.showMetrics;
    if (surface.note) {
        surface.note.hidden = !presentation.showNote;
        surface.note.textContent = presentation.note;
    }
    if (surface.launchProgress) surface.launchProgress.hidden = !presentation.showLaunchProgress;
    if (presentation.state === "starting" || presentation.state === "waiting" || presentation.state === "unavailable") {
        surface.overlay.setAttribute("aria-busy", "true");
    } else {
        surface.overlay.removeAttribute("aria-busy");
    }
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
    const retryQueue = () => void controller.recheck();
    const leaveQueue = () => void controller.leave();
    if (surface.tryDemo) surface.tryDemo.addEventListener("click", startQueue);
    if (surface.retry) surface.retry.addEventListener("click", retryQueue);
    if (surface.leave) surface.leave.addEventListener("click", leaveQueue);
    if (surface.endSession) surface.endSession.addEventListener("click", leaveQueue);
    if (expander) {
        expander.addEventListener("toggle", () => {
            if (!expander.open && controller.isStarted()) void controller.leave();
        });
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
