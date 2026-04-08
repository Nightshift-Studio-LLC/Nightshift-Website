const DEFAULT_RETENTION_DAYS = 30;
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
        "access-control-allow-headers": "content-type",
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
            return jsonResponse({ ok: false, error: "dashboard_retired" }, { status: 410 }, request, env);
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
