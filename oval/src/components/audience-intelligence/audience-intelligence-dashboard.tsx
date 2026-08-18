"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";
import { PlayStoreNegativeIntelligence } from "./playstore-negative-intelligence";
import { OvalLoadingSkeleton } from "@/components/ui/page-skeleton";
import { openPwYtVerse } from "@/lib/youtube-navigation";
import { AuthProfileMenu } from "@/components/auth/auth-profile-menu";
import { OvalLogo } from "@/components/brand/oval-logo";

type Channel = "playstore" | "reddit" | "linkedin" | "youtube" | "x" | "facebook" | "instagram";
type Period = "today" | "yesterday" | "7d" | "30d" | "month";
type SourceFilter = "all" | "owned" | "external";
type EvidenceSentiment = "all" | "positive" | "neutral" | "negative";
type Evidence = {
  id: string;
  author: string;
  text: string;
  title?: string;
  date?: string;
  sentiment?: string;
  meta?: string;
  url?: string;
  rating?: number;
  version?: string;
  sourceType?: "owned" | "external";
  parentId?: string;
  rootId?: string;
  depth?: number;
  thread?: Evidence[];
};
type Issue = {
  name: string;
  count: number;
  share: number;
  summary: string;
  sentiment?: string;
  evidence: Evidence[];
  semanticEvidenceComplete?: boolean;
  children?: { name: string; count?: number; share?: number; note?: string }[];
};
const COMMENTS_PER_PAGE = 10;
const EVIDENCE_PER_PAGE = 10;
type Version = { name: string; score: number; count: number };
type DeepAnalysis = {
  headline: string;
  summary: string;
  metrics: { label: string; value: number; note: string }[];
  themes: { name: string; count: number; share: number; summary: string }[];
  evidence: Evidence[];
};
type Model = {
  channel: Channel;
  name: string;
  eyebrow: string;
  headline: string;
  description: string;
  score: number;
  scoreMax: number;
  scoreLabel: string;
  scoreNote: string;
  total: number;
  totalLabel: string;
  issues: Issue[];
  evidence: Evidence[];
  versions: Version[];
  sentiment: { positive: number; neutral: number; negative: number };
  sourceNote: string;
  semanticProvider?: string;
  analysis?: DeepAnalysis;
};

const PRIMARY_CHANNELS: { id: Exclude<Channel, "facebook" | "instagram"> | "freshdesk"; label: string }[] = [
  { id: "playstore", label: "Play Store" },
  { id: "freshdesk", label: "Fresh Desk" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "reddit", label: "Reddit" },
  { id: "youtube", label: "YouTube" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "month", label: "Month Wise" },
];

const PLAYSTORE_RISK_MATCHERS = [
  { label: "Mis-selling", priority: "P0", keywords: ["mis sell", "missell", "mis-sell", "misleading", "wrong information", "false promise", "fraud", "scam", "cheat", "cheated", "looted"] },
  { label: "Overselling", priority: "P0", keywords: ["promise", "promised", "guarantee", "guaranteed", "assured rank", "selection", "advertise", "advertised", "over promise", "overpromise", "false hope"] },
  { label: "Payments & Refunds", priority: "P1", keywords: ["payment", "refund", "deducted", "gateway", "transaction", "money back", "not returned", "paid", "subscription", "double charge", "extra charge"] },
  { label: "App Reliability", priority: "P1", keywords: ["video", "playback", "buffer", "buffering", "crash", "crashed", "login", "log in", "download", "bug", "glitch", "otp", "not opening", "lag", "hang", "loading"] },
  { label: "Batch & Course", priority: "P1", keywords: ["batch", "course", "class", "lecture", "teacher", "faculty", "sir", "mam", "syllabus", "content", "test series", "dpp", "schedule", "module", "notes"] },
  { label: "General Support", priority: "P2", keywords: [] },
] as const;

const LINKEDIN_THEME_MATCHERS = [
  { label: "Workplace & culture", test: /toxic|culture|harass|humiliat|fear|micromanage|bad boss|work environment/i },
  { label: "Layoffs & terminations", test: /layoff|laid off|fired|terminat|resign|attrition/i },
  { label: "Unpaid / salary", test: /unpaid|salary|not paid|pending payment|dues/i },
  { label: "IPO / valuation / financials", test: /ipo|valuation|overvalued|stock|crore|loss|byju|investor/i },
  { label: "Scam / fraud allegations", test: /scam|fraud|fake|cheat|mislead|caution|beware/i },
  { label: "Refund / support", test: /refund|support|complaint|money back|not deliver/i },
  { label: "Hiring / recruitment", test: /hiring|recruit|interview|offer letter|nepotism|rejection/i },
] as const;

