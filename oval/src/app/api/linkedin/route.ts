import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";
import { buildMonthlyTrend, buildTopicClusters } from "@/lib/social-analytics";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const dynamic = "force-dynamic";

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  if (data?.length) return data.map((brand: any) => brand.id);
  return [];
}

function num(value: any) {
  return Number(value || 0);
}

const PW_RELEVANCE_RE =
  /\b(physics\s*wallah|physicswallah|alakh\s*pandey|pw\s+skills|pw\s+vidyapeeth|pw\s+onlyias|pw\s+ioi|infinity\s+pro|pwians?|pwstories|gyaan-?e|gate\s+wallah|neet\s+wallah|jee\s+wallah)\b|#pw\b/i;

const NEGATIVE_RE =
  /\b(refund|support|ticket|no\s+response|consumer|court|legal|fraud|scam|complaint|locked|payment|deducted|charge|misleading|mis-?sell|oversell|not\s+working|issue|problem|unable|cheat|fake|harassment|rights|worst)\b/i;

const POSITIVE_RE =
  /\b(proud|congratulations|congrats|selected|achievement|grateful|milestone|success|opportunity|accessible|trust|thankful|inspiring|excellent|great|best|helpful|impact)\b/i;

const ISSUE_RULES = [
  { type: "payment_refund", label: "Payment, refund or fee trust", owner: "Aayush", keywords: /\b(refund|payment|paid|money|deducted|charge|fee|upi|transaction|invoice)\b/i },
  { type: "support_gap", label: "Support response gap", owner: "Support Ops", keywords: /\b(support|ticket|no\s+response|customer\s+care|help|complaint|resolve|contact)\b/i },
  { type: "legal_trust", label: "Legal, consumer or trust risk", owner: "PR + Legal", keywords: /\b(consumer|court|legal|fraud|scam|fake|rights|cheat|misleading)\b/i },
  { type: "batch_course", label: "Batch, course or academic operations", owner: "Aditya Kumar", keywords: /\b(batch|course|class|teacher|faculty|lecture|neet|jee|vidyapeeth|dpp|test)\b/i },
  { type: "hiring_brand", label: "Hiring and employer brand", owner: "People Team", keywords: /\b(hiring|job|career|employee|workplace|culture|interview|recruitment|counsellor)\b/i },
  { type: "student_success", label: "Student success or advocacy", owner: "Brand + Academic", keywords: /\b(selected|rank|result|success|proud|achievement|congratulations|testimonial)\b/i },
  { type: "founder_reputation", label: "Founder or leadership reputation", owner: "Leadership Comms", keywords: /\b(alakh|pandey|founder|ceo|leadership)\b/i },
  { type: "business_reputation", label: "Business and market reputation", owner: "Strategy + PR", keywords: /\b(ipo|funding|revenue|valuation|growth|acquisition|market|business)\b/i },
];

function sentimentCounts(signals: TextSignal[]) {
  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const signal of signals) {
    const sentiment = String(signal.sentiment || "").toLowerCase();
    if (sentiment.includes("positive")) counts.positive += 1;
    else if (sentiment.includes("negative") || sentiment.includes("risk")) counts.negative += 1;
    else counts.neutral += 1;
  }
  return counts;
}

function canonicalUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split("?")[0].replace(/\/+$/, "");
}

function isBoilerplateLabel(value?: string | null) {
  return /^(user agreement|privacy policy|cookie policy|linkedin|sign in|join now|edited)$/i.test(String(value || "").trim());
}

