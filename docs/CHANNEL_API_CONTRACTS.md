# OVAL Channel API Contracts and Backend Processing

**Scope:** Current repository implementation as of August 2026
**Audience:** Frontend, backend, data, ML, product, and platform teams
**Status:** Describes implemented behaviour. The final section proposes a production v2 contract.

---

## 1. Runtime architecture

The Audience Intelligence frontend does not receive one universal channel response. It combines three layers:

```text
GET /api/{channel}                         source-specific facts and evidence
GET /api/vector-summary?platform={channel} semantic clusters from Qdrant or local fallback
GET /api/owned-social/{provider}           official OAuth evidence, where applicable
                    │
                    ▼
       frontend source-specific normalizer
                    │
                    ▼
      date, search, sentiment and source filters
                    │
                    ▼
          common Audience Intelligence UI
```

For LinkedIn and X, official OAuth evidence is merged with external evidence. Facebook and the current Audience Intelligence Instagram view use the owned-social endpoint directly. Freshdesk uses its dedicated dashboard component.

### Current filtering boundary

The following filters are currently applied client-side after retrieval:

- Today
- Yesterday
- Last 7 Days
- Last 30 Days
- Month Wise
- Owned / External / All
- Free-text search
- Positive / Neutral / Negative evidence

The base `/api/{channel}` routes generally accept no date or sentiment parameters. This means a filter changes the current browser model, not the backend query. The backend may already impose its own fixed window, such as 90 days for LinkedIn, 60 days for Reddit, or 30 days for YouTube.

---

## 2. Shared channel-intelligence contract

Play Store, Freshdesk, Reddit, YouTube, Instagram, and Google build a shared `contract` object in addition to their legacy source-specific response.

```ts
type ChannelIntelligenceContract = {
  version: "2026-06-channel-intelligence-v1";
  channel: ChannelId;
  sourceStatus: {
    mode: "live" | "static_upload" | "hybrid" | "demo" | "failed";
    latestFetchedAt: string | null;
    dataWindowStart: string | null;
    dataWindowEnd: string | null;
    freshness: "fresh" | "stale" | "static" | "failed" | "unknown";
    freshnessLabel: string;
    limitations: string[];
  };
  volume: {
    totalItems: number;
    textItems: number;
    analyzedItems: number;
  };
  sentiment: {
    method: string;
    positive: number;
    negative: number;
    neutral: number;
    mixed: number;
    confidence: number;
  };
  supervisedTopics: IntelligenceTopic[];
  unsupervisedClusters: IntelligenceTopic[];
  priorityQueue: PriorityItem[];
  incidentCandidates: IncidentCandidate[];
  processing: {
    pipeline: string[];
    algorithms: Record<string, string>;
    quality: {
      enrichedItems: number;
      reviewableItems: number;
      piiRedactedItems: number;
      likelySpamItems: number;
      averageEvidenceScore: number;
    };
  };
  leadershipRead: {
    headline: string;
    whatChanged: string;
    whyItMatters: string;
    recommendedActions: string[];
  };
};
```

LinkedIn and X currently return source-specific payloads without this `contract` field. The frontend normalizes them independently.

### Common deterministic enrichment pipeline

Every source that calls `buildChannelContract()` follows this sequence:

1. Canonical source adapter.
2. Unicode and whitespace cleanup.
3. Emoji, hashtag, and mention extraction.
4. Hinglish normalisation.
5. PII masking.
6. PW relevance detection.
7. Entity and metadata extraction.
8. Hierarchical topic classification.
9. Intent, sentiment, emotion, and sarcasm detection.
10. Severity, urgency, and evidence scoring.
11. Recommended-owner routing.
12. Incident-candidate scoring.

The current implementation is predominantly deterministic and rule-based at this API-contract layer. Semantic clustering and RAG are added separately through Qdrant.

### Priority calculation

The common channel logic blends:

- Base severity: 25%
- Reach: 15%
- Business impact: 15%
- Exam sensitivity: 10%
- Classification confidence: 10%
- Escalation keywords: 5%
- Channel-specific adjustments

Examples of channel adjustments include low Play Store ratings, unresolved Freshdesk status, high-engagement Reddit posts, Google complaint terms, and YouTube academic-risk language.

---

## 3. Semantic cluster and summary contract

