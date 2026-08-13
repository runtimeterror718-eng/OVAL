import { NextResponse } from "next/server";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { admin, member } = await requireShieldContext("legal");
    const body = await request.json();
    const found = await admin
      .from("threat_cases")
      .select("*,evidence:case_evidence(id)")
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
        { error: "Only a human-verified case can prepare a complaint" },
        { status: 409 },
      );
    if (!found.data.evidence?.length)
      return NextResponse.json(
        { error: "Generate an evidence pack before preparing a complaint" },
        { status: 409 },
      );
    const draft = await admin
      .from("enforcement_drafts")
      .insert({
        brand_id: member.brand_id,
        case_id: params.id,
        created_by: member.id,
        draft_type: body.draftType || "platform_report",
        recipient: body.destination || "Rights-holder review",
        body: { ...(body.payload || {}), rightsBasis: body.rightsBasis || "" },
        approval_status: "draft",
      })
      .select("*")
      .single();
    if (draft.error) throw draft.error;
    await audit(
      admin,
      member.brand_id,
      member.id,
      "enforcement_draft",
      draft.data.id,
      "prepared",
      null,
      draft.data,
    );
    return NextResponse.json(
      {
        draft: draft.data,
        warning: "Prepared only. OVAL did not submit an external complaint.",
      },
      { status: 201 },
    );
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
