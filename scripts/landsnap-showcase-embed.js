// Keep the product-page frame on one allowlisted public origin. The framed
// shell owns queue cookies, broker tickets, and the Pixel Streaming relay.
export const SHOWCASE_EMBED_ORIGIN = "https://showcase.ns-tx.com/?v=20260923-warm-editor-lifecycle";
export const SHOWCASE_LOCAL_PREVIEW_PATH = "./LandSnapShowcase.html?v=20260923-warm-editor-lifecycle";
export const SHOWCASE_SHELL_READY_MESSAGE = "landsnap-showcase-shell-ready";
export const SHOWCASE_SHELL_READY_VERSION = 1;
export const SHOWCASE_LIFECYCLE_MESSAGE = "landsnap-showcase-lifecycle";
export const SHOWCASE_LIFECYCLE_VERSION = 1;
export const SHOWCASE_CONNECTION_TIMEOUT_MS = 12000;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SHOWCASE_LIFECYCLE_STATES = new Set([
    "idle",
    "queued",
    "preparing",
    "connecting",
    "ready",
    "cleanup",
    "failure",
]);
const hasExactKeys = (value, expected) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
};

export const parseEmbeddedShowcaseMessage = (data) => {
    if (hasExactKeys(data, ["type", "version"])
        && data.type === SHOWCASE_SHELL_READY_MESSAGE
        && data.version === SHOWCASE_SHELL_READY_VERSION) {
        return Object.freeze({ kind: "shell-ready" });
    }
    if (hasExactKeys(data, ["state", "type", "version"])
        && data.type === SHOWCASE_LIFECYCLE_MESSAGE
        && data.version === SHOWCASE_LIFECYCLE_VERSION
        && SHOWCASE_LIFECYCLE_STATES.has(data.state)) {
        return Object.freeze({ kind: "lifecycle", state: data.state });
    }
    return null;
};

const STATUS_COPY = Object.freeze({
    loading: Object.freeze({
        label: "Interactive demo",
        title: "Opening LandSnap Showcase",
        message: "This may take a few seconds. You will choose when to start your session.",
        retry: false,
    }),
    unavailable: Object.freeze({
        label: "Connection problem",
        title: "Demo temporarily unavailable",
        message: "We couldn’t open the demo here. No session was started.",
        retry: true,
    }),
});

export const resolveEmbeddedShowcaseSource = (locationRef) => {
    const hostname = typeof locationRef?.hostname === "string" ? locationRef.hostname.toLowerCase() : "";
    if (locationRef?.protocol === "http:" && LOOPBACK_HOSTS.has(hostname)) {
        return SHOWCASE_LOCAL_PREVIEW_PATH;
    }
    return SHOWCASE_EMBED_ORIGIN;
};

export const resolveEmbeddedShowcaseOrigin = (source, locationRef) => {
    try {
        const base = typeof locationRef?.href === "string"
            ? locationRef.href
            : (typeof locationRef?.origin === "string" ? `${locationRef.origin}/` : SHOWCASE_EMBED_ORIGIN);
        return new URL(source, base).origin;
    } catch {
        return "";
    }
};

export const setEmbeddedShowcaseActive = (frame, active, activeSource = SHOWCASE_EMBED_ORIGIN) => {
    if (!frame || typeof frame.getAttribute !== "function" || typeof frame.setAttribute !== "function") return false;
    const source = active ? activeSource : "about:blank";
    if (frame.getAttribute("src") !== source) frame.setAttribute("src", source);
    return true;
};

export const setEmbeddedShowcaseStatus = (surface, state) => {
    const copy = STATUS_COPY[state];
    if (!surface?.status || !copy) return false;
    surface.status.hidden = false;
    if (surface.status.dataset) surface.status.dataset.state = state;
    if (surface.label) surface.label.textContent = copy.label;
    if (surface.title) surface.title.textContent = copy.title;
    if (surface.message) surface.message.textContent = copy.message;
    if (surface.retry) surface.retry.hidden = !copy.retry;
    if (surface.frame?.setAttribute) surface.frame.setAttribute("aria-busy", "true");
    return true;
};

