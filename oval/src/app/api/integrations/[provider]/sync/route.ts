import { NextResponse } from "next/server";
import { CrmError, crmErrorResponse, requireIntegrationContext } from "@/lib/crm-server";
import { isSocialProvider } from "@/lib/social-integrations";
import { syncConnection } from "@/lib/social-providers";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  try {
    if (!isSocialProvider(params.provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
    const { admin, member } = await requireIntegrationContext(["admin", "manager"]); const body = await request.json().catch(() => ({}));
    const connectionId = String(body.connectionId || ""); if (!connectionId) throw new CrmError("connectionId is required", 400, "connection_required");
    const connection = await admin.from("social_connections").select("id").eq("id", connectionId).eq("brand_id", member.brand_id).eq("provider", params.provider).maybeSingle();
    if (!connection.data) throw new CrmError("Connection was not found", 404, "connection_not_found");
    return NextResponse.json(await syncConnection(connectionId, "manual"));
  } catch (error) { return crmErrorResponse(error); }
}
