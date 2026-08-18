import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import insights from "@/data/playstore-insights.json";
import monthlyHistory from "@/data/playstore-monthly-history.json";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";
import { cachedIntelligenceResponse } from "@/lib/intelligence-server-cache";

export const dynamic = "force-dynamic";

const PLAYSTORE_REVIEW_TABLES = (process.env.PLAYSTORE_REVIEWS_TABLE || "playstore_reviews")
  .split(",")
  .map((table) => table.trim())
  .filter(Boolean);
const SUPABASE_PAGE_SIZE = 1000;
const APP_NAMES: Record<string, string> = {
  "xyz.penpencil.physicswala": "Physics Wallah",
  "ai.ncert.physicswala": "PW NCERT Books",
};
const THEME_RULES: Record<string, string[]> = {
  "Video & Playback": ["video", "playback", "buffer", "quality", "2x", "speed", "lecture", "download"],
  "Login & Access": ["login", "log in", "otp", "open", "access", "account", "sign in", "not opening"],
  "App Stability": ["crash", "bug", "glitch", "hang", "freeze", "slow", "lag", "loading", "not working", "zoom"],
  "Payments & Refunds": ["refund", "payment", "paid", "money", "fee", "fees", "purchase", "subscription"],
  "Books & Content": ["book", "ncert", "pdf", "chapter", "solution", "content", "module", "notes"],
  "Batch & Course Access": ["batch", "course", "class", "dpp", "test series", "material", "kit", "notes"],
  "Support Experience": ["support", "customer care", "response", "contact", "help", "resolve", "complaint"],
  "Teaching & Learning": ["teacher", "faculty", "teaching", "study", "learning", "sir", "mam"],
};
const POSITIVE_TERMS = ["good", "best", "great", "helpful", "excellent", "amazing", "love", "thank", "useful", "nice", "awesome"];
const COMPLAINT_TERMS = ["not working", "not opening", "cannot", "can't", "unable", "issue", "problem", "bug", "glitch", "crash", "slow", "lag", "refund", "worst", "bad", "please fix", "error", "failed", "wrong"];
const REQUEST_TERMS = ["please", "should", "need", "request", "add", "feature", "improve", "allow", "bring", "make", "want", "kindly", "option"];

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "1"].includes(value.toLowerCase());
  return Boolean(value);
}

function firstValue(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return null;
}

function pct(part: number, total: number) {
  return total ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function avg(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
}

function monthKey(date?: string | null) {
  return date ? String(date).slice(0, 7) : "Unknown";
}

function normalizeText(review: any) {
  return String(review.text || "").toLowerCase();
}

function jsonSafeText(value: unknown) {
  let output = "";
  for (const character of String(value ?? "")) {
    const code = character.charCodeAt(0);
    output += character.length === 1 && code >= 0xd800 && code <= 0xdfff ? "�" : character;
  }
  return output;
}

function jsonSafePayload(value: any): any {
  if (typeof value === "string") return jsonSafeText(value);
  if (Array.isArray(value)) return value.map(jsonSafePayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonSafePayload(child)]));
  }
  return value;
}

function sampleReview(review: any, theme?: string | null) {
  return {
    rating: review.rating,
    text: String(review.text || "").replace(/\s+/g, " ").trim().slice(0, 320),
    version: review.version || "Unknown",
    date: review.date || null,
    replied: Boolean(review.replied),
    theme: theme || review.theme || null,
    author: review.author || null,
  };
}

function reviewTrack(review: any) {
  const text = normalizeText(review);
  if (REQUEST_TERMS.some((term) => text.includes(term))) return "What's being asked for";
  if (Number(review.rating || 0) <= 3 || COMPLAINT_TERMS.some((term) => text.includes(term))) return "What's broken";
  if (Number(review.rating || 0) >= 4 && POSITIVE_TERMS.some((term) => text.includes(term))) return "What's loved";
  return "Other written feedback";
}

