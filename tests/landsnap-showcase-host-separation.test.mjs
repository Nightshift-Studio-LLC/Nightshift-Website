import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    SHOWCASE_EMBED_ORIGIN,
    SHOWCASE_LIFECYCLE_MESSAGE,
    SHOWCASE_LIFECYCLE_VERSION,
    SHOWCASE_LOCAL_PREVIEW_PATH,
    SHOWCASE_SHELL_READY_MESSAGE,
    SHOWCASE_SHELL_READY_VERSION,
    installEmbeddedShowcase,
    parseEmbeddedShowcaseMessage,
    resolveEmbeddedShowcaseOrigin,
    resolveEmbeddedShowcaseSource,
} from "../scripts/landsnap-showcase-embed.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the product page embeds the fixed dedicated Showcase host without top-level navigation", async () => {
    const productPage = await readSource("../pages/Studio/Landsnap.html");

    assert.match(productPage, /data-landsnap-showcase-expander/);
    assert.match(productPage, /data-landsnap-showcase-frame/);
    assert.match(productPage, /data-landsnap-showcase-status/);
    assert.match(productPage, /data-landsnap-showcase-retry/);
    assert.match(productPage, /src="https:\/\/showcase\.ns-tx\.com\/\?v=20260923-warm-editor-lifecycle"/);
    assert.match(productPage, /landsnap-showcase-embed\.js/);
    assert.match(productPage, /allow="autoplay; fullscreen; clipboard-read; clipboard-write"/);
    assert.match(productPage, /sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-presentation"/);
    assert.doesNotMatch(productPage, /<script[^>]+landsnap-showcase-(?:queue|local)\.js/);
    assert.doesNotMatch(productPage, /landsnap-showcase-stream-mount/);
    assert.doesNotMatch(productPage, /landsnap-showcase-queue-overlay/);
    assert.doesNotMatch(productPage, /data-command=/);
    assert.doesNotMatch(productPage, /href="https:\/\/showcase\.ns-tx\.com\/"/);
    assert.doesNotMatch(productPage, /(?:window|top)\.location|location\.(?:assign|replace)|target=["']_top["']/i);
});

test("the product shell stays nonblank until an exact-origin child handshake arrives", () => {
    const listeners = new Map();
    const retryListeners = new Map();
    const attributes = new Map([["src", SHOWCASE_EMBED_ORIGIN]]);
    const timers = [];
    const cleared = new Set();
    const childWindow = {};
    const status = { hidden: false, dataset: {} };
    const label = {};
    const title = {};
    const message = {};
    const retry = {
        hidden: true,
        addEventListener(type, listener) { retryListeners.set(type, listener); },
        removeEventListener() {},
    };
    const expander = {
        open: true,
        dataset: {},
        addEventListener(type, listener) { listeners.set(`details:${type}`, listener); },
        removeEventListener() {},
    };
    const frame = {
        contentWindow: childWindow,
        dataset: {},
        getAttribute(name) { return attributes.get(name) ?? null; },
        setAttribute(name, value) { attributes.set(name, value); },
        addEventListener(type, listener) { listeners.set(`frame:${type}`, listener); },
        removeEventListener() {},
    };
    const nodes = new Map([
        ["[data-landsnap-showcase-expander]", expander],
        ["[data-landsnap-showcase-frame]", frame],
        ["[data-landsnap-showcase-status]", status],
        ["[data-landsnap-showcase-status-label]", label],
        ["[data-landsnap-showcase-status-title]", title],
        ["[data-landsnap-showcase-status-message]", message],
        ["[data-landsnap-showcase-retry]", retry],
    ]);
    const documentRef = { querySelector: (selector) => nodes.get(selector) ?? null };
    const windowRef = {
        addEventListener(type, listener) { listeners.set(`window:${type}`, listener); },
        removeEventListener() {},
    };
    const controller = installEmbeddedShowcase(
        documentRef,
        { href: "https://ns-tx.com/pages/Studio/Landsnap.html", protocol: "https:", hostname: "ns-tx.com" },
        windowRef,
        {
            timeoutMs: 50,
            setTimeoutRef(callback, delay) {
                const id = timers.length;
                timers.push({ callback, delay });
                return id;
            },
            clearTimeoutRef(id) { cleared.add(id); },
        },
    );

    assert.equal(controller.expectedOrigin, "https://showcase.ns-tx.com");
    assert.equal(status.dataset.state, "loading");
    assert.equal(title.textContent, "Opening LandSnap Showcase");
    assert.equal(attributes.get("aria-busy"), "true");

    listeners.get("window:message")({
        source: childWindow,
        origin: "https://showcase.ns-tx.com.evil.example",
        data: { type: SHOWCASE_SHELL_READY_MESSAGE, version: SHOWCASE_SHELL_READY_VERSION },
    });
    assert.equal(status.hidden, false);

    listeners.get("window:message")({
        source: childWindow,
        origin: "https://showcase.ns-tx.com",
        data: { type: SHOWCASE_SHELL_READY_MESSAGE, version: SHOWCASE_SHELL_READY_VERSION },
    });
    assert.equal(status.hidden, true);
    assert.equal(attributes.get("aria-busy"), "false");

    listeners.get("window:message")({
        source: childWindow,
        origin: "https://showcase.ns-tx.com",
        data: { type: SHOWCASE_LIFECYCLE_MESSAGE, version: SHOWCASE_LIFECYCLE_VERSION, state: "idle" },
    });
    assert.equal(status.hidden, true);
    assert.equal(frame.dataset.showcaseState, "idle");
    assert.equal(expander.dataset.showcaseState, "idle");

    retryListeners.get("click")();
    assert.equal(status.dataset.state, "loading");
    assert.equal(attributes.get("src"), "about:blank");
    const reload = timers.findLast(({ delay }) => delay === 0);
    reload.callback();
    assert.equal(attributes.get("src"), SHOWCASE_EMBED_ORIGIN);

    const timeoutIndex = timers.findLastIndex(({ delay }) => delay === 50);
    assert.equal(cleared.has(timeoutIndex), false);
    timers[timeoutIndex].callback();
    assert.equal(status.dataset.state, "unavailable");
    assert.equal(title.textContent, "Demo temporarily unavailable");
    assert.equal(retry.hidden, false);
});

test("the parent mirrors only exact child lifecycle messages without treating idle as unavailable", () => {
    assert.deepEqual(parseEmbeddedShowcaseMessage({
        type: SHOWCASE_LIFECYCLE_MESSAGE,
        version: SHOWCASE_LIFECYCLE_VERSION,
        state: "queued",
    }), { kind: "lifecycle", state: "queued" });
    assert.deepEqual(parseEmbeddedShowcaseMessage({
        type: SHOWCASE_SHELL_READY_MESSAGE,
        version: SHOWCASE_SHELL_READY_VERSION,
    }), { kind: "shell-ready" });
    assert.equal(parseEmbeddedShowcaseMessage({
        type: SHOWCASE_LIFECYCLE_MESSAGE,
        version: SHOWCASE_LIFECYCLE_VERSION,
        state: "waiting",
    }), null);
    assert.equal(parseEmbeddedShowcaseMessage({
        type: SHOWCASE_LIFECYCLE_MESSAGE,
        version: SHOWCASE_LIFECYCLE_VERSION,
        state: "idle",
        message: "forged",
    }), null);
});

test("the initial frame reload starts only after the parent handshake listener is installed", () => {
    const listeners = new Map();
    const attributes = new Map([["src", SHOWCASE_EMBED_ORIGIN]]);
    const timers = [];
    const childWindow = {};
    const status = { hidden: false, dataset: {} };
    const retry = { hidden: true, addEventListener() {}, removeEventListener() {} };
    const expander = { open: true, addEventListener() {}, removeEventListener() {} };
    const frame = {
        contentWindow: childWindow,
        getAttribute(name) { return attributes.get(name) ?? null; },
        setAttribute(name, value) {
            attributes.set(name, value);
            if (name === "src" && value === SHOWCASE_EMBED_ORIGIN) {
                listeners.get("message")?.({
                    source: childWindow,
                    origin: "https://showcase.ns-tx.com",
                    data: { type: SHOWCASE_SHELL_READY_MESSAGE, version: SHOWCASE_SHELL_READY_VERSION },
                });
            }
        },
        addEventListener() {},
        removeEventListener() {},
    };
    const nodes = new Map([
        ["[data-landsnap-showcase-expander]", expander],
        ["[data-landsnap-showcase-frame]", frame],
        ["[data-landsnap-showcase-status]", status],
        ["[data-landsnap-showcase-retry]", retry],
    ]);
    const documentRef = { querySelector: (selector) => nodes.get(selector) ?? null };
    const windowRef = {
        addEventListener(type, listener) { listeners.set(type, listener); },
        removeEventListener() {},
    };

    installEmbeddedShowcase(documentRef, {
        href: "https://ns-tx.com/pages/Studio/Landsnap.html",
        protocol: "https:",
        hostname: "ns-tx.com",
    }, windowRef, {
        timeoutMs: 50,
        setTimeoutRef(callback, delay) {
            const id = timers.length;
            timers.push({ callback, delay });
            return id;
        },
        clearTimeoutRef() {},
    });

    assert.equal(attributes.get("src"), SHOWCASE_EMBED_ORIGIN);
    assert.equal(status.hidden, true);
});

test("the embedded frame has one fixed origin and releases its child shell when collapsed", () => {
    const listeners = new Map();
    const attributes = new Map([["src", SHOWCASE_EMBED_ORIGIN]]);
    const expander = {
        open: true,
        addEventListener(type, listener) { listeners.set(type, listener); },
    };
    const frame = {
        getAttribute(name) { return attributes.get(name) ?? null; },
        setAttribute(name, value) { attributes.set(name, value); },
    };
    const documentRef = {
        querySelector(selector) {
            if (selector === "[data-landsnap-showcase-expander]") return expander;
            if (selector === "[data-landsnap-showcase-frame]") return frame;
            return null;
        },
    };

    assert.ok(installEmbeddedShowcase(documentRef));
    assert.equal(attributes.get("src"), SHOWCASE_EMBED_ORIGIN);
    expander.open = false;
    listeners.get("toggle")();
    assert.equal(attributes.get("src"), "about:blank");
    expander.open = true;
    listeners.get("toggle")();
    assert.equal(attributes.get("src"), SHOWCASE_EMBED_ORIGIN);
});

test("loopback previews restore the complete local Showcase shell without weakening the public origin", () => {
    assert.equal(
        resolveEmbeddedShowcaseSource({ protocol: "http:", hostname: "127.0.0.1" }),
        SHOWCASE_LOCAL_PREVIEW_PATH,
    );
    assert.equal(
        resolveEmbeddedShowcaseSource({ protocol: "http:", hostname: "localhost" }),
        SHOWCASE_LOCAL_PREVIEW_PATH,
    );
    assert.equal(
        resolveEmbeddedShowcaseSource({ protocol: "https:", hostname: "ns-tx.com" }),
        SHOWCASE_EMBED_ORIGIN,
    );
    assert.equal(
        resolveEmbeddedShowcaseSource({ protocol: "https:", hostname: "showcase.ns-tx.com.evil.example" }),
        SHOWCASE_EMBED_ORIGIN,
    );
    assert.equal(
        resolveEmbeddedShowcaseOrigin(SHOWCASE_LOCAL_PREVIEW_PATH, { href: "http://127.0.0.1:4174/pages/Studio/Landsnap.html" }),
        "http://127.0.0.1:4174",
    );
});

test("the direct shell identifies the dedicated host without accepting a visitor endpoint", async () => {
    const directShell = await readSource("../pages/Studio/LandSnapShowcase.html");

    assert.match(directShell, /<link rel="canonical" href="https:\/\/showcase\.ns-tx\.com\/">/);
    assert.match(directShell, /landsnap-showcase-queue\.js/);
    assert.match(directShell, /landsnap-showcase-public\.js/);
    assert.match(directShell, /landsnap-showcase\.js/);
    assert.match(directShell, /id="landsnap-showcase-retry"/);
    assert.match(directShell, /id="landsnap-showcase-leave"/);
    assert.match(directShell, /id="landsnap-showcase-end-session"/);
    assert.doesNotMatch(directShell, /signalling|signaling|wss?:\/\//i);
});
