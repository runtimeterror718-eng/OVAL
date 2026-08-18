-- Gati v1: proprietary qualification, campaign graph, artifact analysis,
-- worker observability and approval-gated enforcement routing for OVAL Shield.

create table public.gati_qualification_results (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  crawl_result_id uuid references public.crawl_results(id) on delete set null,
  analysis_version integer not null check (analysis_version > 0),
  brand_relevance_score numeric(5,2) not null check (brand_relevance_score between 0 and 100),
  threat_evidence_score numeric(5,2) not null check (threat_evidence_score between 0 and 100),
  confidence numeric(5,2) not null check (confidence between 0 and 100),
  verdict text not null check (verdict in ('discard', 'benign_reference', 'monitor', 'analyst_review', 'high_priority_review')),
  threat_type text not null check (threat_type in ('phishing', 'impersonation', 'piracy', 'credential_extraction', 'malicious_application', 'unauthorised_resale', 'legitimate_resale', 'security_research', 'criticism', 'unknown')),
  brand_signals jsonb not null default '{}'::jsonb,
  threat_signals jsonb not null default '{}'::jsonb,
  explanation text not null,
  model_version text not null,
  reviewed_by uuid references public.crm_members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, analysis_version)
);

create table public.gati_asset_fingerprints (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  asset_id uuid not null references public.brand_assets(id) on delete cascade,
  fingerprint_type text not null check (fingerprint_type in ('sha256', 'perceptual_image', 'visual_embedding', 'text_embedding', 'audio', 'video_frame', 'apk_signature', 'package_name')),
  fingerprint text not null,
  vector_reference text,
  algorithm_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (asset_id, fingerprint_type, fingerprint)
);

create table public.gati_artifact_analyses (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  crawl_result_id uuid references public.crawl_results(id) on delete set null,
  artifact_type text not null check (artifact_type in ('webpage', 'screenshot', 'logo', 'apk', 'xapk', 'pdf', 'archive', 'video', 'audio')),
  source_url text,
  object_path text,
  sha256 text,
  perceptual_hash text,
  package_name text,
  application_label text,
  version_name text,
  signing_certificate_sha256 text,
  permissions text[] not null default '{}',
  embedded_domains text[] not null default '{}',
  findings jsonb not null default '{}'::jsonb,
  risk_score numeric(5,2) not null default 0 check (risk_score between 0 and 100),
  analyzer_version text not null,
  status text not null default 'completed' check (status in ('queued', 'processing', 'completed', 'failed', 'blocked')),
  error_code text,
  analyzed_at timestamptz not null default now()
);

create table public.gati_entities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  entity_type text not null check (entity_type in ('domain', 'url', 'ip', 'nameserver', 'tls_certificate', 'registrar', 'hosting_provider', 'social_account', 'telegram_channel', 'repository', 'payment_handle', 'email', 'phone', 'app_package', 'apk_signature', 'content_fingerprint')),
  canonical_value text not null,
  display_value text not null,
  value_hash text not null,
  attributes jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, entity_type, value_hash)
);

create table public.gati_entity_links (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_entity_id uuid not null references public.gati_entities(id) on delete cascade,
  target_entity_id uuid not null references public.gati_entities(id) on delete cascade,
  relation_type text not null check (relation_type in ('resolves_to', 'uses_nameserver', 'uses_certificate', 'registered_by', 'hosted_by', 'redirects_to', 'links_to', 'distributes', 'shares_content', 'shares_infrastructure', 'uses_payment_handle', 'operated_by', 'mentions')),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source_entity_id, target_entity_id, relation_type)
);

create table public.gati_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_key text not null,
  title text not null,
  campaign_type text not null check (campaign_type in ('phishing', 'impersonation', 'piracy', 'malicious_application', 'credential_extraction', 'mixed', 'unknown')),
  status text not null default 'monitoring' check (status in ('monitoring', 'active', 'contained', 'resolved', 'false_positive')),
  risk_score numeric(5,2) not null default 0 check (risk_score between 0 and 100),
  summary text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, campaign_key)
);

create table public.gati_campaign_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid not null references public.gati_campaigns(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  match_score numeric(5,2) not null check (match_score between 0 and 100),
  match_reasons jsonb not null default '{}'::jsonb,
  added_at timestamptz not null default now(),
  unique (campaign_id, candidate_id)
);

create table public.gati_feedback_labels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  candidate_id uuid not null references public.url_candidates(id) on delete cascade,
  qualification_id uuid references public.gati_qualification_results(id) on delete set null,
  label text not null check (label in ('verified_threat', 'false_positive', 'legitimate_resale', 'security_research', 'criticism', 'official_partner', 'already_removed', 'insufficient_evidence')),
  threat_type text,
  reason text not null,
  labelled_by uuid not null references public.crm_members(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.gati_worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  worker_type text not null check (worker_type in ('scheduler', 'web_crawler', 'domain_enrichment', 'artifact_analysis', 'intelligence', 'enforcement')),
  worker_id text not null,
  status text not null check (status in ('starting', 'idle', 'working', 'degraded', 'stopped')),
  queue_name text,
  current_job_id text,
  metrics jsonb not null default '{}'::jsonb,
  version text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (worker_type, worker_id)
);

