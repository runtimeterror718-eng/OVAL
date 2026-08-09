import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { crmAdmin } from "@/lib/crm-server";
import { webhookHash } from "@/lib/social-providers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN) return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
  return new Response("Verification failed", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text(); const secret = String(process.env.META_APP_SECRET || ""); const signature = request.headers.get("x-hub-signature-256") || "";
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`; const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Invalid signature", { status: 401 });
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (payload.object !== "instagram" && payload.object !== "page") return new Response("Unsupported webhook object", { status: 400 });
  const provider = payload.object === "instagram" ? "instagram" : "facebook"; const externalIds = (payload.entry || []).map((entry: any) => String(entry.id || "")).filter(Boolean);
  const admin = crmAdmin(); const connections = externalIds.length ? await admin.from("social_connections").select("id,brand_id").eq("provider", provider).in("external_account_id", externalIds) : { data: [] as any[] };
  const hash = await webhookHash(raw); const first = connections.data?.[0];
  await admin.from("social_webhook_events").upsert({ brand_id: first?.brand_id || null, provider, provider_event_id: externalIds.join(",") || null, payload_hash: hash, payload, status: first ? "pending" : "ignored" }, { onConflict: "provider,payload_hash", ignoreDuplicates: true });
  return NextResponse.json({ received: true });
}
