import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import insights from "@/data/playstore-insights.json";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";

export const dynamic = "force-dynamic";

async function readJsonFile(relativePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "src", "data", relativePath), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  const primary = (insights as any).apps?.[(insights as any).primaryPackage] || {};
  const liveStore = await readJsonFile("playstore-live-reviews.json");
  const pullLog = (await readJsonFile("playstore-pull-log.json")) || [];
  const liveReviews = Object.values(liveStore?.reviews || {})
    .map((review: any) => ({
      reviewId: review.reviewId,
      author: review.author,
      rating: review.rating,
      text: review.text,
      version: review.version,
      date: review.date ? String(review.date).slice(0, 10) : null,
      postedAt: review.date,
      replied: review.replied,
      replyText: review.replyText,
      language: review.language,
      device: review.device,
      thumbsUpCount: review.thumbsUpCount,
      source: "live-api",
    }))
    .filter((review: any) => review.text)
    .sort((a: any, b: any) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
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
    livePulledAt: liveStore?.lastPulledAt || null,
    pullLog,
  });
}
