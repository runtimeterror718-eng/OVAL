import { BUSINESS_TOPIC_RULES, type ChannelId, type SentimentLabel } from "@/lib/channel-intelligence";

export type RadarParentType = "post" | "review" | "video" | "search_result" | "news" | "search_suggestion";

export type RadarEvidence = {
  id?: string | number | null;
  text: string;
  author?: string | null;
  sentiment?: SentimentLabel | "unknown";
  publishedAt?: string | null;
  url?: string | null;
  engagement?: number | null;
};

export type RadarInfluenceSource = "followers" | "connections" | "subscribers" | "engagement_proxy" | "unknown";
export type RadarEscalationLevel = "none" | "watch" | "high" | "critical";
export type RadarRiskLane = "main_risk" | "positive_signal" | "excluded_context";
export type RadarIntent =
  | "complaint"
  | "allegation"
  | "legal_trust"
  | "payment"
  | "support"
  | "access"
  | "batch"
  | "mis_selling"
  | "overselling"
  | "delivery"
  | "tech"
  | "academic"
  | "employer_risk"
  | "praise"
  | "hiring_neutral"
  | "marketing"
  | "neutral_news"
  | "irrelevant";

export type RadarAuthorProfile = {
  name?: string | null;
  handle?: string | null;
  followers?: number | null;
  connections?: number | null;
  subscribers?: number | null;
  influenceSource: RadarInfluenceSource;
};

export type RadarImpact = {
  escalationScore: number;
  influenceScore: number;
  engagementScore: number;
  freshnessScore: number;
  finalPriorityScore: number;
  engagementBreakdown: {
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    views?: number | null;
    score?: number | null;
  };
};

export type RadarInput = {
  id?: string | number | null;
  platform: ChannelId;
  parentType: RadarParentType;
  title?: string | null;
  text?: string | null;
  author?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  fetchedAt?: string | null;
  sentiment?: string | null;
  rating?: number | null;
  version?: string | null;
  engagement?: {
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    views?: number | null;
    score?: number | null;
  };
  authorProfile?: Partial<RadarAuthorProfile> | null;
  maxContentAgeHours?: number | null;
  evidenceComments?: RadarEvidence[];
};

export type RadarItem = RadarInput & {
  id: string;
  text: string;
  title: string;
  entities: string[];
  relevanceScore: number;
  sentiment: SentimentLabel;
  issueCategory: string;
  businessOwner: string;
  priorityScore: number;
  escalationLevel: RadarEscalationLevel;
  reputationIntent: RadarIntent;
  riskLane: RadarRiskLane;
  includedInRiskRadar: boolean;
  exclusionReason?: string | null;
  matchedEscalationTerms: string[];
  authorProfile: RadarAuthorProfile;
  impact: RadarImpact;
  scoreDrivers: string[];
  ageHours: number | null;
  evidenceComments: RadarEvidence[];
};

export type RadarCluster = {
  name: string;
  sentiment: SentimentLabel;
  businessOwner: string;
  count: number;
  priority: number;
  platforms: string[];
  evidence: Array<{ title: string; text: string; platform: ChannelId; url?: string | null }>;
};

const ENTITY_ALIASES = [
  { canonical: "Physics Wallah", aliases: ["physics wallah", "physicswallah", "physics wala"] },
  { canonical: "PW", aliases: ["#pw", "pw app", "pw skills", "pw vidyapeeth", "pw onlyias", "pw store", "pw live", "pwians", "pwian"] },
  { canonical: "Alakh Pandey", aliases: ["alakh pandey", "alakh sir"] },
  { canonical: "PW Skills", aliases: ["pw skills", "pwskills"] },
  { canonical: "PW Vidyapeeth", aliases: ["pw vidyapeeth", "vidyapeeth"] },
  { canonical: "Infinity Pro", aliases: ["infinity pro"] },
  { canonical: "OnlyIAS", aliases: ["pw onlyias", "onlyias"] },
  { canonical: "JEE Wallah", aliases: ["jee wallah"] },
  { canonical: "NEET Wallah", aliases: ["neet wallah"] },
  { canonical: "GATE Wallah", aliases: ["gate wallah"] },
  { canonical: "Alakh Pandey", aliases: ["alakh"] },
  { canonical: "Lakshya", aliases: ["lakshya", "lakshay"] },
  { canonical: "Arjuna", aliases: ["arjuna"] },
  { canonical: "Yakeen", aliases: ["yakeen"] },
  { canonical: "Prayas", aliases: ["prayas"] },
];

