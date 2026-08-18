import { NextResponse } from "next/server";
import { requireShieldContext, shieldErrorResponse } from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, member } = await requireShieldContext("read");
    const result = await admin
      .from("case_evidence")
      .select("*,case:threat_cases(id,title,status)")
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 },
      );
    const signed: Record<string, string> = {};
    for (const [label, path] of Object.entries(
      result.data.analysis_snapshot?.objects || {},
    )) {
      const value = await admin.storage
        .from("shield-evidence")
        .createSignedUrl(String(path), 300);
      if (value.data?.signedUrl) signed[label] = value.data.signedUrl;
    }
    return NextResponse.json({ evidence: result.data, signedUrls: signed });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