const number = (value: unknown) => Number(value || 0);
const clean = (value: unknown) => String(value || "").replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const short = (value: unknown, size = 145) => {
  const text = clean(value);
  if (!text) return "Open the detail view to inspect the underlying audience evidence.";
  return text.length > size ? `${text.slice(0, size - 1).trim()}…` : text;
};
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "PW";
const fmt = (value: number) => new Intl.NumberFormat("en-IN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const canonicalSourceUrl = (value: unknown) => String(value || "").trim().replace(/[?#].*$/, "").replace(/\/$/, "");

function asEvidence(item: any, index: number, channel: Channel): Evidence {
  return {
    id: String(item.id || item.reviewId || item.url || `${channel}-${index}`),
    author: clean(item.author || item.subreddit || item.channel || item.source || "Audience signal"),
    title: clean(item.title || item.theme || item.categoryLabel),
    text: clean(item.text || item.snippet || item.summary || item.evidence || item.title),
    date: item.publishedAt || item.createdAt || item.postedAt || item.date,
    sentiment: String(item.sentiment || (number(item.rating) <= 2 ? "negative" : number(item.rating) >= 4 ? "positive" : "neutral")),
    meta: item.meta || (channel === "playstore" ? `${item.rating || "—"}★ · v${item.version || "unknown"}` : channel === "reddit" ? `r/${item.subreddit || "reddit"} · ${fmt(number(item.upvotes))} votes` : channel === "linkedin" ? item.categoryLabel || "LinkedIn post" : channel === "x" ? `${fmt(number(item.likes))} likes · ${fmt(number(item.reposts))} reposts` : item.channel || `${channel === "facebook" ? "Facebook" : channel === "instagram" ? "Instagram" : "YouTube"} signal`),
    url: item.url,
    rating: item.rating === undefined ? undefined : number(item.rating),
    version: clean(item.version),
    sourceType: item.sourceType === "owned" ? "owned" : "external",
    parentId: item.parentId,
    rootId: item.rootId,
    depth: number(item.depth),
    thread: Array.isArray(item.thread) ? item.thread.map((child: any, childIndex: number) => asEvidence({ ...child, date: child.date || child.publishedAt, sourceType: item.sourceType || child.sourceType, meta: child.depth ? `Thread reply · depth ${child.depth}` : "Comment" }, childIndex, channel)) : undefined,
  };
}

function normalizeOwned(data: any, channel: "facebook" | "instagram"): Model {
  const label = channel === "facebook" ? "Facebook" : "Instagram";
  const posts = data?.posts || [];
  const signals = [...posts.map((post: any) => ({ ...post, thread: post.comments || [] })), ...posts.flatMap((post: any) => (post.comments || []).map((comment: any) => ({ ...comment, title: `Reply on ${short(post.text, 55)}`, url: comment.url || post.url })))];
  const evidence = signals.map((item: any, index: number) => asEvidence({ ...item, date: item.publishedAt || item.date, publishedAt: item.publishedAt || item.date, source: `${label} official channel`, meta: item.depth ? `Thread reply · depth ${item.depth}` : item.comments ? "Official post" : "Comment", sourceType: "owned" }, index, channel));
  const total = Math.max(1, evidence.length); const stats = data?.stats || {};
  const issues: Issue[] = (data?.clusters || []).slice(0, 5).map((cluster: any) => ({ name: clean(cluster.name), count: number(cluster.count), share: number(cluster.share), summary: clean(cluster.summary), sentiment: cluster.sentiment, evidence: (cluster.evidence || []).map((item: any, index: number) => asEvidence({ ...item, date: item.publishedAt || item.date, sourceType: "owned", meta: item.depth ? `Thread reply · depth ${item.depth}` : "Official channel evidence" }, index, channel)), children: [] }));
  if (!issues.length) issues.push({ name: "Official channel connection", count: 0, share: 0, summary: `Connect a managed ${label} account from Integrations to begin owned-channel intelligence.`, sentiment: "neutral", evidence: [], children: [] });
  return { channel, name: label, eyebrow: `OWNED CHANNEL · ${label.toUpperCase()}`, headline: channel === "facebook" ? "What your Page audience is saying." : "What your community is telling you.", description: evidence.length ? `${fmt(number(stats.totalPosts))} official posts and ${fmt(number(stats.totalComments))} comments or replies are available for semantic analysis.` : `No official ${label} evidence has been synced yet. Open Integrations to connect a managed account.`, score: evidence.length ? clamp(100 - number(stats.negative) / total * 100) : 0, scoreMax: 100, scoreLabel: "Owned-channel health", scoreNote: `${fmt(number(stats.negative))} negative · ${fmt(number(stats.positive))} positive`, total: evidence.length, totalLabel: "owned signals analysed", issues, evidence, versions: issues.map((item) => ({ name: item.name, score: clamp(100 - item.share), count: item.count })), sentiment: { positive: number(stats.positive), neutral: number(stats.neutral), negative: number(stats.negative) }, sourceNote: `Official ${label} OAuth evidence · ${data?.coverage?.earliest ? `coverage from ${new Date(data.coverage.earliest).toLocaleDateString("en-IN")}` : "awaiting initial sync"}` };
}

function mergeOwnedEvidence(channel: "linkedin" | "x", base: any, owned: any) {
  if (!owned?.posts?.length) return base;
  const ownedSignals = owned.posts.flatMap((post: any) => [
    { ...post, sourceType: "owned", categoryLabel: "Official channel post", createdAt: post.publishedAt, thread: post.comments || [] },
    ...(post.comments || []).map((comment: any) => ({ ...comment, sourceType: "owned", title: `Comment on ${short(post.text, 60)}`, url: comment.url || post.url, publishedAt: comment.date, createdAt: comment.date, categoryLabel: comment.depth ? `Official thread reply · depth ${comment.depth}` : "Official channel comment" })),
  ]);
  const posts = [...ownedSignals, ...(base?.posts || []).map((post: any) => ({ ...post, sourceType: post.sourceType || "external" }))];
  const totals = posts.reduce((result: any, post: any) => { const label = post.sentiment === "positive" || post.sentiment === "negative" ? post.sentiment : "neutral"; result[label] += 1; return result; }, { positive: 0, neutral: 0, negative: 0 });
  if (channel === "linkedin") return { ...base, posts, stats: { ...(base?.stats || {}), totalPosts: posts.length, ...totals, negRate: posts.length ? totals.negative / posts.length * 100 : 0 }, window: `${base?.window || "Public evidence"} + official OAuth channels` };
  return { ...base, posts, stats: { ...(base?.stats || {}), totalPosts: posts.length, ...totals }, clusters: [...(owned.clusters || []), ...(base?.clusters || [])], source: `${base?.source || "public"}+official-oauth` };
}

function normalizePlayStore(data: any): Model {
  const app = data?.apps?.[data?.primaryPackage] || {};
  const rawEvidence = (data?.liveReviews?.length ? data.liveReviews : app.recentReviews || []).map((item: any, i: number) => asEvidence(item, i, "playstore"));
  const sourceReviews = data?.liveReviews?.length ? data.liveReviews : app.recentReviews || [];
  const dated = sourceReviews.filter((review: any) => review.date || review.postedAt);
  const latestTime = Math.max(...dated.map((review: any) => new Date(review.date || review.postedAt).getTime()).filter(Number.isFinite));
  const cutoff = Number.isFinite(latestTime) ? latestTime - 13 * 24 * 60 * 60 * 1000 : 0;
  const negativeReviews = sourceReviews.filter((review: any) => {
    const time = new Date(review.date || review.postedAt || 0).getTime();
    return number(review.rating) <= 2 && clean(review.text) && (!cutoff || !Number.isFinite(time) || time >= cutoff);
  });
  const classified: { review: any; bucket: { label: string; priority: string; keywords: readonly string[] } }[] = negativeReviews.map((review: any) => {
    const text = clean(review.text).toLowerCase();
    let best: { label: string; priority: string; keywords: readonly string[] } = PLAYSTORE_RISK_MATCHERS.at(-1)!; let bestScore = 0;
    for (const matcher of PLAYSTORE_RISK_MATCHERS.slice(0, -1)) {
      const score = matcher.keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
      if (score > bestScore) { best = matcher; bestScore = score; }
    }
    return { review, bucket: best };
  });
  const denominator = Math.max(1, classified.length);
  const issues: Issue[] = PLAYSTORE_RISK_MATCHERS.map((matcher) => {
    const matches = classified.filter((item) => item.bucket.label === matcher.label).map((item) => item.review);
    const themes = new Map<string, number>();
    matches.forEach((review: any) => { const label = clean(review.theme || "Unspecified product area"); themes.set(label, (themes.get(label) || 0) + 1); });
    return {
      name: matcher.label,
      count: matches.length,
      share: matches.length / denominator * 100,
      summary: `${matcher.priority} cluster from the same best-match classification used on port 3000, based on ${fmt(matches.length)} low-rating written reviews in the latest 14-day evidence window.`,
      sentiment: matcher.priority === "P0" ? "critical" : "negative",
      evidence: matches.map((item: any, i: number) => asEvidence(item, i, "playstore")),
      children: Array.from(themes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count, share: matches.length ? count / matches.length * 100 : 0 })),
    };
  }).sort((a, b) => b.count - a.count).slice(0, 5);
  const versions = (app.recentVersions || []).slice(0, 7).reverse().map((v: any) => ({ name: String(v.version || "—"), score: number(v.averageRating), count: number(v.reviews) }));
  return {
    channel: "playstore", name: "Play Store", eyebrow: "PRODUCT EXPERIENCE · LIVE REVIEWS",
    headline: "What the rating isn’t telling you.",
    description: `${fmt(number(app.sampleSize))} verified reviews expose the product moments earning trust—and the friction that needs a product response.`,
    score: number(app.averageRating), scoreMax: 5, scoreLabel: "Current app rating",
    scoreNote: `${number(app.lowRatingRate).toFixed(1)}% low-rating reviews · ${number(app.replyRate).toFixed(0)}% replied`,
    total: number(app.sampleSize), totalLabel: "reviews analysed", issues, evidence: rawEvidence, versions,
    sentiment: { positive: number(app.ratingDistribution?.find((x: any) => x.rating >= 4)?.count) + number(app.ratingDistribution?.find((x: any) => x.rating === 5)?.count), neutral: number(app.ratingDistribution?.find((x: any) => x.rating === 3)?.count), negative: number(app.lowRatingCount) },
    sourceNote: `Live Google Play evidence · refreshed ${data?.livePulledAt ? new Date(data.livePulledAt).toLocaleString("en-IN") : "recently"}`,
  };
}

