import { NextResponse } from "next/server";
import { crmErrorResponse, CrmError, requireCrmContext } from "@/lib/crm-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { member, admin } = await requireCrmContext();
    const result = await admin.from("notifications").select("*").eq("member_id", member.id).order("created_at", { ascending: false }).limit(50);
    if (result.error) throw result.error;
    return NextResponse.json({ live: true, notifications: result.data || [], unread: (result.data || []).filter((item: any) => !item.read_at).length });
  } catch (error) { return crmErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { member, admin } = await requireCrmContext();
    const body = await request.json();
    if (!body.id && body.action !== "read_all") throw new CrmError("Notification id is required", 400, "id_required");
    let query = admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("member_id", member.id);
    if (body.id) query = query.eq("id", body.id);
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ live: true });
  } catch (error) { return crmErrorResponse(error); }
}