### `GET /api/vector-summary`

Required query parameter:

| Parameter | Type | Required | Allowed values |
|---|---|---:|---|
| `platform` | string | Yes | `playstore`, `freshdesk`, `linkedin`, `x`, `youtube`, `reddit`, `facebook`, `instagram` |

Success response:

```ts
type VectorSummaryResponse = {
  live: true;
  provider: "qdrant" | "semantic-local";
  fallback_reason?:
    | "qdrant_not_configured"
    | "qdrant_unavailable"
    | "semantic_clusters_not_indexed";
  generated_at: string;
  model?: string;
  method?: string;
  cluster_scope?: string;
  clusters: Array<{
    id: string;
    label: string;
    summary: string;
    why_it_matters?: string;
    count: number;
    share: number;
    confidence?: "low" | "medium" | "high";
    cohesion?: number;
    subthemes?: string[];
    sentiment?: { positive: number; neutral: number; negative: number };
    representative_evidence?: Record<string, unknown>[];
    source_ids?: string[];
    rank?: number;
  }>;
  summary: {
    platform: string;
    headline: string;
    what_is_happening: string;
    why_it_matters: string;
    recommended_action: string;
    key_findings: string[];
    source_count: number;
    clustered_source_count?: number;
    risk_level: "watch" | "medium" | "high";
    sentiment: {
      positive: number;
      neutral: number;
      negative: number;
      negative_rate: number;
    };
    confidence_note: string;
  };
};
```

Errors:

- Unsupported platform: HTTP `400` with `{ live: false, error: "Unsupported platform" }`.
- Missing local artifact for a valid platform: HTTP `404`.
- Missing or unavailable Qdrant: HTTP `200` with `provider: "semantic-local"` when a local artifact exists.

### Semantic backend logic

`scripts/semantic_cluster_sync.py` performs the clustering:

1. Read up to the configured per-platform source limit.
2. Redact and clean text; Freshdesk-specific logic strips device and attachment metadata.
3. Apply channel-specific relevance gates.
4. Deduplicate exact text for Reddit, YouTube, and X. LinkedIn intentionally keeps each captured row so cluster counts reconcile with the feed.
5. Prefer negative evidence for issue clusters. If fewer than eight negative records exist, use all evidence.
6. Create normalised multilingual embeddings with `paraphrase-multilingual-MiniLM-L12-v2`.
7. Compare each signal to curated semantic topic prototypes.
8. Assign each signal to its closest prototype.
9. Calculate the centroid, cohesion, prototype similarity, phrases, sentiment counts, and representative evidence.
10. Produce deterministic UUIDs, complete source IDs, ranks, and a local public artifact.

This is semantic prototype clustering, not free-form LLM clustering.

`scripts/qdrant_channel_sync.py` then:

1. Reads existing OpenAI embeddings where available.
2. Generates missing 1,536-dimensional `text-embedding-3-small` vectors.
3. Upserts `channel_evidence` points with stable IDs.
4. Replaces each platform’s current `semantic_cluster` points.
5. Generates and embeds one `channel_summary` point.
6. Uses deterministic summaries when an LLM is unavailable or fails.

The canonical Qdrant collection is `oval_channel_mentions_v1`, using cosine distance and three document types:

- `channel_evidence`
- `semantic_cluster`
- `channel_summary`

---

## 4. Overview API

### `GET /api/overview`

Parameters: none.

Primary sources:

- `mentions`
- `reddit_posts`
- `instagram_posts`
- `geo_aggregates`
- `mention_embeddings`
- Optional RAG queries for positive and negative themes

Response:

```ts
type OverviewResponse = {
  live: boolean;
  brand?: { id: string; name: string };
  stats?: {
    totalMentions: number;
    healthScore: number;
    negativePercent: number;
    positivePercent: number;
    neutralPercent: number;
    byPlatform: Record<string, {
      total: number;
      negative: number;
      positive: number;
    }>;
    sentimentSource: "llm-classified-embeddings" | "rule-based-mentions";
  };
  topRedditPosts?: unknown[];
  topIgPosts?: unknown[];
  geo?: unknown[];
  recentMentions?: unknown[];
  rag?: {
    enabled: boolean;
    negativeAnalysis: RAGResult | null;
    positiveAnalysis: RAGResult | null;
  };
};
```

