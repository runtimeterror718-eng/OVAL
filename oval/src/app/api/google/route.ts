import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isDemoMode, demoGoogle } from "@/lib/demo-data";
import { withPwAutocompleteSentiment } from "@/lib/google-autocomplete-sentiment";
import { buildMonthlyTrend, buildTopicClusters } from "@/lib/social-analytics";
import { buildChannelContract, buildSourceStatus, buildSupervisedTopics, fromRuleClusters, summarizeSentiment, type TextSignal } from "@/lib/channel-intelligence";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

export const dynamic = "force-dynamic";

const DEMO_AUTOCOMPLETE_SENTIMENTS = [
  { suggestion: "physics wallah", sentiment: "neutral" },
  { suggestion: "pw vidyapeeth faridabad", sentiment: "neutral" },
  { suggestion: "alakh pandey net worth", sentiment: "warning" },
  { suggestion: "pw complaint status", sentiment: "neutral" },
  { suggestion: "pw refund policy in hindi", sentiment: "neutral" },
  { suggestion: "pw refund form link", sentiment: "neutral" },
  { suggestion: "pw refund policy for offline", sentiment: "neutral" },
  { suggestion: "pw refund customer care number", sentiment: "neutral" },
  { suggestion: "pw refund policy online", sentiment: "neutral" },
  { suggestion: "pw refund policy for books", sentiment: "neutral" },
  { suggestion: "pw refund form", sentiment: "neutral" },
  { suggestion: "pw refund helpline number", sentiment: "neutral" },
  { suggestion: "pw refund policy", sentiment: "neutral" },
  { suggestion: "password scams on facebook", sentiment: "neutral" },
  { suggestion: "physicswallah worth", sentiment: "neutral" },
] as const;

async function getBrandIds(sb: any): Promise<string[]> {
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  if (data?.length) return data.map((b: any) => b.id);
  return [];
}

