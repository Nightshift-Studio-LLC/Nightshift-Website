import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("the direct shell identifies the dedicated host without accepting a visitor endpoint", async () => {
    const directShell = await readSource("../pages/Studio/LandSnapShowcase.html");

    assert.match(directShell, /<link rel="canonical" href="https:\/\/showcase\.ns-tx\.com\/">/);
    assert.match(directShell, /landsnap-showcase-queue\.js/);
    assert.match(directShell, /landsnap-showcase-public\.js/);
    assert.match(directShell, /landsnap-showcase\.js/);
    assert.doesNotMatch(directShell, /signalling|signaling|wss?:\/\//i);
});
