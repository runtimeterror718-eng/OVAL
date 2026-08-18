import { NextResponse } from "next/server";
import { calculateSla } from "@/lib/crm-workflow";
import { assertBrandDirectoryReferences, crmErrorResponse, CrmError, requireCrmContext } from "@/lib/crm-server";
import { notifyIssueEvent } from "@/lib/crm-notifications";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { member, admin } = await requireCrmContext(["admin", "manager"]);
    const body = await request.json();
    const candidate = await admin.from("issue_candidates").select("*").eq("id", params.id).eq("brand_id", member.brand_id).maybeSingle();
    if (!candidate.data) throw new CrmError("Candidate not found", 404, "not_found");
    if (candidate.data.status !== "proposed") throw new CrmError("Candidate has already been reviewed", 409, "already_reviewed");
    if (body.action === "dismiss") {
      await admin.from("issue_candidates").update({ status: "dismissed", reviewed_by: member.id, reviewed_at: new Date().toISOString() }).eq("id", params.id);
      return NextResponse.json({ live: true, status: "dismissed" });
    }
    if (body.action !== "promote") throw new CrmError("Unknown candidate action", 400, "unknown_action");
    const requestedCollaborators = Array.isArray(body.collaborators) ? body.collaborators : [];
    await assertBrandDirectoryReferences(admin, member.brand_id, { ownerId: body.ownerId, teamId: body.teamId, memberIds: requestedCollaborators.map((item: any) => item.memberId) });
    const sla = calculateSla(body.severity || candidate.data.severity);
    const inserted = await admin.from("issues").insert({
      brand_id: member.brand_id,
      candidate_id: candidate.data.id,
      title: String(body.title || candidate.data.title),
      summary: String(body.summary || candidate.data.summary),
      severity: body.severity || candidate.data.severity,
      status: "new",
      reporter_id: member.id,
      team_id: body.teamId || candidate.data.proposed_team_id || null,
      owner_id: body.ownerId || null,
      source_fingerprint: candidate.data.fingerprint,
      source_platforms: candidate.data.source_platforms,
      sla_target_at: sla,
      due_at: body.dueAt || sla,
    }).select("*").single();
    if (inserted.error?.code === "23505") throw new CrmError("This candidate is already linked to an issue", 409, "duplicate_issue");
    if (inserted.error) throw inserted.error;
    const issue = inserted.data;
    const evidence = (candidate.data.evidence_snapshot || []).filter((item: any) => item.text).map((item: any, index: number) => ({
      issue_id: issue.id,
      brand_id: member.brand_id,
      qdrant_point_id: item.id || null,
      platform: item.platform || "unknown",
      platform_ref_id: item.id || `${candidate.data.fingerprint}-${index}`,
      source_url: item.url || null,
      author_label: item.author || null,
      content_text: item.text,
      sentiment_label: item.sentiment || null,
      published_at: item.published_at || null,
      snapshot: item,
    }));
    if (evidence.length) await admin.from("issue_evidence").insert(evidence);
    const collaborators = requestedCollaborators;
    if (collaborators.length) await admin.from("issue_collaborators").upsert(collaborators.map((item: any) => ({ issue_id: issue.id, brand_id: member.brand_id, member_id: item.memberId, responsibility: item.responsibility || "watcher", added_by: member.id })), { onConflict: "issue_id,member_id" });
    await admin.from("issue_candidates").update({ status: "promoted", promoted_issue_id: issue.id, reviewed_by: member.id, reviewed_at: new Date().toISOString() }).eq("id", candidate.data.id);
    await admin.from("issue_events").insert({ issue_id: issue.id, brand_id: member.brand_id, actor_id: member.id, event_type: "created", detail: `${member.display_name} promoted an intelligence cluster into an issue`, metadata: { candidate_id: candidate.data.id } });
    const owner = body.ownerId ? (await admin.from("crm_members").select("*").eq("id", body.ownerId).maybeSingle()).data : null;
    const team = issue.team_id ? (await admin.from("crm_teams").select("*").eq("id", issue.team_id).maybeSingle()).data : null;
    await notifyIssueEvent({ admin, issue, actor: member, owner, team, type: "created", title: issue.title, body: `${issue.severity.toUpperCase()} issue created from ${issue.source_platforms.join(", ")}` });
    return NextResponse.json({ live: true, issue }, { status: 201 });
  } catch (error) { return crmErrorResponse(error); }
}
