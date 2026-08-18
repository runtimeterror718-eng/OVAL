import type { CrmRole, IssueSeverity, IssueStatus } from "@/lib/crm-types";

const transitions: Record<IssueStatus, IssueStatus[]> = {
  new: ["triaged"],
  triaged: ["assigned"],
  assigned: ["in_progress"],
  in_progress: ["blocked", "resolved"],
  blocked: ["in_progress", "resolved"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"],
};

export function canManage(role: CrmRole) {
  return role === "admin" || role === "manager";
}

export function assertTransition(input: {
  from: IssueStatus;
  to: IssueStatus;
  role: CrmRole;
  isOwner: boolean;
  ownerId?: string | null;
  teamId?: string | null;
  resolutionNote?: string | null;
  reason?: string | null;
}) {
  if (!transitions[input.from]?.includes(input.to)) throw new Error(`Invalid transition: ${input.from} → ${input.to}`);
  const manager = canManage(input.role);
  if (["triaged", "assigned", "closed"].includes(input.to) && !manager) throw new Error("Manager permission required");
  if (["resolved", "closed"].includes(input.from) && input.to === "in_progress" && !manager) throw new Error("Manager permission required to reopen an issue");
  if (["in_progress", "blocked", "resolved"].includes(input.to) && !manager && !input.isOwner) throw new Error("Only the owner or a manager can update this issue");
  if (input.to === "assigned" && (!input.ownerId || !input.teamId)) throw new Error("Owner and team are required before assignment");
  if (input.to === "resolved" && !input.resolutionNote?.trim()) throw new Error("A resolution note is required");
  if ((input.from === "resolved" || input.from === "closed") && input.to === "in_progress" && !input.reason?.trim()) throw new Error("A reopen reason is required");
}

const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function addBusinessDaysInIndia(from: Date, count: number) {
  // Shift the instant so UTC calendar operations represent Asia/Kolkata local
  // dates, then shift back. India has no daylight-saving transitions.
  const result = new Date(from.getTime() + INDIA_OFFSET_MS);
  let remaining = count;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return new Date(result.getTime() - INDIA_OFFSET_MS);
}

export function calculateSla(severity: IssueSeverity, from = new Date()) {
  if (severity === "critical") return new Date(from.getTime() + 4 * 60 * 60 * 1000).toISOString();
  if (severity === "high") return new Date(from.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return addBusinessDaysInIndia(from, severity === "medium" ? 3 : 7).toISOString();
}

export function issueIsOverdue(issue: { due_at?: string | null; status: IssueStatus }, now = new Date()) {
  return Boolean(issue.due_at && !["resolved", "closed"].includes(issue.status) && new Date(issue.due_at) < now);
}