function normalizeReddit(data: any): Model {
  const stats = data?.stats || {};
  const evidence = (data?.posts || []).map((item: any, i: number) => asEvidence(item, i, "reddit"));
  const total = Math.max(1, number(stats.totalMentions));
  const issues = (data?.clusters || []).slice(0, 5).map((cluster: any) => {
    const keywords = (cluster.keywords || []).map((word: unknown) => clean(word).toLowerCase()).filter(Boolean);
    const matchingPosts = (data.posts || []).filter((post: any) => keywords.some((word: string) => clean(`${post.title} ${post.snippet}`).toLowerCase().includes(word)));
    const children = keywords.map((word: string) => ({ name: word, count: matchingPosts.filter((post: any) => clean(`${post.title} ${post.snippet}`).toLowerCase().includes(word)).length })).filter((item: any) => item.count).sort((a: any, b: any) => b.count - a.count).slice(0, 4);
    return {
      name: cluster.name,
      count: number(cluster.mentions),
      share: number(cluster.mentions) / total * 100,
      summary: `${cluster.name} is a ${cluster.sentiment || "mixed"} Reddit cluster spanning ${fmt(number(cluster.mentions))} community mentions across stored and discovered evidence.`,
      sentiment: cluster.sentiment,
      evidence: matchingPosts.length ? matchingPosts.map((item: any, i: number) => asEvidence(item, i, "reddit")) : (cluster.evidence || []).map((text: string, i: number) => asEvidence({ text, sentiment: cluster.sentiment, subreddit: stats.topSubreddit }, i, "reddit")),
      children: children.map((item: any) => ({ ...item, share: matchingPosts.length ? item.count / matchingPosts.length * 100 : 0 })),
    };
  });
  const health = clamp(100 - number(stats.negativeCount) / total * 100);
  return {
    channel: "reddit", name: "Reddit", eyebrow: "",
    headline: "What students say when brands aren’t listening.",
    description: "",
    score: health, scoreMax: 100, scoreLabel: "Community health", scoreNote: `${stats.sentiment || "Mixed"} · ${stats.topSubreddit || "Reddit"} leads volume`,
    total: number(stats.totalMentions), totalLabel: "posts analysed", issues, evidence, versions: (data?.monthlyTrend || []).map((v: any) => ({ name: v.label || v.month, score: v.count ? clamp(100 - number(v.negatives) / number(v.count) * 100) : 0, count: number(v.count) })),
    sentiment: { positive: number(stats.positiveCount), neutral: number(stats.neutralCount), negative: number(stats.negativeCount) },
    sourceNote: `Reddit evidence · ${fmt(number(stats.liveScrapedPosts))} stored · ${fmt(number(stats.googleDiscoveredPosts) + number(stats.googleFallbackPosts))} Google-indexed · ${fmt(number(stats.exaDiscoveredPosts))} Exa · ${stats.window || data?.meta?.window || "current window"}`,
  };
}

function normalizeLinkedIn(data: any): Model {
  const stats = data?.stats || {};
  const evidence = (data?.posts || []).map((item: any, i: number) => asEvidence(item, i, "linkedin"));
  const total = Math.max(1, number(stats.totalPosts));
  const issues = (data?.summary?.themes || []).slice(0, 5).map((theme: any) => {
    const matcher = LINKEDIN_THEME_MATCHERS.find((item) => item.label === theme.label);
    const matches = (data.posts || []).filter((post: any) => post.sentiment === "negative" && (matcher?.test.test(`${post.text} ${post.summary}`) || false));
    const categories = new Map<string, number>();
    matches.forEach((post: any) => { const label = clean(post.categoryLabel || "Reputational attacks"); categories.set(label, (categories.get(label) || 0) + 1); });
    return {
      name: theme.label,
      count: number(theme.count),
      share: number(theme.count) / total * 100,
      summary: `${theme.label} is a verified critical theme across ${fmt(number(theme.count))} Exa-ingested LinkedIn posts in the stored 90-day window.`,
      sentiment: "negative",
      evidence: matches.map((x: any, i: number) => asEvidence(x, i, "linkedin")),
      children: Array.from(categories.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, share: matches.length ? count / matches.length * 100 : 0 })),
    };
  });
  return {
    channel: "linkedin", name: "LinkedIn", eyebrow: "PROFESSIONAL NARRATIVE · PUBLIC POSTS",
    headline: "What your Network is saying?",
    description: data?.summary?.narrative || `${fmt(number(stats.totalPosts))} posts show the professional conversation around Physics Wallah.`,
    score: clamp(100 - number(stats.negRate)), scoreMax: 100, scoreLabel: "Narrative health", scoreNote: `${number(stats.negRate)}% critical · ${fmt(number(stats.positive))} positive`,
    total: number(stats.totalPosts), totalLabel: "posts analysed", issues, evidence, versions: (data?.summary?.themes || []).slice(0, 7).map((v: any) => ({ name: v.label, score: clamp(100 - number(v.count) / total * 100), count: number(v.count) })),
    sentiment: { positive: number(stats.positive), neutral: number(stats.neutral), negative: number(stats.negative) },
    sourceNote: "",
  };
}

