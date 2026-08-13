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
    const draft = await admin
      .from("enforcement_drafts")
      .select("*")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (draft.error) throw draft.error;
    if (!draft.data)
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.data.approval_status !== "approved")
      return NextResponse.json(
        { error: "Legal approval is required before recording a submission" },
        { status: 409 },
      );
    const result = await admin
      .from("enforcement_submissions")
      .insert({
        brand_id: member.brand_id,
        draft_id: params.id,
        case_id: draft.data.case_id,
        external_destination: draft.data.recipient,
        external_reference: body.externalReference || null,
        status: "recorded_manual_submission",
        submitted_by: member.id,
        submitted_at: body.submittedAt || new Date().toISOString(),
        provider_response: body.responseSnapshot || {},
      })
      .select("*")
      .single();
    if (result.error) throw result.error;
    await admin
      .from("case_evidence")
      .update({ immutable_after_submission: true })
      .eq("case_id", draft.data.case_id);
    await audit(
      admin,
      member.brand_id,
      member.id,
      "enforcement_submission",
      result.data.id,
      "manual_submission_recorded",
      null,
      result.data,
    );
    return NextResponse.json(
      {
        submission: result.data,
        warning:
          "This records a human submission; OVAL did not contact the destination.",
      },
      { status: 201 },
    );
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
