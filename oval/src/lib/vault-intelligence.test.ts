import assert from "node:assert/strict";
import test from "node:test";
import { classifyMood, redactFreshdesk, selectEvidenceSlides, selectTrack, spotifyTrackId } from "./vault-intelligence";
import type { VaultEvidenceSlide, VaultTrack } from "./vault-types";

const track = (id: string, valence: VaultTrack["valence"], intensity: VaultTrack["intensity"], themes: string[], priority = 50): VaultTrack => ({ id, spotifyTrackId: id.padEnd(22, "0").slice(0, 22), spotifyUrl: "", embedUrl: "", title: id, artist: "Test", valence, intensity, themeTags: themes, channelScopes: [], priority, active: true });

test("mood thresholds follow the approved decision model", () => {
  assert.deepEqual(classifyMood({ positive: 60, neutral: 20, negative: 20 }).valence, "uplifting");
  assert.deepEqual(classifyMood({ positive: 20, neutral: 30, negative: 50 }).valence, "tense");
  assert.deepEqual(classifyMood({ positive: 20, neutral: 60, negative: 20 }).valence, "reflective");
  assert.deepEqual(classifyMood({ positive: 35, neutral: 35, negative: 30 }).valence, "mixed");
});

test("track selection is deterministic and avoids the last two tracks", () => {
  const tracks = [track("best", "tense", "high", ["payments"], 90), track("fresh", "tense", "high", ["payments"], 40), track("wrong", "uplifting", "high", ["payments"], 100)];
  assert.equal(selectTrack({ tracks, channel: "freshdesk", valence: "tense", intensity: "high", theme: "Payments and refunds", previousTrackIds: ["best"] })?.id, "fresh");
});

test("representative evidence keeps every non-empty sentiment", () => {
  const evidence: VaultEvidenceSlide[] = Array.from({ length: 30 }, (_, index) => ({ id: String(index), sourceRef: String(index), author: "User", text: `Representative comment ${index}`, sentiment: index < 20 ? "negative" : index < 28 ? "positive" : "neutral" }));
  const selected = selectEvidenceSlides(evidence, 12);
  assert.equal(selected.length, 12);
  assert.deepEqual(new Set(selected.map((item) => item.sentiment)), new Set(["positive", "neutral", "negative"]));
});

test("Freshdesk redaction removes direct personal identifiers", () => {
  const redacted = redactFreshdesk("Email learner@example.com or call +91 9876543210 for ticket ID FD-123456");
  assert.doesNotMatch(redacted, /learner@example|9876543210|FD-123456/);
});

test("Spotify validation accepts only canonical track URLs", () => {
  assert.equal(spotifyTrackId("https://open.spotify.com/track/60nZcImufyMA1MKQY3dcCH"), "60nZcImufyMA1MKQY3dcCH");
  assert.throws(() => spotifyTrackId("https://example.com/track/60nZcImufyMA1MKQY3dcCH"));
});
