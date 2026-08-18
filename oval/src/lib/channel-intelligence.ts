export type ChannelId = "reddit" | "instagram" | "youtube" | "google" | "playstore" | "freshdesk" | "linkedin";

export type SourceMode = "live" | "static_upload" | "hybrid" | "demo" | "failed";
export type Freshness = "fresh" | "stale" | "static" | "failed" | "unknown";
export type SentimentLabel = "positive" | "negative" | "neutral" | "mixed" | "unknown";
export type ClusterMethod = "supervised" | "unsupervised" | "hybrid";

export type SourceStatus = {
  mode: SourceMode;
  latestFetchedAt: string | null;
  dataWindowStart: string | null;
  dataWindowEnd: string | null;
  freshness: Freshness;
  freshnessLabel: string;
  limitations: string[];
};

export type IntelligenceVolume = {
  totalItems: number;
  textItems: number;
  analyzedItems: number;
};

export type SentimentSummary = {
  method: string;
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
  confidence: number;
};

export type IntelligenceTopic = {
  id: string;
  name: string;
  method: ClusterMethod;
  mentions: number;
  share: number;
  sentiment: SentimentLabel;
  severity: "low" | "medium" | "high" | "critical";
  businessOwner: string;
  keywords: string[];
  evidence: string[];
};

export type PriorityItem = {
  id: string;
  channel: ChannelId;
  title: string;
  text: string;
  url?: string | null;
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  reason: string[];
  topic?: string;
  sentiment?: SentimentLabel;
  publishedAt?: string | null;
  rating?: number | null;
  version?: string | null;
  replied?: boolean | null;
  evidenceScore?: number;
  urgencyScore?: number;
  recommendedOwner?: string;
  recommendedAction?: string;
  enrichment?: MentionEnrichment;
};

export type CanonicalText = {
  original: string;
  cleaned: string;
  normalized: string;
  redacted: string;
  emojis: string[];
  hashtags: string[];
  mentions: string[];
};

export type MentionEnrichment = {
  relevance: { label: "pw_relevant" | "competitor_relevant" | "education_industry_relevant" | "irrelevant" | "uncertain"; confidence: number };
  entities: Array<{ type: string; value: string; canonicalName: string; confidence: number }>;
  topics: Array<{ id: string; path: string[]; label: string; confidence: number }>;
  intents: Array<{ label: string; confidence: number }>;
  sentiment: { label: SentimentLabel | "very_positive" | "very_negative" | "uncertain"; confidence: number };
  aspects: Array<{ aspect: string; sentiment: SentimentLabel; confidence: number }>;
  emotions: Array<{ label: string; confidence: number }>;
  sarcasm: { probability: number; interpretedSentiment: SentimentLabel };
  spam: { label: "organic" | "likely_spam" | "likely_bot" | "likely_coordinated" | "promotional" | "fake_positive" | "fake_negative" | "review_bombing" | "uncertain"; confidence: number; signals: string[] };
  severity: { label: "informational" | "low" | "medium" | "high" | "critical"; score: number };
  urgencyScore: number;
  evidenceScore: number;
  recommendedOwner: string;
  recommendedActions: string[];
  text: CanonicalText;
};

export type IncidentCandidate = {
  id: string;
  title: string;
  status: "watchlist" | "suggested_incident" | "incident";
  severity: "low" | "medium" | "high" | "critical";
  crisisLevel: "normal" | "watch" | "emerging" | "high_risk" | "crisis";
  crisisScore: number;
  topic: string;
  owner: string;
  mentionCount: number;
  negativeShare: number;
  evidence: PriorityItem[];
  drivers: string[];
  recommendedActions: string[];
};

export type ChannelIntelligenceContract = {
  version: "2026-06-channel-intelligence-v1";
  channel: ChannelId;
  sourceStatus: SourceStatus;
  volume: IntelligenceVolume;
  sentiment: SentimentSummary;
  supervisedTopics: IntelligenceTopic[];
  unsupervisedClusters: IntelligenceTopic[];
  priorityQueue: PriorityItem[];
  incidentCandidates: IncidentCandidate[];
  processing: {
    pipeline: string[];
    algorithms: {
      preprocessing: string;
      relevance: string;
      entities: string;
      topics: string;
      intent: string;
      sentiment: string;
      severity: string;
      priority: string;
      crisis: string;
    };
    quality: {
      enrichedItems: number;
      reviewableItems: number;
      piiRedactedItems: number;
      likelySpamItems: number;
      averageEvidenceScore: number;
    };
  };
  leadershipRead: {
    headline: string;
    whatChanged: string;
    whyItMatters: string;
    recommendedActions: string[];
  };
};

export type TextSignal = {
  id?: string | number | null;
  title?: string | null;
  text?: string | null;
  url?: string | null;
  rating?: number | null;
  sentiment?: string | null;
  engagement?: number | null;
  comments?: number | null;
  publishedAt?: string | null;
  fetchedAt?: string | null;
  replied?: boolean | null;
  status?: string | null;
  owner?: string | null;
  version?: string | null;
  sourceType?: string | null;
  sourceAccountId?: string | null;
  device?: string | null;
  os?: string | null;
  metadata?: Record<string, any> | null;
};

type TopicRule = {
  id: string;
  name: string;
  owner: string;
  severity: IntelligenceTopic["severity"];
  sentiment: SentimentLabel;
  keywords: string[];
};

