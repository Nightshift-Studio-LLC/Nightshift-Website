import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserConnectionReport, createConnectionRecorder, summarizeRtcStats } from "../tools/landsnap/connection-report.js";

const sensitive = "DO-NOT-EXPORT-ticket-cookie-address-SDP";
const rtcStats = () => new Map([
    ["transport", { id: "transport", type: "transport", selectedCandidatePairId: "pair", secret: sensitive }],
    ["pair", { id: "pair", type: "candidate-pair", localCandidateId: "local", remoteCandidateId: "remote", state: "succeeded", nominated: true, secret: sensitive }],
    ["local", { id: "local", type: "local-candidate", candidateType: "relay", protocol: "udp", relayProtocol: "tcp", address: sensitive, ip: sensitive, url: sensitive, usernameFragment: sensitive }],
    ["remote", { id: "remote", type: "remote-candidate", candidateType: "host", address: sensitive, port: 9999 }],
    ["video", { id: sensitive, type: "inbound-rtp", kind: "video", framesDecoded: 12, bytesReceived: 1024, trackIdentifier: sensitive }],
    ["data", { id: sensitive, type: "data-channel", state: "open", label: sensitive, protocol: sensitive, messagesSent: 3, messagesReceived: 4 }],
]);
const fixture = (getStats = async () => rtcStats()) => {
    let timestamp = 1_700_000_000_000;
    let tick = null;
    let clears = 0;
    const peer = {
        connectionState: "connecting", iceConnectionState: "checking", iceGatheringState: "gathering", signalingState: "stable",
        remoteDescription: { type: "offer", sdp: sensitive }, localDescription: { type: "answer", sdp: sensitive }, getStats,
    };
    const stream = new EventTarget();
    stream.webRtcController = { peerConnectionController: { peerConnection: peer } };
    const recorder = createConnectionRecorder({
        now: () => timestamp,
        timers: { setInterval(fn) { tick = fn; return 7; }, clearInterval(id) { assert.equal(id, 7); clears += 1; } },
    });
    return { recorder, peer, stream, advance(ms) { timestamp += ms; }, getTick: () => tick, getClears: () => clears };
};

test("RTC projection preserves useful relay/media evidence but no raw identifiers or addresses", () => {
    const report = summarizeRtcStats(rtcStats());
    assert.deepEqual(report.selectedPair, { evidence: "transport", state: "succeeded", localType: "relay", remoteType: "host", protocol: "udp", relayProtocol: "tcp" });
    assert.equal(report.localRelayCandidates, 1);
    assert.equal(report.videoFramesDecoded, 12);
    assert.equal(report.dataMessagesReceived, 4);
    assert.equal(JSON.stringify(report).includes(sensitive), false);
    assert.equal(JSON.stringify(report).includes("9999"), false);
});

test("unknown string and invalid numeric fields cannot smuggle raw values into a report", () => {
    const stats = rtcStats();
    stats.get("pair").state = sensitive;
    stats.get("local").candidateType = sensitive;
    stats.get("local").protocol = sensitive;
    stats.get("local").relayProtocol = sensitive;
    stats.get("video").framesDecoded = sensitive;
    stats.get("video").bytesReceived = Infinity;
    const report = summarizeRtcStats(stats);
    assert.equal(report.videoFramesDecoded, 0);
    assert.equal(report.videoBytesReceived, 0);
    assert.equal(JSON.stringify(report).includes(sensitive), false);
});

test("normal visits, wrong origins, and approximate fragments do not touch the document", () => {
    const document = new Proxy({}, { get() { throw Error("Diagnostic DOM must not be touched"); } });
    for (const location of [
        { hostname: "showcase.ns-tx.com", protocol: "https:", hash: "" },
        { hostname: "showcase.ns-tx.com", protocol: "https:", hash: "#connection-report-extra" },
        { hostname: "ns-tx.com", protocol: "https:", hash: "#connection-report" },
        { hostname: "showcase.ns-tx.com", protocol: "http:", hash: "#connection-report" },
    ]) assert.equal(createBrowserConnectionReport(location, document), null);
});

test("timeline captures negotiation and data readiness without inspecting event payloads", async () => {
    const { recorder, stream } = fixture();
    recorder.attach(stream);
    await Promise.resolve();
    await recorder.sample();
    stream.dispatchEvent(new Event("dataChannelOpen"));
    recorder.record("readiness-submitted");
    recorder.record("readiness-confirmed");
    recorder.record(sensitive);
    const report = recorder.report();
    for (const code of ["remote-offer-set", "local-answer-set", "ice-checking", "pair-selected", "video-decoded", "data-open", "readiness-confirmed"])
        assert.ok(report.events.some((event) => event.code === code), code);
    assert.equal(JSON.stringify(report).includes(sensitive), false);
    report.events.length = 0;
    assert.ok(recorder.report().events.length > 0, "downloads cannot mutate retained evidence");
    recorder.retire();
});

test("retirement preserves last evidence, removes listeners and stops future sampling", async () => {
    const f = fixture();
    f.recorder.attach(f.stream);
    await Promise.resolve();
    await f.recorder.sample();
    f.recorder.retire();
    const before = f.recorder.report();
    f.advance(30_000);
    f.stream.dispatchEvent(new Event("dataChannelOpen"));
    await f.recorder.sample();
    assert.deepEqual(f.recorder.report(), before);
    assert.equal(before.stats.videoFramesDecoded, 12);
    assert.equal(before.collecting, false);
    assert.equal(f.getClears(), 1);
});

test("collection ends after two minutes and event memory is bounded", async () => {
    const f = fixture();
    f.recorder.attach(f.stream);
    for (let i = 0; i < 500; i += 1) f.recorder.record("connecting");
    assert.equal(f.recorder.report().events.length, 160);
    assert.equal(f.recorder.report().eventsTruncated, true);
    f.advance(120_000);
    await f.recorder.sample();
    assert.equal(f.recorder.report().collecting, false);
    assert.equal(f.getClears(), 1);
});

test("a hanging statistics request is never multiplied and cannot keep the timer alive", async () => {
    let requests = 0;
    const f = fixture(() => { requests += 1; return new Promise(() => {}); });
    f.recorder.attach(f.stream);
    await f.recorder.sample();
    await f.recorder.sample();
    assert.equal(requests, 1);
    f.advance(120_000);
    await f.recorder.sample();
    assert.equal(f.recorder.report().collecting, false);
    assert.equal(f.getClears(), 1);
});

test("statistics errors expose a fixed boolean, never the exception text", async () => {
    const f = fixture(async () => { throw Error(sensitive); });
    f.recorder.attach(f.stream);
    await Promise.resolve();
    await f.recorder.sample();
    assert.equal(f.recorder.report().statsReadFailed, true);
    assert.equal(JSON.stringify(f.recorder.report()).includes(sensitive), false);
    f.recorder.retire();
});
