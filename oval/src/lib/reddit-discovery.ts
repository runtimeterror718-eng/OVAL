import "server-only";

import { config as loadEnvironment } from "dotenv";
import { resolve } from "path";

// Local workers and the deployed VPS keep non-public provider credentials in
// the shared secrets file. Load only the Reddit discovery keys server-side and
// never override environment variables supplied by the deployment runtime.
const sharedEnvironment: Record<string, string> = {};
loadEnvironment({ path: resolve(process.cwd(), "../secrets/.env.keys"), processEnv: sharedEnvironment, quiet: true });
for (const name of ["GOOGLE_API_KEY", "GOOGLE_CSE_ID", "EXA_API_KEY"]) {
  if (!process.env[name] && sharedEnvironment[name]) process.env[name] = sharedEnvironment[name];
}

export type DiscoveredRedditPost = {
  post_id: string;
  post_title: string;
  post_body: string;
  subreddit_name: string;
  score: number;
  num_comments: number;
  created_at: string | null;
  scraped_at: string;
  post_url: string;
  final_sentiment: "positive" | "neutral" | "negative";
  post_triage_label: "positive" | "neutral" | "negative";
  post_triage_is_pr_risk: boolean;
  source_label: string;
  raw_data: Record<string, unknown>;
};

export type RedditDiscoveryResult = {
  posts: DiscoveredRedditPost[];
  providers: {
    google: { configured: boolean; ok: boolean; count: number; error?: string };
    exa: { configured: boolean; ok: boolean; count: number; error?: string };
  };
  fetchedAt: string;
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_QUERIES = [
  '"Physics Wallah" students reviews complaints discussion',
  '"PhysicsWallah" OR "Alakh Pandey" JEE NEET batch app',
];

let cached: { expiresAt: number; value: RedditDiscoveryResult } | null = null;
let inFlight: Promise<RedditDiscoveryResult> | null = null;

const htmlEntities: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function clean(value: unknown) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|quot|#39|lt|gt);/g, (entity) => htmlEntities[entity] || entity)
    .replace(/\s+/g, " ")
    .trim();
}

function parseRedditUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "reddit.com" && !host.endsWith(".reddit.com") && host !== "redd.it") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    let postId = "";
    let subreddit = "reddit";
    if (host === "redd.it") {
      postId = parts[0] || "";
    } else {
      const commentsIndex = parts.indexOf("comments");
      if (commentsIndex < 0 || !parts[commentsIndex + 1]) return null;
      postId = parts[commentsIndex + 1];
      const subredditIndex = parts.indexOf("r");
      if (subredditIndex >= 0 && parts[subredditIndex + 1]) subreddit = parts[subredditIndex + 1];
    }
    if (!/^[a-z0-9]+$/i.test(postId)) return null;
    url.protocol = "https:";
    url.hostname = "www.reddit.com";
    url.search = "";
    url.hash = "";
    return { postId: postId.toLowerCase(), subreddit, url: url.toString() };
  } catch {
    return null;
  }
}

function isPhysicsWallahResult(title: string, excerpt: string, subreddit: string) {
  if (/^physicswalla?h$/i.test(subreddit.replace(/\s+/g, ""))) return true;
  const text = `${title} ${excerpt}`.toLowerCase();
  if (/physics\s*-?\s*wallah|physicswallah|alakh\s+(?:pandey|sir)/i.test(text)) return true;
  return /\bpw\b/i.test(text) && /jee|neet|batch|vidyapeeth|pathshala|khazana|lecture|dpp|teacher|faculty|coaching|student|exam|course|app/i.test(text);
}

function inferSentiment(value: string): "positive" | "neutral" | "negative" {
  const text = value.toLowerCase();
  const negative = ["fraud", "scam", "worst", "bad", "issue", "problem", "complaint", "refund", "not working", "delay", "postponed", "fake", "hate", "avoid", "waste", "excluded", "unreliable", "failed"];
  const positive = ["good", "best", "helped", "cleared", "recommend", "worth it", "success", "reliable", "love", "great", "benefit"];
  const negativeHits = negative.filter((term) => text.includes(term)).length;
  const positiveHits = positive.filter((term) => text.includes(term)).length;
  if (negativeHits > positiveHits) return "negative";
  if (positiveHits > negativeHits) return "positive";
  return "neutral";
}

