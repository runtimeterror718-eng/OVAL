import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ragQuery, isRAGEnabled } from "@/lib/rag";
import { isDemoMode, demoReddit } from "@/lib/demo-data";
import { buildMonthlyTrend, buildTopicClusters } from "@/lib/social-analytics";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const dynamic = "force-dynamic";

const PW_BRAND_PATTERNS = [
  /\bphysics\s*-?\s*wallah\b/i,
  /\bphysicswallah\b/i,
  /\balakh\s+pandey\b/i,
  /\balakh\s+sir\b/i,
  /\bpw\b/i,
  /\bpw\s+(?:app|live|skills|onlyias|vidyapeeth|pathshala|khazana|infinity)\b/i,
  /\b(?:arjuna|lakshya|yakeen|prayas)\s+(?:jee|neet|batch|pw|physics\s*-?\s*wallah)\b/i,
  /\b(?:pw|physics\s*-?\s*wallah)\s+(?:arjuna|lakshya|yakeen|prayas)\b/i,
];

const PW_COURSE_TERMS = ["arjuna", "lakshya", "yakeen", "prayas", "vidyapeeth", "pathshala", "khazana"];
const PW_CONTEXT_TERMS = ["pw", "physics", "wallah", "jee", "neet", "batch", "teacher", "module", "lecture", "dpp", "test series"];

const GOOGLE_INDEXED_REDDIT_FALLBACK = [
  {
    post_id: "google-reddit-1ty6e50",
    post_title: "Cleared JEE Advanced with PW Online, but got excluded from their celebration",
    post_body: "A recent JEENEETards discussion around PW Online outcomes, result celebration selection, and whether student success stories are represented fairly.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2026-06-09T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1ty6e50/cleared_jee_advanced_with_pw_online_but_got/",
    final_sentiment: "mixed",
    post_triage_label: "mixed",
    post_triage_is_pr_risk: true,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1tf3l8r",
    post_title: "Arjuna JEE 2026 English batch start date postponed",
    post_body: "PhysicsWallah subreddit discussion from an Arjuna JEE 2026 English batch buyer asking why the May batch start date moved and whether PW announced it.",
    subreddit_name: "PhysicsWallah",
    score: 0,
    num_comments: 0,
    created_at: "2026-05-25T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/PhysicsWallah/comments/1tf3l8r/anyone_from_arjuna_jee_2026_english_batch_why_the/",
    final_sentiment: "negative",
    post_triage_label: "negative",
    post_triage_is_pr_risk: true,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1sg19f2",
    post_title: "Arjuna 2027 + Lakshya 2028 combo batch benefits",
    post_body: "PhysicsWallah subreddit thread asking whether Infinity Pro benefits apply to both Arjuna 2027 and Lakshya 2028 in the combo batch.",
    subreddit_name: "PhysicsWallah",
    score: 0,
    num_comments: 0,
    created_at: "2026-04-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/PhysicsWallah/comments/1sg19f2/arjuna_2027_lakshya_2028/",
    final_sentiment: "neutral",
    post_triage_label: "neutral",
    post_triage_is_pr_risk: false,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1rx5c03",
    post_title: "Batch reshuffle question for PW",
    post_body: "Google-indexed JEENEETards result around PW batch reshuffle, batch movement, and student uncertainty around batch operations.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2026-03-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1rx5c03/batch_reshuffle_question_for_pw/",
    final_sentiment: "neutral",
    post_triage_label: "neutral",
    post_triage_is_pr_risk: false,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1rulqo8",
    post_title: "Is PW Arjuna batch good for JEE?",
    post_body: "JEENEETards discussion around whether PW Arjuna is a good JEE prep option, including buyer confidence and comments-driven concerns.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2026-03-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1rulqo8/is_pw_arjuna_batch_good_for_jee/",
    final_sentiment: "neutral",
    post_triage_label: "neutral",
    post_triage_is_pr_risk: false,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1rr1qkh",
    post_title: "PW Vidyapeeth is good or not?",
    post_body: "JEENEETards thread about whether Physics Wallah Vidyapeeth is good enough for JEE preparation, with comments on teachers, materials, and tests.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2026-03-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1rr1qkh/pw_vidyapeeth_is_good_or_not/",
    final_sentiment: "positive",
    post_triage_label: "positive",
    post_triage_is_pr_risk: false,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1lbh9cj",
    post_title: "Is PW really a good and reliable coaching?",
    post_body: "JEENEETards discussion about PW reliability, result claims, selection ratio, faculty seriousness, and student trust.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2025-06-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1lbh9cj/is_pw_really_a_good_and_reliable_coaching/",
    final_sentiment: "negative",
    post_triage_label: "negative",
    post_triage_is_pr_risk: true,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1lggeks",
    post_title: "Facing batch/faculty issues in PW Lakshya NEET 2026",
    post_body: "Student asks whether to switch again after batch and faculty issues in PW Lakshya NEET 2026.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2025-06-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1lggeks/advice_needed_facing_batchfaculty_issues_in_pw/",
    final_sentiment: "negative",
    post_triage_label: "negative",
    post_triage_is_pr_risk: true,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1l5b9o6",
    post_title: "Is PW power batch really worth it or fraud?",
    post_body: "JEENEETards thread using fraud framing around a PW batch purchase, money, and customer-care experience.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2025-06-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1l5b9o6/is_pw_power_batch_is_really_worth_it_or_fraud/",
    final_sentiment: "negative",
    post_triage_label: "negative",
    post_triage_is_pr_risk: true,
    source_label: "Google-indexed Reddit fallback",
  },
  {
    post_id: "google-reddit-1jy0j1b",
    post_title: "Those who studied mostly from PW, Prayas and Lakshya. How much did you get?",
    post_body: "JEENEETards thread collecting outcomes and advice from students using PW Prayas and Lakshya batches.",
    subreddit_name: "JEENEETards",
    score: 0,
    num_comments: 0,
    created_at: "2025-06-16T00:00:00.000Z",
    post_url: "https://www.reddit.com/r/JEENEETards/comments/1jy0j1b/those_who_studied_mostly_from_pw_prayas_and/",
    final_sentiment: "neutral",
    post_triage_label: "neutral",
    post_triage_is_pr_risk: false,
    source_label: "Google-indexed Reddit fallback",
  },
] as const;

