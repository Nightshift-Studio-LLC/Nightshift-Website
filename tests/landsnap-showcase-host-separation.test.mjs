import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    SHOWCASE_EMBED_ORIGIN,
    SHOWCASE_LOCAL_PREVIEW_PATH,
    installEmbeddedShowcase,
    resolveEmbeddedShowcaseSource,
} from "../scripts/landsnap-showcase-embed.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the product page restores the inline Showcase workspace without redirecting visitors", async () => {
    const productPage = await readSource("../pages/Studio/Landsnap.html");

    assert.match(productPage, /data-landsnap-showcase-expander/);
    assert.match(productPage, /landsnap-showcase-stream-mount/);
    assert.match(productPage, /landsnap-showcase-queue\.js/);
    assert.match(productPage, /landsnap-showcase-local\.js/);
    assert.match(productPage, /landsnap-showcase\.js/);
    assert.match(productPage, /landsnap-showcase\.css/);
    assert.doesNotMatch(productPage, /data-landsnap-showcase-frame/);
    assert.doesNotMatch(productPage, /landsnap-showcase-embed\.js/);
    assert.doesNotMatch(productPage, /href="https:\/\/showcase\.ns-tx\.com\/"/);
    assert.doesNotMatch(productPage, /(?:window|top)\.location|location\.(?:assign|replace)|target=["']_top["']/i);
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
});

test("the direct shell identifies the dedicated host without accepting a visitor endpoint", async () => {
    const directShell = await readSource("../pages/Studio/LandSnapShowcase.html");

    assert.match(directShell, /<link rel="canonical" href="https:\/\/showcase\.ns-tx\.com\/">/);
    assert.match(directShell, /landsnap-showcase-queue\.js/);
    assert.match(directShell, /landsnap-showcase-public\.js/);
    assert.match(directShell, /landsnap-showcase\.js/);
    assert.doesNotMatch(directShell, /signalling|signaling|wss?:\/\//i);
});
