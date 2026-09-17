/*
 * Local-only entrypoint for the LandSnap Pixel Streaming 2 acceptance path.
 * Production does not import the bundled frontend and receives no transport.
 */

export const LOCAL_SHOWCASE_HOSTS = Object.freeze(["127.0.0.1", "localhost", "[::1]"]);

export const isLocalShowcaseHost = (hostname) =>
    typeof hostname === "string" && LOCAL_SHOWCASE_HOSTS.includes(hostname.toLowerCase());

const isTransport = (value) => value
    && typeof value.mount === "function"
    && typeof value.emitUIInteraction === "function"
    && typeof value.onConnectionState === "function"
    && typeof value.onResponse === "function";

const dispatchReady = (windowRef, transport) => {
    windowRef.dispatchEvent(new windowRef.CustomEvent("landsnap-showcase-transport-ready", {
        detail: transport,
    }));
};

/**
 * Imports the frontend bundle only for an explicit loopback origin. Neither a
 * query parameter nor any page value can opt a public deployment into a stream.
 */
export const installLocalShowcaseBootstrap = async (
    windowRef = globalThis.window,
    loadTransport = () => import("./vendor/landsnap-showcase-ps2-local.js")
        .then(({ createLocalShowcaseTransport }) => createLocalShowcaseTransport()),
) => {
    if (!windowRef || !isLocalShowcaseHost(windowRef.location?.hostname)) return null;

    const existing = windowRef.LandSnapShowcasePixelStreaming;
    if (isTransport(existing)) return existing;

    const transport = await loadTransport();
    if (!isTransport(transport)) throw new TypeError("Local Showcase bootstrap did not provide a valid transport.");

    windowRef.LandSnapShowcasePixelStreaming = transport;
    dispatchReady(windowRef, transport);
    return transport;
};

if (typeof window !== "undefined") {
    void installLocalShowcaseBootstrap().catch(() => undefined);
}
