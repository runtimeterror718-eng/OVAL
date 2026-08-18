create extension if not exists pgcrypto;

create table public.vault_tracks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  spotify_track_id text not null,
  title text not null,
  artist text not null,
  artwork_url text,
  valence text not null check (valence in ('uplifting', 'tense', 'reflective', 'mixed')),
  intensity text not null check (intensity in ('low', 'medium', 'high')),
  theme_tags text[] not null default '{}',
  channel_scopes text[] not null default '{}',
  priority integer not null default 0 check (priority between 0 and 100),
  active boolean not null default true,
  created_by uuid references public.crm_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, spotify_track_id),
  check (spotify_track_id ~ '^[A-Za-z0-9]{22}$'),
  check (channel_scopes <@ array['playstore','freshdesk','linkedin','x','facebook','instagram','youtube','reddit']::text[])
);

create table public.vault_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  channel text not null check (channel in ('playstore','freshdesk','linkedin','x','facebook','instagram','youtube','reddit')),
  week_start date not null,
  week_end date not null,
  signal_count integer not null default 0 check (signal_count >= 0),
  positive_count integer not null default 0 check (positive_count >= 0),
  neutral_count integer not null default 0 check (neutral_count >= 0),
  negative_count integer not null default 0 check (negative_count >= 0),
  dominant_theme_name text not null,
  dominant_theme_summary text not null,
  source_cluster_ids text[] not null default '{}',
  valence text not null check (valence in ('uplifting', 'tense', 'reflective', 'mixed')),
  intensity text not null check (intensity in ('low', 'medium', 'high')),
  mood_label text not null,
  explanation text not null,
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  track_id uuid references public.vault_tracks(id) on delete set null,
  algorithm_version text not null,
  warnings text[] not null default '{}',
  generated_at timestamptz not null default now(),
  unique (brand_id, channel, week_start),
  check (week_end >= week_start)
);

create table public.vault_snapshot_evidence (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  snapshot_id uuid not null references public.vault_snapshots(id) on delete cascade,
  slide_order integer not null check (slide_order between 0 and 99),
  source_ref text not null,
  source_url text,
  author_label text not null,
  evidence_text text not null,
  sentiment text not null check (sentiment in ('positive', 'neutral', 'negative')),
  theme text,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (snapshot_id, slide_order),
  unique (snapshot_id, source_ref)
);

create index vault_tracks_catalog_idx on public.vault_tracks (brand_id, active, valence, intensity);
create index vault_tracks_created_by_idx on public.vault_tracks (created_by);
create index vault_snapshots_archive_idx on public.vault_snapshots (brand_id, channel, week_start desc, id desc);
create index vault_snapshots_track_id_idx on public.vault_snapshots (track_id);
create index vault_snapshot_evidence_snapshot_idx on public.vault_snapshot_evidence (snapshot_id, slide_order);
create index vault_snapshot_evidence_brand_idx on public.vault_snapshot_evidence (brand_id);

alter table public.vault_tracks enable row level security;
alter table public.vault_snapshots enable row level security;
alter table public.vault_snapshot_evidence enable row level security;

create policy vault_tracks_member_read on public.vault_tracks for select to authenticated
using (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_tracks.brand_id
    and member.active
));

create policy vault_tracks_admin_insert on public.vault_tracks for insert to authenticated
with check (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_tracks.brand_id
    and member.active
    and member.role = 'admin'
));

create policy vault_tracks_admin_update on public.vault_tracks for update to authenticated
using (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_tracks.brand_id
    and member.active
    and member.role = 'admin'
))
with check (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_tracks.brand_id
    and member.active
    and member.role = 'admin'
));

create policy vault_tracks_admin_delete on public.vault_tracks for delete to authenticated
using (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_tracks.brand_id
    and member.active
    and member.role = 'admin'
));

create policy vault_snapshots_member_read on public.vault_snapshots for select to authenticated
using (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_snapshots.brand_id
    and member.active
));

create policy vault_snapshot_evidence_member_read on public.vault_snapshot_evidence for select to authenticated
using (exists (
  select 1 from public.crm_members member
  where member.user_id = (select auth.uid())
    and member.brand_id = vault_snapshot_evidence.brand_id
    and member.active
));

revoke all on public.vault_tracks, public.vault_snapshots, public.vault_snapshot_evidence from anon;
revoke all on public.vault_tracks, public.vault_snapshots, public.vault_snapshot_evidence from authenticated;
grant select on public.vault_tracks, public.vault_snapshots, public.vault_snapshot_evidence to authenticated;
grant all on public.vault_tracks, public.vault_snapshots, public.vault_snapshot_evidence to service_role;

insert into public.vault_tracks
  (brand_id, spotify_track_id, title, artist, valence, intensity, theme_tags, channel_scopes, priority)
values
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '6dGnYIeXmHdcikdzNNDMm2', 'Here Comes the Sun', 'The Beatles', 'uplifting', 'low', array['appreciation','teaching','community'], '{}', 70),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '60nZcImufyMA1MKQY3dcCH', 'Happy', 'Pharrell Williams', 'uplifting', 'medium', array['celebration','success','community'], '{}', 75),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '0VjIjW4GlUZAMYd2vXMi3b', 'Blinding Lights', 'The Weeknd', 'uplifting', 'high', array['momentum','growth','launch'], '{}', 65),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '2takcwOaAZWiXQijPHIx7B', 'Time in a Bottle', 'Jim Croce', 'reflective', 'low', array['reflection','nostalgia','trust'], '{}', 70),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '0tgVpDi06FyKpA1z0VMD4v', 'Perfect', 'Ed Sheeran', 'reflective', 'medium', array['experience','relationship','appreciation'], '{}', 65),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '1mea3bSkSGXuIRvnydlB5b', 'Viva La Vida', 'Coldplay', 'reflective', 'high', array['reputation','change','leadership'], '{}', 70),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '2dpaYNEQHiRxtZbfNsse99', 'Happier', 'Marshmello & Bastille', 'mixed', 'low', array['mixed','support','expectations'], '{}', 65),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '7qiZfU4dY1lWllzX7mPBI3', 'Shape of You', 'Ed Sheeran', 'mixed', 'medium', array['conversation','engagement','community'], '{}', 60),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '7GhIk7Il098yCjg4BQjzvb', 'Take On Me', 'a-ha', 'mixed', 'high', array['change','momentum','debate'], '{}', 60),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '3n3Ppam7vgaVa1iaRUc9Lp', 'Mr. Brightside', 'The Killers', 'tense', 'low', array['friction','doubt','expectations'], '{}', 70),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '5ChkMS8OtdzJeqyybCc9R5', 'Billie Jean', 'Michael Jackson', 'tense', 'medium', array['reputation','claims','trust'], '{}', 70),
  ('166d8523-79a0-4b1c-b56f-8b40b6cc2f1f', '4uLU6hMCjMI75M1A2tKUQC', 'Never Gonna Give You Up', 'Rick Astley', 'tense', 'high', array['retention','reliability','support'], '{}', 60)
on conflict (brand_id, spotify_track_id) do nothing;