function normalizeLiveReview(row: Record<string, any>, source: string) {
  const postedAt = firstValue(row, ["posted_at", "published_at", "created_at", "date", "review_date", "updated_at"]);
  const text = firstValue(row, ["text", "review_text", "content", "body", "comment"]);
  if (!text) return null;
  return {
    packageName: firstValue(row, ["package_name", "packageName"]) || "xyz.penpencil.physicswala",
    reviewId: firstValue(row, ["review_id", "reviewId", "id"]),
    author: firstValue(row, ["author", "author_name", "user_name", "reviewer_name"]),
    rating: Number(firstValue(row, ["rating", "score", "stars"]) || 0) || null,
    text: String(text),
    version: firstValue(row, ["version", "app_version", "review_app_version", "appVersionName"]),
    date: postedAt ? String(postedAt).slice(0, 10) : null,
    postedAt,
    replied: boolValue(firstValue(row, ["replied", "has_reply", "developer_replied", "replyText", "reply_text"])),
    replyText: firstValue(row, ["replyText", "reply_text", "developer_reply"]),
    language: firstValue(row, ["language", "reviewer_language", "lang"]),
    device: firstValue(row, ["device", "device_name", "device_model"]),
    thumbsUpCount: Number(firstValue(row, ["thumbsUpCount", "thumbs_up_count", "likes"]) || 0) || 0,
    source,
  };
}

