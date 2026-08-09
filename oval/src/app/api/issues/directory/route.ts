import { NextResponse } from "next/server";
import { crmErrorResponse, CrmError, requireCrmContext } from "@/lib/crm-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { member, admin } = await requireCrmContext();
    const [members, teams] = await Promise.all([
      admin.from("crm_members").select("*, team:crm_teams(*)").eq("brand_id", member.brand_id).order("display_name"),
      admin.from("crm_teams").select("*").eq("brand_id", member.brand_id).order("name"),
    ]);
    if (members.error) throw members.error;
    if (teams.error) throw teams.error;
    return NextResponse.json({ live: true, members: members.data || [], teams: teams.data || [], currentMember: member });
  } catch (error) { return crmErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { member, admin } = await requireCrmContext(["admin"]);
    const body = await request.json();
    if (body.type === "team") {
      const name = String(body.name || "").trim();
      if (!name) throw new CrmError("Team name is required", 400, "name_required");
      const result = await admin.from("crm_teams").insert({ brand_id: member.brand_id, name, slack_channel_id: body.slackChannelId || null }).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({ live: true, team: result.data }, { status: 201 });
    }
    if (body.type === "member") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email.endsWith("@pw.live")) throw new CrmError("A @pw.live email is required", 400, "domain_denied");
      const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = users.data.users.find((item) => item.email?.toLowerCase() === email);
      if (!user) throw new CrmError("The user must complete OTP login once before being added", 409, "auth_user_missing");
      const result = await admin.from("crm_members").insert({ brand_id: member.brand_id, user_id: user.id, email, display_name: String(body.displayName || email.split("@")[0]), role: body.role || "member", team_id: body.teamId || null, slack_user_id: body.slackUserId || null }).select("*").single();
      if (result.error) throw result.error;
      return NextResponse.json({ live: true, member: result.data }, { status: 201 });
    }
    throw new CrmError("Unknown directory record type", 400, "unknown_type");
  } catch (error) { return crmErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { member, admin } = await requireCrmContext(["admin"]);
    const body = await request.json();
    if (!body.id || !["member", "team"].includes(body.type)) throw new CrmError("id and type are required", 400, "invalid_request");
    const table = body.type === "member" ? "crm_members" : "crm_teams";
    const allowed = body.type === "member" ? ["display_name", "role", "team_id", "slack_user_id", "active"] : ["name", "slack_channel_id", "active"];
    const patch = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
    const result = await admin.from(table).update(patch).eq("id", body.id).eq("brand_id", member.brand_id).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ live: true, record: result.data });
  } catch (error) { return crmErrorResponse(error); }
}
