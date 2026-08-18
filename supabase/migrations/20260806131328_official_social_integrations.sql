-- Official owned-channel integrations for LinkedIn, X, Facebook and Instagram.

create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider text not null check (provider in ('linkedin', 'x', 'facebook', 'instagram')),
  external_account_id text not null,
  display_name text not null,
  account_type text,
  username text,
  profile_url text,
  granted_scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'syncing', 'action_required', 'disconnected', 'error')),
  coverage_started_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, provider, external_account_id)
);

create table public.social_connection_credentials (
  connection_id uuid primary key references public.social_connections(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  encryption_version smallint not null default 1 check (encryption_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owned_social_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  connection_id uuid not null references public.social_connections(id) on delete cascade,
  provider text not null check (provider in ('linkedin', 'x', 'facebook', 'instagram')),
  provider_post_id text not null,
  provider_conversation_id text,
  author_id text,
  author_name text,
  author_username text,
  content_text text,
  content_type text not null default 'post',
  media_type text,
  media_urls jsonb not null default '[]'::jsonb,
  source_url text,
  published_at timestamptz,
  edited_at timestamptz,
  likes_count bigint not null default 0 check (likes_count >= 0),
  comments_count bigint not null default 0 check (comments_count >= 0),
  shares_count bigint not null default 0 check (shares_count >= 0),
  views_count bigint not null default 0 check (views_count >= 0),
  raw_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (connection_id, provider_post_id)
);

create table public.owned_social_comments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  connection_id uuid not null references public.social_connections(id) on delete cascade,
  post_id uuid not null references public.owned_social_posts(id) on delete cascade,
  provider text not null check (provider in ('linkedin', 'x', 'facebook', 'instagram')),
  provider_comment_id text not null,
  provider_parent_comment_id text,
  provider_root_comment_id text,
  thread_depth integer not null default 0 check (thread_depth >= 0),
  author_id text,
  author_name text,
  author_username text,
  content_text text,
  source_url text,
  published_at timestamptz,
  edited_at timestamptz,
  likes_count bigint not null default 0 check (likes_count >= 0),
  replies_count bigint not null default 0 check (replies_count >= 0),
  is_hidden boolean,
  is_deleted boolean not null default false,
  raw_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (connection_id, provider_comment_id)
);

create table public.social_sync_cursors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  connection_id uuid not null references public.social_connections(id) on delete cascade,
  resource text not null,
  cursor_value text,
  since_id text,
  last_item_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (connection_id, resource)
);

create table public.social_sync_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  connection_id uuid not null references public.social_connections(id) on delete cascade,
  trigger_type text not null default 'manual' check (trigger_type in ('oauth', 'manual', 'scheduled', 'webhook')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed')),
  posts_imported bigint not null default 0,
  comments_imported bigint not null default 0,
  coverage_started_at timestamptz,
  provider_limit_note text,
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.social_webhook_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  provider text not null check (provider in ('linkedin', 'x', 'facebook', 'instagram')),
  provider_event_id text,
  payload_hash text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'ignored', 'failed')),
  error_summary text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, payload_hash)
);

create index social_connections_brand_status_idx on public.social_connections (brand_id, status, provider);
create index social_connections_created_by_idx on public.social_connections (created_by) where created_by is not null;
create index owned_social_posts_brand_provider_date_idx on public.owned_social_posts (brand_id, provider, published_at desc, id desc);
create index owned_social_posts_connection_idx on public.owned_social_posts (connection_id);
create index owned_social_comments_post_date_idx on public.owned_social_comments (post_id, published_at, id);
create index owned_social_comments_connection_idx on public.owned_social_comments (connection_id);
create index owned_social_comments_parent_idx on public.owned_social_comments (connection_id, provider_parent_comment_id);
create index social_sync_cursors_brand_idx on public.social_sync_cursors (brand_id);
create index social_sync_cursors_connection_idx on public.social_sync_cursors (connection_id);
create index social_sync_runs_connection_started_idx on public.social_sync_runs (connection_id, started_at desc);
create index social_sync_runs_brand_status_idx on public.social_sync_runs (brand_id, status, started_at desc);
create index social_webhook_events_brand_received_idx on public.social_webhook_events (brand_id, received_at desc);

alter table public.mentions add column if not exists source_type text not null default 'external';
alter table public.mentions add column if not exists social_connection_id uuid references public.social_connections(id) on delete set null;
create index if not exists mentions_brand_source_platform_date_idx on public.mentions (brand_id, source_type, platform, published_at desc);
create index if not exists mentions_social_connection_idx on public.mentions (social_connection_id);

alter table public.social_connections enable row level security;
alter table public.social_connection_credentials enable row level security;
alter table public.owned_social_posts enable row level security;
alter table public.owned_social_comments enable row level security;
alter table public.social_sync_cursors enable row level security;
alter table public.social_sync_runs enable row level security;
alter table public.social_webhook_events enable row level security;

create policy "members read social connections" on public.social_connections for select to authenticated
using (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid()) and m.brand_id = social_connections.brand_id and m.active));
create policy "members read owned social posts" on public.owned_social_posts for select to authenticated
using (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid()) and m.brand_id = owned_social_posts.brand_id and m.active));
create policy "members read owned social comments" on public.owned_social_comments for select to authenticated
using (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid()) and m.brand_id = owned_social_comments.brand_id and m.active));
create policy "members read social sync runs" on public.social_sync_runs for select to authenticated
using (exists (select 1 from public.crm_members m where m.user_id = (select auth.uid()) and m.brand_id = social_sync_runs.brand_id and m.active));

grant select on public.social_connections, public.owned_social_posts, public.owned_social_comments, public.social_sync_runs to authenticated;
grant all on public.social_connections, public.social_connection_credentials, public.owned_social_posts, public.owned_social_comments, public.social_sync_cursors, public.social_sync_runs, public.social_webhook_events to service_role;
revoke all on public.social_connection_credentials, public.social_sync_cursors, public.social_webhook_events from anon, authenticated;
revoke all on public.social_connections, public.owned_social_posts, public.owned_social_comments, public.social_sync_runs from anon;
