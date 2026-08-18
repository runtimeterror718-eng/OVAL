# OVAL — Concept Note

**Working proposition:** See what people are saying, understand what it means, and move the right team before the issue spreads.

**Primary context:** Physics Wallah (PW)
**Product type:** Audience intelligence, reputation operations, issue workflow, and digital brand protection
**Document status:** Product and economic concept; figures in the economics section are planning assumptions, not audited forecasts
**Version:** August 2026

---

## 1. Executive summary

OVAL is an intelligence and action system built for organisations with large, multilingual audiences. It brings together public conversations, owned-channel engagement, app reviews, support tickets, search signals, and suspected brand-abuse signals in one operating view.

The product is designed around a simple problem: organisations already possess thousands of signals, but those signals remain fragmented across teams and tools. A product team sees app reviews, support sees tickets, communications sees social posts, and legal or security sees piracy and impersonation reports. Nobody sees the whole story early enough.

OVAL turns this fragmented evidence into a shared operational loop:

> **Listen → understand → retrieve evidence → prioritise → assign → resolve → learn**

It is not merely a social-listening dashboard and it is not a single AI model. It is a governed, multi-model system in which AI assists classification, semantic clustering, retrieval, summarisation, and prioritisation while people retain responsibility for operational, reputational, and legal decisions.

For PW, OVAL can answer five practical questions:

1. What should PW know today across all audience channels?
2. What specific product, support, faculty, delivery, or reputation problems are driving the conversation?
3. Which evidence supports each conclusion?
4. Who inside the organisation owns the response, and is it being resolved within SLA?
5. Where are piracy, impersonation, phishing, or counterfeit experiences emerging?

---

## 2. The problem OVAL addresses

### 2.1 Fragmented listening

Relevant audience evidence is distributed across Play Store reviews, Freshdesk tickets, LinkedIn, X, YouTube, Reddit, Instagram, search results, public websites, and official social accounts. Each source has a different format, access model, vocabulary, and pace.

### 2.2 High volume, low comprehension

Counting positive and negative mentions does not explain why sentiment changed. Teams need semantic meaning: app crashes during tests, refund anxiety, admit-card confusion, teacher-led criticism, workplace narratives, course piracy, or account impersonation.

### 2.3 Weak connection between insight and action

Traditional monitoring tools often stop at charts and alerts. They do not preserve evidence, assign a clear owner, track an SLA, document decisions, or confirm whether the underlying problem was resolved.

### 2.4 Indian-language and context gaps

PW’s audience communicates in English, Hindi, Hinglish, slang, abbreviations, sarcasm, and memes. Keyword matching alone cannot reliably connect phrases such as “refund nahi mila,” “money not returned,” and “paisa wapas nahi aaya” to the same underlying issue.

### 2.5 Brand abuse requires a different standard

A negative opinion is not piracy, phishing, or impersonation. Brand protection needs separate evidence, infrastructure enrichment, reviewer verification, immutable records, and human-approved enforcement. Conflating criticism with infringement creates legal and reputational risk.

---

## 3. Product vision

OVAL should become PW’s shared audience operating system: one place where product, engineering, support, brand, communications, HR, legal, and leadership can work from the same evidence without losing the context of the original source.

The long-term product has four connected layers:

| Layer | Purpose | Primary users |
|---|---|---|
| **Audience Intelligence** | Understand conversation, sentiment, issue clusters, and emerging themes | Leadership, product, support, brand, communications |
| **Issue Operations** | Convert intelligence into accountable work with owners, tasks, SLAs, and closure | Managers, PMs, EMs, support and operations teams |
| **Shield / Gati** | Discover and investigate potential piracy, impersonation, phishing, and counterfeit properties | Brand protection, security, legal and communications |
| **Experience Layer** | Make intelligence accessible through summaries, search, alerts, integrations, and the Sentiment Vault | All authorised OVAL users |

---

## 4. Product capabilities

### 4.1 Cross-platform Overview

The Overview answers **“What should PW know today?”** It combines current evidence across channels into an executive narrative, source-level summaries, conversation drivers, and a forward-looking narrative forecast.

It should show:

- Important cross-channel developments, not a generic sentiment statement.
- The sources contributing to every conclusion.
- Current signal coverage and freshness.
- Provocative but representative evidence that invites deeper investigation.
- Direct paths into the relevant source page or issue workflow.

### 4.2 Audience Intelligence by source

Each channel page uses a common interaction model while preserving source-specific metrics.

