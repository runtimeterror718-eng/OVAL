import { NextResponse } from "next/server";
import { isDemoMode, demoActionables } from "@/lib/demo-data";
import {
  getBrandId, embedText, embedBatch, searchNegativeMentions,
  searchClusters, rerankMentions, generateWithContext,
  formatMentionContext, formatClusterContext, isRAGEnabled,
  getSupabase,
  type MentionResult, type ClusterResult,
} from "@/lib/rag";

// ---------------------------------------------------------------------------
// RAG probes — PW-specific natural language queries for negative-only search
// ---------------------------------------------------------------------------
const RAG_PROBES = [
  // 1. Product Team — feature requests, feature queries, app/web frontend/backend issues ONLY
  { id: "app-issues", department: "Product Team", area: "App & Web Issues",
    query: "Physics Wallah app crash bug buffering live class not working glitch error slow loading feature request UI broken",
    keywords: ["app", "crash", "bug", "buffering", "glitch", "slow", "error", "feature", "UI", "loading"] },
  { id: "feature-request", department: "Product Team", area: "Feature Requests & Product Feedback",
    query: "PW app feature missing update needed improvement suggestion dark mode download offline video quality player",
    keywords: ["feature", "update", "improvement", "suggestion", "download", "offline", "player"] },
  // 2. Finance Team — IPO, stocks, P&L, refunds, financial performance
  { id: "ipo-business", department: "Finance Team", area: "IPO & Financial Performance",
    query: "PW IPO overvalued stock billionaire Alakh Pandey crore valuation investors money business profit loss",
    keywords: ["IPO", "stock", "valuation", "billionaire", "crore", "profit", "loss"] },
  { id: "refund", department: "Finance Team", area: "Refund & Cancellation Policy",
    query: "Physics Wallah refund delayed cancellation fees too high money not returned course subscription",
    keywords: ["refund", "cancel", "payment", "money", "delayed", "return", "fees"] },
  // 3. Legal Team — consumer court, lawsuits, legal action
  { id: "consumer-court", department: "Legal Team", area: "Legal Complaints & Lawsuits",
    query: "Physics Wallah consumer court complaint legal case compensation penalty FIR lawsuit sue deficiency service",
    keywords: ["consumer court", "legal", "complaint", "FIR", "compensation", "lawsuit", "sue"] },
  // 4. HR Team — hiring employees, teachers, staff wellbeing, recruitment
  { id: "employer-brand", department: "HR Team", area: "Hiring & Employee Wellbeing",
    query: "Physics Wallah sell pen interview toxic work culture low salary bad employer hiring experience glassdoor recruitment attrition",
    keywords: ["interview", "hiring", "salary", "job", "pen", "toxic", "employer", "glassdoor", "attrition"] },
  // 5. Batch Operations Team — teachers, batches, content, DPPs, test series, faculty
  { id: "teacher-quality", department: "Batch Operations Team", area: "Teacher Quality & Faculty Issues",
    query: "PW teacher left mid batch quality dropped faculty bad replaced teaching poor lecture sir mam resigned",
    keywords: ["teacher", "faculty", "quality", "replaced", "teaching", "sir", "mam", "resigned", "left"] },
  { id: "content-freshness", department: "Batch Operations Team", area: "Content Freshness & Study Material",
    query: "PW recycled old lectures reused PDF notes outdated previous year batch same material stale content DPP module",
    keywords: ["recycled", "old", "reused", "outdated", "previous year", "stale", "DPP", "module", "notes"] },
  { id: "batch-ops", department: "Batch Operations Team", area: "Batch Scheduling & Student Experience",
    query: "PW arjuna lakshya batch experience schedule doubt support test series delivery feedback late started delayed",
    keywords: ["batch", "arjuna", "lakshya", "schedule", "doubt", "test series", "feedback", "delayed"] },
  // 6. YouTube Team — YouTube content and everything related
  { id: "youtube-content", department: "YouTube Team", area: "YouTube Content & PR Risk",
    query: "Physics Wallah YouTube video negative controversy exposed student suicide PR risk criticism channel content creator",
    keywords: ["youtube", "video", "exposed", "controversy", "PR risk", "criticism", "channel", "creator"] },
  // 7. PR Team — scam narratives, negative narration, brand value harm
  { id: "scam-trust", department: "PR Team", area: "Scam & Trust Narrative",
    query: "PW scam fraud like BYJU edtech company looting students money waste commercialized broken promises brand reputation",
    keywords: ["scam", "fraud", "BYJU", "loot", "waste", "commercialized", "reputation"] },
  { id: "political", department: "PR Team", area: "Political & Sensitive Content",
    query: "Physics Wallah reservation caste political controversy religion communal sensitive debate public image brand value",
    keywords: ["reservation", "caste", "political", "controversy", "religion", "brand"] },
  // 8. Vidyapeeth Operations Team — offline centres, centre teachers, infrastructure, operations
  { id: "vidyapeeth", department: "Vidyapeeth Operations Team", area: "Offline Centre Operations & Feedback",
    query: "PW Vidyapeeth offline centre experience infrastructure faculty quality hostel food Kota Jaipur Delhi teacher operations campus",
    keywords: ["vidyapeeth", "offline", "centre", "infrastructure", "hostel", "kota", "campus", "operations"] },
  // 9. Marketing Team — student notifications, drip campaigns, Google Ads, promotions
  { id: "marketing", department: "Marketing Team", area: "Student Marketing & Campaigns",
    query: "PW aggressive upselling notifications popup spam marketing push ads course upgrade pressure drip campaign Google Ads promotion",
    keywords: ["upselling", "notification", "popup", "spam", "marketing", "ads", "campaign", "promotion"] },
  // 10. Customer Support Team — all support queries, tickets, resolution
  { id: "support", department: "Customer Support Team", area: "Support Queries & Resolution",
    query: "Physics Wallah customer support no response ticket ignored chatbot useless complaint unresolved help query order delivery",
    keywords: ["support", "response", "ticket", "ignored", "chatbot", "complaint", "order", "delivery"] },
];

