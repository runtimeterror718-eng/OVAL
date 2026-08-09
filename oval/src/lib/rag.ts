/**
 * RAG (Retrieval Augmented Generation) utility for OVAL dashboard.
 *
 * Pipeline:
 *   1. Embed query with OpenAI text-embedding-3-small (1536d)
 *   2. pgvector HNSW cosine similarity search
 *   3. LLM reranker filters irrelevant results
 *   4. Feed clean context to GPT-4o-mini for grounded generation
 *
 * All functions are server-side only (API routes).
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { isQdrantConfigured, searchQdrantClusters, searchQdrantEvidence } from "@/lib/qdrant-rag";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "";
const openaiKey = process.env.OPENAI_API_KEY || "";

export function getSupabase() {
  return createClient(url, key);
}

export async function getBrandId(): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb.from("brands").select("id").eq("name", "PhysicsWallah");
  return data?.[0]?.id || null;
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

export async function embedText(text: string): Promise<number[] | null> {
  if (!openaiKey) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    const data = await resp.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (!openaiKey || texts.length === 0) return texts.map(() => null);
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
    });
    const data = await resp.json();
    return (data?.data || []).map((d: any) => d.embedding);
  } catch {
    return texts.map(() => null);
  }
}

// ---------------------------------------------------------------------------
// Vector search
// ---------------------------------------------------------------------------

export interface MentionResult {
  id: string;
  mention_id: string;
  content_text: string;
  platform: string;
  cluster_id: number;
  sentiment_label: string;
  sentiment_score: number;
  similarity: number;
}

export interface ClusterResult {
  id: string;
  cluster_id: number;
  cluster_label: string;
  summary: string;
  mention_count: number;
  avg_sentiment: number;
  representative_texts: string[];
  similarity: number;
}

/** Search all mentions by vector similarity */
export async function searchMentions(
  embedding: number[],
  opts: { threshold?: number; limit?: number; brandId?: string } = {},
): Promise<MentionResult[]> {
  const sb = getSupabase();
  const { data } = await sb.rpc("match_mentions_openai", {
    query_embedding: embedding,
    match_threshold: opts.threshold ?? 0.25,
    match_count: opts.limit ?? 15,
    filter_brand_id: opts.brandId ?? null,
  });
  return data || [];
}

/** Search only negative mentions by vector similarity */
export async function searchNegativeMentions(
  embedding: number[],
  opts: { threshold?: number; limit?: number; brandId?: string } = {},
): Promise<MentionResult[]> {
  const sb = getSupabase();
  const { data } = await sb.rpc("match_mentions_negative", {
    query_embedding: embedding,
    match_threshold: opts.threshold ?? 0.25,
    match_count: opts.limit ?? 15,
    filter_brand_id: opts.brandId ?? null,
  });
  return data || [];
}

/** Search mentions filtered by platform and/or sentiment */
export async function searchMentionsByFilter(
  embedding: number[],
  opts: {
    platform?: string;
    sentiment?: string;
    threshold?: number;
    limit?: number;
    brandId?: string;
  } = {},
): Promise<MentionResult[]> {
  const sb = getSupabase();
  const { data } = await sb.rpc("match_mentions_by_platform", {
    query_embedding: embedding,
    filter_platform: opts.platform ?? null,
    filter_sentiment: opts.sentiment ?? null,
    match_threshold: opts.threshold ?? 0.25,
    match_count: opts.limit ?? 15,
    filter_brand_id: opts.brandId ?? null,
  });
  return data || [];
}

/** Search clusters by vector similarity */
export async function searchClusters(
  embedding: number[],
  opts: { limit?: number; brandId?: string } = {},
): Promise<ClusterResult[]> {
  const sb = getSupabase();
  const { data } = await sb.rpc("match_clusters_openai", {
    query_embedding: embedding,
    match_count: opts.limit ?? 5,
    filter_brand_id: opts.brandId ?? null,
  });
  return data || [];
}

// ---------------------------------------------------------------------------
// LLM Reranker — filters irrelevant results after vector search
// ---------------------------------------------------------------------------

export async function rerankMentions(
  query: string,
  mentions: MentionResult[],
  topK: number = 10,
): Promise<MentionResult[]> {
  if (!openaiKey || mentions.length <= topK) return mentions;

  const items = mentions.map((m, i) =>
    `[${i}] [${m.platform}|${m.sentiment_label}] "${(m.content_text || "").slice(0, 200)}"`
  ).join("\n");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "You are a relevance judge. Given a query and candidate mentions, return ONLY the indices of mentions that are DIRECTLY relevant to the query. Return comma-separated indices, nothing else.",
          },
          {
            role: "user",
            content: `Query: "${query}"\n\nCandidate mentions:\n${items}\n\nReturn the indices of the top ${topK} most relevant mentions (comma-separated numbers only):`,
          },
        ],
      }),
    });
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const indices = raw.match(/\d+/g)?.map(Number).filter((i: number) => i < mentions.length) || [];
    if (indices.length === 0) return mentions.slice(0, topK);
    return indices.slice(0, topK).map((i: number) => mentions[i]);
  } catch {
    return mentions.slice(0, topK);
  }
}

// ---------------------------------------------------------------------------
// LLM Generation
// ---------------------------------------------------------------------------

export async function generateWithContext(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!openaiKey) return "No LLM configured. Set OPENAI_API_KEY.";
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: opts.maxTokens ?? 800,
        temperature: opts.temperature ?? 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "LLM call failed.";
  }
}

