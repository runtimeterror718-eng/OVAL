import { NextResponse } from "next/server";
import { requireShieldContext, shieldErrorResponse } from "@/lib/shield-server";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, member } = await requireShieldContext("read");
    const result = await admin
      .from("domains")
      .select(
        "*,snapshots:domain_snapshots(*,infrastructure:infrastructure_observations(*)),candidates:url_candidates(*)",
      )
      .eq("id", params.id)
      .eq("brand_id", member.brand_id)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data
      ? NextResponse.json({ domain: result.data })
      : NextResponse.json({ error: "Domain not found" }, { status: 404 });
  } catch (error) {
    return shieldErrorResponse(error);
  }
}