Processing notes:

- Supabase reads and RAG calls execute in parallel.
- Classified embedding labels take precedence over legacy mention sentiment.
- The health score is a bounded heuristic based on positive rate, weighted negative rate, and sample volume. It is not a survey score.
- Only the most recent 500 mentions are read in the legacy path.

---

## 5. Play Store

### `GET /api/playstore`

Parameters: none.
Caching: `force-dynamic`, explicit `no-store` response headers.

Primary sources:

1. Supabase tables from `PLAYSTORE_REVIEWS_TABLE`, default `playstore_reviews`.
2. Static `playstore-insights.json` fallback and historical baseline.
3. Static `playstore-monthly-history.json` for historical chart continuity.

Principal response fields:

```ts
type PlayStoreResponse = {
  live: true;
  contract: ChannelIntelligenceContract;
  contracts: Record<string, ChannelIntelligenceContract>;
  apps: Record<string, PlayStoreAppSummary>;
  primaryPackage: string;
  appOptions: Array<{
    packageName: string;
    name: string;
    sampleSize: number;
    latestReviewAt: string | null;
  }>;
  dateRange: { from: string | null; to: string | null };
  liveReviews: NormalizedPlayStoreReview[];
  livePulledAt: string | null;
  liveSource: string;
  liveRefreshCadenceHours: 1;
};
```

Each app summary includes rating distribution, average rating, low-rating rate, reply rate, daily/monthly trends, themes, versions, release comparison, languages, device intelligence, critical examples, divergent high-rated complaints, and positive examples.

Backend processing:

1. `scripts/pull_playstore_reviews.py` authenticates with the Android Publisher service account.
2. It pulls configured PW packages and normalises author, rating, text, version, date, reply, language, device, and helpful-vote fields.
3. It upserts batches of 500 into Supabase and maintains local pull artifacts/logs.
4. The API reads Supabase in pages of 1,000 records.
5. Field aliases are normalised to the canonical review model.
6. Data is grouped by Android package.
7. Ratings, reply rates, themes, versions, devices, languages, and trends are recomputed.
8. Live months override overlapping historical artifact months.
9. Theme classification uses explicit product/support keyword groups.
10. The common channel contract creates priority and issue candidates.

Important limitation: Google Play’s API exposes a recent operational window; Play Console exports are needed for durable historical coverage.

---

## 6. Freshdesk

### `GET /api/freshdesk`

Parameters: none.
Caching: `force-static`.

Primary source: generated `freshdesk-insights.json`.

Response:

```ts
type FreshdeskResponse = {
  live: true;
  contract: ChannelIntelligenceContract;
  generatedAt: string;
  sourceFile: string;
  dataWindow: { createdAtMin: string | null; createdAtMax: string | null };
  stats: FreshdeskStats;
  statusBreakdown: unknown[];
  groups: unknown[];
  categories: unknown[];
  clusters: unknown[];
  taxonomyGaps: unknown[];
  topL1: unknown[];
  topL2: unknown[];
  topL3: unknown[];
  activeExamples: FreshdeskTicket[];
  urgentExamples: FreshdeskTicket[];
  confidence: {
    volume: "low" | "medium" | "high";
    timeSeries: string;
    reason: string;
  };
};
```

Backend processing:

1. `scripts/build_freshdesk_insights.py` reads a Freshdesk CSV export.
2. It normalises status, assignment group, L1/L2/L3 taxonomy, subject, and description.
3. Keyword rules classify operational categories and recommended owners/actions.
4. It separates active from controlled (`Resolved` or `Closed`) tickets.
5. It calculates queue composition, category shares, taxonomy gaps, and group workloads.
6. It preserves bounded active, urgent, category, cluster, and group examples.
7. The API converts active and urgent examples into canonical signals.
8. Operational blockage is treated as negative for the channel contract.

Current limitation: this is a static CSV snapshot, not a live Freshdesk API integration. The route cannot establish reliable SLA recovery, reopen behaviour, or trend direction unless repeated dated exports or live API fields are added.

---

## 7. LinkedIn

### `GET /api/linkedin`

Parameters: none.
Backend fixed window: 90 days, with fallback to all stored rows when the window is empty.
Caching: dynamic, no-store.

Response:

```ts
type LinkedInResponse = {
  live: boolean;
  window?: "last 90 days";
  generatedAt?: string;
  stats: {
    totalPosts: number;
    negative: number;
    positive: number;
    neutral: number;
    negRate: number;
  };
  summary: {
    total: number;
    negRate: number;
    counts: { positive: number; neutral: number; negative: number };
    topTheme: string;
    themes: Array<{ label: string; count: number }>;
    categories: Array<{ key: string; label: string; count: number }>;
    headline: string;
    narrative: string;
    topNegatives: LinkedInPost[];
  } | null;
  posts: LinkedInPost[];
};
```

Backend processing:

1. Exa discovery occurs outside the Python ingest script, normally through Exa MCP/API search.
2. Search output is saved as JSON or event-stream text.
3. `scripts/ingest_linkedin_exa.py` parses the output.
4. The post title/body must independently mention a recognised PW brand term. Exa’s own summary cannot satisfy relevance.
5. Pure hiring promotions are discarded unless they contain complaint context.
6. Canonical URLs remove query strings; URL SHA-1 creates a stable platform reference.
7. Existing URLs are refreshed instead of duplicated.
8. Data is written to both `linkedin_posts` and canonical `mentions`.
9. Sentiment uses the Exa verdict only when supported by the source text; otherwise deterministic negative/positive rules apply.
10. The API applies the same relevance and hiring gates to legacy rows.
11. Posts are sorted negative, then neutral, then positive; within a sentiment, controversy density and recency determine order.
12. Negative posts are grouped into workplace, termination, salary, finance, scam, refund/support, and recruitment themes.

LinkedIn currently has no shared `contract` object. Qdrant semantic clusters are applied separately in the frontend.

---

## 8. X

### `GET /api/x`

Parameters: none.
Live cache: in-process, 10 minutes.

Source precedence:

1. Official X recent-search API when `X_BEARER_TOKEN` or `TWITTER_BEARER_TOKEN` works.
2. Supabase `twitter_tweets` from the last successful persisted ingestion.
3. Stored semantic-cluster artifact.

Response:

```ts
type XResponse = {
  live: boolean;
  setupRequired: boolean;
  source: "x-api" | "supabase" | "stored-snapshot";
  query: string;
  criticalQuery: string;
  window: string;
  retrieval: {
    generalRequested: 100;
    criticalRequested: number;
    generalRetrieved: number;
    criticalRetrieved: number;
    uniqueRetrieved: number;
    verifiedNegative: number;
    cacheMinutes: 10;
  };
  stats: { totalPosts: number; positive: number; neutral: number; negative: number };
  summary: { narrative: string };
  analysis: {
    headline: string;
    summary: string;
    criticalEngagement: number;
    targetedRetrieved: number;
    verifiedNegative: number;
    themes: unknown[];
    topCriticalPosts: XPost[];
  };
  clusters: unknown[];
  posts: XPost[];
  error?: string;
  fallbackReason?: string;
};
```

Backend processing:

1. Execute a broad PW query and a complaint-focused PW query in parallel.
2. Request up to 100 posts from each recent-search query.
3. Expand authors and public engagement metrics.
4. Deduplicate by X post ID.
5. Apply deterministic negative/positive keyword classification.
6. Build product, payment, learning, support, business, and workplace themes.
7. Calculate critical engagement from likes, replies, and reposts.
8. If the X API returns credit, authentication, permission, or availability errors, serve persisted evidence with explicit error and fallback metadata.

The route returns HTTP `200` for a usable fallback even when live X retrieval fails.

### Official X account contract

Owned X posts and replies use `/api/owned-social/x` after OAuth. They are merged with the external X payload in the browser and retain `sourceType: "owned"`.

---

## 9. YouTube

### `GET /api/youtube`

Parameters: none.
Backend fixed window: 30 days.
Caching: dynamic.

Principal response fields:

```ts
type YouTubeResponse = {
  live: boolean;
  contract: ChannelIntelligenceContract;
  stats: {
    totalChannels: number;
    totalVideos: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalSubscribers: number;
    prRiskCount: number;
    sentiment: SentimentCounts & { total: number; overall: string; source: string };
  };
  backfill: { windowDays: 30; from: string; to: string; seededRecentNegative: number; source: string };
  channels: unknown[];
  videos: unknown[];
  latest24hWindow: { from: string; to: string };
  latest24hShorts: unknown[];
  latest24hVideos: unknown[];
  pwShorts: unknown[];
  pwVideos: unknown[];
  monthlyTrend: unknown[];
  commentTrend: unknown[];
  clusters: unknown[];
  youtubeBriefBuckets: unknown[];
  attentionCards: unknown[];
  prRiskVideos: unknown[];
  topComments: unknown[];
  rag: RAGEnvelope;
};
```

Backend processing:

1. YouTube collectors use the Data API for channels, video search, metadata, and comments.
2. Stored tables are `youtube_channels`, `youtube_videos`, and `youtube_comments`.
3. Title triage, transcripts, transcript sentiment, PR severity, and PR summaries are read from enriched video rows.
4. The API queries videos and comments in the last 30 days.
5. It merges a small checked-in recent PR-risk backfill by video ID; duplicates are removed.
6. PR-risk, severity, negative sentiment, views, and recency determine video order.
7. Videos are separated into Shorts and standard videos.
8. Comment sentiment and embedding sentiment are used where available.
9. Monthly video/comment trends and rule-based topic clusters are generated.
10. RAG generates a current YouTube briefing when configured.
11. The common contract builds semantic candidates and priority routing.

Current limitations include inferred PW ownership, engagement-biased comment selection, and checked-in backfill items mixed with live tables. Every backfill item carries a source note.

---

## 10. Reddit

### `GET /api/reddit`

Parameters: none.
Backend fixed window: 60 days.
Caching: dynamic.

Principal response fields:

```ts
type RedditResponse = {
  live: boolean;
  contract: ChannelIntelligenceContract;
  stats: {
    totalMentions: number;
    negativeCount: number;
    positiveCount: number;
    neutralCount: number;
    sentiment: string;
    topSubreddit: string;
    sentimentSource: string;
    totalEmbeddings: number;
    window: "last 60 days";
    liveScrapedPosts: number;
    googleFallbackPosts: number;
  };
  posts: Array<{
    subreddit: string;
    title: string;
    snippet: string;
    upvotes: number;
    comments: number;
    sentiment: string;
    source: string;
    url: string;
    createdAt: string;
    topComments: unknown[];
  }>;
  sentimentTrend: unknown[];
  monthlyTrend: unknown[];
  commentTrend: unknown[];
  clusters: unknown[];
  totalComments: number;
  subredditBreakdown: unknown[];
  meta: unknown;
  pullLog: unknown[];
  rag: RAGEnvelope;
};
```

Backend processing:

1. The Reddit scraper prefers OAuth search and chronological subreddit listings.
2. It can use constrained fallback discovery when OAuth is unavailable.
3. The API reads the last 60 days from `reddit_posts` and retains only PW-specific posts; all posts in PW-owned subreddits are accepted as relevant.
4. Google-indexed fallback rows are used only when no live Reddit posts exist.
5. Up to 2,000 comments are fetched for the included post IDs and grouped by parent post.
6. Visible post/comment sentiment takes precedence, then embedding labels, then legacy rules.
7. Monthly and weekly sentiment, engagement, subreddits, and topic clusters are calculated.
8. RAG produces a subreddit-aware narrative when configured.
9. Pull-log rows are reconstructed from stored ingestion timestamps rather than fabricated run records.

---

## 11. Instagram

Instagram currently has two different data contracts.

### External/legacy: `GET /api/instagram`

Parameters: none.
Caching: dynamic.

Sources:

- `instagram_posts`
- `instagram_comments`
- canonical `mentions`
- `mention_embeddings`
- a small curated search-discovered fallback
- optional RAG

Response includes `contract`, `stats`, attention cards, detailed AI narrative, hashtags, accounts, media types, sentiment/monthly/comment trends, clusters, comments, posts, owned-looking reels, and RAG metadata.

Processing:

1. Filter posts through PW brand, batch, programme, and faculty relevance rules.
2. Restrict comments to relevant post IDs.
3. Prefer stored LLM/embedding sentiment; otherwise infer sentiment from text.
4. Aggregate hashtags, accounts, media types, reach, and comments.
5. Prioritise PR-risk or negative posts, then posts with repeated negative comments, then engagement.
6. Generate previews for a bounded number of posts using public metadata where available.
7. Merge curated fallback content only when primary source content is missing or incomplete.
8. Build common topics, clusters, attention cards, and RAG output.