export const BUSINESS_TOPIC_RULES: TopicRule[] = [
  { id: "overselling", name: "Overselling", owner: "Sales Governance + Legal", severity: "high", sentiment: "negative", keywords: ["promised", "promise", "advertisement", "advertised", "ad said", "shown in ad", "not provided", "not delivered", "false promise", "over promise"] },
  { id: "misselling", name: "Mis-selling", owner: "Sales QA + Support Ops", severity: "high", sentiment: "negative", keywords: ["mis sell", "missell", "wrong batch", "wrong course", "counsellor", "counselor", "sold me", "misguided", "misleading", "told me"] },
  { id: "access", name: "Access & Login", owner: "Aditya Kumar", severity: "high", sentiment: "negative", keywords: ["access", "login", "locked", "otp", "account", "subscription", "not opening", "cannot see", "paid but"] },
  { id: "payment", name: "Payments & Refunds", owner: "Aayush", severity: "critical", sentiment: "negative", keywords: ["refund", "payment", "paid", "money", "amount deducted", "upi", "fee", "fees", "transaction", "invoice"] },
  { id: "payment_gateway", name: "Payment gateway failures", owner: "Keshav", severity: "critical", sentiment: "negative", keywords: ["payment gateway", "gateway", "upi", "transaction failed", "amount deducted", "deducted", "failed payment", "payment failed", "txn"] },
  { id: "delivery", name: "Orders & Delivery", owner: "Store Ops", severity: "high", sentiment: "negative", keywords: ["order", "delivery", "book", "module", "kit", "tracking", "shipment", "parcel", "wrong product", "address"] },
  { id: "video", name: "App & Video Reliability", owner: "Product Reliability", severity: "high", sentiment: "negative", keywords: ["video", "playback", "buffer", "lecture", "download", "quality", "app", "slow", "lag", "loading", "not working"] },
  { id: "content", name: "Teaching Quality", owner: "Academic Ops", severity: "medium", sentiment: "mixed", keywords: ["teacher", "faculty", "sir", "mam", "lecture", "content", "concept", "class", "quality", "irrelevant"] },
  { id: "batch", name: "Batch & Course Ops", owner: "Aditya Kumar", severity: "medium", sentiment: "mixed", keywords: ["batch", "course", "test", "dpp", "planner", "validity", "arjuna", "lakshya", "yakeen", "prayas", "neet", "jee"] },
  { id: "support", name: "Support Resolution", owner: "Support Ops", severity: "high", sentiment: "negative", keywords: ["support", "customer care", "response", "resolve", "complaint", "help", "ticket", "call", "contact"] },
  { id: "trust", name: "Trust & Scam Risk", owner: "PR + Legal", severity: "critical", sentiment: "negative", keywords: ["scam", "fraud", "fake", "controversy", "consumer", "court", "legal", "exposed", "cheat"] },
  { id: "competitor", name: "Competitor Switching", owner: "Strategy", severity: "medium", sentiment: "mixed", keywords: ["allen", "unacademy", "vedantu", "competishun", "apni kaksha", "switch", "better than", "vs "] },
  { id: "love", name: "Teaching love and brand advocacy", owner: "Brand + Academic", severity: "low", sentiment: "positive", keywords: ["best", "great", "excellent", "helpful", "thank", "love", "affordable", "amazing", "motivation"] },
];

const HINGLISH_MAP: Array<[RegExp, string]> = [
  [/\bnhi\b|\bni\b/gi, "nahi"],
  [/\bkr\b/gi, "kar"],
  [/\bkro\b/gi, "karo"],
  [/\brha\b/gi, "raha"],
  [/\braha h\b/gi, "raha hai"],
  [/\bbekar\b/gi, "bad"],
  [/\bmast\b|\bop\b/gi, "excellent"],
  [/\bl app\b/gi, "negative app feedback"],
  [/\bw teacher\b/gi, "positive faculty feedback"],
];

const EMOJI_EMOTIONS: Record<string, string> = {
  "😡": "anger",
  "😂": "laughter_or_sarcasm",
  "💀": "mockery_or_intensity",
  "❤️": "love",
  "❤": "love",
  "🔥": "high_praise_or_hype",
  "🤡": "mockery",
  "🙏": "request_or_gratitude",
  "😭": "distress",
  "😢": "sadness",
};

const ENTITY_RULES: Array<{ type: string; canonicalName: string; aliases: string[] }> = [
  { type: "brand", canonicalName: "Physics Wallah", aliases: ["physics wallah", "physicswallah", "pw", "alakh pandey"] },
  { type: "batch", canonicalName: "Lakshya", aliases: ["lakshya", "lakshay"] },
  { type: "batch", canonicalName: "Arjuna", aliases: ["arjuna"] },
  { type: "batch", canonicalName: "Yakeen", aliases: ["yakeen"] },
  { type: "batch", canonicalName: "Prayas", aliases: ["prayas"] },
  { type: "exam_category", canonicalName: "JEE", aliases: ["jee", "jee mains", "jee advanced"] },
  { type: "exam_category", canonicalName: "NEET", aliases: ["neet"] },
  { type: "competitor", canonicalName: "Allen", aliases: ["allen"] },
  { type: "competitor", canonicalName: "Unacademy", aliases: ["unacademy"] },
  { type: "competitor", canonicalName: "Vedantu", aliases: ["vedantu"] },
  { type: "competitor", canonicalName: "Competishun", aliases: ["competishun"] },
  { type: "app_feature", canonicalName: "Video Playback", aliases: ["video", "playback", "lecture", "downloaded lecture", "buffer"] },
  { type: "app_feature", canonicalName: "Login/OTP", aliases: ["login", "otp", "sign in"] },
  { type: "product", canonicalName: "Study Material", aliases: ["book", "module", "kit", "notes"] },
  { type: "legal_keyword", canonicalName: "Legal Escalation", aliases: ["consumer court", "legal", "fraud", "scam", "notice"] },
];

