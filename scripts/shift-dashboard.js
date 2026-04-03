document.addEventListener("DOMContentLoaded", function() {
    const ACCESS_HASH = "a1f9e158d166fb63938a1cffdaea9c2b69148688caed2a52b6001508e7e1edd4";
    const STORAGE_KEY = "nightshift-shift-access";
    const ANALYTICS_ENDPOINT = (document.querySelector('meta[name="nightshift-analytics-endpoint"]')?.content || "/api/analytics").replace(/\/$/, "");
    const audio = new Audio("../audio/bop.mp3");
    const clock = document.getElementById("mockup-clock");
    const form = document.getElementById("employee-access-form");
    const input = document.getElementById("employee-passcode");
    const feedback = document.getElementById("access-feedback");
    const lockButton = document.getElementById("lock-session-button");
    const refreshButton = document.getElementById("analytics-refresh-button");
    const shell = document.querySelector(".shift-shell");
    const employeeArea = document.getElementById("employee-area");
    const accessStateLabel = document.getElementById("access-state-label");
    const accessIndicator = document.getElementById("access-indicator");
    const analyticsStatus = document.getElementById("analytics-status");
    const dashboardElements = {
        metricViewsDay: document.getElementById("metric-views-day"),
        metricViewsWeek: document.getElementById("metric-views-week"),
        metricViewsRange: document.getElementById("metric-views-range"),
        metricVisitorsRange: document.getElementById("metric-visitors-range"),
        metricEventsRange: document.getElementById("metric-events-range"),
        metricLastRefresh: document.getElementById("metric-last-refresh"),
        topPages: document.getElementById("analytics-top-pages"),
        referrers: document.getElementById("analytics-referrers"),
        dailyViews: document.getElementById("analytics-daily-views"),
        devices: document.getElementById("analytics-devices"),
        regions: document.getElementById("analytics-regions"),
        events: document.getElementById("analytics-events"),
    };

    audio.volume = 0.25;

    function updateClock() {
        if (!clock) {
            return;
        }

        clock.textContent = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "America/Chicago",
            timeZoneName: "short"
        });
    }

    function formatNumber(value) {
        return new Intl.NumberFormat("en-US").format(Number(value || 0));
    }

    function formatTimestamp(value) {
        if (!value) {
            return "--";
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "--";
        }

        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Chicago"
        });
    }

    function renderList(container, items, valueKey, labelKey) {
        if (!container) {
            return;
        }

        if (!items || !items.length) {
            container.innerHTML = '<p class="analytics-empty">No data yet.</p>';
            return;
        }

        container.innerHTML = items.map((item) => `
            <div class="analytics-list-row">
                <span>${String(item[labelKey] || "Unknown")}</span>
                <strong>${formatNumber(item[valueKey])}</strong>
            </div>
        `).join("");
    }

    function renderDailyViews(items) {
        if (!dashboardElements.dailyViews) {
            return;
        }

        if (!items || !items.length) {
            dashboardElements.dailyViews.innerHTML = '<p class="analytics-empty">No page-view data yet.</p>';
            return;
        }

        const max = Math.max(...items.map((item) => Number(item.views || 0)), 1);
        dashboardElements.dailyViews.innerHTML = items.map((item) => {
            const width = Math.max(8, Math.round((Number(item.views || 0) / max) * 100));
            return `
                <div class="analytics-bar-row">
                    <div class="analytics-bar-labels">
                        <span>${item.day}</span>
                        <strong>${formatNumber(item.views)}</strong>
                    </div>
                    <div class="analytics-bar-track">
                        <span class="analytics-bar-fill" style="width:${width}%"></span>
                    </div>
                </div>
            `;
        }).join("");
    }

    function clearDashboard() {
        dashboardElements.metricViewsDay.textContent = "--";
        dashboardElements.metricViewsWeek.textContent = "--";
        dashboardElements.metricViewsRange.textContent = "--";
        dashboardElements.metricVisitorsRange.textContent = "--";
        dashboardElements.metricEventsRange.textContent = "--";
        dashboardElements.metricLastRefresh.textContent = "--";
        renderList(dashboardElements.topPages, [], "views", "path");
        renderList(dashboardElements.referrers, [], "views", "source");
        renderList(dashboardElements.devices, [], "views", "device_type");
        renderList(dashboardElements.regions, [], "views", "label");
        renderList(dashboardElements.events, [], "count", "event_name");
        renderDailyViews([]);
    }

    function renderDashboard(data) {
        dashboardElements.metricViewsDay.textContent = formatNumber(data.windows?.day?.views);
        dashboardElements.metricViewsWeek.textContent = formatNumber(data.windows?.week?.views);
        dashboardElements.metricViewsRange.textContent = formatNumber(data.windows?.range?.views);
        dashboardElements.metricVisitorsRange.textContent = formatNumber(data.windows?.range?.approxVisitors);
        dashboardElements.metricEventsRange.textContent = formatNumber(data.windows?.range?.trackedEvents);
        dashboardElements.metricLastRefresh.textContent = formatTimestamp(data.generatedAt);

        renderList(dashboardElements.topPages, data.topPages, "views", "path");
        renderList(dashboardElements.referrers, data.referrers, "views", "source");
        renderList(dashboardElements.devices, data.devices, "views", "device_type");
        renderList(dashboardElements.regions, data.regions, "views", "label");
        renderList(dashboardElements.events, data.topEvents, "count", "event_name");
        renderDailyViews(data.dailyViews || []);
    }

    function setAccessState(unlocked, message) {
        document.body.classList.toggle("employee-authenticated", unlocked);
        shell.dataset.auth = unlocked ? "unlocked" : "locked";
        employeeArea.setAttribute("aria-hidden", unlocked ? "false" : "true");
        accessStateLabel.textContent = unlocked ? "Unlocked" : "Locked";
        accessIndicator.classList.toggle("is-unlocked", unlocked);
        lockButton.hidden = !unlocked;

        if (unlocked) {
            form.setAttribute("hidden", "");
        } else {
            form.removeAttribute("hidden");
        }

        feedback.textContent = message;
        feedback.classList.toggle("error", !unlocked && message !== "Enter the six-digit code. Access clears when the browser session ends or when you lock the route manually.");

        if (!unlocked) {
            input.value = "";
            analyticsStatus.textContent = "Unlock the route to load the current analytics summary.";
            clearDashboard();
        }
    }

    async function loadAnalytics(passcode) {
        if (!passcode) {
            analyticsStatus.textContent = "Enter the passcode again to authenticate against the analytics API.";
            return;
        }

        analyticsStatus.textContent = "Loading analytics...";
        refreshButton.disabled = true;

        try {
            const response = await fetch(`${ANALYTICS_ENDPOINT}/dashboard?days=30`, {
                headers: {
                    "x-shift-passcode": passcode,
                },
                cache: "no-store",
            });

            if (response.status === 401) {
                analyticsStatus.textContent = "Dashboard API rejected the passcode. Update the worker secret to match this page.";
                clearDashboard();
                return;
            }

            if (!response.ok) {
                analyticsStatus.textContent = "Analytics API is offline or not deployed yet. The tracker and dashboard are wired, but the worker route still needs to go live.";
                clearDashboard();
                return;
            }

            const payload = await response.json();
            renderDashboard(payload);
            analyticsStatus.textContent = "Analytics loaded from the first-party worker.";
        } catch (_error) {
            analyticsStatus.textContent = "Analytics API is unavailable from this route right now.";
            clearDashboard();
        } finally {
            refreshButton.disabled = false;
        }
    }

    async function sha256(value) {
        const encoded = new TextEncoder().encode(value);
        const digest = await window.crypto.subtle.digest("SHA-256", encoded);
        return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    form.addEventListener("submit", async function(event) {
        event.preventDefault();

        const value = input.value.trim();

        if (!value) {
            setAccessState(false, "Enter the employee passcode before continuing.");
            input.focus();
            return;
        }

        feedback.classList.remove("error");
        feedback.textContent = "Checking passcode...";

        try {
            const hash = await sha256(value);

            if (hash === ACCESS_HASH) {
                window.sessionStorage.setItem(STORAGE_KEY, value);
                setAccessState(true, "Employee relay unlocked for this browser session.");
                loadAnalytics(value);
            } else {
                window.sessionStorage.removeItem(STORAGE_KEY);
                setAccessState(false, "Passcode rejected. Try again.");
                input.focus();
            }
        } catch (_error) {
            setAccessState(false, "This browser cannot verify the passcode on this page.");
        }
    });

    lockButton.addEventListener("click", function() {
        window.sessionStorage.removeItem(STORAGE_KEY);
        setAccessState(false, "Access locked. Enter the passcode to unlock the relay again.");
        input.focus();
    });

    refreshButton.addEventListener("click", function() {
        const savedCode = window.sessionStorage.getItem(STORAGE_KEY);
        if (!savedCode) {
            analyticsStatus.textContent = "The current session does not have a stored passcode. Unlock the route again.";
            return;
        }

        loadAnalytics(savedCode);
    });

    document.querySelectorAll(".hover-sound").forEach((element) => {
        element.addEventListener("mouseenter", function() {
            audio.currentTime = 0;
            audio.play().catch(() => {});
        });
    });

    clearDashboard();

    async function bootFromSession() {
        const savedCode = window.sessionStorage.getItem(STORAGE_KEY);

        if (!savedCode) {
            setAccessState(false, "Enter the six-digit code. Access clears when the browser session ends or when you lock the route manually.");
            input.focus();
            return;
        }

        try {
            const hash = await sha256(savedCode);
            if (hash === ACCESS_HASH) {
                setAccessState(true, "Employee relay unlocked for this browser session.");
                loadAnalytics(savedCode);
                return;
            }
        } catch (_error) {
            // Fall through to locked state.
        }

        window.sessionStorage.removeItem(STORAGE_KEY);
        setAccessState(false, "Enter the six-digit code. Access clears when the browser session ends or when you lock the route manually.");
        input.focus();
    }

    updateClock();
    window.setInterval(updateClock, 1000);
    bootFromSession();
});