function normalizePost(input: {
  provider: "google" | "exa";
  url: unknown;
  title: unknown;
  excerpt: unknown;
  publishedAt?: unknown;
  raw?: Record<string, unknown>;
}): DiscoveredRedditPost | null {
  const parsed = parseRedditUrl(input.url);
  if (!parsed) return null;
  const title = clean(input.title).replace(/\s*[-|]\s*Reddit\s*$/i, "");
  const excerpt = clean(input.excerpt);
  if (!title || !isPhysicsWallahResult(title, excerpt, parsed.subreddit)) return null;
  const sentiment = inferSentiment(`${title} ${excerpt}`);
  const date = input.publishedAt ? new Date(String(input.publishedAt)) : null;
  const createdAt = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  return {
    post_id: `${input.provider}-${parsed.postId}`,
    post_title: title,
    post_body: excerpt,
    subreddit_name: parsed.subreddit,
    score: 0,
    num_comments: 0,
    created_at: createdAt,
    scraped_at: new Date().toISOString(),
    post_url: parsed.url,
    final_sentiment: sentiment,
    post_triage_label: sentiment,
    post_triage_is_pr_risk: sentiment === "negative",
    source_label: input.provider === "google" ? "Google Search · public Reddit result" : "Exa · public Reddit result",
    raw_data: { provider: input.provider, ...(input.raw || {}) },
  };
}

function googlePublishedAt(item: any) {
  const meta = item?.pagemap?.metatags?.[0] || {};
  return meta["article:published_time"] || meta["date"] || meta["datepublished"] || meta["og:updated_time"] || null;
}

async function searchGoogle(): Promise<DiscoveredRedditPost[]> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) throw new Error("not_configured");
  const batches = await Promise.all(SEARCH_QUERIES.map(async (query) => {
    const params = new URLSearchParams({
      key,
      cx,
      q: query,
      siteSearch: "reddit.com",
      siteSearchFilter: "i",
      dateRestrict: "d90",
      num: "10",
      safe: "active",
    });
    const response = await fetch(`https://customsearch.googleapis.com/customsearch/v1?${params}`, {
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const payload = await response.json();
    return (payload.items || []).map((item: any) => normalizePost({
      provider: "google",
      url: item.link,
      title: item.title,
      excerpt: item.snippet,
      publishedAt: googlePublishedAt(item),
      raw: { displayLink: item.displayLink, cacheId: item.cacheId },
    })).filter(Boolean) as DiscoveredRedditPost[];
  }));
  return batches.flat();
}

async function searchExa(): Promise<DiscoveredRedditPost[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("not_configured");
  const startPublishedDate = new Date(Date.now() - 90 * 86400000).toISOString();
  const batches = await Promise.all(SEARCH_QUERIES.map(async (query) => {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        query: `Reddit discussions about ${query}`,
        type: "auto",
        numResults: 12,
        includeDomains: ["reddit.com"],
        startPublishedDate,
        contents: { highlights: { maxCharacters: 900 }, text: { maxCharacters: 1400 } },
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const payload = await response.json();
    return (payload.results || []).map((item: any) => normalizePost({
      provider: "exa",
      url: item.url,
      title: item.title,
      excerpt: Array.isArray(item.highlights) ? item.highlights.join(" ") : item.text,
      publishedAt: item.publishedDate,
      raw: { exaId: item.id, author: item.author, requestId: payload.requestId },
    })).filter(Boolean) as DiscoveredRedditPost[];
  }));
  return batches.flat();
}

async function discover(): Promise<RedditDiscoveryResult> {
  const googleConfigured = Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID);
  const exaConfigured = Boolean(process.env.EXA_API_KEY);
  const [googleResult, exaResult] = await Promise.allSettled([
    googleConfigured ? searchGoogle() : Promise.reject(new Error("not_configured")),
    exaConfigured ? searchExa() : Promise.reject(new Error("not_configured")),
  ]);
  const google = googleResult.status === "fulfilled" ? googleResult.value : [];
  const exa = exaResult.status === "fulfilled" ? exaResult.value : [];
  const deduped = new Map<string, DiscoveredRedditPost>();
  for (const post of [...google, ...exa]) {
    const parsed = parseRedditUrl(post.post_url);
    if (!parsed) continue;
    const existing = deduped.get(parsed.postId);
    if (!existing || (!existing.created_at && post.created_at) || post.post_body.length > existing.post_body.length) deduped.set(parsed.postId, post);
  }
  const posts = Array.from(deduped.values()).sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
  return {
    posts,
    providers: {
      google: { configured: googleConfigured, ok: googleResult.status === "fulfilled", count: google.length, ...(googleResult.status === "rejected" ? { error: googleResult.reason?.message || "unavailable" } : {}) },
      exa: { configured: exaConfigured, ok: exaResult.status === "fulfilled", count: exa.length, ...(exaResult.status === "rejected" ? { error: exaResult.reason?.message || "unavailable" } : {}) },
    },
    fetchedAt: new Date().toISOString(),
  };
}

export async function discoverRedditPosts(): Promise<RedditDiscoveryResult> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (inFlight) return inFlight;
  inFlight = discover()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}
