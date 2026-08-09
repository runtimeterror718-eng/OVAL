import { NextResponse } from "next/server";
import { buildCandidateSeeds } from "@/lib/crm-candidates";
import { crmErrorResponse, requireCrmContext } from "@/lib/crm-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { member, admin } = await requireCrmContext();
    const result = await admin.from("issue_candidates").select("*").eq("brand_id", member.brand_id).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return NextResponse.json({ live: true, candidates: result.data || [], currentMember: member });
  } catch (error) { return crmErrorResponse(error); }
}

export async function POST() {
  try {
    const { member, admin } = await requireCrmContext(["admin", "manager"]);
    const seeds = await buildCandidateSeeds();
    if (seeds.length) {
      const result = await admin.from("issue_candidates").upsert(seeds.map((seed) => ({ ...seed, brand_id: member.brand_id })), { onConflict: "brand_id,fingerprint", ignoreDuplicates: true });
      if (result.error) throw result.error;
    }
    const rows = await admin.from("issue_candidates").select("*").eq("brand_id", member.brand_id).eq("status", "proposed").order("created_at", { ascending: false });
    return NextResponse.json({ live: true, generated: seeds.length, candidates: rows.data || [] });
  } catch (error) { return crmErrorResponse(error); }
}
