import { NextResponse } from "next/server";
import { cachedIntelligenceResponse } from "@/lib/intelligence-server-cache";
import semanticArtifact from "@/data/semantic-clusters.json";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const SUPPORTED_PLATFORMS = new Set(["playstore", "linkedin", "youtube", "freshdesk", "reddit", "x", "facebook", "instagram"]);
const DEFAULT_COLLECTION = "oval_channel_mentions_v1";

type SemanticCluster = {
  id: string;
  label: string;
  summary: string;
  why_it_matters?: string;
  count: number;
  share: number;
  confidence?: string;
  cohesion?: number;
  subthemes?: string[];
  sentiment?: { positive?: number; neutral?: number; negative?: number };
  representative_evidence?: Array<Record<string, unknown>>;
  source_ids?: string[];
  rank?: number;
};

type PlatformArtifact = {
  platform: string;
  label?: string;
  source_count: number;
  clustered_source_count?: number;
  cluster_scope?: string;
  sentiment?: { positive?: number; neutral?: number; negative?: number };
  model?: string;
  method?: string;
  clusters: SemanticCluster[];
};

function buildSummary(platform: string, data: PlatformArtifact) {
  const clusters = [...(data.clusters || [])].sort((a, b) => b.count - a.count);
  const primary = clusters[0];
  const secondary = clusters[1];
  const sentiment = data.sentiment || {};
  const total = Math.max(1, data.source_count || 0);
  const negative = Number(sentiment.negative || 0);
  const negativeRate = Math.round((negative / total) * 100);
  const label = data.label || platform;
  const headline = primary
    ? `${primary.label} is the largest actionable ${label} theme.`
    : `${label} evidence is ready for review.`;
  const whatIsHappening = primary
    ? `${primary.summary}${secondary ? ` The next recurring theme is ${secondary.label.toLowerCase()} (${secondary.count} signals).` : ""}`
    : `No stable semantic issue cluster was found in the current ${label} evidence.`;
  return {
    platform,
    headline,
    what_is_happening: whatIsHappening,
    why_it_matters: primary?.why_it_matters || "Review representative evidence before changing product or communication decisions.",
    recommended_action: primary
      ? `Open the ${primary.label.toLowerCase()} cluster, validate its representative evidence, and assign one accountable owner.`
      : "Broaden the evidence window and rerun semantic clustering.",
    key_findings: clusters.slice(0, 3).map((cluster) => `${cluster.label}: ${cluster.count} signals (${cluster.share.toFixed(1)}%)`),
    source_count: data.source_count,
    clustered_source_count: data.clustered_source_count,
    risk_level: negativeRate >= 30 ? "high" : negativeRate >= 15 ? "medium" : "watch",
    sentiment: {
      positive: Number(sentiment.positive || 0),
      neutral: Number(sentiment.neutral || 0),
      negative,
      negative_rate: negativeRate,
    },
    confidence_note: `Counts are deterministic. Meaning is derived from ${data.method || "normalized sentence embeddings"}; open the source evidence before acting.`,
  };
}

function localResponse(platform: string, code?: string) {
  const platforms = (semanticArtifact as unknown as { generated_at: string; platforms: Record<string, PlatformArtifact> }).platforms;
  const data = platforms?.[platform];
  if (!data) {
    return NextResponse.json({ live: false, code: code || "semantic_artifact_missing" }, { status: 404 });
  }
  const clusters = [...data.clusters].sort((a, b) => b.count - a.count);
  return NextResponse.json({
    live: true,
    provider: "semantic-local",
    fallback_reason: code,
    generated_at: (semanticArtifact as unknown as { generated_at: string }).generated_at,
    model: data.model,
    method: data.method,
    cluster_scope: data.cluster_scope,
    clusters,
    summary: buildSummary(platform, data),
  });
}

export async function GET(request: Request) {
  const platform = new URL(request.url).searchParams.get("platform")?.toLowerCase() || "";
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return NextResponse.json({ live: false, error: "Unsupported platform" }, { status: 400 });
  }

  return cachedIntelligenceResponse(`vector-summary:${platform}`, async () => {

  const baseUrl = String(process.env.QDRANT_URL || process.env.SECRET_QDRANT_URL || "").replace(/\/$/, "");
  const apiKey = process.env.QDRANT_API_KEY || process.env.SECRET_QDRANT_API_KEY || "";
  const collection = process.env.QDRANT_COLLECTION || DEFAULT_COLLECTION;
  if (!baseUrl || !apiKey) return localResponse(platform, "qdrant_not_configured");

  try {
    const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: "POST",
      cache: "no-store",
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        filter: {
          must: [
            { key: "document_type", match: { value: "semantic_cluster" } },
            { key: "platform", match: { value: platform } },
          ],
        },
        limit: 20,
        with_payload: true,
        with_vector: false,
      }),
    });
    if (!response.ok) return localResponse(platform, "qdrant_unavailable");
    const json = await response.json();
    const payloads = (json?.result?.points || []).map((point: any) => point?.payload).filter(Boolean);
    if (!payloads.length) return localResponse(platform, "semantic_clusters_not_indexed");
    const latestGeneratedAt = payloads.map((item: any) => String(item.generated_at || "")).sort().at(-1);
    const current = payloads.filter((item: any) => String(item.generated_at || "") === latestGeneratedAt);
    const localData = (semanticArtifact as unknown as { platforms: Record<string, PlatformArtifact> }).platforms[platform];
    const localClusters = new Map((localData?.clusters || []).map((cluster) => [cluster.id, cluster]));
    const clusters = current.map((item: any) => {
      const { document_type: _documentType, brand_id: _brandId, platform: _platform, generated_at: _generatedAt, source_count: _sourceCount, cluster_method: _clusterMethod, ...cluster } = item;
      const localCluster = localClusters.get(cluster.id);
      return { ...cluster, source_ids: cluster.source_ids || localCluster?.source_ids || [] } as SemanticCluster;
    }).sort((a: SemanticCluster, b: SemanticCluster) => b.count - a.count);
    const data: PlatformArtifact = {
      ...localData,
      source_count: Number(current[0]?.source_count || localData.source_count),
      method: String(current[0]?.cluster_method || localData.method || "normalized sentence embeddings"),
      clusters,
    };
    return NextResponse.json({
      live: true,
      provider: "qdrant",
      generated_at: latestGeneratedAt,
      model: data.model,
      method: data.method,
      cluster_scope: data.cluster_scope,
      clusters,
      summary: buildSummary(platform, data),
    });
  } catch {
    return localResponse(platform, "qdrant_unavailable");
  }
  });
}
