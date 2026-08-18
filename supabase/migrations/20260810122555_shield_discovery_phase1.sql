create extension if not exists pgcrypto;

alter table public.crm_members
  add column if not exists shield_role text not null default 'viewer'
  check (shield_role in ('viewer', 'brand_analyst', 'security_analyst', 'legal_reviewer', 'communications_reviewer', 'administrator'));

update public.crm_members
set shield_role = case role
  when 'admin' then 'administrator'
  when 'manager' then 'brand_analyst'
  else 'viewer'
end
where shield_role = 'viewer';

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  asset_type text not null check (asset_type in ('domain', 'application', 'social_account', 'brand', 'logo', 'favicon', 'teacher', 'course', 'batch', 'product', 'lecture', 'pdf', 'module', 'video_fingerprint', 'audio_fingerprint', 'file_hash', 'watermark', 'ownership_reference', 'partner')),
  name text not null,
  canonical_value text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.crm_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, asset_type, canonical_value)
);

create table public.brand_terms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  term text not null,
  normalised_term text not null,
  term_type text not null default 'brand' check (term_type in ('brand', 'alias', 'teacher', 'course', 'batch', 'product', 'context')),
  requires_context boolean not null default false,
  context_terms text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.crm_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, normalised_term, term_type)
);

create table public.authorised_domains (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain text not null,
  allow_subdomains boolean not null default true,
  purpose text not null default '',
  active boolean not null default true,
  verified_at timestamptz,
  created_by uuid references public.crm_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, domain)
);

create table public.discovery_providers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider_key text not null,
  provider_type text not null check (provider_type in ('manual', 'search', 'certificate_transparency', 'social', 'rdap_dns', 'malicious_url')),
  display_name text not null,
  mode text not null default 'disabled' check (mode in ('live', 'fixture', 'disabled')),
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  rate_limit_state jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, provider_key)
);

create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  requested_by uuid references public.crm_members(id) on delete set null,
  run_type text not null check (run_type in ('manual_url', 'threat_search', 'scheduled_search', 'certificate_transparency', 'social_ingestion', 'reappearance')),
  status text not null default 'queued' check (status in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')),
  request jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{"discovered":0,"deduplicated":0,"scanned":0,"flagged":0}'::jsonb,
  provider_status jsonb not null default '{}'::jsonb,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.discovery_queries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  run_id uuid not null references public.discovery_runs(id) on delete cascade,
  provider_id uuid not null references public.discovery_providers(id) on delete restrict,
  query_text text not null,
  search_category text not null,
  cursor text,
  requested_limit integer not null default 25 check (requested_limit between 1 and 100),
  result_count integer not null default 0 check (result_count >= 0),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'rate_limited')),
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  ascii_domain text not null,
  unicode_domain text,
  domain_hash text not null,
  registrable_domain text not null,
  is_authorised boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, domain_hash)
);

create table public.url_candidates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete cascade,
  original_url text not null,
  canonical_url text not null,
  canonical_url_hash text not null,
  path_hash text not null,
  candidate_status text not null default 'discovered' check (candidate_status in ('discovered', 'queued', 'scanning', 'analysed', 'review', 'verified', 'irrelevant', 'false_positive', 'case_created', 'failed')),
  suspected_threat_type text,
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'urgent')),
  related_asset_id uuid references public.brand_assets(id) on delete set null,
  submitted_by uuid references public.crm_members(id) on delete set null,
  source_context jsonb not null default '{}'::jsonb,
  provider_confidence numeric(5,4) check (provider_confidence between 0 and 1),
  next_scan_at timestamptz,
  last_scanned_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, canonical_url_hash)
);