const TOPIC_TAXONOMY: Array<{ id: string; path: string[]; label: string; keywords: string[]; owner: string }> = [
  { id: "sales.overselling", path: ["Sales Governance", "Overselling"], label: "Overselling or over-promised feature", owner: "Sales Governance + Legal", keywords: ["promised", "promise", "advertisement", "advertised", "ad said", "shown in ad", "not provided", "not delivered", "false promise"] },
  { id: "sales.misselling", path: ["Sales Governance", "Mis-selling"], label: "Mis-selling or wrong purchase guidance", owner: "Sales QA + Support Ops", keywords: ["mis sell", "missell", "wrong batch", "wrong course", "counsellor", "counselor", "sold me", "misguided", "misleading", "told me"] },
  { id: "technology.app_crash", path: ["Technology", "App", "Crash"], label: "App crash or instability", owner: "Product Reliability", keywords: ["crash", "hang", "freeze", "bug", "glitch"] },
  { id: "technology.login_otp", path: ["Technology", "App", "Login/OTP"], label: "Login or OTP issue", owner: "Product + Identity", keywords: ["login", "otp", "sign in", "account"] },
  { id: "technology.video_playback", path: ["Technology", "App", "Video playback"], label: "Video playback issue", owner: "Product Reliability", keywords: ["video", "playback", "buffer", "lecture", "download", "quality"] },
  { id: "commerce.payment_gateway", path: ["Commerce", "Payment gateway"], label: "Payment gateway failure", owner: "Keshav", keywords: ["payment gateway", "gateway", "upi", "transaction failed", "amount deducted", "deducted", "failed payment", "payment failed", "txn"] },
  { id: "commerce.payment_failed", path: ["Commerce", "Payment"], label: "Payment failed or deducted", owner: "Aayush", keywords: ["payment", "transaction", "paid"] },
  { id: "commerce.refund_delay", path: ["Commerce", "Refund"], label: "Refund delay or request", owner: "Aayush", keywords: ["refund", "money back", "return amount"] },
  { id: "commerce.activation", path: ["Commerce", "Course activation"], label: "Paid course not activated", owner: "Aditya Kumar", keywords: ["activate", "activated", "access", "paid but", "cannot see"] },
  { id: "academic.faculty_praise", path: ["Academic", "Faculty"], label: "Faculty praise", owner: "Academic Ops", keywords: ["best teacher", "sir", "mam", "faculty", "excellent teacher"] },
  { id: "academic.content_quality", path: ["Academic", "Content"], label: "Content quality or relevance", owner: "Academic Quality", keywords: ["content", "irrelevant", "quality", "concept", "syllabus", "wrong answer"] },
  { id: "support.no_response", path: ["Support", "Response"], label: "Support delay or no response", owner: "Support Ops", keywords: ["support", "customer care", "no response", "not replying", "resolve"] },
  { id: "brand.trust", path: ["Brand", "Trust"], label: "Trust, scam or fraud allegation", owner: "PR + Legal", keywords: ["scam", "fraud", "fake", "cheat", "consumer court", "legal"] },
  { id: "brand.competitor", path: ["Brand", "Competitor comparison"], label: "Competitor comparison", owner: "Strategy", keywords: ["allen", "unacademy", "vedantu", "competishun", "vs", "better than"] },
  { id: "offline.centre", path: ["Offline", "Centre"], label: "Offline centre experience", owner: "Offline Ops", keywords: ["centre", "center", "vidyapeeth", "classroom", "counselling"] },
];

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoMinMax(values: Array<string | null | undefined>) {
  const dates = values.map(asDate).filter(Boolean) as Date[];
  if (!dates.length) return { min: null, max: null };
  dates.sort((a, b) => a.getTime() - b.getTime());
  return { min: dates[0].toISOString(), max: dates[dates.length - 1].toISOString() };
}

export function buildSourceStatus(input: {
  mode: SourceMode;
  fetchedAtValues?: Array<string | null | undefined>;
  publishedAtValues?: Array<string | null | undefined>;
  generatedAt?: string | null;
  limitations?: string[];
  staleAfterDays?: number;
}): SourceStatus {
  const fetched = isoMinMax(input.fetchedAtValues || []);
  const published = isoMinMax(input.publishedAtValues || []);
  const latest = fetched.max || input.generatedAt || null;
  const latestDate = asDate(latest);
  const staleAfterDays = input.staleAfterDays ?? 7;

  let freshness: Freshness = "unknown";
  if (input.mode === "failed") freshness = "failed";
  else if (input.mode === "static_upload") freshness = "static";
  else if (latestDate) {
    const ageDays = (Date.now() - latestDate.getTime()) / 86400000;
    freshness = ageDays <= staleAfterDays ? "fresh" : "stale";
  }

  const freshnessLabel =
    freshness === "fresh" ? "Fresh live data" :
    freshness === "stale" ? "Stale live data" :
    freshness === "static" ? "Static uploaded dataset" :
    freshness === "failed" ? "Fetch failed" :
    "Freshness unknown";

  return {
    mode: input.mode,
    latestFetchedAt: latest,
    dataWindowStart: published.min || fetched.min || null,
    dataWindowEnd: published.max || fetched.max || null,
    freshness,
    freshnessLabel,
    limitations: input.limitations || [],
  };
}

export function normalizeSentiment(value: string | null | undefined): SentimentLabel {
  const text = String(value || "").toLowerCase();
  if (text.includes("positive")) return "positive";
  if (text.includes("negative") || text.includes("risk")) return "negative";
  if (text.includes("mixed")) return "mixed";
  if (text.includes("neutral")) return "neutral";
  return "unknown";
}

export function summarizeSentiment(signals: TextSignal[], method: string, fallback?: Partial<SentimentSummary>): SentimentSummary {
  const summary: SentimentSummary = {
    method,
    positive: fallback?.positive || 0,
    negative: fallback?.negative || 0,
    neutral: fallback?.neutral || 0,
    mixed: fallback?.mixed || 0,
    confidence: fallback?.confidence ?? 0.55,
  };
  if (!signals.length) return summary;
  const counted = { positive: 0, negative: 0, neutral: 0, mixed: 0, unknown: 0 };
  for (const signal of signals) counted[normalizeSentiment(signal.sentiment)] += 1;
  const known = counted.positive + counted.negative + counted.neutral + counted.mixed;
  if (!known) return summary;
  return {
    method,
    positive: counted.positive,
    negative: counted.negative,
    neutral: counted.neutral + counted.unknown,
    mixed: counted.mixed,
    confidence: Math.min(0.9, 0.45 + known / Math.max(signals.length, 1) * 0.35),
  };
}