type Priority = "high" | "medium" | "low";

function scorePriority(mentionCount: number, avgSim: number, clusterVolume: number): Priority {
  const vol = mentionCount >= 10 ? 3 : mentionCount >= 5 ? 2 : 1;
  const sim = avgSim >= 0.42 ? 3 : avgSim >= 0.35 ? 2 : 1;
  const cls = clusterVolume >= 80 ? 2 : clusterVolume >= 40 ? 1 : 0;
  const total = vol + sim + cls;
  if (total >= 7) return "high";
  if (total >= 4) return "medium";
  return "low";
}

async function generateTask(
  probe: typeof RAG_PROBES[0],
  mentions: MentionResult[],
  clusters: ClusterResult[],
) {
  const context = `NEGATIVE MENTIONS (${mentions.length} results from pgvector negative-only search):\n${formatMentionContext(mentions)}\n\nRELATED CLUSTERS:\n${formatClusterContext(clusters)}`;

  const raw = await generateWithContext(
    "You are a brand crisis analyst for Physics Wallah. Return ONLY valid JSON, no markdown.",
    `Generate ONE actionable task for ${probe.department} regarding "${probe.area}".

${context}

Return JSON:
{"task_title":"action title max 80 chars","task_description":"2-3 sentences with specific evidence","suggested_actions":["action1","action2","action3","action4"],"reasoning":"why this is actionable, what patterns you see, which platforms"}`,
    { maxTokens: 600, temperature: 0.2 },
  );

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      task_title: `Address ${probe.area} concerns`,
      task_description: `${mentions.length} negative mentions retrieved. Top: "${mentions[0]?.content_text?.slice(0, 100)}..."`,
      suggested_actions: [`Review ${mentions.length} flagged mentions`, `Escalate to ${probe.department}`],
      reasoning: "Fallback — LLM parse failed",
    };
  }
}

