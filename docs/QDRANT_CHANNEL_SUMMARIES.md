# Qdrant RAG retrieval

Qdrant is OVAL's canonical retrieval layer. Supabase remains the source of
record for scraped posts, comments, reviews and tickets.

## Canonical collection

`oval_channel_mentions_v1` uses 1,536-dimensional cosine vectors generated with
`text-embedding-3-small`. One collection stores three payload types:

- `channel_evidence`: individual source records used by RAG.
- `semantic_cluster`: deterministic multilingual issue clusters used by channel pages.
- `channel_summary`: the latest evidence-grounded executive summary per channel.

All points include `brand_id`, `platform` and `document_type`. Evidence points
also include sentiment and source metadata. These fields have payload indexes so
retrieval can filter by brand, channel and sentiment before vector ranking.

Supported channels are Play Store, LinkedIn, Reddit, YouTube, Freshdesk and X.

## Data flow

1. Scrapers write source records to Supabase or the approved local redacted snapshot.
2. `scripts/semantic_cluster_sync.py` creates deterministic multilingual clusters.
3. `scripts/qdrant_channel_sync.py` reuses `embedding_openai` from Supabase when present.
4. Missing evidence vectors and cluster vectors are generated with `text-embedding-3-small`.
5. Stable point IDs make repeated syncs idempotent.
6. `oval/src/lib/rag.ts` embeds the user's question and queries Qdrant first.
7. Supabase pgvector is used only when Qdrant is unavailable during bootstrap or an outage.
8. The LLM receives only the retrieved evidence and cluster summaries.

## Private local configuration

Use a newly rotated Qdrant key. A key pasted into chat or logs must not be reused.
Store these server-only variables in the gitignored `oval/.env.local` file:

```dotenv
QDRANT_URL=https://your-cluster.region.cloud.qdrant.io:6333
QDRANT_API_KEY=your-rotated-key
QDRANT_COLLECTION=oval_channel_mentions_v1
```

Never prefix these variables with `NEXT_PUBLIC_`. Python sync jobs also read the
same local file, so the key only needs to be stored once during local development.
Production must use the hosting provider's encrypted environment variables.

## Build and sync

```bash
python3.11 scripts/qdrant_channel_sync.py --check
python3.11 scripts/semantic_cluster_sync.py --write-artifact
python3.11 scripts/qdrant_channel_sync.py --dry-run
python3.11 scripts/qdrant_channel_sync.py
```

The final command creates the collection when needed, uploads evidence, replaces
each platform's semantic-cluster points only after their new vectors are ready,
and upserts one stable latest summary.

## Verify retrieval

After restarting the Next.js server:

```bash
curl -sS "http://localhost:3001/api/vector-summary?platform=playstore" | jq '{provider, generated_at, clusters: (.clusters | length)}'
```

`provider` must be `qdrant`. `semantic-local` means the application is safely
using the checked-in fallback artifact because Qdrant is missing or unavailable.
