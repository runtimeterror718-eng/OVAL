import { NextResponse } from "next/server";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { admin, member } = await requireShieldContext("legal");
    const body = await request.json();
    const before = await admin
      .from("enforcement_drafts")
      .select("*")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (before.error) throw before.error;
    if (!before.data)
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (
      ![
        "approved",
        "rejected",
        "draft",
        "pending_legal",
        "changes_requested",
      ].includes(body.status)
    )
      return NextResponse.json(
        { error: "Unsupported draft status" },
        { status: 400 },
      );
    const changes: any = {
      approval_status: body.status,
      body: {
        ...(before.data.body || {}),
        reviewNotes: body.reviewNotes || "",
      },
      version: before.data.version + 1,
    };
    if (body.status === "approved") {
      changes.approved_by = member.id;
      changes.approved_at = new Date().toISOString();
    }
    const updated = await admin
      .from("enforcement_drafts")
      .update(changes)
      .eq("id", params.id)
      .eq("version", body.expectedVersion || before.data.version)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data)
      return NextResponse.json(
        { error: "Draft changed by another reviewer" },
        { status: 409 },
      );
    await audit(
      admin,
      member.brand_id,
      member.id,
      "enforcement_draft",
      params.id,
      `draft_${body.status}`,
      before.data,
      updated.data,
    );
    return NextResponse.json({
      draft: updated.data,
      warning: "Approval does not submit anything externally.",
    });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
