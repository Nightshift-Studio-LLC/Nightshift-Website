const DEFAULT_RETENTION_DAYS = 30;
const MAX_DASHBOARD_DAYS = 30;

function splitCsv(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function sanitizeString(value, max = 160) {
    if (typeof value !== "string") {
        return "";
    }

    return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizePath(value) {
    const next = sanitizeString(value, 240);
    if (!next.startsWith("/")) {
        return "/";
    }

    return next;
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAllowedOrigins(env) {
    return splitCsv(env.ALLOWED_ORIGINS);
}

function getCorsHeaders(request, env) {
    const requestOrigin = request.headers.get("origin");
    const allowedOrigins = getAllowedOrigins(env);

    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
        return {};
    }

    return {
        "access-control-allow-origin": requestOrigin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,x-shift-passcode",
        "access-control-max-age": "86400",
        vary: "Origin",
    };
}

function jsonResponse(data, init, request, env) {
    return new Response(JSON.stringify(data), {
        status: init?.status || 200,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...getCorsHeaders(request, env),
            ...(init?.headers || {}),
        },
    });
}

function assertAllowedOrigin(request, env) {
    const requestOrigin = request.headers.get("origin");
    const allowedOrigins = getAllowedOrigins(env);

    if (!requestOrigin) {
        return true;
    }

    return allowedOrigins.includes(requestOrigin);
}

function normalizeReferrer(referrer) {
    const next = sanitizeString(referrer, 512);
    if (!next) {
        return { host: "", path: "" };
    }

    try {
        const parsed = new URL(next);
        return {
            host: sanitizeString(parsed.host, 120),
            path: sanitizePath(parsed.pathname),
        };
    } catch (_error) {
        return { host: "", path: "" };
    }
}

function readCloudflareGeo(request) {
    return {
        country: sanitizeString(request.cf?.country || "", 8),
        region: sanitizeString(request.cf?.region || "", 80),
        city: sanitizeString(request.cf?.city || "", 80),
    };
}

async function collectEvent(request, env) {
    if (!assertAllowedOrigin(request, env)) {
        return jsonResponse({ ok: false, error: "origin_not_allowed" }, { status: 403 }, request, env);
    }

    let payload;
    try {
        payload = await request.json();
    } catch (_error) {
        return jsonResponse({ ok: false, error: "invalid_json" }, { status: 400 }, request, env);
    }

    const eventType = payload?.eventType === "event" ? "event" : "pageview";
    const eventName = sanitizeString(payload?.eventName || "", 80);
    const path = sanitizePath(payload?.path || "/");
    const pageTitle = sanitizeString(payload?.pageTitle || "", 140);
    const siteHost = sanitizeString(payload?.siteHost || "", 120);
    const deviceType = ["desktop", "mobile", "tablet"].includes(payload?.deviceType) ? payload.deviceType : "desktop";
    const viewportWidth = parsePositiveInt(payload?.viewportWidth, 0);
    const viewportHeight = parsePositiveInt(payload?.viewportHeight, 0);
    const language = sanitizeString(payload?.language || "", 24);
    const timezone = sanitizeString(payload?.timezone || "", 64);
    const visitorId = sanitizeString(payload?.visitorId || "", 64);
    const linkUrl = sanitizeString(payload?.linkUrl || "", 512);
    const linkText = sanitizeString(payload?.linkText || "", 120);
    const referrer = normalizeReferrer(payload?.referrer || "");
    const geo = readCloudflareGeo(request);
    const createdAt = new Date().toISOString();

    if (path.startsWith("/shift")) {
        return jsonResponse({ ok: true, skipped: true }, { status: 202 }, request, env);
    }

    await env.ANALYTICS_DB.prepare(
        `INSERT INTO analytics_events (
            event_type,
            event_name,
            path,
            page_title,
            site_host,
            referrer_host,
            referrer_path,
            device_type,
            viewport_width,
            viewport_height,
            language,
            timezone,
            country,
            region,
            city,
            visitor_id,
            link_url,
            link_text,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        eventType,
        eventName || null,
        path,
        pageTitle || null,
        siteHost || null,
        referrer.host || null,
        referrer.path || null,
        deviceType,
        viewportWidth || null,
        viewportHeight || null,
        language || null,
        timezone || null,
        geo.country || null,
        geo.region || null,
        geo.city || null,
        visitorId || null,
        linkUrl || null,
        linkText || null,
        createdAt
    ).run();

    return jsonResponse({ ok: true }, { status: 202 }, request, env);
}

async function loadWindowSummary(env, sinceIso) {
    const result = await env.ANALYTICS_DB.prepare(
        `SELECT
            COALESCE(SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END), 0) AS views,
            COALESCE(COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_id END), 0) AS approx_visitors,
            COALESCE(SUM(CASE WHEN event_type = 'event' THEN 1 ELSE 0 END), 0) AS tracked_events
        FROM analytics_events
        WHERE created_at >= ?`
    ).bind(sinceIso).first();

    return {
        views: Number(result?.views || 0),
        approxVisitors: Number(result?.approx_visitors || 0),
        trackedEvents: Number(result?.tracked_events || 0),
    };
}

async function loadDashboard(request, env) {
    if (!assertAllowedOrigin(request, env)) {
        return jsonResponse({ ok: false, error: "origin_not_allowed" }, { status: 403 }, request, env);
    }

    const passcode = request.headers.get("x-shift-passcode") || "";
    if (!env.SHIFT_DASHBOARD_PASSCODE || passcode !== env.SHIFT_DASHBOARD_PASSCODE) {
        return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 }, request, env);
    }

    const days = Math.min(parsePositiveInt(new URL(request.url).searchParams.get("days"), 30), MAX_DASHBOARD_DAYS);
    const now = Date.now();
    const since30d = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since1d = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();

    const [
        daySummary,
        weekSummary,
        rangeSummary,
        topPagesResult,
        referrersResult,
        devicesResult,
        regionsResult,
        eventsResult,
        dailyResult,
    ] = await Promise.all([
        loadWindowSummary(env, since1d),
        loadWindowSummary(env, since7d),
        loadWindowSummary(env, since30d),
        env.ANALYTICS_DB.prepare(
            `SELECT path, COUNT(*) AS views
             FROM analytics_events
             WHERE created_at >= ? AND event_type = 'pageview'
             GROUP BY path
             ORDER BY views DESC, path ASC
             LIMIT 8`
        ).bind(since30d).all(),
        env.ANALYTICS_DB.prepare(
            `SELECT
                CASE
                    WHEN referrer_host IS NULL OR referrer_host = '' THEN 'Direct'
                    ELSE referrer_host
                END AS source,
                COUNT(*) AS views
             FROM analytics_events
             WHERE created_at >= ? AND event_type = 'pageview'
             GROUP BY source
             ORDER BY views DESC, source ASC
             LIMIT 8`
        ).bind(since30d).all(),
        env.ANALYTICS_DB.prepare(
            `SELECT device_type, COUNT(*) AS views
             FROM analytics_events
             WHERE created_at >= ? AND event_type = 'pageview'
             GROUP BY device_type
             ORDER BY views DESC, device_type ASC`
        ).bind(since30d).all(),
        env.ANALYTICS_DB.prepare(
            `SELECT
                CASE
                    WHEN country IS NULL OR country = '' THEN 'Unknown'
                    WHEN region IS NULL OR region = '' THEN country
                    ELSE country || ' / ' || region
                END AS label,
                COUNT(*) AS views
             FROM analytics_events
             WHERE created_at >= ? AND event_type = 'pageview'
             GROUP BY label
             ORDER BY views DESC, label ASC
             LIMIT 8`
        ).bind(since30d).all(),
        env.ANALYTICS_DB.prepare(
            `SELECT event_name, COUNT(*) AS count
             FROM analytics_events
             WHERE created_at >= ? AND event_type = 'event' AND event_name IS NOT NULL
             GROUP BY event_name
             ORDER BY count DESC, event_name ASC
             LIMIT 8`
        ).bind(since30d).all(),
        env.ANALYTICS_DB.prepare(
            `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS views
             FROM analytics_events
             WHERE created_at >= ? AND event_type = 'pageview'
             GROUP BY day
             ORDER BY day ASC`
        ).bind(since30d).all(),
    ]);

    return jsonResponse({
        ok: true,
        generatedAt: new Date().toISOString(),
        rangeDays: days,
        windows: {
            day: daySummary,
            week: weekSummary,
            range: rangeSummary,
        },
        topPages: topPagesResult.results || [],
        referrers: referrersResult.results || [],
        devices: devicesResult.results || [],
        regions: regionsResult.results || [],
        topEvents: eventsResult.results || [],
        dailyViews: dailyResult.results || [],
    }, {}, request, env);
}

async function deleteExpiredEvents(env) {
    const retentionDays = parsePositiveInt(env.RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    await env.ANALYTICS_DB.prepare(
        "DELETE FROM analytics_events WHERE created_at < ?"
    ).bind(cutoff).run();
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: getCorsHeaders(request, env),
            });
        }

        if (request.method === "POST" && url.pathname === "/api/analytics/collect") {
            return collectEvent(request, env);
        }

        if (request.method === "GET" && url.pathname === "/api/analytics/dashboard") {
            return loadDashboard(request, env);
        }

        if (request.method === "GET" && url.pathname === "/api/analytics/health") {
            return jsonResponse({ ok: true }, {}, request, env);
        }

        return jsonResponse({ ok: false, error: "not_found" }, { status: 404 }, request, env);
    },

    async scheduled(_controller, env) {
        await deleteExpiredEvents(env);
    },
};
