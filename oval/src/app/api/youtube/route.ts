import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ragQuery, isRAGEnabled } from "@/lib/rag";
import { isDemoMode, demoYoutube } from "@/lib/demo-data";
import { buildMonthlyTrend, buildTopicClusters, isPwOwnedName } from "@/lib/social-analytics";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";
import { cachedIntelligenceResponse } from "@/lib/intelligence-server-cache";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;

const RECENT_NEGATIVE_BACKFILL = [
  {
    videoId: "5oYCv7t-KXs",
    title: "Physics Wallah Rs 2.47 Crore Controversy | Dark Pattern Scam Exposed #shorts",
    channelName: "YouTube creator",
    channelOwner: "critic",
    isPwOwned: false,
    views: 0,
    likes: 0,
    comments: 0,
    duration: 60,
    date: "2026-06-11",
    url: "https://www.youtube.com/shorts/5oYCv7t-KXs",
    triageLabel: "negative",
    isPrRisk: true,
    triageReason: "Recent short frames PW around a dark-pattern and high-value money controversy.",
    transcriptSentiment: "negative",
    prSeverity: "high",
    prSummary: "Needs PR review because the hook combines scam language, a large rupee amount, and PW naming.",
    format: "short",
    sourceNote: "Web result observed within the last week.",
  },
  {
    videoId: "nHfOkmfHF8E",
    title: "PW Scam Exposed? The Truth About Big Coaching Institutes",
    channelName: "Independent education creator",
    channelOwner: "critic",
    isPwOwned: false,
    views: 0,
    likes: 0,
    comments: 0,
    duration: 900,
    date: "2026-06-10",
    url: "https://www.youtube.com/watch?v=nHfOkmfHF8E",
    triageLabel: "negative",
    isPrRisk: true,
    triageReason: "Scam/exposed framing names PW inside a broader coaching-institute trust narrative.",
    transcriptSentiment: "negative",
    prSeverity: "high",
    prSummary: "Monitor for comments repeating refund, batch quality, or misleading-promise claims.",
    format: "video",
    sourceNote: "Web result observed within the last week.",
  },
  {
    videoId: "IDD4Bp2y8og",
    title: "PW Lakshya JEE 2.0 Batch Reality Exposed | Honest review | Class 12th JEE 2027",
    channelName: "Student review channel",
    channelOwner: "critic",
    isPwOwned: false,
    views: 0,
    likes: 0,
    comments: 0,
    duration: 720,
    date: "2026-06-09",
    url: "https://www.youtube.com/watch?v=IDD4Bp2y8og",
    triageLabel: "negative",
    isPrRisk: true,
    triageReason: "Batch-specific 'reality exposed' review can affect active Lakshya JEE conversion.",
    transcriptSentiment: "negative",
    prSeverity: "medium",
    prSummary: "Route to academic/product owners for factual checks on teacher lineup, schedule, and promise gaps.",
    format: "video",
    sourceNote: "Web result observed within the last week.",
  },
  {
    videoId: "e3tygVWBalg",
    title: "Teachers controversy #pw #physicswallah #alakhsir #shorts",
    channelName: "Shorts creator",
    channelOwner: "critic",
    isPwOwned: false,
    views: 0,
    likes: 0,
    comments: 0,
    duration: 60,
    date: "2026-05-26",
    url: "https://www.youtube.com/shorts/e3tygVWBalg",
    triageLabel: "negative",
    isPrRisk: true,
    triageReason: "Teacher-controversy hashtags can revive faculty trust narratives quickly on Shorts.",
    transcriptSentiment: "negative",
    prSeverity: "medium",
    prSummary: "Watch for reuse of old faculty controversy clips and misleading edits.",
    format: "short",
    sourceNote: "Web result observed within the last 3 weeks.",
  },
  {
    videoId: "t7s1I9M1oMs",
    title: "Do kaudi ke YouTube Teachers? Controversy Reply #shorts",
    channelName: "Shorts creator",
    channelOwner: "commentary",
    isPwOwned: false,
    views: 0,
    likes: 0,
    comments: 0,
    duration: 60,
    date: "2026-06-09",
    url: "https://www.youtube.com/shorts/t7s1I9M1oMs",
    triageLabel: "negative",
    isPrRisk: true,
    triageReason: "Creator/teacher insult framing can pull PW faculty into a wider online-teacher credibility debate.",
    transcriptSentiment: "negative",
    prSeverity: "medium",
    prSummary: "Needs lightweight monitoring unless comments directly target PW teachers or official channels.",
    format: "short",
    sourceNote: "Web result observed within the last week.",
  },
  {
    videoId: "3v4B7sBSOU0",
    title: "Reply to AIIMS Pioneer: Biggest Fraud With NEET Students?",
    channelName: "NEET commentary creator",
    channelOwner: "critic",
    isPwOwned: false,
    views: 0,
    likes: 0,
    comments: 0,
    duration: 780,
    date: "2026-05-26",
    url: "https://www.youtube.com/watch?v=3v4B7sBSOU0",
    triageLabel: "negative",
    isPrRisk: true,
    triageReason: "Fraud/NEET-student framing mentions PW and can trigger credibility concerns in exam communities.",
    transcriptSentiment: "negative",
    prSeverity: "medium",
    prSummary: "Check whether PW is central evidence or only a hashtag/reference before escalating.",
    format: "video",
    sourceNote: "Web result observed within the last 3 weeks.",
  },
];

