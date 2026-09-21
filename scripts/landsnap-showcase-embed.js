// Keep the product-page frame on one allowlisted public origin. The framed
// shell owns queue cookies, broker tickets, and the Pixel Streaming relay.
export const SHOWCASE_EMBED_ORIGIN = "https://showcase.ns-tx.com/";

export const setEmbeddedShowcaseActive = (frame, active) => {
    if (!frame || typeof frame.getAttribute !== "function" || typeof frame.setAttribute !== "function") return false;
    const source = active ? SHOWCASE_EMBED_ORIGIN : "about:blank";
    if (frame.getAttribute("src") !== source) frame.setAttribute("src", source);
    return true;
};

export const installEmbeddedShowcase = (documentRef = globalThis.document) => {
    if (!documentRef || typeof documentRef.querySelector !== "function") return null;
    const expander = documentRef.querySelector("[data-landsnap-showcase-expander]");
    const frame = documentRef.querySelector("[data-landsnap-showcase-frame]");
    if (!expander || !frame || typeof expander.addEventListener !== "function") return null;

    const syncFrame = () => setEmbeddedShowcaseActive(frame, expander.open === true);
    syncFrame();
    expander.addEventListener("toggle", syncFrame);
    return Object.freeze({ syncFrame });
};

if (typeof document !== "undefined") installEmbeddedShowcase(document);
