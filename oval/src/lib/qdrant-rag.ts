import "server-only";

const baseUrl = String(process.env.QDRANT_URL || process.env.SECRET_QDRANT_URL || "").replace(/\/$/, "");
const apiKey = process.env.QDRANT_API_KEY || process.env.SECRET_QDRANT_API_KEY || "";
const collection = process.env.QDRANT_COLLECTION || "oval_channel_mentions_v1";
const brandId = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f";

type QueryOptions = {
  platform?: string;
  sentiment?: string;
  limit?: number;
  threshold?: number;
};

type QdrantPoint = {
  id: string | number;
  score?: number;
  payload?: Record<string, any>;
};

function condition(key: string, value: string) {
  return { key, match: { value } };
}

async function queryPoints(embedding: number[], documentType: "channel_evidence" | "semantic_cluster", opts: QueryOptions) {
  if (!baseUrl || !apiKey) return null;
  const must = [condition("document_type", documentType), condition("brand_id", brandId)];
  if (opts.platform) must.push(condition("platform", opts.platform));
  if (opts.sentiment && documentType === "channel_evidence") must.push(condition("sentiment_label", opts.sentiment));
  try {
    const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}/points/query`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        query: embedding,
        filter: { must },
        limit: opts.limit || 20,
        score_threshold: opts.threshold ?? 0.25,
        with_payload: true,
        with_vector: false,
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.result?.points || []) as QdrantPoint[];
  } catch {
    return null;
  }
}

export function isQdrantConfigured() {
  return Boolean(baseUrl && apiKey);
}

export async function searchQdrantEvidence(embedding: number[], opts: QueryOptions = {}) {
  const points = await queryPoints(embedding, "channel_evidence", opts);
  if (points === null) return null;
  return points.map((point) => {
    const payload = point.payload || {};
    return {
      id: String(point.id),
      mention_id: String(payload.platform_ref_id || point.id),
      content_text: String(payload.content_text || ""),
      platform: String(payload.platform || "unknown"),
      cluster_id: Number(payload.cluster_id || 0),
      sentiment_label: String(payload.sentiment_label || "neutral"),
      sentiment_score: Number(payload.sentiment_score || 0),
      similarity: Number(point.score || 0),
      source_url: payload.source_url ? String(payload.source_url) : undefined,
      author_handle: payload.author_handle ? String(payload.author_handle) : undefined,
      issue_type: payload.issue_type ? String(payload.issue_type) : undefined,
      severity: payload.severity ? String(payload.severity) : undefined,
    };
  });
}

export async function searchQdrantClusters(embedding: number[], opts: QueryOptions = {}) {
  const points = await queryPoints(embedding, "semantic_cluster", opts);
  if (points === null) return null;
  return points.map((point) => {
    const payload = point.payload || {};
    return {
      id: String(point.id),
      cluster_id: Number(payload.rank || 0),
      cluster_label: String(payload.label || "Semantic cluster"),
      summary: String(payload.summary || ""),
      mention_count: Number(payload.count || 0),
      avg_sentiment: Number(payload.sentiment?.negative || 0) > Number(payload.sentiment?.positive || 0) ? -0.6 : 0,
      representative_texts: (payload.representative_evidence || []).map((item: any) => String(item?.text || "")).filter(Boolean),
      similarity: Number(point.score || 0),
      why_it_matters: payload.why_it_matters ? String(payload.why_it_matters) : undefined,
      platform: payload.platform ? String(payload.platform) : undefined,
    };
  });
}