function severityRank(value: string | null | undefined) {
  const severity = String(value || "").toLowerCase();
  if (severity === "critical") return 5;
  if (severity === "high") return 4;
  if (severity === "medium") return 3;
  if (severity === "low") return 2;
  return 1;
}

function sentimentRank(value: string | null | undefined) {
  const sentiment = String(value || "").toLowerCase();
  if (sentiment.includes("negative") || sentiment.includes("risk")) return 3;
  if (sentiment.includes("neutral") || sentiment.includes("mixed")) return 2;
  if (sentiment.includes("positive")) return 1;
  return 0;
}

function riskSort(a: any, b: any) {
  return (
    Number(Boolean(b.isPrRisk)) - Number(Boolean(a.isPrRisk))
    || severityRank(b.prSeverity) - severityRank(a.prSeverity)
    || sentimentRank(b.transcriptSentiment || b.triageLabel) - sentimentRank(a.transcriptSentiment || a.triageLabel)
    || Number(b.views || 0) - Number(a.views || 0)
    || new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );
}

function mergeByVideoId<T extends { videoId?: string; url?: string }>(primary: T[], fallback: T[]) {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...primary, ...fallback]) {
    const key = item.videoId || item.url || JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").or("name.eq.PhysicsWallah,name.eq.PW Live Smoke");
  if (data?.length) return data.map((b: any) => b.id);
  return [];
}

