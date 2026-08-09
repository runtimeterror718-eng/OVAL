export const ISSUE_STATUSES = ["new", "triaged", "assigned", "in_progress", "blocked", "resolved", "closed"] as const;
export const ISSUE_SEVERITIES = ["critical", "high", "medium", "low"] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type CrmRole = "admin" | "manager" | "member";
export type CollaboratorRole = "pm" | "em" | "support" | "pr" | "watcher";

export type CrmTeam = {
  id: string;
  brand_id: string;
  name: string;
  slack_channel_id?: string | null;
  active: boolean;
};

export type CrmMember = {
  id: string;
  brand_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: CrmRole;
  team_id?: string | null;
  slack_user_id?: string | null;
  active: boolean;
  team?: CrmTeam | null;
};

export type Issue = {
  id: string;
  brand_id: string;
  candidate_id?: string | null;
  title: string;
  summary: string;
  severity: IssueSeverity;
  status: IssueStatus;
  owner_id?: string | null;
  team_id?: string | null;
  reporter_id?: string | null;
  source_fingerprint?: string | null;
  source_platforms: string[];
  due_at?: string | null;
  sla_target_at?: string | null;
  sla_overridden: boolean;
  sla_override_reason?: string | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  owner?: CrmMember | null;
  team?: CrmTeam | null;
  collaborators?: Array<{ responsibility: CollaboratorRole; member: CrmMember }>;
  evidence?: any[];
  tasks?: any[];
  comments?: any[];
  events?: any[];
};

export type IssueCandidate = {
  id: string;
  fingerprint: string;
  title: string;
  summary: string;
  severity: IssueSeverity;
  source_cluster_ids: string[];
  source_platforms: string[];
  evidence_snapshot: any[];
  status: "proposed" | "promoted" | "dismissed";
  created_at: string;
};