| Source | Core intelligence |
|---|---|
| **Play Store** | Rating movement, negative-review intelligence, app-version damage, device-model failures, issue clusters, and source reviews |
| **Freshdesk** | SSAT, ticket volume, issue clusters, recurring support friction, emerging trends, and mapped operational ownership |
| **LinkedIn** | Network narrative, positive/neutral/negative posts, workplace and business themes, and dated source evidence |
| **X** | Hashtag and conversation narratives, high-velocity criticism, community replies, and external/owned separation |
| **YouTube** | Video and comment intelligence, creator-led narratives, transcript signals, and direct source links |
| **Reddit** | Community and subreddit narratives, complete threads, criticism patterns, and recurring student concerns |
| **Instagram** | Official and ecosystem posts, comment threads, creator narratives, and media-derived signals where permitted |
| **Google / public web** | Search suggestions, news, discoverability, reputation results, and public-web evidence |

Common filters should include Today, Yesterday, Last 7 Days, Last 30 Days, and Month Wise. A selected filter must update totals, sentiment distribution, summaries, clusters, charts, and evidence—not just the visible label.

### 4.3 Semantic intelligence and RAG

OVAL uses semantic retrieval to group meaning rather than exact words. The canonical vector collection stores:

- Individual channel evidence.
- Deterministic semantic clusters.
- Latest channel summaries.

The intended flow is:

1. Source records are collected and stored with stable identifiers.
2. Text is normalised, language-aware, and deduplicated without erasing distinct people’s experiences.
3. Embeddings represent semantic meaning.
4. Related evidence is grouped into interpretable issue clusters.
5. Retrieval filters by brand, source, period, sentiment, and document type before ranking.
6. The summariser receives only retrieved evidence and cluster summaries.
7. Every material insight remains traceable to source records.

Qdrant is the canonical semantic-retrieval layer. Supabase remains the source of record for posts, comments, reviews, tickets, workflow state, and evidence snapshots. A checked-in or Supabase-backed fallback can preserve basic functionality during a Qdrant outage, but must be labelled as fallback data.

### 4.4 OVAL Issue CRM

The Issues module converts a semantic problem cluster into accountable organisational work.

Lifecycle:

> **New → Triaged → Assigned → In Progress → Blocked / Resolved → Closed**

Each issue can contain:

- Severity, priority, owning team, accountable owner, PM/EM/support collaborators, and due date.
- Immutable snapshots of the source evidence used when the issue was created.
- Tasks, comments, mentions, activity history, and resolution notes.
- SLA calculation, approaching-breach notifications, and overdue status.
- Reopen and closure controls with an audit reason.

Qdrant proposes semantically supported issue candidates; Supabase owns the workflow. Existing issue management must remain operational when semantic candidate generation is unavailable.

### 4.5 Official Social Integrations

The Integrations area is the controlled connection layer for official LinkedIn, X, Facebook, and Instagram accounts.

Principles:

- Official OAuth only; OVAL must never request platform passwords.
- Read-only permissions in the first version.
- Multiple PW accounts and sub-brands per provider.
- Incremental synchronisation, webhook deduplication, and sync history.
- Posts, comments, replies, timestamps, authors, engagement, and source links preserved where provider access allows.
- Owned records clearly distinguished from external public intelligence.
- Provider limitations and incomplete historical coverage clearly disclosed.

Connection management belongs in Integrations; intelligence remains on the relevant channel page.

### 4.6 OVAL Sentiment Vault

Vault is an editorial experience that translates each channel’s current audience mood into one approved Spotify track, an evidence-grounded explanation, and a slideshow of representative comments.

It is designed to make audience mood memorable, not to replace the analytical dashboard. Tracks come from an admin-curated catalogue; Spotify never autoplays; music and evidence slides remain technically independent. Weekly snapshots preserve how each channel’s mood changed over time.

Vault is currently a feature-gated experience and should only be made prominent after the core intelligence and workflow surfaces are stable.

### 4.7 OVAL Shield and Gati

Shield is the brand-protection workspace. Gati is the proprietary detection and qualification engine inside Shield.

Potential inputs include Exa web discovery, certificate-transparency leads, public social URLs, manual submissions, existing OVAL evidence, DNS, RDAP/WHOIS, TLS, SEO metadata, redirect chains, page fingerprints, and bounded static artifact inspection.

Gati deliberately scores two questions separately:

1. **Brand relevance:** Is the property genuinely connected to PW or its protected assets?
2. **Threat evidence:** Is there evidence of piracy, impersonation, phishing, fraud, or harmful misuse?

This separation prevents generic “PW” pages, legitimate commentary, and lawful resale from being treated as infringement.

Shield supports discovery, safe capture, enrichment, evidence preservation, analyst review, case ownership, complaint preparation, and reappearance monitoring. It does not bypass access controls, execute untrusted files, or automatically submit complaints. Legal interpretation and enforcement remain human-approved actions.