export const installEmbeddedShowcase = (
    documentRef = globalThis.document,
    locationRef = documentRef?.location ?? globalThis.location,
    windowRef = globalThis.window,
    options = {},
) => {
    if (!documentRef || typeof documentRef.querySelector !== "function") return null;
    const expander = documentRef.querySelector("[data-landsnap-showcase-expander]");
    const frame = documentRef.querySelector("[data-landsnap-showcase-frame]");
    if (!expander || !frame || typeof expander.addEventListener !== "function") return null;

    const surface = {
        frame,
        status: documentRef.querySelector("[data-landsnap-showcase-status]"),
        label: documentRef.querySelector("[data-landsnap-showcase-status-label]"),
        title: documentRef.querySelector("[data-landsnap-showcase-status-title]"),
        message: documentRef.querySelector("[data-landsnap-showcase-status-message]"),
        retry: documentRef.querySelector("[data-landsnap-showcase-retry]"),
    };
    const activeSource = resolveEmbeddedShowcaseSource(locationRef);
    const expectedOrigin = resolveEmbeddedShowcaseOrigin(activeSource, locationRef);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : SHOWCASE_CONNECTION_TIMEOUT_MS;
    const setTimeoutRef = options.setTimeoutRef ?? windowRef?.setTimeout?.bind(windowRef) ?? globalThis.setTimeout;
    const clearTimeoutRef = options.clearTimeoutRef ?? windowRef?.clearTimeout?.bind(windowRef) ?? globalThis.clearTimeout;
    let timeoutId = null;
    let reloadId = null;

    const clearConnectionTimer = () => {
        if (timeoutId !== null && typeof clearTimeoutRef === "function") clearTimeoutRef(timeoutId);
        timeoutId = null;
    };

    const showLoading = () => {
        clearConnectionTimer();
        setEmbeddedShowcaseStatus(surface, "loading");
        if (surface.status && typeof setTimeoutRef === "function") {
            timeoutId = setTimeoutRef(() => {
                timeoutId = null;
                setEmbeddedShowcaseStatus(surface, "unavailable");
            }, timeoutMs);
        }
    };

    const showReady = () => {
        clearConnectionTimer();
        if (surface.status) surface.status.hidden = true;
        frame.setAttribute?.("aria-busy", "false");
    };

    const mirrorLifecycle = (state) => {
        showReady();
        if (expander.dataset) expander.dataset.showcaseState = state;
        if (frame.dataset) frame.dataset.showcaseState = state;
        frame.setAttribute?.("aria-busy", String(["preparing", "connecting", "cleanup"].includes(state)));
    };

    const syncFrame = () => {
        clearConnectionTimer();
        if (expander.open === true) {
            showLoading();
            setEmbeddedShowcaseActive(frame, true, activeSource);
            return;
        }
        if (surface.status) surface.status.hidden = true;
        setEmbeddedShowcaseActive(frame, false, activeSource);
    };

    const handleShellMessage = (event) => {
        if (event?.source !== frame.contentWindow || event?.origin !== expectedOrigin) return;
        const message = parseEmbeddedShowcaseMessage(event?.data);
        if (message?.kind === "shell-ready") showReady();
        if (message?.kind === "lifecycle") mirrorLifecycle(message.state);
    };

    const handleFrameError = () => setEmbeddedShowcaseStatus(surface, "unavailable");
    const retryConnection = () => {
        if (expander.open !== true) expander.open = true;
        showLoading();
        setEmbeddedShowcaseActive(frame, false, activeSource);
        if (reloadId !== null && typeof clearTimeoutRef === "function") clearTimeoutRef(reloadId);
        reloadId = typeof setTimeoutRef === "function"
            ? setTimeoutRef(() => {
                reloadId = null;
                setEmbeddedShowcaseActive(frame, true, activeSource);
            }, 0)
            : null;
    };

    expander.addEventListener("toggle", syncFrame);
    frame.addEventListener?.("error", handleFrameError);
    surface.retry?.addEventListener?.("click", retryConnection);
    windowRef?.addEventListener?.("message", handleShellMessage);

    // The iframe may already have started (or even finished) its eager HTML
    // navigation before this deferred module runs. Reset it once after the
    // listener is installed so a fast/cached child cannot lose its one-shot
    // readiness announcement between navigation and listener registration.
    setEmbeddedShowcaseActive(frame, false, activeSource);
    syncFrame();

    return Object.freeze({
        activeSource,
        expectedOrigin,
        getLifecycleState: () => frame.dataset?.showcaseState || "",
        syncFrame,
        retryConnection,
        destroy() {
            clearConnectionTimer();
            if (reloadId !== null && typeof clearTimeoutRef === "function") clearTimeoutRef(reloadId);
            expander.removeEventListener?.("toggle", syncFrame);
            frame.removeEventListener?.("error", handleFrameError);
            surface.retry?.removeEventListener?.("click", retryConnection);
            windowRef?.removeEventListener?.("message", handleShellMessage);
        },
    });
};

if (typeof document !== "undefined") installEmbeddedShowcase(document);