function titleFromLinkedInUrl(value?: string | null) {
  const url = String(value || "");
  const match = url.match(/linkedin\.com\/posts\/([^_/]+(?:-[^_/]+){0,6})_/i);
  if (!match?.[1]) return "LinkedIn post";
  return match[1]
    .split("-")
    .filter((part) => part && !/^\d+$/.test(part))
    .slice(0, 5)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateScore(value?: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const ageDays = Math.max(0, (Date.now() - date.getTime()) / 86400000);
  return Math.max(0, 20 - Math.min(20, ageDays / 3));
}

function textBlob(signal: Record<string, any>, evidence: Record<string, any>[] = []) {
  return [
    signal.title,
    signal.text,
    signal.author,
    ...evidence.flatMap((item) => [item.title, item.text, item.author]),
  ]
    .filter(Boolean)
    .join(" ");
}

function isCommentSignal(signal: Record<string, any>) {
  return String(signal.sourceType || "").toLowerCase().includes("comment");
}

function isPostSignal(signal: Record<string, any>) {
  const sourceType = String(signal.sourceType || "").toLowerCase();
  return sourceType.includes("post") || sourceType.includes("activity") || !isCommentSignal(signal);
}

function classifyLinkedInPost(post: TextSignal & Record<string, any>, evidenceComments: Array<TextSignal & Record<string, any>>) {
  const blob = textBlob(post, evidenceComments);
  const hasNegative = NEGATIVE_RE.test(blob);
  const hasPositive = POSITIVE_RE.test(blob);
  const sentiment = hasNegative && hasPositive ? "mixed" : hasNegative ? "negative" : hasPositive ? "positive" : post.sentiment || "neutral";
  const issue = ISSUE_RULES.find((rule) => rule.keywords.test(blob)) || {
    type: "general_brand",
    label: "General PW brand discussion",
    owner: "Brand + PR",
  };
  const relevanceScore = PW_RELEVANCE_RE.test(blob) ? 35 : 0;
  const sentimentScore = hasNegative ? 25 : hasPositive ? 14 : 6;
  const engagementScore = Math.min(20, Math.log10(num(post.engagement) + 1) * 8);
  const evidenceScore = Math.min(14, evidenceComments.length * 3);
  const recency = dateScore(post.publishedAt || post.fetchedAt);

  return {
    ...post,
    sentiment,
    issueType: issue.type,
    issueLabel: issue.label,
    recommendedOwner: issue.owner,
    relevanceScore,
    priorityScore: Math.round(relevanceScore + sentimentScore + engagementScore + evidenceScore + recency),
    evidenceCommentCount: evidenceComments.length,
    evidenceComments: evidenceComments
      .sort((a, b) => num(b.engagement) - num(a.engagement))
      .slice(0, 8),
  };
}

function normalizePost(post: any): TextSignal & Record<string, any> {
  const reactions = num(post.reactions_count ?? post.reaction_count ?? post.likes_count ?? post.likes);
  const comments = num(post.comments_count ?? post.comment_count ?? post.comments);
  const shares = num(post.shares_count ?? post.share_count ?? post.shares);
  const text = post.post_text || post.text || post.content_text || post.caption || "";
  const postUrl = post.post_url || post.url || post.source_url;
  const rawTitle = post.post_title || post.title || post.author_name || post.company_name || "LinkedIn post";
  const rawAuthor = post.author_name || post.company_name || post.author || "Physics Wallah";
  const title = isBoilerplateLabel(rawTitle) ? titleFromLinkedInUrl(postUrl) : rawTitle;
  const author = isBoilerplateLabel(rawAuthor) ? titleFromLinkedInUrl(postUrl) : rawAuthor;
  return {
    id: post.post_id || post.linkedin_post_id || post.urn || post.id,
    title,
    text,
    url: postUrl,
    sentiment: post.sentiment_label || post.final_sentiment || "neutral",
    engagement: reactions + comments + shares,
    comments,
    publishedAt: post.published_date || post.published_at || post.created_at,
    fetchedAt: post.scraped_at || post.fetched_at,
    sourceType: "post",
    author,
    reactions,
    shares,
    imageUrl: post.image_url || post.thumbnail_url || post.media_url || null,
  };
}

function normalizeMention(mention: any): TextSignal & Record<string, any> {
  const text = mention.content_text || mention.text || mention.comment_text || mention.body || "";
  const mentionUrl = mention.source_url || mention.url;
  const rawTitle = mention.author_name || mention.author_handle || mention.title || "LinkedIn mention";
  const rawAuthor = mention.author_name || mention.author_handle || "LinkedIn member";
  const title = isBoilerplateLabel(rawTitle) ? titleFromLinkedInUrl(mentionUrl) : rawTitle;
  const author = isBoilerplateLabel(rawAuthor) ? titleFromLinkedInUrl(mentionUrl) : rawAuthor;
  return {
    id: mention.id || mention.external_id || mention.source_id,
    title,
    text,
    url: mentionUrl,
    sentiment: mention.sentiment_label || mention.final_sentiment || "neutral",
    engagement: num(mention.engagement_score || mention.reactions_count || mention.likes_count),
    comments: num(mention.comments_count),
    publishedAt: mention.published_at || mention.created_at,
    fetchedAt: mention.scraped_at || mention.fetched_at,
    sourceType: mention.content_type || "mention",
    author,
    parentUrl: mention.parent_url || mention.post_url || mention.source_url || mention.url,
  };
}

export async function GET() {
  if (!url || !key) {
    return NextResponse.json({
      live: false,
      configured: false,
      stats: { totalPosts: 0, totalMentions: 0, totalEngagement: 0, totalComments: 0, avgEngagement: 0, sentiment: { positive: 0, negative: 0, neutral: 0 } },
      posts: [],
      mentions: [],
      topComments: [],
      monthlyTrend: [],
      clusters: [],
      requiredEnv: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_KEY", "LINKEDIN_CUSTOM_SCRAPER_URL", "LINKEDIN_CUSTOM_SCRAPER_TOKEN"],
    });
  }

  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) {
    return NextResponse.json({
      live: false,
      configured: true,
      stats: { totalPosts: 0, totalMentions: 0, totalEngagement: 0, totalComments: 0, avgEngagement: 0, sentiment: { positive: 0, negative: 0, neutral: 0 } },
      posts: [],
      mentions: [],
      topComments: [],
      monthlyTrend: [],
      clusters: [],
    });
  }

  const [postsRes, mentionsRes, allPostsRes, allMentionsRes] = await Promise.all([
    sb.from("linkedin_posts").select("*").in("brand_id", brandIds).order("scraped_at", { ascending: false }).limit(100),
    sb.from("mentions").select("*").in("brand_id", brandIds).eq("platform", "linkedin").order("scraped_at", { ascending: false }).limit(300),
    sb.from("linkedin_posts").select("*").order("scraped_at", { ascending: false }).limit(100),
    sb.from("mentions").select("*").eq("platform", "linkedin").order("scraped_at", { ascending: false }).limit(300),
  ]);

  const postRows = Array.from(new Map([...(postsRes.data || []), ...(allPostsRes.data || [])].map((post: any) => [post.id || post.post_url || post.post_text, post])).values());
  const mentionRows = Array.from(new Map([...(mentionsRes.data || []), ...(allMentionsRes.data || [])].map((mention: any) => [mention.id || mention.platform_ref_id || `${mention.source_url}-${mention.content_text}`, mention])).values());
  const normalizedPosts = postRows.map(normalizePost);
  const normalizedMentions = mentionRows.map(normalizeMention);
  const commentMentions = normalizedMentions.filter(isCommentSignal);
  const postMentions = normalizedMentions.filter(isPostSignal);
  const commentsByUrl = new Map<string, Array<TextSignal & Record<string, any>>>();

  for (const comment of commentMentions) {
    const key = canonicalUrl(comment.parentUrl || comment.url);
    if (!key) continue;
    const list = commentsByUrl.get(key) || [];
    list.push(comment);
    commentsByUrl.set(key, list);
  }

  const postMap = new Map<string, TextSignal & Record<string, any>>();
  for (const post of [...normalizedPosts, ...postMentions]) {
    const key = canonicalUrl(post.url) || String(post.id || `${post.title}-${post.text}`);
    const existing = postMap.get(key);
    postMap.set(key, {
      ...(existing || {}),
      ...post,
      engagement: Math.max(num(existing?.engagement), num(post.engagement)),
      comments: Math.max(num(existing?.comments), num(post.comments)),
      text: post.text || existing?.text || "",
      title: post.title || existing?.title || "LinkedIn post",
    });
  }

  const posts = Array.from(postMap.entries())
    .map(([key, post]) => classifyLinkedInPost(post, commentsByUrl.get(key) || []))
    .filter((post) => PW_RELEVANCE_RE.test(textBlob(post, post.evidenceComments)) || post.evidenceComments.length > 0)
    .sort((a, b) => num(b.priorityScore) - num(a.priorityScore));

  const postLevelMentions = posts.map((post) => ({
    ...post,
    sourceType: "linkedin_post",
  }));
  const evidenceComments = posts.flatMap((post) => post.evidenceComments || []);
  const signals = [...postLevelMentions, ...evidenceComments];
  const textSignals = signals.filter((signal) => `${signal.title || ""} ${signal.text || ""}`.trim().length > 8);
  const monthlyTrend = buildMonthlyTrend(signals, (signal) => signal.publishedAt || signal.fetchedAt, {
    getComments: (signal) => signal.comments,
    getEngagement: (signal) => signal.engagement,
    getSentiment: (signal) => signal.sentiment,
  });
  const clusters = buildTopicClusters(signals.map((signal) => `${signal.title || ""} ${signal.text || ""}`), 6);
  const supervisedTopics = buildSupervisedTopics(signals, { denominator: textSignals.length || signals.length || 1 });
  const sentiment = sentimentCounts(signals);
  const totalEngagement = signals.reduce((sum, signal) => sum + num(signal.engagement), 0);
  const totalComments = signals.reduce((sum, signal) => sum + num(signal.comments), 0);
  const latestPostAt = [...posts]
    .sort((a, b) => new Date(b.publishedAt || b.fetchedAt || 0).getTime() - new Date(a.publishedAt || a.fetchedAt || 0).getTime())[0]?.publishedAt || posts[0]?.fetchedAt || null;
  const contract = buildChannelContract({
    channel: "linkedin",
    sourceStatus: buildSourceStatus({
      mode: "live",
      fetchedAtValues: signals.map((signal) => signal.fetchedAt),
      publishedAtValues: signals.map((signal) => signal.publishedAt),
      limitations: [
        "LinkedIn data is collected through configured compliant collectors and supplied public LinkedIn URLs.",
        "Company followers, employee count, and jobs appear only if the collector sends those fields.",
        "Comment rows are evidence under parent posts and are not promoted as top-level market posts.",
        "Comment depth depends on source visibility, collector permissions, and LinkedIn public page coverage.",
      ],
    }),
    signals,
    sentiment: summarizeSentiment(signals, "linkedin-custom-collector-rules", {
      ...sentiment,
      confidence: textSignals.length ? 0.68 : 0.45,
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(clusters),
    headline: "LinkedIn should read as the professional reputation and hiring-market signal, not a generic social feed.",
    whyItMatters: "For PW, LinkedIn reveals employer brand, executive narrative, corporate trust, hiring perception, and public comments from alumni, educators, employees, and industry observers.",
    recommendedActions: [
      "Review high-priority parent posts first, then inspect attached visible comments as evidence.",
      "Separate official PW posts, public PW mentions, and comment evidence so leadership can see narrative control versus market reaction.",
      "Track comments on leadership, hiring, offline expansion, teacher brand, and corporate trust as distinct clusters.",
    ],
  });

  return NextResponse.json({
    live: signals.length > 0,
    configured: true,
    collectorConfigured: Boolean(process.env.LINKEDIN_CUSTOM_SCRAPER_URL || process.env.LINKEDIN_PROXYCURL_API_KEY),
    contract,
    stats: {
      totalPosts: posts.length,
      totalMentions: postLevelMentions.length,
      totalPostMentions: postLevelMentions.length,
      evidenceComments: evidenceComments.length,
      totalEngagement,
      totalComments,
      avgEngagement: signals.length ? Math.round(totalEngagement / signals.length) : 0,
      companyFollowers: num((postsRes.data || [])[0]?.company_followers),
      employeeCount: num((postsRes.data || [])[0]?.employee_count),
      jobPostingsCount: num((postsRes.data || [])[0]?.job_postings_count),
      latestPostAt,
      sentiment,
    },
    posts: posts.slice(0, 30),
    mentions: postLevelMentions.slice(0, 50),
    topComments: posts.flatMap((post) => (post.evidenceComments || []).map((comment: any) => ({ ...comment, parentPostTitle: post.title, parentPostUrl: post.url }))).slice(0, 50),
    monthlyTrend,
    clusters,
    sourceErrors: {
      posts: postsRes.error?.message || null,
      mentions: mentionsRes.error?.message || null,
      allPosts: allPostsRes.error?.message || null,
      allMentions: allMentionsRes.error?.message || null,
    },
  });
}