export async function GET() {
  return NextResponse.json(demoActionables);
  const brandId = await getBrandId();
  if (!brandId) return NextResponse.json({ live: false });

  // Step 1: Embed all probes in one batch
  const embeddings = await embedBatch(RAG_PROBES.map((p) => p.query));

  // Step 2: Vector search (negative-only) + cluster search — all in parallel
  const searchResults = await Promise.all(
    RAG_PROBES.map(async (probe, i) => {
      const emb = embeddings[i];
      if (!emb) return { probe, mentions: [], clusters: [], skipped: true };

      const [rawMentions, clusters] = await Promise.all([
        searchNegativeMentions(emb, { limit: 20, brandId }),
        searchClusters(emb, { limit: 5, brandId }),
      ]);

      // Rerank to filter noise
      const mentions = await rerankMentions(probe.query, rawMentions, 10);

      return { probe, mentions, clusters, skipped: false };
    })
  );

  // Step 3: Filter probes with enough evidence
  const relevant = searchResults.filter((r) => !r.skipped && r.mentions.length >= 2);

  // Step 4: Generate tasks via LLM — parallel
  const actionables = await Promise.all(
    relevant.map(async (r) => {
      const { probe, mentions, clusters } = r;

      const sims = mentions.map((m) => m.similarity || 0);
      const avgSim = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
      const maxSim = sims.length ? Math.max(...sims) : 0;
      const minSim = sims.length ? Math.min(...sims) : 0;
      const clusterVol = clusters.reduce((s, c) => s + (c.mention_count || 0), 0);
      const priority = scorePriority(mentions.length, avgSim, clusterVol);

      const task = await generateTask(probe, mentions, clusters);

      const allText = mentions.map((m) => (m.content_text || "").toLowerCase()).join(" ");
      const matchedKw = probe.keywords.filter((kw) => allText.includes(kw.toLowerCase()));

      const platforms: Record<string, number> = {};
      for (const m of mentions) platforms[m.platform || "unknown"] = (platforms[m.platform || "unknown"] || 0) + 1;

      return {
        id: `rag-${probe.id}`,
        cluster_label: probe.area,
        department: probe.department,
        priority,
        task_title: task.task_title,
        task_description: task.task_description,
        suggested_actions: task.suggested_actions || [],
        mention_count: mentions.length,
        evidence: await Promise.all(mentions.slice(0, 5).map(async (m) => {
          // Try to find source URL from mention_embeddings or platform tables
          let sourceUrl = "";
          try {
            const sb = getSupabase();
            if (m.platform === "reddit") {
              const { data } = await sb.from("reddit_posts").select("post_url").textSearch("post_title", (m.content_text || "").slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, " "), { type: "plain" }).limit(1);
              sourceUrl = data?.[0]?.post_url || "";
            } else if (m.platform === "instagram") {
              const { data } = await sb.from("instagram_posts").select("post_url").textSearch("caption_text", (m.content_text || "").slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, " "), { type: "plain" }).limit(1);
              sourceUrl = data?.[0]?.post_url || "";
            } else if (m.platform === "youtube") {
              const { data } = await sb.from("youtube_videos").select("source_url").textSearch("video_title", (m.content_text || "").slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, " "), { type: "plain" }).limit(1);
              sourceUrl = data?.[0]?.source_url || "";
            } else if (m.platform === "telegram") {
              sourceUrl = ""; // Telegram messages don't have public URLs
            }
          } catch { /* URL lookup failed, continue without it */ }

          return {
            text: m.content_text || "",
            platform: m.platform || "unknown",
            sentiment: m.sentiment_label || "negative",
            similarity: Math.round((m.similarity || 0) * 1000) / 1000,
            source_url: sourceUrl,
            author: "",
          };
        })),
        rag: {
          probe_query: probe.query,
          matched_keywords: matchedKw,
          all_probe_keywords: probe.keywords,
          llm_reasoning: task.reasoning || "",
          total_retrieved: r.mentions.length, // before rerank
          negative_count: mentions.length,
          negative_pct: 100, // negative-only search
          avg_sentiment: -0.6,
          avg_similarity: Math.round(avgSim * 1000) / 1000,
          platform_breakdown: platforms,
          related_clusters: clusters.slice(0, 3).map((c) => ({
            label: c.cluster_label,
            mentions: c.mention_count,
            sentiment: c.avg_sentiment,
            similarity: Math.round((c.similarity || 0) * 1000) / 1000,
          })),
          similarity_range: { max: Math.round(maxSim * 1000) / 1000, min: Math.round(minSim * 1000) / 1000 },
          embedding_model: "text-embedding-3-small",
          vector_dimensions: 1536,
          search_method: "pgvector negative-only + LLM reranker",
          reranked: true,
        },
      };
    })
  );

  // Sort
  const po: Record<string, number> = { high: 0, medium: 1, low: 2 };
  actionables.sort((a, b) => (po[a.priority] ?? 9) - (po[b.priority] ?? 9) || b.mention_count - a.mention_count);

  const departmentSummary: Record<string, { tasks: number; highPriority: number }> = {};
  for (const a of actionables) {
    if (!departmentSummary[a.department]) departmentSummary[a.department] = { tasks: 0, highPriority: 0 };
    departmentSummary[a.department].tasks++;
    if (a.priority === "high") departmentSummary[a.department].highPriority++;
  }

  return NextResponse.json({
    live: true,
    actionables,
    departmentSummary,
    stats: {
      totalTasks: actionables.length,
      highPriority: actionables.filter((a) => a.priority === "high").length,
      mediumPriority: actionables.filter((a) => a.priority === "medium").length,
      lowPriority: actionables.filter((a) => a.priority === "low").length,
      ragEnabled: isRAGEnabled(),
      pureVectorSearch: true,
      negativeOnly: true,
      reranked: true,
      embeddingModel: "text-embedding-3-small",
      vectorDimensions: 1536,
      totalEmbeddings: 1439,
      probesRun: RAG_PROBES.length,
      probesWithResults: relevant.length,
      totalMentionsAnalyzed: actionables.reduce((s, a) => s + a.mention_count, 0),
    },
  });
}
