import { NextResponse } from "next/server";
import {
  migrationMissing,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const { admin, member } = await requireShieldContext("read");
    const brandId = member.brand_id;
    const [
      qualifications,
      campaigns,
      entities,
      links,
      artifacts,
      workers,
      routes,
      deliveries,
    ] = await Promise.all([
      admin
        .from("gati_qualification_results")
        .select(
          "*,candidate:url_candidates(id,canonical_url,candidate_status,suspected_threat_type,created_at,events:discovery_events(title,excerpt,discovered_at))",
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(250),
      admin
        .from("gati_campaigns")
        .select("*,members:gati_campaign_members(id,candidate_id,match_score)")
        .eq("brand_id", brandId)
        .order("risk_score", { ascending: false })
        .limit(100),
      admin
        .from("gati_entities")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId),
      admin
        .from("gati_entity_links")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId),
      admin
        .from("gati_artifact_analyses")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId),
      admin
        .from("gati_worker_heartbeats")
        .select("*")
        .or(`brand_id.eq.${brandId},brand_id.is.null`)
        .order("last_seen_at", { ascending: false }),
      admin
        .from("gati_enforcement_routes")
        .select("id,status")
        .eq("brand_id", brandId),
      admin
        .from("gati_enforcement_deliveries")
        .select("id,status")
        .eq("brand_id", brandId),
    ]);
    const error = [
      qualifications,
      campaigns,
      entities,
      links,
      artifacts,
      workers,
      routes,
      deliveries,
    ].find((result) => result.error)?.error;
    if (error) throw error;

    const latestByCandidate = new Map<string, any>();
    for (const row of qualifications.data || [])
      if (!latestByCandidate.has(row.candidate_id))
        latestByCandidate.set(row.candidate_id, row);
    const latest = Array.from(latestByCandidate.values());
    const countVerdict = (verdict: string) =>
      latest.filter((item) => item.verdict === verdict).length;

    return NextResponse.json(
      {
        engine: {
          name: "Gati",
          product: "OVAL Shield",
          modelVersion: "gati-qualification-v1",
          graphVersion: "gati-graph-v1",
          enforcementMode: "human_approval_only",
        },
        metrics: {
          analysed: latest.length,
          highPriority: countVerdict("high_priority_review"),
          analystReview: countVerdict("analyst_review"),
          monitor: countVerdict("monitor"),
          benign: countVerdict("benign_reference"),
          discarded: countVerdict("discard"),
          activeCampaigns: (campaigns.data || []).filter(
            (item) => item.status === "active",
          ).length,
          entities: entities.count || 0,
          relationships: links.count || 0,
          artifacts: artifacts.count || 0,
          proposedRoutes: (routes.data || []).filter(
            (item) => item.status === "proposed",
          ).length,
          deliveries: (deliveries.data || []).length,
        },
        qualifications: latest,
        campaigns: campaigns.data || [],
        workers: workers.data || [],
        warnings: [
          "Gati classifications are investigation signals, not legal determinations.",
          "External enforcement remains disabled until a verified case, evidence pack and legal approval exist.",
        ],
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (migrationMissing(error))
      return NextResponse.json(
        { error: "Apply the Gati v1 migration" },
        { status: 503 },
      );
    return shieldErrorResponse(error);
  }
}