### 4.8 Assistant and natural-language access

OVAL can expose a conversational interface—working name **Awaaz**—over the governed retrieval layer. It should answer questions with citations, state the selected period and source coverage, distinguish evidence from inference, and refuse to invent missing information.

Awaaz is an interface over OVAL’s data and retrieval architecture, not a separately trained foundation model. Fine-tuning should only be considered later for narrow, evaluated tasks where retrieval and prompting are insufficient.

---

## 5. End-to-end operating model

The implemented channel endpoints, payloads, filtering boundary, ingestion jobs, and semantic processing are documented in [CHANNEL_API_CONTRACTS.md](./CHANNEL_API_CONTRACTS.md).

```text
Platform APIs / OAuth / Exa / exports / public web / manual leads
                              │
                              ▼
                 Collection and normalisation
        stable IDs · source type · language · timestamps · threads
                              │
                              ▼
                  Supabase system of record
      source data · workflow · memberships · audit · evidence snapshots
                              │
                              ▼
             Enrichment and semantic synchronisation
 sentiment · severity · issue taxonomy · embeddings · deduplication
                              │
                              ▼
                    Qdrant retrieval layer
       evidence points · semantic clusters · channel summaries
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
       Intelligence surfaces       Issue candidates / Shield
                 │                         │
                 └────────────┬────────────┘
                              ▼
            Human decision, assignment and resolution
                              │
                              ▼
                Outcome measurement and learning
```

---

## 6. Data and AI governance

### Evidence standard

- Every material conclusion should expose its supporting evidence.
- Source URLs, timestamps, provider IDs, and immutable promotion snapshots should be retained where policy permits.
- A summary must disclose low sample size, stale coverage, fallback retrieval, or provider failure.
- Aggregate sentiment must never be presented as a statistically representative survey unless sampling supports that claim.

### Security standard

- Secrets and service-role credentials remain server-side and never use `NEXT_PUBLIC_` variables.
- Brand-scoped data access is enforced with Supabase RLS and active membership.
- OAuth tokens are encrypted at rest and unavailable to browser roles.
- External fetchers block private and reserved networks, unsafe redirects, credentialed URLs, and unbounded downloads.
- Freshdesk and other private evidence is redacted before display or LLM processing when required.

### Human decision standard

- AI classification is a recommendation, not a fact.
- Reputation criticism must remain distinct from abuse or infringement.
- Closure, enforcement, legal escalation, and external communication require accountable human approval.
- Analyst corrections should be captured for threshold calibration and evaluation.

### Evaluation standard

OVAL should report quality by task rather than claim one universal “AI accuracy” number:

- Sentiment agreement by language and source.
- Negative/critical precision and recall.
- Cluster coherence and cluster stability.
- Evidence citation validity.
- Duplicate and false-merge rate.
- Candidate-to-verified-issue conversion.
- Shield false-positive and reappearance-confirmation rate.
- Summary faithfulness under manual review.

---

## 7. Users and organisational value

| User | Decision supported by OVAL |
|---|---|
| Leadership | What changed, what matters, and where intervention is required |
| Product and engineering | Which app, device, feature, or learning experience is failing students |
| Support operations | Which ticket themes are growing and where closure is weak |
| Brand and communications | Which narratives are accelerating and what evidence supports them |
| PMs and EMs | Which issue they own, its evidence, due date, and resolution status |
| HR and people teams | Which workplace or faculty narratives require investigation |
| Legal and security | Which verified properties require evidence preservation or enforcement review |
| Analysts | How source coverage, models, clustering, and retrieval produced an insight |

---

## 8. Economics and business case

### 8.1 Economic principle

OVAL should be justified by the value of earlier detection and faster resolution—not by the number of charts or AI calls. Its economic value comes from five levers:

1. Analyst hours avoided through filtering, clustering, and retrieval.
2. Lower time-to-detection for product, support, and reputation problems.
3. Lower time-to-owner and time-to-resolution through CRM accountability.
4. Reduced leakage from verified piracy, impersonation, and phishing where action is successful.
5. Better product and support decisions through cross-channel evidence.

OVAL must not claim that every negative mention causes lost revenue or that every takedown creates a recovered sale. Those outcomes require measured attribution.

### 8.2 Monthly cost model

The planning formula is:

```text
Monthly OVAL cost =
  platform and discovery access
  + compute and application hosting
  + database, vector storage and evidence storage
  + embedding, transcription and LLM inference
  + notifications and observability
  + analyst and engineering operations
  + security, legal and compliance overhead
```

