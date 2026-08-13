import { NextResponse } from "next/server";
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
      .from("threat_cases")
      .select(
        "*,candidate:url_candidates(*),evidence:case_evidence(*),actions:case_actions(*),assignments:case_assignments(*),drafts:enforcement_drafts(*),reappearances:reappearance_links(*)",
      )
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data
      ? NextResponse.json({ case: result.data })
      : NextResponse.json({ error: "Case not found" }, { status: 404 });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { admin, member, shieldRole } = await requireShieldContext("verify");
    const body = await request.json();
    const before = await admin
      .from("threat_cases")
      .select("*")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (before.error) throw before.error;
    if (!before.data)
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (
      body.status === "legal_review" &&
      !["legal_reviewer", "administrator"].includes(shieldRole)
    )
      return NextResponse.json(
        { error: "Legal reviewer permission required" },
        { status: 403 },
      );
    const changes: any = { version: before.data.version + 1 };
    for (const field of [
      "status",
      "owner_id",
      "supporting_team_id",
      "legal_status",
    ] as const)
      if (body[field] !== undefined) changes[field] = body[field];
    if (body.verification_status !== undefined) {
      changes.verification_status = body.verification_status;
      changes.enforcement_eligible = body.verification_status === "verified";
    }
    const updated = await admin
      .from("threat_cases")
      .update(changes)
      .eq("id", params.id)
      .eq("version", body.expectedVersion || before.data.version)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data)
      return NextResponse.json(
        { error: "Case changed by another user" },
        { status: 409 },
      );
    await admin.from("case_actions").insert({
      brand_id: member.brand_id,
      case_id: params.id,
      actor_id: member.id,
      action_type: "case_updated",
      detail: { reason: body.reason || "", changes },
    });
    await audit(
      admin,
      member.brand_id,
      member.id,
      "threat_case",
      params.id,
      "updated",
      before.data,
      updated.data,
    );
    return NextResponse.json({ case: updated.data });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
