import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm-server";
import { syncConnection } from "@/lib/social-providers";

export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = process.env.SOCIAL_SYNC_TRIGGER_TOKEN; const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || supplied !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = crmAdmin();
  const [due, pending] = await Promise.all([
    admin.from("social_connections").select("id,provider,external_account_id").in("status", ["connected", "error"]).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(20),
    admin.from("social_webhook_events").select("id,provider,provider_event_id").eq("status", "pending").order("received_at", { ascending: true }).limit(50),
  ]);
  const eventConnectionIds = new Set<string>();
  for (const event of pending.data || []) {
    const externalIds = String(event.provider_event_id || "").split(",").filter(Boolean);
    for (const connection of due.data || []) if (connection.provider === event.provider && externalIds.includes(connection.external_account_id)) eventConnectionIds.add(connection.id);
  }
  const ordered = [
    ...(due.data || []).filter((connection) => eventConnectionIds.has(connection.id)),
    ...(due.data || []).filter((connection) => !eventConnectionIds.has(connection.id)),
  ].slice(0, 4);
  const outcomes = [];
  const successful = new Set<string>();
  for (const connection of ordered) {
    try { outcomes.push({ ok: true, ...(await syncConnection(connection.id, eventConnectionIds.has(connection.id) ? "webhook" : "scheduled")) }); successful.add(connection.id); }
    catch (error) { outcomes.push({ ok: false, connectionId: connection.id, error: error instanceof Error ? error.message : "Sync failed" }); }
  }
  const processedEventIds = (pending.data || []).filter((event) => {
    const externalIds = String(event.provider_event_id || "").split(",").filter(Boolean);
    return ordered.some((connection) => successful.has(connection.id) && connection.provider === event.provider && externalIds.includes(connection.external_account_id));
  }).map((event) => event.id);
  if (processedEventIds.length) await admin.from("social_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error_summary: null }).in("id", processedEventIds);
  return NextResponse.json({ processed: outcomes.length, outcomes });
}
