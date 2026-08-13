import { NextResponse } from "next/server";
import { enforcementIdempotencyKey } from "@/lib/gati-server";
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
      .select("*,case:threat_cases(*)")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (draft.error) throw draft.error;
    if (!draft.data)
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    if (draft.data.approval_status !== "approved" || !draft.data.approved_by)
      return NextResponse.json(
        { error: "An approved legal draft is required" },
        { status: 409 },
      );
    if (
      draft.data.case?.verification_status !== "verified" ||
      !draft.data.case?.enforcement_eligible
    )
      return NextResponse.json(
        { error: "The case must be human-verified and enforcement eligible" },
        { status: 409 },
      );
    const evidence = await admin
      .from("case_evidence")
      .select("id,manifest_sha256,evidence_version")
      .eq("case_id", draft.data.case_id)
      .order("evidence_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (evidence.error) throw evidence.error;
    if (!evidence.data)
      return NextResponse.json(
        { error: "Generate an immutable evidence pack before delivery" },
        { status: 409 },
      );
    const route = await admin
      .from("gati_enforcement_routes")
      .select("*")
      .eq("id", body.routeId)
      .eq("case_id", draft.data.case_id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (route.error) throw route.error;
    if (!route.data)
      return NextResponse.json(
        { error: "Select a resolved enforcement route" },
        { status: 404 },
      );
    const key = enforcementIdempotencyKey({
      caseId: draft.data.case_id,
      routeId: route.data.id,
      draftId: draft.data.id,
      draftVersion: draft.data.version,
    });
    const existing = await admin
      .from("gati_enforcement_deliveries")
      .select("*")
      .eq("brand_id", member.brand_id)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data)
      return NextResponse.json({
        delivery: existing.data,
        route: route.data,
        idempotentReplay: true,
        warning:
          "Prepared only. Gati has not contacted the provider or submitted a notice.",
      });
    const saved = await admin
      .from("gati_enforcement_deliveries")
      .insert({
        brand_id: member.brand_id,
        case_id: draft.data.case_id,
        route_id: route.data.id,
        draft_id: draft.data.id,
        idempotency_key: key,
        requested_by: member.id,
        approved_by: draft.data.approved_by,
        delivery_mode: "manual",
        status: "prepared",
        response_snapshot: {
          evidenceId: evidence.data.id,
          manifestSha256: evidence.data.manifest_sha256,
          evidenceVersion: evidence.data.evidence_version,
          destination: route.data.destination_name,
        },
      })
      .select("*")
      .single();
    if (saved.error) throw saved.error;
    await audit(
      admin,
      member.brand_id,
      member.id,
      "gati_enforcement_delivery",
      saved.data.id,
      "prepared_for_human_delivery",
      null,
      { routeId: route.data.id, evidenceId: evidence.data.id },
    );
    return NextResponse.json(
      {
        delivery: saved.data,
        route: route.data,
        warning:
          "Prepared only. Gati has not contacted the provider or submitted a notice.",
      },
      { status: 201 },
    );
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
