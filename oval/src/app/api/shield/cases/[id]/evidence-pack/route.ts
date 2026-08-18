import { NextResponse } from "next/server";
import { evidenceManifest } from "@/lib/shield-discovery";
import {
  audit,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, member } = await requireShieldContext("export");
    const found = await admin
      .from("threat_cases")
      .select(
        "*,candidate:url_candidates(*,results:crawl_results(*),domain:domains(*,snapshots:domain_snapshots(*)))",
      )
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (found.error) throw found.error;
    if (!found.data)
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    const candidate = found.data.candidate;
    const latest = [...(candidate?.results || [])].sort(
      (a: any, b: any) => Number(b.capture_version) - Number(a.capture_version),
    )[0];
    if (!latest)
      return NextResponse.json(
        { error: "A completed evidence capture is required" },
        { status: 409 },
      );
    const snapshot = {
      case: {
        id: found.data.id,
        title: found.data.title,
        verificationStatus: found.data.verification_status,
      },
      candidate: { id: candidate.id, exactUrl: candidate.canonical_url },
      capture: latest,
      domain: candidate.domain,
    };
    const manifest = evidenceManifest(snapshot);
    const prefix = String(latest.sanitised_html_object_path || "").replace(
      /\/page\.html$/,
      "",
    );
    const evidence = await admin
      .from("case_evidence")
      .upsert(
        {
          brand_id: member.brand_id,
          case_id: found.data.id,
          crawl_result_id: latest.id,
          evidence_version: latest.capture_version,
          original_url: candidate.original_url,
          canonical_url: candidate.canonical_url,
          object_prefix: prefix,
          manifest_sha256: manifest.sha256,
          discovery_snapshot: candidate.source_context || {},
          infrastructure_snapshot: candidate.domain || {},
          analysis_snapshot: {
            ...snapshot,
            objects: {
              html: latest.sanitised_html_object_path,
              screenshot: latest.screenshot_object_path,
            },
          },
          immutable_after_submission: false,
          captured_at: latest.captured_at,
        },
        { onConflict: "case_id,evidence_version" },
      )
      .select("*")
      .single();
    if (evidence.error) throw evidence.error;
    await audit(
      admin,
      member.brand_id,
      member.id,
      "case_evidence",
      evidence.data.id,
      "pack_generated",
      null,
      { manifestHash: manifest.sha256 },
    );
    return NextResponse.json({ evidence: evidence.data }, { status: 201 });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
