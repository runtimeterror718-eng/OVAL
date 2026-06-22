import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import insights from "@/data/playstore-insights.json";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";

export const dynamic = "force-dynamic";

const PLAYSTORE_REVIEW_TABLES = (process.env.PLAYSTORE_REVIEWS_TABLE || "playstore_reviews")
  .split(",")
  .map((table) => table.trim())
  .filter(Boolean);
const SUPABASE_PAGE_SIZE = 1000;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
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

function normalizeLiveReview(row: Record<string, any>, source: string) {
  const postedAt = firstValue(row, ["posted_at", "published_at", "created_at", "date", "review_date", "updated_at"]);
  const text = firstValue(row, ["text", "review_text", "content", "body", "comment"]);
  if (!text) return null;
  return {
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
        .select("review_id,author,rating,review_text,language,device,android_os_version,app_version,thumbs_up_count,posted_at,replied,reply_text,reply_posted_at,source")
        .order("posted_at", { ascending: false })
        .range(from, to);
      if (error) {
        rows.length = 0;
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    }

    const liveReviews = rows
      .map((row: any) => ({
        reviewId: row.review_id,
        author: row.author,
        rating: row.rating,
        text: row.review_text,
        version: row.app_version,
        date: row.posted_at ? String(row.posted_at).slice(0, 10) : null,
        postedAt: row.posted_at,
        replied: row.replied,
        replyText: row.reply_text,
        language: row.language,
        device: row.device,
        thumbsUpCount: row.thumbs_up_count || 0,
        source: row.source || `supabase:${table}`,
      }))
      .filter((review: any) => review.text);

    return {
      liveReviews,
      livePulledAt: liveReviews[0]?.postedAt || null,
      liveSource: `supabase:${table}`,
    };
  }

  return {
    liveReviews: [],
    livePulledAt: null,
    liveSource: "supabase:table-unavailable",
  };
}

export async function GET() {
  const primary = (insights as any).apps?.[(insights as any).primaryPackage] || {};
  const livePayload = await readSupabaseLiveReviews();
  const liveReviews = livePayload.liveReviews;
  const latestLiveDate = liveReviews[0]?.date || null;
  const baseRange = (insights as any).dateRange || {};
  const effectiveTo = latestLiveDate && latestLiveDate > String(baseRange.to || "") ? latestLiveDate : baseRange.to;
  const reviewSignals: TextSignal[] = [
    ...(primary.criticalReviews || []).map((review: any, index: number) => ({
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
    ...(primary.divergentReviews || []).map((review: any, index: number) => ({
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
    ...(primary.positiveReviews || []).map((review: any, index: number) => ({
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
  const supervisedTopics = buildSupervisedTopics(reviewSignals, { denominator: primary.textReviewCount || reviewSignals.length });
  const contract = buildChannelContract({
    channel: "playstore",
    sourceStatus: buildSourceStatus({
      mode: "static_upload",
      generatedAt: (insights as any).generatedAt,
      publishedAtValues: [
        (insights as any).dateRange?.from,
        (insights as any).dateRange?.to,
        ...reviewSignals.map((signal) => signal.publishedAt),
      ],
      limitations: [
        "Built from uploaded Google Play Console CSV exports, not live Play Store API.",
        "Theme percentages use written reviews only; rating-only rows are not treated as text evidence.",
        "Device brand is inferred from Play device codename and is reliable at brand level, not exact model level.",
      ],
    }),
    signals: reviewSignals,
    sentiment: summarizeSentiment(reviewSignals, "rating-and-comment-rule", {
      positive: primary.ratingDistribution?.filter((row: any) => row.rating >= 4).reduce((sum: number, row: any) => sum + row.count, 0) || 0,
      negative: primary.lowRatingCount || 0,
      neutral: Math.max(0, (primary.sampleSize || 0) - (primary.lowRatingCount || 0)),
      confidence: primary.confidence?.textThemes === "high" ? 0.8 : primary.confidence?.textThemes === "medium" ? 0.65 : 0.45,
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(primary.themes || []),
    headline: "Play Store is a static review snapshot: ratings are broad context, written comments are the evidence layer.",
    whyItMatters: "The actionable minority lives in low-rating, unreplied, and mixed-signal written comments, especially around access, payment, video, delivery, and version regressions.",
    recommendedActions: [
      "Prioritize current-version low-rating written reviews with no developer reply.",
      "Track high-rated written reviews that still mention unresolved product or service issues.",
      "Add live Play Store ingestion before treating this as daily monitoring.",
    ],
  });

  return NextResponse.json({
    live: true,
    contract,
    ...insights,
    dateRange: { ...baseRange, to: effectiveTo },
    liveReviews,
    livePulledAt: livePayload.livePulledAt,
    liveSource: livePayload.liveSource,
    liveRefreshCadenceHours: 1,
  });
}
