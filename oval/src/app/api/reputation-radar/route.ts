import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import insights from "@/data/playstore-insights.json";
import { buildRadarClusters, buildRadarItem, buildRadarSummary, type RadarEvidence, type RadarInput } from "@/lib/reputation-radar";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const dynamic = "force-dynamic";
const MAX_WINDOW_HOURS = 72;

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").or("name.eq.PhysicsWallah,name.eq.PW Live Smoke");
  if (data?.length) return data.map((brand: any) => brand.id);
  return [];
}

function sinceIso(hours: number) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

function num(value: any) {
  return Number(value || 0);
}

function text(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isRecent(value?: string | null, since?: string) {
  if (!value || !since) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= new Date(since);
}

function groupEvidence<T extends Record<string, any>>(rows: T[], keyField: string, mapper: (row: T, index: number) => RadarEvidence) {
  const grouped = new Map<string, RadarEvidence[]>();
  rows.forEach((row, index) => {
    const key = String(row[keyField] || "");
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(mapper(row, index));
    grouped.set(key, list);
  });
  return grouped;
}

function canonicalUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://youtube.com/watch?v=${videoId}`;
    }
    if (host === "youtu.be") {
      return `https://youtu.be${parsed.pathname}`.replace(/\/+$/, "");
    }
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (key.startsWith("utm_") || ["fbclid", "gclid", "igsh", "si"].includes(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return raw.split("?")[0].replace(/\/+$/, "");
  }
}

function radarInputKey(item: RadarInput, index: number) {
  const urlKey = canonicalUrl(item.url);
  if (urlKey) return urlKey;
  if (item.id) return String(item.id);
  const titleKey = text(item.title);
  const textKey = text(item.text).slice(0, 120);
  if (titleKey || textKey) return `${item.platform}-${item.parentType}-${titleKey}-${textKey}`;
  return `${item.platform}-${item.parentType}-missing-identity-${index}`;
}

