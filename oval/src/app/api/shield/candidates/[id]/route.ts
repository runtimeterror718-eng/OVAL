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
      .from("url_candidates")
      .select(
        "*,domain:domains(*),events:discovery_events(*),crawl_jobs(*),crawl_results(*),scores:threat_scores(*),matches:content_matches(*),cases:threat_cases(*)",
      )
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data
      ? NextResponse.json({ candidate: result.data })
      : NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { admin, member } = await requireShieldContext("verify");
    const body = await request.json();
    const allowed: Record<string, string> = {
      relevant: "review",
      irrelevant: "irrelevant",
      false_positive: "false_positive",
      verified: "verified",
    };
    if (!allowed[body.decision])
      return NextResponse.json(
        { error: "Unsupported decision" },
        { status: 400 },
      );
    const before = await admin
      .from("url_candidates")
      .select("*")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (before.error) throw before.error;
    if (!before.data)
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    const updated = await admin
      .from("url_candidates")
      .update({
        candidate_status: allowed[body.decision],
        version: before.data.version + 1,
      })
      .eq("id", params.id)
      .eq("version", body.expectedVersion || before.data.version)
      .select("*")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data)
      return NextResponse.json(
        { error: "Candidate changed by another user" },
        { status: 409 },
      );
    await audit(
      admin,
      member.brand_id,
      member.id,
      "url_candidate",
      params.id,
      body.decision,
      before.data,
      updated.data,
    );
    return NextResponse.json({ candidate: updated.data });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
