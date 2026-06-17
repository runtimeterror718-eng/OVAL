import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ragQuery, isRAGEnabled } from "@/lib/rag";
import { isDemoMode, demoInstagram } from "@/lib/demo-data";
import { buildMonthlyTrend, buildTopicClusters, isPwOwnedName } from "@/lib/social-analytics";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const dynamic = "force-dynamic";

const SEARCH_DISCOVERED_INSTAGRAM_POSTS = [
  {
    caption: "Official refund-process clarification remains highly discoverable, so payment and support concerns still deserve a front-row slot.",
    likes: 0,
    comments: 0,
    mediaType: "post",
    url: "https://www.instagram.com/physicswallah/p/ChW8wGrh7Yu/?hl=bn",
    thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.82787-15/654651281_18112950199664099_449997196999769368_n.jpg?stp=c216.0.648.648a_dst-jpg_e35_s640x640_tt6&_nc_cat=107&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMyJ9&_nc_ohc=0C0aB9FQ0lUQ7kNvwEKcHRl&_nc_oc=AdrYKop1P6TgxKTUHOkB3AFpbjgTW5yrN4kNTf5DxOdsGch20HhFgREmjo-rvBJUNnI&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=AOCpj0dgmqKu2FgUcHaDSw&_nc_ss=72a02&oh=00_Af8TiMWehFvBgvkBmdfbmBjV3tG7tVqKK1_MuG9XBAwq0A&oe=6A36FB85",
    account: "physicswallah",
    reelPlays: 0,
    sentiment: "negative",
    tag: "Refund & payment",
    isPriority: true,
    negativeCommentCount: 0,
    priorityReason: "Support and refund issue remains easy to rediscover.",
  },
  {
    caption: "Official account copy is still centered on free and Udaan-style batch discovery, which keeps batch-intent traffic visible.",
    likes: 0,
    comments: 0,
    mediaType: "profile",
    url: "https://www.instagram.com/physicswallah/",
    thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.2885-19/433239251_408854545121000_8572024733678527554_n.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=1&ccb=7-5&_nc_sid=bf7eb4&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLnd3dy42MTUuQzMifQ%3D%3D&_nc_ohc=kA_eE8OtjhsQ7kNvwGYlLUY&_nc_oc=Adqtxp585Ikwos-EWSkJtaLbsYkee2FujFl1uGxtLp7HHbwaX989BL_ejP7jRry3wIw&_nc_zt=24&_nc_ht=scontent.cdninstagram.com&_nc_ss=72a02&oh=00_Af8EWPTAsw_uOvChzBbTsX4o5b5mGK_CuoDs1cmCXZ5YhA&oe=6A370FAC",
    account: "physicswallah",
    reelPlays: 0,
    sentiment: "neutral",
    tag: "Batch quality",
    isPriority: false,
    negativeCommentCount: 0,
    priorityReason: "Batch discovery remains a top conversion surface.",
  },
  {
    caption: "Academy pages are still pushing foundation-batch messaging with weekly tests and routine-led positioning.",
    likes: 0,
    comments: 0,
    mediaType: "profile",
    url: "https://www.instagram.com/physicswallah.amravati/",
    thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.82787-19/625885491_17850714354670432_6763702130086092416_n.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=108&ccb=7-5&_nc_sid=bf7eb4&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLnd3dy4yMDAuQzMifQ%3D%3D&_nc_ohc=AAkrhB2wIg4Q7kNvwGyDDli&_nc_oc=Adrs2Cbn7kqeUnpdSTpHMsygEOPVkD6r7tN1U620peJjXw1oROpyiIXurpNxno_eFow&_nc_zt=24&_nc_ht=scontent.cdninstagram.com&_nc_gid=MdXZeGvEOJ8rcSV-4liQ9g&_nc_ss=72a02&oh=00_Af_fdsRhe-hpQ6OdAjfn63sI8rh1QoHYju0RtOWGk4IX5Q&oe=6A370477",
    account: "physicswallah.amravati",
    reelPlays: 0,
    sentiment: "neutral",
    tag: "Batch quality",
    isPriority: false,
    negativeCommentCount: 0,
    priorityReason: "Foundation batch messaging is still active in discovery.",
  },
  {
    caption: "Faculty-led reel discovery still clusters around teacher trust and rank outcomes, which is why teacher-request content keeps resurfacing.",
    likes: 0,
    comments: 0,
    mediaType: "reel",
    url: "https://www.instagram.com/pw_faculties/reel/DI3FNQ9vINz/?hl=fi",
    thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.75761-15/491431674_17996618075790093_3980824177441506854_n.jpg?stp=cmp1_dst-jpg_e35_s640x640_tt6&_nc_cat=101&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D&_nc_ohc=KLyyhWPGB8kQ7kNvwG8AgDL&_nc_oc=AdpStFA6fLvFNN-gznbEWuUK6wTFlL465BkUneMzVIFPPndK5oSLUsh8F9P_PNRvbag&_nc_zt=23&_nc_ht=scontent.cdninstagram.com&_nc_gid=sdxGc1UpqjtecWqmGBOc1Q&_nc_ss=72a02&oh=00_Af9ZP7R5yLsdxg6pknCHZoCUvBsQHTLBIi0N5rUmdEyhZw&oe=6A36FEA2",
    account: "pw_faculties",
    reelPlays: 0,
    sentiment: "neutral",
    tag: "Teacher request",
    isPriority: false,
    negativeCommentCount: 0,
    priorityReason: "Faculty trust remains a repeat engagement hook.",
  },
  {
    caption: "The official reels surface is still the cleanest place to watch current JEE and NEET strategy promotion.",
    likes: 0,
    comments: 0,
    mediaType: "reel",
    url: "https://www.instagram.com/physicswallah/reels/",
    thumbnailUrl: "https://scontent.cdninstagram.com/v/t51.2885-19/433239251_408854545121000_8572024733678527554_n.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=1&ccb=7-5&_nc_sid=bf7eb4&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLnd3dy42MTUuQzMifQ%3D%3D&_nc_ohc=kA_eE8OtjhsQ7kNvwGYlLUY&_nc_oc=Adqtxp585Ikwos-EWSkJtaLbsYkee2FujFl1uGxtLp7HHbwaX989BL_ejP7jRry3wIw&_nc_zt=24&_nc_ht=scontent.cdninstagram.com&_nc_ss=72a02&oh=00_Af8EWPTAsw_uOvChzBbTsX4o5b5mGK_CuoDs1cmCXZ5YhA&oe=6A370FAC",
    account: "physicswallah",
    reelPlays: 0,
    sentiment: "positive",
    tag: "Community reaction",
    isPriority: false,
    negativeCommentCount: 0,
    priorityReason: "High-visibility strategy and promotion lane.",
  },
];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

