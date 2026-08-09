import { NextResponse } from "next/server";
import { assertBrandDirectoryReferences, crmErrorResponse, CrmError, requireCrmContext } from "@/lib/crm-server";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { member, admin } = await requireCrmContext();
    const body = await request.json();
    const text = String(body.body || "").trim();
    if (!text) throw new CrmError("Comment cannot be empty", 400, "comment_required");
    const issue = await admin.from("issues").select("id,brand_id,title").eq("id", params.id).eq("brand_id", member.brand_id).maybeSingle();
    if (!issue.data) throw new CrmError("Issue not found", 404, "not_found");
    const issueTitle = issue.data.title;
    const mentioned = Array.isArray(body.mentionedMemberIds) ? body.mentionedMemberIds : [];
    await assertBrandDirectoryReferences(admin, member.brand_id, { memberIds: mentioned });
    const result = await admin.from("issue_comments").insert({ issue_id: params.id, brand_id: member.brand_id, author_id: member.id, body: text, mentioned_member_ids: mentioned }).select("*, author:crm_members(*)").single();
    if (result.error) throw result.error;
    await admin.from("issue_events").insert({ issue_id: params.id, brand_id: member.brand_id, actor_id: member.id, event_type: "commented", detail: `${member.display_name} added a comment` });
    if (mentioned.length) {
      await admin.from("notifications").upsert(mentioned.map((memberId: string) => ({ brand_id: member.brand_id, member_id: memberId, issue_id: params.id, type: "mention", title: `Mentioned in ${issueTitle}`, body: text.slice(0, 240), dedupe_key: `mention:${result.data.id}:${memberId}` })), { onConflict: "member_id,dedupe_key", ignoreDuplicates: true });
    }
    return NextResponse.json({ live: true, comment: result.data }, { status: 201 });
  } catch (error) { return crmErrorResponse(error); }
}
