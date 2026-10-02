// Shared, fixed tutorial copy. Editor-originated state never supplies UI text.
export const GUIDE_VERSION = "landsnap-guide-v1";
export const GUIDE_STEPS = Object.freeze({
    intro: Object.freeze({ title: "1 / 5 · Same starting point", method: "Saved showcase props", description: "The editor selects and frames the saved prop group. Each placement method starts from these same transforms and camera.", lookFor: "Look at the starting height, angle and contact points. About 45–60 seconds at your pace, then explore. The session timer continues during the guide." }),
    floor: Object.freeze({ title: "2 / 5 · Unreal floor snap", method: "Native Snap to Floor (End)", description: "Unreal's native floor command sweeps the full bounds downward against WorldStatic collision while preserving rotation and scale.", lookFor: "Inspect the visible contact and rotation on the slope. Execution does not mean a correct placement." }),
    align: Object.freeze({ title: "3 / 5 · Unreal surface alignment", method: "Native Snap to Floor, Align Rotation", description: "The same starting transforms are restored. Unreal then snaps to the floor and sweeps the full bounds downward and aligns rotation to the hit normal. Alignment can change yaw; scale is preserved.", lookFor: "Compare the changed angles and contact across different shapes. Judge the result in the live viewport." }),
    landsnap: Object.freeze({ title: "4 / 5 · LandSnap", method: "LandSnap one-click placement", description: "LandSnap runs on the same original transforms. The guide waits for the real operation to finish.", lookFor: "Compare terrain contact and orientation with the native results. Inspect any remaining placement problems." }),
    sandbox: Object.freeze({ title: "5 / 5 · Try it yourself", method: "Free exploration", description: "Choose a saved prop below. Use the translation widget in the live viewport: left-drag its X, Y or XY handles to move that prop.", lookFor: "Enable AutoSnap to watch placement update as you drag. Keyboard shortcuts and touch dragging are unavailable in this browser demo. Replay the tutorial whenever you like." }),
});
const METHODS = Object.freeze({
    none: "Saved showcase props", floor: "Snap to Floor (End)", align: "Align to Floor",
    pivot: "Snap Pivot to Floor", pivot_align: "Align Pivot to Floor",
    bounds: "Snap Bottom Center Bounds to Floor", bounds_align: "Align Bottom Center Bounds to Floor",
    landsnap: "LandSnap one-click placement", autosnap: "Free exploration with AutoSnap",
});
const KEYS = ["autoSnap", "method", "outcome", "phase", "prop", "revision", "step", "type", "version"];
export const parseTutorialState = (raw) => {
    let state = raw;
    if (typeof raw === "string") {
        if (raw.length > 512) return null;
        try { state = JSON.parse(raw); } catch { return null; }
    }
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    const prototype = Object.getPrototypeOf(state);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Object.keys(state).sort();
    if (keys.length !== KEYS.length || !keys.every((key, index) => key === KEYS[index])) return null;
    if (state.type !== "tutorial-state" || state.version !== GUIDE_VERSION
        || !Number.isSafeInteger(state.revision) || state.revision < 0
        || !Object.hasOwn(GUIDE_STEPS, state.step) || !Object.hasOwn(METHODS, state.method)
        || !["ready", "running", "failed"].includes(state.phase)
        || !["none", "executed", "rejected", "error"].includes(state.outcome)
        || typeof state.autoSnap !== "boolean"
        || !["basketball", "house", "shed"].includes(state.prop)) return null;
    return Object.freeze({ ...state });
};
export const getTutorialCopy = (state) => {
    const copy = GUIDE_STEPS[state?.step] || GUIDE_STEPS.intro;
    if (!state) return copy;
    const trace = state.method.startsWith("pivot") ? "A line trace from the editor's shared selection pivot"
        : state.method.startsWith("bounds") ? "A line trace from each object's bounds bottom center" : null;
    return Object.freeze({ ...copy, method: state.method === "autosnap" ? `Free exploration · AutoSnap ${state.autoSnap ? "on" : "off"}` : METHODS[state.method],
        description: trace ? `${trace} tests WorldStatic collision from the same saved transforms. ${state.method.endsWith("align") ? "Rotation aligns to the hit normal and can change yaw." : "Rotation is preserved."} Scale is preserved.` : copy.description,
    });
};