function summarizePackage(packageName: string, reviews: any[]) {
  const datedReviews = [...reviews].sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
  const ratings = reviews.map((review) => Number(review.rating || 0)).filter(Boolean);
  const textRows = reviews.filter((review) => review.text);
  const negativeRows = textRows.filter((review) => Number(review.rating || 0) <= 2);
  const repliedRows = reviews.filter((review) => review.replied);
  const negativeRepliedRows = negativeRows.filter((review) => review.replied);

  const groupedMonths = new Map<string, any[]>();
  const groupedDays = new Map<string, any[]>();
  for (const review of reviews) {
    const month = monthKey(review.date);
    if (!groupedMonths.has(month)) groupedMonths.set(month, []);
    groupedMonths.get(month)!.push(review);
    if (review.date) {
      if (!groupedDays.has(review.date)) groupedDays.set(review.date, []);
      groupedDays.get(review.date)!.push(review);
    }
  }
  const monthlyTrend = Array.from(groupedMonths.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, rows]) => {
    const monthRatings = rows.map((review) => Number(review.rating || 0)).filter(Boolean);
    const low = monthRatings.filter((rating) => rating <= 2).length;
    const replies = rows.filter((review) => review.replied).length;
    return { month, reviews: rows.length, averageRating: avg(monthRatings), lowRatingRate: pct(low, monthRatings.length), replyRate: pct(replies, rows.length) };
  });
  const dailyTrend = Array.from(groupedDays.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => {
    const dayRatings = rows.map((review) => Number(review.rating || 0)).filter(Boolean);
    const low = dayRatings.filter((rating) => rating <= 2).length;
    const replies = rows.filter((review) => review.replied).length;
    return { date, reviews: rows.length, averageRating: avg(dayRatings), lowRatingRate: pct(low, dayRatings.length), replyRate: pct(replies, rows.length) };
  });

  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = ratings.filter((value) => value === rating).length;
    return { rating, count, share: pct(count, ratings.length) };
  });

  const themes = Object.entries(THEME_RULES).map(([name, keywords]) => {
    const matched = textRows.filter((review) => keywords.some((keyword) => normalizeText(review).includes(keyword)));
    const replied = matched.filter((review) => review.replied).length;
    const trackBreakdown = matched.reduce((acc: Record<string, number>, review) => {
      const track = reviewTrack(review);
      acc[track] = (acc[track] || 0) + 1;
      return acc;
    }, {});
    return {
      name,
      mentions: matched.length,
      shareOfTextReviews: pct(matched.length, textRows.length),
      replyRate: pct(replied, matched.length),
      trackBreakdown,
      examples: matched.sort((a, b) => Number(a.rating || 0) - Number(b.rating || 0) || String(b.text || "").length - String(a.text || "").length).slice(0, 24).map((review) => sampleReview(review, name)),
    };
  }).filter((theme) => theme.mentions > 0).sort((a, b) => b.mentions - a.mentions);

  const textTracks = ["What's broken", "What's loved", "What's being asked for", "Other written feedback"].map((name) => {
    const matched = textRows.filter((review) => reviewTrack(review) === name);
    return {
      name,
      count: matched.length,
      shareOfTextReviews: pct(matched.length, textRows.length),
      replyRate: pct(matched.filter((review) => review.replied).length, matched.length),
      examples: matched.sort((a, b) => Number(a.rating || 0) - Number(b.rating || 0)).slice(0, 24).map((review) => sampleReview(review)),
    };
  }).filter((track) => track.count > 0);

  const versionGroups = new Map<string, any[]>();
  for (const review of reviews) {
    const version = review.version || "Unknown";
    if (!versionGroups.has(version)) versionGroups.set(version, []);
    versionGroups.get(version)!.push(review);
  }
  const versions = Array.from(versionGroups.entries()).map(([version, rows]) => {
    const versionRatings = rows.map((review) => Number(review.rating || 0)).filter(Boolean);
    const lowRatingCount = versionRatings.filter((rating) => rating <= 2).length;
    const versionTextRows = rows.filter((review) => review.text);
    return {
      version,
      versionCode: 0,
      reviews: rows.length,
      averageRating: avg(versionRatings),
      lowRatingCount,
      lowRatingRate: pct(lowRatingCount, versionRatings.length),
      textReviews: versionTextRows.length,
      latestReviewAt: rows.map((review) => review.postedAt).filter(Boolean).sort().pop() || null,
      topThemes: themes.slice(0, 4).map((theme) => ({ name: theme.name, count: theme.mentions, share: theme.shareOfTextReviews })),
      negativeExamples: versionTextRows.filter((review) => Number(review.rating || 0) <= 2).slice(0, 6).map((review) => sampleReview(review)),
    };
  }).sort((a, b) => String(b.latestReviewAt || "").localeCompare(String(a.latestReviewAt || "")));

  const releaseComparison = versions.length >= 2
    ? {
        current: versions[0],
        previous: versions[1],
        ratingDelta: Number((Number(versions[0].averageRating || 0) - Number(versions[1].averageRating || 0)).toFixed(2)),
        lowRatingRateDelta: Number((Number(versions[0].lowRatingRate || 0) - Number(versions[1].lowRatingRate || 0)).toFixed(1)),
        directional: versions[0].reviews < 100 || versions[1].reviews < 100,
      }
    : { current: versions[0] || {}, previous: {}, ratingDelta: 0, lowRatingRateDelta: 0, directional: true };

  const languageCounts = new Map<string, number>();
  for (const review of reviews) languageCounts.set(review.language || "unknown", (languageCounts.get(review.language || "unknown") || 0) + 1);
  const deviceCounts = new Map<string, number>();
  for (const review of negativeRows) deviceCounts.set(review.device || "Unknown", (deviceCounts.get(review.device || "Unknown") || 0) + 1);
  const divergentReviews = textRows.filter((review) => Number(review.rating || 0) >= 4 && COMPLAINT_TERMS.some((term) => normalizeText(review).includes(term)));
  const positiveReviews = textRows.filter((review) => Number(review.rating || 0) >= 4 && POSITIVE_TERMS.some((term) => normalizeText(review).includes(term)));

  return {
    package: packageName,
    name: APP_NAMES[packageName] || packageName,
    sampleSize: reviews.length,
    textReviewCount: textRows.length,
    averageRating: avg(ratings),
    lowRatingCount: ratings.filter((rating) => rating <= 2).length,
    lowRatingRate: pct(ratings.filter((rating) => rating <= 2).length, ratings.length),
    fiveStarRate: pct(ratings.filter((rating) => rating === 5).length, ratings.length),
    replyCount: repliedRows.length,
    replyRate: pct(repliedRows.length, reviews.length),
    negativeReplyRate: pct(negativeRepliedRows.length, negativeRows.length),
    medianReplyHours: 0,
    ratingDistribution,
    monthlyTrend,
    dailyTrend,
    themes,
    textTracks,
    divergentReviews: divergentReviews.slice(0, 24).map((review) => sampleReview(review)),
    replyBands: [],
    releaseComparison,
    recentVersions: versions.slice(0, 10),
    riskyVersions: [...versions].sort((a, b) => Number(b.lowRatingRate || 0) - Number(a.lowRatingRate || 0)).slice(0, 10),
    topLanguages: Array.from(languageCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([language, count]) => ({ language, count, share: pct(count, reviews.length) })),
    topNegativeDevices: Array.from(deviceCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([device, count]) => ({ device, count })),
    deviceBrands: [],
    criticalReviews: negativeRows.slice(0, 12).map((review) => sampleReview(review)),
    positiveReviews: positiveReviews.slice(0, 8).map((review) => sampleReview(review)),
    recentReviews: datedReviews.filter((review) => review.text).slice(0, 300).map((review) => sampleReview(review)),
    confidence: {
      overall: reviews.length >= 1000 ? "high" : reviews.length >= 100 ? "medium" : "low",
      textThemes: textRows.length >= 500 ? "high" : textRows.length >= 50 ? "medium" : "low",
      showTrend: monthlyTrend.length >= 3,
      showVersionCuts: reviews.length >= 500,
    },
  };
}

