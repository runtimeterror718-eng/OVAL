alter table public.domain_snapshots
  add column if not exists whois jsonb not null default '{}'::jsonb;

comment on column public.domain_snapshots.whois is
  'Parsed, privacy-minimised domain WHOIS metadata. Raw WHOIS responses are not persisted.';
