import { NextResponse } from "next/server";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { admin, member } = await requireShieldContext("read");
    const params = new URL(request.url).searchParams;
    let query = admin
      .from("threat_cases")
      .select(
        "*,candidate:url_candidates(*),assignments:case_assignments(*),evidence:case_evidence(*)",
      )
      .eq("brand_id", member.brand_id)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (params.get("status")) query = query.eq("status", params.get("status"));
    if (params.get("owner") === "me") query = query.eq("owner_id", member.id);
    else if (params.get("owner") === "unassigned")
      query = query.is("owner_id", null);
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ cases: result.data || [] });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { admin, member } = await requireShieldContext("verify");
    const body = await request.json();
    const candidate = await admin
      .from("url_candidates")
      .select("*,scores:threat_scores(*)")
      .eq("id", body.candidateId)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (candidate.error) throw candidate.error;
    if (!candidate.data)
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    if (!["review", "verified"].includes(candidate.data.candidate_status))
      return NextResponse.json(
        { error: "Candidate must be reviewed before case creation" },
        { status: 409 },
      );
    const latestScore = [...(candidate.data.scores || [])].sort(
      (a: any, b: any) =>
        String(b.scored_at).localeCompare(String(a.scored_at)),
    )[0];
    const created = await admin
      .from("threat_cases")
      .upsert(
        {
          brand_id: member.brand_id,
          candidate_id: candidate.data.id,
          title:
            body.title ||
            candidate.data.suspected_threat_type ||
            "PW threat investigation",
          threat_type:
            body.threatType ||
            candidate.data.suspected_threat_type ||
            "unclassified",
          status: "candidate",
          verification_status:
            candidate.data.candidate_status === "verified"
              ? "verified"
              : "relevant",
          priority_score: latestScore?.priority_score || 0,
          owner_id: body.ownerId || null,
          supporting_team_id: body.teamId || null,
          created_by: member.id,
          enforcement_eligible: candidate.data.candidate_status === "verified",
        },
        { onConflict: "brand_id,candidate_id" },
      )
      .select("*")
      .single();
    if (created.error) throw created.error;
    await admin
      .from("url_candidates")
      .update({
        candidate_status: "case_created",
        version: candidate.data.version + 1,
      })
      .eq("id", candidate.data.id)
      .eq("version", candidate.data.version);
    await audit(
      admin,
      member.brand_id,
      member.id,
      "threat_case",
      created.data.id,
      "created",
      null,
      created.data,
    );
    return NextResponse.json({ case: created.data }, { status: 201 });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