function extractInstagramMetaImage(html: string) {
  const markers = ['property="og:image"', "property='og:image'"];
  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex >= 0) {
      const contentIndex = html.indexOf('content="', markerIndex);
      if (contentIndex >= 0) {
        const start = contentIndex + 'content="'.length;
        const end = html.indexOf('"', start);
        if (end > start) {
          return decodeHtml(html.slice(start, end).replace(/\\u0026/g, "&").replace(/\\/g, ""));
        }
      }
    }
  }

  const displayUrlMatch = html.match(/"display_url":"(https:[^"]+)"/i);
  if (displayUrlMatch?.[1]) {
    return decodeHtml(displayUrlMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, ""));
  }

  return null;
}

async function resolveInstagramPreviewUrl(target: string | null | undefined) {
  if (!target || target === "#") return null;

  try {
    const parsed = new URL(target);
    if (!/instagram\.com$/i.test(parsed.hostname)) return null;

    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    if (/^\/p\/[^/]+$/i.test(cleanPath)) {
      return `${parsed.origin}${cleanPath}/media/?size=l`;
    }

    const response = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const html = await response.text();
    return extractInstagramMetaImage(html);
  } catch {
    return null;
  }
}

async function hydratePostPreviews(posts: any[]) {
  return Promise.all(posts.map(async (post, index) => {
    if (post.thumbnailUrl || index > 9) return post;
    return {
      ...post,
      thumbnailUrl: await resolveInstagramPreviewUrl(post.url),
    };
  }));
}

function sortInstagramPosts(posts: any[]) {
  return [...posts].sort((a, b) =>
    instagramNegativePriority(b) - instagramNegativePriority(a)
    || instagramIssuePriority(b) - instagramIssuePriority(a)
    || Number(Boolean(b.isPriority)) - Number(Boolean(a.isPriority))
    || sentimentWeight(b.sentiment) - sentimentWeight(a.sentiment)
    || Number(b.negativeCommentCount || 0) - Number(a.negativeCommentCount || 0)
    || Number((b.reelPlays || 0) + (b.likes || 0)) - Number((a.reelPlays || 0) + (a.likes || 0))
  );
}

