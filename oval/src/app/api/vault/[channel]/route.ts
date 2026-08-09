import { NextRequest, NextResponse } from "next/server";
import { crmErrorResponse, requireCrmContext } from "@/lib/crm-server";
import { CrmError } from "@/lib/crm-server";
import { buildLiveVaultMood, isVaultChannel, mapVaultTrack } from "@/lib/vault-server";
import type { VaultMood } from "@/lib/vault-types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { channel: string } }) {
  try {
    if (!isVaultChannel(params.channel)) return NextResponse.json({ error: "Unknown Vault channel" }, { status: 404 });
    const { member, admin } = await requireCrmContext();
    const archiveId = request.nextUrl.searchParams.get("archive");
    if (archiveId) {
      if (!/^[0-9a-f-]{36}$/i.test(archiveId)) throw new CrmError("Invalid archive snapshot", 400, "invalid_snapshot");
      const result = await admin.from("vault_snapshots").select("*, track:vault_tracks(*), evidence:vault_snapshot_evidence(*)").eq("id", archiveId).eq("brand_id", member.brand_id).eq("channel", params.channel).maybeSingle();
      if (result.error) throw new CrmError(result.error.message, 500, "snapshot_read_failed");
      if (!result.data) throw new CrmError("Archive snapshot not found", 404, "snapshot_not_found");
      const row = result.data;
      const mood: VaultMood = {
        channel: params.channel,
        period: "7d",
        coverage: { from: new Date(`${row.week_start}T00:00:00+05:30`).toISOString(), to: new Date(`${row.week_end}T23:59:59+05:30`).toISOString(), signalCount: row.signal_count },
        sentiment: { positive: row.positive_count, neutral: row.neutral_count, negative: row.negative_count },
        dominantTheme: { name: row.dominant_theme_name, summary: row.dominant_theme_summary, clusterIds: row.source_cluster_ids || [] },
        mood: { valence: row.valence, intensity: row.intensity, label: row.mood_label, explanation: row.explanation, confidence: Number(row.confidence) },
        track: row.track ? mapVaultTrack(row.track) : null,
        slides: (row.evidence || []).sort((a: any, b: any) => a.slide_order - b.slide_order).map((item: any) => ({ id: item.id, sourceRef: item.source_ref, author: item.author_label, text: item.evidence_text, date: item.published_at, sentiment: item.sentiment, theme: item.theme, url: item.source_url, sourceType: item.metadata?.sourceType, engagement: item.metadata?.engagement || 0 })),
        algorithmVersion: row.algorithm_version,
        warnings: row.warnings || [],
      };
      return NextResponse.json({ live: false, archived: true, mood, currentMember: { id: member.id, role: member.role } });
    }
    const mood = await buildLiveVaultMood({ request, channel: params.channel, brandId: member.brand_id, admin });
    return NextResponse.json({ live: true, mood, currentMember: { id: member.id, role: member.role } });
  } catch (error) {
    return crmErrorResponse(error);
  }
}