/** Format mentions into context string for LLM */
export function formatMentionContext(mentions: MentionResult[]): string {
  return mentions
    .map((m, i) => `[${i + 1}] [${m.platform}|${m.sentiment_label}|sim:${m.similarity?.toFixed(3)}] "${(m.content_text || "").slice(0, 250)}"`)
    .join("\n");
}

/** Format clusters into context string for LLM */
export function formatClusterContext(clusters: ClusterResult[]): string {
  return clusters
    .map((c) => `- "${c.cluster_label}" (${c.mention_count} mentions, sentiment: ${c.avg_sentiment}, sim: ${c.similarity?.toFixed(3)})`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Full RAG pipeline — embed → search → rerank → generate
// ---------------------------------------------------------------------------

export interface RAGResult {
  answer: string;
  mentions: MentionResult[];
  clusters: ClusterResult[];
  confidence: number; // 0-1 based on retrieval quality
  metadata: {
    query: string;
    embeddingModel: string;
    mentionsRetrieved: number;
    mentionsAfterRerank: number;
    avgSimilarity: number;
    platforms: Record<string, number>;
    sentimentBreakdown: Record<string, number>;
    retrievalProvider: "qdrant" | "supabase-pgvector";
  };
}

// In-memory cache for RAG results (30 min TTL)
const _ragCache = new Map<string, { result: RAGResult; expiry: number }>();
const RAG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function ragQuery(
  query: string,
  opts: {
    systemPrompt?: string;
    brandId?: string;
    sentiment?: string;
    platform?: string;
    mentionLimit?: number;
    clusterLimit?: number;
    rerank?: boolean;
    rerankTopK?: number;
  } = {},
): Promise<RAGResult | null> {
  // Check cache first
  const cacheKey = `${query}|${opts.brandId}|${opts.sentiment}|${opts.platform}`;
  const cached = _ragCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  const embedding = await embedText(query);
  if (!embedding) return null;

  // Qdrant is the canonical retrieval layer. Supabase pgvector is retained as
  // an outage/bootstrap fallback until the first Qdrant sync is complete.
  const [qdrantMentions, qdrantClusters] = await Promise.all([
    searchQdrantEvidence(embedding, {
      platform: opts.platform,
      sentiment: opts.sentiment,
      limit: opts.mentionLimit ?? 20,
      threshold: 0.25,
    }),
    searchQdrantClusters(embedding, {
      platform: opts.platform,
      limit: opts.clusterLimit ?? 5,
      threshold: 0.2,
    }),
  ]);
  const retrievalProvider: "qdrant" | "supabase-pgvector" = qdrantMentions !== null ? "qdrant" : "supabase-pgvector";
  const [rawMentions, clusters] = await Promise.all([
    qdrantMentions !== null
      ? Promise.resolve(qdrantMentions)
      : opts.platform || opts.sentiment
        ? searchMentionsByFilter(embedding, {
            platform: opts.platform,
            sentiment: opts.sentiment,
            limit: opts.mentionLimit ?? 20,
            brandId: opts.brandId ?? undefined,
          })
        : searchMentions(embedding, {
            limit: opts.mentionLimit ?? 20,
            brandId: opts.brandId ?? undefined,
          }),
    qdrantClusters !== null
      ? Promise.resolve(qdrantClusters)
      : searchClusters(embedding, {
          limit: opts.clusterLimit ?? 5,
          brandId: opts.brandId ?? undefined,
        }),
  ]);

  // Rerank
  const mentions = opts.rerank !== false
    ? await rerankMentions(query, rawMentions, opts.rerankTopK ?? 10)
    : rawMentions;

  if (mentions.length === 0) return null;

  // Stats
  const similarities = mentions.map((m) => m.similarity || 0);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const platforms: Record<string, number> = {};
  const sentiments: Record<string, number> = {};
  for (const m of mentions) {
    platforms[m.platform || "unknown"] = (platforms[m.platform || "unknown"] || 0) + 1;
    sentiments[m.sentiment_label || "unknown"] = (sentiments[m.sentiment_label || "unknown"] || 0) + 1;
  }

  // Confidence = f(count, similarity, sentiment match)
  const countScore = Math.min(mentions.length / 10, 1);
  const simScore = Math.min(avgSimilarity / 0.5, 1);
  const confidence = Math.round((countScore * 0.4 + simScore * 0.6) * 100) / 100;

  // Generate
  const context = `RETRIEVED MENTIONS (${mentions.length}, avg similarity ${avgSimilarity.toFixed(3)}):\n${formatMentionContext(mentions)}\n\nMATCHED CLUSTERS:\n${formatClusterContext(clusters)}`;
  const sysPrompt = opts.systemPrompt || "You are a brand intelligence analyst for OVAL. Answer using ONLY the provided context. Quote real mentions. Be specific with numbers.";
  const answer = await generateWithContext(sysPrompt, `Query: ${query}\n\n${context}\n\nProvide a detailed, evidence-grounded analysis.`);

  const result: RAGResult = {
    answer,
    mentions,
    clusters,
    confidence,
    metadata: {
      query,
      embeddingModel: "text-embedding-3-small",
      mentionsRetrieved: rawMentions.length,
      mentionsAfterRerank: mentions.length,
      avgSimilarity: Math.round(avgSimilarity * 1000) / 1000,
      platforms,
      sentimentBreakdown: sentiments,
      retrievalProvider,
    },
  };

  // Cache the result
  _ragCache.set(cacheKey, { result, expiry: Date.now() + RAG_CACHE_TTL });

  return result;
}

export const isRAGEnabled = () => Boolean(openaiKey && (isQdrantConfigured() || url));