function isPWSpecificPost(post: any): boolean {
  // Posts in PW's own subreddits are inherently on-topic — keep them all,
  // even when a short title ("Help", "MARKS") carries no brand keyword.
  const sub = String(post?.subreddit_name || "").toLowerCase().replace(/\s+/g, "");
  if (sub === "physicswallah" || sub === "physicswala") return true;

  const text = [
    post?.post_title,
    post?.post_body,
    post?.subreddit_name,
    post?.post_flair,
  ].filter(Boolean).join(" ");
  const lower = text.toLowerCase();
  if (PW_BRAND_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return PW_COURSE_TERMS.some((term) => lower.includes(term)) && PW_CONTEXT_TERMS.some((term) => lower.includes(term));
}

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  if (data?.length) return data.map((b: any) => b.id);
  return [];
}

export async function GET() {
  if (isDemoMode()) return NextResponse.json(demoReddit);
  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) return NextResponse.json({ live: false });
  const brandId = brandIds[0];
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [postsRes, mentionsRes, embStatsRes, ragInsight] = await Promise.all([
    sb.from("reddit_posts").select("*").in("brand_id", brandIds).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    sb.from("mentions").select("sentiment_label, sentiment_score, scraped_at").in("brand_id", brandIds).eq("platform", "reddit").gte("published_at", since).order("scraped_at", { ascending: true }).limit(500),
    // LLM-classified sentiment from embeddings (Reddit only)
    sb.from("mention_embeddings").select("sentiment_label").eq("brand_id", brandId).eq("platform", "reddit").not("sentiment_label", "is", null),
    // RAG: Reddit-specific analysis
    isRAGEnabled()
      ? ragQuery("What are the main themes and narratives about Physics Wallah on Reddit? What do JEENEETards and Indian students discuss most?", {
          brandId,
          platform: "reddit",
          mentionLimit: 20,
          rerank: true,
          rerankTopK: 12,
          systemPrompt: `You are OVAL analyzing Reddit sentiment for Physics Wallah.
Provide:
1. Top 3 negative narratives (with real quotes)
2. Top 2 positive narratives (with real quotes)
3. Overall Reddit sentiment verdict (1 sentence)
4. Key subreddit themes
Be specific — this is data-driven intelligence, not speculation.`,
        })
      : Promise.resolve(null),
  ]);

  const livePosts = (postsRes.data || []).filter(isPWSpecificPost);
  const mergedPosts = [...livePosts];
  // The Google-indexed set only pads when there is NO live data — with live
  // posts present we return every real post in the 30-day window (no cap).
  if (!livePosts.length) {
    const seenPostIds = new Set(mergedPosts.map((post: any) => post.post_id).filter(Boolean));
    for (const fallbackPost of GOOGLE_INDEXED_REDDIT_FALLBACK) {
      if (seenPostIds.has(fallbackPost.post_id)) continue;
      mergedPosts.push(fallbackPost);
      seenPostIds.add(fallbackPost.post_id);
    }
  }
  const posts = mergedPosts;
  const postIds = posts.map((post: any) => post.post_id).filter(Boolean);
  const commentsRes = postIds.length
    ? await sb
        .from("reddit_comments")
        .select("comment_body, comment_author, comment_score, post_id, comment_depth, created_at, scraped_at, comment_sentiment_label")
        .in("post_id", postIds)
        .order("comment_score", { ascending: false })
        .limit(2000)
    : { data: [] };
  const comments = commentsRes.data || [];

  // Group top comments per post so each post can display its discussion.
  const commentsByPost: Record<string, any[]> = {};
  for (const c of comments) {
    const pid = c.post_id;
    if (!pid) continue;
    (commentsByPost[pid] ||= []).push(c);
  }
  const mentions = mentionsRes.data || [];
  const embStats = embStatsRes.data || [];

  // Use embedding-based sentiment (more accurate)
  const embSentiment = { positive: 0, negative: 0, neutral: 0 };
  for (const m of embStats) {
    const s = m.sentiment_label as keyof typeof embSentiment;
    if (s in embSentiment) embSentiment[s]++;
  }
  const embTotal = embStats.length;

  // Legacy sentiment
  const negCount = mentions.filter(m => m.sentiment_label === "negative").length;
  const posCount = mentions.filter(m => m.sentiment_label === "positive").length;
  const visibleSentiment = { positive: 0, negative: 0, neutral: 0 };
  for (const post of posts) {
    const label = String(post.final_sentiment || post.post_triage_label || "").toLowerCase();
    if (label.includes("negative")) visibleSentiment.negative++;
    else if (label.includes("positive")) visibleSentiment.positive++;
    else visibleSentiment.neutral++;
  }
  for (const comment of comments) {
    const label = String(comment.comment_sentiment_label || "").toLowerCase();
    if (label.includes("negative")) visibleSentiment.negative++;
    else if (label.includes("positive")) visibleSentiment.positive++;
    else if (label) visibleSentiment.neutral++;
  }
  const hasVisibleSentiment = posts.length > 0 || comments.some((comment: any) => comment.comment_sentiment_label);

  const subCounts: Record<string, number> = {};
  for (const p of posts) {
    const s = p.subreddit_name || "unknown";
    subCounts[s] = (subCounts[s] || 0) + 1;
  }

  const monthlyTrend = buildMonthlyTrend(posts, (post) => post.created_at || post.scraped_at, {
    getComments: (post) => post.num_comments,
    getEngagement: (post) => post.score,
    getSentiment: (post) => post.final_sentiment || post.post_triage_label,
  });
  const commentTrend = buildMonthlyTrend(comments, (comment) => comment.created_at || comment.scraped_at, {
    getEngagement: (comment) => comment.comment_score,
    getSentiment: (comment) => comment.comment_sentiment_label,
  });
  const clusters = buildTopicClusters([
    ...posts.map((post) => `${post.post_title || ""} ${post.post_body || ""}`),
    ...comments.map((comment) => comment.comment_body),
  ]);
  const redditSignals: TextSignal[] = [
    ...posts.map((post: any) => ({
      id: post.post_id,
      title: post.post_title,
      text: post.post_body,
      url: post.post_url,
      sentiment: post.final_sentiment || post.post_triage_label || (post.score < 0 ? "negative" : "mixed"),
      engagement: post.score,
      comments: post.num_comments,
      publishedAt: post.created_at,
      fetchedAt: post.scraped_at,
      sourceType: "post",
    })),
    ...comments.slice(0, 200).map((comment: any, index: number) => ({
      id: `comment-${comment.post_id}-${index}`,
      title: "Reddit comment",
      text: comment.comment_body,
      sentiment: comment.comment_sentiment_label,
      engagement: comment.comment_score,
      publishedAt: comment.created_at,
      fetchedAt: comment.scraped_at,
      sourceType: "comment",
    })),
  ];
  const supervisedTopics = buildSupervisedTopics(redditSignals);
  const contract = buildChannelContract({
    channel: "reddit",
    sourceStatus: buildSourceStatus({
      mode: "live",
      fetchedAtValues: [...posts.map((post: any) => post.scraped_at), ...comments.map((comment: any) => comment.scraped_at), ...mentions.map((mention: any) => mention.scraped_at)],
      publishedAtValues: [...posts.map((post: any) => post.created_at), ...comments.map((comment: any) => comment.created_at)],
      limitations: [
        "Current Reddit fetch quality depends on Reddit OAuth availability; RSS fallback can miss some conversations.",
        "Live scraped posts are restricted to the last 60 days and PW-specific matches; Google-indexed Reddit fallback fills gaps when live Reddit is blocked.",
        "Comments are scoped to the PW-specific posts shown in this dataset.",
      ],
    }),
    signals: redditSignals,
    sentiment: summarizeSentiment(redditSignals, hasVisibleSentiment ? "visible-30d-pw-posts" : (embTotal > 0 ? "llm-embedding-labels" : "rule-based"), {
      positive: hasVisibleSentiment ? visibleSentiment.positive : (embTotal > 0 ? embSentiment.positive : posCount),
      negative: hasVisibleSentiment ? visibleSentiment.negative : (embTotal > 0 ? embSentiment.negative : negCount),
      neutral: hasVisibleSentiment ? visibleSentiment.neutral : embSentiment.neutral,
      confidence: hasVisibleSentiment ? 0.72 : (embTotal > 0 ? 0.78 : 0.5),
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(clusters),
    headline: "Reddit is the trust-and-comparison room; prioritize narrative risk over raw post count.",
    whyItMatters: "Anonymous long-form discussion reveals distrust, switching, and academic-quality narratives before they become Google search risk.",
    recommendedActions: [
      "Add Reddit OAuth credentials and refresh before using this as current market read.",
      "Sort leadership view by narrative-risk score and velocity, not only upvotes.",
      "Track agreement inside comments to distinguish isolated rant from shared concern.",
    ],
  });
  const topSub = Object.entries(subCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  // Weekly sentiment trend
  const weeklyScores: { week: string; score: number }[] = [];
  const now = new Date();
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - w * 7 * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekMentions = mentions.filter(m => {
      const d = new Date(m.scraped_at);
      return d >= weekStart && d < weekEnd;
    });
    const avg = weekMentions.length > 0
      ? weekMentions.reduce((s, m) => s + (m.sentiment_score || 0), 0) / weekMentions.length
      : 0;
    weeklyScores.push({ week: `W${12 - w}`, score: Math.round(avg * 100) / 100 });
  }

  return NextResponse.json({
    live: true,
    contract,
    stats: {
      totalMentions: posts.length,
      negativeCount: hasVisibleSentiment ? visibleSentiment.negative : (embTotal > 0 ? embSentiment.negative : negCount),
      positiveCount: hasVisibleSentiment ? visibleSentiment.positive : (embTotal > 0 ? embSentiment.positive : posCount),
      neutralCount: hasVisibleSentiment ? visibleSentiment.neutral : embSentiment.neutral,
      sentiment: (hasVisibleSentiment ? visibleSentiment.negative : (embTotal > 0 ? embSentiment.negative : negCount)) > (hasVisibleSentiment ? visibleSentiment.positive : (embTotal > 0 ? embSentiment.positive : posCount))
        ? "Mixed-negative" : "Positive-leaning",
      topSubreddit: topSub === "N/A" ? "N/A" : `r/${topSub}`,
      sentimentSource: hasVisibleSentiment ? "visible-30d-pw-posts" : (embTotal > 0 ? "llm-classified" : "rule-based"),
      totalEmbeddings: embTotal,
      window: "last 60 days",
      liveScrapedPosts: livePosts.length,
      googleFallbackPosts: posts.filter((post: any) => post.source_label).length,
    },
    posts: posts.map(p => ({
      subreddit: p.subreddit_name,
      title: p.post_title,
      snippet: (p.post_body || "").slice(0, 150),
      upvotes: p.score,
      comments: p.num_comments,
      sentiment: p.final_sentiment || p.post_triage_label || (p.score < 0 ? "negative" : "mixed"),
      source: p.source_label || "Live Reddit scrape",
      url: p.post_url,
      createdAt: p.created_at,
      topComments: (commentsByPost[p.post_id] || []).slice(0, 8).map((c: any) => ({
        author: c.comment_author,
        body: c.comment_body,
        score: c.comment_score,
        sentiment: c.comment_sentiment_label || "neutral",
        createdAt: c.created_at,
      })),
    })),
    sentimentTrend: weeklyScores,
    monthlyTrend,
    commentTrend,
    clusters,
    totalComments: comments.length,
    subredditBreakdown: Object.entries(subCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    meta: {
      window: "last 60 days",
      generatedAt: new Date().toISOString(),
      totalPosts: posts.length,
      totalComments: comments.length,
      liveSources: Array.from(new Set(livePosts.map((p: any) => (p.raw_data?.source || "reddit").toString()))),
    },
    // Fetch/pull activity log — one row per subreddit×source pull batch, from
    // the stored posts' own timestamps (real ingestion record, not fabricated).
    pullLog: Object.values(
      livePosts.reduce((acc: Record<string, any>, p: any) => {
        const sub = p.subreddit_name || "unknown";
        const src = (p.raw_data?.source || "reddit-api").toString();
        const key = `${sub}::${src}`;
        const scraped = p.scraped_at || p.created_at;
        if (!acc[key]) acc[key] = { subreddit: sub, source: src, posts: 0, comments: 0, firstPost: p.created_at, lastPost: p.created_at, pulledAt: scraped };
        const row = acc[key];
        row.posts += 1;
        row.comments += Number(p.num_comments || 0);
        if (p.created_at && p.created_at < row.firstPost) row.firstPost = p.created_at;
        if (p.created_at && p.created_at > row.lastPost) row.lastPost = p.created_at;
        if (scraped && scraped > row.pulledAt) row.pulledAt = scraped;
        return acc;
      }, {})
    ).sort((a: any, b: any) => b.posts - a.posts),
    rag: ragInsight ? {
      enabled: true,
      analysis: ragInsight.answer,
      confidence: ragInsight.confidence,
      mentionsUsed: ragInsight.metadata.mentionsAfterRerank,
      avgSimilarity: ragInsight.metadata.avgSimilarity,
      sentimentBreakdown: ragInsight.metadata.sentimentBreakdown,
    } : { enabled: false },
  });
}
