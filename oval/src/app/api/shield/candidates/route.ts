import { NextResponse } from "next/server";
import { requireShieldContext, shieldErrorResponse } from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { admin, member } = await requireShieldContext("read");
    const params = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(Number(params.get("limit") || 50), 1), 100);
    let query = admin
      .from("url_candidates")
      .select(
        "*,domain:domains(*),scores:threat_scores(*),cases:threat_cases(*)",
      )
      .eq("brand_id", member.brand_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (params.get("status"))
      query = query.eq("candidate_status", params.get("status"));
    if (params.get("threatType"))
      query = query.eq("suspected_threat_type", params.get("threatType"));
    if (params.get("cursor"))
      query = query.lt("created_at", params.get("cursor"));
    const result = await query;
    if (result.error) throw result.error;
    const rows = result.data || [];
    return NextResponse.json({
      candidates: rows,
      nextCursor:
        rows.length === limit ? rows[rows.length - 1].created_at : null,
    });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