function normalizeYouTube(data: any): Model {
  const stats = data?.stats || {};
  const s = stats.sentiment || {};
  const total = Math.max(1, number(s.total || stats.totalVideos));
  const issues: Issue[] = (data?.youtubeBriefBuckets || []).slice(0, 5).map((bucket: any, i: number) => ({
    name: bucket.title,
    count: Number(String(bucket.volume || "").match(/\d+/)?.[0] || Math.max(1, 5 - i)),
    share: Number(String(bucket.volume || "").match(/\d+/)?.[0] || Math.max(1, 5 - i)) / Math.max(1, (data.youtubeBriefBuckets || []).reduce((sum: number, x: any) => sum + Number(String(x.volume || "").match(/\d+/)?.[0] || 1), 0)) * 100,
    summary: clean(bucket.evidence || bucket.action), sentiment: bucket.sentiment || bucket.severity,
    evidence: [asEvidence({ text: bucket.evidence, title: bucket.title, sentiment: bucket.sentiment, source: "YouTube monitoring", summary: bucket.action }, i, "youtube")],
    children: [
      { name: `${clean(bucket.severity || "Watch")} priority`, count: Number(String(bucket.volume || "").match(/\d+/)?.[0] || 1), note: "Existing brief severity" },
      { name: "Recommended response", note: clean(bucket.action) },
    ],
  }));
  const evidence = [...(data?.topComments || []), ...(data?.prRiskVideos || []), ...(data?.youtubeBriefBuckets || [])].map((item: any, i: number) => asEvidence(item, i, "youtube"));
  return {
    channel: "youtube", name: "YouTube", eyebrow: "VIDEO NARRATIVE · CHANNEL MONITORING",
    headline: "What viewers are watching and repeating.",
    description: `${fmt(number(stats.totalChannels))} tracked channels and ${fmt(total)} classified signals reveal the video narratives shaping audience perception.`,
    score: clamp((number(s.positive) + number(s.neutral) * .5) / total * 100), scoreMax: 100, scoreLabel: "Audience signal", scoreNote: `${s.overall || "Monitoring"} · ${fmt(number(stats.totalSubscribers))} channel subscribers`,
    total: number(s.total || stats.totalVideos), totalLabel: "signals analysed", issues, evidence, versions: issues.map((v) => ({ name: v.name, score: clamp(100 - v.share), count: v.count })),
    sentiment: { positive: number(s.positive), neutral: number(s.neutral), negative: number(s.negative) },
    sourceNote: "YouTube monitoring brief · live OVAL API",
  };
}

function normalizeX(data: any): Model {
  const stats = data?.stats || {};
  const total = Math.max(1, number(stats.totalPosts));
  const evidence = (data?.posts || []).map((item: any, index: number) => asEvidence({ ...item, publishedAt: item.createdAt }, index, "x"));
  const issues: Issue[] = (data?.clusters || []).slice(0, 5).map((cluster: any) => ({
    name: clean(cluster.name),
    count: number(cluster.count),
    share: number(cluster.share),
    summary: clean(cluster.summary),
    sentiment: cluster.sentiment,
    evidence: (cluster.evidence || []).map((item: any, index: number) => asEvidence({ ...item, publishedAt: item.createdAt }, index, "x")),
    children: [],
  }));
  if (!issues.length) issues.push({ name: "X developer connection", count: 0, share: 0, summary: "Add X_BEARER_TOKEN privately to retrieve recent public posts from the official X API.", sentiment: "neutral", evidence: [] });
  const analysis: DeepAnalysis | undefined = data?.analysis ? {
    headline: clean(data.analysis.headline),
    summary: clean(data.analysis.summary),
    metrics: [
      { label: "General retrieval", value: number(data.retrieval?.generalRetrieved), note: "broad brand posts" },
      { label: "Critical retrieval", value: number(data.analysis.targetedRetrieved), note: "targeted candidates" },
      { label: "Verified negative", value: number(data.analysis.verifiedNegative), note: "after classification" },
      { label: "Critical engagement", value: number(data.analysis.criticalEngagement), note: "likes, replies and reposts" },
    ],
    themes: (data.analysis.themes || []).slice(0, 5).map((theme: any) => ({ name: clean(theme.name), count: number(theme.count), share: number(theme.share), summary: clean(theme.summary) })),
    evidence: (data.analysis.topCriticalPosts || []).map((item: any, index: number) => asEvidence({ ...item, publishedAt: item.createdAt }, index, "x")),
  } : undefined;
  return {
    channel: "x", name: "X", eyebrow: "REAL-TIME NARRATIVE · X POSTS",
    headline: "What Hashtags are saying ?",
    description: data?.summary?.narrative || "Recent public X posts mentioning Physics Wallah will appear here after the developer bearer token is configured.",
    score: data?.setupRequired ? 0 : clamp(100 - number(stats.negative) / total * 100), scoreMax: 100, scoreLabel: data?.setupRequired ? "Connection status" : "Narrative health",
    scoreNote: data?.setupRequired ? "Bearer token required · no mock data shown" : `${fmt(number(stats.negative))} critical · ${fmt(number(stats.positive))} positive`,
    total: number(stats.totalPosts), totalLabel: "posts analysed", issues, evidence, versions: issues.map((issue) => ({ name: issue.name, score: clamp(100 - issue.share), count: issue.count })),
    sentiment: { positive: number(stats.positive), neutral: number(stats.neutral), negative: number(stats.negative) },
    sourceNote: data?.setupRequired ? "Official X API connection pending" : `${data?.source === "x-api" ? "Official X recent search" : "Stored X evidence"} · ${data?.window || "recent window"}`,
    analysis,
  };
}

function normalize(channel: Channel, data: any) {
  if (channel === "playstore") return normalizePlayStore(data);
  if (channel === "reddit") return normalizeReddit(data);
  if (channel === "linkedin") return normalizeLinkedIn(data);
  if (channel === "x") return normalizeX(data);
  if (channel === "facebook" || channel === "instagram") return normalizeOwned(data, channel);
  return normalizeYouTube(data);
}

function applySemanticClusters(base: Model, semantic: any): Model {
  if (!semantic?.live || !Array.isArray(semantic.clusters) || !semantic.clusters.length) return base;
  const issues: Issue[] = semantic.clusters.slice(0, 5).map((cluster: any, clusterIndex: number) => {
    const sourceIds = new Set((cluster.source_ids || []).map(String));
    const representativeUrls = new Set((cluster.representative_evidence || []).map((item: any) => canonicalSourceUrl(item.url)).filter(Boolean));
    const evidenceById = sourceIds.size ? base.evidence.filter((item) => sourceIds.has(String(item.id))) : [];
    // Older imports can contain the same LinkedIn post under more than one row
    // ID. Match the representative source URL as a compatibility fallback so
    // those records remain connected to their semantic issue.
    const fullEvidence = evidenceById.length >= sourceIds.size
      ? evidenceById
      : base.evidence.filter((item) => sourceIds.has(String(item.id)) || (item.url && representativeUrls.has(canonicalSourceUrl(item.url))));
    const representativeEvidence = (cluster.representative_evidence || []).map((item: any, index: number) => asEvidence({
      ...item,
      text: item.text,
      author: item.author,
      date: item.published_at,
      url: item.url,
      sentiment: item.sentiment,
      source: `${base.name} semantic evidence`,
    }, index, base.channel));
    return {
      name: clean(cluster.label || `Semantic cluster ${clusterIndex + 1}`),
      count: number(cluster.count),
      share: number(cluster.share),
      summary: clean(cluster.summary || cluster.why_it_matters),
      sentiment: number(cluster.sentiment?.negative) > number(cluster.sentiment?.positive) ? "negative" : "mixed",
      evidence: fullEvidence.length ? fullEvidence : representativeEvidence,
      semanticEvidenceComplete: sourceIds.size > 0 && evidenceById.length >= sourceIds.size,
      children: (cluster.subthemes || []).slice(0, 4).map((name: string) => ({ name: clean(name), note: "Recurring semantic phrase" })),
    };
  });
  const provider = semantic.provider === "qdrant" ? "Qdrant semantic index" : "local semantic index";
  return {
    ...base,
    issues,
    semanticProvider: provider,
    sourceNote: `${base.sourceNote} · ${provider} · ${semantic.cluster_scope || "issue evidence"}`,
  };
}