At meaningful scale, provider access and people—not vector search—are likely to be the largest costs.

### 8.3 Illustrative operating scenarios

These figures are directional planning ranges in INR and must be replaced with actual vendor quotations, usage logs, and loaded payroll costs.

| Monthly scenario | Lean pilot | Department production | Enterprise scale |
|---|---:|---:|---:|
| Signals processed | 100,000 | 1,000,000 | 5,000,000 |
| Active users | 10 | 50 | 150 |
| Platform/discovery access | ₹25k–₹1.5L | ₹1.5L–₹6L | ₹5L–₹20L |
| App, workers and observability | ₹25k–₹60k | ₹80k–₹2L | ₹2L–₹6L |
| Database, Qdrant and evidence storage | ₹5k–₹25k | ₹25k–₹1L | ₹1L–₹3L |
| AI, embeddings and transcription | ₹10k–₹50k | ₹50k–₹2L | ₹1.5L–₹6L |
| Human operations | ₹75k–₹2L | ₹2L–₹5L | ₹5L–₹12L |
| **Indicative monthly total** | **₹1.4L–₹4.85L** | **₹5.05L–₹16L** | **₹14.5L–₹47L** |

Why the ranges are wide:

- Official API and social-listening rights vary materially by provider and access tier.
- Video/audio transcription costs depend on media duration, not post count.
- Shield evidence storage and browser capture are more expensive than text ingestion.
- Human review requirements rise with legal and enforcement scope.
- Self-hosting can lower vendor spend but raises engineering and reliability costs.

### 8.4 Unit economics

OVAL should track these internal units:

| Unit | Calculation |
|---|---|
| Cost per collected signal | Total ingestion cost ÷ valid source records |
| Cost per enriched signal | Collection + embedding + classification cost ÷ enriched records |
| Cost per verified issue | Intelligence and review cost ÷ promoted issues |
| Cost per resolved issue | Total issue-operations cost ÷ resolved issues |
| Cost per verified Shield case | Discovery, capture, enrichment and review cost ÷ verified cases |
| Cost per successful action | Total Shield case cost ÷ confirmed completed actions |

Counting raw search results as useful signals would artificially improve these metrics. Costs should use accepted, deduplicated, policy-compliant records.

### 8.5 Illustrative value calculations

**Manual review efficiency**

```text
Hours avoided = valid signals × manual minutes per signal × automation share ÷ 60
Value = hours avoided × loaded hourly cost
```

Example only: 100,000 monthly signals × 0.5 minutes × 80% avoided equals about 667 hours. At a loaded cost of ₹750 per hour, the capacity value is approximately ₹5 lakh per month. This is only valid if teams actually redeploy that capacity to higher-value work.

**Issue-resolution value**

```text
Value = affected cases × measured reduction in resolution time
        × cost per unresolved hour or case
```

**Brand-protection value**

```text
Expected recovered contribution =
  verified harmful transactions at risk
  × action success probability
  × conversion recovery rate
  × contribution margin
```

Website traffic multiplied by course price is not a defensible piracy-loss estimate.

### 8.6 Investment gates

Further investment should depend on measured results:

| Gate | Suggested evidence |
|---|---|
| Pilot continuation | Reliable source freshness, >80% evidence citation validity, regular weekly usage |
| Production expansion | Measurable reduction in time-to-detection and time-to-owner |
| CRM rollout | Teams update status and closure without analyst chasing |
| Shield expansion | Acceptable verified-candidate yield and legal-review capacity |
| Provider upgrade | Additional coverage produces actionable evidence, not only more volume |
| Multi-brand productisation | Brand isolation, repeatable onboarding, and positive contribution margin |

### 8.7 Commercial model if productised

A defensible commercial model would combine:

- Annual platform fee for users, governance, dashboards, and workflow.
- Usage band for processed signals, media minutes, and retained evidence.
- Pass-through or contracted provider-access fees.
- Optional managed intelligence and Shield analyst services.
- Enterprise add-ons for SSO, custom retention, private deployment, and API access.

Pricing should not be based solely on mention volume because high-volume sources can be low-value while a small number of verified legal or safety signals can be strategically important.

---

## 9. Success metrics

### Intelligence quality

- Source freshness and successful-sync rate.
- Percentage of summaries with valid evidence citations.
- Cluster coherence and analyst acceptance.
- Duplicate rate and distinct-author preservation.
- Coverage warnings acknowledged and resolved.

### Operational outcomes

- Median time from signal to triage.
- Median time from triage to owner.
- SLA compliance and overdue issue rate.
- Resolution and reopen rate.
- Percentage of critical/high issues with a documented resolution.

### Shield outcomes