create table public.gati_enforcement_routes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  destination_type text not null check (destination_type in ('cloudflare_abuse', 'hosting_provider', 'registrar', 'search_engine', 'app_store', 'github', 'telegram', 'social_platform', 'payment_provider', 'cdn_storage', 'rights_holder_manual')),
  destination_name text not null,
  recipient text,
  submission_url text,
  routing_basis jsonb not null default '{}'::jsonb,
  provider_relationship text,
  recommended_notice_type text not null check (recommended_notice_type in ('copyright', 'trademark', 'phishing', 'malware', 'platform_report', 'cease_and_desist')),
  priority smallint not null default 50 check (priority between 0 and 100),
  status text not null default 'proposed' check (status in ('proposed', 'selected', 'dismissed', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, destination_type, destination_name)
);

create table public.gati_enforcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  case_id uuid not null references public.threat_cases(id) on delete cascade,
  route_id uuid not null references public.gati_enforcement_routes(id) on delete restrict,
  draft_id uuid not null references public.enforcement_drafts(id) on delete restrict,
  idempotency_key text not null,
  requested_by uuid not null references public.crm_members(id) on delete restrict,
  approved_by uuid not null references public.crm_members(id) on delete restrict,
  delivery_mode text not null default 'manual' check (delivery_mode in ('manual', 'provider_api')),
  status text not null default 'prepared' check (status in ('prepared', 'queued', 'submitted', 'acknowledged', 'failed', 'rejected', 'removed')),
  provider_reference text,
  response_snapshot jsonb not null default '{}'::jsonb,
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, idempotency_key)
);

create index gati_qualification_review_idx on public.gati_qualification_results
  (brand_id, verdict, threat_evidence_score desc, created_at desc);
create index gati_qualification_candidate_idx on public.gati_qualification_results
  (candidate_id, analysis_version desc);
create index gati_qualification_crawl_result_idx on public.gati_qualification_results (crawl_result_id);
create index gati_asset_fingerprints_lookup_idx on public.gati_asset_fingerprints
  (brand_id, fingerprint_type, fingerprint) where active;
create index gati_asset_fingerprints_asset_idx on public.gati_asset_fingerprints (asset_id);
create index gati_artifact_candidate_idx on public.gati_artifact_analyses
  (candidate_id, artifact_type, analyzed_at desc);
create index gati_artifact_crawl_result_idx on public.gati_artifact_analyses (crawl_result_id);
create index gati_artifact_package_idx on public.gati_artifact_analyses
  (brand_id, package_name) where package_name is not null;
create index gati_entities_lookup_idx on public.gati_entities
  (brand_id, entity_type, canonical_value);
create index gati_entity_links_source_idx on public.gati_entity_links
  (source_entity_id, relation_type, confidence desc);
create index gati_entity_links_target_idx on public.gati_entity_links
  (target_entity_id, relation_type, confidence desc);
create index gati_campaigns_queue_idx on public.gati_campaigns
  (brand_id, status, risk_score desc, last_seen_at desc);
create index gati_campaign_members_candidate_idx on public.gati_campaign_members
  (candidate_id, match_score desc);
create index gati_campaign_members_campaign_idx on public.gati_campaign_members (campaign_id);
create index gati_feedback_candidate_idx on public.gati_feedback_labels
  (candidate_id, created_at desc);
create index gati_feedback_qualification_idx on public.gati_feedback_labels (qualification_id);
create index gati_feedback_labelled_by_idx on public.gati_feedback_labels (labelled_by);
create index gati_worker_health_idx on public.gati_worker_heartbeats
  (status, last_seen_at desc);
create index gati_enforcement_routes_case_idx on public.gati_enforcement_routes
  (case_id, status, priority desc);
create index gati_enforcement_delivery_queue_idx on public.gati_enforcement_deliveries
  (status, created_at) where status in ('prepared', 'queued', 'failed');
create index gati_enforcement_deliveries_case_idx on public.gati_enforcement_deliveries (case_id);
create index gati_enforcement_deliveries_route_idx on public.gati_enforcement_deliveries (route_id);
create index gati_enforcement_deliveries_draft_idx on public.gati_enforcement_deliveries (draft_id);
create index gati_enforcement_deliveries_requested_by_idx on public.gati_enforcement_deliveries (requested_by);
create index gati_enforcement_deliveries_approved_by_idx on public.gati_enforcement_deliveries (approved_by);

create trigger gati_entities_updated_at before update on public.gati_entities
  for each row execute function public.set_crm_updated_at();
create trigger gati_campaigns_updated_at before update on public.gati_campaigns
  for each row execute function public.set_crm_updated_at();
create trigger gati_enforcement_routes_updated_at before update on public.gati_enforcement_routes
  for each row execute function public.set_crm_updated_at();
create trigger gati_enforcement_deliveries_updated_at before update on public.gati_enforcement_deliveries
  for each row execute function public.set_crm_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'gati_qualification_results', 'gati_asset_fingerprints',
    'gati_artifact_analyses', 'gati_entities', 'gati_entity_links',
    'gati_campaigns', 'gati_campaign_members', 'gati_feedback_labels',
    'gati_worker_heartbeats', 'gati_enforcement_routes',
    'gati_enforcement_deliveries'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (brand_id is null or exists (select 1 from public.crm_members cm where cm.user_id = (select auth.uid()) and cm.active and cm.brand_id = %I.brand_id))',
      table_name || '_member_read', table_name, table_name
    );
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end $$;
