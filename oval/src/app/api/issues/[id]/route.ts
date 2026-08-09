import { NextResponse } from "next/server";
import type { IssueStatus } from "@/lib/crm-types";
import { assertBrandDirectoryReferences, crmErrorResponse, CrmError, requireCrmContext } from "@/lib/crm-server";
import { assertTransition, calculateSla, canManage } from "@/lib/crm-workflow";
import { notifyIssueEvent } from "@/lib/crm-notifications";

export const dynamic = "force-dynamic";

async function detail(admin: any, brandId: string, id: string) {
  const { data: issue, error } = await admin.from("issues").select("*").eq("brand_id", brandId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!issue) throw new CrmError("Issue not found", 404, "not_found");
  const [owner, team, collaborators, evidence, tasks, comments, events] = await Promise.all([
    issue.owner_id ? admin.from("crm_members").select("*").eq("id", issue.owner_id).maybeSingle() : Promise.resolve({ data: null }),
    issue.team_id ? admin.from("crm_teams").select("*").eq("id", issue.team_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("issue_collaborators").select("*, member:crm_members!issue_collaborators_member_id_fkey(*)").eq("issue_id", id),
    admin.from("issue_evidence").select("*").eq("issue_id", id).order("created_at"),
    admin.from("issue_tasks").select("*, assignee:crm_members!issue_tasks_assignee_id_fkey(*)").eq("issue_id", id).order("created_at"),
    admin.from("issue_comments").select("*, author:crm_members(*)").eq("issue_id", id).order("created_at"),
    admin.from("issue_events").select("*, actor:crm_members(*)").eq("issue_id", id).order("created_at", { ascending: false }),
  ]);
  return { ...issue, owner: owner.data, team: team.data, collaborators: collaborators.data || [], evidence: evidence.data || [], tasks: tasks.data || [], comments: comments.data || [], events: events.data || [] };
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const { member, admin } = await requireCrmContext();
    return NextResponse.json({ live: true, issue: await detail(admin, member.brand_id, params.id), currentMember: member });
  } catch (error) {
    return crmErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { member, admin } = await requireCrmContext();
    const body = await request.json();
    if (!Number.isInteger(body.expectedVersion)) throw new CrmError("expectedVersion is required", 400, "version_required");
    const current = await detail(admin, member.brand_id, params.id);
    if (current.version !== body.expectedVersion) throw new CrmError("Issue was changed by another user", 409, "version_conflict");

    const patch: Record<string, any> = { version: current.version + 1 };
    let eventType = String(body.action || "updated");
    let detailText = "Issue updated";
    if (body.action === "transition") {
      const target = String(body.status) as IssueStatus;
      try {
        assertTransition({ from: current.status, to: target, role: member.role, isOwner: current.owner_id === member.id, ownerId: current.owner_id, teamId: current.team_id, resolutionNote: body.resolutionNote || current.resolution_note, reason: body.reason });
      } catch (error) {
        throw new CrmError(error instanceof Error ? error.message : "Invalid transition", 400, "invalid_transition");
      }
      patch.status = target;
      if (target === "resolved") { patch.resolution_note = String(body.resolutionNote).trim(); patch.resolved_at = new Date().toISOString(); }
      if (target === "closed") patch.closed_at = new Date().toISOString();
      if (target === "in_progress" && ["resolved", "closed"].includes(current.status)) { patch.resolved_at = null; patch.closed_at = null; }
      detailText = `${member.display_name} changed status from ${current.status} to ${target}${body.reason ? `: ${body.reason}` : ""}`;
    } else if (body.action === "assign") {
      if (!canManage(member.role)) throw new CrmError("Manager permission required", 403, "forbidden");
      if (!body.ownerId || !body.teamId) throw new CrmError("Owner and team are required", 400, "assignment_required");
      await assertBrandDirectoryReferences(admin, member.brand_id, { ownerId: body.ownerId, teamId: body.teamId, memberIds: Array.isArray(body.collaborators) ? body.collaborators.map((item: any) => item.memberId) : [] });
      patch.owner_id = body.ownerId;
      patch.team_id = body.teamId;
      if (current.status === "triaged") patch.status = "assigned";
      detailText = `${member.display_name} assigned the issue`;
    } else if (body.action === "edit") {
      if (!canManage(member.role)) throw new CrmError("Manager permission required", 403, "forbidden");
      if (body.title) patch.title = String(body.title).trim();
      if (body.summary !== undefined) patch.summary = String(body.summary).trim();
      if (body.severity) { patch.severity = body.severity; patch.sla_target_at = calculateSla(body.severity); if (!current.sla_overridden) patch.due_at = patch.sla_target_at; }
      const dueDateChanged = body.dueAt && (
        !current.due_at
        || Math.abs(new Date(body.dueAt).getTime() - new Date(current.due_at).getTime()) > 1000
      );
      if (dueDateChanged) {
        if (!String(body.overrideReason || "").trim()) throw new CrmError("SLA override reason is required", 400, "override_reason_required");
        patch.due_at = body.dueAt; patch.sla_overridden = true; patch.sla_override_reason = String(body.overrideReason).trim();
      }
      detailText = `${member.display_name} edited issue fields`;
    } else {
      throw new CrmError("Unknown issue action", 400, "unknown_action");
    }

    const updated = await admin.from("issues").update(patch).eq("id", current.id).eq("version", current.version).select("*").maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new CrmError("Issue was changed by another user", 409, "version_conflict");
    if (body.action === "assign" && Array.isArray(body.collaborators)) {
      await admin.from("issue_collaborators").delete().eq("issue_id", current.id);
      const collaborators = body.collaborators.filter((item: any) => item.memberId && ["pm", "em", "support", "pr", "watcher"].includes(item.responsibility));
      if (collaborators.length) {
        await admin.from("issue_collaborators").upsert(collaborators.map((item: any) => ({ issue_id: current.id, brand_id: member.brand_id, member_id: item.memberId, responsibility: item.responsibility, added_by: member.id })), { onConflict: "issue_id,member_id" });
        await admin.from("notifications").upsert(collaborators.filter((item: any) => item.memberId !== member.id).map((item: any) => ({ brand_id: member.brand_id, member_id: item.memberId, issue_id: current.id, type: "collaborator_added", title: `Added to ${updated.data.title}`, body: `You were added as ${item.responsibility.toUpperCase()}.`, dedupe_key: `collaborator:${current.id}:${updated.data.version}:${item.memberId}` })), { onConflict: "member_id,dedupe_key", ignoreDuplicates: true });
      }
    }
    await admin.from("issue_events").insert({ brand_id: member.brand_id, issue_id: current.id, actor_id: member.id, event_type: eventType, detail: detailText, from_value: current, to_value: updated.data, metadata: body.reason ? { reason: body.reason } : {} });
    const full = await detail(admin, member.brand_id, current.id);
    await notifyIssueEvent({ admin, issue: full, actor: member, owner: full.owner, team: full.team, type: eventType, title: full.title, body: detailText });
    return NextResponse.json({ live: true, issue: full });
  } catch (error) {
    return crmErrorResponse(error);
  }
}
