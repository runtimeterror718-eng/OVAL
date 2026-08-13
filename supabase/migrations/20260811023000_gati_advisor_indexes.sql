-- Cover Gati foreign keys used during brand cleanup, review, and graph traversal.
create index if not exists gati_campaign_members_brand_idx
  on public.gati_campaign_members (brand_id);
create index if not exists gati_enforcement_routes_brand_idx
  on public.gati_enforcement_routes (brand_id);
create index if not exists gati_entity_links_brand_idx
  on public.gati_entity_links (brand_id);
create index if not exists gati_feedback_labels_brand_idx
  on public.gati_feedback_labels (brand_id);
create index if not exists gati_qualification_reviewed_by_idx
  on public.gati_qualification_results (reviewed_by)
  where reviewed_by is not null;
create index if not exists gati_worker_heartbeats_brand_idx
  on public.gati_worker_heartbeats (brand_id)
  where brand_id is not null;