### Official account: `GET /api/owned-social/instagram`

The current generic Audience Intelligence page uses the official OAuth endpoint for Instagram. This means legacy `/api/instagram` remains available but is not the primary fetch for that page.

---

## 12. Facebook and official social accounts

### `GET /api/owned-social/{provider}`

Allowed providers: `linkedin`, `x`, `facebook`, `instagram`.

Authentication: active OVAL/CRM member context is required.

Query parameters:

| Parameter | Type | Default | Constraint |
|---|---|---:|---|
| `limit` | integer | 200 | Minimum 10, maximum 500 |
| `cursor` | ISO timestamp | none | Returns posts older than the cursor |

Response:

```ts
type OwnedSocialResponse = {
  provider: "linkedin" | "x" | "facebook" | "instagram";
  source: "official-oauth";
  connections: Array<{
    id: string;
    display_name: string;
    username: string | null;
    status: string;
    coverage_started_at: string | null;
    last_synced_at: string | null;
    last_error: string | null;
  }>;
  coverage: {
    earliest: string | null;
    latest: string | null;
    hasMore: boolean;
    nextCursor: string | null;
  };
  stats: {
    totalPosts: number;
    totalComments: number;
    totalSignals: number;
    positive: number;
    neutral: number;
    negative: number;
  };
  clusters: unknown[];
  posts: Array<OwnedPost & { comments: OwnedComment[] }>;
};
```

Backend synchronisation:

- LinkedIn: organisation posts and comments through Community Management APIs.
- X: authored timeline plus conversation replies where the developer plan permits recent search.
- Facebook: managed Page feed, comments, and replies through Graph API.
- Instagram: professional-account media, comments, and replies through Instagram APIs.

All provider rows are upserted using unique connection/provider IDs. Parent comment, root comment, and depth are preserved. Normalised copies are also written to `mentions` with `source_type = "owned"`. One provider failure creates a failed sync run without stopping the others.

---

## 13. Google

### `GET /api/google`

Parameters: none.

Sources:

- `google_autocomplete`
- `google_news`
- `google_trends`
- `google_seo_results`
- canonical Google `mentions`

Response includes `contract`, source counts, autocomplete suggestions, negative suggestions, fresh mentions, news, trends, regions, keyword lists, SERP results grouped by query, and topic clusters.

Processing:

1. Merge structured autocomplete with recent generic Google mentions.
2. Recalculate PW-specific autocomplete sentiment.
3. Deduplicate suggestions by exact suggestion text.
4. Group SERP results by search query.
5. Group trends by date and region.
6. Deduplicate news by title.
7. Classify search-intent risk separately from social sentiment.
8. Build monthly autocomplete and news trends.
9. Generate supervised and rule-based clusters.

Autocomplete percentages use suggestion count as their denominator; they do not represent audience sentiment or search volume.

---

## 14. Telegram

### `GET /api/telegram`

Parameters: none.
Cache: application cache, five-minute TTL.

Sources:

- `telegram_channels`
- `telegram_messages`
- Telegram `mention_embeddings`
- Optional RAG

Response fields:

- Channel, membership, message, view, forward, suspicious-content, and sentiment totals.
- Normalised channel list.
- Risk-label breakdown.
- Top messages and suspicious excerpts.
- Twelve-week message/view trend.
- Optional evidence-grounded RAG analysis.

Processing:

1. Classify channels as official, fan, suspicious, or fake from stored values.
2. Aggregate members, views, forwards, and message-risk labels.
3. Prefer embedding sentiment.
4. Rank message lists by stored views.
5. Build fixed weekly buckets in the API.
6. Cache the resulting response for five minutes.

---

## 15. RAG processing contract

Channel APIs that use `ragQuery()` follow this pipeline:

1. Embed the natural-language question.
2. Query Qdrant evidence where configured.
3. Fall back to Supabase pgvector during bootstrap or outage.
4. Apply brand, platform, and sentiment filters.
5. Retrieve a bounded candidate set.
6. Optionally rerank the candidates.
7. Send only retrieved evidence to the generation model.
8. Return the answer with confidence, count after reranking, average similarity, platforms, and sentiment breakdown.

Typical response envelope:

