import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmMember, CrmTeam, Issue } from "@/lib/crm-types";

type Admin = SupabaseClient<any, "public", any>;

async function postSlack(target: string, text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !target) return { ok: false, error: "slack_not_configured" };
  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ channel: target, text, unfurl_links: false }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json();
    return { ok: Boolean(response.ok && payload.ok), ref: payload.ts as string | undefined, error: payload.error as string | undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "slack_failed" };
  }
}

export async function notifyIssueEvent(input: {
  admin: Admin;
  issue: Issue;
  actor: CrmMember;
  owner?: CrmMember | null;
  team?: CrmTeam | null;
  type: string;
  title: string;
  body: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const text = `*${input.title}*\n${input.body}\n${baseUrl}/issues/${input.issue.id}`;
  const targets: Array<{ member?: CrmMember; channel: "slack_dm" | "slack_channel"; target?: string | null }> = [];
  if (input.owner && (input.owner.id !== input.actor.id || input.type.startsWith("sla_"))) targets.push({ member: input.owner, channel: "slack_dm", target: input.owner.slack_user_id });
  if (["critical", "high"].includes(input.issue.severity) && input.team?.slack_channel_id) targets.push({ channel: "slack_channel", target: input.team.slack_channel_id });

  const collaboratorRows = await input.admin.from("issue_collaborators").select("member:crm_members!issue_collaborators_member_id_fkey(*)").eq("issue_id", input.issue.id);
  const collaboratorMembers = (collaboratorRows.data || []).map((row: any) => row.member).filter((item: CrmMember | null) => item && item.id !== input.actor.id && item.id !== input.owner?.id) as CrmMember[];
  if (collaboratorMembers.length) {
    await input.admin.from("notifications").upsert(collaboratorMembers.map((collaborator) => ({
      brand_id: input.issue.brand_id,
      member_id: collaborator.id,
      issue_id: input.issue.id,
      type: input.type,
      title: input.title,
      body: input.body,
      dedupe_key: `${input.issue.id}:${input.type}:${input.issue.version}:collaborator:${collaborator.id}`,
    })), { onConflict: "member_id,dedupe_key", ignoreDuplicates: true });
  }

  for (const item of targets) {
    const dedupe = `${input.issue.id}:${input.type}:${input.issue.version}:${item.channel}:${item.target || item.member?.id}`;
    let notificationId: string | null = null;
    if (item.member) {
      const notification = await input.admin.from("notifications").upsert({
        brand_id: input.issue.brand_id,
        member_id: item.member.id,
        issue_id: input.issue.id,
        type: input.type,
        title: input.title,
        body: input.body,
        dedupe_key: dedupe,
      }, { onConflict: "member_id,dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
      notificationId = notification.data?.id || null;
    }
    const target = item.target || "unmapped";
    const existing = await input.admin.from("notification_deliveries").select("id,status,attempts").eq("dedupe_key", dedupe).maybeSingle();
    if (existing.data?.status === "sent") continue;
    const result = item.target ? await postSlack(item.target, text) : { ok: false, error: "slack_target_missing" };
    await input.admin.from("notification_deliveries").upsert({
      brand_id: input.issue.brand_id,
      notification_id: notificationId,
      issue_id: input.issue.id,
      channel: item.channel,
      target,
      dedupe_key: dedupe,
      status: result.ok ? "sent" : item.target ? "failed" : "skipped",
      provider_ref: result.ref || null,
      error: result.error || null,
      attempts: Number(existing.data?.attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    }, { onConflict: "dedupe_key" });
  }
}