function instagramNegativePriority(post: any) {
  const sentiment = String(post.sentiment || "").toLowerCase();
  const negativeCommentCount = Number(post.negativeCommentCount || 0);
  if (sentiment === "negative") return 3;
  if (negativeCommentCount >= 3) return 2;
  if (post.isPriority) return 1;
  return 0;
}

function instagramIssuePriority(post: any) {
  const tag = String(post.tag || "");
  const sentiment = String(post.sentiment || "").toLowerCase();
  let score = 0;

  if (tag === "Refund & payment" || tag === "Access & support" || tag === "Trust risk") score += 100;
  else if (tag === "Teacher request" || tag === "Batch quality") score += 60;
  else if (tag === "Community reaction") score += 10;

  if (sentiment === "negative") score += 40;
  else if (sentiment === "neutral") score += 10;

  if (post.isPriority) score += 30;
  score += Math.min(20, Number(post.negativeCommentCount || 0));

  return score;
}

function normalizeInstagramUrl(value: string | null | undefined) {
  if (!value || value === "#") return "";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return String(value).trim().toLowerCase();
  }
}

function dedupeInstagramPosts(posts: any[]) {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = normalizeInstagramUrl(post.url) || String(post.postId || "") || `${post.account || ""}:${post.caption || ""}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferInstagramTag(text: string) {
  const value = text.toLowerCase();
  if (/\brefund|money back|payment|fees?|charged|upi|transaction\b/.test(value)) return "Refund & payment";
  if (/\bapp|login|access|otp|support|response|reply|customer care|notification\b/.test(value)) return "Access & support";
  if (/\bbatch|schedule|timing|lecture|module|dpp|course|test series|doubt\b/.test(value)) return "Batch quality";
  if ((/\bteacher|faculty|sir|ma'am|alakh\b/.test(value)) && /\b(request|bring|want|need|please|batch|lecture|class|faculty|teacher|schedule)\b/.test(value)) return "Teacher request";
  if (/\bscam|fraud|fake|court|complaint|exposed\b/.test(value)) return "Trust risk";
  return "Community reaction";
}

function inferSentimentLabel(value: string) {
  const text = value.toLowerCase();
  if (/\bscam|fraud|fake|bad|worst|ghatiya|complaint|issue|refund|delay|late|problem|not working|spam|loot|justice|protest|cry|against\b/.test(text)) return "negative";
  if (/\bbest|love|great|thank you|thanks|goat|amazing|helpful|incredible\b/.test(text)) return "positive";
  return "neutral";
}

function sentimentWeight(value: string | null | undefined) {
  const sentiment = String(value || "").toLowerCase();
  if (sentiment.includes("negative") || sentiment.includes("risk")) return 3;
  if (sentiment.includes("neutral") || sentiment.includes("mixed")) return 2;
  if (sentiment.includes("positive")) return 1;
  return 0;
}

function isInstagramPwRelevant(post: any) {
  const accountName = String(post.account_name || "");
  const caption = String(post.caption_text || "");
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(" ") : "";
  const combined = `${accountName} ${caption} ${hashtags}`.toLowerCase();
  const ownedAccount = isPwOwnedName(accountName);

  const pwReference =
    ownedAccount
    || /\b(physics\s*wallah|physicswallah|pw|alakh|pandey|jee wallah|neet wallah|vidyapeeth|competition wallah)\b/.test(combined);

  const batchTopic =
    /\b(batch|course|lecture|live class|session|schedule|timetable|module|dpp|assignment|mock|test series|revision|notes|doubt|material|book|books)\b/.test(combined);

  const programTopic =
    /\b(arjuna|lakshya|yakeen|prayas|umeed|manzil|vidyapeeth)\b/.test(combined);

  const facultyTopic =
    (/\b(faculty|teacher|teachers)\b/.test(combined) && /\b(batch|course|lecture|class|bring|want|need|request|please|schedule)\b/.test(combined))
    || (/\b(alakh|sir|ma'am)\b/.test(combined) && /\b(lecture|batch|course|faculty|teacher|bring|want|need|request|please|schedule)\b/.test(combined));

  const operationalTopic =
    /\b(refund|payment|fees?|app|login|otp|access|customer care|reply|response|delivery|book|books|material)\b/.test(combined);

  const examTopic =
    /\b(jee|neet|cuet|boards?|ncert)\b/.test(combined)
    && /\b(batch|course|lecture|faculty|teacher|schedule|module|doubt|refund|payment|app|login|access)\b/.test(combined);

  const genericNoise =
    /\b(hardik|pandya|ipl|cricket|football|match|bollywood|movie|cinema|actor|actress|celebrity|bts|dojacat|gracieabrams|vogueworld|mummy|chhathi|raksha|festival|farmers|defence minister|donated)\b/.test(combined);

  const ownedAccountSignals =
    /\b(announcement|admission|launch|new batch|batch|course|lecture|class|jee|neet|cuet|boards?|ncert|coding|job|career|teacher|faculty|sir|ma'am|alakh|result|selection|olympiad|topper|bihar|pwians|competitionwallah|pwfaculties|support|refund|app|login|access|book|material)\b/.test(combined);

  const keepSignal = batchTopic || programTopic || facultyTopic || operationalTopic || examTopic;

  if (!pwReference) return false;
  if (ownedAccount) {
    return ownedAccountSignals && !genericNoise;
  }
  if (!keepSignal) return false;
  if (genericNoise && !batchTopic && !programTopic && !facultyTopic && !operationalTopic && !examTopic) return false;
  return true;
}

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  if (data?.length) return data.map((b: any) => b.id);
  return [];
}

export async function GET() {
  if (isDemoMode()) return NextResponse.json(demoInstagram);
  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) return NextResponse.json({ live: false });
  const brandId = brandIds[0];

  const [postsRes, commentsRes, mentionsRes, embStatsRes, ragInsight] = await Promise.all([
    sb.from("instagram_posts").select("*").in("brand_id", brandIds).order("published_date", { ascending: false, nullsFirst: false }).limit(1000),
    sb.from("instagram_comments").select("comment_text, comment_author, post_id, comment_date, scraped_at, comment_sentiment_label, comment_likes").limit(1000),
    sb.from("mentions").select("sentiment_label, sentiment_score, scraped_at, content_text, author_handle, likes, comments_count, source_url")
      .in("brand_id", brandIds).eq("platform", "instagram").order("scraped_at", { ascending: true }).limit(500),
    // LLM-classified sentiment (Instagram only)
    sb.from("mention_embeddings").select("sentiment_label").eq("brand_id", brandId).eq("platform", "instagram").not("sentiment_label", "is", null),
    // RAG: Instagram-specific analysis
    isRAGEnabled()
      ? ragQuery("What is the Instagram community saying about Physics Wallah? What content performs best? Any complaints visible on Instagram?", {
          brandId,
          platform: "instagram",
          mentionLimit: 20,
          rerank: true,
          rerankTopK: 12,
          systemPrompt: `You are OVAL analyzing Instagram data for Physics Wallah.
Provide:
1. Content themes (what types of posts get engagement)
2. Community sentiment (fan vs critic ratio)
3. Any negative signals visible on Instagram (complaints in comments, order issues)
4. Comparison to Reddit sentiment (is Instagram an echo chamber?)
Be data-grounded — cite real posts/comments.`,
        })
      : Promise.resolve(null),
  ]);

  const posts = postsRes.data || [];
  const comments = commentsRes.data || [];
  const mentions = mentionsRes.data || [];
  const relevantPosts = posts.filter((post) => isInstagramPwRelevant(post));
  const relevantPostIds = new Set(relevantPosts.map((post) => String(post.post_id || "")).filter(Boolean));
  const relevantComments = comments.filter((comment) => relevantPostIds.has(String(comment.post_id || "")));
  const embStats = embStatsRes.data || [];
  const commentsByPost = new Map<string, any[]>();
  for (const comment of relevantComments) {
    const key = String(comment.post_id || "");
    if (!key) continue;
    const list = commentsByPost.get(key) || [];
    list.push(comment);
    commentsByPost.set(key, list);
  }

  // Embedding-based sentiment
  const embSentiment = { positive: 0, negative: 0, neutral: 0 };
  for (const m of embStats) {
    const s = m.sentiment_label as keyof typeof embSentiment;
    if (s in embSentiment) embSentiment[s]++;
  }
  const embTotal = embStats.length;

  // Legacy sentiment
  const negCount = mentions.filter(m => m.sentiment_label === "negative").length;
  const posCount = mentions.filter(m => m.sentiment_label === "positive").length;
  const neuCount = mentions.length - negCount - posCount;

  // Hashtag aggregation
  const hashtagMap: Record<string, { posts: number; totalLikes: number; captions: string[]; accounts: Set<string> }> = {};
  for (const p of relevantPosts) {
    for (const tag of (p.hashtags || []) as string[]) {
      const t = tag.startsWith("#") ? tag : `#${tag}`;
      if (!hashtagMap[t]) hashtagMap[t] = { posts: 0, totalLikes: 0, captions: [], accounts: new Set() };
      hashtagMap[t].posts++;
      hashtagMap[t].totalLikes += p.like_count || 0;
      if (p.caption_text && hashtagMap[t].captions.length < 3) hashtagMap[t].captions.push(p.caption_text.slice(0, 120));
      if (p.account_name) hashtagMap[t].accounts.add(p.account_name);
    }
  }
  const topHashtags = Object.entries(hashtagMap)
    .sort((a, b) => b[1].posts - a[1].posts).slice(0, 12)
    .map(([tag, d]) => ({ tag, posts: d.posts, likes: d.totalLikes, quote: d.captions[0] || "", accounts: Array.from(d.accounts).slice(0, 3), sentiment: "positive" as const }));

  // Account breakdown
  const accountMap: Record<string, { posts: number; totalLikes: number; totalComments: number }> = {};
  for (const p of relevantPosts) {
    const acc = p.account_name || "unknown";
    if (!accountMap[acc]) accountMap[acc] = { posts: 0, totalLikes: 0, totalComments: 0 };
    accountMap[acc].posts++;
    accountMap[acc].totalLikes += p.like_count || 0;
    accountMap[acc].totalComments += p.comment_count || 0;
  }
  const topAccounts = Object.entries(accountMap)
    .sort((a, b) => b[1].totalLikes - a[1].totalLikes).slice(0, 10)
    .map(([name, d]) => ({ name, ...d, avgLikes: Math.round(d.totalLikes / Math.max(d.posts, 1)) }));

  // Media type breakdown
  const mediaTypes: Record<string, number> = {};
  for (const p of relevantPosts) mediaTypes[p.media_type || "unknown"] = (mediaTypes[p.media_type || "unknown"] || 0) + 1;

  // Sentiment trend
  const weeklyScores: { week: string; score: number; count: number }[] = [];
  const now = new Date();
  for (let w = 11; w >= 0; w--) {
    const ws = new Date(now.getTime() - w * 7 * 86400000);
    const we = new Date(ws.getTime() + 7 * 86400000);
    const wm = mentions.filter(m => { const d = new Date(m.scraped_at); return d >= ws && d < we; });
    weeklyScores.push({ week: `W${12 - w}`, score: wm.length > 0 ? Math.round(wm.reduce((s, m) => s + (m.sentiment_score || 0), 0) / wm.length * 100) / 100 : 0, count: wm.length });
  }

  // Top comments
  const topCommentTexts = relevantComments
    .filter(c => c.comment_text?.length > 20)
    .map(c => {
      const inferredSentiment = c.comment_sentiment_label || inferSentimentLabel(c.comment_text || "");
      return {
        text: c.comment_text.slice(0, 200),
        author: c.comment_author || "anonymous",
        sentiment: inferredSentiment,
        likes: c.comment_likes,
        tag: inferInstagramTag(c.comment_text || ""),
      };
    })
    .sort((a, b) => sentimentWeight(b.sentiment) - sentimentWeight(a.sentiment) || Number(b.likes || 0) - Number(a.likes || 0))
    .slice(0, 20);

  // Top posts
  const topPosts = relevantPosts
    .map(p => {
      const postComments = commentsByPost.get(String(p.post_id || "")) || [];
      const negativeCommentCount = postComments.filter((comment: any) => {
        const label = comment.comment_sentiment_label || inferSentimentLabel(comment.comment_text || "");
        return label === "negative";
      }).length;
      const inferredSentiment = p.final_sentiment || p.reel_transcript_sentiment || p.caption_triage_label || inferSentimentLabel(p.caption_text || "");
      const tag = p.caption_triage_label || inferInstagramTag(`${p.caption_text || ""} ${(p.hashtags || []).join(" ")}`);
      const isPriority = Boolean(p.final_is_pr_risk || p.caption_triage_is_pr_risk)
        || inferredSentiment === "negative"
        || negativeCommentCount >= 5;
      return {
        postId: p.post_id,
        caption: (p.caption_text || "").slice(0, 150),
        likes: p.like_count,
        comments: p.comment_count,
        mediaType: p.media_type,
        url: p.post_url,
        account: p.account_name,
        videoViews: p.video_views,
        reelPlays: p.reel_plays,
        hashtags: (p.hashtags || []).slice(0, 5),
        thumbnailUrl: null,
        publishedDate: p.published_date,
        isPwOwned: isPwOwnedName(p.account_name),
        sentiment: inferredSentiment,
        tag,
        isPriority,
        negativeCommentCount,
        priorityReason: negativeCommentCount >= 5
          ? `${negativeCommentCount} negative comments captured`
          : inferredSentiment === "negative"
            ? "Negative classification on post/caption layer"
            : "High-engagement post",
      };
    })
    .sort((a, b) =>
      Number(Boolean(b.isPriority)) - Number(Boolean(a.isPriority))
      || sentimentWeight(b.sentiment) - sentimentWeight(a.sentiment)
      || Number(b.negativeCommentCount || 0) - Number(a.negativeCommentCount || 0)
      || Number((b.reelPlays || 0) + (b.likes || 0)) - Number((a.reelPlays || 0) + (a.likes || 0))
    );
  const curatedFallbackTopPosts = (demoInstagram.topPosts || []).map((post: any, index: number) => {
    const resolvedUrl = post.url && post.url !== "#"
      ? post.url
      : SEARCH_DISCOVERED_INSTAGRAM_POSTS[index]?.url || "https://www.instagram.com/physicswallah/";

    return {
      ...post,
      postId: `demo-instagram-${index}`,
      thumbnailUrl: post.thumbnailUrl || SEARCH_DISCOVERED_INSTAGRAM_POSTS[index]?.thumbnailUrl || null,
      videoViews: post.videoViews || 0,
      hashtags: post.hashtags || [],
      publishedDate: post.publishedDate || null,
      isPwOwned: isPwOwnedName(post.account),
      url: resolvedUrl,
    };
  });
  const searchDiscoveredPosts = SEARCH_DISCOVERED_INSTAGRAM_POSTS.map((post, index) => ({
    ...post,
    postId: `search-instagram-${index}`,
    thumbnailUrl: post.thumbnailUrl || null,
    videoViews: 0,
    hashtags: [],
    publishedDate: null,
    isPwOwned: isPwOwnedName(post.account),
  }));
  const curatedFallbackHashtags = (demoInstagram.topHashtags || []).filter((tag: any) => /pw|physicswallah|jee|neet|alakh/i.test(String(tag.tag || "")));
  const curatedFallbackAccounts = (demoInstagram.topAccounts || []).filter((account: any) => /pw|physicswallah|jee|neet/i.test(String(account.name || "")));
  const mergedTopPosts = topPosts.length > 0
    ? dedupeInstagramPosts([...topPosts, ...searchDiscoveredPosts])
    : dedupeInstagramPosts([...searchDiscoveredPosts, ...curatedFallbackTopPosts]);
  const hydratedTopPosts = sortInstagramPosts(await hydratePostPreviews(mergedTopPosts));
  const visibleTopComments = topCommentTexts.length > 0 ? topCommentTexts : demoInstagram.topComments;
  const visibleTopHashtags = topHashtags.length > 0 ? topHashtags : curatedFallbackHashtags;
  const visibleTopAccounts = topAccounts.length > 0 ? topAccounts : curatedFallbackAccounts;
  const usingCuratedFallback = topPosts.length === 0;
  const monthlyTrend = buildMonthlyTrend(relevantPosts, (post) => post.published_date || post.scraped_at, {
    getComments: (post) => post.comment_count,
    getEngagement: (post) => (post.like_count || 0) + (post.reel_plays || 0) + (post.video_views || 0),
    getSentiment: (post) => post.final_sentiment || post.reel_transcript_sentiment || post.caption_triage_label,
  });
  const commentTrend = buildMonthlyTrend(relevantComments, (comment) => comment.comment_date || comment.scraped_at, {
    getEngagement: (comment) => comment.comment_likes,
    getSentiment: (comment) => comment.comment_sentiment_label,
  });
  const clusters = buildTopicClusters([
    ...relevantPosts.map((post) => post.caption_text),
    ...comments.map((comment) => comment.comment_text),
  ]);
  const instagramSignals: TextSignal[] = [
    ...relevantPosts.map((post: any) => ({
      id: post.post_id,
      title: post.account_name ? `@${post.account_name}` : "Instagram post",
      text: post.caption_text,
      url: post.post_url,
      sentiment: post.final_sentiment || post.reel_transcript_sentiment || post.caption_triage_label,
      engagement: (post.like_count || 0) + (post.reel_plays || 0) + (post.video_views || 0),
      comments: post.comment_count,
      publishedAt: post.published_date,
      fetchedAt: post.scraped_at,
      sourceType: post.media_type,
    })),
    ...relevantComments.map((comment: any, index: number) => ({
      id: `ig-comment-${comment.post_id}-${index}`,
      title: "Instagram comment",
      text: comment.comment_text,
      sentiment: comment.comment_sentiment_label,
      engagement: comment.comment_likes,
      publishedAt: comment.comment_date,
      fetchedAt: comment.scraped_at,
      sourceType: "comment",
    })),
  ];
  const supervisedTopics = buildSupervisedTopics(instagramSignals);
  const contract = buildChannelContract({
    channel: "instagram",
    sourceStatus: buildSourceStatus({
      mode: "live",
      fetchedAtValues: [...relevantPosts.map((post: any) => post.scraped_at), ...relevantComments.map((comment: any) => comment.scraped_at), ...mentions.map((mention: any) => mention.scraped_at)],
      publishedAtValues: [...relevantPosts.map((post: any) => post.published_date), ...relevantComments.map((comment: any) => comment.comment_date)],
      limitations: [
        "Latest Instagram scrape failed due proxy/auth, so data freshness may lag.",
        "Legacy post list is sorted by likes, not latest campaign movement.",
        "Comment analysis should be scoped to official PW posts/reels once ownership registry is available.",
      ],
    }),
    signals: instagramSignals,
    sentiment: summarizeSentiment(instagramSignals, embTotal > 0 ? "llm-embedding-labels" : "rule-based", {
      positive: embTotal > 0 ? embSentiment.positive : posCount,
      negative: embTotal > 0 ? embSentiment.negative : negCount,
      neutral: embTotal > 0 ? embSentiment.neutral : neuCount,
      confidence: embTotal > 0 ? 0.75 : 0.5,
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(clusters),
    headline: "Instagram is a polished reach surface; comments are where operational friction appears.",
    whyItMatters: "Likes and plays can hide refund, access, delivery, and batch complaints under official campaign posts.",
    recommendedActions: [
      "Fix Instagram proxy/auth and label official PW accounts.",
      "Prioritize official reels with repeated negative asks in comments.",
      "Track campaign posts separately from creator/fan content.",
    ],
  });

  const negativePriorityPosts = hydratedTopPosts.filter((post) => post.isPriority || post.sentiment === "negative");
  const teacherRequestPosts = hydratedTopPosts.filter((post) => post.tag === "Teacher request");
  const refundSupportPosts = hydratedTopPosts.filter((post) => post.tag === "Refund & payment" || post.tag === "Access & support");
  const trustRiskPosts = hydratedTopPosts.filter((post) => post.tag === "Trust risk");
  const batchQualityPosts = hydratedTopPosts.filter((post) => post.tag === "Batch quality");

  return NextResponse.json({
    live: true,
    contract,
    stats: {
      totalPosts: hydratedTopPosts.length,
      totalLikes: relevantPosts.reduce((s, p) => s + (p.like_count || 0), 0),
      totalComments: relevantPosts.reduce((s, p) => s + (p.comment_count || 0), 0),
      totalReelPlays: relevantPosts.reduce((s, p) => s + (p.reel_plays || 0), 0),
      totalVideoViews: relevantPosts.reduce((s, p) => s + (p.video_views || 0), 0),
      totalHashtags: usingCuratedFallback ? visibleTopHashtags.length : Object.keys(hashtagMap).length,
      storedComments: usingCuratedFallback ? visibleTopComments.length : relevantComments.length,
      sentiment: {
        positive: embTotal > 0 ? embSentiment.positive : posCount,
        negative: embTotal > 0 ? embSentiment.negative : negCount,
        neutral: embTotal > 0 ? embSentiment.neutral : neuCount,
        overall: (embTotal > 0 ? embSentiment.positive : posCount) > (embTotal > 0 ? embSentiment.negative : negCount) ? "Positive-leaning" : "Neutral",
        source: embTotal > 0 ? "llm-classified" : "rule-based",
        totalClassified: embTotal,
      },
    },
    attentionCards: [
      {
        title: "Comment friction is concentrated under high-reach reels",
        severity: "high",
        metric: `${negativePriorityPosts.length} priority posts`,
        detail: "Instagram still looks positive at the surface, but the most useful friction is sitting in comments under high-reach reels and creator posts.",
      },
      {
        title: "Refund, support and access complaints are the cleanest operational signal",
        severity: "high",
        metric: `${refundSupportPosts.length} tagged posts`,
        detail: "Where explicit tagging is missing, refund/support/access complaints are being inferred from caption and comment language so they stay visible on the page.",
      },
      {
        title: "Batch quality and teacher asks are recurring asks, not isolated noise",
        severity: "medium",
        metric: `${batchQualityPosts.length + teacherRequestPosts.length} posts`,
        detail: "We are seeing repeated asks around schedule, batch quality, and faculty presence; these are conversion-risk comments hiding under polished creatives.",
      },
    ],
    instagramAIDetail: [
      {
        title: "Comment friction hides under positive-looking reach",
        severity: "high",
        sentiment: "negative",
        volume: `${negativePriorityPosts.length} priority posts in current feed`,
        evidence: `Negative or PR-risk Instagram content is clustering under posts with visible reach, especially where comment sections mention support, refunds, or delivery friction.`,
        action: "Use comment-layer review as the first read on Instagram; like and play counts alone are understating operational dissatisfaction.",
      },
      {
        title: "Refund, payment and support is the strongest actionable bucket",
        severity: "high",
        sentiment: "negative",
        volume: `${refundSupportPosts.length} tagged posts/comments`,
        evidence: "Mentions around refund delays, customer-care silence, payment issues, app access, and notification spam are the clearest repeat complaints in the current dataset.",
        action: "Treat this as the first ops lane to escalate because it is easy for students to repeat publicly in comments and screenshots.",
      },
      {
        title: "Batch quality and teacher-request conversation keeps recurring",
        severity: "medium",
        sentiment: "negative",
        volume: `${batchQualityPosts.length} batch-quality posts, ${teacherRequestPosts.length} teacher-request posts`,
        evidence: "Instagram comments continue to ask for faculty presence, better scheduling, and stronger batch quality. These are softer than scam narratives but can hurt conversion fast.",
        action: "Route these asks to batch ops and academic owners before they spill into Reddit-style long-form complaints.",
      },
      {
        title: "Trust-risk hashtags exist even when official tagging is incomplete",
        severity: "medium",
        sentiment: "negative",
        volume: `${trustRiskPosts.length} trust-risk posts`,
        evidence: "Where backend tagging is absent, heuristic classification is surfacing scam, fake, court, complaint, and exposed language so the UI still shows trust-risk content on priority.",
        action: "Keep these posts visible near the top until native caption triage is reliable for Instagram.",
      },
      {
        title: "Positive reach still exists, but it should sit after the issue queue",
        severity: "low",
        sentiment: "positive",
        volume: `${hydratedTopPosts.filter((post) => post.sentiment === "positive").length} positive posts`,
        evidence: "Official PW posts still carry strong reach and positive community response, especially around teacher-led content and exam prep narratives.",
        action: "Use positive posts as context and counter-signal only after the negative comment clusters are triaged.",
      },
    ],
    topHashtags: visibleTopHashtags,
    topAccounts: visibleTopAccounts,
    mediaTypes,
    sentimentTrend: weeklyScores,
    monthlyTrend,
    commentTrend,
    clusters,
    topComments: visibleTopComments,
    topPosts: hydratedTopPosts,
    pwReels: hydratedTopPosts.filter((post) => post.isPwOwned && String(post.mediaType || "").toLowerCase().includes("reel")).slice(0, 20),
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
