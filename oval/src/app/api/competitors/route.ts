import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ragQuery, isRAGEnabled } from "@/lib/rag";
import { isDemoMode, demoCompetitors } from "@/lib/demo-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  if (data?.length) return data.map((b: any) => b.id);
  return [];
}

const COMPETITORS = ["Allen", "Unacademy", "BYJU", "Aakash", "Vedantu"];

export async function GET() {
  if (isDemoMode()) return NextResponse.json(demoCompetitors);
  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) return NextResponse.json({ live: false });
  const brandId = brandIds[0];

  const [mentionsRes, ragCompetitor] = await Promise.all([
    sb.from("mention_embeddings")
      .select("content_text, platform, cluster_id, sentiment_label, source_url")
      .in("brand_id", brandIds)
      .not("content_text", "is", null)
      .limit(1500),
    // RAG: competitive intelligence
    isRAGEnabled()
      ? ragQuery("How is Physics Wallah compared to Allen, Unacademy, BYJU's, Aakash, Vedantu? What do students say when comparing PW to competitors?", {
          brandId,
          mentionLimit: 20,
          rerank: true,
          rerankTopK: 12,
          systemPrompt: `You are OVAL competitive intelligence analyst.
Analyze how Physics Wallah is compared to each competitor.
For each competitor mentioned in the data:
- How often they're compared to PW
- Is PW seen as better or worse?
- Key comparison point (price, quality, teachers, results)
- A real quote
Also identify: Who is PW's biggest threat based on the data?`,
        })
      : Promise.resolve(null),
  ]);

  const rows = mentionsRes.data || [];
  const totalMentions = rows.length;

  // Track competitor data with LLM-classified sentiment
  const competitorMap = new Map<string, {
    mentions: number;
    sentiments: { positive: number; negative: number; neutral: number };
    quotes: string[];
    platforms: Record<string, number>;
  }>();

  for (const name of COMPETITORS) {
    competitorMap.set(name, { mentions: 0, sentiments: { positive: 0, negative: 0, neutral: 0 }, quotes: [], platforms: {} });
  }

  let competitorMentionCount = 0;

  for (const row of rows) {
    const text = row.content_text || "";
    const lower = text.toLowerCase();
    const platform = row.platform || "unknown";
    const sentiment = row.sentiment_label || "neutral"; // LLM-classified

    for (const name of COMPETITORS) {
      if (lower.includes(name.toLowerCase())) {
        const entry = competitorMap.get(name)!;
        entry.mentions++;
        competitorMentionCount++;

        if (sentiment === "positive" || sentiment === "negative" || sentiment === "neutral") {
          entry.sentiments[sentiment]++;
        }

        if (entry.quotes.length < 5) {
          entry.quotes.push(text.length > 200 ? text.slice(0, 200) + "..." : text);
        }
        entry.platforms[platform] = (entry.platforms[platform] || 0) + 1;
      }
    }
  }

  // Build competitors array
  const competitors = Array.from(competitorMap.entries())
    .filter(([, v]) => v.mentions > 0)
    .map(([name, v]) => {
      const { positive, negative, neutral } = v.sentiments;
      const total = positive + negative + neutral;
      let sentiment: "positive" | "negative" | "neutral" | "mixed" = "neutral";
      if (negative > positive && negative > neutral) sentiment = "negative";
      else if (positive > negative && positive > neutral) sentiment = "positive";
      else if (negative > 0 && positive > 0) sentiment = "mixed";

      return {
        name,
        mentions: v.mentions,
        sentiment,
        sentimentBreakdown: v.sentiments,
        comparison_quotes: v.quotes,
        platforms: v.platforms,
      };
    })
    .sort((a, b) => b.mentions - a.mentions);

  // Negative amplifiers using LLM-classified sentiment, with source URL lookup
  const negCandidates = rows.filter(
    (row: any) => row.sentiment_label === "negative" && (row.content_text || "").length > 30,
  ).slice(0, 20);

  const negativeAmplifiers = await Promise.all(
    negCandidates.map(async (row: any) => {
      const text = row.content_text || "";
      const platform = row.platform || "unknown";
      let sourceUrl = row.source_url || "";

      // Fallback: try to find the URL from the platform-specific table using ilike substring match
      if (!sourceUrl) {
        try {
          // Build a robust probe: strip non-content chars, take the longest distinctive word run
          const stripped = text.replace(/^\[Transcript:\s*/i, "").replace(/[\n\r\t]+/g, " ").trim();
          // Pick a ~40-char distinctive substring from the middle (better than start/end which may be cropped)
          const words = stripped.split(/\s+/).filter((w: string) => w.length > 2);
          const probe = words.slice(0, 8).join(" ").replace(/[%_]/g, " ").replace(/['"`]/g, "").trim();
          const ilikePattern = `%${probe}%`;
          if (probe.length > 10) {
            if (platform === "reddit") {
              const r1 = await sb.from("reddit_comments").select("permalink, post_url, post_id").ilike("comment_body", ilikePattern).limit(1);
              sourceUrl = r1.data?.[0]?.permalink || r1.data?.[0]?.post_url || "";
              if (!sourceUrl && r1.data?.[0]?.post_id) {
                const r1b = await sb.from("reddit_posts").select("post_url").eq("post_id", r1.data[0].post_id).limit(1);
                sourceUrl = r1b.data?.[0]?.post_url || "";
              }
              if (!sourceUrl) {
                const r2 = await sb.from("reddit_posts").select("post_url").or(`post_title.ilike.${ilikePattern},post_body.ilike.${ilikePattern}`).limit(1);
                sourceUrl = r2.data?.[0]?.post_url || "";
              }
            } else if (platform === "instagram") {
              const r1 = await sb.from("instagram_comments").select("post_id").ilike("comment_text", ilikePattern).limit(1);
              const postId = r1.data?.[0]?.post_id;
              if (postId) {
                const r2 = await sb.from("instagram_posts").select("post_url").eq("post_id", postId).limit(1);
                sourceUrl = r2.data?.[0]?.post_url || "";
              }
              if (!sourceUrl) {
                const r3 = await sb.from("instagram_posts").select("post_url").ilike("caption_text", ilikePattern).limit(1);
                sourceUrl = r3.data?.[0]?.post_url || "";
              }
            } else if (platform === "youtube") {
              const r1 = await sb.from("youtube_comments").select("video_id").ilike("comment_text", ilikePattern).limit(1);
              const vid = r1.data?.[0]?.video_id;
              if (vid) sourceUrl = `https://www.youtube.com/watch?v=${vid}`;
              if (!sourceUrl) {
                const r2 = await sb.from("youtube_videos").select("source_url, video_id").or(`video_title.ilike.${ilikePattern},video_description.ilike.${ilikePattern}`).limit(1);
                sourceUrl = r2.data?.[0]?.source_url
                  || (r2.data?.[0]?.video_id ? `https://www.youtube.com/watch?v=${r2.data[0].video_id}` : "");
              }
            } else if (platform === "twitter" || platform === "x") {
              const { data } = await sb.from("twitter_tweets").select("tweet_url, tweet_id, author_handle").ilike("tweet_text", ilikePattern).limit(1);
              sourceUrl = data?.[0]?.tweet_url
                || (data?.[0]?.tweet_id && data?.[0]?.author_handle
                    ? `https://x.com/${data[0].author_handle}/status/${data[0].tweet_id}`
                    : "");
            } else if (platform === "telegram") {
              const { data } = await sb.from("telegram_messages").select("channel_username, message_id").ilike("message_text", ilikePattern).limit(1);
              sourceUrl = (data?.[0]?.channel_username && data?.[0]?.message_id)
                ? `https://t.me/${data[0].channel_username}/${data[0].message_id}`
                : "";
            } else if (platform === "google" || platform === "seo_news") {
              const { data } = await sb.from("google_seo_results").select("organic_url").or(`organic_snippet.ilike.${ilikePattern},organic_title.ilike.${ilikePattern}`).limit(1);
              sourceUrl = data?.[0]?.organic_url || "";
            }
          }
        } catch {
          /* lookup failed — leave sourceUrl empty */
        }
      }

      return {
        text: text.length > 300 ? text.slice(0, 300) + "..." : text,
        platform,
        sentiment: "negative",
        source_url: sourceUrl,
      };
    }),
  );

  // Share of voice
  const shareOfVoice: Record<string, number> = { PW: totalMentions - competitorMentionCount };
  for (const [name, v] of Array.from(competitorMap.entries())) {
    if (v.mentions > 0) shareOfVoice[name] = v.mentions;
  }

  return NextResponse.json({
    live: true,
    competitors,
    negativeAmplifiers,
    shareOfVoice,
    stats: {
      totalMentions,
      competitorMentions: competitorMentionCount,
      sentimentSource: "llm-classified",
    },
    rag: ragCompetitor ? {
      enabled: true,
      analysis: ragCompetitor.answer,
      confidence: ragCompetitor.confidence,
      mentionsUsed: ragCompetitor.metadata.mentionsAfterRerank,
      avgSimilarity: ragCompetitor.metadata.avgSimilarity,
    } : { enabled: false },
  });
}
