import { NextResponse } from "next/server";
import { crmErrorResponse, requireIntegrationContext } from "@/lib/crm-server";
import { isSocialProvider, providerConfig } from "@/lib/social-integrations";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { provider: string } }) {
  try {
    if (!isSocialProvider(params.provider)) return NextResponse.json({ error: "Unsupported provider" }, { status: 404 });
    const { admin, member } = await requireIntegrationContext();
    const result = await admin.from("social_connections").select("id,provider,external_account_id,display_name,account_type,username,profile_url,granted_scopes,status,coverage_started_at,last_synced_at,last_error,created_at").eq("brand_id", member.brand_id).eq("provider", params.provider).neq("status", "disconnected").order("created_at");
    if (result.error) throw result.error;
    const connections = await Promise.all((result.data || []).map(async (connection: any) => {
      const [posts, comments, runs] = await Promise.all([
        admin.from("owned_social_posts").select("id", { count: "exact", head: true }).eq("connection_id", connection.id),
        admin.from("owned_social_comments").select("id", { count: "exact", head: true }).eq("connection_id", connection.id),
        admin.from("social_sync_runs").select("id,status,posts_imported,comments_imported,provider_limit_note,error_summary,started_at,finished_at").eq("connection_id", connection.id).order("started_at", { ascending: false }).limit(10),
      ]);
      return { ...connection, postsCount: posts.count || 0, commentsCount: comments.count || 0, syncRuns: runs.data || [] };
    }));
    let configured = true; try { providerConfig(params.provider); } catch { configured = false; }
    return NextResponse.json({ provider: params.provider, configured, canManage: ["admin", "manager"].includes(member.role), connections });
  } catch (error) { return crmErrorResponse(error); }
}
