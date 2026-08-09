import type { VaultChannel, VaultEvidenceSlide, VaultIntensity, VaultMood, VaultTrack, VaultValence } from "./vault-types";

export const VAULT_ALGORITHM_VERSION = "vault-mood-v1";

const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
const bounded = (value: number, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));

export function redactFreshdesk(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "[phone redacted]")
    .replace(/\b(?:ticket|case|account|order|user|customer)\s*(?:id|#|number|no\.?|:)\s*[A-Z0-9-]{4,}\b/gi, "[identifier redacted]")
    .replace(/\b(?:FD|INC|REQ|TKT)-?\d{4,}\b/gi, "[ticket redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyMood(input: { positive: number; neutral: number; negative: number; critical?: number; accelerated?: boolean }) {
  const total = Math.max(1, input.positive + input.neutral + input.negative);
  const positiveShare = input.positive / total * 100;
  const neutralShare = input.neutral / total * 100;
  const negativeShare = input.negative / total * 100;
  const criticalShare = (input.critical || 0) / total * 100;
  let valence: VaultValence = "mixed";
  if (positiveShare >= 55) valence = "uplifting";
  else if (negativeShare >= 40 || criticalShare >= 25) valence = "tense";
  else if (neutralShare >= 50) valence = "reflective";
  const pressure = Math.max(negativeShare, criticalShare);
  const intensity: VaultIntensity = pressure >= 50 || input.accelerated ? "high" : pressure >= 25 ? "medium" : "low";
  return { valence, intensity, positiveShare, neutralShare, negativeShare };
}

export function selectTrack(input: {
  tracks: VaultTrack[];
  channel: VaultChannel;
  valence: VaultValence;
  intensity: VaultIntensity;
  theme: string;
  previousTrackIds?: string[];
}) {
  const themeWords = new Set(words(input.theme));
  const eligible = input.tracks.filter((track) => track.active && track.valence === input.valence);
  if (!eligible.length) return null;
  const previous = new Set((input.previousTrackIds || []).slice(0, 2));
  const fresh = eligible.filter((track) => !previous.has(track.id));
  const pool = fresh.length ? fresh : eligible;
  return [...pool].map((track) => {
    const themeMatch = track.themeTags.some((tag) => words(tag).some((word) => themeWords.has(word)));
    const channelMatch = !track.channelScopes.length || track.channelScopes.includes(input.channel);
    const score = 40 + (track.intensity === input.intensity ? 25 : 0) + (themeMatch ? 20 : 0) + (channelMatch ? 10 : 0) + (!previous.has(track.id) ? 5 : 0) + track.priority / 100;
    return { track, score, themeMatch, channelMatch };
  }).sort((a, b) => b.score - a.score || b.track.priority - a.track.priority || a.track.id.localeCompare(b.track.id))[0]?.track || null;
}

function evidenceScore(item: VaultEvidenceSlide) {
  const timestamp = item.date ? new Date(item.date).getTime() : 0;
  return (item.engagement || 0) * 10000000000000 + (Number.isFinite(timestamp) ? timestamp : 0);
}

export function selectEvidenceSlides(items: VaultEvidenceSlide[], limit = 12) {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.sourceRef}|${item.text.toLowerCase().replace(/\s+/g, " ").slice(0, 180)}`;
    if (!item.text.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length <= limit) return unique.sort((a, b) => evidenceScore(b) - evidenceScore(a));
  const groups = {
    positive: unique.filter((item) => item.sentiment === "positive").sort((a, b) => evidenceScore(b) - evidenceScore(a)),
    neutral: unique.filter((item) => item.sentiment === "neutral").sort((a, b) => evidenceScore(b) - evidenceScore(a)),
    negative: unique.filter((item) => item.sentiment === "negative").sort((a, b) => evidenceScore(b) - evidenceScore(a)),
  };
  const total = unique.length;
  const allocation = (Object.keys(groups) as Array<keyof typeof groups>).map((sentiment) => ({
    sentiment,
    count: groups[sentiment].length ? Math.max(1, Math.round(groups[sentiment].length / total * limit)) : 0,
  }));
  while (allocation.reduce((sum, item) => sum + item.count, 0) > limit) {
    const candidate = allocation.filter((item) => item.count > 1).sort((a, b) => b.count - a.count)[0];
    if (!candidate) break;
    candidate.count -= 1;
  }
  while (allocation.reduce((sum, item) => sum + item.count, 0) < limit) {
    const candidate = allocation.sort((a, b) => groups[b.sentiment].length - b.count - (groups[a.sentiment].length - a.count))[0];
    if (!candidate || candidate.count >= groups[candidate.sentiment].length) break;
    candidate.count += 1;
  }
  return allocation.flatMap(({ sentiment, count }) => groups[sentiment].slice(0, count)).sort((a, b) => evidenceScore(b) - evidenceScore(a));
}

export function buildVaultMood(input: {
  channel: VaultChannel;
  period: VaultMood["period"];
  coverage: VaultMood["coverage"];
  evidence: VaultEvidenceSlide[];
  dominantTheme: VaultMood["dominantTheme"];
  tracks: VaultTrack[];
  critical?: number;
  accelerated?: boolean;
  previousTrackIds?: string[];
  warnings?: string[];
}): VaultMood {
  const sentiment = input.evidence.reduce((result, item) => ({ ...result, [item.sentiment]: result[item.sentiment] + 1 }), { positive: 0, neutral: 0, negative: 0 });
  const classification = classifyMood({ ...sentiment, critical: input.critical, accelerated: input.accelerated });
  const sufficient = input.evidence.length >= 3;
  const track = sufficient ? selectTrack({ tracks: input.tracks, channel: input.channel, valence: classification.valence, intensity: classification.intensity, theme: input.dominantTheme.name, previousTrackIds: input.previousTrackIds }) : null;
  const label = !sufficient ? "Insufficient evidence" : `${classification.intensity[0].toUpperCase()}${classification.intensity.slice(1)} ${classification.valence}`;
  const confidence = sufficient ? bounded(35 + Math.log10(input.evidence.length + 1) * 25 + (input.dominantTheme.clusterIds.length ? 15 : 0)) : bounded(input.evidence.length / 3 * 30);
  const explanation = !sufficient
    ? `Only ${input.evidence.length} qualifying signals are available in this window, so OVAL will not assign a soundtrack yet.`
    : `${classification.positiveShare.toFixed(0)}% positive, ${classification.neutralShare.toFixed(0)}% neutral and ${classification.negativeShare.toFixed(0)}% negative signals make this a ${classification.intensity} ${classification.valence} window. ${input.dominantTheme.name} is the dominant semantic theme.`;
  const warnings = [...(input.warnings || [])];
  if (sufficient && !track) warnings.push(`No approved ${classification.valence} track is currently available.`);
  return {
    channel: input.channel,
    period: input.period,
    coverage: { ...input.coverage, signalCount: input.evidence.length },
    sentiment,
    dominantTheme: input.dominantTheme,
    mood: { valence: classification.valence, intensity: classification.intensity, label, explanation, confidence: Number(confidence.toFixed(1)) },
    track,
    slides: selectEvidenceSlides(input.evidence),
    algorithmVersion: VAULT_ALGORITHM_VERSION,
    warnings,
  };
}

export function spotifyTrackId(value: string) {
  const trimmed = value.trim();
  const direct = trimmed.match(/^[A-Za-z0-9]{22}$/)?.[0];
  const url = trimmed.match(/^https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:[/?].*)?$/)?.[1];
  if (!direct && !url) throw new Error("Use a canonical open.spotify.com/track URL");
  return direct || url!;
}
