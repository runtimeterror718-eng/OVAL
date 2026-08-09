import { NextResponse } from "next/server";
import { CrmError, crmErrorResponse, requireIntegrationContext } from "@/lib/crm-server";
import { isSocialProvider } from "@/lib/social-integrations";
import { revokeProviderAuthorization } from "@/lib/social-providers";

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  try {
    if (!isSocialProvider(params.provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
    const { admin, member } = await requireIntegrationContext(["admin", "manager"]); const body = await request.json().catch(() => ({})); const connectionId = String(body.connectionId || "");
    if (!connectionId) throw new CrmError("connectionId is required", 400, "connection_required");
    const connection = await admin.from("social_connections").select("id").eq("id", connectionId).eq("brand_id", member.brand_id).eq("provider", params.provider).maybeSingle();
    if (!connection.data) throw new CrmError("Connection was not found", 404, "connection_not_found");
    // Provider revocation is best effort. Local credential destruction must still
    // complete if a provider is unavailable or already considers the token invalid.
    const providerRevoked = await revokeProviderAuthorization(connectionId).catch(() => false);
    await admin.from("social_connection_credentials").delete().eq("connection_id", connectionId);
    const update = await admin.from("social_connections").update({ status: "disconnected", granted_scopes: [], last_error: providerRevoked ? null : "Provider revocation could not be confirmed; local credentials were destroyed.", updated_at: new Date().toISOString() }).eq("id", connectionId);
    if (update.error) throw update.error;
    return NextResponse.json({ disconnected: true, providerRevoked });
  } catch (error) { return crmErrorResponse(error); }
}