export function buildSupervisedTopics(signals: TextSignal[], options: { denominator?: number } = {}): IntelligenceTopic[] {
  const denominator = options.denominator || signals.filter((signal) => `${signal.title || ""} ${signal.text || ""}`.trim()).length || signals.length || 1;
  return BUSINESS_TOPIC_RULES.map((rule) => {
    const evidence: string[] = [];
    let mentions = 0;
    for (const signal of signals) {
      const text = `${signal.title || ""} ${signal.text || ""}`.replace(/\s+/g, " ").trim();
      const lower = text.toLowerCase();
      if (!text || !rule.keywords.some((keyword) => lower.includes(keyword))) continue;
      mentions += 1;
      if (evidence.length < 4) evidence.push(text.slice(0, 220));
    }
    return {
      id: rule.id,
      name: rule.name,
      method: "supervised" as const,
      mentions,
      share: Math.round((mentions / denominator) * 1000) / 10,
      sentiment: rule.sentiment,
      severity: rule.severity,
      businessOwner: rule.owner,
      keywords: rule.keywords.slice(0, 6),
      evidence,
    };
  }).filter((topic) => topic.mentions > 0).sort((a, b) => b.mentions - a.mentions);
}

function severityFromScore(score: number): PriorityItem["severity"] {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function scorePriority(signal: TextSignal, channel: ChannelId, topics: IntelligenceTopic[]): PriorityItem {
  const text = `${signal.title || ""} ${signal.text || ""}`.replace(/\s+/g, " ").trim();
  const sentiment = normalizeSentiment(signal.sentiment);
  const matchedTopic = topics.find((topic) => {
    const lower = text.toLowerCase();
    return topic.keywords.some((keyword) => lower.includes(keyword));
  });
  const reason: string[] = [];
  let score = 0;

  if (sentiment === "negative") { score += 22; reason.push("negative language"); }
  if (signal.rating && signal.rating <= 2) { score += 28; reason.push("low rating"); }
  if (signal.rating && signal.rating >= 4 && /issue|problem|not working|refund|crash|unable|please|need/i.test(text)) { score += 22; reason.push("product follow-up needed"); }
  if (signal.replied === false) { score += 12; reason.push("no visible response"); }
  if (/urgent|legal|consumer|complaint|fraud|scam|refund|payment|access|not working/i.test(text)) { score += 25; reason.push("business-critical vocabulary"); }
  if ((signal.engagement || 0) > 1000) { score += 15; reason.push("high engagement"); }
  else if ((signal.engagement || 0) > 100) { score += 8; reason.push("meaningful engagement"); }
  if ((signal.comments || 0) > 100) { score += 12; reason.push("deep discussion"); }
  if (matchedTopic) { score += matchedTopic.severity === "critical" ? 18 : matchedTopic.severity === "high" ? 12 : 6; reason.push(`${matchedTopic.name} topic`); }

  const published = asDate(signal.publishedAt || signal.fetchedAt || null);
  if (published) {
    const ageDays = (Date.now() - published.getTime()) / 86400000;
    if (ageDays <= 7) { score += 16; reason.push("recent"); }
    else if (ageDays <= 30) { score += 8; reason.push("within last month"); }
  }

  if (channel === "freshdesk" && !["Closed", "Resolved"].includes(signal.status || "")) { score += 18; reason.push("active support case"); }
  if (channel === "google" && /scam|fraud|refund|customer care|complaint/i.test(text)) { score += 20; reason.push("enrollment-front-door risk"); }

  return {
    id: String(signal.id || `${channel}-${text.slice(0, 32)}`),
    channel,
    title: signal.title || matchedTopic?.name || text.slice(0, 80) || "Untitled signal",
    text,
    url: signal.url || null,
    score: Math.min(100, score),
    severity: severityFromScore(score),
    reason: reason.slice(0, 4),
    topic: matchedTopic?.name,
    sentiment,
    publishedAt: signal.publishedAt || null,
    rating: signal.rating || null,
    version: signal.version || null,
    replied: signal.replied ?? null,
  };
}

export function buildPriorityQueue(channel: ChannelId, signals: TextSignal[], topics: IntelligenceTopic[], limit = 12): PriorityItem[] {
  return signals
    .filter((signal) => `${signal.title || ""} ${signal.text || ""}`.trim().length > 8)
    .map((signal) => {
      const item = scorePriority(signal, channel, topics);
      const enrichment = enrichMention(signal, channel);
      return {
        ...item,
        score: Math.max(item.score, enrichment.urgencyScore),
        severity: severityFromScore(Math.max(item.score, enrichment.urgencyScore)),
        evidenceScore: enrichment.evidenceScore,
        urgencyScore: enrichment.urgencyScore,
        recommendedOwner: enrichment.recommendedOwner,
        recommendedAction: enrichment.recommendedActions[0],
        enrichment,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function fromRuleClusters(clusters: any[] = []): IntelligenceTopic[] {
  return clusters.map((cluster, index) => ({
    id: `unsupervised-${index}`,
    name: cluster.name || cluster.cluster_label || "Emerging cluster",
    method: "unsupervised" as const,
    mentions: Number(cluster.mentions || cluster.mention_count || cluster.count || 0),
    share: 0,
    sentiment: normalizeSentiment(cluster.sentiment || (cluster.avg_sentiment < -0.1 ? "negative" : cluster.avg_sentiment > 0.1 ? "positive" : "mixed")),
    severity: normalizeSentiment(cluster.sentiment) === "negative" ? "high" : "medium",
    businessOwner: "Insights",
    keywords: cluster.keywords || [],
    evidence: cluster.evidence || cluster.representative_texts || cluster.examples || [],
  }));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function extractEmoji(text: string) {
  return Array.from(text).filter((char) => EMOJI_EMOTIONS[char]);
}

function preprocessText(raw: string): CanonicalText {
  const original = String(raw || "");
  const hashtags = Array.from(original.matchAll(/#[\p{L}\p{N}_]+/gu)).map((m) => m[0]);
  const mentions = Array.from(original.matchAll(/@[\p{L}\p{N}_.]+/gu)).map((m) => m[0]);
  const emojis = extractEmoji(original);
  let cleaned = original
    .normalize("NFKC")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/\s+/g, " ")
    .trim();
  cleaned = cleaned.replace(/([a-z])\1{3,}/gi, "$1$1");
  let normalized = cleaned.toLowerCase();
  for (const [pattern, replacement] of HINGLISH_MAP) normalized = normalized.replace(pattern, replacement);
  normalized = normalized.replace(/\s+/g, " ").trim();
  const redacted = cleaned
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "[PHONE]")
    .replace(/\b(?:order|ticket|payment|txn|transaction)\s*(?:id|no|number)?\s*[:#-]?\s*[A-Z0-9/-]{5,}\b/gi, "[ID]")
    .replace(/\b\d{12}\b/g, "[ID]");
  return { original, cleaned, normalized, redacted, emojis, hashtags, mentions };
}

function detectLanguage(text: CanonicalText) {
  const hasHindiRoman = /\b(nahi|raha|hai|karo|bekar|paisa|kab|milega|bhai|sir|mam)\b/i.test(text.normalized);
  const hasEnglish = /[a-z]/i.test(text.normalized);
  return {
    detected: [hasEnglish ? "english" : "", hasHindiRoman ? "hindi_roman" : ""].filter(Boolean),
    primary: hasHindiRoman && hasEnglish ? "hinglish" : hasEnglish ? "english" : "unknown",
    codeMixed: Boolean(hasHindiRoman && hasEnglish),
    script: ["latin"],
    confidence: hasHindiRoman ? 0.82 : hasEnglish ? 0.72 : 0.4,
  };
}

function detectRelevance(text: CanonicalText, signal: TextSignal) {
  const combined = `${text.normalized} ${signal.owner || ""}`.toLowerCase();
  const pwHit = /\b(physics wallah|physicswallah|alakh|pw|lakshya|arjuna|yakeen|prayas|vidyapeeth)\b/.test(combined);
  const competitorHit = /\b(allen|unacademy|vedantu|competishun|apni kaksha)\b/.test(combined);
  const educationHit = /\b(jee|neet|batch|course|teacher|faculty|lecture|dpp|test)\b/.test(combined);
  if (pwHit) return { label: "pw_relevant" as const, confidence: 0.9 };
  if (competitorHit) return { label: "competitor_relevant" as const, confidence: 0.74 };
  if (educationHit) return { label: "education_industry_relevant" as const, confidence: 0.64 };
  return { label: "uncertain" as const, confidence: 0.48 };
}

function extractEntities(text: CanonicalText, signal: TextSignal) {
  const combined = `${text.normalized} ${signal.version || ""} ${signal.device || ""}`.toLowerCase();
  const entities: MentionEnrichment["entities"] = [];
  for (const rule of ENTITY_RULES) {
    const alias = rule.aliases.find((a) => combined.includes(a.toLowerCase()));
    if (alias) entities.push({ type: rule.type, value: alias, canonicalName: rule.canonicalName, confidence: 0.82 });
  }
  if (signal.version) entities.push({ type: "app_version", value: signal.version, canonicalName: signal.version, confidence: 0.9 });
  if (signal.device) entities.push({ type: "device", value: signal.device, canonicalName: signal.device, confidence: 0.82 });
  return entities;
}

function classifyTopics(text: CanonicalText) {
  const topics: MentionEnrichment["topics"] = [];
  for (const rule of TOPIC_TAXONOMY) {
    const hits = rule.keywords.filter((keyword) => text.normalized.includes(keyword));
    if (hits.length) {
      topics.push({
        id: rule.id,
        path: rule.path,
        label: rule.label,
        confidence: Math.min(0.95, 0.58 + hits.length * 0.11),
      });
    }
  }
  if (!topics.length) topics.push({ id: "unknown_emerging_topic", path: ["Unknown"], label: "Unknown emerging topic", confidence: 0.42 });
  return topics.sort((a, b) => b.confidence - a.confidence);
}

function classifyIntents(text: CanonicalText, signal: TextSignal) {
  const rules: Array<[string, RegExp, number]> = [
    ["refund_request", /\brefund|money back\b/i, 0.9],
    ["payment_help", /\bpayment|paid|deducted|transaction|upi\b/i, 0.86],
    ["technical_support", /\bapp|video|login|otp|buffer|crash|not working|unable\b/i, 0.84],
    ["purchase_intent", /\bbuy|purchase|admission|join|which batch|should i take\b/i, 0.76],
    ["feature_request", /\bplease add|need option|feature|should allow|improve\b/i, 0.78],
    ["cancellation_intent", /\bcancel|leave|switch|quit|unsubscribe\b/i, 0.82],
    ["churn_signal", /\bswitch|allen|unacademy|better than|leaving\b/i, 0.75],
    ["praise", /\bbest|excellent|thank|love|amazing|helpful\b/i, 0.82],
    ["competitor_comparison", /\ballen|unacademy|vedantu|competishun|vs\b/i, 0.84],
    ["misinformation", /\bfake news|rumor|rumour|exposed\b/i, 0.68],
    ["legal_escalation", /\blegal|consumer court|notice|case|complaint\b/i, 0.88],
    ["abuse", /\bidiot|stupid|fraud|cheat\b/i, 0.62],
    ["spam", /\bpromo|telegram link|join now|free pdf|whatsapp\b/i, 0.72],
    ["question", /\?|kab|how|why|kya|which|when/i, 0.64],
  ];
  const intents = rules.filter(([, pattern]) => pattern.test(text.normalized)).map(([label, , confidence]) => ({ label, confidence }));
  if ((signal.rating || 0) <= 2 && !intents.some((i) => i.label === "complaint")) intents.unshift({ label: "complaint", confidence: 0.86 });
  if (!intents.length && /bad|issue|problem|nahi|not/.test(text.normalized)) intents.push({ label: "complaint", confidence: 0.68 });
  return intents.slice(0, 5);
}

function sentimentFromSignal(text: CanonicalText, signal: TextSignal): MentionEnrichment["sentiment"] {
  const existing = normalizeSentiment(signal.sentiment);
  const positive = /\bbest|excellent|thank|love|amazing|helpful|great|good\b/i.test(text.normalized);
  const negative = /\bbad|worst|refund|not working|crash|fraud|scam|unable|problem|issue|disappointed|angry|bekar\b/i.test(text.normalized);
  if ((signal.rating || 0) <= 2) return { label: negative || positive ? "very_negative" : "negative", confidence: 0.86 };
  if ((signal.rating || 0) >= 4 && negative) return { label: "mixed", confidence: 0.82 };
  if (negative && positive) return { label: "mixed", confidence: 0.78 };
  if (negative || existing === "negative") return { label: "negative", confidence: 0.76 };
  if (positive || existing === "positive") return { label: "positive", confidence: 0.74 };
  return { label: existing === "unknown" ? "neutral" : existing, confidence: 0.55 };
}

function aspectSentiments(text: CanonicalText) {
  const aspectRules: Array<[string, RegExp]> = [
    ["faculty_quality", /teacher|faculty|sir|mam/],
    ["content_quality", /content|concept|syllabus|wrong answer|irrelevant/],
    ["app_performance", /app|crash|slow|lag|loading/],
    ["recorded_video_experience", /video|lecture|playback|buffer|download/],
    ["payment_experience", /payment|paid|deducted|transaction/],
    ["refund_experience", /refund/],
    ["support_experience", /support|customer care|response|resolve/],
    ["pricing", /price|fee|fees|cheap|affordable|cost/],
    ["brand_trust", /scam|fraud|trust|fake|legal/],
    ["competitor_comparison", /allen|unacademy|vedantu|competishun/],
  ];
  const sent = sentimentFromSignal(text, {}).label;
  const normalizedSent = sent === "very_negative" ? "negative" : sent === "very_positive" ? "positive" : normalizeSentiment(sent);
  return aspectRules
    .filter(([, pattern]) => pattern.test(text.normalized))
    .map(([aspect]) => ({ aspect, sentiment: normalizedSent === "unknown" ? "neutral" : normalizedSent, confidence: 0.76 }));
}

function detectEmotions(text: CanonicalText) {
  const emotions: MentionEnrichment["emotions"] = [];
  const add = (label: string, confidence: number) => {
    if (!emotions.some((emotion) => emotion.label === label)) emotions.push({ label, confidence });
  };
  for (const emoji of text.emojis) add(EMOJI_EMOTIONS[emoji], 0.78);
  if (/angry|fraud|scam|worst|😡/.test(text.normalized)) add("anger", 0.82);
  if (/please|help|urgent|exam|tomorrow|🙏/.test(text.normalized)) add("urgency", 0.78);
  if (/confus|kya|why|how|unable/.test(text.normalized)) add("confusion", 0.68);
  if (/disappointed|bad|bekar|not working/.test(text.normalized)) add("disappointment", 0.74);
  if (/thank|love|best|❤️|🔥/.test(text.normalized)) add("gratitude", 0.72);
  if (/😂|🤡|💀|wah|great.*crash|best.*not working/i.test(text.original)) add("mockery", 0.76);
  if (!emotions.length) add("neutral", 0.55);
  return emotions.slice(0, 4);
}

function detectSarcasm(text: CanonicalText, sentiment: MentionEnrichment["sentiment"]) {
  const positivePhrase = /\bbest|great|wah|amazing|thanks\b/i.test(text.normalized);
  const negativeEvent = /\bcrash|not working|refund|fraud|scam|bad|worst|unable\b/i.test(text.normalized);
  const sarcasmEmoji = text.emojis.some((emoji) => ["😂", "🤡", "💀"].includes(emoji));
  const probability = positivePhrase && negativeEvent ? 0.86 : sarcasmEmoji && negativeEvent ? 0.78 : 0.12;
  return {
    probability,
    interpretedSentiment: probability > 0.65 ? "negative" as const : normalizeSentiment(sentiment.label),
  };
}

function detectSpam(text: CanonicalText, signal: TextSignal): MentionEnrichment["spam"] {
  const signals: string[] = [];
  if ((text.hashtags || []).length > 8) signals.push("excess hashtag use");
  if (/join now|free pdf|telegram|whatsapp|dm me|promo code/i.test(text.normalized)) signals.push("promotional keywords");
  if (text.normalized.length < 12 && (signal.rating || 0) >= 5) signals.push("low-information positive");
  if (/(.)\1{5,}/.test(text.original)) signals.push("repeated characters");
  if (!signals.length) return { label: "organic", confidence: 0.72, signals: [] };
  return { label: signals.some((s) => s.includes("promotional")) ? "promotional" : "likely_spam", confidence: 0.66 + Math.min(0.2, signals.length * 0.06), signals };
}

function severityAndUrgency(input: {
  channel: ChannelId;
  signal: TextSignal;
  text: CanonicalText;
  topics: MentionEnrichment["topics"];
  intents: MentionEnrichment["intents"];
  sentiment: MentionEnrichment["sentiment"];
  emotions: MentionEnrichment["emotions"];
}) {
  const severityWeight =
    /legal|fraud|scam|consumer court|payment|refund|access|exam|crash/i.test(input.text.normalized) ? 90 :
    /not working|unable|support|delivery|login|video/i.test(input.text.normalized) ? 70 :
    normalizeSentiment(input.sentiment.label) === "negative" ? 55 : 25;
  const reach = Math.min(100, Math.log10(Math.max(1, (input.signal.engagement || 0) + (input.signal.comments || 0) * 3)) * 28);
  const businessImpact = input.intents.some((i) => ["refund_request", "payment_help", "legal_escalation", "technical_support"].includes(i.label)) ? 85 : 45;
  const examSensitivity = /\bjee|neet|exam|test|tomorrow|today\b/i.test(input.text.normalized) ? 80 : 30;
  const escalation = /\burgent|legal|consumer|complaint|fraud|scam|please help\b/i.test(input.text.normalized) ? 90 : 20;
  const confidence = Math.max(input.sentiment.confidence, ...input.topics.map((topic) => topic.confidence));
  let score = 0.25 * severityWeight + 0.15 * reach + 0.15 * businessImpact + 0.1 * examSensitivity + 0.1 * confidence * 100 + 0.05 * escalation;
  if (input.channel === "playstore" && input.signal.rating && input.signal.rating <= 2) score += 12;
  if (input.channel === "freshdesk" && !["Closed", "Resolved"].includes(input.signal.status || "")) score += 14;
  if (input.channel === "google" && /scam|fraud|refund|customer care|complaint/i.test(input.text.normalized)) score += 16;
  if (input.channel === "reddit" && (input.signal.comments || 0) > 100) score += 10;
  if (input.channel === "youtube" && /\bwrong answer|lecture|faculty|exam\b/i.test(input.text.normalized)) score += 8;
  const urgencyScore = clamp(score);
  const label = urgencyScore >= 85 ? "critical" : urgencyScore >= 68 ? "high" : urgencyScore >= 42 ? "medium" : urgencyScore >= 20 ? "low" : "informational";
  return { label, score: urgencyScore, urgencyScore };
}

function routeOwner(topics: MentionEnrichment["topics"], intents: MentionEnrichment["intents"], text: CanonicalText) {
  const top = topics[0]?.id || "";
  if (top.includes("overselling") || /promised|advertised|shown in ad|false promise|not delivered/.test(text.normalized)) return "Sales Governance + Legal";
  if (top.includes("misselling") || /wrong batch|wrong course|counsellor|counselor|misleading|misguided|sold me/.test(text.normalized)) return "Sales QA + Support Ops";
  if (top.includes("payment_gateway") || /payment gateway|gateway|upi|transaction failed|amount deducted|deducted|failed payment|payment failed|txn/.test(text.normalized)) return "Keshav";
  if (top.includes("refund") || top.includes("payment") || intents.some((i) => ["payment_help", "refund_request"].includes(i.label))) return "Aayush";
  if (top.includes("activation") || /access|batch activate|batch|course|validity|planner|dpp|test/.test(text.normalized)) return "Aditya Kumar";
  if (top.includes("crash") || top.includes("video") || top.includes("login")) return "Product Reliability";
  if (top.includes("faculty") || top.includes("content")) return "Academic Quality";
  if (top.includes("trust") || intents.some((i) => i.label === "legal_escalation")) return "PR + Legal";
  if (top.includes("competitor")) return "Strategy";
  if (top.includes("centre")) return "Offline Ops";
  if (top.includes("support")) return "Support Ops";
  return "Insights Triage";
}

function recommendedActions(owner: string, severity: MentionEnrichment["severity"], topics: MentionEnrichment["topics"]) {
  const topic = topics[0]?.id || "";
  if (severity.label === "critical" && /trust|legal|refund|payment/.test(topic)) return ["Open incident and notify owner immediately", "Collect top evidence and verify facts before public response", "Track cross-channel confirmation for 24 hours"];
  if (/crash|video|login/.test(topic)) return ["Investigate app/version/device correlation", "Prepare support workaround macro", "Monitor low-rating and ticket movement"];
  if (/refund|payment|activation/.test(topic)) return ["Audit payment/access logs for affected users", "Create proactive status communication", "Escalate unresolved active cases"];
  if (/content|faculty/.test(topic)) return ["Assign academic reviewer", "Collect representative examples", "Respond with correction or clarification if verified"];
  return [`Route to ${owner}`, "Monitor for volume or sentiment acceleration", "Keep evidence attached for human review"];
}

function evidenceScore(signal: TextSignal, text: CanonicalText, enrichmentPartial: Pick<MentionEnrichment, "entities" | "topics" | "sentiment">) {
  let score = 30;
  const specificityHits = [
    signal.version,
    signal.device,
    /\b\d{1,2}\.\d{1,2}\.\d{1,3}\b/.test(text.cleaned) ? "version" : "",
    /\bjee|neet|batch|faculty|sir|mam|refund|payment|order|ticket\b/i.test(text.normalized) ? "exact issue" : "",
  ].filter(Boolean).length;
  score += specificityHits * 9;
  if ((signal.engagement || 0) > 100) score += 10;
  if (signal.rating && signal.rating <= 2) score += 8;
  if (text.redacted !== text.cleaned) score += 6;
  if (enrichmentPartial.entities.length) score += 8;
  if (enrichmentPartial.topics[0]?.confidence > 0.75) score += 8;
  if (normalizeSentiment(enrichmentPartial.sentiment.label) !== "unknown") score += 6;
  const published = asDate(signal.publishedAt || signal.fetchedAt || null);
  if (published && (Date.now() - published.getTime()) / 86400000 <= 30) score += 8;
  return clamp(score);
}

export function enrichMention(signal: TextSignal, channel: ChannelId): MentionEnrichment {
  const text = preprocessText(`${signal.title || ""} ${signal.text || ""}`);
  const relevance = detectRelevance(text, signal);
  const entities = extractEntities(text, signal);
  const topics = classifyTopics(text);
  const intents = classifyIntents(text, signal);
  const sentiment = sentimentFromSignal(text, signal);
  const aspects = aspectSentiments(text);
  const emotions = detectEmotions(text);
  const sarcasm = detectSarcasm(text, sentiment);
  const spam = detectSpam(text, signal);
  const severityBase = severityAndUrgency({ channel, signal, text, topics, intents, sentiment, emotions });
  const recommendedOwner = routeOwner(topics, intents, text);
  const severity = { label: severityBase.label, score: severityBase.score };
  const evidence = evidenceScore(signal, text, { entities, topics, sentiment });
  return {
    relevance,
    entities,
    topics,
    intents,
    sentiment: sarcasm.probability > 0.65 ? { label: sarcasm.interpretedSentiment, confidence: Math.max(sentiment.confidence, sarcasm.probability) } : sentiment,
    aspects,
    emotions,
    sarcasm,
    spam,
    severity,
    urgencyScore: severityBase.urgencyScore,
    evidenceScore: evidence,
    recommendedOwner,
    recommendedActions: recommendedActions(recommendedOwner, severity, topics),
    text,
  };
}

function buildIncidentCandidates(channel: ChannelId, topics: IntelligenceTopic[], priorityQueue: PriorityItem[]): IncidentCandidate[] {
  return topics.slice(0, 8).map((topic) => {
    const evidence = priorityQueue.filter((item) => item.topic === topic.name || item.enrichment?.topics?.some((t) => t.label === topic.name || t.id.includes(topic.id))).slice(0, 5);
    const fallbackEvidence = evidence.length ? evidence : priorityQueue.slice(0, 3);
    const negative = fallbackEvidence.filter((item) => item.sentiment === "negative" || item.enrichment?.sentiment.label === "very_negative").length;
    const negativeShare = fallbackEvidence.length ? Math.round((negative / fallbackEvidence.length) * 100) : topic.sentiment === "negative" ? 70 : 30;
    const severityScore = topic.severity === "critical" ? 95 : topic.severity === "high" ? 76 : topic.severity === "medium" ? 52 : 25;
    const reachScore = Math.min(100, topic.mentions * 6);
    const legalScore = topic.id === "trust" || /scam|fraud|legal|refund|payment/i.test(topic.name) ? 85 : 10;
    const confidenceScore = fallbackEvidence.length >= 3 ? 76 : 52;
    const crisisScore = clamp(0.2 * severityScore + 0.15 * reachScore + 0.1 * legalScore + 0.05 * confidenceScore + 0.15 * negativeShare + (channel === "google" ? 8 : 0));
    const crisisLevel = crisisScore >= 85 ? "crisis" : crisisScore >= 70 ? "high_risk" : crisisScore >= 50 ? "emerging" : crisisScore >= 30 ? "watch" : "normal";
    const status = topic.severity === "critical" || crisisScore >= 70 ? "incident" : topic.severity === "high" || crisisScore >= 50 ? "suggested_incident" : "watchlist";
    return {
      id: `${channel}-${topic.id}`,
      title: topic.name,
      status,
      severity: topic.severity,
      crisisLevel,
      crisisScore,
      topic: topic.name,
      owner: topic.businessOwner,
      mentionCount: topic.mentions,
      negativeShare,
      evidence: fallbackEvidence,
      drivers: [
        `${topic.mentions} matched mentions`,
        `${negativeShare}% negative among top evidence`,
        `${topic.businessOwner} owner route`,
        `${topic.severity} topic severity`,
      ],
      recommendedActions: recommendedActions(topic.businessOwner, { label: topic.severity, score: severityScore }, [{ id: topic.id, label: topic.name, path: [topic.name], confidence: 0.8 }]),
    };
  }).filter((candidate) => candidate.mentionCount > 0 || candidate.evidence.length > 0)
    .sort((a, b) => b.crisisScore - a.crisisScore)
    .slice(0, 5);
}

export function buildChannelContract(input: {
  channel: ChannelId;
  sourceStatus: SourceStatus;
  signals: TextSignal[];
  sentiment?: SentimentSummary;
  supervisedTopics?: IntelligenceTopic[];
  unsupervisedClusters?: IntelligenceTopic[];
  headline: string;
  whyItMatters: string;
  recommendedActions: string[];
}): ChannelIntelligenceContract {
  const textItems = input.signals.filter((signal) => `${signal.title || ""} ${signal.text || ""}`.trim().length > 8).length;
  const supervisedTopics = input.supervisedTopics || buildSupervisedTopics(input.signals);
  const unsupervisedClusters = input.unsupervisedClusters || [];
  const priorityQueue = buildPriorityQueue(input.channel, input.signals, supervisedTopics);
  const enrichments = input.signals
    .filter((signal) => `${signal.title || ""} ${signal.text || ""}`.trim().length > 8)
    .map((signal) => enrichMention(signal, input.channel));
  const reviewableItems = enrichments.filter((item) =>
    item.relevance.confidence < 0.55 ||
    item.topics.some((topic) => topic.id === "unknown_emerging_topic") ||
    item.sarcasm.probability > 0.65 ||
    item.severity.label === "critical" ||
    item.intents.some((intent) => intent.label === "legal_escalation")
  ).length;
  const piiRedactedItems = enrichments.filter((item) => item.text.redacted !== item.text.cleaned).length;
  const likelySpamItems = enrichments.filter((item) => item.spam.label !== "organic").length;
  const averageEvidenceScore = enrichments.length
    ? Math.round(enrichments.reduce((sum, item) => sum + item.evidenceScore, 0) / enrichments.length)
    : 0;
  const incidentCandidates = buildIncidentCandidates(input.channel, supervisedTopics, priorityQueue);
  return {
    version: "2026-06-channel-intelligence-v1",
    channel: input.channel,
    sourceStatus: input.sourceStatus,
    volume: {
      totalItems: input.signals.length,
      textItems,
      analyzedItems: textItems,
    },
    sentiment: input.sentiment || summarizeSentiment(input.signals, "rule-based"),
    supervisedTopics,
    unsupervisedClusters,
    priorityQueue,
    incidentCandidates,
    processing: {
      pipeline: [
        "canonical_signal_adapter",
        "text_cleanup_unicode_normalization",
        "emoji_hashtag_mention_extraction",
        "hinglish_normalization",
        "pii_redaction",
        "relevance_detection",
        "entity_extraction",
        "hierarchical_topic_classification",
        "intent_sentiment_emotion_sarcasm_detection",
        "severity_urgency_evidence_scoring",
        "owner_routing",
        "incident_candidate_scoring",
      ],
      algorithms: {
        preprocessing: "deterministic regex + PW Hinglish dictionary + PII masking",
        relevance: "high-precision PW/entity dictionary with education/competitor fallback",
        entities: "dictionary/alias matching with metadata extraction for version/device",
        topics: "multilabel hierarchical taxonomy rules with unknown_emerging_topic fallback",
        intent: "multilabel rule classifier aligned to refund/payment/support/praise/legal labels",
        sentiment: "rating-aware and text-aware rules with sarcasm override",
        severity: "weighted urgency formula using severity, reach, business impact, exam sensitivity, confidence, escalation keywords, and channel adjustment",
        priority: "channel-adjusted urgency score blended with evidence/business-impact scoring",
        crisis: "topic severity + negative share + reach + legal/reputation signal + confidence",
      },
      quality: {
        enrichedItems: enrichments.length,
        reviewableItems,
        piiRedactedItems,
        likelySpamItems,
        averageEvidenceScore,
      },
    },
    leadershipRead: {
      headline: input.headline,
      whatChanged: input.sourceStatus.freshnessLabel,
      whyItMatters: input.whyItMatters,
      recommendedActions: input.recommendedActions,
    },
  };
}
