import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import semanticClusters from "@/data/semantic-clusters.json";
import { cachedIntelligenceResponse } from "@/lib/intelligence-server-cache";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f";
const X_QUERY = '(PhysicsWallah OR "Physics Wallah" OR "PW Skills" OR "PW Vidyapeeth" OR "PW OnlyIAS" OR "PW app" OR "PW batch" OR "Alakh Pandey") -is:retweet';
const X_CRITICAL_QUERY = '(PhysicsWallah OR "Physics Wallah" OR "PW Skills" OR "PW Vidyapeeth" OR "PW OnlyIAS" OR "PW app" OR "PW batch" OR "Alakh Pandey") (scam OR fraud OR refund OR toxic OR worst OR bad OR issue OR problem OR crash OR misleading OR layoff OR fired OR termination OR complaint OR cheat OR fake OR unpaid OR overpriced OR waste OR delay OR buffering OR "not working" OR disappointed OR controversy OR criticism) -is:retweet';
const NEGATIVE = /scam|fraud|refund|toxic|worst|bad|poor|issue|problem|crash|mislead|layoff|fired|termination|complaint|cheat|fake|unpaid|overpriced|waste|delay|buffer|not working|disappoint|controvers|critici/i;
const POSITIVE = /great|good|best|excellent|proud|success|congrat|inspiring|growth|achievement|helpful|affordable|love/i;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type XPost = { id: string; author: string; text: string; createdAt?: string; url?: string; likes: number; reposts: number; replies: number; sentiment: "positive" | "neutral" | "negative" };
type LiveResult = { posts: XPost[]; targeted: XPost[]; generalCount: number };
let liveCache: { expiresAt: number; result: LiveResult } | null = null;

class XApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function classify(text: string): XPost["sentiment"] {
  if (NEGATIVE.test(text)) return "negative";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}

type XSource = "x-api" | "supabase" | "stored-snapshot";

function buildPayload(posts: XPost[], source: XSource, setupRequired = false, emptyNarrative?: string, targeted: XPost[] = [], generalCount = posts.length) {
  const sentiment = posts.reduce((totals, post) => ({ ...totals, [post.sentiment]: totals[post.sentiment] + 1 }), { positive: 0, neutral: 0, negative: 0 });
  const themes = [
    { name: "Student experience and support", test: /student|support|refund|course|batch|app|class/i, summary: "Posts discuss learner experience, course access, support and product delivery." },
    { name: "Business, IPO and growth", test: /ipo|valuation|business|growth|revenue|profit|investor|acquisition/i, summary: "The professional narrative evaluates growth, valuation and business decisions." },
    { name: "Teachers and learning outcomes", test: /teacher|faculty|rank|result|neet|jee|exam|alakh/i, summary: "Conversation centres on educators, examinations and learning outcomes." },
    { name: "Workplace and hiring", test: /employee|work culture|hiring|interview|salary|layoff|fired|termination/i, summary: "Posts discuss employment, workplace culture and candidate experience." },
  ].map((theme) => {
    const evidence = posts.filter((post) => theme.test.test(post.text));
    return { name: theme.name, count: evidence.length, share: posts.length ? evidence.length / posts.length * 100 : 0, summary: theme.summary, sentiment: evidence.filter((post) => post.sentiment === "negative").length > evidence.length / 2 ? "negative" : "mixed", evidence };
  }).filter((theme) => theme.count).sort((a, b) => b.count - a.count);
  const narrative = posts.length
    ? `${sentiment.negative} critical, ${sentiment.positive} positive and ${sentiment.neutral} neutral X posts were retrieved. ${themes[0] ? `${themes[0].name} is the largest recurring theme.` : "No single theme dominates."}`
    : emptyNarrative || "Connect the X developer bearer token to retrieve recent public posts mentioning Physics Wallah.";
  const negativePosts = posts.filter((post) => post.sentiment === "negative");
  const criticalThemes = themes.map((theme) => {
    const evidence = theme.evidence.filter((post) => post.sentiment === "negative");
    return { name: theme.name, count: evidence.length, share: negativePosts.length ? evidence.length / negativePosts.length * 100 : 0, summary: theme.summary, evidence };
  }).filter((theme) => theme.count).sort((a, b) => b.count - a.count);
  const criticalEngagement = negativePosts.reduce((sum, post) => sum + post.likes + post.reposts + post.replies, 0);
  const topCriticalPosts = [...negativePosts].sort((a, b) => (b.likes + b.reposts * 2 + b.replies) - (a.likes + a.reposts * 2 + a.replies)).slice(0, 10);
  return {
    live: posts.length > 0,
    setupRequired,
    source,
    query: X_QUERY,
    criticalQuery: X_CRITICAL_QUERY,
    window: source === "stored-snapshot"
      ? "Last successful X retrieval · 3–4 Aug 2026"
      : "Recent X search · up to 7 days",
    retrieval: { generalRequested: 100, criticalRequested: source === "x-api" ? 100 : 0, generalRetrieved: generalCount, criticalRetrieved: targeted.length, uniqueRetrieved: posts.length, verifiedNegative: negativePosts.length, cacheMinutes: 10 },
    stats: { totalPosts: posts.length, ...sentiment },
    summary: { narrative },
    analysis: {
      headline: negativePosts.length ? `${negativePosts.length} critical posts require evidence-led review.` : "No posts in this retrieval matched the critical-signal rules.",
      summary: criticalThemes[0] ? `${criticalThemes[0].name} is the largest critical theme, representing ${criticalThemes[0].share.toFixed(0)}% of verified negative posts.` : "Continue monitoring before treating isolated criticism as a recurring pattern.",
      criticalEngagement,
      targetedRetrieved: targeted.length,
      verifiedNegative: negativePosts.length,
      themes: criticalThemes,
      topCriticalPosts,
    },
    clusters: themes,
    posts,
  };
}

