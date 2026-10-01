/*
 * Enable the observer control only in the static release deployed together
 * with the server's observer grant, signalling, and owner-only input gates.
 * The observer module fails closed if this file is absent or blocked.
 */
window.LandSnapShowcaseCapabilities = Object.freeze({ observer: true });
