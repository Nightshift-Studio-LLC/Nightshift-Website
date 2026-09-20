import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the product page delegates the demo to the fixed dedicated Showcase host", async () => {
    const productPage = await readSource("../pages/Studio/Landsnap.html");

    assert.match(productPage, /href="https:\/\/showcase\.ns-tx\.com\/"/);
    assert.doesNotMatch(productPage, /landsnap-showcase-queue\.js/);
    assert.doesNotMatch(productPage, /landsnap-showcase-local\.js/);
    assert.doesNotMatch(productPage, /landsnap-showcase-stream-mount/);
});

test("the direct shell identifies the dedicated host without accepting a visitor endpoint", async () => {
    const directShell = await readSource("../pages/Studio/LandSnapShowcase.html");

    assert.match(directShell, /<link rel="canonical" href="https:\/\/showcase\.ns-tx\.com\/">/);
    assert.match(directShell, /landsnap-showcase-queue\.js/);
    assert.match(directShell, /landsnap-showcase\.js/);
    assert.doesNotMatch(directShell, /signalling|signaling|wss?:\/\//i);
});
