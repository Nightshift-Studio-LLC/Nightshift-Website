/*
 * LandSnap Showcase broker edge boundary.
 *
 * This Worker is deliberately not a host controller. It has only two private
 * capabilities: a bounded session-orchestrator service binding and a bounded
 * player-relay service binding. The public browser never receives either
 * binding's origin, signalling address, streamer name, launch arguments, or
 * credentials.
 */

export const SHOWCASE_QUEUE_PROTOCOL_VERSION = "landsnap-showcase-queue-v2";
export const SHOWCASE_LEASE_DURATION_MS = 5 * 60 * 1_000;
export const SHOWCASE_TICKET_DURATION_MS = 2 * 60 * 1_000;
export const SHOWCASE_WAITING_MEMBER_TIMEOUT_MS = 60 * 1_000;
export const SHOWCASE_QUEUE_PATH = "/api/landsnap-showcase/queue/v1/lease";
export const SHOWCASE_QUEUE_EVENTS_PATH = "/api/landsnap-showcase/queue/v1/events";
export const SHOWCASE_PLAYER_PATH = "/api/landsnap-showcase/session/v1/player/";

const DEFAULT_MAX_QUEUE = 100;
const DEFAULT_POLL_AFTER_MS = 2_000;
const DEFAULT_HEARTBEAT_AFTER_MS = 15_000;
const VISITOR_COOKIE = "__Secure-LandSnapShowcaseVisitor";
const PLAYER_COOKIE = "__Secure-LandSnapShowcasePlayer";
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const TICKET_PATTERN = /^[A-Za-z0-9._~-]{24,512}$/;
const ALLOWED_OPERATIONS = new Set(["join", "status", "heartbeat", "leave"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

const base64UrlEncode = (value) => {
    const bytes = value instanceof Uint8Array ? value : encoder.encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (value) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    try {
        const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`;
        const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
        return null;
    }
};

const createOpaqueId = (byteLength = 24) => {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
};

const timingSafeEqual = (left, right) => {
    if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
    let result = 0;
    for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
    return result === 0;
};

const importHmacKey = async (secret) => {
    if (typeof secret !== "string" || secret.length < 32) throw new TypeError("Showcase ticket signing is unavailable.");
    return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
};

const signPayload = async (payload, secret) => {
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const key = await importHmacKey(secret);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload)));
    return `${encodedPayload}.${base64UrlEncode(signature)}`;
};

const verifyPayload = async (token, secret) => {
    if (typeof token !== "string" || !TICKET_PATTERN.test(token)) return null;
    const [encodedPayload, encodedSignature, extra] = token.split(".");
    if (!encodedPayload || !encodedSignature || extra !== undefined) return null;
    const payloadBytes = base64UrlDecode(encodedPayload);
    const signature = base64UrlDecode(encodedSignature);
    if (!payloadBytes || !signature) return null;
    try {
        const key = await importHmacKey(secret);
        const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload)));
        if (!timingSafeEqual(signature, expected)) return null;
        return JSON.parse(decoder.decode(payloadBytes));
    } catch {
        return null;
    }
};

const parseCookie = (request, name) => {
    const raw = request.headers.get("Cookie") || "";
    for (const part of raw.split(";")) {
        const [candidate, ...value] = part.trim().split("=");
        if (candidate === name) return value.join("=");
    }
    return "";
};

const cookie = (name, value, path, maxAge) =>
    `${name}=${value}; Path=${path}; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;

const parseAllowedOrigins = (value) => new Set(
    String(value || "https://ns-tx.com,https://www.ns-tx.com")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
);

const baseHeaders = () => new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
});

const json = (value, status = 200, headers = undefined) => {
    const nextHeaders = baseHeaders();
    if (headers) for (const [key, headerValue] of headers) nextHeaders.append(key, headerValue);
    return new Response(JSON.stringify(value), { status, headers: nextHeaders });
};

const failure = (status, code) => json({ ok: false, error: code }, status);

const isExpectedBrowserRequest = (request, env) => {
    const allowedOrigins = parseAllowedOrigins(env.SHOWCASE_ALLOWED_ORIGINS);
    let requestOrigin;
    try {
        requestOrigin = new URL(request.url).origin;
    } catch {
        return false;
    }
    return allowedOrigins.has(requestOrigin) && allowedOrigins.has(request.headers.get("Origin") || "");
};

const readExactOperation = async (request) => {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) return null;
    const raw = await request.text();
    if (!raw || raw.length > 128) return null;
    try {
        const payload = JSON.parse(raw);
        if (!isPlainRecord(payload)
            || !hasExactKeys(payload, ["operation", "protocol"])
            || payload.protocol !== SHOWCASE_QUEUE_PROTOCOL_VERSION
            || typeof payload.operation !== "string"
            || !ALLOWED_OPERATIONS.has(payload.operation)) return null;
        return payload.operation;
    } catch {
        return null;
    }
};

const readBearerTicket = (request) => {
    const match = /^Bearer ([A-Za-z0-9._~-]{24,512})$/.exec(request.headers.get("Authorization") || "");
    return match ? match[1] : "";
};

const isInternalReadyRecord = (record) => isPlainRecord(record)
    && hasExactKeys(record, ["expiresAt", "heartbeatAfterMs", "leaseId", "playerId", "status"])
    && record.status === "ready"
    && ID_PATTERN.test(record.leaseId)
    && ID_PATTERN.test(record.playerId)
    && isSafeTimestamp(record.expiresAt)
    && Number.isSafeInteger(record.heartbeatAfterMs);

const isInternalStartingRecord = (record) => isPlainRecord(record)
    && hasExactKeys(record, ["expectedReadyAt", "leaseId", "pollAfterMs", "status"])
    && record.status === "starting"
    && ID_PATTERN.test(record.leaseId)
    && isSafeTimestamp(record.expectedReadyAt)
    && Number.isSafeInteger(record.pollAfterMs);

const isInternalWaitingRecord = (record) => isPlainRecord(record)
    && hasExactKeys(record, ["activeLeaseExpiresAt", "pollAfterMs", "position", "status"])
    && record.status === "waiting"
    && Number.isSafeInteger(record.position)
    && record.position >= 1
    && record.position <= DEFAULT_MAX_QUEUE
    && isSafeTimestamp(record.activeLeaseExpiresAt)
    && Number.isSafeInteger(record.pollAfterMs);

const isUnavailableRecord = (record) => isPlainRecord(record)
    && hasExactKeys(record, ["status"])
    && record.status === "unavailable";

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const toPublicLease = async (record, env, now = Date.now()) => {
    const { visitorId, ...leaseRecord } = isPlainRecord(record) ? record : {};
    if (isInternalStartingRecord(leaseRecord)) {
        return {
            protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
            status: "starting",
            leaseId: leaseRecord.leaseId,
            expectedReadyAt: Math.max(leaseRecord.expectedReadyAt, now),
            pollAfterMs: clamp(leaseRecord.pollAfterMs, 1_000, 5_000),
        };
    }
    if (isInternalWaitingRecord(leaseRecord)) {
        return {
            protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
            status: "waiting",
            position: leaseRecord.position,
            activeLeaseExpiresAt: Math.max(leaseRecord.activeLeaseExpiresAt, now),
            pollAfterMs: clamp(leaseRecord.pollAfterMs, 1_000, 5_000),
        };
    }
    if (isInternalReadyRecord(leaseRecord) && ID_PATTERN.test(visitorId)) {
        const expiresAt = Math.min(leaseRecord.expiresAt, now + SHOWCASE_LEASE_DURATION_MS);
        const sessionExpiresAt = Math.min(expiresAt, now + SHOWCASE_TICKET_DURATION_MS);
        if (expiresAt <= now || sessionExpiresAt <= now) return null;
        const ticketId = createOpaqueId();
        const sessionToken = await signPayload({
            expiresAt: sessionExpiresAt,
            leaseId: leaseRecord.leaseId,
            playerId: leaseRecord.playerId,
            protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
            ticketId,
            visitorId,
        }, env.SHOWCASE_TICKET_HMAC_KEY);
        return {
            protocol: SHOWCASE_QUEUE_PROTOCOL_VERSION,
            status: "ready",
            leaseId: leaseRecord.leaseId,
            expiresAt,
            heartbeatAfterMs: clamp(leaseRecord.heartbeatAfterMs, 5_000, 60_000),
            sessionUrl: `${SHOWCASE_PLAYER_PATH}${leaseRecord.playerId}`,
            sessionToken,
            sessionExpiresAt,
        };
    }
    return null;
};

const createInternalRequest = (path, body) => new Request(`https://landsnap-showcase-queue.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-landsnap-showcase-internal": "1" },
    body: JSON.stringify(body),
});

const getQueueStub = (env) => env.SHOWCASE_QUEUE?.get(env.SHOWCASE_QUEUE.idFromName("landsnap-showcase-v1"));

const callQueue = async (env, path, body) => {
    const stub = getQueueStub(env);
    if (!stub || typeof stub.fetch !== "function") throw new TypeError("Showcase queue binding is unavailable.");
    const response = await stub.fetch(createInternalRequest(path, body));
    if (!response?.ok) return { status: "unavailable" };
    try {
        return await response.json();
    } catch {
        return { status: "unavailable" };
    }
};

const handleLease = async (request, env) => {
    if (!isExpectedBrowserRequest(request, env)) return failure(403, "origin_not_allowed");
    const operation = await readExactOperation(request);
    if (!operation) return failure(400, "invalid_request");

    let visitorId = parseCookie(request, VISITOR_COOKIE);
    const responseHeaders = [];
    if (!ID_PATTERN.test(visitorId)) {
        if (operation !== "join") return failure(401, "lease_required");
        visitorId = createOpaqueId();
        responseHeaders.push(["set-cookie", cookie(VISITOR_COOKIE, visitorId, "/api/landsnap-showcase/", 30 * 60)]);
    }

    try {
        const record = await callQueue(env, "/lease", { operation, visitorId });
        if (operation === "leave") return json({ released: record.released === true }, 200, responseHeaders);
        const publicLease = await toPublicLease({ ...record, visitorId }, env);
        if (!publicLease) return failure(503, "showcase_unavailable");
        return json(publicLease, 200, responseHeaders);
    } catch {
        return failure(503, "showcase_unavailable");
    }
};

const sessionRoutePattern = /^\/api\/landsnap-showcase\/session\/v1\/player\/([A-Za-z0-9_-]{16,128})$/;
const websocketRoutePattern = /^\/api\/landsnap-showcase\/session\/v1\/player\/([A-Za-z0-9_-]{16,128})\/ws$/;

const validateTicketPayload = (payload, playerId, visitorId, now = Date.now()) => isPlainRecord(payload)
    && hasExactKeys(payload, ["expiresAt", "leaseId", "playerId", "protocol", "ticketId", "visitorId"])
    && payload.protocol === SHOWCASE_QUEUE_PROTOCOL_VERSION
    && payload.playerId === playerId
    && payload.visitorId === visitorId
    && ID_PATTERN.test(payload.leaseId)
    && ID_PATTERN.test(payload.playerId)
    && ID_PATTERN.test(payload.ticketId)
    && isSafeTimestamp(payload.expiresAt)
    && payload.expiresAt > now;

const handleTicketExchange = async (request, env, playerId) => {
    if (!isExpectedBrowserRequest(request, env)) return failure(403, "origin_not_allowed");
    const visitorId = parseCookie(request, VISITOR_COOKIE);
    const ticket = readBearerTicket(request);
    if (!ID_PATTERN.test(visitorId) || !ticket) return failure(401, "ticket_required");
    const payload = await verifyPayload(ticket, env.SHOWCASE_TICKET_HMAC_KEY);
    if (!validateTicketPayload(payload, playerId, visitorId)) return failure(403, "ticket_rejected");

    const relayId = createOpaqueId();
    try {
        const result = await callQueue(env, "/ticket", {
            expiresAt: payload.expiresAt,
            leaseId: payload.leaseId,
            playerId,
            relayId,
            ticketId: payload.ticketId,
            visitorId,
        });
        if (result.redeemed !== true) return failure(403, "ticket_rejected");
        const headers = baseHeaders();
        headers.set("content-length", "0");
        headers.append("set-cookie", cookie(PLAYER_COOKIE, relayId, `${SHOWCASE_PLAYER_PATH}${playerId}`, Math.max(1, Math.floor((payload.expiresAt - Date.now()) / 1_000))));
        return new Response(null, { status: 204, headers });
    } catch {
        return failure(503, "showcase_unavailable");
    }
};

const handlePlayerWebSocket = async (request, env, playerId) => {
    if (!isExpectedBrowserRequest(request, env)) return failure(403, "origin_not_allowed");
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return failure(426, "websocket_required");
    const visitorId = parseCookie(request, VISITOR_COOKIE);
    const relayId = parseCookie(request, PLAYER_COOKIE);
    if (!ID_PATTERN.test(visitorId) || !ID_PATTERN.test(relayId)) return failure(401, "relay_required");

    try {
        const result = await callQueue(env, "/relay", { playerId, relayId, visitorId });
        if (result.authorized !== true || !ID_PATTERN.test(result.leaseId)) return failure(403, "relay_rejected");
        const relay = env.SHOWCASE_RELAY;
        if (!relay || typeof relay.fetch !== "function") return failure(503, "showcase_unavailable");
        const response = await relay.fetch(new Request("https://landsnap-showcase-relay.internal/v1/player", {
            method: "GET",
            headers: {
                "x-landsnap-showcase-lease": result.leaseId,
                "x-landsnap-showcase-player": playerId,
            },
        }));
        if (!response || response.status !== 101 || !response.webSocket) return failure(503, "showcase_unavailable");
        return response;
    } catch {
        return failure(503, "showcase_unavailable");
    }
};

const transformSse = (stream, env) => {
    let buffered = "";
    return stream.pipeThrough(new TransformStream({
        async transform(chunk, controller) {
            buffered += decoder.decode(chunk, { stream: true });
            let boundary = buffered.indexOf("\n\n");
            while (boundary !== -1) {
                const frame = buffered.slice(0, boundary);
                buffered = buffered.slice(boundary + 2);
                const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
                try {
                    const record = JSON.parse(data || "");
                    const lease = await toPublicLease(record, env);
                    if (lease) controller.enqueue(encoder.encode(`data: ${JSON.stringify(lease)}\n\n`));
                } catch {
                    // Malformed internal events are dropped; polling remains authoritative.
                }
                boundary = buffered.indexOf("\n\n");
            }
        },
    }));
};

const handleEvents = async (request, env) => {
    if (!isExpectedBrowserRequest(request, env)) return failure(403, "origin_not_allowed");
    const visitorId = parseCookie(request, VISITOR_COOKIE);
    if (!ID_PATTERN.test(visitorId)) return failure(401, "lease_required");
    try {
        const stub = getQueueStub(env);
        const response = await stub.fetch(new Request("https://landsnap-showcase-queue.internal/events", {
            headers: { "x-landsnap-showcase-internal": "1", "x-landsnap-showcase-visitor": visitorId },
        }));
        if (response?.status === 403) return failure(403, "lease_required");
        if (!response?.ok || !response.body) return failure(503, "showcase_unavailable");
        const headers = baseHeaders();
        headers.set("content-type", "text/event-stream; charset=utf-8");
        headers.set("connection", "keep-alive");
        return new Response(transformSse(response.body, env), { status: 200, headers });
    } catch {
        return failure(503, "showcase_unavailable");
    }
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === "OPTIONS") {
            return isExpectedBrowserRequest(request, env) ? new Response(null, { status: 204 }) : failure(403, "origin_not_allowed");
        }
        if (request.method === "POST" && url.pathname === SHOWCASE_QUEUE_PATH) return handleLease(request, env);
        if (request.method === "GET" && url.pathname === SHOWCASE_QUEUE_EVENTS_PATH) return handleEvents(request, env);
        const ticketMatch = request.method === "POST" && url.pathname.match(sessionRoutePattern);
        if (ticketMatch) return handleTicketExchange(request, env, ticketMatch[1]);
        const webSocketMatch = request.method === "GET" && url.pathname.match(websocketRoutePattern);
        if (webSocketMatch) return handlePlayerWebSocket(request, env, webSocketMatch[1]);
        return failure(404, "not_found");
    },
};

const readInternalJson = async (request, expectedKeys) => {
    try {
        const body = await request.json();
        return isPlainRecord(body) && hasExactKeys(body, expectedKeys) ? body : null;
    } catch {
        return null;
    }
};

const internalJson = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const defaultState = () => ({ active: null, queue: [], relays: [], usedTickets: [], version: 1 });

const validPrivateStatus = (record) => isPlainRecord(record)
    && ((hasExactKeys(record, ["expectedReadyAt", "status"])
        && record.status === "starting"
        && isSafeTimestamp(record.expectedReadyAt))
        || (hasExactKeys(record, ["playerId", "status"])
            && record.status === "ready"
            && ID_PATTERN.test(record.playerId))
        || (hasExactKeys(record, ["status"]) && record.status === "unavailable"));

/**
 * A single named Durable Object is the queue's only mutable authority.
 * It accepts only Worker-internal requests, never an Internet route.
 */
export class ShowcaseQueue {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.subscribers = new Map();
    }

    async fetch(request) {
        if (request.headers.get("x-landsnap-showcase-internal") !== "1") return internalJson({ status: "unavailable" }, 404);
        const run = () => this.handle(request);
        return typeof this.state.blockConcurrencyWhile === "function" ? this.state.blockConcurrencyWhile(run) : run();
    }

    async alarm() {
        await this.withState(async (state) => {
            const now = Date.now();
            await this.expireAndPromote(state, now);
            await this.save(state);
            await this.publish(state);
        });
    }

    async handle(request) {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/events") return this.events(request);
        if (request.method !== "POST") return internalJson({ status: "unavailable" }, 404);
        if (url.pathname === "/lease") return this.lease(request);
        if (url.pathname === "/ticket") return this.redeemTicket(request);
        if (url.pathname === "/relay") return this.authorizeRelay(request);
        return internalJson({ status: "unavailable" }, 404);
    }

    async withState(callback) {
        const stored = await this.state.storage.get("showcase-state");
        const loadedAt = Date.now();
        const state = isPlainRecord(stored) && stored.version === 1 ? stored : defaultState();
        state.queue = Array.isArray(state.queue) ? state.queue : [];
        let migratedQueue = false;
        state.queue = state.queue.map((entry) => {
            if (!isPlainRecord(entry) || !hasExactKeys(entry, ["queuedAt", "visitorId"])) return entry;
            migratedQueue = true;
            return { ...entry, lastSeenAt: loadedAt };
        });
        state.relays = Array.isArray(state.relays) ? state.relays : [];
        state.usedTickets = Array.isArray(state.usedTickets) ? state.usedTickets : [];
        if (migratedQueue) await this.state.storage.put("showcase-state", state);
        return callback(state);
    }

    async save(state) {
        await this.state.storage.put("showcase-state", state);
        if (state.active?.expiresAt && typeof this.state.storage.setAlarm === "function") await this.state.storage.setAlarm(state.active.expiresAt);
    }

    async lease(request) {
        const payload = await readInternalJson(request, ["operation", "visitorId"]);
        if (!payload || !ALLOWED_OPERATIONS.has(payload.operation) || !ID_PATTERN.test(payload.visitorId)) return internalJson({ status: "unavailable" }, 400);
        return this.withState(async (state) => {
            const now = Date.now();
            await this.expireAndPromote(state, now);
            let result;
            if (payload.operation === "leave") {
                result = await this.releaseVisitor(state, payload.visitorId, now);
                await this.save(state);
                await this.publish(state);
                return internalJson({ released: result });
            }

            if (payload.operation === "join") {
                result = await this.joinVisitor(state, payload.visitorId, now);
            } else {
                result = await this.statusForVisitor(state, payload.visitorId, now, true);
            }
            await this.save(state);
            await this.publish(state);
            return internalJson(result);
        });
    }

    async joinVisitor(state, visitorId, now) {
        this.pruneQueue(state, now);
        const existing = await this.statusForVisitor(state, visitorId, now, false);
        if (!isUnavailableRecord(existing)) return existing;
        if (!state.active) return this.startVisitor(state, visitorId, now);
        if (state.queue.length >= this.maxQueue()) return { status: "unavailable" };
        state.queue.push({ visitorId, queuedAt: now, lastSeenAt: now });
        return this.waitingRecord(state, visitorId);
    }

    async statusForVisitor(state, visitorId, now, refresh) {
        if (state.active?.visitorId === visitorId) {
            if (refresh) await this.refreshActive(state, now);
            return this.activeRecord(state.active);
        }
        const waiting = state.queue.find((entry) => entry?.visitorId === visitorId);
        if (waiting && refresh) waiting.lastSeenAt = now;
        return this.waitingRecord(state, visitorId);
    }

    waitingRecord(state, visitorId) {
        if (!state.active) return { status: "unavailable" };
        const index = state.queue.findIndex((entry) => entry?.visitorId === visitorId);
        if (index === -1) return { status: "unavailable" };
        return {
            status: "waiting",
            position: index + 1,
            activeLeaseExpiresAt: state.active.expiresAt,
            pollAfterMs: DEFAULT_POLL_AFTER_MS,
        };
    }

    activeRecord(active) {
        if (!active || !ID_PATTERN.test(active.leaseId) || !isSafeTimestamp(active.expiresAt)) return { status: "unavailable" };
        if (active.status === "ready" && ID_PATTERN.test(active.playerId)) {
            return {
                status: "ready",
                leaseId: active.leaseId,
                playerId: active.playerId,
                expiresAt: active.expiresAt,
                heartbeatAfterMs: DEFAULT_HEARTBEAT_AFTER_MS,
            };
        }
        if (active.status === "starting" && isSafeTimestamp(active.expectedReadyAt)) {
            return {
                status: "starting",
                leaseId: active.leaseId,
                expectedReadyAt: active.expectedReadyAt,
                pollAfterMs: DEFAULT_POLL_AFTER_MS,
            };
        }
        return { status: "unavailable" };
    }

    maxQueue() {
        const value = Number.parseInt(String(this.env.SHOWCASE_MAX_QUEUE || DEFAULT_MAX_QUEUE), 10);
        return Number.isSafeInteger(value) && value > 0 && value <= DEFAULT_MAX_QUEUE ? value : DEFAULT_MAX_QUEUE;
    }

    pruneQueue(state, now) {
        const seen = new Set(state.active?.visitorId ? [state.active.visitorId] : []);
        state.queue = state.queue.filter((entry) => {
            const valid = isPlainRecord(entry)
                && hasExactKeys(entry, ["lastSeenAt", "queuedAt", "visitorId"])
                && ID_PATTERN.test(entry.visitorId)
                && isSafeTimestamp(entry.queuedAt)
                && isSafeTimestamp(entry.lastSeenAt)
                && entry.queuedAt <= entry.lastSeenAt
                && entry.lastSeenAt <= now
                && entry.lastSeenAt > now - SHOWCASE_WAITING_MEMBER_TIMEOUT_MS
                && !seen.has(entry.visitorId);
            if (valid) seen.add(entry.visitorId);
            return valid;
        });
    }

    closeEndedSubscribers(state) {
        for (const [visitorId, subscriber] of this.subscribers) {
            const isMember = state.active?.visitorId === visitorId
                || state.queue.some((entry) => entry?.visitorId === visitorId);
            if (!isMember) subscriber.close();
        }
    }

    async startVisitor(state, visitorId, now) {
        const active = {
            expiresAt: now + SHOWCASE_LEASE_DURATION_MS,
            expectedReadyAt: now + 30_000,
            leaseId: createOpaqueId(),
            playerId: null,
            status: "starting",
            visitorId,
        };
        state.active = active;
        const privateStatus = await this.callOrchestrator("start", active.leaseId);
        if (!privateStatus || privateStatus.status === "unavailable") {
            state.active = null;
            await this.promote(state, now);
            return { status: "unavailable" };
        }
        if (privateStatus.status === "ready") {
            active.status = "ready";
            active.playerId = privateStatus.playerId;
        } else {
            active.expectedReadyAt = privateStatus.expectedReadyAt;
        }
        return this.activeRecord(active);
    }

    async refreshActive(state, now) {
        const active = state.active;
        if (!active) return;
        if (active.expiresAt <= now) {
            await this.releaseActive(state, true);
            await this.promote(state, now);
            return;
        }
        const privateStatus = await this.callOrchestrator("status", active.leaseId);
        if (!privateStatus || privateStatus.status === "unavailable") {
            await this.releaseActive(state, false);
            await this.promote(state, now);
            return;
        }
        if (privateStatus.status === "ready") {
            active.status = "ready";
            active.playerId = privateStatus.playerId;
            return;
        }
        active.status = "starting";
        active.expectedReadyAt = privateStatus.expectedReadyAt;
    }

    async expireAndPromote(state, now) {
        this.pruneQueue(state, now);
        state.usedTickets = state.usedTickets.filter((entry) => entry?.expiresAt > now);
        state.relays = state.relays.filter((entry) => entry?.expiresAt > now);
        if (state.active?.expiresAt <= now) {
            await this.releaseActive(state, true);
            await this.promote(state, now);
        }
    }

    async releaseVisitor(state, visitorId, now) {
        this.pruneQueue(state, now);
        const queued = state.queue.findIndex((entry) => entry?.visitorId === visitorId);
        if (queued !== -1) {
            state.queue.splice(queued, 1);
            return true;
        }
        if (state.active?.visitorId !== visitorId) return false;
        await this.releaseActive(state, true);
        await this.promote(state, now);
        return true;
    }

    async releaseActive(state, notifyPrivate) {
        const active = state.active;
        if (!active) return;
        state.active = null;
        state.relays = [];
        if (notifyPrivate) await this.callOrchestrator("release", active.leaseId);
    }

    async promote(state, now) {
        this.pruneQueue(state, now);
        const next = state.queue.shift();
        if (!next?.visitorId) return;
        await this.startVisitor(state, next.visitorId, now);
    }

    async callOrchestrator(operation, leaseId) {
        const service = this.env.SHOWCASE_ORCHESTRATOR;
        if (!service || typeof service.fetch !== "function" || !ID_PATTERN.test(leaseId)) return { status: "unavailable" };
        try {
            const response = await service.fetch(new Request("https://landsnap-showcase-orchestrator.internal/v1/session", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ leaseId, operation }),
            }));
            const result = await response.json();
            return response.ok && validPrivateStatus(result) ? result : { status: "unavailable" };
        } catch {
            return { status: "unavailable" };
        }
    }

    async redeemTicket(request) {
        const payload = await readInternalJson(request, ["expiresAt", "leaseId", "playerId", "relayId", "ticketId", "visitorId"]);
        if (!payload || !isSafeTimestamp(payload.expiresAt)
            || ![payload.leaseId, payload.playerId, payload.relayId, payload.ticketId, payload.visitorId].every((value) => ID_PATTERN.test(value))) {
            return internalJson({ redeemed: false }, 400);
        }
        return this.withState(async (state) => {
            const now = Date.now();
            await this.expireAndPromote(state, now);
            const active = state.active;
            const valid = active?.status === "ready"
                && active.leaseId === payload.leaseId
                && active.playerId === payload.playerId
                && active.visitorId === payload.visitorId
                && active.expiresAt >= payload.expiresAt
                && !state.usedTickets.some((entry) => entry?.ticketId === payload.ticketId);
            if (valid) {
                state.usedTickets.push({ expiresAt: payload.expiresAt, ticketId: payload.ticketId });
                state.relays.push({ expiresAt: payload.expiresAt, playerId: payload.playerId, relayId: payload.relayId, visitorId: payload.visitorId });
            }
            await this.save(state);
            return internalJson({ redeemed: valid });
        });
    }

    async authorizeRelay(request) {
        const payload = await readInternalJson(request, ["playerId", "relayId", "visitorId"]);
        if (!payload || ![payload.playerId, payload.relayId, payload.visitorId].every((value) => ID_PATTERN.test(value))) {
            return internalJson({ authorized: false }, 400);
        }
        return this.withState(async (state) => {
            const now = Date.now();
            await this.expireAndPromote(state, now);
            await this.save(state);
            const active = state.active;
            const authorized = active?.status === "ready"
                && active.playerId === payload.playerId
                && active.visitorId === payload.visitorId
                && state.relays.some((entry) => entry?.playerId === payload.playerId
                    && entry.relayId === payload.relayId
                    && entry.visitorId === payload.visitorId
                    && entry.expiresAt > now);
            return internalJson(authorized ? { authorized: true, leaseId: active.leaseId } : { authorized: false });
        });
    }

    async events(request) {
        const visitorId = request.headers.get("x-landsnap-showcase-visitor") || "";
        if (!ID_PATTERN.test(visitorId)) return internalJson({ status: "unavailable" }, 400);
        return this.withState(async (state) => {
            const now = Date.now();
            await this.expireAndPromote(state, now);
            this.closeEndedSubscribers(state);
            const record = await this.statusForVisitor(state, visitorId, now, false);
            await this.save(state);
            if (isUnavailableRecord(record)) return internalJson({ status: "unavailable" }, 403);

            const previous = this.subscribers.get(visitorId);
            if (!previous && this.subscribers.size >= this.maxQueue() + 1) {
                return internalJson({ status: "unavailable" }, 503);
            }

            const stream = new TransformStream();
            const writer = stream.writable.getWriter();
            const subscriber = { close: null, visitorId, writer };
            const close = () => {
                if (this.subscribers.get(visitorId) === subscriber) this.subscribers.delete(visitorId);
                writer.close().catch(() => undefined);
            };
            subscriber.close = close;
            this.subscribers.set(visitorId, subscriber);
            if (previous) previous.close();
            request.signal?.addEventListener("abort", close, { once: true });
            // The browser cannot consume the stream until this Response is returned.
            // Queue the initial event without awaiting the reader's backpressure.
            void this.writeEvent(writer, record, visitorId).catch(close);
            return new Response(stream.readable, {
                headers: { "cache-control": "no-store", "content-type": "text/event-stream; charset=utf-8" },
            });
        });
    }

    async publish(state) {
        await Promise.all([...this.subscribers.values()].map(async (subscriber) => {
            try {
                const record = await this.statusForVisitor(state, subscriber.visitorId, Date.now(), false);
                if (isUnavailableRecord(record)) {
                    subscriber.close();
                    return;
                }
                if (!(subscriber.writer.desiredSize > 0)) {
                    subscriber.close();
                    return;
                }
                void this.writeEvent(subscriber.writer, record, subscriber.visitorId).catch(subscriber.close);
            } catch {
                subscriber.close();
            }
        }));
    }

    async writeEvent(writer, record, visitorId) {
        const internal = record.status === "ready" ? { ...record, visitorId } : record;
        await writer.write(encoder.encode(`data: ${JSON.stringify(internal)}\n\n`));
    }
}
