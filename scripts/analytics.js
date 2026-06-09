(() => {
    const script = document.currentScript;
    const endpointBase = (script?.dataset.analyticsEndpoint || "/api/analytics").replace(/\/$/, "");
    const hostname = window.location.hostname;

    function initializeStarfieldMotion() {
        const screenFx = document.querySelector(".screen-fx");

        if (!screenFx) {
            return;
        }

        if (!document.querySelector(".star-speed-layer")) {
            const speedLayer = document.createElement("div");
            speedLayer.className = "star-speed-layer";
            speedLayer.setAttribute("aria-hidden", "true");
            screenFx.insertAdjacentElement("afterend", speedLayer);
        }

        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const pointerQuery = window.matchMedia("(pointer: fine)");

        if (motionQuery.matches || !pointerQuery.matches) {
            return;
        }

        const target = { x: 0, y: 0, tilt: 0, glowX: 50, glowY: 50 };
        const current = { x: 0, y: 0, tilt: 0, glowX: 50, glowY: 50 };

        function applyStarCursor() {
            current.x += (target.x - current.x) * 0.1;
            current.y += (target.y - current.y) * 0.1;
            current.tilt += (target.tilt - current.tilt) * 0.12;
            current.glowX += (target.glowX - current.glowX) * 0.14;
            current.glowY += (target.glowY - current.glowY) * 0.14;
            document.body.style.setProperty("--star-cursor-x", `${current.x.toFixed(2)}px`);
            document.body.style.setProperty("--star-cursor-y", `${current.y.toFixed(2)}px`);
            document.body.style.setProperty("--star-cursor-tilt", `${current.tilt.toFixed(3)}deg`);
            document.body.style.setProperty("--star-cursor-glow-x", `${current.glowX.toFixed(2)}%`);
            document.body.style.setProperty("--star-cursor-glow-y", `${current.glowY.toFixed(2)}%`);
            window.requestAnimationFrame(applyStarCursor);
        }

        function setStarTarget(event) {
            const xRatio = (event.clientX / window.innerWidth - 0.5) * 2;
            const yRatio = (event.clientY / window.innerHeight - 0.5) * 2;
            target.x = xRatio * 18;
            target.y = yRatio * 12;
            target.tilt = xRatio * 0.35;
            target.glowX = event.clientX / window.innerWidth * 100;
            target.glowY = event.clientY / window.innerHeight * 100;
            document.body.classList.add("starfield-pointer-active");
        }

        function resetStarTarget() {
            target.x = 0;
            target.y = 0;
            target.tilt = 0;
            target.glowX = 50;
            target.glowY = 50;
            document.body.classList.remove("starfield-pointer-active");
        }

        window.requestAnimationFrame(applyStarCursor);
        window.addEventListener("pointermove", setStarTarget, { passive: true });
        window.addEventListener("pointerleave", resetStarTarget);
        window.addEventListener("blur", resetStarTarget);
    }

    initializeStarfieldMotion();

    const isLocalHostname =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1";

    function formatViewCount(value) {
        const count = Number.parseInt(String(value ?? ""), 10);

        if (!Number.isFinite(count) || count < 0) {
            return "--";
        }

        return new Intl.NumberFormat("en-US", {
            notation: count >= 10000 ? "compact" : "standard",
            maximumFractionDigits: 1,
        }).format(count);
    }

    function setViewCountState(node, state, value) {
        const valueNode = node.querySelector("[data-view-count-value]");
        node.dataset.viewCountState = state;

        if (valueNode) {
            valueNode.textContent = value;
        }

        if (state === "loaded") {
            node.setAttribute("aria-label", `${value} views`);
        } else if (state === "unavailable") {
            node.setAttribute("aria-label", "View count unavailable");
        }
    }

    function initializeViewCounts(delayMs = 0) {
        const nodes = Array.from(document.querySelectorAll("[data-view-count-path]"));

        if (!nodes.length || isLocalHostname) {
            return;
        }

        const paths = Array.from(new Set(nodes.map((node) => node.dataset.viewCountPath).filter(Boolean)));

        if (!paths.length) {
            return;
        }

        window.setTimeout(() => {
            const params = new URLSearchParams();
            for (const path of paths) {
                params.append("path", path);
            }

            fetch(`${endpointBase}/views?${params.toString()}`, {
                method: "GET",
                credentials: "omit",
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error("view count unavailable");
                    }

                    return response.json();
                })
                .then((data) => {
                    const counts = new Map((data?.counts || []).map((entry) => [entry.path, entry.views]));

                    for (const node of nodes) {
                        const value = formatViewCount(counts.get(node.dataset.viewCountPath) || 0);
                        setViewCountState(node, "loaded", value);
                    }
                })
                .catch(() => {
                    for (const node of nodes) {
                        setViewCountState(node, "unavailable", "--");
                    }
                });
        }, delayMs);
    }

    if (isLocalHostname) {
        return;
    }

    const VISITOR_STORAGE_KEY = "nightshift-analytics-visitor";
    const VISITOR_TTL_MS = 24 * 60 * 60 * 1000;
    const sentKeys = new Set();

    function sanitizeText(value, max = 160) {
        if (typeof value !== "string") {
            return "";
        }

        return value.replace(/\s+/g, " ").trim().slice(0, max);
    }

    function isSameOrigin(url) {
        try {
            return new URL(url, window.location.href).origin === window.location.origin;
        } catch (_error) {
            return false;
        }
    }

    function classifyDevice() {
        const ua = navigator.userAgent || "";
        const width = window.innerWidth || screen.width || 0;

        if (/ipad|tablet/i.test(ua) || (width >= 768 && width <= 1024 && "ontouchstart" in window)) {
            return "tablet";
        }

        if (/mobi|android|iphone|ipod/i.test(ua) || width < 768) {
            return "mobile";
        }

        return "desktop";
    }

    function generateVisitorId() {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function getVisitorId() {
        try {
            const raw = window.localStorage.getItem(VISITOR_STORAGE_KEY);
            const now = Date.now();

            if (raw) {
                const parsed = JSON.parse(raw);
                if (
                    parsed &&
                    typeof parsed.id === "string" &&
                    typeof parsed.expiresAt === "number" &&
                    parsed.expiresAt > now
                ) {
                    return parsed.id;
                }
            }

            const next = {
                id: generateVisitorId(),
                expiresAt: now + VISITOR_TTL_MS,
            };

            window.localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(next));
            return next.id;
        } catch (_error) {
            return "";
        }
    }

    const visitorId = getVisitorId();

    function buildPayload(partial) {
        return {
            eventType: partial.eventType || "pageview",
            eventName: sanitizeText(partial.eventName || "", 80),
            path: window.location.pathname || "/",
            pageTitle: sanitizeText(document.title || "", 140),
            referrer: document.referrer || "",
            siteHost: window.location.host,
            deviceType: classifyDevice(),
            viewportWidth: window.innerWidth || 0,
            viewportHeight: window.innerHeight || 0,
            language: sanitizeText(navigator.language || "", 24),
            timezone: sanitizeText(Intl.DateTimeFormat().resolvedOptions().timeZone || "", 64),
            visitorId,
            linkUrl: partial.linkUrl || "",
            linkText: sanitizeText(partial.linkText || "", 120),
        };
    }

    function sendPayload(payload) {
        if (payload.eventType === "pageview") {
            const pageviewKey = `${payload.eventType}|${payload.path}`;
            if (sentKeys.has(pageviewKey)) {
                return;
            }
            sentKeys.add(pageviewKey);
        }

        const body = JSON.stringify(payload);
        const url = `${endpointBase}/collect`;

        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: "application/json" });
                navigator.sendBeacon(url, blob);
                return;
            }
        } catch (_error) {
            // Fall through to fetch.
        }

        fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body,
            keepalive: true,
            credentials: "omit",
        }).catch(() => {});
    }

    function trackPageView() {
        sendPayload(buildPayload({ eventType: "pageview" }));
    }

    function trackClick(event) {
        const target = event.target instanceof Element ? event.target.closest("[data-analytics-event], a[href]") : null;

        if (!target) {
            return;
        }

        const customName = target.getAttribute("data-analytics-event");
        const href = target.getAttribute("href") || "";
        let absoluteHref = "";

        if (href) {
            try {
                absoluteHref = new URL(href, window.location.href).toString();
            } catch (_error) {
                absoluteHref = href;
            }
        }

        if (customName) {
            sendPayload(
                buildPayload({
                    eventType: "event",
                    eventName: customName,
                    linkUrl: absoluteHref,
                    linkText: target.getAttribute("data-analytics-label") || target.textContent || "",
                })
            );
            return;
        }

        if (!href) {
            return;
        }

        if (href.startsWith("mailto:")) {
            sendPayload(
                buildPayload({
                    eventType: "event",
                    eventName: "mailto_click",
                    linkUrl: href,
                    linkText: target.textContent || href,
                })
            );
            return;
        }

        if (href.startsWith("tel:")) {
            sendPayload(
                buildPayload({
                    eventType: "event",
                    eventName: "phone_click",
                    linkUrl: href,
                    linkText: target.textContent || href,
                })
            );
            return;
        }

        if (!isSameOrigin(absoluteHref) || target.getAttribute("target") === "_blank") {
            sendPayload(
                buildPayload({
                    eventType: "event",
                    eventName: "external_link_click",
                    linkUrl: absoluteHref,
                    linkText: target.textContent || absoluteHref,
                })
            );
        }
    }

    trackPageView();
    initializeViewCounts(700);
    document.addEventListener("click", trackClick, { passive: true });
})();
