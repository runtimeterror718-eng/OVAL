type DateLike = string | number | Date | null | undefined;

export type MonthlyTrendPoint = {
  month: string;
  label: string;
  count: number;
  comments: number;
  positives: number;
  negatives: number;
  neutrals: number;
  engagement: number;
  rating?: number;
};

export type TopicCluster = {
  name: string;
  mentions: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  keywords: string[];
  evidence: string[];
};

const TOPIC_RULES: Array<{ name: string; keywords: string[]; sentiment: TopicCluster["sentiment"] }> = [
  { name: "Orders, delivery and books", sentiment: "negative", keywords: ["order", "delivery", "delivered", "book", "module", "shipment", "tracking", "store"] },
  { name: "Refunds and payments", sentiment: "negative", keywords: ["refund", "payment", "paid", "money", "upi", "transaction", "cashback", "fee"] },
  { name: "App and access friction", sentiment: "negative", keywords: ["app", "login", "access", "otp", "download", "video", "lecture", "buffer", "quality"] },
  { name: "Teachers and content love", sentiment: "positive", keywords: ["sir", "ma'am", "teacher", "faculty", "lecture", "content", "concept", "alakh", "motivation"] },
  { name: "Batch and course decisions", sentiment: "mixed", keywords: ["batch", "course", "arjuna", "lakshya", "yakeen", "prayas", "neet", "jee", "class"] },
  { name: "Trust and reputation", sentiment: "negative", keywords: ["scam", "fraud", "fake", "controversy", "exposed", "complaint", "court", "risk"] },
  { name: "Price and value", sentiment: "mixed", keywords: ["price", "cheap", "affordable", "value", "discount", "coupon", "cost"] },
];

export function toMonthKey(value: DateLike) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(new Date(year, monthNumber - 1, 1));
}

export function buildMonthlyTrend<T>(
  rows: T[],
  getDate: (row: T) => DateLike,
  options: {
    getComments?: (row: T) => number | null | undefined;
    getEngagement?: (row: T) => number | null | undefined;
    getSentiment?: (row: T) => string | null | undefined;
    getRating?: (row: T) => number | null | undefined;
  } = {},
) {
  const buckets = new Map<string, MonthlyTrendPoint & { ratingTotal: number; ratingCount: number }>();

  for (const row of rows) {
    const month = toMonthKey(getDate(row));
    if (!month) continue;
    const bucket = buckets.get(month) || {
      month,
      label: monthLabel(month),
      count: 0,
      comments: 0,
      positives: 0,
      negatives: 0,
      neutrals: 0,
      engagement: 0,
      ratingTotal: 0,
      ratingCount: 0,
    };
    bucket.count += 1;
    bucket.comments += Number(options.getComments?.(row) || 0);
    bucket.engagement += Number(options.getEngagement?.(row) || 0);

    const sentiment = String(options.getSentiment?.(row) || "").toLowerCase();
    if (sentiment.includes("positive")) bucket.positives += 1;
    else if (sentiment.includes("negative") || sentiment.includes("risk")) bucket.negatives += 1;
    else bucket.neutrals += 1;

    const rating = Number(options.getRating?.(row) || 0);
    if (rating > 0) {
      bucket.ratingTotal += rating;
      bucket.ratingCount += 1;
    }
    buckets.set(month, bucket);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-8)
    .map(({ ratingTotal, ratingCount, ...bucket }) => ({
      ...bucket,
      rating: ratingCount ? Math.round((ratingTotal / ratingCount) * 100) / 100 : undefined,
    }));
}

export function latestDelta(trend: Array<Record<string, any>>, field: string) {
  const current = Number(trend.at(-1)?.[field] || 0);
  const previous = Number(trend.at(-2)?.[field] || 0);
  return { current, previous, delta: current - previous, pct: previous ? Math.round(((current - previous) / previous) * 100) : null };
}

export function buildTopicClusters(texts: Array<string | null | undefined>, limit = 6): TopicCluster[] {
  const normalized = texts
    .map((text) => String(text || "").replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 8);

  const clusters = TOPIC_RULES.map((rule) => {
    const evidence: string[] = [];
    let mentions = 0;
    for (const text of normalized) {
      const lower = text.toLowerCase();
      const hit = rule.keywords.some((keyword) => lower.includes(keyword));
      if (!hit) continue;
      mentions += 1;
      if (evidence.length < 3) evidence.push(text.slice(0, 180));
    }
    return { name: rule.name, mentions, sentiment: rule.sentiment, keywords: rule.keywords.slice(0, 5), evidence };
  });

  return clusters.filter((cluster) => cluster.mentions > 0).sort((a, b) => b.mentions - a.mentions).slice(0, limit);
}

export function isPwOwnedName(value: string | null | undefined) {
  const text = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!text) return false;
  const allow = [
    "physicswallah",
    "physics wallah",
    "pw live",
    "pw jee",
    "pw neet",
    "pw vidyapeeth",
    "pw gurukulam",
    "pw skills",
    "pw bihar",
    "competition wallah",
    "jee wallah",
    "neet wallah",
  ];
  return allow.some((token) => text === token || text.includes(token));
}
