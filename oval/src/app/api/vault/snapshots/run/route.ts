import { NextRequest, NextResponse } from "next/server";
import { crmAdmin, crmErrorResponse, DEFAULT_BRAND_ID } from "@/lib/crm-server";
import { buildLiveVaultMood } from "@/lib/vault-server";
import { VAULT_CHANNELS } from "@/lib/vault-types";

const IST_OFFSET = 330 * 60 * 1000;

function previousWeek(now = new Date()) {
  const india = new Date(now.getTime() + IST_OFFSET);
  const day = india.getUTCDay() || 7;
  const currentMonday = Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate() - day + 1) - IST_OFFSET;
  const from = new Date(currentMonday - 7 * 86400000);
  const to = new Date(currentMonday - 1);
  const weekStart = new Date(from.getTime() + IST_OFFSET).toISOString().slice(0, 10);
  const weekEnd = new Date(to.getTime() + IST_OFFSET).toISOString().slice(0, 10);
  return { from, to, weekStart, weekEnd };
}

export async function POST(request: NextRequest) {
  try {
    const configured = process.env.VAULT_SNAPSHOT_TRIGGER_TOKEN;
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!configured || supplied !== configured) return NextResponse.json({ error: "Invalid trigger token" }, { status: 401 });
    const admin = crmAdmin();
    const brandId = process.env.VAULT_BRAND_ID || DEFAULT_BRAND_ID;
    const week = previousWeek();
    const results = [];
    for (const channel of VAULT_CHANNELS) {
      try {
        const mood = await buildLiveVaultMood({ request, channel, brandId, admin, period: "7d", bounds: { from: week.from, to: week.to } });
        const snapshot = await admin.from("vault_snapshots").upsert({
          brand_id: brandId, channel, week_start: week.weekStart, week_end: week.weekEnd,
          signal_count: mood.coverage.signalCount, positive_count: mood.sentiment.positive, neutral_count: mood.sentiment.neutral, negative_count: mood.sentiment.negative,
          dominant_theme_name: mood.dominantTheme.name, dominant_theme_summary: mood.dominantTheme.summary, source_cluster_ids: mood.dominantTheme.clusterIds,
          valence: mood.mood.valence, intensity: mood.mood.intensity, mood_label: mood.mood.label, explanation: mood.mood.explanation, confidence: mood.mood.confidence,
          track_id: mood.track && !mood.track.id.startsWith("seed-") ? mood.track.id : null,
          algorithm_version: mood.algorithmVersion, warnings: mood.warnings, generated_at: new Date().toISOString(),
        }, { onConflict: "brand_id,channel,week_start" }).select("id").single();
        if (snapshot.error) throw snapshot.error;
        await admin.from("vault_snapshot_evidence").delete().eq("snapshot_id", snapshot.data.id);
        const refs = new Set<string>();
        const evidence = mood.slides.map((slide, index) => {
          let sourceRef = slide.sourceRef;
          if (refs.has(sourceRef)) sourceRef = `${sourceRef}:${index}`;
          refs.add(sourceRef);
          return { brand_id: brandId, snapshot_id: snapshot.data.id, slide_order: index, source_ref: sourceRef, source_url: slide.url || null, author_label: slide.author, evidence_text: slide.text, sentiment: slide.sentiment, theme: slide.theme || null, published_at: slide.date || null, metadata: { sourceType: slide.sourceType, engagement: slide.engagement || 0 } };
        });
        if (evidence.length) {
          const inserted = await admin.from("vault_snapshot_evidence").insert(evidence);
          if (inserted.error) throw inserted.error;
        }
        results.push({ channel, status: "created", snapshotId: snapshot.data.id, signals: mood.coverage.signalCount });
      } catch (error) { results.push({ channel, status: "failed", error: error instanceof Error ? error.message : String(error) }); }
    }
    return NextResponse.json({ weekStart: week.weekStart, weekEnd: week.weekEnd, results });
  } catch (error) { return crmErrorResponse(error); }
}