```ts
type RAGEnvelope = {
  enabled: boolean;
  analysis?: string;
  confidence?: number;
  mentionsUsed?: number;
  avgSimilarity?: number;
  sentimentBreakdown?: Record<string, number>;
};
```

RAG output is explanatory. Deterministic source counts should remain authoritative.

---

## 16. Current failure and fallback semantics

| Endpoint | Failure behaviour |
|---|---|
| `/api/playstore` | Uses static insight/history artifacts when live Supabase rows are unavailable |
| `/api/freshdesk` | Always serves the latest generated static artifact |
| `/api/linkedin` | Returns `{ live: false }` without configuration; empty live payload when brand is missing |
| `/api/x` | Returns stored Supabase or semantic snapshot with an error marker when X fails |
| `/api/youtube` | Can return demo data in demo mode; otherwise `{ live: false }` when brand is missing |
| `/api/reddit` | Uses Google-indexed fallback only when no live posts exist |
| `/api/instagram` | May merge or expose curated search-discovered fallback evidence |
| `/api/vector-summary` | Uses the local semantic artifact when Qdrant is absent or unavailable |
| `/api/owned-social/*` | Returns authenticated error responses; it does not fabricate account data |

Every UI surface should display the source mode and fallback reason. A successful HTTP response does not necessarily mean fresh live provider data.

---

## 17. Recommended production v2 contract

The present APIs grew source by source. Production should converge them into one server-filtered contract.

### Proposed request

```http
GET /api/v2/channels/{channel}/intelligence
  ?period=30d
  &from=2026-07-01T00:00:00Z
  &to=2026-07-31T23:59:59Z
  &sentiment=negative
  &sourceType=all
  &query=refund
  &cursor=opaque-cursor
  &limit=50
```

Rules:

- `period` and explicit `from/to` are mutually exclusive.
- Maximum period and page size are enforced server-side.
- Cursors encode stable sort keys, not page numbers.
- Filters apply before totals, summaries, clusters, and evidence are calculated.
- All dates are returned in UTC ISO 8601.

### Proposed common response

```ts
type ChannelIntelligenceV2 = {
  apiVersion: "2.0";
  requestId: string;
  generatedAt: string;
  channel: string;
  brand: { id: string; name: string };
  query: {
    period?: string;
    from: string;
    to: string;
    sentiment: string;
    sourceType: "owned" | "external" | "all";
    search?: string;
  };
  source: {
    mode: "live" | "static" | "hybrid" | "fallback";
    provider: string;
    latestSuccessfulSync: string | null;
    coverageFrom: string | null;
    coverageTo: string | null;
    warnings: string[];
  };
  metrics: {
    total: number;
    sentiment: SentimentCounts;
    sourceSpecific: Record<string, number | string | null>;
  };
  narrative: {
    headline: string;
    summary: string;
    whyItMatters: string;
    recommendedAction: string;
    evidenceIds: string[];
    confidence: number;
  };
  clusters: SemanticCluster[];
  evidence: EvidenceRecord[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
};
```

### Recommended migration steps

1. Publish JSON Schemas or Zod schemas for every current route.
2. Introduce the v2 endpoint without removing legacy routes.
3. Move period, search, source, and sentiment filtering into server queries.
4. Recompute metrics and cluster shares from the selected window.
5. Standardise HTTP errors and never use `live: false` as the only error signal.
6. Return explicit `source.mode`, `latestSuccessfulSync`, and `warnings` everywhere.
7. Remove checked-in content backfills from “live” responses or label every record as `fallback`.
8. Add authentication and brand membership to production intelligence APIs.
9. Generate a typed frontend client from the contract.
10. Add contract tests for date boundaries, pagination, fallbacks, and source-count reconciliation.

---

## 18. Source-of-truth rule

Use this hierarchy when two surfaces disagree:

1. Supabase source rows for exact posts, comments, reviews, tickets, timestamps, and workflow state.
2. Qdrant `channel_evidence` for semantic retrieval of those source rows.
3. Qdrant `semantic_cluster` for issue meaning and cluster membership.
4. Deterministic API aggregations for counts and percentages.
5. RAG narratives for explanation only.
6. Local artifacts only as labelled fallback or historical snapshots.

No LLM-generated count should override a deterministic count from the selected source records.