create table public.discovery_events (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  run_id uuid references public.discovery_runs(id) on delete cascade,
  query_id uuid references public.discovery_queries(id) on delete set null,
  provider_id uuid not null references public.discovery_providers(id) on delete restrict,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  discovery_method text not null,
  search_query text,
  ranking_position integer check (ranking_position is null or ranking_position > 0),
  title text,
  excerpt text,
  source_url text,
  provider_timestamp timestamptz,
  provider_confidence numeric(5,4) check (provider_confidence between 0 and 1),
  raw_provider_metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  unique (provider_id, candidate_id, source_url, search_query)
);

create table public.crawl_jobs (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  run_id uuid references public.discovery_runs(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'dead_letter', 'blocked')),
  priority smallint not null default 50 check (priority between 0 and 100),
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  worker_id text,
  last_error_code text,
  last_error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crawl_results (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  crawl_job_id bigint not null references public.crawl_jobs(id) on delete cascade,
  capture_version integer not null check (capture_version > 0),
  http_status integer,
  response_headers jsonb not null default '{}'::jsonb,
  redirect_chain jsonb not null default '[]'::jsonb,
  page_title text,
  metadata jsonb not null default '{}'::jsonb,
  visible_text text,
  sanitised_html_object_path text,
  screenshot_object_path text,
  favicon_object_path text,
  detected_images jsonb not null default '[]'::jsonb,
  form_fields jsonb not null default '[]'::jsonb,
  indicators jsonb not null default '{}'::jsonb,
  external_links jsonb not null default '[]'::jsonb,
  download_links jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  network_destinations jsonb not null default '[]'::jsonb,
  content_sha256 text,
  manifest_sha256 text,
  crawler_version text not null,
  captured_at timestamptz not null default now(),
  unique (candidate_id, capture_version)
);

create table public.domain_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete cascade,
  rdap jsonb not null default '{}'::jsonb,
  dns jsonb not null default '{}'::jsonb,
  tls jsonb not null default '{}'::jsonb,
  cloudflare_relationship text not null default 'relationship_unknown' check (cloudflare_relationship in ('none_detected', 'reverse_proxy_likely', 'registrar_confirmed', 'hosted_service_detected', 'relationship_unknown')),
  registration_date timestamptz,
  expiration_date timestamptz,
  registrar text,
  abuse_contact text,
  nameservers text[] not null default '{}',
  resolved_ips inet[] not null default '{}',
  captured_at timestamptz not null default now()
);

create table public.infrastructure_observations (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  domain_snapshot_id uuid not null references public.domain_snapshots(id) on delete cascade,
  ip inet,
  asn bigint,
  network_operator text,
  likely_hosting_provider text,
  cdn_provider text,
  infrastructure_confidence numeric(5,4) check (infrastructure_confidence between 0 and 1),
  relationship_features jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create table public.content_matches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  crawl_result_id uuid references public.crawl_results(id) on delete cascade,
  asset_id uuid references public.brand_assets(id) on delete set null,
  match_type text not null check (match_type in ('brand_entity', 'domain_similarity', 'logo', 'favicon', 'page_text', 'login_text', 'payment_text', 'teacher_reference', 'course_reference', 'batch_reference', 'sha256', 'ocr_text', 'page_perceptual_hash', 'watermark', 'video_interface', 'audio_interface')),
  score numeric(5,4) not null check (score between 0 and 1),
  deterministic boolean not null default true,
  feature_explanation jsonb not null default '{}'::jsonb,
  model_version text,
  created_at timestamptz not null default now()
);

create table public.threat_scores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  brand_match_score numeric(5,2) not null check (brand_match_score between 0 and 100),
  infringement_confidence numeric(5,2) not null check (infringement_confidence between 0 and 100),
  harm_score numeric(5,2) not null check (harm_score between 0 and 100),
  reach_score numeric(5,2) not null check (reach_score between 0 and 100),
  velocity_score numeric(5,2) not null check (velocity_score between 0 and 100),
  classification_confidence numeric(5,2) not null check (classification_confidence between 0 and 100),
  recurrence_score numeric(5,2) not null check (recurrence_score between 0 and 100),
  priority_score numeric(5,2) not null check (priority_score between 0 and 100),
  handling_band text not null check (handling_band in ('monitor', 'low', 'analyst_review', 'high', 'urgent')),
  formula_version text not null,
  feature_explanation jsonb not null default '{}'::jsonb,
  scored_at timestamptz not null default now()
);

