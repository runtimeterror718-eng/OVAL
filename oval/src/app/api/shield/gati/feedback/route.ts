import { NextResponse } from "next/server";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

const LABELS = new Set([
  "verified_threat",
  "false_positive",
  "legitimate_resale",
  "security_research",
  "criticism",
  "official_partner",
  "already_removed",
  "insufficient_evidence",
]);

export async function POST(request: Request) {
  try {
    const { admin, member } = await requireShieldContext("verify");
    const body = await request.json();
    if (!LABELS.has(body.label) || !String(body.reason || "").trim())
      return NextResponse.json(
        { error: "A supported label and reason are required" },
        { status: 400 },
      );
    const candidate = await admin
      .from("url_candidates")
      .select("id,candidate_status,version")
      .eq("id", body.candidateId)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (candidate.error) throw candidate.error;
    if (!candidate.data)
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    const inserted = await admin
      .from("gati_feedback_labels")
      .insert({
        brand_id: member.brand_id,
        candidate_id: body.candidateId,
        qualification_id: body.qualificationId || null,
        label: body.label,
        threat_type: body.threatType || null,
        reason: String(body.reason).trim(),
        labelled_by: member.id,
      })
      .select("*")
      .single();
    if (inserted.error) throw inserted.error;
    const status =
      body.label === "verified_threat"
        ? "verified"
        : body.label === "false_positive"
          ? "false_positive"
          : ["legitimate_resale", "security_research", "criticism", "official_partner"].includes(body.label)
            ? "irrelevant"
            : "review";
    await admin
      .from("url_candidates")
      .update({ candidate_status: status, version: candidate.data.version + 1 })
      .eq("id", body.candidateId)
      .eq("version", body.expectedVersion || candidate.data.version);
    await audit(
      admin,
      member.brand_id,
      member.id,
      "url_candidate",
      body.candidateId,
      "gati_feedback_recorded",
      null,
      inserted.data,
    );
    return NextResponse.json({ feedback: inserted.data, candidateStatus: status });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
