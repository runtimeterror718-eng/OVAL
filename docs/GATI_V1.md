# Gati v1 — OVAL Shield Detection and Enforcement

Gati is the proprietary qualification and campaign engine inside OVAL Shield.
It assists analysts; it does not make legal determinations or send takedowns
automatically.

## Local verification

- Open `http://localhost:3001/shield`.
- The **Inside Gati** section shows qualification, campaign graph, worker health,
  artifact totals, and the human-approval enforcement guardrail.
- Open a row in **Threat Command Centre** to inspect brand relevance and threat
  evidence separately.
- Run engine tests from the repository root:
  `uv run --with pytest python -m pytest tests/test_gati_engine.py tests/test_shield_safety.py -q`.
- Run frontend Shield tests from `oval/`: `npm run test:shield`.

## Pipeline

1. Discovery creates canonical URL candidates from Exa, certificate
   transparency, internal social signals, or a manual URL.
2. The safe crawler blocks private and rebinding destinations, caps response
   size, sanitises content, and records DNS, RDAP, TLS, SEO, redirects, links,
   hashes, and private evidence-object references.
   Domain and resolved-IP WHOIS enrichment identifies the registrar, registrar
   WHOIS service, nameservers, network owner, ASN, address range, and abuse
   contacts. Raw WHOIS responses and registrant personal details are not stored.
   CDN/reverse-proxy ownership is kept separate from a probable origin host.
3. Gati scores **brand relevance** independently from **threat evidence**. This
   prevents generic `PW` pages and legitimate physical-book resale from being
   treated as piracy.
4. Graph entities connect domains, URLs, IPs, nameservers, certificates,
   content fingerprints, social handles, and repositories into campaigns.
5. Analysts provide feedback and may promote a verified candidate into a case.
6. Gati resolves possible enforcement destinations only for a human-verified,
   enforcement-eligible case. Evidence generation and legal draft approval are
   required before an idempotent manual delivery record can be prepared.

## Application artifacts

`python scripts/gati_analyze_artifact.py /path/to/file.apk` performs bounded
static ZIP/APK/XAPK inspection. It hashes the file, extracts a capped set of
embedded domains and suspicious archive entries, and never executes the file.

## Scheduling and secrets

Set these only in an ignored server-side environment file:

- `EXA_API_KEY`
- `SHIELD_TRIGGER_TOKEN`
- `OVAL_INTERNAL_URL` (normally `http://127.0.0.1:3001` locally)

Celery Beat calls the private scheduled endpoint every six hours. The endpoint
rejects requests without the trigger token. Provider API submission remains
disabled in v1; Slack, email, registrar, hosting, search, and Cloudflare routes
are prepared for human review only.