create table public.threat_cases (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete restrict,
  title text not null,
  threat_type text not null,
  status text not null default 'candidate' check (status in ('candidate', 'verified', 'investigating', 'legal_review', 'security_review', 'monitoring', 'removed', 'resolved', 'reappeared', 'rejected', 'false_positive')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'relevant', 'irrelevant', 'false_positive', 'verified')),
  priority_score numeric(5,2) not null default 0 check (priority_score between 0 and 100),
  owner_id uuid references public.crm_members(id) on delete set null,
  supporting_team_id uuid references public.crm_teams(id) on delete set null,
  created_by uuid references public.crm_members(id) on delete set null,
  legal_status text not null default 'not_requested' check (legal_status in ('not_required', 'not_requested', 'pending', 'approved', 'changes_requested')),
  enforcement_eligible boolean not null default false,
  recurrence_count integer not null default 0 check (recurrence_count >= 0),
  version integer not null default 1 check (version > 0),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, candidate_id)
);

create table public.case_evidence (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  crawl_result_id uuid references public.crawl_results(id) on delete set null,
  evidence_version integer not null check (evidence_version > 0),
  original_url text not null,
  canonical_url text not null,
  object_prefix text not null,
  manifest_sha256 text not null,
  discovery_snapshot jsonb not null default '{}'::jsonb,
  infrastructure_snapshot jsonb not null default '{}'::jsonb,
  analysis_snapshot jsonb not null default '{}'::jsonb,
  immutable_after_submission boolean not null default false,
  captured_at timestamptz not null default now(),
  unique (case_id, evidence_version)
);

create table public.case_actions (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  actor_id uuid references public.crm_members(id) on delete set null,
  action_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.case_assignments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  member_id uuid not null references public.crm_members(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('owner', 'brand', 'security', 'legal', 'communications', 'watcher')),
  assigned_by uuid references public.crm_members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (case_id, member_id, assignment_role)
);