async function storedPosts(): Promise<XPost[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return [];
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from("twitter_tweets")
    .select("tweet_id,tweet_text,author_username,created_at,tweet_url,like_count,retweet_count,reply_count")
    .eq("brand_id", BRAND_ID).order("created_at", { ascending: false }).limit(250);
  if (error) return [];
  return (data || []).map((item: any) => ({ id: String(item.tweet_id), author: item.author_username || "X user", text: String(item.tweet_text || ""), createdAt: item.created_at, url: item.tweet_url, likes: Number(item.like_count || 0), reposts: Number(item.retweet_count || 0), replies: Number(item.reply_count || 0), sentiment: classify(String(item.tweet_text || "")) }));
}

function snapshotPosts(): XPost[] {
  const snapshot = (semanticClusters as any)?.platforms?.x;
  const unique = new Map<string, XPost>();
  for (const cluster of snapshot?.clusters || []) {
    for (const item of cluster.representative_evidence || []) {
      if (!item?.id || !item?.text) continue;
      unique.set(String(item.id), {
        id: String(item.id),
        author: String(item.author || "X user"),
        text: String(item.text),
        createdAt: item.published_at,
        url: item.url || `https://x.com/i/status/${item.id}`,
        likes: 0,
        reposts: 0,
        replies: 0,
        sentiment: ["positive", "neutral", "negative"].includes(item.sentiment)
          ? item.sentiment
          : classify(String(item.text)),
      });
    }
  }
  return Array.from(unique.values()).sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
}

async function persistedPosts() {
  const database = await storedPosts();
  return database.length
    ? { posts: database, source: "supabase" as const }
    : { posts: snapshotPosts(), source: "stored-snapshot" as const };
}

async function fetchRecentQuery(token: string, query: string): Promise<XPost[]> {
  const params = new URLSearchParams({ query, max_results: "100", "tweet.fields": "created_at,public_metrics,lang,author_id", expansions: "author_id", "user.fields": "username,name,verified" });
  const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new XApiError(response.status, body?.detail || body?.title || `X API returned HTTP ${response.status}`);
  }
  const json = await response.json();
  const users = new Map((json.includes?.users || []).map((user: any) => [String(user.id), user]));
  return (json.data || []).map((item: any) => { const user: any = users.get(String(item.author_id)); const metrics = item.public_metrics || {}; const author = user?.username || "X user"; return { id: String(item.id), author, text: String(item.text || ""), createdAt: item.created_at, url: `https://x.com/${author}/status/${item.id}`, likes: Number(metrics.like_count || 0), reposts: Number(metrics.retweet_count || 0), replies: Number(metrics.reply_count || 0), sentiment: classify(String(item.text || "")) }; });
}

async function recentPosts(token: string): Promise<LiveResult> {
  if (liveCache && liveCache.expiresAt > Date.now()) return liveCache.result;
  const [general, targeted] = await Promise.all([fetchRecentQuery(token, X_QUERY), fetchRecentQuery(token, X_CRITICAL_QUERY)]);
  const unique = new Map<string, XPost>();
  [...general, ...targeted].forEach((post) => unique.set(post.id, post));
  const result = { posts: Array.from(unique.values()), targeted, generalCount: general.length };
  liveCache = { expiresAt: Date.now() + CACHE_TTL_MS, result };
  return result;
}

export async function GET() {
  return cachedIntelligenceResponse("x", async () => {
  const token = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || "";
  if (token) {
    try {
      const result = await recentPosts(token);
      return NextResponse.json(buildPayload(result.posts, "x-api", false, undefined, result.targeted, result.generalCount));
    }
    catch (error) {
      const stored = await persistedPosts();
      const status = error instanceof XApiError ? error.status : 0;
      const emptyNarrative = status === 402
        ? "The X bearer token is connected, but the developer project needs API credits before recent posts can be retrieved."
        : status === 401 || status === 403
          ? "X rejected this bearer token. Regenerate the app bearer token and verify its read access."
          : "The X connection is configured, but recent posts could not be retrieved right now.";
      return NextResponse.json({
        ...buildPayload(stored.posts, stored.source, !stored.posts.length, emptyNarrative),
        error: `x_api_${status || "unavailable"}`,
        fallbackReason: "Live X retrieval unavailable; showing the last successful stored evidence.",
      });
    }
  }
  const stored = await persistedPosts();
  return NextResponse.json(buildPayload(stored.posts, stored.source, !stored.posts.length));
  });
}
