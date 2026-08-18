import { NextResponse } from "next/server";
import { crmErrorResponse, requireCrmContext } from "@/lib/crm-server";
import { issueIsOverdue } from "@/lib/crm-workflow";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { member, admin } = await requireCrmContext();
    const params = new URL(request.url).searchParams;
    const page = Math.max(Number(params.get("page") || 1), 1);
    const limit = Math.min(Math.max(Number(params.get("limit") || 50), 1), 200);
    let query = admin.from("issues").select("*", { count: "exact" }).eq("brand_id", member.brand_id).order("updated_at", { ascending: false });
    const status = params.get("status");
    const severity = params.get("severity");
    const team = params.get("team");
    const owner = params.get("owner");
    const collaborator = params.get("collaborator");
    const source = params.get("source");
    const dueBefore = params.get("dueBefore");
    const dueAfter = params.get("dueAfter");
    if (status) query = query.eq("status", status);
    if (severity) query = query.eq("severity", severity);
    if (team) query = query.eq("team_id", team);
    if (owner === "me") query = query.eq("owner_id", member.id);
    else if (owner === "unassigned") query = query.is("owner_id", null);
    else if (owner) query = query.eq("owner_id", owner);
    if (source) query = query.contains("source_platforms", [source]);
    if (dueBefore) query = query.lte("due_at", dueBefore);
    if (dueAfter) query = query.gte("due_at", dueAfter);
    if (collaborator) {
      const matches = await admin.from("issue_collaborators").select("issue_id").eq("member_id", collaborator);
      if (matches.error) throw matches.error;
      const matchingIds = (matches.data || []).map((item: any) => item.issue_id);
      if (!matchingIds.length) return NextResponse.json({ live: true, issues: [], currentMember: member, metrics: await issueMetrics(admin, member.brand_id), pagination: { page, limit, total: 0, pages: 0 } });
      query = query.in("id", matchingIds);
    }
    const { data: rows, error, count } = await query.range((page - 1) * limit, page * limit - 1);
    if (error) throw error;

    const memberIds = Array.from(new Set((rows || []).map((row: any) => row.owner_id).filter(Boolean)));
    const teamIds = Array.from(new Set((rows || []).map((row: any) => row.team_id).filter(Boolean)));
    const issueIds = (rows || []).map((row: any) => row.id);
    const [{ data: owners }, { data: teams }, { data: collaboratorRows }] = await Promise.all([
      memberIds.length ? admin.from("crm_members").select("id,display_name,email,role,team_id,slack_user_id,active,brand_id,user_id").in("id", memberIds) : Promise.resolve({ data: [] }),
      teamIds.length ? admin.from("crm_teams").select("*").in("id", teamIds) : Promise.resolve({ data: [] }),
      issueIds.length ? admin.from("issue_collaborators").select("issue_id,member_id,responsibility").in("issue_id", issueIds) : Promise.resolve({ data: [] }),
    ]);
    const ownerMap = new Map((owners || []).map((item: any) => [item.id, item]));
    const teamMap = new Map((teams || []).map((item: any) => [item.id, item]));
    const issues = (rows || []).map((row: any) => ({ ...row, owner: ownerMap.get(row.owner_id) || null, team: teamMap.get(row.team_id) || null, collaborators: (collaboratorRows || []).filter((item: any) => item.issue_id === row.id), overdue: issueIsOverdue(row) }));
    return NextResponse.json({
      live: true,
      issues,
      currentMember: member,
      metrics: await issueMetrics(admin, member.brand_id),
      pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (error) {
    return crmErrorResponse(error);
  }
}

async function issueMetrics(admin: any, brandId: string) {
  const now = new Date().toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [open, overdue, criticalHigh, resolvedWeek] = await Promise.all([
    admin.from("issues").select("id", { count: "exact", head: true }).eq("brand_id", brandId).not("status", "in", "(resolved,closed)"),
    admin.from("issues").select("id", { count: "exact", head: true }).eq("brand_id", brandId).not("status", "in", "(resolved,closed)").lt("due_at", now),
    admin.from("issues").select("id", { count: "exact", head: true }).eq("brand_id", brandId).not("status", "in", "(resolved,closed)").in("severity", ["critical", "high"]),
    admin.from("issues").select("id", { count: "exact", head: true }).eq("brand_id", brandId).gte("resolved_at", weekAgo),
  ]);
  for (const result of [open, overdue, criticalHigh, resolvedWeek]) if (result.error) throw result.error;
  return { open: open.count || 0, overdue: overdue.count || 0, criticalHigh: criticalHigh.count || 0, slaBreaches: overdue.count || 0, resolvedThisWeek: resolvedWeek.count || 0 };
}
