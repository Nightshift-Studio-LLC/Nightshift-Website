/*
 * Fixed, broker-owned admission gate for the LandSnap Showcase.
 *
 * The browser can request, check, heartbeat, or release a cookie-bound demo
 * lease. It cannot launch Unreal, select a streamer, receive a signalling
 * endpoint, or issue a host-control action. A broker issues a short-lived
 * session ticket only after the supervised warm editor reports ready.
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
    waiting: Object.freeze(["activeLeaseDeadline", "estimatedWaitMs", "pollAfterMs", "position", "protocol", "status"]),
    starting: Object.freeze(["expectedReadyAt", "leaseId", "phase", "pollAfterMs", "preparationExpiresAt", "preparationOverdue", "preparationRemainingMs", "protocol", "status"]),
    ready: Object.freeze(["heartbeatAfterMs", "leaseId", "phase", "protocol", "readyClaimExpiresAt", "sessionToken", "sessionTokenExpiresAt", "sessionUrl", "status"]),
    active: Object.freeze(["heartbeatAfterMs", "leaseId", "phase", "protocol", "sessionExpiresAt", "status"]),
    ended: Object.freeze(["endedAt", "pollAfterMs", "protocol", "reason", "status"]),
    idle: Object.freeze(["pollAfterMs", "protocol", "status"]),
});
const MIN_POLL_MS = 1_000;
const MAX_POLL_MS = 5_000;
const MIN_HEARTBEAT_MS = 5_000;
const MAX_HEARTBEAT_MS = 60_000;
const MAX_SESSION_TICKET_MS = 2 * 60 * 1000;
const MAX_PUBLIC_WAIT_MS = 12 * 60 * 60 * 1000;
const QUEUE_OPERATIONS = new Set(["join", "status", "heartbeat", "leave"]);
const SUBSCRIBABLE_LEASE_STATES = new Set(["starting", "waiting", "ready", "active"]);
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
const createExpiredLease = () => Object.freeze({ status: "expired" });
const createCleanupLease = () => Object.freeze({ status: "cleanup" });
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

    if (raw.status === "idle") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.idle) || !Number.isSafeInteger(raw.pollAfterMs)) return null;
        return Object.freeze({
            status: "idle",
            pollAfterMs: clamp(raw.pollAfterMs, MIN_POLL_MS, MAX_POLL_MS),
        });
    }

    if (raw.status === "starting") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.starting)
            || raw.phase !== "preparing"
            || typeof raw.leaseId !== "string"
            || !OPAQUE_ID_PATTERN.test(raw.leaseId)
            || !isSafeTimestamp(raw.preparationExpiresAt)
            || !isSafeTimestamp(raw.expectedReadyAt)
            || raw.expectedReadyAt !== raw.preparationExpiresAt
            || !Number.isSafeInteger(raw.preparationRemainingMs)
            || raw.preparationRemainingMs < 0
            || typeof raw.preparationOverdue !== "boolean"
            || !Number.isSafeInteger(raw.pollAfterMs)) return null;

        return Object.freeze({
            status: "starting",
            leaseId: raw.leaseId,
            preparationExpiresAt: raw.preparationExpiresAt,
            expectedReadyAt: raw.expectedReadyAt,
            preparationRemainingMs: raw.preparationRemainingMs,
            preparationOverdue: raw.preparationOverdue,
            pollAfterMs: clamp(raw.pollAfterMs, MIN_POLL_MS, MAX_POLL_MS),
        });
    }

    if (raw.status === "waiting") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.waiting)
            || !Number.isSafeInteger(raw.position)
            || raw.position < 1
            || raw.position > 100
            || !Number.isSafeInteger(raw.estimatedWaitMs)
            || raw.estimatedWaitMs < 0
            || raw.estimatedWaitMs > MAX_PUBLIC_WAIT_MS
            || !(raw.activeLeaseDeadline === null || isSafeTimestamp(raw.activeLeaseDeadline))
            || !Number.isSafeInteger(raw.pollAfterMs)) return null;

        const estimatedWaitEndsAt = now + raw.estimatedWaitMs;
        return Object.freeze({
            status: "waiting",
            position: raw.position,
            estimatedWaitMs: raw.estimatedWaitMs,
            estimatedWaitEndsAt,
            activeLeaseDeadline: raw.activeLeaseDeadline,
            pollAfterMs: clamp(raw.pollAfterMs, MIN_POLL_MS, MAX_POLL_MS),
        });
    }

    if (raw.status === "ready") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.ready)
            || raw.phase !== "ready"
            || typeof raw.leaseId !== "string"
            || !OPAQUE_ID_PATTERN.test(raw.leaseId)
            || !isSafeTimestamp(raw.readyClaimExpiresAt)
            || !Number.isSafeInteger(raw.heartbeatAfterMs)
            || !isBrokerSessionUrl(raw.sessionUrl)
            || typeof raw.sessionToken !== "string"
            || !SESSION_TOKEN_PATTERN.test(raw.sessionToken)
            || !isSafeTimestamp(raw.sessionTokenExpiresAt)) return null;

        const readyClaimExpiresAt = raw.readyClaimExpiresAt;
        const sessionTokenExpiresAt = Math.min(raw.sessionTokenExpiresAt, readyClaimExpiresAt, now + MAX_SESSION_TICKET_MS);
        if (readyClaimExpiresAt <= now || sessionTokenExpiresAt <= now) return null;
        return Object.freeze({
            status: "ready",
            leaseId: raw.leaseId,
            readyClaimExpiresAt,
            heartbeatAfterMs: clamp(raw.heartbeatAfterMs, MIN_HEARTBEAT_MS, MAX_HEARTBEAT_MS),
            session: Object.freeze({
                url: raw.sessionUrl,
                token: raw.sessionToken,
                expiresAt: sessionTokenExpiresAt,
            }),
        });
    }

    if (raw.status === "active") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.active)
            || raw.phase !== "active"
            || typeof raw.leaseId !== "string"
            || !OPAQUE_ID_PATTERN.test(raw.leaseId)
            || !isSafeTimestamp(raw.sessionExpiresAt)
            || raw.sessionExpiresAt <= now
            || !Number.isSafeInteger(raw.heartbeatAfterMs)) return null;

        return Object.freeze({
            status: "active",
            leaseId: raw.leaseId,
            sessionExpiresAt: raw.sessionExpiresAt,
            heartbeatAfterMs: clamp(raw.heartbeatAfterMs, MIN_HEARTBEAT_MS, MAX_HEARTBEAT_MS),
        });
    }

    if (raw.status === "ended") {
        if (!hasExactKeys(raw, RESPONSE_KEYS.ended)
            || typeof raw.reason !== "string"
            || !/^[a-z0-9_-]{1,64}$/.test(raw.reason)
            || !isSafeTimestamp(raw.endedAt)
            || !Number.isSafeInteger(raw.pollAfterMs)) return null;

        return Object.freeze({
            status: "ended",
            reason: raw.reason,
            endedAt: raw.endedAt,
            pollAfterMs: clamp(raw.pollAfterMs, MIN_POLL_MS, MAX_POLL_MS),
        });
    }

    return null;
};

export const isReadyQueueLease = (lease, now = Date.now()) =>
    isPlainRecord(lease)
    && lease.status === "ready"
    && typeof lease.leaseId === "string"
    && isSafeTimestamp(lease.readyClaimExpiresAt)
    && lease.readyClaimExpiresAt > now
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
    return Math.max(0, lease.estimatedWaitEndsAt - now);
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
            preparationExpiresAt: Math.min(previous.preparationExpiresAt, next.preparationExpiresAt),
            expectedReadyAt: Math.min(previous.expectedReadyAt, next.expectedReadyAt),
        });
    }
    if (previous?.status === "waiting"
        && next?.status === "waiting"
        && previous.position === next.position) {
        return Object.freeze({
            ...next,
            estimatedWaitEndsAt: Math.min(previous.estimatedWaitEndsAt, next.estimatedWaitEndsAt),
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
            phase: "ready",
            leaseId: "local-showcase-fixture-lease",
            readyClaimExpiresAt: now() + MAX_SESSION_TICKET_MS,
            heartbeatAfterMs: 15_000,
            sessionUrl: "/api/landsnap-showcase/session/v1/player/local-showcase-fixture",
            sessionToken: "local-showcase-session-ticket-0001",
            sessionTokenExpiresAt: now() + MAX_SESSION_TICKET_MS,
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
    let eventSourceGeneration = 0;
    let started = false;
    let suspended = false;

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
        if (!started || suspended || typeof setTimer !== "function") return;
        timer = setTimer(() => { void refresh(); }, delay);
    };
    const scheduleForLease = (next) => {
        if (next.status === "ready") {
            const refreshAt = Math.min(next.readyClaimExpiresAt, next.session.expiresAt);
            schedule(Math.min(next.heartbeatAfterMs, Math.max(MIN_POLL_MS, refreshAt - now() - 1_000)));
        } else if (next.status === "active") {
            schedule(Math.min(next.heartbeatAfterMs, Math.max(MIN_POLL_MS, next.sessionExpiresAt - now() - 1_000)));
        } else if (next.status === "starting" || next.status === "waiting") {
            schedule(next.pollAfterMs);
        } else if (next.status === "ended") {
            schedule(next.pollAfterMs);
        } else {
            stopTimer();
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
        if (lease.status === "idle") {
            started = false;
            suspended = false;
            stopTimer();
            closeEventSource();
            return lease;
        }
        scheduleForLease(lease);
        return lease;
    };
    const nextOperation = () => ["ready", "active"].includes(lease.status) ? "heartbeat" : "status";
    const refresh = async (operation = nextOperation()) => {
        if (!started || suspended) return lease;
        try {
            return apply(await service.request(operation));
        } catch {
            // Preserve the last broker-owned timing while a backgrounded phone
            // or a brief network interruption reconnects. Replacing a waiting
            // lease here would allow the next status response to reset its
            // displayed deadline.
            if (!["waiting", "starting", "ready", "active"].includes(lease.status)) {
                lease = createUnavailableLease();
                publish();
            }
            schedule(MAX_POLL_MS);
            return lease;
        }
    };
    const handleEvent = (raw, guard = null) => {
        if (guard && guard.generation !== eventSourceGeneration) return lease;
        if (!started || suspended || typeof raw !== "string" || raw.length > 1_024) return lease;
        try {
            const candidate = JSON.parse(raw);
            if (guard?.leaseId
                && typeof candidate?.leaseId === "string"
                && candidate.leaseId !== guard.leaseId) return lease;
            return apply(candidate);
        } catch {
            return lease;
        }
    };
    const closeEventSource = () => {
        eventSourceGeneration += 1;
        if (eventSource && typeof eventSource.close === "function") eventSource.close();
        eventSource = null;
    };
    const openEventSource = () => {
        closeEventSource();
        if (!started || suspended || typeof service.subscribe !== "function") return;
        const generation = eventSourceGeneration;
        const leaseId = typeof lease?.leaseId === "string" ? lease.leaseId : null;
        try {
            const source = service.subscribe((raw) => handleEvent(raw, { generation, leaseId }));
            if (generation !== eventSourceGeneration || !started || suspended) {
                if (source && typeof source.close === "function") source.close();
                return;
            }
            eventSource = source;
        } catch {
            eventSource = null;
        }
    };
    const suspend = () => {
        if (!started || suspended) return lease;
        suspended = true;
        stopTimer();
        closeEventSource();
        return lease;
    };
    const resume = async () => {
        if (!started || !suspended) return lease;
        suspended = false;
        openEventSource();
        return refresh("status");
    };

    return Object.freeze({
        async start() {
            if (started) return lease;
            closeEventSource();
            started = true;
            suspended = false;
            lease = Object.freeze({ status: "requesting" });
            publish();
            const joined = await refresh("join");
            if (started && !suspended && SUBSCRIBABLE_LEASE_STATES.has(joined.status)) openEventSource();
            return joined;
        },
        async restart() {
            stopTimer();
            closeEventSource();
            started = true;
            suspended = false;
            lease = Object.freeze({ status: "requesting" });
            publish();
            const joined = await refresh("join");
            if (started && !suspended && SUBSCRIBABLE_LEASE_STATES.has(joined.status)) openEventSource();
            return joined;
        },
        tick() {
            const timestamp = now();
            if (lease.status === "active" && lease.sessionExpiresAt <= timestamp) {
                lease = createExpiredLease();
                publish();
                schedule(MIN_POLL_MS);
            } else if (lease.status === "ready"
                && (lease.readyClaimExpiresAt <= timestamp || lease.session.expiresAt <= timestamp)) {
                // Ready contains only a short-lived claim/ticket deadline. It
                // is never the customer's five-minute usable-session clock.
                void refresh("status");
            }
            return lease;
        },
        receive: handleEvent,
        getLease: () => lease,
        isStarted: () => started,
        async recheck() {
            if (!started) return lease;
            stopTimer();
            return refresh("status");
        },
        async leave() {
            lease = createCleanupLease();
            publish();
            started = false;
            suspended = false;
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
        suspend,
        resume,
        isSuspended: () => suspended,
        releaseOnPageHide: suspend,
    });
};

const getQueueSurface = (documentRef) => ({
    document: documentRef,
    overlay: documentRef.getElementById("landsnap-showcase-queue-overlay"),
    alert: documentRef.getElementById("landsnap-showcase-queue-alert"),
    alertIcon: documentRef.querySelector(".landsnap-showcase-queue-alert-icon"),
    alertText: documentRef.getElementById("landsnap-showcase-queue-alert-text"),
    title: documentRef.getElementById("landsnap-showcase-queue-title"),
    message: documentRef.getElementById("landsnap-showcase-queue-message"),
    tryDemo: documentRef.getElementById("landsnap-showcase-try-demo"),
    retry: documentRef.getElementById("landsnap-showcase-retry"),
    leave: documentRef.getElementById("landsnap-showcase-leave"),
    endSession: documentRef.getElementById("landsnap-showcase-end-session"),
    position: documentRef.getElementById("landsnap-showcase-queue-position"),
    estimate: documentRef.getElementById("landsnap-showcase-queue-estimate"),
    sessionCountdown: documentRef.getElementById("landsnap-showcase-session-countdown"),
    metrics: documentRef.querySelector(".landsnap-showcase-queue-metrics"),
    note: documentRef.querySelector(".landsnap-showcase-queue-note"),
    preparation: documentRef.getElementById("landsnap-showcase-preparation-estimate"),
    launchProgress: documentRef.getElementById("landsnap-showcase-launch-progress"),
    backgrounds: typeof documentRef.querySelectorAll === "function"
        ? [...documentRef.querySelectorAll(".landsnap-showcase-topbar, .landsnap-showcase-heading, .landsnap-showcase-stream-column, .landsnap-showcase-panel")]
        : [],
    wasVisible: false,
    returnFocus: null,
});

export const getQueuePresentation = (lease, now = Date.now()) => {
    const state = lease?.status || "idle";
    const waiting = state === "waiting";
    const ready = state === "ready";
    const active = state === "active";
    const starting = state === "starting";
    const delay = waiting ? calculateQueueWaitMs(lease, now) : 0;
    const startupEstimatePassed = starting && lease.preparationOverdue === true;
    const activeDelay = active && Number.isSafeInteger(lease?.sessionExpiresAt)
        ? Math.max(0, lease.sessionExpiresAt - now)
        : 0;

    if (state === "idle") {
        return Object.freeze({
            visible: true,
            state,
            alert: "Demo ready",
            title: "Start when you’re ready",
            message: "Your five-minute session starts after the stream connects. If the demo is busy, we’ll show your place in line.",
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

    if (state === "requesting") {
        return Object.freeze({
            visible: true,
            state,
            alert: "Checking availability",
            title: "One moment",
            message: "We’re checking the demo.",
            position: "—",
            estimate: "—",
            countdown: "—",
            countdownSeconds: 0,
            showMetrics: false,
            showPreparation: false,
            preparation: "",
            showNote: false,
            showLaunchProgress: false,
            note: "",
            showTryDemo: false,
            showRetry: false,
            showLeave: true,
            showEndSession: false,
        });
    }

    if (starting) {
        return Object.freeze({
            visible: true,
            state,
            alert: "Preparing",
            title: "Preparing your demo",
            message: startupEstimatePassed
                ? "The demo is taking longer than expected. It will open automatically when ready."
                : "The demo is restarting and will open automatically when ready.",
            position: "—",
            estimate: "—",
            countdown: "—",
            countdownSeconds: 0,
            showMetrics: false,
            showPreparation: true,
            preparation: startupEstimatePassed
                ? "Taking longer than estimated"
                : "This should only take a moment",
            showNote: true,
            showLaunchProgress: false,
            note: "Your five-minute session has not started yet.",
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
            alert: "In line",
            title: "Another session is active",
            message: `You’re number ${lease.position} in line. Your demo will start automatically when it’s ready.`,
            position: String(lease.position),
            estimate: `${formatQueueCountdown(delay)} estimated`,
            countdown: formatQueueCountdown(delay),
            countdownSeconds: Math.ceil(delay / 1_000),
            showMetrics: true,
            showPreparation: false,
            preparation: "",
            showNote: true,
            showLaunchProgress: false,
            note: "The estimate updates automatically and may become shorter.",
            showTryDemo: false,
            showRetry: false,
            showLeave: true,
            showEndSession: false,
        });
    }

    if (active) {
        return Object.freeze({
            visible: false,
            state,
            alert: "Demo active",
            title: "Your demo is ready",
            message: "Your five-minute interactive session is in progress.",
            position: "—",
            estimate: "—",
            countdown: formatQueueCountdown(activeDelay),
            countdownSeconds: Math.ceil(activeDelay / 1_000),
            showMetrics: false,
            showPreparation: false,
            preparation: "",
            showNote: false,
            showLaunchProgress: false,
            note: "",
            showTryDemo: false,
            showRetry: false,
            showLeave: false,
            showEndSession: true,
            showSessionCountdown: true,
            sessionCountdown: `${formatQueueCountdown(activeDelay)} remaining`,
        });
    }

    if (ready) {
        return Object.freeze({
            visible: false,
            state,
            alert: "Connecting",
            title: "Connecting to stream",
            message: "Your demo is ready. The five-minute session starts after the stream connects.",
            position: "—",
            estimate: "—",
            countdown: "—",
            countdownSeconds: 0,
            showMetrics: false,
            showPreparation: false,
            preparation: "",
            showNote: false,
            showLaunchProgress: false,
            note: "",
            showTryDemo: false,
            showRetry: false,
            showLeave: false,
            showEndSession: true,
            showSessionCountdown: false,
            sessionCountdown: "",
        });
    }

    if (state === "cleanup" || state === "expired" || state === "ended") {
        return Object.freeze({
            visible: true,
            state,
            alert: "Resetting",
            title: "Resetting the demo",
            message: "Your session has ended. The demo will be ready again shortly.",
            position: "—",
            estimate: "—",
            countdown: "—",
            countdownSeconds: 0,
            showMetrics: false,
            showPreparation: false,
            preparation: "",
            showNote: false,
            showLaunchProgress: false,
            note: "",
            showTryDemo: false,
            showRetry: false,
            showLeave: false,
            showEndSession: false,
        });
    }

    return Object.freeze({
        visible: true,
        state: "unavailable",
        alert: "Demo unavailable",
        title: "Can’t connect right now",
        message: "Please try again.",
        position: "—",
        estimate: "—",
        countdown: "—",
        countdownSeconds: 0,
        showMetrics: false,
        showPreparation: false,
        preparation: "",
        showNote: false,
        showLaunchProgress: false,
        note: "",
        showTryDemo: false,
        showRetry: true,
        showLeave: false,
        showEndSession: false,
        showSessionCountdown: false,
        sessionCountdown: "",
    });
};

const renderQueueSurface = (surface, lease, now = Date.now()) => {
    if (!surface.overlay) return;
    const presentation = getQueuePresentation(lease, now);
    const wasVisible = surface.wasVisible;
    if (presentation.visible && !wasVisible) surface.returnFocus = surface.document?.activeElement || null;
    surface.overlay.hidden = !presentation.visible;
    surface.overlay.dataset.queueState = presentation.state;
    if (surface.alert) surface.alert.hidden = !presentation.visible;
    if (surface.alertIcon) {
        surface.alertIcon.textContent = ({
            idle: "●",
            requesting: "…",
            starting: "◷",
            waiting: "◷",
            cleanup: "◷",
            expired: "⚠",
            unavailable: "⚠",
        })[presentation.state] || "●";
    }
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
    if (surface.sessionCountdown) {
        surface.sessionCountdown.hidden = presentation.showSessionCountdown !== true;
        surface.sessionCountdown.textContent = presentation.sessionCountdown || "";
        surface.sessionCountdown.dateTime = `PT${presentation.countdownSeconds || 0}S`;
    }
    if (surface.position) surface.position.textContent = presentation.position;
    if (surface.estimate) {
        surface.estimate.textContent = presentation.estimate;
        surface.estimate.dateTime = `PT${presentation.countdownSeconds}S`;
    }
    if (surface.metrics) surface.metrics.hidden = !presentation.showMetrics;
    if (surface.preparation) {
        surface.preparation.hidden = !presentation.showPreparation;
        surface.preparation.textContent = presentation.preparation || "";
    }
    if (surface.note) {
        surface.note.hidden = !presentation.showNote;
        surface.note.textContent = presentation.note;
    }
    if (surface.launchProgress) surface.launchProgress.hidden = !presentation.showLaunchProgress;
    if (["requesting", "starting", "waiting", "cleanup", "expired", "ended", "unavailable"].includes(presentation.state)) {
        surface.overlay.setAttribute("aria-busy", "true");
    } else {
        surface.overlay.removeAttribute("aria-busy");
    }
    surface.backgrounds.forEach((element) => { element.inert = presentation.visible; });
    if (presentation.visible && !wasVisible) {
        const focusTarget = presentation.showTryDemo
            ? surface.tryDemo
            : presentation.showRetry ? surface.retry : surface.leave;
        if (typeof focusTarget?.focus === "function") focusTarget.focus();
    } else if (!presentation.visible && wasVisible && typeof surface.returnFocus?.focus === "function") {
        surface.returnFocus.focus();
    }
    surface.wasVisible = presentation.visible;
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
    const retryQueue = () => void (controller.getLease().status === "ended"
        ? controller.restart()
        : controller.recheck());
    const leaveQueue = () => void controller.leave();
    if (surface.tryDemo) surface.tryDemo.addEventListener("click", startQueue);
    if (surface.retry) surface.retry.addEventListener("click", retryQueue);
    if (surface.leave) surface.leave.addEventListener("click", leaveQueue);
    if (surface.endSession) surface.endSession.addEventListener("click", leaveQueue);
    if (surface.overlay) {
        surface.overlay.addEventListener("keydown", (event) => {
            if (event.key !== "Tab") return;
            const focusable = [surface.tryDemo, surface.retry, surface.leave]
                .filter((control) => control && !control.hidden && !control.disabled);
            if (!focusable.length) return;
            const current = focusable.indexOf(documentRef.activeElement);
            const next = event.shiftKey
                ? (current <= 0 ? focusable.length - 1 : current - 1)
                : (current + 1) % focusable.length;
            event.preventDefault();
            focusable[next].focus();
        });
    }
    if (expander) {
        expander.addEventListener("toggle", () => {
            if (!expander.open && controller.isStarted()) void controller.leave();
        });
    }
    const clock = windowRef.setInterval(() => {
        const lease = controller.tick();
        renderQueueSurface(surface, lease);
        if (lease.status === "active") {
            windowRef.dispatchEvent(new windowRef.CustomEvent("landsnap-showcase-lease-tick", { detail: lease }));
        }
    }, 1_000);
    const suspendQueue = () => controller.suspend();
    const resumeQueue = () => { void controller.resume(); };
    documentRef.addEventListener?.("visibilitychange", () => {
        if (documentRef.visibilityState === "hidden") suspendQueue();
        else resumeQueue();
    });
    windowRef.addEventListener("pagehide", suspendQueue);
    windowRef.addEventListener("pageshow", resumeQueue);
    return controller;
};

if (typeof window !== "undefined" && typeof document !== "undefined") {
    installShowcaseQueueGate(window, document);
}