- Discovery lead-to-verified-case conversion.
- False-positive rate by provider.
- Evidence-pack completion time.
- Confirmed action and reappearance rates.
- Provider and infrastructure attribution confidence.

### Adoption

- Weekly active decision-makers.
- Source-page to issue-promotion rate.
- Evidence opens per summary.
- Teams resolving work directly in OVAL.
- Recurring executive brief usage.

### Economics

- Cost per accepted signal, verified issue, resolved issue, and verified Shield case.
- Manual-review hours avoided.
- Cost of provider access per actionable outcome.
- Contribution margin if offered outside PW.

---

## 10. Delivery roadmap

### Phase 1 — Trusted intelligence

- Stabilise Play Store, Freshdesk, LinkedIn, X, YouTube, Reddit, and relevant public-web ingestion.
- Make 30 days the consistent default while retaining daily and monthly views.
- Enforce source freshness, pagination, thread formatting, and evidence links.
- Evaluate sentiment and clusters on representative Hindi, Hinglish, and English samples.
- Precompute channel summaries to improve page speed.

### Phase 2 — Accountable action

- Deploy Supabase migrations and production auth for Issue CRM.
- Establish the ownership directory and SLA rules with participating teams.
- Promote semantic clusters into issues with immutable evidence.
- Add Slack/in-app notifications and measure resolution behaviour.

### Phase 3 — Official-channel depth

- Obtain provider approvals and connect official accounts through OAuth.
- Backfill the maximum permitted history and label coverage gaps.
- Preserve posts, comments, and reply threads.
- Separate Owned, External, and All intelligence.

### Phase 4 — Shield operations

- Calibrate Gati against analyst-reviewed positive and negative examples.
- Run discovery and capture workers in isolated infrastructure.
- Formalise legal approval, complaint templates, evidence retention, and reappearance review.
- Add providers only when they improve verified-case yield.

### Phase 5 — Predictive and experiential intelligence

- Validate narrative velocity and emerging-trend forecasts.
- Introduce governed Awaaz access with citations and permission-aware retrieval.
- Enable Vault after its editorial catalogue and weekly archive are operational.
- Consider multi-brand onboarding only after PW workflows are repeatable.

---

## 11. Current implementation boundary

The repository contains working or partially implemented surfaces for audience intelligence, source pages, Qdrant-backed summaries, Issue CRM, official integrations, Sentiment Vault, and Shield/Gati. Availability in a local build does not by itself mean a module is production-ready.

Before describing a capability as live, verify:

- Required Supabase migrations are applied.
- RLS and role permissions are enabled.
- Provider applications and OAuth permissions are approved.
- Scheduler and worker processes are running.
- Server-side environment variables are configured.
- The UI reports current provider health and data freshness.
- Production build, security checks, and representative data tests pass.

Historical figures in earlier OVAL documents are useful development snapshots, but should not be quoted as current coverage. Live counts must come from runtime source and retrieval health.

---

## 12. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Provider access changes or rate limits | Official APIs where possible, isolated adapters, cursor persistence, and explicit coverage warnings |
| Misclassified sarcasm or Hinglish | Source-specific evaluation, human correction, lexicon support, and conservative confidence labels |
| AI-generated claims unsupported by data | Retrieval-only evidence context, citations, snapshotting, and faithfulness review |
| Duplicate content inflates themes | Stable provider IDs, canonical URLs, text fingerprints, and author-aware deduplication |
| Public criticism treated as abuse | Separate relevance and threat scoring; mandatory analyst/legal decisions |
| Sensitive support information leaks | Server-side redaction, private storage, signed access, retention policies, and RLS |
| Dashboard becomes passive reporting | Issue promotion, clear owners, SLA tracking, and outcome measurement |
| Costs increase without value | Unit economics, provider-yield reviews, caching, batching, and investment gates |

---

## 13. Decision requested

Approve OVAL as a staged internal intelligence programme rather than a single large platform launch.

The recommended immediate commitment is a 90-day operational pilot focused on:

1. Reliable source coverage for the five highest-value channels.
2. Evidence-grounded semantic summaries and issue clustering.
3. One cross-functional issue workflow with named owners and SLAs.
4. A calibrated Shield discovery queue with human verification only.
5. Instrumented costs and outcome metrics sufficient to decide the next investment gate.

At the end of the pilot, PW should be able to determine whether OVAL measurably reduces time-to-detection, time-to-owner, and time-to-resolution—and whether Gati produces enough verified cases to justify scaled brand-protection operations.

---

## 14. One-line articulation

> **OVAL turns the voice of PW’s audience—and threats against its digital brand—into evidence, ownership, and measurable action.**