function inPeriod(date: string | undefined, period: Period) {
  if (period === "month") return true;
  if (!date) return false;
  const value = new Date(date); if (Number.isNaN(value.getTime())) return false;
  const now = new Date(); const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startToday);
  if (period === "yesterday") { start.setDate(start.getDate() - 1); const end = new Date(start); end.setDate(end.getDate() + 1); return value >= start && value < end; }
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  return value >= start;
}

function filterModel(base: Model, period: Period, query: string, sourceFilter: SourceFilter): Model {
  const term = query.trim().toLowerCase();
  const periodLabel = PERIODS.find((item) => item.id === period)?.label || period;
  const matches = (item: Evidence) => inPeriod(item.date, period) && (sourceFilter === "all" || item.sourceType === sourceFilter) && (!term || `${item.title || ""} ${item.text} ${item.author} ${item.meta || ""}`.toLowerCase().includes(term));
  const evidence = base.evidence.filter(matches);
  const sentiment = evidence.reduce((result, item) => {
    const label = item.sentiment === "positive" || item.sentiment === "negative" ? item.sentiment : "neutral";
    result[label] += 1;
    return result;
  }, { positive: 0, neutral: 0, negative: 0 });

  const issueDrafts = base.issues.map((issue) => {
    const matchingEvidence = issue.evidence.filter(matches);
    const ratio = issue.evidence.length ? matchingEvidence.length / issue.evidence.length : 0;
    // When every semantic source row is linked, use the actual number of
    // matching records. Fall back to proportional estimation only for legacy
    // clusters that expose representative samples rather than their full set.
    const count = issue.semanticEvidenceComplete ? matchingEvidence.length : Math.round(issue.count * ratio);
    const children = issue.children?.map((child) => {
      if (child.count === undefined) return child;
      const childCount = Math.round(child.count * ratio);
      return { ...child, count: childCount, share: count ? childCount / count * 100 : 0 };
    });
    return { ...issue, count, evidence: matchingEvidence, children };
  });
  const issueTotal = issueDrafts.reduce((sum, issue) => sum + issue.count, 0);
  // Keep the canonical issue taxonomy and ranking stable across date filters.
  // Only the selected-window count, share and evidence change. A newly
  // generated semantic topic will appear when the base Top 5 is refreshed.
  const issues = issueDrafts.map((issue) => {
    const share = issueTotal ? issue.count / issueTotal * 100 : 0;
    const window = `${periodLabel.toLowerCase()}${term ? ` for “${query.trim()}”` : ""}`;
    const summary = issue.count
      ? `${issue.name} represents ${share.toFixed(1)}% of classified issue signals in ${window}, with ${fmt(issue.count)} matched signals. ${short(issue.summary, 112)}`
      : `${issue.name} represents 0% of classified issue signals in ${window}. The topic remains in the stable Top 5 taxonomy for comparison.`;
    return { ...issue, share, summary };
  });

  const scored = evidence.filter((item) => item.rating !== undefined);
  const score = base.channel === "playstore"
    ? (scored.length ? scored.reduce((sum, item) => sum + Number(item.rating), 0) / scored.length : 0)
    : (evidence.length ? clamp(100 - sentiment.negative / evidence.length * 100) : 0);
  const versions = base.channel === "playstore"
    ? Array.from(evidence.reduce((groups, item) => {
      const name = item.version || "unknown";
      const current = groups.get(name) || { name, ratings: [] as number[] };
      if (item.rating !== undefined) current.ratings.push(item.rating);
      groups.set(name, current);
      return groups;
    }, new Map<string, { name: string; ratings: number[] }>()).values()).map((item) => ({ name: item.name, score: item.ratings.length ? item.ratings.reduce((sum, rating) => sum + rating, 0) / item.ratings.length : 0, count: item.ratings.length })).slice(-7)
    : issues.slice(0, 7).map((issue) => ({ name: issue.name, score: clamp(100 - issue.share), count: issue.count }));
  const dominant = issues.find((issue) => issue.count > 0);
  const description = evidence.length
    ? `${fmt(evidence.length)} dated signals match ${periodLabel.toLowerCase()}${term ? ` and “${query.trim()}”` : ""}. ${dominant ? `${dominant.name} is the largest recurring issue in this view.` : "No recurring issue dominates this view."}`
    : `No dated ${base.name} evidence matches ${periodLabel.toLowerCase()}${term ? ` and “${query.trim()}”` : ""}. Choose a broader window or clear the search.`;
  const analysis = base.analysis ? {
    ...base.analysis,
    evidence: base.analysis.evidence.filter(matches),
    metrics: base.analysis.metrics.map((metric) => ({ ...metric, value: Math.round(metric.value * (base.evidence.length ? evidence.length / base.evidence.length : 0)) })),
    themes: base.analysis.themes.map((theme) => ({ ...theme, count: Math.round(theme.count * (base.evidence.length ? evidence.length / base.evidence.length : 0)) })),
  } : undefined;
  return {
    ...base,
    description: base.channel === "reddit" ? "" : description,
    score,
    scoreNote: evidence.length ? `${fmt(sentiment.negative)} critical · ${fmt(sentiment.positive)} positive in this window` : "No dated signals in this window",
    total: evidence.length,
    issues,
    evidence,
    versions,
    sentiment,
    analysis,
    sourceNote: `${base.sourceNote} · filtered to ${periodLabel}`,
  };
}

function MiniBars({ seed = 0 }: { seed?: number }) {
  return <div className="ai-mini-bars" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} style={{ height: `${18 + ((i * 17 + seed * 11) % 73)}%` }} />)}</div>;
}

