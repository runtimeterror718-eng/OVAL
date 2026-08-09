import { NextRequest, NextResponse } from "next/server";
import { CrmError, crmErrorResponse, requireCrmContext } from "@/lib/crm-server";
import { isVaultChannel, mapVaultTrack } from "@/lib/vault-server";

function decodeCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.weekStart) || !/^[0-9a-f-]{36}$/i.test(value.id)) throw new Error();
    return value as { weekStart: string; id: string };
  } catch { throw new CrmError("Invalid archive cursor", 400, "invalid_cursor"); }
}

export async function GET(request: NextRequest) {
  try {
    const { member, admin } = await requireCrmContext();
    const channel = request.nextUrl.searchParams.get("channel");
    if (channel && !isVaultChannel(channel)) throw new CrmError("Unknown Vault channel", 400, "invalid_channel");
    const cursor = decodeCursor(request.nextUrl.searchParams.get("cursor"));
    const limit = Math.max(1, Math.min(24, Number(request.nextUrl.searchParams.get("limit") || 12)));
    let query = admin.from("vault_snapshots").select("*, track:vault_tracks(*), evidence:vault_snapshot_evidence(*)").eq("brand_id", member.brand_id).order("week_start", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (channel) query = query.eq("channel", channel);
    if (cursor) query = query.or(`week_start.lt.${cursor.weekStart},and(week_start.eq.${cursor.weekStart},id.lt.${cursor.id})`);
    const result = await query;
    if (result.error) throw new CrmError(result.error.message, result.error.code === "42P01" ? 503 : 500, "archive_read_failed");
    const rows = result.data || [];
    const page = rows.slice(0, limit).map((row: any) => ({ ...row, track: row.track ? mapVaultTrack(row.track) : null, evidence: (row.evidence || []).sort((a: any, b: any) => a.slide_order - b.slide_order) }));
    const last = page[page.length - 1];
    return NextResponse.json({ snapshots: page, nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ weekStart: last.week_start, id: last.id })).toString("base64url") : null });
  } catch (error) { return crmErrorResponse(error); }
}