const NEGATIVE_PATTERNS = [
  "refund", "scam", "fraud", "fake", "consumer court", "legal", "complaint", "no response", "not responding",
  "deducted", "payment failed", "amount", "support", "misleading", "mis sell", "missell", "oversell",
  "not working", "unable", "issue", "problem", "worst", "cheat", "harassment", "rights", "locked",
  "delivery", "order not", "access", "login", "otp", "buffer", "crash", "lag",
];

const CRITICAL_ESCALATION_PATTERNS = [
  "fraud", "scam", "fake", "consumer court", "legal notice", "court", "case filed", "police", "fir",
  "cheat", "rights violation", "duplicate payment", "double charged", "amount deducted", "money deducted",
  "fake job", "fake hiring", "harassment", "salary not paid", "privacy leak", "data leak",
  "dhokha", "loot", "farzi", "nakli",
];

const HIGH_ESCALATION_PATTERNS = [
  "refund", "no response", "not responding", "support ignored", "ticket ignored", "support ne", "problem solve nahi",
  "paid but no access", "paid but", "course locked", "test locked", "batch locked", "subscription not showing",
  "cannot access", "unable to access", "payment failed", "transaction failed", "upi", "fee issue",
  "false promise", "promised but not delivered", "not delivered", "misleading", "mis sell", "missell",
  "wrong batch", "wrong course", "delivery delayed", "book not delivered", "order delayed",
  "video not playing", "app not working", "lecture not opening", "buffering", "crash",
];

const WATCH_ESCALATION_PATTERNS = [
  "issue", "problem", "bad", "worst", "delay", "locked", "access", "login", "otp", "support", "complaint",
  "resolve", "help", "response", "quality", "wrong", "not working",
];

const HIRING_NEUTRAL_PATTERNS = [
  "we're hiring", "we are hiring", "hiring", "job opening", "job opportunity", "career", "careers",
  "product manager", "apply now", "cfbr", "reach++", "freshers can apply", "recruitment",
];

const HIRING_RISK_PATTERNS = [
  "fake job", "fake hiring", "fraudulent job", "salary not paid", "toxic culture", "bad workplace",
  "harassment", "layoff", "laid off", "scam hiring", "asking money", "job scam",
];

