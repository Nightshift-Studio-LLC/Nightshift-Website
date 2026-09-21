import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    SHOWCASE_EMBED_ORIGIN,
    installEmbeddedShowcase,
} from "../scripts/landsnap-showcase-embed.js";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the product page embeds the fixed dedicated Showcase host without top-level navigation", async () => {
    const productPage = await readSource("../pages/Studio/Landsnap.html");

    assert.match(productPage, /data-landsnap-showcase-expander/);
    assert.match(productPage, /data-landsnap-showcase-frame/);
    assert.match(productPage, /src="https:\/\/showcase\.ns-tx\.com\/"/);
    assert.match(productPage, /landsnap-showcase-embed\.js/);
    assert.doesNotMatch(productPage, /href="https:\/\/showcase\.ns-tx\.com\/"/);
    assert.doesNotMatch(productPage, /(?:window|top)\.location|location\.(?:assign|replace)|target=["']_top["']/i);
    assert.doesNotMatch(productPage, /landsnap-showcase-queue\.js/);
    assert.doesNotMatch(productPage, /landsnap-showcase-local\.js/);
    assert.doesNotMatch(productPage, /landsnap-showcase-stream-mount/);
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

test("the direct shell identifies the dedicated host without accepting a visitor endpoint", async () => {
    const directShell = await readSource("../pages/Studio/LandSnapShowcase.html");

    assert.match(directShell, /<link rel="canonical" href="https:\/\/showcase\.ns-tx\.com\/">/);
    assert.match(directShell, /landsnap-showcase-queue\.js/);
    assert.match(directShell, /landsnap-showcase-public\.js/);
    assert.match(directShell, /landsnap-showcase\.js/);
    assert.doesNotMatch(directShell, /signalling|signaling|wss?:\/\//i);
});