async function readSupabaseLiveReviews() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      liveReviews: [],
      livePulledAt: null,
      liveSource: "supabase:not-configured",
    };
  }

  for (const table of PLAYSTORE_REVIEW_TABLES) {
    const rows: any[] = [];
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(table)
        .select("package_name,review_id,author,rating,review_text,language,device,android_os_version,app_version,thumbs_up_count,posted_at,replied,reply_text,reply_posted_at,source")
        .order("posted_at", { ascending: false })
        .range(from, to);
      if (error) {
        rows.length = 0;
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    }

    const allReviews = rows
      .map((row: any) => ({
        packageName: row.package_name || "xyz.penpencil.physicswala",
        reviewId: row.review_id,
        author: jsonSafeText(row.author),
        rating: row.rating,
        text: jsonSafeText(row.review_text),
        version: jsonSafeText(row.app_version),
        date: row.posted_at ? String(row.posted_at).slice(0, 10) : null,
        postedAt: row.posted_at,
        replied: row.replied,
        replyText: jsonSafeText(row.reply_text),
        language: jsonSafeText(row.language),
        device: jsonSafeText(row.device),
        androidOs: jsonSafeText(row.android_os_version),
        thumbsUpCount: row.thumbs_up_count || 0,
        source: row.source || `supabase:${table}`,
      }));

    return {
      allReviews,
      liveReviews: allReviews.filter((review: any) => review.text),
      livePulledAt: allReviews[0]?.postedAt || null,
      liveSource: `supabase:${table}`,
    };
  }

  return {
    allReviews: [],
    liveReviews: [],
    livePulledAt: null,
    liveSource: "supabase:table-unavailable",
  };
}

