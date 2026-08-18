import { NextRequest, NextResponse } from "next/server";
import { crmErrorResponse, requireCrmContext } from "@/lib/crm-server";
import { buildLiveVaultMood } from "@/lib/vault-server";
import { VAULT_CHANNELS } from "@/lib/vault-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { member, admin } = await requireCrmContext();
    const results = await Promise.allSettled(VAULT_CHANNELS.map((channel) => buildLiveVaultMood({ request, channel, brandId: member.brand_id, admin })));
    const moods = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failures = results.flatMap((result, index) => result.status === "rejected" ? [{ channel: VAULT_CHANNELS[index], error: result.reason instanceof Error ? result.reason.message : "Unavailable" }] : []);
    return NextResponse.json({ live: true, moods, failures, currentMember: { id: member.id, role: member.role } });
  } catch (error) {
    return crmErrorResponse(error);
  }
}