export async function GET() {
  if (isDemoMode()) return NextResponse.json(demoGoogle);
  const sb = createClient(url, key);
  const brandIds = await getBrandIds(sb);
  if (!brandIds.length) return NextResponse.json({ live: false });

  const [autoRes, newsRes, trendsTimeRes, trendsRegionRes, serpRes, mentionRes] = await Promise.all([
    sb.from("google_autocomplete").select("*").in("brand_id", brandIds).order("scraped_at", { ascending: false }).limit(200),
    sb.from("google_news").select("*").in("brand_id", brandIds).order("scraped_at", { ascending: false }).limit(100),
    sb.from("google_trends").select("keyword, date, interest_value").in("brand_id", brandIds).not("date", "is", null).order("date", { ascending: true }).limit(500),
    sb.from("google_trends").select("keyword, region, region_interest").in("brand_id", brandIds).not("region", "is", null).order("region_interest", { ascending: false }).limit(200),
    sb.from("google_seo_results").select("query_text, organic_title, organic_snippet, organic_url, organic_position").in("brand_id", brandIds).order("organic_position", { ascending: true }).limit(100),
    sb.from("mentions").select("content_text, sentiment_label, sentiment_score, scraped_at, source_url").in("brand_id", brandIds).eq("platform", "google").order("scraped_at", { ascending: false }).limit(300),
  ]);

  const autocomplete = autoRes.data || [];
  const news = newsRes.data || [];
  const trendsTime = trendsTimeRes.data || [];
  const trendsRegion = trendsRegionRes.data || [];
  const serp = serpRes.data || [];
  const freshMentions = mentionRes.data || [];
  const mentionAutocomplete = freshMentions
    .filter((m) => String(m.content_text || "").toLowerCase().startsWith("google autocomplete:"))
    .map((m, index) => {
      const suggestion = String(m.content_text || "").replace(/^google autocomplete:\s*/i, "").trim();
      return withPwAutocompleteSentiment({
        id: `mention-${index}`,
        brand_id: brandIds[0],
        query_text: "fresh Google mention",
        suggestion,
        sentiment: m.sentiment_label || (m.sentiment_score && m.sentiment_score < -0.2 ? "negative" : "neutral"),
        scraped_at: m.scraped_at,
        source: "mentions",
        source_url: m.source_url,
      });
    });

  // Group SERP by query
  const serpByQuery: Record<string, any[]> = {};
  for (const r of serp) {
    if (!serpByQuery[r.query_text]) serpByQuery[r.query_text] = [];
    serpByQuery[r.query_text].push(r);
  }

  // Autocomplete stats
  const demoAutocomplete = DEMO_AUTOCOMPLETE_SENTIMENTS.map((item, index) => ({
    id: `demo-autocomplete-${index}`,
    brand_id: brandIds[0],
    query_text: "physics wallah",
    suggestion: item.suggestion,
    sentiment: item.sentiment,
    scraped_at: new Date().toISOString(),
    source: "demo-override",
  }));
  const scoredAutocomplete = autocomplete.map(withPwAutocompleteSentiment);
  const negSuggestions = scoredAutocomplete.filter(a => a.sentiment === "negative");
  const warnSuggestions = scoredAutocomplete.filter(a => a.sentiment === "warning");
  const uniqueSuggestions = Array.from(new Map([...demoAutocomplete, ...mentionAutocomplete, ...scoredAutocomplete].map(a => [a.suggestion, a])).values());
  const uniqueNegSuggestions = uniqueSuggestions.filter(a => a.sentiment === "negative");
  const uniqueWarnSuggestions = uniqueSuggestions.filter(a => a.sentiment === "warning");
  const freshNegSuggestions = mentionAutocomplete.filter(a => a.sentiment === "negative");
  const freshWarnSuggestions = mentionAutocomplete.filter(a => a.sentiment === "warning");

  // Group trends by date for chart
  const trendsByDate: Record<string, Record<string, number>> = {};
  for (const t of trendsTime) {
    if (!t.date) continue;
    if (!trendsByDate[t.date]) trendsByDate[t.date] = { date: t.date } as any;
    (trendsByDate[t.date] as any)[t.keyword] = t.interest_value;
  }
  const trendsChart = Object.values(trendsByDate).sort((a: any, b: any) => a.date.localeCompare(b.date));

  // Group regions by keyword
  const regionsByKeyword: Record<string, { region: string; interest: number }[]> = {};
  for (const t of trendsRegion) {
    if (!regionsByKeyword[t.keyword]) regionsByKeyword[t.keyword] = [];
    regionsByKeyword[t.keyword].push({ region: t.region, interest: t.region_interest });
  }

  // Unique news
  const uniqueNews = Array.from(new Map(news.map(n => [n.title, n])).values()).slice(0, 30);
  const monthlyTrend = buildMonthlyTrend(uniqueSuggestions, (item) => item.scraped_at, {
    getSentiment: (item) => item.sentiment || (item.triage_is_pr_risk ? "negative" : "neutral"),
  }).map((bucket) => ({
    ...bucket,
    negativeSuggestions: uniqueSuggestions.filter((item) => item.sentiment === "negative" && String(item.scraped_at || "").startsWith(bucket.month)).length,
    warningSuggestions: uniqueSuggestions.filter((item) => item.sentiment === "warning" && String(item.scraped_at || "").startsWith(bucket.month)).length,
  }));
  const newsTrend = buildMonthlyTrend(news, (item) => item.published || item.scraped_at, {
    getSentiment: (item) => item.sentiment || (item.is_pr_risk ? "negative" : "neutral"),
  });
  const clusters = buildTopicClusters([
    ...uniqueSuggestions.map((item) => `${item.query_text || ""} ${item.suggestion || ""}`),
    ...news.map((item) => `${item.title || ""} ${item.snippet || ""}`),
    ...serp.map((item) => `${item.query_text || ""} ${item.organic_title || ""} ${item.organic_snippet || ""}`),
  ]);
  const googleSignals: TextSignal[] = [
    ...uniqueSuggestions.map((item: any, index: number) => ({
      id: item.id || `suggestion-${index}`,
      title: item.query_text || "Google autocomplete",
      text: item.suggestion,
      url: item.source_url,
      sentiment: item.sentiment,
      publishedAt: item.scraped_at,
      fetchedAt: item.scraped_at,
      sourceType: "search_suggestion",
    })),
    ...uniqueNews.map((item: any, index: number) => ({
      id: item.url || `news-${index}`,
      title: item.title,
      text: item.snippet,
      url: item.url,
      sentiment: item.sentiment || (item.is_pr_risk ? "negative" : "neutral"),
      publishedAt: item.published,
      fetchedAt: item.scraped_at,
      sourceType: "news",
    })),
    ...serp.map((item: any, index: number) => ({
      id: item.organic_url || `serp-${index}`,
      title: item.organic_title,
      text: `${item.query_text || ""} ${item.organic_snippet || ""}`,
      url: item.organic_url,
      sentiment: /scam|fraud|complaint|refund|customer care/i.test(`${item.organic_title || ""} ${item.organic_snippet || ""}`) ? "negative" : "neutral",
      sourceType: "serp_result",
    })),
  ];
  const supervisedTopics = buildSupervisedTopics(googleSignals);
  const contract = buildChannelContract({
    channel: "google",
    sourceStatus: buildSourceStatus({
      mode: freshMentions.length ? "hybrid" : "live",
      fetchedAtValues: [
        ...autocomplete.map((item: any) => item.scraped_at),
        ...news.map((item: any) => item.scraped_at),
        ...freshMentions.map((item: any) => item.scraped_at),
      ],
      publishedAtValues: [...news.map((item: any) => item.published), ...freshMentions.map((item: any) => item.scraped_at)],
      limitations: [
        "Fresh Google scraper currently writes generic google mentions; structured autocomplete/news/trends tables may lag.",
        "Autocomplete is intent risk, not sentiment volume; denominator is suggestions, not audience size.",
        "SERP risk depends heavily on result position and should be refreshed frequently.",
      ],
    }),
    signals: googleSignals,
    sentiment: summarizeSentiment(googleSignals, "search-intent-rule", {
      negative: uniqueNegSuggestions.length,
      neutral: Math.max(0, uniqueSuggestions.length - uniqueNegSuggestions.length - uniqueWarnSuggestions.length),
      confidence: 0.62,
    }),
    supervisedTopics,
    unsupervisedClusters: fromRuleClusters(clusters),
    headline: "Google is the enrollment front door: autocomplete and SERP risks shape trust before conversion.",
    whyItMatters: "Parents and students often search before paying; negative suggestions and top results are reputation risks even when social volume is small.",
    recommendedActions: [
      "Write fresh scraper output into structured Google tables, not only generic mentions.",
      "Prioritize negative autocomplete and top-3 SERP risks over broad trend charts.",
      "Track complaint-query movement month over month.",
    ],
  });

  return NextResponse.json({
    live: true,
    contract,
    stats: {
      totalAutocomplete: uniqueSuggestions.length,
      negativeAutocomplete: uniqueNegSuggestions.length,
      warningAutocomplete: uniqueWarnSuggestions.length,
      newsArticles: uniqueNews.length,
      trendsDataPoints: trendsChart.length,
      trendsRegions: Object.keys(regionsByKeyword).length > 0 ? trendsRegion.length : 0,
      serpResults: serp.length,
      serpQueries: Object.keys(serpByQuery).length,
      freshGoogleMentions: freshMentions.length,
      latestGoogleMentionAt: freshMentions[0]?.scraped_at || null,
    },
    autocomplete: uniqueSuggestions.slice(0, 50),
    negativeSuggestions: [...uniqueNegSuggestions, ...uniqueWarnSuggestions, ...freshNegSuggestions, ...freshWarnSuggestions, ...negSuggestions, ...warnSuggestions].slice(0, 20),
    freshMentions: freshMentions.slice(0, 30),
    news: uniqueNews,
    monthlyTrend,
    newsTrend,
    clusters,
    trendsChart,
    trendsRegions: regionsByKeyword,
    trendsKeywords: Array.from(new Set(trendsTime.map(t => t.keyword))),
    serp: serpByQuery,
    serpQueries: Object.keys(serpByQuery),
  });
}
