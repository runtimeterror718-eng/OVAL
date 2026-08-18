import "server-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const baseUrl = String(process.env.QDRANT_URL || process.env.SECRET_QDRANT_URL || "").replace(/\/$/, "");
const apiKey = process.env.QDRANT_API_KEY || process.env.SECRET_QDRANT_API_KEY || "";
const collection = process.env.QDRANT_COLLECTION || "oval_channel_mentions_v1";

async function count(documentType: string) {
  const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}/points/count`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ exact: true, filter: { must: [{ key: "document_type", match: { value: documentType } }] } }),
  });
  if (!response.ok) return 0;
  const json = await response.json();
  return Number(json?.result?.count || 0);
}

export async function GET() {
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ live: false, configured: false, collection, reason: "qdrant_credentials_missing" }, { status: 503 });
  }
  try {
    const response = await fetch(`${baseUrl}/collections/${encodeURIComponent(collection)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "api-key": apiKey },
    });
    if (!response.ok) {
      return NextResponse.json({ live: false, configured: true, collection, reason: response.status === 404 ? "collection_not_synced" : `qdrant_${response.status}` }, { status: 503 });
    }
    const json = await response.json();
    const [evidence, clusters, summaries] = await Promise.all([
      count("channel_evidence"),
      count("semantic_cluster"),
      count("channel_summary"),
    ]);
    return NextResponse.json({
      live: true,
      configured: true,
      collection,
      status: json?.result?.status,
      vectors: Number(json?.result?.vectors_count || json?.result?.points_count || 0),
      counts: { evidence, semanticClusters: clusters, channelSummaries: summaries },
    });
  } catch {
    return NextResponse.json({ live: false, configured: true, collection, reason: "qdrant_unavailable" }, { status: 503 });
  }
}
