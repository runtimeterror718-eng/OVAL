# Gati — OVAL Shield Discovery Engine · Phase 1

## What is implemented

Shield is a human-reviewed brand and content protection pipeline for Physics Wallah. It stores operational state in Supabase, runs bounded discovery providers, normalises and deduplicates URLs, queues isolated public-web captures, preserves versioned private evidence, enriches domains, calculates separate confidence/priority scores, and supports review, case ownership and complaint preparation.

It does **not** log in to suspected services, bypass access controls, submit forms, download or execute files, or automatically send complaints. A discovery signal is not a legal determination.

## Architecture

1. `brand_assets`, `brand_terms`, and `authorised_domains` are the protected registry.
2. A manual URL or Threat Search creates a `discovery_run`, provider queries, immutable discovery events, canonical URL candidates and persisted crawl jobs.
3. The Celery Shield worker claims queued jobs, checks DNS and the allowlist, captures bounded public content in Playwright, writes private evidence objects and records RDAP/DNS/TLS observations.
4. Deterministic match features and separate brand, infringement, harm, reach, velocity, classification and recurrence scores feed a review queue.
5. A reviewer can reject, verify or promote a candidate. Case evidence is snapshotted independently of future crawls.
6. Only a verified case with an evidence pack can prepare a complaint draft. Legal approval and manual external submission are separate audited actions. OVAL never submits automatically.

Provider failures are isolated at query level. Existing cases and evidence remain usable when search or reputation providers are unavailable.

## Discovery providers

- Manual URL submission: enabled by default; queueing success is not a crawl-success claim.
- Exa Search: official Search API adapter; requires server-side `EXA_API_KEY` and an enabled `exa` registry row.
- Certificate Transparency: `crt.sh` adapter behind `SHIELD_CT_ENABLED=true` and an enabled registry row. Certificate issuance is only a lead.
- Existing OVAL social URLs: registry slot is present for controlled ingestion of public source URLs.
- RDAP/DNS/TLS: public protocol enrichment. Missing data stays unknown.
- Google Web Risk: optional `GOOGLE_WEB_RISK_API_KEY`. `no_match` means “not listed by this query,” never “safe.”

Provider status, last success/error and rate-limit state are stored in `discovery_providers`; the UI must not describe a provider as live until a successful run has updated `last_success_at`.

## URL and crawler safety

- HTTP(S) only; URL credentials and fragments are rejected.
- Hostnames are IDN-normalised; default ports and tracking parameters are removed before SHA-256 deduplication.
- Official domains and subdomains are blocked from suspicious crawling.
- Private, loopback, link-local, multicast and reserved IPv4/IPv6 ranges are blocked.
- DNS is resolved before navigation and checked again after navigation; changed/no-overlap answers fail closed.
- Every browser request is checked. Media/fonts and non-HTTP requests are aborted.
- Downloads are disabled. Forms are observed but never submitted.
- Redirects, time and page bytes are bounded. HTML is sanitised before private storage.
- Worker logs contain internal IDs/error classes and never credentials or captured page bodies.

The worker is designed for a dedicated worker service. For stronger production isolation, run it in its own container/network policy and without access to internal service networks.

## Scores and decisions

The priority formula is versioned as `shield-priority-v1`:

`35% harm + 25% reach + 20% velocity + 10% classification confidence + 10% recurrence`

Brand-match confidence and infringement confidence are stored separately and do not disappear inside priority. Handling bands are monitor `<30`, low `<50`, analyst review `<70`, high `<85`, and urgent `>=85`. These bands route work; they do not prove infringement.

Cloudflare relationships are explicitly classified as reverse proxy, registrar, hosted service, none detected or unknown. A reverse-proxy signal is never presented as proof that Cloudflare hosts the origin.

## Evidence and reappearance

Each crawl has a monotonically increasing capture version, content hash, manifest hash, exact canonical URL, timestamp, response metadata, redirect chain, visible text and private HTML/screenshot paths. Evidence packs copy discovery, infrastructure and analysis snapshots into the case. Once a human submission is recorded, associated evidence is marked immutable.

Reappearance matching uses domain similarity, exact content hashes, text/favicon similarity and infrastructure overlap. Suspected links require reviewer confirmation and retain both original and new candidate IDs.

## Access control

Shield uses the existing `@pw.live` Supabase session and `crm_members.user_id = auth.uid()` membership. Roles are viewer, brand analyst, security analyst, legal reviewer, communications reviewer and administrator. Browser roles only receive brand-scoped read grants; all mutations pass through authenticated server APIs using the service-role client. Evidence objects live in the private `shield-evidence` bucket and are returned with short-lived signed URLs.

Local bypass is limited to the repository’s existing loopback-only CRM development switch. Do not enable it in deployment.

## Configuration and operations

Apply `supabase/migrations/20260810122555_shield_discovery_phase1.sql`, then configure only server-side variables documented in `.env.example` and `oval/.env.local.example`. Never use `NEXT_PUBLIC_` for Shield keys.

Run the worker and scheduler using the existing Celery setup. `workers.tasks.process_shield_crawl_queue` drains at most five jobs per minute. Failed attempts enter a retry/dead-letter state and are visible for operators; a failure never deletes prior evidence.

API groups:

- `/api/shield/manual`, `/runs`, `/runs/[id]`
- `/api/shield/candidates`, `/candidates/[id]`, `/domains/[id]`
- `/api/shield/cases`, `/cases/[id]`, `/cases/[id]/evidence-pack`
- `/api/shield/cases/[id]/drafts`, `/drafts/[id]`, `/drafts/[id]/submissions`
- `/api/shield/evidence/[id]`, `/config`

## Validation and known limits

Run `npm run test:shield`, `uv run --with pytest pytest -q tests/test_shield_safety.py`, the production Next build, and the Supabase migration/database advisors. Local Supabase validation requires Docker.

Phase 1 intentionally does not include authentication bypass, credentialed crawling, evasion, automated enforcement, media-fingerprint model training, guaranteed global search coverage, or claims of ownership/infringement without a human decision. A public page can change between discovery and capture, and RDAP/hosting attribution may remain incomplete behind privacy services or reverse proxies.

Phase 2 can add approved provider coverage, dedicated container network policies, OCR/perceptual media services, richer social ingestion, reviewer-calibrated thresholds and reappearance graph visualisation after Phase 1 telemetry is reviewed.
