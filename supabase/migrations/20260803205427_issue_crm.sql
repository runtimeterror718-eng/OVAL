create extension if not exists citext;
create extension if not exists pgcrypto;

create table public.crm_teams (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  slack_channel_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table public.crm_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext not null,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'manager', 'member')),
  team_id uuid references public.crm_teams(id) on delete set null,
  slack_user_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, user_id),
  unique (brand_id, email)
);

create table public.issue_candidates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  fingerprint text not null,
  title text not null,
  summary text not null default '',
  severity text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low')),
  proposed_team_id uuid references public.crm_teams(id) on delete set null,
  source_cluster_ids jsonb not null default '[]'::jsonb,
  source_platforms text[] not null default '{}',
  evidence_snapshot jsonb not null default '[]'::jsonb,
  qdrant_payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'promoted', 'dismissed')),
  promoted_issue_id uuid,
  reviewed_by uuid references public.crm_members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, fingerprint)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid references public.issue_candidates(id) on delete set null,
  title text not null,
  summary text not null default '',
  severity text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low')),
  status text not null default 'new' check (status in ('new', 'triaged', 'assigned', 'in_progress', 'blocked', 'resolved', 'closed')),
  owner_id uuid references public.crm_members(id) on delete set null,
  team_id uuid references public.crm_teams(id) on delete set null,
  reporter_id uuid references public.crm_members(id) on delete set null,
  source_fingerprint text,
  source_platforms text[] not null default '{}',
  due_at timestamptz,
  sla_target_at timestamptz,
  sla_overridden boolean not null default false,
  sla_override_reason text,
  resolution_note text,
  resolved_at timestamptz,
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, source_fingerprint)
);

alter table public.issue_candidates
  add constraint issue_candidates_promoted_issue_fk
  foreign key (promoted_issue_id) references public.issues(id) on delete set null;

create table public.issue_collaborators (
  issue_id uuid not null references public.issues(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  member_id uuid not null references public.crm_members(id) on delete cascade,
  responsibility text not null default 'watcher' check (responsibility in ('pm', 'em', 'support', 'pr', 'watcher')),
  added_by uuid references public.crm_members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (issue_id, member_id)
);

create table public.issue_evidence (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  qdrant_point_id text,
  mention_id uuid references public.mentions(id) on delete set null,
  platform text not null,
  platform_ref_id text,
  source_url text,
  author_label text,
  content_text text not null,
  sentiment_label text,
  published_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (issue_id, platform, platform_ref_id)
);

create table public.issue_tasks (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid references public.crm_members(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  version integer not null default 1 check (version > 0),
  due_at timestamptz,
  created_by uuid references public.crm_members(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  author_id uuid references public.crm_members(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  mentioned_member_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.issue_events (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.issues(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  actor_id uuid references public.crm_members(id) on delete set null,
  event_type text not null,
  detail text not null default '',
  from_value jsonb,
  to_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  member_id uuid not null references public.crm_members(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (member_id, dedupe_key)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  issue_id uuid references public.issues(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'slack_dm', 'slack_channel')),
  target text not null,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_ref text,
  error text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now()
);

create index crm_members_brand_active_idx on public.crm_members (brand_id, active);
create index issue_candidates_queue_idx on public.issue_candidates (brand_id, status, created_at desc);
create index issues_queue_idx on public.issues (brand_id, status, severity, due_at);
create index issues_owner_idx on public.issues (owner_id, status);
create index issue_evidence_issue_idx on public.issue_evidence (issue_id, created_at);
create index issue_tasks_issue_idx on public.issue_tasks (issue_id, status, due_at);
create index issue_comments_issue_idx on public.issue_comments (issue_id, created_at);
create index issue_events_issue_idx on public.issue_events (issue_id, created_at desc);
create index notifications_member_idx on public.notifications (member_id, read_at, created_at desc);
create index notification_deliveries_status_idx on public.notification_deliveries (status, created_at);

create function public.set_crm_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_teams_updated_at before update on public.crm_teams for each row execute function public.set_crm_updated_at();
create trigger crm_members_updated_at before update on public.crm_members for each row execute function public.set_crm_updated_at();
create trigger issue_candidates_updated_at before update on public.issue_candidates for each row execute function public.set_crm_updated_at();
create trigger issues_updated_at before update on public.issues for each row execute function public.set_crm_updated_at();
create trigger issue_tasks_updated_at before update on public.issue_tasks for each row execute function public.set_crm_updated_at();
create trigger issue_comments_updated_at before update on public.issue_comments for each row execute function public.set_crm_updated_at();

alter table public.crm_teams enable row level security;
alter table public.crm_members enable row level security;
alter table public.issue_candidates enable row level security;
alter table public.issues enable row level security;
alter table public.issue_collaborators enable row level security;
alter table public.issue_evidence enable row level security;
alter table public.issue_tasks enable row level security;
alter table public.issue_comments enable row level security;
alter table public.issue_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

create policy crm_members_read_self on public.crm_members for select to authenticated
using (user_id = (select auth.uid()) and active);

create policy crm_teams_read_member_brand on public.crm_teams for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = crm_teams.brand_id and cm.active));
create policy issue_candidates_read_member_brand on public.issue_candidates for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = issue_candidates.brand_id and cm.active));
create policy issues_read_member_brand on public.issues for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = issues.brand_id and cm.active));
create policy issue_evidence_read_member_brand on public.issue_evidence for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = issue_evidence.brand_id and cm.active));
create policy issue_tasks_read_member_brand on public.issue_tasks for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = issue_tasks.brand_id and cm.active));
create policy issue_comments_read_member_brand on public.issue_comments for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = issue_comments.brand_id and cm.active));
create policy issue_events_read_member_brand on public.issue_events for select to authenticated
using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.brand_id = issue_events.brand_id and cm.active));
create policy issue_collaborators_read_member_brand on public.issue_collaborators for select to authenticated
using (exists (
  select 1 from public.issues i
  join public.crm_members cm on cm.brand_id = i.brand_id
  where i.id = issue_collaborators.issue_id and cm.user_id = (select auth.uid()) and cm.active
));
create policy notifications_read_self on public.notifications for select to authenticated
using (member_id in (select cm.id from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.active));
create policy notification_deliveries_read_admin on public.notification_deliveries for select to authenticated
using (exists (
  select 1 from public.issues i
  join public.crm_members cm on cm.brand_id = i.brand_id
  where i.id = notification_deliveries.issue_id and cm.user_id = (select auth.uid()) and cm.active and cm.role = 'admin'
));

revoke all on public.crm_teams, public.crm_members, public.issue_candidates, public.issues,
  public.issue_collaborators, public.issue_evidence, public.issue_tasks, public.issue_comments,
  public.issue_events, public.notifications, public.notification_deliveries from anon;
grant select on public.crm_teams, public.crm_members, public.issue_candidates, public.issues,
  public.issue_collaborators, public.issue_evidence, public.issue_tasks, public.issue_comments,
  public.issue_events, public.notifications, public.notification_deliveries to authenticated;
grant usage, select on sequence public.issue_events_id_seq to authenticated;