function playstoreInputs(since: string): RadarInput[] {
  const primary = (insights as any).apps?.[(insights as any).primaryPackage] || {};
  const rows = [
    ...(primary.criticalReviews || []),
    ...(primary.divergentReviews || []),
    ...(primary.positiveReviews || []),
  ];
  return rows
    .filter((review: any) => isRecent(review.date, since))
    .map((review: any, index: number) => ({
      id: `playstore-${index}-${review.date}-${review.rating}`,
      platform: "playstore",
      parentType: "review",
      title: `${review.rating}★ Play Store review`,
      text: review.text,
      url: null,
      publishedAt: review.date,
      fetchedAt: (insights as any).generatedAt,
      sentiment: review.rating <= 2 ? "negative" : review.rating >= 4 ? "positive" : "neutral",
      rating: review.rating,
      version: review.version,
      engagement: {},
      maxContentAgeHours: 168,
      authorProfile: { name: "Play Store reviewer", influenceSource: "unknown" },
      evidenceComments: [],
    }));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const hours = Math.min(MAX_WINDOW_HOURS, Math.max(6, Number(requestUrl.searchParams.get("hours") || MAX_WINDOW_HOURS)));
  const since = sinceIso(hours);

  if (!url || !key) {
    const playstoreOnly = playstoreInputs(since).map(buildRadarItem).filter(Boolean);
    return NextResponse.json({
      live: false,
      configured: false,
      windowHours: hours,
      since,
      stats: buildRadarSummary(playstoreOnly as any),
      negativePosts: (playstoreOnly as any[]).filter((item) => item.sentiment === "negative" || item.sentiment === "mixed"),
      positivePosts: (playstoreOnly as any[]).filter((item) => item.sentiment === "positive"),
      clusters: buildRadarClusters(playstoreOnly as any),
      items: playstoreOnly,
      sourceErrors: { supabase: "Missing Supabase URL or key" },
    });
  }

  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) {
    return NextResponse.json({ live: false, configured: true, windowHours: hours, since, stats: buildRadarSummary([]), negativePosts: [], positivePosts: [], clusters: [], items: [] });
  }

  const [
    redditPostsRes,
    redditCommentsRes,
    youtubeVideosRes,
    youtubeCommentsRes,
    youtubeChannelsRes,
    instagramPostsRes,
    instagramCommentsRes,
    linkedinPostsRes,
    linkedinMentionsRes,
    googleNewsRes,
    googleAutocompleteRes,
    googleMentionsRes,
  ] = await Promise.all([
    sb.from("reddit_posts").select("*").in("brand_id", brandIds).gte("created_at", since).order("created_at", { ascending: false }).limit(150),
    sb.from("reddit_comments").select("comment_body, comment_author, comment_score, post_id, created_at, scraped_at, comment_sentiment_label").gte("created_at", since).order("comment_score", { ascending: false }).limit(600),
    sb.from("youtube_videos").select("channel_id, video_id, video_title, video_views, video_likes, video_comment_count, video_duration, video_date, scraped_at, source_url, title_triage_label, title_triage_is_pr_risk, title_triage_reason, transcript_sentiment_label, transcript_pr_severity, transcript_pr_summary").in("brand_id", brandIds).gte("video_date", since).order("video_date", { ascending: false }).limit(150),
    sb.from("youtube_comments").select("comment_text, comment_author, comment_likes, comment_sentiment_label, video_id, comment_date, scraped_at").gte("comment_date", since).order("comment_likes", { ascending: false }).limit(600),
    sb.from("youtube_channels").select("channel_id, channel_name, channel_subscribers").in("brand_id", brandIds).limit(300),
    sb.from("instagram_posts").select("*").in("brand_id", brandIds).gte("published_date", since).order("published_date", { ascending: false }).limit(150),
    sb.from("instagram_comments").select("comment_text, comment_author, post_id, comment_date, scraped_at, comment_sentiment_label, comment_likes").gte("comment_date", since).order("comment_likes", { ascending: false }).limit(600),
    sb.from("linkedin_posts").select("*").in("brand_id", brandIds).gte("scraped_at", since).order("scraped_at", { ascending: false }).limit(150),
    sb.from("mentions").select("*").in("brand_id", brandIds).eq("platform", "linkedin").gte("scraped_at", since).order("scraped_at", { ascending: false }).limit(600),
    sb.from("google_news").select("*").in("brand_id", brandIds).gte("scraped_at", since).order("scraped_at", { ascending: false }).limit(100),
    sb.from("google_autocomplete").select("*").in("brand_id", brandIds).gte("scraped_at", since).order("scraped_at", { ascending: false }).limit(200),
    sb.from("mentions").select("content_text, sentiment_label, sentiment_score, scraped_at, source_url").in("brand_id", brandIds).eq("platform", "google").gte("scraped_at", since).order("scraped_at", { ascending: false }).limit(200),
  ]);

  const channelById = new Map((youtubeChannelsRes.data || []).map((channel: any) => [channel.channel_id, channel]));
  const redditEvidence = groupEvidence(redditCommentsRes.data || [], "post_id", (comment: any) => ({
    id: `${comment.post_id}-${comment.created_at}`,
    text: text(comment.comment_body),
    author: comment.comment_author,
    sentiment: comment.comment_sentiment_label || "unknown",
    publishedAt: comment.created_at,
    engagement: comment.comment_score,
  }));
  const youtubeEvidence = groupEvidence(youtubeCommentsRes.data || [], "video_id", (comment: any) => ({
    id: `${comment.video_id}-${comment.comment_date}`,
    text: text(comment.comment_text),
    author: comment.comment_author,
    sentiment: comment.comment_sentiment_label || "unknown",
    publishedAt: comment.comment_date,
    engagement: comment.comment_likes,
  }));
  const instagramEvidence = groupEvidence(instagramCommentsRes.data || [], "post_id", (comment: any) => ({
    id: `${comment.post_id}-${comment.comment_date}`,
    text: text(comment.comment_text),
    author: comment.comment_author,
    sentiment: comment.comment_sentiment_label || "unknown",
    publishedAt: comment.comment_date,
    engagement: comment.comment_likes,
  }));

  const linkedinMentionRows = linkedinMentionsRes.data || [];
  const linkedinCommentEvidence = new Map<string, RadarEvidence[]>();
  const linkedinPostMentions: any[] = [];
  for (const mention of linkedinMentionRows) {
    const sourceType = String(mention.content_type || "").toLowerCase();
    if (sourceType.includes("comment")) {
      const key = canonicalUrl(mention.parent_url || mention.post_url || mention.source_url || mention.url);
      const list = linkedinCommentEvidence.get(key) || [];
      list.push({
        id: mention.id,
        text: text(mention.content_text || mention.text || mention.comment_text),
        author: mention.author_name || mention.author_handle,
        sentiment: mention.sentiment_label || "unknown",
        publishedAt: mention.published_at || mention.created_at || mention.scraped_at,
        url: mention.source_url || mention.url,
        engagement: mention.engagement_score || mention.reactions_count || mention.likes_count,
      });
      linkedinCommentEvidence.set(key, list);
    } else {
      linkedinPostMentions.push(mention);
    }
  }

  const inputs = [
    ...playstoreInputs(since),
    ...(redditPostsRes.data || []).map((post: any) => ({
      id: post.post_id,
      platform: "reddit",
      parentType: "post",
      title: post.post_title,
      text: post.post_body,
      author: post.post_author || post.subreddit_name,
      url: post.post_url,
      publishedAt: post.created_at,
      fetchedAt: post.scraped_at,
      sentiment: post.final_sentiment || post.post_triage_label,
      engagement: { score: post.score, comments: post.num_comments },
      maxContentAgeHours: hours,
      authorProfile: {
        name: post.post_author || post.author_username || post.subreddit_name,
        handle: post.author_username || post.post_author,
        influenceSource: "engagement_proxy",
      },
      evidenceComments: (redditEvidence.get(String(post.post_id)) || []).slice(0, 8),
    })),
    ...(youtubeVideosRes.data || []).map((video: any) => {
      const channel = channelById.get(video.channel_id) || {};
      return {
        id: video.video_id,
        platform: "youtube",
        parentType: "video",
        title: video.video_title,
        text: [video.title_triage_reason, video.transcript_pr_summary].filter(Boolean).join(" "),
        author: channel.channel_name || "YouTube channel",
        url: video.source_url,
        publishedAt: video.video_date,
        fetchedAt: video.scraped_at,
        sentiment: video.transcript_sentiment_label || video.title_triage_label || (video.title_triage_is_pr_risk ? "negative" : "neutral"),
        engagement: { views: video.video_views, likes: video.video_likes, comments: video.video_comment_count },
        maxContentAgeHours: hours,
        authorProfile: {
          name: channel.channel_name || "YouTube channel",
          subscribers: channel.channel_subscribers || null,
          influenceSource: channel.channel_subscribers ? "subscribers" : "engagement_proxy",
        },
        evidenceComments: (youtubeEvidence.get(String(video.video_id)) || []).slice(0, 8),
      };
    }),
    ...(instagramPostsRes.data || []).map((post: any) => ({
      id: post.post_id,
      platform: "instagram",
      parentType: "post",
      title: post.account_name ? `@${post.account_name}` : "Instagram post",
      text: post.caption_text,
      author: post.account_name,
      url: post.post_url,
      publishedAt: post.published_date,
      fetchedAt: post.scraped_at,
      sentiment: post.final_sentiment || post.reel_transcript_sentiment || post.caption_triage_label,
      engagement: { likes: post.like_count, comments: post.comment_count, views: num(post.reel_plays) + num(post.video_views) },
      maxContentAgeHours: hours,
      authorProfile: {
        name: post.account_name,
        handle: post.account_name,
        followers: post.followers_count || post.account_followers || null,
        influenceSource: (post.followers_count || post.account_followers) ? "followers" : "engagement_proxy",
      },
      evidenceComments: (instagramEvidence.get(String(post.post_id)) || []).slice(0, 8),
    })),
    ...(linkedinPostsRes.data || []).map((post: any) => {
      const postUrl = post.post_url || post.url || post.source_url;
      return {
        id: post.post_id || post.linkedin_post_id || post.id,
        platform: "linkedin",
        parentType: "post",
        title: post.post_title || post.title || post.author_name || post.company_name || "LinkedIn post",
        text: post.post_text || post.text || post.content_text || post.caption,
        author: post.author_name || post.company_name || post.author,
        url: postUrl,
        publishedAt: post.published_date || post.published_at || post.created_at || post.scraped_at,
        fetchedAt: post.scraped_at || post.fetched_at,
        sentiment: post.sentiment_label || post.final_sentiment,
        engagement: { likes: post.reactions_count ?? post.reaction_count ?? post.likes_count, comments: post.comments_count ?? post.comment_count, shares: post.shares_count ?? post.share_count },
        maxContentAgeHours: hours,
        authorProfile: {
          name: post.author_name || post.company_name || post.author,
          handle: post.author_handle || null,
          followers: post.author_followers || post.followers || post.company_page_followers || null,
          connections: post.author_connections || post.connections || null,
          influenceSource: (post.author_followers || post.followers || post.company_page_followers) ? "followers" : (post.author_connections || post.connections) ? "connections" : "engagement_proxy",
        },
        evidenceComments: (linkedinCommentEvidence.get(canonicalUrl(postUrl)) || []).slice(0, 8),
      } as RadarInput;
    }),
    ...linkedinPostMentions.map((mention: any) => ({
      id: mention.id || mention.external_id,
      platform: "linkedin",
      parentType: "post",
      title: mention.author_name || mention.author_handle || mention.title || "LinkedIn post",
      text: mention.content_text || mention.text || mention.body,
      author: mention.author_name || mention.author_handle,
      url: mention.source_url || mention.url,
      publishedAt: mention.published_at || mention.created_at || mention.scraped_at,
      fetchedAt: mention.scraped_at || mention.fetched_at,
      sentiment: mention.sentiment_label || mention.final_sentiment,
      engagement: { likes: mention.engagement_score || mention.reactions_count || mention.likes_count, comments: mention.comments_count },
      maxContentAgeHours: hours,
      authorProfile: {
        name: mention.author_name || mention.author_handle,
        handle: mention.author_handle,
        followers: mention.author_followers || mention.followers || mention.company_page_followers || null,
        connections: mention.author_connections || mention.connections || null,
        influenceSource: (mention.author_followers || mention.followers || mention.company_page_followers) ? "followers" : (mention.author_connections || mention.connections) ? "connections" : "engagement_proxy",
      },
      evidenceComments: (linkedinCommentEvidence.get(canonicalUrl(mention.source_url || mention.url)) || []).slice(0, 8),
    })),
    ...(googleNewsRes.data || []).map((item: any, index: number) => ({
      id: item.url || `google-news-${index}`,
      platform: "google",
      parentType: "news",
      title: item.title,
      text: item.snippet,
      author: item.source,
      url: item.url,
      publishedAt: item.published || item.scraped_at,
      fetchedAt: item.scraped_at,
      sentiment: item.sentiment || (item.is_pr_risk ? "negative" : "neutral"),
      engagement: {},
      maxContentAgeHours: hours,
      authorProfile: { name: item.source, influenceSource: "unknown" },
      evidenceComments: [],
    })),
    ...(googleAutocompleteRes.data || []).map((item: any, index: number) => ({
      id: item.id || `google-autocomplete-${index}`,
      platform: "google",
      parentType: "search_suggestion",
      title: item.query_text || "Google autocomplete",
      text: item.suggestion,
      url: item.source_url,
      publishedAt: item.scraped_at,
      fetchedAt: item.scraped_at,
      sentiment: item.sentiment,
      engagement: {},
      maxContentAgeHours: hours,
      authorProfile: { name: "Google autocomplete", influenceSource: "unknown" },
      evidenceComments: [],
    })),
    ...(googleMentionsRes.data || []).map((item: any, index: number) => ({
      id: `google-mention-${index}`,
      platform: "google",
      parentType: "search_result",
      title: "Google mention",
      text: String(item.content_text || "").replace(/^google autocomplete:\s*/i, ""),
      url: item.source_url,
      publishedAt: item.scraped_at,
      fetchedAt: item.scraped_at,
      sentiment: item.sentiment_label || (num(item.sentiment_score) < -0.2 ? "negative" : "neutral"),
      engagement: {},
      maxContentAgeHours: hours,
      authorProfile: { name: "Google", influenceSource: "unknown" },
      evidenceComments: [],
    })),
  ] as RadarInput[];

  const dedupedInputs = Array.from(new Map(inputs.map((item, index) => [radarInputKey(item, index), item])).values());
  const items = dedupedInputs
    .map(buildRadarItem)
    .filter(Boolean)
    .filter((item: any) => item.ageHours !== null && item.ageHours <= hours)
    .sort((a: any, b: any) => b.priorityScore - a.priorityScore) as any[];

  const negativePosts = items.filter((item) => item.riskLane === "main_risk").slice(0, 30);
  const positivePosts = items.filter((item) => item.riskLane === "positive_signal").slice(0, 30);
  const excludedContext = items.filter((item) => item.riskLane === "excluded_context").slice(0, 30);
  const mentionStream = [...items]
    .sort((a: any, b: any) => {
      const bTime = new Date(b.publishedAt || b.fetchedAt || 0).getTime();
      const aTime = new Date(a.publishedAt || a.fetchedAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 50);
  const clusters = buildRadarClusters(items);
  const summary = buildRadarSummary(items);

  return NextResponse.json({
    live: true,
    configured: true,
    windowHours: hours,
    maxWindowHours: MAX_WINDOW_HOURS,
    windowPolicy: "strict_latest_72h_only",
    since,
    generatedAt: new Date().toISOString(),
    contractVersion: "2026-06-reputation-radar-v2-influence-weighted",
    stats: {
      ...summary,
      rawInputs: inputs.length,
      scanned: dedupedInputs.length,
      includedRisk: negativePosts.length,
      positives: positivePosts.length,
      excluded: items.filter((item) => item.riskLane === "excluded_context").length,
    },
    mainRiskPosts: negativePosts,
    negativePosts,
    positiveSignals: positivePosts,
    positivePosts,
    mentionStream,
    excludedContext,
    clusters: clusters.slice(0, 12),
    ownerQueues: Object.entries(buildRadarSummary(items).byOwner)
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count),
    items: items.slice(0, 80),
    sourceCounts: {
      redditPosts: redditPostsRes.data?.length || 0,
      youtubeVideos: youtubeVideosRes.data?.length || 0,
      instagramPosts: instagramPostsRes.data?.length || 0,
      linkedinRows: (linkedinPostsRes.data?.length || 0) + (linkedinMentionsRes.data?.length || 0),
      googleRows: (googleNewsRes.data?.length || 0) + (googleAutocompleteRes.data?.length || 0) + (googleMentionsRes.data?.length || 0),
      playstoreReviews: playstoreInputs(since).length,
    },
    sourceErrors: {
      redditPosts: redditPostsRes.error?.message || null,
      redditComments: redditCommentsRes.error?.message || null,
      youtubeVideos: youtubeVideosRes.error?.message || null,
      youtubeComments: youtubeCommentsRes.error?.message || null,
      instagramPosts: instagramPostsRes.error?.message || null,
      instagramComments: instagramCommentsRes.error?.message || null,
      linkedinPosts: linkedinPostsRes.error?.message || null,
      linkedinMentions: linkedinMentionsRes.error?.message || null,
      googleNews: googleNewsRes.error?.message || null,
      googleAutocomplete: googleAutocompleteRes.error?.message || null,
      googleMentions: googleMentionsRes.error?.message || null,
    },
  });
}
