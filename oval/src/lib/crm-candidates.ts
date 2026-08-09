import "server-only";

import { createHash } from "crypto";
import semanticClusters from "@/data/semantic-clusters.json";
import type { IssueSeverity } from "@/lib/crm-types";

type Cluster = Record<string, any>;

async function qdrantClusters() {
  const baseUrl = String(process.env.QDRANT_URL || process.env.SECRET_QDRANT_URL || "").replace(/\/$/, "");
  const apiKey = process.env.QDRANT_API_KEY || process.env.SECRET_QDRANT_API_KEY || "";
  const collection = process.env.QDRANT_COLLECTION || "oval_channel_mentions_v1";
  if (!baseUrl || !apiKey) return null;
  try {
    const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}/points/scroll`, {
      method: "POST",
      cache: "no-store",
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        filter: { must: [{ key: "document_type", match: { value: "semantic_cluster" } }] },
        limit: 250,
        with_payload: true,
        with_vector: true,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return (payload?.result?.points || []).map((point: any) => ({ id: String(point.id), vector: Array.isArray(point.vector) ? point.vector : null, ...(point.payload || {}) })) as Cluster[];
  } catch {
    return null;
  }
}

function localClusters() {
  const platforms = (semanticClusters as any).platforms || {};
  return Object.values(platforms).flatMap((platform: any) => (platform.clusters || []).map((cluster: any) => ({ ...cluster, platform: platform.platform }))) as Cluster[];
}

function severityFor(cluster: Cluster): IssueSeverity {
  const negative = Number(cluster.sentiment?.negative || 0);
  const count = Number(cluster.count || 0);
  const share = count ? negative / count : 0;
  if (negative >= 30 || (negative >= 12 && share >= 0.65)) return "critical";
  if (negative >= 12 || (negative >= 5 && share >= 0.5)) return "high";
  if (negative >= 4) return "medium";
  return "low";
}

export async function buildCandidateSeeds() {
  const clusters = ((await qdrantClusters()) || localClusters()).filter((cluster) => Number(cluster.sentiment?.negative || 0) >= 2);
  const parents = clusters.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const join = (left: number, right: number) => { const a = find(left); const b = find(right); if (a !== b) parents[b] = a; };
  const normalizedLabel = (cluster: Cluster) => String(cluster.label || "Unclassified issue").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const cosine = (a: number[], b: number[]) => {
    if (!a.length || a.length !== b.length) return 0;
    let dot = 0; let aa = 0; let bb = 0;
    for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  };
  for (let left = 0; left < clusters.length; left += 1) {
    for (let right = left + 1; right < clusters.length; right += 1) {
      if (normalizedLabel(clusters[left]) === normalizedLabel(clusters[right])) join(left, right);
      else if (clusters[left].platform !== clusters[right].platform && Array.isArray(clusters[left].vector) && Array.isArray(clusters[right].vector) && cosine(clusters[left].vector, clusters[right].vector) >= 0.78) join(left, right);
    }
  }
  const groups = new Map<string, Cluster[]>();
  for (let index = 0; index < clusters.length; index += 1) {
    const cluster = clusters[index];
    const key = String(find(index));
    groups.set(key, [...(groups.get(key) || []), cluster]);
  }
  return Array.from(groups.values()).map((items: Cluster[]) => {
    const ids = items.map((item: Cluster) => String(item.id)).sort();
    const evidence = items.flatMap((item: Cluster) => (item.representative_evidence || []).map((evidence: any) => ({ ...evidence, platform: item.platform }))).slice(0, 20);
    const severity = items.map(severityFor).sort((a: IssueSeverity, b: IssueSeverity) => ["critical", "high", "medium", "low"].indexOf(a) - ["critical", "high", "medium", "low"].indexOf(b))[0] || "low";
    return {
      fingerprint: createHash("sha256").update(ids.join("|")).digest("hex"),
      title: String(items[0]?.label || "Unclassified issue"),
      summary: String(items[0]?.summary || "Repeated issue detected in connected channel evidence."),
      severity,
      source_cluster_ids: ids,
      source_platforms: Array.from(new Set(items.map((item: Cluster) => String(item.platform || "unknown")))),
      evidence_snapshot: evidence,
      qdrant_payload: { similarity_threshold: 0.78, clusters: items.map((item: Cluster) => ({ id: item.id, label: item.label, platform: item.platform, count: item.count, sentiment: item.sentiment })) },
    };
  });
}
