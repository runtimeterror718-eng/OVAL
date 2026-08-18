import { NextResponse } from "next/server";
import { crmAdmin, crmErrorResponse } from "@/lib/crm-server";
import { notifyIssueEvent } from "@/lib/crm-notifications";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!process.env.CRM_REMINDER_TOKEN || token !== process.env.CRM_REMINDER_TOKEN) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = crmAdmin();
    const now = new Date();
    const soon = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    const result = await admin.from("issues").select("*").not("status", "in", "(resolved,closed)").lte("due_at", soon).order("due_at").limit(200);
    if (result.error) throw result.error;
    let delivered = 0;
    for (const issue of result.data || []) {
      if (!issue.owner_id) continue;
      const [owner, team] = await Promise.all([
        admin.from("crm_members").select("*").eq("id", issue.owner_id).maybeSingle(),
        issue.team_id ? admin.from("crm_teams").select("*").eq("id", issue.team_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!owner.data) continue;
      const overdue = issue.due_at && new Date(issue.due_at) < now;
      await notifyIssueEvent({ admin, issue, actor: owner.data, owner: owner.data, team: team.data, type: overdue ? "sla_breached" : "sla_due_soon", title: issue.title, body: overdue ? "This issue is overdue." : "This issue is due within four hours." });
      delivered += 1;
    }
    return NextResponse.json({ live: true, scanned: result.data?.length || 0, delivered });
  } catch (error) { return crmErrorResponse(error); }
}
