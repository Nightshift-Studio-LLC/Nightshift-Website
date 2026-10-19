/* Opt-in, device-local evidence. Reports never contain SDK objects, SDP,
 * identifiers, URLs, addresses, tickets, exception text or raw RTC statistics. */
export const CONNECTION_REPORT_FRAGMENT = "#connection-report";
const LIMIT_MS = 120_000;
const LIMIT_EVENTS = 160;
const EVENT_CODES = new Set([
    "ticket-exchanged", "stream-created", "connecting", "rtc-connected", "rtc-failed", "rtc-disconnected",
    "sdp-negotiated", "video-initialized", "playback-rejected", "playback-error",
    "data-open", "data-closed", "data-error", "readiness-submitted", "readiness-confirmed", "readiness-failed",
    "remote-offer-set", "local-answer-set", "ice-checking", "ice-connected", "ice-failed", "ice-gathering-complete",
    "pair-selected", "video-decoded", "mount-failed",
    "retired", "collection-ended",
]);
const oneOf = (value, allowed) => allowed.includes(value) ? value : "unknown";
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const candidateType = (value) => oneOf(value, ["host", "srflx", "prflx", "relay"]);

/** Strict projection rather than redaction: new SDK fields never enter reports. */
export const summarizeRtcStats = (stats) => {
    const rows = [];
    stats.forEach((row) => rows.push(row));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const selected = rows.find((row) => row.type === "transport" && row.selectedCandidatePairId);
    const transportPair = byId.get(selected?.selectedCandidatePairId);
    const pair = transportPair
        ?? rows.find((row) => row.type === "candidate-pair" && row.nominated && row.state === "succeeded");
    const local = byId.get(pair?.localCandidateId);
    const remote = byId.get(pair?.remoteCandidateId);
    const video = rows.filter((row) => row.type === "inbound-rtp" && (row.kind ?? row.mediaType) === "video");
    const channels = rows.filter((row) => row.type === "data-channel");
    const sum = (list, field) => Math.min(Number.MAX_SAFE_INTEGER, list.reduce((total, row) => total + count(row[field]), 0));
    return {
        localCandidates: rows.filter((row) => row.type === "local-candidate").length,
        localRelayCandidates: rows.filter((row) => row.type === "local-candidate" && row.candidateType === "relay").length,
        remoteCandidates: rows.filter((row) => row.type === "remote-candidate").length,
        selectedPair: pair ? {
            evidence: transportPair ? "transport" : "nominated",
            state: oneOf(pair.state, ["frozen", "waiting", "in-progress", "failed", "succeeded"]),
            localType: candidateType(local?.candidateType),
            remoteType: candidateType(remote?.candidateType),
            protocol: oneOf(local?.protocol, ["udp", "tcp"]),
            relayProtocol: oneOf(local?.relayProtocol, ["udp", "tcp", "tls"]),
        } : null,
        videoBytesReceived: sum(video, "bytesReceived"),
        videoFramesDecoded: sum(video, "framesDecoded"),
        dataChannelsOpen: channels.filter((row) => row.state === "open").length,
        dataMessagesSent: sum(channels, "messagesSent"),
        dataMessagesReceived: sum(channels, "messagesReceived"),
    };
};

const peerState = (peer) => ({
    connection: oneOf(peer.connectionState, ["new", "connecting", "connected", "disconnected", "failed", "closed"]),
    ice: oneOf(peer.iceConnectionState, ["new", "checking", "connected", "completed", "disconnected", "failed", "closed"]),
    gathering: oneOf(peer.iceGatheringState, ["new", "gathering", "complete"]),
    signalling: oneOf(peer.signalingState, ["stable", "have-local-offer", "have-remote-offer", "have-local-pranswer", "have-remote-pranswer", "closed"]),
    remoteOfferSet: peer.remoteDescription?.type === "offer",
    localAnswerSet: peer.localDescription?.type === "answer",
});

/** Observation has no connection/control methods and one outstanding getStats.
 * Retirement stops observation, retaining the last snapshot for download. */