create table public.enforcement_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  created_by uuid references public.crm_members(id) on delete set null,
  draft_type text not null check (draft_type in ('copyright', 'trademark', 'phishing', 'malware', 'platform_report', 'correction', 'retraction')),
  recipient text not null,
  body jsonb not null default '{}'::jsonb,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'pending_legal', 'approved', 'changes_requested', 'rejected')),
  approved_by uuid references public.crm_members(id) on delete set null,
  approved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.enforcement_submissions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  draft_id uuid not null references public.enforcement_drafts(id) on delete restrict,
  submitted_by uuid not null references public.crm_members(id) on delete restrict,
  external_destination text not null,
  external_reference text,
  status text not null check (status in ('recorded_manual_submission', 'acknowledged', 'rejected', 'removed')),
  provider_response jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.reappearance_links (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  original_case_id uuid not null references public.threat_cases(id) on delete cascade,
  new_candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  match_score numeric(5,2) not null check (match_score between 0 and 100),
  match_features jsonb not null default '{}'::jsonb,
  status text not null default 'suspected' check (status in ('suspected', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  unique (original_case_id, new_candidate_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  brand_id uuid not null references public.brands(id) on delete cascade,
  actor_id uuid references public.crm_members(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index brand_assets_brand_active_idx on public.brand_assets (brand_id, asset_type) where active;
create index brand_terms_brand_active_idx on public.brand_terms (brand_id, term_type) where active;
create index authorised_domains_brand_active_idx on public.authorised_domains (brand_id, domain) where active;
create index discovery_providers_brand_idx on public.discovery_providers (brand_id, enabled, provider_type);
create index discovery_runs_queue_idx on public.discovery_runs (brand_id, status, created_at desc);
create index discovery_queries_run_idx on public.discovery_queries (run_id, status, created_at);
create index domains_brand_domain_idx on public.domains (brand_id, ascii_domain);
create index url_candidates_review_idx on public.url_candidates (brand_id, candidate_status, created_at desc);
create index url_candidates_domain_idx on public.url_candidates (domain_id, last_scanned_at desc);
create index discovery_events_candidate_idx on public.discovery_events (candidate_id, discovered_at desc);
create index discovery_events_run_idx on public.discovery_events (run_id, discovered_at);
create index crawl_jobs_claim_idx on public.crawl_jobs (status, priority desc, available_at, id) where status = 'queued';
create index crawl_jobs_candidate_idx on public.crawl_jobs (candidate_id, created_at desc);
create index crawl_results_candidate_idx on public.crawl_results (candidate_id, captured_at desc);
create index domain_snapshots_domain_idx on public.domain_snapshots (domain_id, captured_at desc);
create index infrastructure_snapshot_idx on public.infrastructure_observations (domain_snapshot_id, observed_at desc);
create index content_matches_candidate_idx on public.content_matches (candidate_id, match_type, score desc);
create index threat_scores_candidate_idx on public.threat_scores (candidate_id, scored_at desc);
create index threat_cases_queue_idx on public.threat_cases (brand_id, status, priority_score desc, updated_at desc);
create index threat_cases_owner_idx on public.threat_cases (owner_id, status, updated_at desc);
create index case_evidence_case_idx on public.case_evidence (case_id, evidence_version desc);
create index case_actions_case_idx on public.case_actions (case_id, created_at desc);
create index case_assignments_member_idx on public.case_assignments (member_id, active, created_at desc);
create index enforcement_drafts_case_idx on public.enforcement_drafts (case_id, approval_status, updated_at desc);
create index enforcement_submissions_case_idx on public.enforcement_submissions (case_id, submitted_at desc);
create index reappearance_original_idx on public.reappearance_links (original_case_id, status, created_at desc);
create index audit_events_entity_idx on public.audit_events (brand_id, entity_type, entity_id, created_at desc);
create index discovery_events_metadata_gin on public.discovery_events using gin (raw_provider_metadata jsonb_path_ops);

create trigger brand_assets_updated_at before update on public.brand_assets for each row execute function public.set_crm_updated_at();
create trigger brand_terms_updated_at before update on public.brand_terms for each row execute function public.set_crm_updated_at();
create trigger authorised_domains_updated_at before update on public.authorised_domains for each row execute function public.set_crm_updated_at();
create trigger discovery_providers_updated_at before update on public.discovery_providers for each row execute function public.set_crm_updated_at();
create trigger discovery_runs_updated_at before update on public.discovery_runs for each row execute function public.set_crm_updated_at();
create trigger domains_updated_at before update on public.domains for each row execute function public.set_crm_updated_at();
create trigger url_candidates_updated_at before update on public.url_candidates for each row execute function public.set_crm_updated_at();
create trigger crawl_jobs_updated_at before update on public.crawl_jobs for each row execute function public.set_crm_updated_at();
create trigger threat_cases_updated_at before update on public.threat_cases for each row execute function public.set_crm_updated_at();
create trigger enforcement_drafts_updated_at before update on public.enforcement_drafts for each row execute function public.set_crm_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'brand_assets', 'brand_terms', 'authorised_domains', 'discovery_providers',
    'discovery_runs', 'discovery_queries', 'discovery_events', 'url_candidates',
    'domains', 'domain_snapshots', 'crawl_jobs', 'crawl_results',
    'infrastructure_observations', 'content_matches', 'threat_scores', 'threat_cases',
    'case_evidence', 'case_actions', 'case_assignments', 'enforcement_drafts',
    'enforcement_submissions', 'reappearance_links', 'audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.active and cm.brand_id = %I.brand_id))',
      table_name || '_member_read', table_name, table_name
    );
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end $$;

grant usage, select on sequence public.discovery_events_id_seq, public.crawl_jobs_id_seq,
  public.infrastructure_observations_id_seq, public.case_actions_id_seq,
  public.audit_events_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shield-evidence', 'shield-evidence', false, 52428800, array['image/png', 'image/jpeg', 'text/html', 'text/plain', 'application/json', 'application/pdf'])
on conflict (id) do nothing;

create policy shield_evidence_member_read on storage.objects for select to authenticated
using (
  bucket_id = 'shield-evidence'
  and exists (
    select 1 from public.crm_members cm
    where cm.user_id = (select auth.uid())
      and cm.active
      and cm.brand_id::text = (storage.foldername(name))[1]
  )
);

with pw_brand as (
  select id from public.brands where lower(replace(name, ' ', '')) in ('physicswallah', 'physicswallah(pw)') order by created_at limit 1
)
insert into public.brand_terms (brand_id, term, normalised_term, term_type, requires_context, context_terms)
select id, seed.term, lower(seed.term), seed.term_type, seed.requires_context, seed.context_terms
from pw_brand
cross join (values
  ('Physics Wallah', 'brand', false, array[]::text[]),
  ('PhysicsWallah', 'alias', false, array[]::text[]),
  ('PW', 'alias', true, array['education','exam','batch','course','teacher','lecture','app']::text[]),
  ('PW App', 'product', false, array[]::text[]),
  ('PW Vidyapeeth', 'product', false, array[]::text[]),
  ('PW Skills', 'product', false, array[]::text[]),
  ('PW OnlyIAS', 'product', false, array[]::text[]),
  ('Alakh Pandey', 'teacher', false, array['physics','education','teacher','course']::text[])
) as seed(term, term_type, requires_context, context_terms)
on conflict (brand_id, normalised_term, term_type) do nothing;

with pw_brand as (
  select id from public.brands where lower(replace(name, ' ', '')) in ('physicswallah', 'physicswallah(pw)') order by created_at limit 1
)
insert into public.authorised_domains (brand_id, domain, purpose, verified_at)
select id, seed.domain, seed.purpose, now()
from pw_brand
cross join (values
  ('pw.live', 'Primary Physics Wallah domain'),
  ('physicswallah.live', 'Physics Wallah web property'),
  ('physicswallah.onelink.me', 'Authorised application deep links')
) as seed(domain, purpose)
on conflict (brand_id, domain) do nothing;

with pw_brand as (
  select id from public.brands where lower(replace(name, ' ', '')) in ('physicswallah', 'physicswallah(pw)') order by created_at limit 1
)
insert into public.discovery_providers (brand_id, provider_key, provider_type, display_name, mode, enabled, configuration)
select id, seed.provider_key, seed.provider_type, seed.display_name, seed.mode, seed.enabled, seed.configuration
from pw_brand
cross join (values
  ('manual', 'manual', 'Manual URL Submission', 'live', true, '{"immediate":true}'::jsonb),
  ('exa', 'search', 'Exa Search', 'disabled', false, '{"credential":"EXA_API_KEY"}'::jsonb),
  ('certificate_transparency', 'certificate_transparency', 'Certificate Transparency', 'fixture', false, '{"adapter":"crtsh"}'::jsonb),
  ('oval_social', 'social', 'Existing OVAL Social URLs', 'live', true, '{"source":"mentions"}'::jsonb),
  ('rdap_dns', 'rdap_dns', 'RDAP and DNS', 'live', true, '{"public_protocols":true}'::jsonb),
  ('google_web_risk', 'malicious_url', 'Google Web Risk', 'disabled', false, '{"credential":"GOOGLE_WEB_RISK_API_KEY"}'::jsonb)
) as seed(provider_key, provider_type, display_name, mode, enabled, configuration)
on conflict (brand_id, provider_key) do nothing;