export function AudienceIntelligenceDashboard({ initialChannel }: { initialChannel: Channel }) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [period, setPeriod] = useState<Period>("month");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [raw, setRaw] = useState<any>(null);
  const [semantic, setSemantic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const query = "";
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [clusterIndex, setClusterIndex] = useState(0);
  const [commentPage, setCommentPage] = useState(0);
  const [evidencePage, setEvidencePage] = useState(0);
  const [evidenceSentiment, setEvidenceSentiment] = useState<EvidenceSentiment>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setRaw(null); setSemantic(null); setClusterIndex(0);
    Promise.all([
      fetch(channel === "facebook" || channel === "instagram" ? `/api/owned-social/${channel}` : `/api/${channel}`, { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error(`${response.status}`); return response.json(); }),
      fetch(`/api/vector-summary?platform=${channel}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null),
      channel === "linkedin" || channel === "x" ? fetch(`/api/owned-social/${channel}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null) : Promise.resolve(null),
    ])
      .then(([data, semanticData, ownedData]) => { if (!cancelled) { setRaw((channel === "linkedin" || channel === "x") ? mergeOwnedEvidence(channel, data, ownedData) : data); setSemantic(semanticData); } })
      .catch(() => { if (!cancelled) setError(`The ${channel} feed could not be loaded.`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channel]);

  const baseModel = useMemo(() => raw ? applySemanticClusters(normalize(channel, raw), semantic) : null, [channel, raw, semantic]);
  const model = useMemo(() => baseModel ? filterModel(baseModel, period, query, sourceFilter) : null, [baseModel, period, query, sourceFilter]);
  const evidence = useMemo(() => [...(model?.evidence || [])].sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    const safeA = Number.isFinite(aTime) ? aTime : 0;
    const safeB = Number.isFinite(bTime) ? bTime : 0;
    return safeB - safeA || a.id.localeCompare(b.id);
  }), [model?.evidence]);
  const currentCluster = model?.issues[Math.min(clusterIndex, Math.max(0, (model?.issues.length || 1) - 1))];
  const evidenceSentimentCounts = useMemo(() => evidence.reduce((counts, item) => {
    const sentiment = item.sentiment === "positive" || item.sentiment === "negative" ? item.sentiment : "neutral";
    counts[sentiment] += 1;
    return counts;
  }, { positive: 0, neutral: 0, negative: 0 }), [evidence]);
  const filteredEvidence = useMemo(() => evidenceSentiment === "all"
    ? evidence
    : evidence.filter((item) => (item.sentiment === "positive" || item.sentiment === "negative" ? item.sentiment : "neutral") === evidenceSentiment), [evidence, evidenceSentiment]);
  const evidencePageCount = Math.max(1, Math.ceil(filteredEvidence.length / EVIDENCE_PER_PAGE));
  const visibleEvidence = filteredEvidence.slice(evidencePage * EVIDENCE_PER_PAGE, (evidencePage + 1) * EVIDENCE_PER_PAGE);
  const evidencePageNumbers = useMemo(() => Array.from(new Set([
    0,
    1,
    evidencePage - 1,
    evidencePage,
    evidencePage + 1,
    evidencePageCount - 2,
    evidencePageCount - 1,
  ].filter((page) => page >= 0 && page < evidencePageCount))).sort((a, b) => a - b), [evidencePage, evidencePageCount]);
  const issueEvidence = selectedIssue?.evidence || [];
  const commentPages = Math.max(1, Math.ceil(issueEvidence.length / COMMENTS_PER_PAGE));
  const visibleIssueEvidence = issueEvidence.slice(commentPage * COMMENTS_PER_PAGE, (commentPage + 1) * COMMENTS_PER_PAGE);

  useEffect(() => { setCommentPage(0); }, [selectedIssue?.name, period, query]);
  useEffect(() => { setEvidencePage(0); }, [channel, period, query, sourceFilter, evidenceSentiment]);

  const openIssue = (issue: Issue) => { setSelectedIssue(issue); setCommentPage(0); };

  const changeChannel = (next: Channel) => {
    if (next === "youtube") { openPwYtVerse(); return; }
    setChannel(next); setPeriod("month"); setSourceFilter("all");
    router.replace(`/audience-intelligence/${next}`);
  };

  return (
    <main className={`audience-studio source-${channel}`}>
      <div className="ai-ambient ai-ambient-one" /><div className="ai-ambient ai-ambient-two" />
      <header className="ai-topbar">
        <button className="ai-brand-group" onClick={() => changeChannel("playstore")} aria-label="Open OVAL Play Store intelligence"><OvalLogo className="ai-brand-mark ai-brand-logo" priority /><span><strong>OVAL</strong><small>BRAND INTELLIGENCE</small></span></button>
        <nav className="ai-source-nav" aria-label="Intelligence channels">
          <button onClick={() => router.replace("/audience-intelligence/overview")}>Overview</button>
          {PRIMARY_CHANNELS.map((item) => <button key={item.id} className={channel === item.id ? "active" : ""} onClick={() => item.id === "freshdesk" ? router.replace("/audience-intelligence/freshdesk") : changeChannel(item.id)}>{item.label}</button>)}
          <button onClick={() => router.replace("/shield")}>Shield</button>
        </nav>
        <div className="ai-top-actions">
          <AuthProfileMenu />
        </div>
      </header>

      {loading ? <OvalLoadingSkeleton embedded /> : error || !model ? <section className="ai-loading"><p>{error || "No data available."}</p><button onClick={() => location.reload()}>Retry</button></section> : <>
        <section className="ai-hero">
          <div>{model.eyebrow ? <p className="ai-eyebrow">{model.eyebrow}</p> : null}<h1>{channel === "playstore" ? <>What the rating<br /><em>isn’t telling you.</em></> : channel === "x" ? <>What Hashtags <em>are saying ?</em></> : <>{model.headline.split(" ").slice(0, -1).join(" ")} <em>{model.headline.split(" ").at(-1)}</em></>}</h1>{model.description ? <p className="ai-hero-copy">{model.description}</p> : null}</div>
          <button className="ai-hero-score" onClick={() => setRatingOpen(true)}>
            <span className="ai-score-meta"><span>{model.scoreLabel}</span><b>LIVE</b></span><strong>{model.score.toFixed(model.scoreMax === 5 ? 2 : 0)}</strong><small>/{model.scoreMax}</small><span className="ai-gauge"><i style={{ width: `${clamp(model.score / model.scoreMax * 100)}%` }} /></span><p>{model.scoreNote}</p><ArrowUpRight size={18} />
          </button>
        </section>
        <section className="ai-filter-row"><span>Evidence window</span><div className="ai-filters">{PERIODS.map((item) => <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => { setPeriod(item.id); setClusterIndex(0); setSelectedIssue(null); setSelectedEvidence(null); setRatingOpen(false); }}>{item.label}</button>)}</div>{channel !== "reddit" ? <p><strong>{fmt(evidence.length)}</strong> matching signals</p> : null}</section>
        {(["linkedin", "x", "instagram"] as Channel[]).includes(channel) && <section className="ai-source-filter"><span>Evidence source</span><div>{(["all", "owned", "external"] as SourceFilter[]).map((source) => <button key={source} className={sourceFilter === source ? "active" : ""} onClick={() => { setSourceFilter(source); setSelectedIssue(null); setSelectedEvidence(null); }}>{source === "all" ? "All evidence" : source === "owned" ? "Official channels" : "External mentions"}</button>)}</div></section>}

        <section className="ai-section-block">
          <div className="ai-section-heading"><div><p className="ai-eyebrow">PRIORITY SIGNALS</p><h2>Top 5 issues</h2></div><p>{model.semanticProvider ? `${model.semanticProvider} · semantic meaning, count and evidence` : "Percentage share, count and source evidence"}</p></div>
          <div className="ai-issue-grid">{model.issues.map((issue, index) => <button key={issue.name} className={`ai-issue-card ${index === 0 ? "featured" : ""}`} onClick={() => openIssue(issue)}><span className="ai-card-top"><span className="ai-rank-dot">0{index + 1}</span><span className="ai-open-circle"><ArrowUpRight size={14} /></span></span><span><h3>{issue.name}</h3><p>{short(issue.summary, 118)}</p></span><span><span className="ai-issue-metric"><strong>{issue.share.toFixed(issue.share < 10 ? 1 : 0)}%</strong><span>{fmt(issue.count)} signals</span></span><span className="ai-share-track"><i style={{ width: `${clamp(issue.share)}%` }} /></span><small>Open source evidence</small></span></button>)}</div>
        </section>

        <section className="ai-split-section">
          <button className="ai-rating-card" onClick={() => setRatingOpen(true)}><span className="ai-card-label"><span>{channel === "playstore" ? "RATING BY APP VERSION" : "SIGNAL QUALITY BY SEGMENT"}</span><span className="ai-open-circle"><ArrowUpRight size={14} /></span></span><span className="ai-rating-main"><strong>{model.score.toFixed(model.scoreMax === 5 ? 2 : 0)}</strong><span><b>Current</b><small>{model.scoreLabel}</small></span></span><span className="ai-version-chart">{(model.versions.length ? model.versions : model.issues.map((x) => ({ name: x.name, score: 100 - x.share, count: x.count }))).slice(-7).map((item, i, list) => <span key={`${item.name}-${i}`}><i className={i === list.length - 1 ? "current" : ""} style={{ height: `${Math.max(18, clamp(item.score / model.scoreMax * (model.scoreMax === 5 ? 100 : 1)) * 1.45)}px` }} /><b>{item.score.toFixed(model.scoreMax === 5 ? 1 : 0)}</b><small>{short(item.name, 10)}</small></span>)}</span></button>
          <div className="ai-cluster-card"><span className="ai-card-label"><span>ISSUE CLUSTERING</span><b>{model.issues.length} major categories</b></span><div className="ai-cluster-layout"><div className="ai-cluster-list">{model.issues.slice(0, 5).map((issue, i) => <button key={issue.name} className={clusterIndex === i ? "active" : ""} onClick={() => setClusterIndex(i)}><span><i>0{i + 1}</i>{issue.name}</span><b>{issue.share.toFixed(0)}% <small>{fmt(issue.count)}</small></b></button>)}</div>{currentCluster && <div className="ai-cluster-detail"><span>SIGNAL SUMMARY</span><h3>{currentCluster.name}</h3><span className="ai-detail-number"><strong>{currentCluster.count}</strong><span>captured<br />mentions</span></span>{currentCluster.children?.length ? <div className="ai-cluster-children">{currentCluster.children.slice(0, 4).map((child) => <div key={child.name}><span><i />{child.name}</span>{child.count !== undefined ? <b>{fmt(child.count)}{child.share !== undefined ? <small>{child.share.toFixed(0)}%</small> : null}</b> : null}{child.note ? <small>{short(child.note, 68)}</small> : null}</div>)}</div> : <MiniBars seed={clusterIndex} />}<button onClick={() => openIssue(currentCluster)}>View comments <ChevronRight size={12} /></button></div>}</div></div>
        </section>

        {channel === "x" && model.analysis && <section className="ai-deep-analysis">
          <div className="ai-section-heading"><div><p className="ai-eyebrow">CRITICAL NARRATIVE ANALYSIS</p><h2>What needs deeper review</h2></div><p>Targeted retrieval · deduplicated evidence · non-exclusive themes</p></div>
          <div className="ai-analysis-intro"><div><h3>{model.analysis.headline}</h3><p>{model.analysis.summary}</p></div><span>Recent seven-day evidence</span></div>
          <div className="ai-analysis-metrics">{model.analysis.metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{fmt(metric.value)}</strong><small>{metric.note}</small></article>)}</div>
          <div className="ai-analysis-body"><div className="ai-analysis-themes"><p className="ai-eyebrow">CRITICAL THEMES</p>{model.analysis.themes.length ? model.analysis.themes.map((theme) => <article key={theme.name}><div><strong>{theme.name}</strong><b>{fmt(theme.count)} <small>{theme.share.toFixed(0)}%</small></b></div><p>{theme.summary}</p><span><i style={{ width: `${clamp(theme.share)}%` }} /></span></article>) : <p>No recurring critical theme was established.</p>}</div><div className="ai-analysis-evidence"><p className="ai-eyebrow">MOST ENGAGED CRITICAL EVIDENCE</p>{model.analysis.evidence.slice(0, 5).map((item) => <button key={item.id} onClick={() => setSelectedEvidence(item)}><span><strong>{item.author}</strong><small>{item.meta}</small></span><p>{short(item.text, 130)}</p><ArrowUpRight size={14} /></button>)}</div></div>
        </section>}

        <section className="ai-evidence-section"><div className="ai-section-heading"><div><p className="ai-eyebrow">SOURCE EVIDENCE</p><h2>Latest audience signals</h2></div>{filteredEvidence.length ? <p>Showing {evidencePage * EVIDENCE_PER_PAGE + 1}–{Math.min((evidencePage + 1) * EVIDENCE_PER_PAGE, filteredEvidence.length)} of {fmt(filteredEvidence.length)} · newest first</p> : null}</div><div className="ai-evidence-sentiment-filters" role="group" aria-label="Filter audience signals by sentiment">{(["all", "positive", "neutral", "negative"] as EvidenceSentiment[]).map((sentiment) => <button key={sentiment} className={evidenceSentiment === sentiment ? "active" : ""} onClick={() => setEvidenceSentiment(sentiment)}><span>{sentiment === "all" ? "All signals" : sentiment}</span><b>{sentiment === "all" ? evidence.length : evidenceSentimentCounts[sentiment]}</b></button>)}</div><div className="ai-evidence-list">{visibleEvidence.map((item) => <button key={item.id} onClick={() => setSelectedEvidence(item)}><span className="ai-post-avatar">{initials(item.author)}</span><span><span className="ai-post-byline"><strong>{item.author}</strong></span><span className="ai-post-title-row"><p>{short(item.title || item.text, 160)}</p><i className={`signal-${item.sentiment}`}>{item.sentiment || "signal"}</i></span><small>{item.date ? new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Current brief"} · {item.meta}</small></span><span className="ai-open-circle"><ArrowUpRight size={14} /></span></button>)}{!filteredEvidence.length && <div className="ai-empty"><Sparkles size={18} /><p>No {evidenceSentiment === "all" ? "dated" : evidenceSentiment} evidence falls inside this window. Choose another sentiment or broaden the date filter.</p></div>}</div>{evidencePageCount > 1 && <nav className="ai-evidence-pagination" aria-label="Audience signal pages"><button className="page-arrow" aria-label="Previous page" disabled={evidencePage === 0} onClick={() => setEvidencePage((page) => Math.max(0, page - 1))}><ChevronLeft size={15} /></button>{evidencePageNumbers.map((page, index) => <span key={page} className="ai-evidence-page-slot">{index > 0 && page - evidencePageNumbers[index - 1] > 1 ? <i>…</i> : null}<button className={`page-number ${evidencePage === page ? "active" : ""}`} onClick={() => setEvidencePage(page)}>{page + 1}</button></span>)}<button className="page-arrow" aria-label="Next page" disabled={evidencePage >= evidencePageCount - 1} onClick={() => setEvidencePage((page) => Math.min(evidencePageCount - 1, page + 1))}><ChevronRight size={15} /></button></nav>}</section>

        {channel === "playstore" && <PlayStoreNegativeIntelligence data={raw} issues={model.issues} />}
        <section className="fd-emerging fd-emerging-bottom"><header><span><Sparkles size={17} /> Emerging trends <b>BETA</b></span><small>Directional prediction</small></header><h2>What may grow next</h2><p>Directional signals derived from the selected evidence window and the stable issue taxonomy.</p><div>{model.issues.slice(0, 3).map((issue, index) => <article key={issue.name}><span>0{index + 1}</span><div><strong>{issue.count ? `${issue.name} is likely to remain visible` : `${issue.name} remains on the watchlist`}</strong><p>{issue.count ? `${fmt(issue.count)} matched signals account for ${issue.share.toFixed(1)}% of classified issues in this view.` : "No dated signal appears in this window, but the established topic remains monitored for recurrence."}</p></div><i>{issue.count ? (index === 0 ? "High signal" : "Monitor") : "Watch"}</i></article>)}</div></section>
      </>}

      {(selectedIssue || selectedEvidence || ratingOpen) && <div className="ai-drawer-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) { setSelectedIssue(null); setSelectedEvidence(null); setRatingOpen(false); } }}><aside className="ai-detail-drawer"><div className="ai-drawer-head"><div><p className="ai-eyebrow">{selectedEvidence ? "SOURCE EVIDENCE" : ratingOpen ? "PERFORMANCE DETAIL" : "ISSUE CLUSTER"}</p><h2>{selectedEvidence?.title || selectedEvidence?.author || (ratingOpen ? model?.scoreLabel : selectedIssue?.name)}</h2></div><button onClick={() => { setSelectedIssue(null); setSelectedEvidence(null); setRatingOpen(false); }}><X size={20} /></button></div>
        {ratingOpen && model && <><div className="ai-drawer-summary"><div><strong>{model.score.toFixed(model.scoreMax === 5 ? 2 : 0)}</strong><span>{model.scoreLabel}</span></div><div><strong>{fmt(model.total)}</strong><span>{model.totalLabel}</span></div></div><p className="ai-summary-copy">{model.description}</p><div className="ai-comment-list">{model.versions.map((item) => <article key={item.name}><div><strong>{item.name}</strong><span>{item.score.toFixed(1)}</span></div><p>{fmt(item.count)} underlying signals in this segment.</p></article>)}</div></>}
        {selectedIssue && <><div className="ai-drawer-summary"><div><strong>{selectedIssue.share.toFixed(1)}%</strong><span>share of selected issues</span></div><div><strong>{fmt(selectedIssue.count)}</strong><span>captured signals</span></div></div><section className="ai-drawer-description"><span>Issue summary</span><p>{selectedIssue.summary}</p></section><div className="ai-comment-list"><div className="ai-comment-list-heading"><div><h3>Source comments</h3><p>Showing {issueEvidence.length ? commentPage * COMMENTS_PER_PAGE + 1 : 0}–{Math.min((commentPage + 1) * COMMENTS_PER_PAGE, issueEvidence.length)} of {fmt(issueEvidence.length)}</p></div><span>{COMMENTS_PER_PAGE} per page</span></div>{issueEvidence.length ? visibleIssueEvidence.map((item) => <article className={`ai-comment-compact ${item.depth ? "thread-reply" : ""}`} style={{ marginLeft: `${Math.min(2, item.depth || 0) * 18}px` }} key={item.id}><header><div><strong>{item.author}</strong>{item.title ? <small>{short(item.title, 90)}</small> : null}</div><span className={`signal-${item.sentiment}`}>{item.sentiment || "signal"}</span></header><p className="ai-comment-preview">{short(item.text, 190)}</p><footer><div><small>{item.depth ? `Reply · depth ${item.depth}` : item.meta}</small>{item.date ? <time>{new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</time> : null}</div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open original post <ArrowUpRight size={12} /></a> : <small>Source link unavailable</small>}</footer></article>) : <article className="ai-comment-empty"><p>No source comment falls inside this selected date window. Choose a broader filter to inspect historical evidence for this stable topic.</p></article>}</div>{issueEvidence.length > COMMENTS_PER_PAGE && <nav className="ai-comment-pagination" aria-label="Source comment pages"><button className="page-arrow" aria-label="Previous page" disabled={commentPage === 0} onClick={() => setCommentPage((page) => Math.max(0, page - 1))}><ChevronLeft size={15} /></button>{Array.from({ length: commentPages }, (_, page) => <button key={page} className={`page-number ${commentPage === page ? "active" : ""}`} onClick={() => setCommentPage(page)}>{page + 1}</button>)}<button className="page-arrow" aria-label="Next page" disabled={commentPage >= commentPages - 1} onClick={() => setCommentPage((page) => Math.min(commentPages - 1, page + 1))}><ChevronRight size={15} /></button></nav>}</>}
        {selectedEvidence && <><div className="ai-drawer-intro"><span className={`ai-signal signal-${selectedEvidence.sentiment}`}>{selectedEvidence.sentiment}</span><p>{selectedEvidence.meta}</p></div><p className="ai-summary-copy">{selectedEvidence.text}</p>{selectedEvidence.url && <a className="ai-source-link" href={selectedEvidence.url} target="_blank" rel="noreferrer">Open original source <ArrowUpRight size={13} /></a>}{selectedEvidence.thread?.length ? <div className="ai-thread-view"><div className="ai-comment-list-heading"><div><h3>Comment thread</h3><p>{selectedEvidence.thread.length} comments and replies captured</p></div><span>Official channel</span></div>{selectedEvidence.thread.map((comment) => <article key={comment.id} className={comment.depth ? "thread-reply" : ""} style={{ marginLeft: `${Math.min(2, comment.depth || 0) * 22}px` }}><header><strong>{comment.author}</strong><span className={`signal-${comment.sentiment}`}>{comment.sentiment}</span></header><p>{comment.text}</p><footer><small>{comment.depth ? `Reply · depth ${comment.depth}` : "Comment"}</small>{comment.date ? <time>{new Date(comment.date).toLocaleDateString("en-IN")}</time> : null}</footer></article>)}</div> : null}</>}
      </aside></div>}
    </main>
  );
}