const POSITIVE_PATTERNS = [
  "best", "great", "excellent", "helpful", "thank", "thanks", "love", "affordable", "amazing", "motivation",
  "selected", "selection", "rank", "success", "proud", "congratulations", "congrats", "achievement",
  "grateful", "inspiring", "opportunity", "accessible", "impact", "trust",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function num(value: any) {
  return Number(value || 0);
}

function lowerText(item: Pick<RadarInput, "title" | "text" | "author" | "evidenceComments">) {
  return [
    item.title,
    item.text,
    item.author,
    ...(item.evidenceComments || []).map((comment) => comment.text),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function extractRadarEntities(text: string) {
  const entities = new Set<string>();
  const source = ` ${text.toLowerCase()} `;
  for (const entity of ENTITY_ALIASES) {
    for (const alias of entity.aliases) {
      const regex = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, "i");
      if (regex.test(source)) {
        entities.add(entity.canonical);
        break;
      }
    }
  }
  return Array.from(entities);
}

export function scoreRadarRelevance(item: RadarInput, entities: string[]) {
  const blob = lowerText(item);
  let score = 0;
  const drivers: string[] = [];
  if (/\bphysics\s*wallah\b|\bphysicswallah\b/i.test(blob)) {
    score += 45;
    drivers.push("direct PhysicsWallah mention");
  }
  if (/\balakh\s*pandey\b|\balakh\s+sir\b/i.test(blob)) {
    score += 35;
    drivers.push("Alakh Pandey entity mention");
  }
  if (/\bpw\s+(app|skills|vidyapeeth|onlyias|store|live)\b|#pw\b|\bpwians?\b/i.test(blob)) {
    score += 34;
    drivers.push("PW product/entity mention");
  }
  if (entities.length) score += Math.min(18, entities.length * 6);
  if (item.platform === "playstore") {
    score += 30;
    drivers.push("owned Play Store review source");
  }
  if (item.platform === "freshdesk") {
    score += 25;
    drivers.push("owned support source");
  }
  return { score: Math.min(100, score), drivers };
}

function hasKeyword(text: string, keyword: string) {
  const normalized = keyword.toLowerCase().trim();
  if (!normalized) return false;
  if (/[^a-z0-9]/i.test(normalized)) return text.includes(normalized);
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`, "i").test(text);
}

function hasAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => hasKeyword(text, pattern));
}

function matchedTerms(text: string, patterns: string[]) {
  return patterns.filter((pattern) => hasKeyword(text, pattern));
}

export function classifyRadarSentiment(item: RadarInput): SentimentLabel {
  const blob = lowerText(item);
  const existing = String(item.sentiment || "").toLowerCase();
  const rating = num(item.rating);
  const negative = hasAny(blob, NEGATIVE_PATTERNS) || existing.includes("negative") || existing.includes("risk") || (rating > 0 && rating <= 2);
  const positive = hasAny(blob, POSITIVE_PATTERNS) || existing.includes("positive") || (rating >= 4 && !negative);
  if (negative && positive) return "mixed";
  if (negative) return "negative";
  if (positive) return "positive";
  return "neutral";
}

function classifyEscalation(item: RadarInput) {
  const blob = lowerText(item);
  const critical = matchedTerms(blob, CRITICAL_ESCALATION_PATTERNS);
  const high = matchedTerms(blob, HIGH_ESCALATION_PATTERNS);
  const watch = matchedTerms(blob, WATCH_ESCALATION_PATTERNS);
  const matchedEscalationTerms = [...critical, ...high, ...watch];
  if (critical.length) return { escalationLevel: "critical" as const, matchedEscalationTerms };
  if (high.length) return { escalationLevel: "high" as const, matchedEscalationTerms };
  if (watch.length) return { escalationLevel: "watch" as const, matchedEscalationTerms };
  return { escalationLevel: "none" as const, matchedEscalationTerms };
}

function classifyIntent(item: RadarInput, sentiment: SentimentLabel): RadarIntent {
  const blob = lowerText(item);
  const hasHiring = hasAny(blob, HIRING_NEUTRAL_PATTERNS);
  const hasHiringRisk = hasAny(blob, HIRING_RISK_PATTERNS);
  if (hasHiringRisk) return "employer_risk";
  if (hasHiring) return "hiring_neutral";
  if (hasAny(blob, ["consumer court", "legal", "fraud", "scam", "fake", "cheat", "fir", "police", "case filed"])) return "legal_trust";
  if (hasAny(blob, ["refund", "payment", "paid", "amount deducted", "money deducted", "upi", "transaction", "fee"])) return "payment";
  if (hasAny(blob, ["support", "ticket", "no response", "not responding", "customer care", "resolve", "help"])) return "support";
  if (hasAny(blob, ["paid but no access", "cannot access", "course locked", "test locked", "login", "otp", "subscription"])) return "access";
  if (hasAny(blob, ["batch", "course", "dpp", "planner", "test", "validity"])) return "batch";
  if (hasAny(blob, ["mis sell", "missell", "wrong batch", "wrong course", "misleading", "counsellor", "counselor"])) return "mis_selling";
  if (hasAny(blob, ["promise", "promised", "advertised", "false promise", "not delivered"])) return "overselling";
  if (hasAny(blob, ["delivery", "order", "book", "module", "shipment", "tracking", "parcel"])) return "delivery";
  if (hasAny(blob, ["crash", "buffer", "video not playing", "app not working", "download failed", "lag", "loading"])) return "tech";
  if (hasAny(blob, ["teacher", "faculty", "content", "syllabus", "lecture", "class"])) return "academic";
  if (sentiment === "positive") return "praise";
  if (hasAny(blob, ["launch", "growth", "funding", "ipo", "hiring", "achievement"])) return "neutral_news";
  if (sentiment === "negative" || sentiment === "mixed") return "complaint";
  return "irrelevant";
}

export function classifyRadarIssue(item: RadarInput, sentiment: SentimentLabel) {
  const blob = lowerText(item);
  const intent = classifyIntent(item, sentiment);
  if (intent === "employer_risk") return { issueCategory: "Employer brand and fake hiring risk", businessOwner: "People Team + PR + Legal", severity: "critical" as const };
  if (intent === "legal_trust") return { issueCategory: "Trust, legal and public allegation risk", businessOwner: "PR + Legal", severity: "critical" as const };
  if (intent === "payment") return { issueCategory: "Payments, refunds and fee trust", businessOwner: "Aayush", severity: "critical" as const };
  if (intent === "support") return { issueCategory: "Support response and resolution gap", businessOwner: "Support Ops", severity: "high" as const };
  if (intent === "access") return { issueCategory: "Access, login and entitlement", businessOwner: "Aditya Kumar", severity: "high" as const };
  const rule = BUSINESS_TOPIC_RULES.find((topic) => topic.keywords.some((keyword) => hasKeyword(blob, keyword)));
  if (rule) return { issueCategory: rule.name, businessOwner: rule.owner, severity: rule.severity };
  if (sentiment === "positive") return { issueCategory: "Positive advocacy and brand love", businessOwner: "Brand + Academic", severity: "low" as const };
  return { issueCategory: "General PW brand discussion", businessOwner: "Brand + PR", severity: "medium" as const };
}

function ageHours(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (Date.now() - date.getTime()) / 3600000);
}

function platformWeightedEngagement(item: RadarInput) {
  const engagement = item.engagement || {};
  if (item.platform === "linkedin") return num(engagement.likes) + num(engagement.comments) * 3 + num(engagement.shares) * 4;
  if (item.platform === "youtube") return num(engagement.views) * 0.05 + num(engagement.likes) + num(engagement.comments) * 3;
  if (item.platform === "instagram") return num(engagement.likes) + num(engagement.comments) * 3 + num(engagement.views) * 0.05;
  if (item.platform === "reddit") return num(engagement.score) + num(engagement.comments) * 3;
  if (item.platform === "freshdesk") return num(engagement.comments) + num(engagement.score);
  return num(engagement.likes) + num(engagement.comments) + num(engagement.shares) + num(engagement.views) + num(engagement.score);
}

function scoreEngagement(item: RadarInput) {
  return Math.round(Math.min(100, Math.log10(platformWeightedEngagement(item) + 1) * 22));
}

function buildAuthorProfile(item: RadarInput, engagementScore: number): RadarAuthorProfile {
  const input = item.authorProfile || {};
  const followers = num(input.followers);
  const connections = num(input.connections);
  const subscribers = num(input.subscribers);
  let influenceSource: RadarInfluenceSource = "unknown";
  let influenceBase = 0;

  if (followers > 0) {
    influenceSource = "followers";
    influenceBase = followers;
  } else if (connections > 0) {
    influenceSource = "connections";
    influenceBase = connections;
  } else if (subscribers > 0) {
    influenceSource = "subscribers";
    influenceBase = subscribers;
  } else if (engagementScore > 0) {
    influenceSource = "engagement_proxy";
  }

  return {
    name: input.name || item.author || null,
    handle: input.handle || null,
    followers: followers || null,
    connections: connections || null,
    subscribers: subscribers || null,
    influenceSource,
    ...(influenceBase ? { influenceBase } : {}),
  } as RadarAuthorProfile;
}

function scoreInfluence(authorProfile: RadarAuthorProfile, engagementScore: number) {
  const base = num(authorProfile.followers) || num(authorProfile.connections) || num(authorProfile.subscribers);
  if (base > 0) return Math.round(Math.min(100, Math.log10(base + 1) * 18));
  if (authorProfile.influenceSource === "engagement_proxy") return Math.round(Math.min(60, engagementScore * 0.7));
  return 0;
}

function scoreFreshness(hours: number | null) {
  if (hours === null) return 15;
  return Math.round(Math.max(0, 100 - Math.min(100, hours * 1.4)));
}

function scoreEscalation(input: {
  escalationLevel: RadarEscalationLevel;
  sentiment: SentimentLabel;
  relevanceScore: number;
  severity: "low" | "medium" | "high" | "critical";
}) {
  const levelScore =
    input.escalationLevel === "critical" ? 100 :
    input.escalationLevel === "high" ? 82 :
    input.escalationLevel === "watch" ? 55 :
    input.sentiment === "negative" ? 48 :
    input.sentiment === "mixed" ? 42 :
    input.sentiment === "positive" ? 24 :
    12;
  const severityScore = input.severity === "critical" ? 18 : input.severity === "high" ? 12 : input.severity === "medium" ? 6 : 0;
  return Math.round(Math.min(100, levelScore + severityScore + input.relevanceScore * 0.08));
}

function shouldExcludeStale(input: RadarInput, hours: number | null, escalationLevel: RadarEscalationLevel) {
  const maxAge = num(input.maxContentAgeHours);
  if (!maxAge || hours === null || hours <= maxAge) return false;
  const hasFreshEscalationEvidence = (input.evidenceComments || []).some((comment) => {
    const evidenceAge = ageHours(comment.publishedAt);
    if (evidenceAge === null || evidenceAge > maxAge) return false;
    return classifyEscalation({ ...input, title: "", text: comment.text, evidenceComments: [] }).escalationLevel !== "none";
  });
  return !hasFreshEscalationEvidence && escalationLevel !== "critical";
}

export function buildRadarItem(input: RadarInput): RadarItem | null {
  const text = String(input.text || "").replace(/\s+/g, " ").trim();
  const title = String(input.title || input.author || `${input.platform} ${input.parentType}`).replace(/\s+/g, " ").trim();
  const normalized = { ...input, title, text, evidenceComments: input.evidenceComments || [] };
  const blob = lowerText(normalized);
  const entities = extractRadarEntities(blob);
  const relevance = scoreRadarRelevance(normalized, entities);
  if (relevance.score < 24) return null;

  const sentiment = classifyRadarSentiment(normalized);
  const issue = classifyRadarIssue(normalized, sentiment);
  const reputationIntent = classifyIntent(normalized, sentiment);
  const escalation = classifyEscalation(normalized);
  const hours = ageHours(input.publishedAt || input.fetchedAt);
  const engagementScore = scoreEngagement(input);
  const authorProfile = buildAuthorProfile(input, engagementScore);
  const influenceScore = scoreInfluence(authorProfile, engagementScore);
  const freshnessScore = scoreFreshness(hours);
  const escalationScore = scoreEscalation({
    escalationLevel: escalation.escalationLevel,
    sentiment,
    relevanceScore: relevance.score,
    severity: issue.severity,
  });
  let finalPriorityScore = Math.round(escalationScore * 0.5 + influenceScore * 0.2 + engagementScore * 0.2 + freshnessScore * 0.1);
  if (escalation.escalationLevel === "critical") finalPriorityScore = Math.max(finalPriorityScore, 80);
  const leadershipAttention = influenceScore >= 70 && engagementScore >= 70 && escalation.escalationLevel !== "none";
  if (leadershipAttention) finalPriorityScore = Math.max(finalPriorityScore, 76);
  const excludedAsNeutralHiring = reputationIntent === "hiring_neutral" && escalation.escalationLevel === "none";
  const excludedAsStale = shouldExcludeStale(input, hours, escalation.escalationLevel);
  const hasEnoughWatchSignal = escalation.escalationLevel !== "watch" || engagementScore >= 60 || influenceScore >= 60 || (input.evidenceComments || []).length >= 3;
  const excludedAsWeakWatch = escalation.escalationLevel === "watch" && !hasEnoughWatchSignal;
  const riskLane: RadarRiskLane =
    excludedAsNeutralHiring || excludedAsStale || excludedAsWeakWatch || reputationIntent === "irrelevant" ? "excluded_context" :
    sentiment === "positive" && escalation.escalationLevel === "none" ? "positive_signal" :
    escalation.escalationLevel !== "none" || sentiment === "negative" || sentiment === "mixed" ? "main_risk" :
    "excluded_context";
  const includedInRiskRadar = riskLane === "main_risk";
  const exclusionReason =
    excludedAsNeutralHiring ? "Hiring/recruitment mention without reputation risk" :
    excludedAsStale ? "Published outside selected window without fresh escalation evidence" :
    excludedAsWeakWatch ? "Weak watch signal without enough engagement, influence, or repeated evidence" :
    riskLane === "excluded_context" ? "Relevant mention without escalation intent" :
    null;

  return {
    ...normalized,
    id: String(input.id || input.url || `${input.platform}-${title}-${text.slice(0, 20)}`),
    title,
    text,
    entities,
    relevanceScore: relevance.score,
    sentiment,
    issueCategory: issue.issueCategory,
    businessOwner: issue.businessOwner,
    priorityScore: finalPriorityScore,
    escalationLevel: escalation.escalationLevel,
    reputationIntent,
    riskLane,
    includedInRiskRadar,
    exclusionReason,
    matchedEscalationTerms: escalation.matchedEscalationTerms,
    authorProfile,
    impact: {
      escalationScore,
      influenceScore,
      engagementScore,
      freshnessScore,
      finalPriorityScore,
      engagementBreakdown: {
        likes: input.engagement?.likes ?? null,
        comments: input.engagement?.comments ?? null,
        shares: input.engagement?.shares ?? null,
        views: input.engagement?.views ?? null,
        score: input.engagement?.score ?? null,
      },
    },
    scoreDrivers: [
      ...relevance.drivers,
      `${escalation.escalationLevel} escalation`,
      `${sentiment} targeted sentiment`,
      issue.issueCategory,
      `${authorProfile.influenceSource} influence`,
      `${engagementScore} engagement score`,
      hours === null ? "published time unavailable" : `${Math.round(hours)}h old`,
      ...(leadershipAttention ? ["leadership attention: high influence and traction"] : []),
      ...(exclusionReason ? [exclusionReason] : []),
    ],
    ageHours: hours,
    evidenceComments: (input.evidenceComments || []).slice(0, 8),
  };
}

export function buildRadarClusters(items: RadarItem[]): RadarCluster[] {
  const buckets = new Map<string, RadarCluster>();
  for (const item of items) {
    const key = `${item.sentiment}-${item.issueCategory}`;
    const existing = buckets.get(key) || {
      name: item.issueCategory,
      sentiment: item.sentiment,
      businessOwner: item.businessOwner,
      count: 0,
      priority: 0,
      platforms: [],
      evidence: [],
    };
    existing.count += 1;
    existing.priority += item.priorityScore;
    if (!existing.platforms.includes(item.platform)) existing.platforms.push(item.platform);
    if (existing.evidence.length < 3) {
      existing.evidence.push({ title: item.title, text: item.text, platform: item.platform, url: item.url });
    }
    buckets.set(key, existing);
  }
  return Array.from(buckets.values())
    .map((cluster) => ({ ...cluster, priority: Math.round(cluster.priority / Math.max(cluster.count, 1)) }))
    .sort((a, b) => (b.count * b.priority) - (a.count * a.priority));
}

export function buildRadarSummary(items: RadarItem[]) {
  const negative = items.filter((item) => item.sentiment === "negative" || item.sentiment === "mixed");
  const positive = items.filter((item) => item.sentiment === "positive");
  const byPlatform = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.platform] = (acc[item.platform] || 0) + 1;
    return acc;
  }, {});
  const byOwner = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.businessOwner] = (acc[item.businessOwner] || 0) + 1;
    return acc;
  }, {});
  return {
    total: items.length,
    negative: negative.length,
    positive: positive.length,
    neutral: items.length - negative.length - positive.length,
    byPlatform,
    byOwner,
    highestPriority: items[0]?.priorityScore || 0,
  };
}
