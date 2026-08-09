import { NextResponse } from "next/server";
import { assertBrandDirectoryReferences, crmErrorResponse, CrmError, requireCrmContext } from "@/lib/crm-server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { member, admin } = await requireCrmContext();
    const body = await request.json();
    const title = String(body.title || "").trim();
    if (!title) throw new CrmError("Task title is required", 400, "title_required");
    const issue = await admin.from("issues").select("id,owner_id").eq("id", params.id).eq("brand_id", member.brand_id).maybeSingle();
    if (!issue.data) throw new CrmError("Issue not found", 404, "not_found");
    const manager = member.role === "admin" || member.role === "manager";
    if (!manager && issue.data.owner_id !== member.id) throw new CrmError("Only the issue owner or a manager can create tasks", 403, "forbidden");
    await assertBrandDirectoryReferences(admin, member.brand_id, { memberIds: body.assigneeId ? [body.assigneeId] : [] });
    const result = await admin.from("issue_tasks").insert({ issue_id: params.id, brand_id: member.brand_id, title, description: String(body.description || ""), assignee_id: body.assigneeId || null, due_at: body.dueAt || null, created_by: member.id }).select("*").single();
    if (result.error) throw result.error;
    await admin.from("issue_events").insert({ issue_id: params.id, brand_id: member.brand_id, actor_id: member.id, event_type: "task_created", detail: `${member.display_name} created task: ${title}` });
    return NextResponse.json({ live: true, task: result.data }, { status: 201 });
  } catch (error) { return crmErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { member, admin } = await requireCrmContext();
    const body = await request.json();
    if (!body.taskId || !["open", "in_progress", "done"].includes(body.status)) throw new CrmError("taskId and valid status are required", 400, "invalid_task_update");
    if (!Number.isInteger(body.expectedVersion)) throw new CrmError("expectedVersion is required", 400, "version_required");
    const task = await admin.from("issue_tasks").select("*").eq("id", body.taskId).eq("issue_id", params.id).eq("brand_id", member.brand_id).maybeSingle();
    if (!task.data) throw new CrmError("Task not found", 404, "not_found");
    if (task.data.version !== body.expectedVersion) throw new CrmError("Task was changed by another user", 409, "version_conflict");
    const manager = member.role === "admin" || member.role === "manager";
    if (!manager && task.data.assignee_id !== member.id) throw new CrmError("Only the assignee or a manager can update this task", 403, "forbidden");
    const result = await admin.from("issue_tasks").update({ status: body.status, version: task.data.version + 1, completed_at: body.status === "done" ? new Date().toISOString() : null }).eq("id", body.taskId).eq("version", task.data.version).select("*").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new CrmError("Task was changed by another user", 409, "version_conflict");
    await admin.from("issue_events").insert({ issue_id: params.id, brand_id: member.brand_id, actor_id: member.id, event_type: "task_updated", detail: `${member.display_name} changed task status to ${body.status}` });
    return NextResponse.json({ live: true, task: result.data });
  } catch (error) { return crmErrorResponse(error); }
}
