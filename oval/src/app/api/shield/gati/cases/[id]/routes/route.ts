import { NextResponse } from "next/server";
import { resolveGatiEnforcementRoutes } from "@/lib/gati-server";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, member } = await requireShieldContext("read");
    const result = await admin
      .from("gati_enforcement_routes")
      .select("*")
      .eq("case_id", params.id)
      .eq("brand_id", member.brand_id)
      .order("priority", { ascending: false });
    if (result.error) throw result.error;
    return NextResponse.json({ routes: result.data || [] });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, member } = await requireShieldContext("legal");
    const found = await admin
      .from("threat_cases")
      .select(
        "*,candidate:url_candidates(*,domain:domains(*,snapshots:domain_snapshots(*,infrastructure:infrastructure_observations(*))),results:crawl_results(download_links))",
      )
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (found.error) throw found.error;
    if (!found.data)
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (
      found.data.verification_status !== "verified" ||
      !found.data.enforcement_eligible
    )
      return NextResponse.json(
        { error: "Human verification is required before resolving enforcement routes" },
        { status: 409 },
      );
    const candidate = found.data.candidate;
    const snapshot = [...(candidate?.domain?.snapshots || [])].sort((a, b) =>
      String(b.captured_at).localeCompare(String(a.captured_at)),
    )[0];
    const infrastructure = snapshot?.infrastructure?.[0];
    const capture = [...(candidate?.results || [])][0];
    const proposed = resolveGatiEnforcementRoutes({
      sourceUrl: candidate?.canonical_url || "",
      threatType: found.data.threat_type,
      registrar: snapshot?.registrar,
      registrarAbuseContact: snapshot?.abuse_contact,
      hostingProvider: infrastructure?.likely_hosting_provider,
      cloudflareRelationship: snapshot?.cloudflare_relationship,
      downloadLinks: capture?.download_links || [],
    });
    const rows = proposed.map((route) => ({
      brand_id: member.brand_id,
      case_id: params.id,
      ...route,
      status: "proposed",
    }));
    const inserted = await admin
      .from("gati_enforcement_routes")
      .upsert(rows, { onConflict: "case_id,destination_type,destination_name" })
      .select("*");
    if (inserted.error) throw inserted.error;
    await audit(
      admin,
      member.brand_id,
      member.id,
      "threat_case",
      params.id,
      "enforcement_routes_resolved",
      null,
      { routeCount: inserted.data?.length || 0 },
    );
    return NextResponse.json({
      routes: inserted.data || [],
      warning: "Routes were prepared only; Gati did not contact any provider.",
    });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
