import { NextResponse } from "next/server";
import {
  migrationMissing,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";
import { providerRegistry } from "@/lib/shield-providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin, member } = await requireShieldContext("read");
    const [providers, queued, processing, deadLetters, latestCapture] =
      await Promise.all([
        admin
          .from("discovery_providers")
          .select("provider_key,display_name,mode,enabled,last_success_at,last_error_code")
          .eq("brand_id", member.brand_id)
          .order("provider_key"),
        admin
          .from("crawl_jobs")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", member.brand_id)
          .eq("status", "queued"),
        admin
          .from("crawl_jobs")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", member.brand_id)
          .eq("status", "processing"),
        admin
          .from("crawl_jobs")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", member.brand_id)
          .eq("status", "dead_letter"),
        admin
          .from("crawl_results")
          .select("captured_at,crawler_version")
          .eq("brand_id", member.brand_id)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    const error =
      providers.error ||
      queued.error ||
      processing.error ||
      deadLetters.error ||
      latestCapture.error;
    if (error) throw error;
    const rows = providers.data || [];
    return NextResponse.json({
      operational: true,
      database: "ready",
      worker: latestCapture.data
        ? { status: "observed", ...latestCapture.data }
        : { status: "awaiting_first_capture" },
      queue: {
        queued: queued.count || 0,
        processing: processing.count || 0,
        deadLetters: deadLetters.count || 0,
      },
      providers: rows.map((item) => ({
        ...item,
        credentialConfigured:
          item.provider_key in providerRegistry
            ? providerRegistry[item.provider_key].configured()
            : item.provider_key === "oval_social" ||
              item.provider_key === "rdap_dns",
        operational: Boolean(item.enabled && item.last_success_at),
      })),
    });
  } catch (error) {
    if (!migrationMissing(error)) return shieldErrorResponse(error);
    return NextResponse.json({
      operational: false,
      database: "migration_required",
      worker: { status: "not_started" },
      queue: { queued: 0, processing: 0, deadLetters: 0 },
      providers: [],
      blocker: "Apply the Shield Phase 1 Supabase migration.",
    });
  }
}