export async function GET() {
  return cachedIntelligenceResponse("playstore", async () => {
  const livePayload = await readSupabaseLiveReviews();
  const allReviews = livePayload.allReviews || [];
  const liveReviews = livePayload.liveReviews || [];
  const groupedReviews = allReviews.reduce((acc: Record<string, any[]>, review: any) => {
    const packageName = review.packageName || "xyz.penpencil.physicswala";
    if (!acc[packageName]) acc[packageName] = [];
    acc[packageName].push(review);
    return acc;
  }, {});
  const liveApps = Object.fromEntries(
    Object.entries(groupedReviews).map(([packageName, reviews]) => [packageName, summarizePackage(packageName, reviews as any[])])
  );
  const apps = {
    ...((insights as any).apps || {}),
    ...liveApps,
  };
  const historyRows = (monthlyHistory as any).monthlyTrend || [];
  const historyPackage = (insights as any).primaryPackage || "xyz.penpencil.physicswala";
  if (apps[historyPackage]) {
    const mergedMonths = new Map<string, any>();
    historyRows.forEach((row: any) => mergedMonths.set(String(row.month), row));
    (apps[historyPackage].monthlyTrend || []).forEach((row: any) => mergedMonths.set(String(row.month), row));
    apps[historyPackage] = {
      ...apps[historyPackage],
      monthlyTrend: Array.from(mergedMonths.values()).sort((a, b) => String(a.month).localeCompare(String(b.month))),
      monthlyTrendSource: `${(monthlyHistory as any).source}; live Supabase rows override overlapping months`,
    };
  }
  const primaryPackage = apps[(insights as any).primaryPackage] ? (insights as any).primaryPackage : Object.keys(apps)[0] || (insights as any).primaryPackage;
  const primary = apps[primaryPackage] || {};
  const latestLiveDate = allReviews[0]?.date || null;
  const baseRange = (insights as any).dateRange || {};
  const liveDates = allReviews.map((review: any) => review.date).filter(Boolean).sort();
  const effectiveTo = latestLiveDate && latestLiveDate > String(baseRange.to || "") ? latestLiveDate : baseRange.to;
  const effectiveFrom = liveDates[0] && (!baseRange.from || liveDates[0] < String(baseRange.from)) ? liveDates[0] : baseRange.from;
  const buildContractForApp = (app: any) => {
    const reviewSignals: TextSignal[] = [
      ...(app.criticalReviews || []).map((review: any, index: number) => ({
      id: `critical-${index}`,
      title: null,
      text: review.text,
      rating: review.rating,
      sentiment: "negative",
      publishedAt: review.date,
      fetchedAt: (insights as any).generatedAt,
      replied: review.replied,
      version: review.version,
      sourceType: "review",
    })),
      ...(app.divergentReviews || []).map((review: any, index: number) => ({
      id: `divergent-${index}`,
      title: null,
      text: review.text,
      rating: review.rating,
      sentiment: "negative",
      publishedAt: review.date,
      fetchedAt: (insights as any).generatedAt,
      replied: review.replied,
      version: review.version,
      sourceType: "review",
    })),
      ...(app.positiveReviews || []).map((review: any, index: number) => ({
      id: `positive-${index}`,
      title: null,
      text: review.text,
      rating: review.rating,
      sentiment: "positive",
      publishedAt: review.date,
      fetchedAt: (insights as any).generatedAt,
      replied: review.replied,
      version: review.version,
      sourceType: "review",
    })),
    ];
    const supervisedTopics = buildSupervisedTopics(reviewSignals, { denominator: app.textReviewCount || reviewSignals.length });
    return buildChannelContract({
      channel: "playstore",
      sourceStatus: buildSourceStatus({
        mode: "live",
        generatedAt: new Date().toISOString(),
        publishedAtValues: [...reviewSignals.map((signal) => signal.publishedAt)],
        limitations: [
          "Theme percentages use written reviews only; rating-only rows are used for aggregate ratings.",
          "Live Google Play API only exposes recent review windows; historical rows come from Play Console CSV imports.",
        ],
      }),
      signals: reviewSignals,
      sentiment: summarizeSentiment(reviewSignals, "rating-and-comment-rule", {
        positive: app.ratingDistribution?.filter((row: any) => row.rating >= 4).reduce((sum: number, row: any) => sum + row.count, 0) || 0,
        negative: app.lowRatingCount || 0,
        neutral: Math.max(0, (app.sampleSize || 0) - (app.lowRatingCount || 0)),
        confidence: app.confidence?.textThemes === "high" ? 0.8 : app.confidence?.textThemes === "medium" ? 0.65 : 0.45,
      }),
      supervisedTopics,
      unsupervisedClusters: fromRuleClusters(app.themes || []),
      headline: `${app.name || "Play Store"} reviews are backed by Supabase and grouped by app package.`,
      whyItMatters: "The actionable minority lives in low-rating, unreplied, and mixed-signal written comments.",
      recommendedActions: [
        "Prioritize current-version low-rating written reviews with no developer reply.",
        "Track high-rated written reviews that still mention unresolved product or service issues.",
        "Compare package-level trends before assigning owner queues.",
      ],
    });
  };
  const contracts = Object.fromEntries(Object.entries(apps).map(([packageName, app]) => [packageName, buildContractForApp(app)]));
  const contract = contracts[primaryPackage];

  return NextResponse.json(jsonSafePayload({
    live: true,
    contract,
    contracts,
    ...insights,
    apps,
    primaryPackage,
    appOptions: Object.entries(apps).map(([packageName, app]: [string, any]) => ({
      packageName,
      name: app.name || APP_NAMES[packageName] || packageName,
      sampleSize: app.sampleSize || 0,
      latestReviewAt: app.recentReviews?.[0]?.date || null,
    })),
    dateRange: { ...baseRange, from: effectiveFrom, to: effectiveTo },
    liveReviews,
    livePulledAt: livePayload.livePulledAt,
    liveSource: livePayload.liveSource,
    liveRefreshCadenceHours: 6,
  }), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
  });
}
