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
        if (!started || suspended) return lease;
        try {
            return apply(await service.request(operation));
        } catch {
            // Preserve the last broker-owned timing while a backgrounded phone
            // or a brief network interruption reconnects. Replacing a waiting
            // lease here would allow the next status response to reset its
            // displayed deadline.
            if (!["waiting", "starting", "ready"].includes(lease.status)) {
                lease = createUnavailableLease();
                publish();
            }
            schedule(MAX_POLL_MS);
            return lease;
        }
    };
    const handleEvent = (raw) => {
        if (!started || suspended || typeof raw !== "string" || raw.length > 1_024) return lease;
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
    const openEventSource = () => {
        closeEventSource();
        if (!started || suspended || typeof service.subscribe !== "function") return;
        try {
            eventSource = service.subscribe(handleEvent);
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
            started = true;
            suspended = false;
            lease = Object.freeze({ status: "requesting" });
            publish();
            openEventSource();
            return refresh("join");
        },
        tick() {
            const timestamp = now();
            if (lease.status === "ready" && lease.expiresAt <= timestamp) {
                lease = createExpiredLease();
                publish();
                schedule(MIN_POLL_MS);
            } else if (lease.status === "ready" && lease.session.expiresAt <= timestamp) {
                // The short-lived connection ticket can expire while the
                // five-minute visitor lease is still valid. Rehydrate it from
                // the broker instead of presenting the visitor as expired.
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
            alert: "Ready when you are",
            title: "Start your demo",
            message: "If someone else is using it, we’ll show your place in line and an estimated wait.",
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
            title: "Requesting your demo",
            message: "We’re checking the live demo and will keep your place on this browser.",
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
            alert: startupEstimatePassed ? "Still preparing" : "Preparing your demo",
            title: "Preparing your demo",
            message: startupEstimatePassed
                ? "Unreal Editor is taking a little longer than expected. Your session is still reserved and will open automatically."
                : "Unreal Editor and the stream are starting for you. Your session will open automatically when they are ready.",
            position: "—",
            estimate: "—",
            countdown: startupEstimatePassed ? "00:00+" : formatQueueCountdown(startupDelay),
            countdownSeconds: Math.ceil(startupDelay / 1_000),
            showMetrics: false,
            showPreparation: true,
            preparation: startupEstimatePassed
                ? "Startup is taking longer than estimated"
                : `Estimated startup: ${formatQueueCountdown(startupDelay)}`,
            showNote: true,
            showLaunchProgress: true,
            note: startupEstimatePassed
                ? "You can leave if you do not want to keep waiting."
                : "Cold-start time is an estimate and may vary.",
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
            alert: "You’re in line",
            title: "Another demo is in progress",
            message: `You are number ${lease.position} in line. We’ll start your demo automatically when it’s your turn.`,
            position: String(lease.position),
            estimate: `${formatQueueCountdown(delay)} estimated`,
            countdown: formatQueueCountdown(delay),
            countdownSeconds: Math.ceil(delay / 1_000),
            showMetrics: true,
            showPreparation: false,
            preparation: "",
            showNote: true,
            showLaunchProgress: false,
            note: "Waits are based on the five-minute limit and may be shorter if a demo ends early.",
            showTryDemo: false,
            showRetry: false,
            showLeave: true,
            showEndSession: false,
        });
    }

    if (state === "cleanup" || state === "expired") {
        return Object.freeze({
            visible: true,
            state,
            alert: state === "expired" ? "Session ended" : "Ending session",
            title: state === "expired" ? "Your demo time has ended" : "Cleaning up your demo",
            message: state === "expired"
                ? "The five-minute session has ended. You can request another demo when cleanup is complete."
                : "We’re releasing the stream and clearing the prepared scene.",
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
            showRetry: state === "expired",
            showLeave: false,
            showEndSession: false,
        });
    }

    return Object.freeze({
        visible: !ready,
        state: ready ? "ready" : "unavailable",
        alert: "Connection problem",
        title: "Demo temporarily unavailable",
        message: "We couldn’t reach the demo. We’ll keep trying while your request is active.",
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
        showRetry: !ready,
        showLeave: !ready,
        showEndSession: ready,
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
    if (["requesting", "starting", "waiting", "cleanup", "expired", "unavailable"].includes(presentation.state)) {
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
    const retryQueue = () => void controller.recheck();
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
