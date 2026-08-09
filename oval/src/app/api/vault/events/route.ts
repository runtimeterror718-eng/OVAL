import { NextRequest, NextResponse } from "next/server";
import { crmErrorResponse, requireCrmContext } from "@/lib/crm-server";

const allowed = new Set(["vault_opened", "vault_room_opened", "slide_navigated", "archive_selected", "spotify_embed_loaded", "spotify_outbound_clicked"]);

export async function POST(request: NextRequest) {
  try {
    const { member } = await requireCrmContext();
    const body = await request.json();
    if (!allowed.has(body.event)) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    const properties = Object.fromEntries(Object.entries(body.properties || {}).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) && ["string", "number", "boolean"].includes(typeof value)).slice(0, 20));
    console.info(JSON.stringify({ type: "oval_vault_event", event: body.event, brandId: member.brand_id, memberId: member.id, properties, occurredAt: body.occurredAt || new Date().toISOString() }));
    return NextResponse.json({ accepted: true });
  } catch (error) { return crmErrorResponse(error); }
}