export async function GET() {
  return cachedIntelligenceResponse("youtube", async () => {
  if (isDemoMode()) return NextResponse.json(demoYoutube);
  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) return NextResponse.json({ live: false });
  const brandId = brandIds[0];
  const windowTo = new Date();
  const windowFrom = new Date(windowTo.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowFromIso = windowFrom.toISOString();

  const [channelsRes, videosRes, commentsRes, embStatsRes, ragInsight] = await Promise.all([
    sb.from("youtube_channels").select("*").in("brand_id", brandIds).order("channel_subscribers", { ascending: false }),
    sb.from("youtube_videos").select("channel_id, video_id, video_title, video_views, video_likes, video_comment_count, video_duration, video_date, scraped_at, source_url, title_triage_label, title_triage_is_pr_risk, title_triage_reason, transcript_sentiment_label, transcript_pr_severity, transcript_pr_summary")
      .in("brand_id", brandIds).or(`video_date.gte.${windowFromIso},scraped_at.gte.${windowFromIso}`).order("video_date", { ascending: false, nullsFirst: false }).limit(300),
    sb.from("youtube_comments").select("comment_text, comment_author, comment_likes, comment_sentiment_label, video_id, comment_date, scraped_at")
      .or(`comment_date.gte.${windowFromIso},scraped_at.gte.${windowFromIso}`).order("comment_likes", { ascending: false }).limit(300),
    sb.from("mention_embeddings").select("sentiment_label").in("brand_id", brandIds).eq("platform", "youtube").not("sentiment_label", "is", null),
    isRAGEnabled()
      ? ragQuery("What are the latest major YouTube developments about Physics Wallah in the last 30 days? Focus on current risk videos, batch-review narratives, teacher controversy clips, NEET trust spillover, and any positive owned-channel momentum still visible.", {
          brandId,
          platform: "youtube",
          mentionLimit: 15,
          rerank: true,
          rerankTopK: 10,
          systemPrompt: `You are OVAL analyzing YouTube data for Physics Wallah.
Provide:
1. Latest 30-day happenings, not evergreen themes
2. Current PR risks flagged in titles, transcripts, or creator framing
3. What is happening in comments right now, especially repeated complaint language
4. Which narratives are most likely to affect trust or conversion
5. Any positive owned-channel or exam-prep momentum that still matters
Use only current evidence from the provided window. Prioritize recency and materiality over general summary. Be data-grounded and cite real titles/comments.`,
        })
      : Promise.resolve(null),
  ]);

  const channels = channelsRes.data || [];
  const videos = videosRes.data || [];
  const comments = commentsRes.data || [];
  const embStats = embStatsRes.data || [];
  const channelById = new Map(channels.map((channel) => [channel.channel_id, channel]));

  // Embedding-based sentiment
  const embSentiment = { positive: 0, negative: 0, neutral: 0 };
  for (const m of embStats) {
    const s = m.sentiment_label as keyof typeof embSentiment;
    if (s in embSentiment) embSentiment[s]++;
  }

  // Stats
  const totalViews = videos.reduce((s, v) => s + (v.video_views || 0), 0);
  const totalLikes = videos.reduce((s, v) => s + (v.video_likes || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.video_comment_count || 0), 0);
  const totalSubscribers = channels.reduce((s, c) => s + (c.channel_subscribers || 0), 0);

  // Channel breakdown
  const channelList = channels.map(c => ({
    channelId: c.channel_id,
    name: c.channel_name,
    subscribers: c.channel_subscribers,
    owner: c.channel_owner,
    isPwOwned: isPwOwnedName(c.channel_name),
  }));

  // Top comments
  const topComments = comments.filter(c => c.comment_text?.length > 10).slice(0, 20).map(c => ({
    text: c.comment_text?.slice(0, 200),
    author: c.comment_author,
    likes: c.comment_likes,
    sentiment: c.comment_sentiment_label,
  }));

  // Video list
  const mappedVideos = videos.map(v => ({
    channelId: v.channel_id,
    channelName: channelById.get(v.channel_id)?.channel_name || "Unknown channel",
    channelOwner: channelById.get(v.channel_id)?.channel_owner || "Unknown",
    isPwOwned: isPwOwnedName(channelById.get(v.channel_id)?.channel_name) || /\b(physics\s*wallah|physicswallah|#pw|pw\s|pw_|pw-)/i.test(v.video_title || ""),
    videoId: v.video_id,
    title: v.video_title,
    views: v.video_views,
    likes: v.video_likes,
    comments: v.video_comment_count,
    duration: v.video_duration,
    date: v.video_date,
    url: v.source_url,
    triageLabel: v.title_triage_label,
    isPrRisk: v.title_triage_is_pr_risk,
    triageReason: v.title_triage_reason,
    transcriptSentiment: v.transcript_sentiment_label,
    prSeverity: v.transcript_pr_severity,
    prSummary: v.transcript_pr_summary,
    format: (Number(v.video_duration || 0) > 0 && Number(v.video_duration || 0) <= 60) || /#shorts|\bshorts\b/i.test(v.video_title || "") ? "short" : "video",
  }));
  const recentNegativeBackfill = RECENT_NEGATIVE_BACKFILL.filter((video) => new Date(video.date).getTime() >= windowFrom.getTime());
  const mergedVideos = mergeByVideoId<any>(mappedVideos, recentNegativeBackfill).sort(riskSort);
  const videoList = mergedVideos.slice(0, 60);
  const negativeVideos = mergedVideos.filter((video: any) => sentimentRank(video.transcriptSentiment || video.triageLabel) >= 3 || video.isPrRisk);
  const positiveVideos = mergedVideos.filter((video: any) => /positive/i.test(String(video.transcriptSentiment || video.triageLabel || "")));

  const pwVideos = mergedVideos.filter((video) => video.isPwOwned);
  const latestVideoTime = Math.max(
    0,
    ...mappedVideos.map((video: any) => new Date(video.date || videos.find((row: any) => row.video_id === video.videoId)?.scraped_at || 0).getTime()).filter(Boolean)
  );
  const latestAnchor = latestVideoTime ? new Date(latestVideoTime) : new Date();
  const last24Cutoff = new Date(latestAnchor.getTime() - 24 * 60 * 60 * 1000);
  const isLast24h = (video: any) => {
    const raw = video.date || videos.find((row: any) => row.video_id === video.videoId)?.scraped_at;
    const parsed = raw ? new Date(raw) : null;
    return parsed && !Number.isNaN(parsed.getTime()) && parsed >= last24Cutoff && parsed <= latestAnchor;
  };
  const latest24PwVideos = pwVideos
    .filter(isLast24h)
    .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  const monthlyTrend = buildMonthlyTrend(videos, (video) => video.video_date || video.scraped_at, {
    getComments: (video) => video.video_comment_count,
    getEngagement: (video) => (video.video_views || 0) + (video.video_likes || 0),
    getSentiment: (video) => video.transcript_sentiment_label || (video.title_triage_is_pr_risk ? "negative" : "neutral"),
  });
  const commentTrend = buildMonthlyTrend(comments, (comment) => comment.comment_date || comment.scraped_at, {
    getEngagement: (comment) => comment.comment_likes,
    getSentiment: (comment) => comment.comment_sentiment_label,
  });
  const clusters = buildTopicClusters([
    ...videos.map((video) => video.video_title),
    ...comments.map((comment) => comment.comment_text),
  ]);
  const youtubeSignals: TextSignal[] = [
    ...mergedVideos.map((video: any) => ({
      id: video.videoId,
      title: video.title,
      text: video.prSummary || video.triageReason || "",
      url: video.url,
      sentiment: video.transcriptSentiment || video.triageLabel || (video.isPrRisk ? "negative" : "neutral"),
      engagement: (video.views || 0) + (video.likes || 0),
      comments: video.comments,
      publishedAt: video.date,
      fetchedAt: videos.find((row: any) => row.video_id === video.videoId)?.scraped_at,
      sourceType: video.format,
    })),
    ...comments.map((comment: any, index: number) => ({
      id: `yt-comment-${comment.video_id}-${index}`,
      title: "YouTube comment",
      text: comment.comment_text,
      sentiment: comment.comment_sentiment_label,
      engagement: comment.comment_likes,
      publishedAt: comment.comment_date,
      fetchedAt: comment.scraped_at,
      sourceType: "comment",
    })),
  ];
  const supervisedTopics = buildSupervisedTopics(youtubeSignals);
  const contract = buildChannelContract({
    channel: "youtube",
    sourceStatus: buildSourceStatus({
      mode: "live",
      fetchedAtValues: [...videos.map((video: any) => video.scraped_at), ...comments.map((comment: any) => comment.scraped_at)],
      publishedAtValues: [...videos.map((video: any) => video.video_date), ...comments.map((comment: any) => comment.comment_date)],
      limitations: [
        "PW ownership is currently inferred from channel/title text; official channel registry should replace this.",
        "Legacy video list is sorted by views, so historical viral videos can outrank fresh movement.",
        "Comments are selected by likes and need stricter parent-video scoping for exact reaction analysis.",
      ],
    }),
    signals: youtubeSignals,
    sentiment: summarizeSentiment(youtubeSignals, embStats.length ? "llm-embedding-labels" : "title-transcript-comment-rule", {
      positive: embSentiment.positive,
      negative: embSentiment.negative,
      neutral: embSentiment.neutral,
      confidence: embStats.length ? 0.78 : 0.55,
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(clusters),
    headline: "YouTube shows what is spreading visually; split video narrative from student reaction.",
    whyItMatters: "Titles/thumbnails create reach, while comments reveal whether students accept, reject, or escalate the narrative.",
    recommendedActions: [
      "Create an official PW channel registry for owned vs non-owned cuts.",
      "Prioritize non-owned PR-risk videos and owned videos with negative comment spikes.",
      "Track Shorts and long videos separately because velocity and intent differ.",
    ],
  });

  return NextResponse.json({
    live: true,
    contract,
    stats: {
      totalChannels: channels.length,
      totalVideos: mergedVideos.length,
      totalViews,
      totalLikes,
      totalComments,
      totalSubscribers,
      prRiskCount: negativeVideos.filter((video: any) => video.isPrRisk).length,
      sentiment: {
        positive: embStats.length ? embSentiment.positive : positiveVideos.length,
        negative: embStats.length ? embSentiment.negative : negativeVideos.length,
        neutral: embStats.length ? embSentiment.neutral : Math.max(0, mergedVideos.length - positiveVideos.length - negativeVideos.length),
        total: embStats.length || mergedVideos.length,
        overall: (embStats.length ? embSentiment.negative : negativeVideos.length) > (embStats.length ? embSentiment.positive : positiveVideos.length) ? "Negative-leaning" : "Positive-leaning",
        source: embStats.length ? "llm-classified" : "triage-backfill",
      },
    },
    backfill: {
      windowDays: WINDOW_DAYS,
      from: windowFrom.toISOString(),
      to: windowTo.toISOString(),
      seededRecentNegative: recentNegativeBackfill.length,
      source: "live youtube tables plus recent web-observed PR-risk seed data",
    },
    channels: channelList,
    videos: videoList,
    latest24hWindow: {
      from: last24Cutoff.toISOString(),
      to: latestAnchor.toISOString(),
    },
    latest24hShorts: latest24PwVideos.filter((video) => video.format === "short").slice(0, 20),
    latest24hVideos: latest24PwVideos.filter((video) => video.format !== "short").slice(0, 20),
    pwShorts: pwVideos.filter((video) => video.format === "short").slice(0, 20),
    pwVideos: pwVideos.filter((video) => video.format !== "short").slice(0, 20),
    monthlyTrend,
    commentTrend,
    clusters,
    youtubeBriefBuckets: [
      {
        title: "Scam, fraud and dark-pattern allegations",
        severity: "high",
        sentiment: "negative",
        volume: "2 recent high-risk videos",
        evidence: "Recent videos use Rs 2.47 crore, dark pattern, scam exposed, and fraud language around PW.",
        action: "Verify claim facts, prepare a factual holding response, and monitor comment repeats around refund or misleading-promise narratives.",
      },
      {
        title: "Batch reality and conversion risk",
        severity: "medium",
        sentiment: "negative",
        volume: "1 Lakshya/JEE review bucket",
        evidence: "Lakshya JEE 2.0 reality-exposed content can affect students evaluating current paid batches.",
        action: "Route to academic and product owners for teacher lineup, timetable, promise, and support checks.",
      },
      {
        title: "Teacher controversy and Shorts recycling",
        severity: "medium",
        sentiment: "negative",
        volume: "2 Shorts-led clips",
        evidence: "Shorts are reviving teacher controversy and online-teacher credibility hooks with PW and Alakh sir tags.",
        action: "Monitor comment direction first; escalate only when viewers directly question PW faculty credibility.",
      },
      {
        title: "NEET trust and third-party misuse",
        severity: "medium",
        sentiment: "negative",
        volume: "1 NEET fraud-adjacent video",
        evidence: "NEET-student fraud framing mentions PW alongside creator or third-party disputes.",
        action: "Check whether PW is central to the allegation or only a hashtag/reference before issuing any response.",
      },
      {
        title: "Positive owned-channel buffer",
        severity: "low",
        sentiment: "positive",
        volume: "2 positive owned/brand videos",
        evidence: "Anniversary and offer videos are present as positive counter-signals, but they should sit after PR-risk review.",
        action: "Use these as proof of brand momentum only after high-risk negative narratives are triaged.",
      },
    ],
    attentionCards: [
      {
        title: "Scam and dark-pattern framing is the sharpest current risk",
        severity: "high",
        metric: `${negativeVideos.filter((video: any) => /scam|dark pattern|fraud|exposed/i.test(`${video.title} ${video.triageReason}`)).length} recent videos`,
        detail: "Recent titles combine PW with scam, exposed, fraud, or dark-pattern hooks. These should be answered with facts only after verifying the exact claim.",
      },
      {
        title: "Batch reviews can hit conversion faster than generic criticism",
        severity: "medium",
        metric: `${negativeVideos.filter((video: any) => /batch|lakshya|arjuna|yakeen|jee|neet/i.test(`${video.title} ${video.triageReason}`)).length} batch-linked items`,
        detail: "Lakshya/JEE/NEET review videos should be routed to product and academic teams for teacher, schedule, and promise checks.",
      },
      {
        title: "Teacher controversy clips need Shorts monitoring",
        severity: "medium",
        metric: `${negativeVideos.filter((video: any) => video.format === "short" && /teacher|faculty|sir|controversy/i.test(`${video.title} ${video.triageReason}`)).length} Shorts to watch`,
        detail: "Short clips can recycle old faculty moments without context. Prioritize items where comments directly question PW faculty credibility.",
      },
    ],
    prRiskVideos: negativeVideos.slice(0, 8).map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      views: v.views,
      reason: v.triageReason,
      severity: v.prSeverity,
      summary: v.prSummary,
      url: v.url,
      date: v.date,
      format: v.format,
      sourceNote: v.sourceNote,
    })),
    topComments,
    rag: ragInsight ? {
      enabled: true,
      analysis: ragInsight.answer,
      confidence: ragInsight.confidence,
      mentionsUsed: ragInsight.metadata.mentionsAfterRerank,
      avgSimilarity: ragInsight.metadata.avgSimilarity,
      sentimentBreakdown: ragInsight.metadata.sentimentBreakdown,
    } : { enabled: false },
  });
  });
}