export const createConnectionRecorder = ({ now = Date.now, timers = globalThis, onUpdate = () => {} } = {}) => {
    const startedAt = now();
    const events = [];
    let latestPeer = null;
    let latestStats = null;
    let statsReadFailed = false;
    let peer = null;
    let stream = null;
    let interval = null;
    let busy = false;
    let retired = false;
    let endedAt = null;
    let eventsTruncated = false;
    const handlers = [];
    const report = () => JSON.parse(JSON.stringify({
        schema: "landsnap-connection-report-v1", browserStartedAtUtc: new Date(startedAt).toISOString(),
        elapsedMs: Math.max(0, Math.min(LIMIT_MS, (endedAt ?? now()) - startedAt)),
        collecting: !retired, eventsTruncated, statsReadFailed, peer: latestPeer, stats: latestStats, events,
    }));
    const record = (code) => {
        if (retired || !EVENT_CODES.has(code)) return;
        if (events.length < LIMIT_EVENTS) events.push({ elapsedMs: Math.max(0, Math.min(LIMIT_MS, now() - startedAt)), code });
        else eventsTruncated = true;
        try { onUpdate(code); } catch { /* A diagnostic display cannot affect the stream. */ }
    };
    const observePeer = () => {
        const next = peerState(peer);
        if (next.remoteOfferSet && !latestPeer?.remoteOfferSet) record("remote-offer-set");
        if (next.localAnswerSet && !latestPeer?.localAnswerSet) record("local-answer-set");
        if (next.ice !== latestPeer?.ice) {
            const code = { checking: "ice-checking", connected: "ice-connected", completed: "ice-connected", failed: "ice-failed" }[next.ice];
            if (code) record(code);
        }
        if (next.gathering === "complete" && latestPeer?.gathering !== "complete") record("ice-gathering-complete");
        latestPeer = next;
    };
    const retire = (code = "retired") => {
        if (retired) return;
        if (peer) observePeer();
        record(code);
        endedAt = now();
        retired = true;
        if (interval !== null) timers.clearInterval(interval);
        interval = null;
        for (const [name, handler] of handlers) stream?.removeEventListener?.(name, handler);
        stream = null;
        peer = null;
    };
    const sample = async () => {
        if (retired) return;
        if (now() - startedAt >= LIMIT_MS) { retire("collection-ended"); return; }
        // This is the pinned UE5.8 SDK's public getter; no monkey-patching.
        peer = stream?.webRtcController?.peerConnectionController?.peerConnection ?? null;
        if (!peer) return;
        observePeer();
        if (busy || typeof peer.getStats !== "function") return;
        busy = true;
        const sampledPeer = peer;
        try {
            const stats = await sampledPeer.getStats();
            if (!retired && peer === sampledPeer) {
                const next = summarizeRtcStats(stats);
                if (next.selectedPair && !latestStats?.selectedPair) record("pair-selected");
                if (next.videoFramesDecoded > 0 && !latestStats?.videoFramesDecoded) record("video-decoded");
                latestStats = next;
            }
        } catch { if (!retired) statsReadFailed = true; }
        finally { busy = false; }
    };
    const attach = (value) => {
        if (retired || stream) return;
        stream = value;
        const codes = {
            webRtcConnecting: "connecting", webRtcConnected: "rtc-connected", webRtcFailed: "rtc-failed",
            webRtcDisconnected: "rtc-disconnected", webRtcSdp: "sdp-negotiated",
            videoInitialized: "video-initialized", playStreamRejected: "playback-rejected", playStreamError: "playback-error",
            dataChannelOpen: "data-open", dataChannelClose: "data-closed", dataChannelError: "data-error",
        };
        for (const [name, code] of Object.entries(codes)) {
            const handler = () => { record(code); void sample(); };
            handlers.push([name, handler]);
            stream.addEventListener(name, handler);
        }
        record("stream-created");
        void sample();
        interval = timers.setInterval(() => { void sample(); }, 1_000);
    };
    return Object.freeze({ record, attach, sample, retire, report });
};

/** Exact-fragment opt-in on the dedicated HTTPS host only. The report stays in
 * memory until an explicit local download; no new network endpoint/storage. */
export const createBrowserConnectionReport = (locationRef = globalThis.location, documentRef = globalThis.document) => {
    if (locationRef?.hostname !== "showcase.ns-tx.com" || locationRef?.protocol !== "https:"
        || locationRef?.hash !== CONNECTION_REPORT_FRAGMENT || !documentRef?.body) return null;
    documentRef.getElementById("landsnap-connection-report")?.remove();
    const panel = documentRef.createElement("details");
    panel.id = "landsnap-connection-report";
    panel.className = "landsnap-showcase-disclosure";
    const heading = documentRef.createElement("summary");
    heading.id = "landsnap-connection-report-heading";
    heading.textContent = "Connection report — diagnostic mode";
    const description = documentRef.createElement("p");
    description.textContent = "Records up to two minutes on this device. Save after the attempt ends. No credentials, SDP or network addresses are included. Nothing is uploaded.";
    const status = documentRef.createElement("p");
    status.setAttribute("role", "status");
    const button = documentRef.createElement("button");
    button.id = "landsnap-connection-report-save";
    button.type = "button";
    button.className = "landsnap-showcase-action";
    button.textContent = "Save connection report";
    const recorder = createConnectionRecorder({ onUpdate: (code) => {
        status.textContent = ["retired", "collection-ended"].includes(code)
            ? "Collection finished. Your report is ready to save."
            : `Latest stage: ${code}`;
    } });
    button.addEventListener("click", () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(recorder.report(), null, 2)], { type: "application/json" }));
        const link = documentRef.createElement("a");
        link.href = url;
        link.download = "landsnap-connection-report.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
    });
    panel.append(heading, description, status, button);
    // Terminal queue states cover the workspace and make its controls inert.
    // Keep the download inside that dialog so failed attempts remain saveable.
    (documentRef.querySelector(".landsnap-showcase-queue-card") ?? documentRef.body).append(panel);
    return recorder;
};
