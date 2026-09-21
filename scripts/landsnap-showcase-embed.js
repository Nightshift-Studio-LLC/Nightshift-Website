// Keep the product-page frame on one allowlisted public origin. The framed
// shell owns queue cookies, broker tickets, and the Pixel Streaming relay.
export const SHOWCASE_EMBED_ORIGIN = "https://showcase.ns-tx.com/";
export const SHOWCASE_LOCAL_PREVIEW_PATH = "./LandSnapShowcase.html";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export const resolveEmbeddedShowcaseSource = (locationRef) => {
    const hostname = typeof locationRef?.hostname === "string" ? locationRef.hostname.toLowerCase() : "";
    if (locationRef?.protocol === "http:" && LOOPBACK_HOSTS.has(hostname)) {
        return SHOWCASE_LOCAL_PREVIEW_PATH;
    }
    return SHOWCASE_EMBED_ORIGIN;
};

export const setEmbeddedShowcaseActive = (frame, active, activeSource = SHOWCASE_EMBED_ORIGIN) => {
    if (!frame || typeof frame.getAttribute !== "function" || typeof frame.setAttribute !== "function") return false;
    const source = active ? activeSource : "about:blank";
    if (frame.getAttribute("src") !== source) frame.setAttribute("src", source);
    return true;
};

export const installEmbeddedShowcase = (
    documentRef = globalThis.document,
    locationRef = documentRef?.location ?? globalThis.location,
) => {
    if (!documentRef || typeof documentRef.querySelector !== "function") return null;
    const expander = documentRef.querySelector("[data-landsnap-showcase-expander]");
    const frame = documentRef.querySelector("[data-landsnap-showcase-frame]");
    if (!expander || !frame || typeof expander.addEventListener !== "function") return null;

    const activeSource = resolveEmbeddedShowcaseSource(locationRef);
    const syncFrame = () => setEmbeddedShowcaseActive(frame, expander.open === true, activeSource);
    syncFrame();
    expander.addEventListener("toggle", syncFrame);
    return Object.freeze({ activeSource, syncFrame });
};

if (typeof document !== "undefined") installEmbeddedShowcase(document);
