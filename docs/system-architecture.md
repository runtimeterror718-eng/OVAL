# OVAL — Brand Intelligence System: Complete Logic Document

> **System**: Physics Wallah Brand Monitoring & PR Intelligence
> **Codename**: OVAL
> **Last Updated**: 2026-04-03
> **Platforms Covered**: Instagram, Reddit, Google Search/Trends/News
> **Data Store**: Supabase (PostgreSQL + pgvector)
> **Dashboard**: Next.js 14 (oval/)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Collection — Instagram](#2-data-collection--instagram)
3. [Data Collection — Reddit](#3-data-collection--reddit)
4. [Data Collection — Google](#4-data-collection--google)
5. [Sentiment Classification](#5-sentiment-classification)
6. [Hinglish Lexicon](#6-hinglish-lexicon)
7. [Embedding Pipeline](#7-embedding-pipeline)
8. [Clustering Engine](#8-clustering-engine)
9. [Geographic Inference](#9-geographic-inference)
10. [RAG System (Retrieval Augmented Generation)](#10-rag-system)
11. [Dashboard APIs](#11-dashboard-apis)
12. [Actionables Engine](#12-actionables-engine)
13. [Competitor Intelligence](#13-competitor-intelligence)
14. [Task Scheduling](#14-task-scheduling)
15. [Database Schema](#15-database-schema)
16. [All Clusters](#16-all-clusters)
17. [All RAG Probes & Keywords](#17-all-rag-probes--keywords)
18. [Cost & Performance](#18-cost--performance)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       DATA COLLECTION                           │
│  Instagram Scraper ──┐                                          │
│  Reddit Scraper    ──┼──→ Supabase (mentions + platform tables) │
│  Google Scraper    ──┘                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     PROCESSING LAYER                            │
│  Sentiment Classification (GPT-4o-mini)                         │
│  OpenAI Embedding (text-embedding-3-small, 1536d)               │
│  KMeans Clustering (paraphrase-multilingual-MiniLM-L12-v2, 384d)│
│  Geographic Inference (subreddit + keyword + IG location)        │
│  Hinglish Lexicon (350+ terms, 10 categories)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        RAG ENGINE                               │
│  Embed query (OpenAI 1536d)                                     │
│  → pgvector HNSW cosine similarity search                       │
│  → LLM Reranker (filter noise)                                  │
│  → GPT-4o-mini generation (grounded in evidence)                │
│  → Confidence scoring                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     OVAL DASHBOARD                              │
│  Overview (health score + RAG analysis)                         │
│  Reddit Intelligence (sentiment + RAG themes)                   │
│  Instagram Intelligence (engagement + RAG analysis)             │
│  Google Intelligence (autocomplete + trends + SERP + news)      │
│  Competitors (share of voice + RAG competitive analysis)        │
│  Action Items (10 RAG probes → department tasks)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Collection — Instagram

**File**: `scrapers/instagram.py`

### How It Works

Instagram's API is not public. We use **reverse-engineered web API calls** with browser fingerprinting to appear as a real Chrome browser.

### Authentication & Anti-Detection

| Component | Detail |
|-----------|--------|
| **Library** | `curl_cffi` (TLS fingerprint matching Chrome 120) |
| **Account** | Burner IG account (altman0092) |
| **Proxies** | Decodo Indian residential proxy pool (rotating) |
| **Sessions** | Pool of 5 concurrent authenticated sessions |
| **Rate Limiting** | Adaptive: 2-5s between requests, exponential backoff on 429 |
| **Cookies** | Stored in `.ig-cookies.json`, refreshed per session |

### Scraping Pipeline

```
1. Load IG cookies + create authenticated session
2. For each target account/hashtag:
   a. Resolve username → user_id via web API
   b. Fetch media feed (posts, reels, carousels)
   c. For each post:
      - Extract: caption, like_count, comment_count, media_type,
        reel_plays, video_views, hashtags, location, timestamp
      - Check if PW-related (keyword match in caption/hashtags)
   d. For high-engagement posts:
      - Paginate through comments
      - Extract: comment_text, author, likes, timestamp, depth
3. Normalize all data to mention schema
4. Store to: instagram_posts + instagram_comments + mentions
5. Run geographic inference on location tags
```

### What Data Is Extracted

**From Posts**:
- `caption_text`, `like_count`, `comment_count`, `reel_plays`, `video_views`
- `media_type` (image/video/reel/carousel), `post_url`, `account_name`
- `hashtags` (array), `location` (if tagged), `published_date`

**From Comments**:
- `comment_text`, `comment_author`, `comment_date`, `like_count`
- `post_id` (parent reference), `reply_count`

### PW Relevance Filter

A post is considered PW-related if caption or hashtags contain any of:
```
physicswallah, physics wallah, alakh pandey, pw, #pw,
#physicswallah, #alakhpandey, vidyapeeth, arjuna, lakshya, yakeen
```

### Current Stats
- **135 posts** tracked across multiple accounts
- **21.7M total likes**, **1,000+ comments** stored
- Top accounts: @physicswallah, @kota_factory_memes, fan accounts

---

## 3. Data Collection — Reddit

**File**: `scrapers/reddit.py`

### How It Works

Reddit's public JSON API requires **no authentication**. Every Reddit page has a `.json` endpoint that returns structured data.

### Targeted Subreddits

```
JEENEETards      — Primary JEE/NEET student community (most PW discussion)
IndianAcademia   — Higher education discussions
btechtards       — Engineering student community
Indian_Education — Broad education policy discussions
CBSE             — Board exam discussions
india            — General India subreddit
indiasocial      — Casual India discussions
```

### Search Queries

```
Primary:
  "physicswallah", "physics wallah", "alakh pandey"

Negative signal:
  "PW scam OR fraud OR controversy"
  "PW quality OR teachers leaving OR refund"
  "PW layoffs OR data leak OR IPO"
```

### Scraping Pipeline

```
1. For each subreddit × each query:
   a. GET reddit.com/r/{subreddit}/search.json?q={query}&sort=relevance&t=month
   b. Parse response → posts array
   c. For each post:
      - Extract: title, body, score, upvote_ratio, num_comments,
        subreddit, author, permalink, created_utc
2. For high-engagement posts (score > 10 or comments > 5):
   a. GET reddit.com{permalink}.json
   b. Parse comment tree (1 level deep)
   c. Extract: comment_body, author, score, depth, parent_id
3. Also search r/all for top 3 queries (catch trending posts)
4. Store to: reddit_posts + reddit_comments + mentions
5. Run geographic inference (subreddit → state mapping)
```

### Rate Limiting

| Scenario | Action |
|----------|--------|
| Normal | 1-2s random delay between requests |
| 429 (rate limit) | Sleep 10s, then retry |
| 500/503 | Skip, log, move to next |
| Max retries (3) | Abandon this subreddit, continue others |

### What Data Is Extracted

**From Posts**:
- `post_title`, `post_body`, `score` (upvotes-downvotes), `num_comments`
- `subreddit_name`, `author_username`, `post_url`, `upvote_ratio`
- `created_at`, `awards` (gilded count)

**From Comments**:
- `comment_body`, `comment_author`, `comment_score`, `comment_depth`
- `post_id` (parent), `parent_comment_id` (for replies)

### Current Stats
- **50 posts** from 7 subreddits
- **200+ comments** scraped
- Dominant subreddit: r/JEENEETards

---

## 4. Data Collection — Google

**File**: `scrapers/google_search.py`

### Four Data Sources

#### A. Google Autocomplete

```
Endpoint: https://suggestqueries.google.com/complete/search
Params: client=firefox, q={query}, hl=en, gl=in

Queries sent:
  "physics wallah", "physics wallah review", "physics wallah controversy",
  "physics wallah vs allen", "physics wallah refund", "physics wallah teacher",
  "physics wallah app", "alakh pandey"
```

**Sentiment Classification of Suggestions**:
```python
NEGATIVE_WORDS = ["scam", "fraud", "fake", "worst", "complaint", "refund", "controversy"]
WARNING_WORDS  = ["review", "salary", "layoff", "issue", "problem"]

# Example results:
"physics wallah scam"        → negative
"physics wallah review"      → warning
"physics wallah arjuna batch"→ neutral
```

#### B. Google SERP (Search Engine Results Page)

```
API: Google Custom Search API (cx=610a07200f3234fe7)
Key: <GOOGLE_API_KEY_REDACTED>
Limit: 100 queries/day (free tier)

For each query, extracts:
  - organic_position (1-10)
  - organic_title
  - organic_url
  - organic_snippet
```

Queries: "physics wallah review", "physics wallah scam", "PW vs Allen", "alakh pandey controversy", etc.

#### C. Google News

```
RSS Feed: https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN

Extracts:
  - title, source (publication name)
  - url, published date
  - snippet (description)
```

#### D. Google Trends

```
Library: pytrends (unofficial Google Trends API)
Timeframe: last 90 days
Geo: IN (India)

Keywords compared:
  "Physics Wallah" vs "Allen Career Institute" vs "Unacademy" vs "BYJU'S"

Data extracted:
  - Interest over time (daily, 0-100 scale)
  - Interest by region (Indian states)
  - Related queries (rising + top)
```

### Storage

| Data | Table |
|------|-------|
| Autocomplete suggestions | `google_autocomplete` |
| News articles | `google_news` |
| Trends time series | `google_trends` |
| SERP organic results | `google_seo_results` |
| Negative autocomplete | Also inserted into `mentions` |

---

## 5. Sentiment Classification

### Two Systems

#### System A: Hinglish Lexicon (Rule-Based)

**File**: `config/hinglish_lexicon.py`

Used during scraping for quick severity detection. Computes sentiment from matched Hinglish/Hindi terms.

```python
compute_hinglish_sentiment("PW scam hai paisa doob gaya")
# Returns: score=-0.95, matched_terms=["scam hai", "paisa doob gaya"]
```

#### System B: GPT-4o-mini (LLM-Based)

**File**: `scripts/classify_sentiment.py`

Used post-scraping to classify all mention_embeddings. More accurate because it understands context, sarcasm, Hinglish mixing.

```
Batch size: 30 mentions per API call
Labels: positive, negative, neutral
Scores: +0.6 (positive), -0.6 (negative), 0.0 (neutral)

Prompt:
  "Classify each mention's sentiment toward Physics Wallah (PW) brand."
  Rules:
  - "positive": praises PW, teachers, Alakh Pandey, courses, results
  - "negative": criticizes PW, scam accusations, refund complaints,
     teacher quality issues, app problems, hiring criticism
  - "neutral": factual, questions, unrelated, memes, spam

Response format: "0:negative\n1:positive\n2:neutral\n..."
```

### Current Distribution (1,439 mentions)

| Label | Count | Percentage |
|-------|-------|------------|
| Neutral | 870 | 60% |
| Positive | 355 | 25% |
| Negative | 214 | 15% |

---

## 6. Hinglish Lexicon

**File**: `config/hinglish_lexicon.py`
**Total Terms**: 350+
**Categories**: 10

### Category Breakdown

| # | Category | Terms | Weight Range | Examples |
|---|----------|-------|-------------|----------|
| 1 | **CRISIS_HINGLISH** | 50+ | -0.7 to -1.0 | "boycott karo", "scam hai", "paisa doob gaya", "fraud company" |
| 2 | **POSITIVE_HINGLISH** | 40+ | +0.6 to +0.9 | "zabardast", "mast", "legend hai", "respect", "goat" |
| 3 | **PROFANITY_HINGLISH** | 30+ | -0.7 to -1.0 | Full forms + abbreviations + leetspeak variants |
| 4 | **BRAND_COMPLAINTS** | 25+ | -0.5 to -0.8 | "refund nahi diya", "quality ghatiya", "response nahi" |
| 5 | **BRAND_PRAISE** | 20+ | +0.5 to +0.8 | "value for money", "worth hai", "best teacher" |
| 6 | **MEME_HINGLISH** | 15+ | -0.5 to +0.6 | "W" (+0.6), "L" (-0.5), "slow clap" (-0.5), "waah" (0.0 sarcasm) |
| 7 | **STUDENT_HINGLISH** | 20+ | -0.5 to +0.3 | "KT" (-0.5), "backlog" (-0.5), "placement" (+0.3) |
| 8 | **NEUTRAL_HINGLISH** | 30+ | 0.0 | "yaar", "bhai", "matlab", "haan", "dekho" |
| 9 | **POLITICAL_FLAGS** | 15+ | -0.3 to -0.7 | "sanghi", "librandu", "bhakt", "paid troll", "bot hai" |
| 10 | **INSTAGRAM_SPAM** | 20+ | 0.0 | "follow back", "f4f", "like for like", "dm for collab" |

### Key Functions

```python
get_crisis_terms()              # All terms with weight <= -0.6
compute_hinglish_sentiment(text) # Returns (score, matched_terms)
is_hinglish(text)               # Boolean: does text contain Hinglish markers?
get_spam_phrases()              # Instagram spam detection terms
```

---

## 7. Embedding Pipeline

### Two Embedding Models Used

| Model | Dimensions | Where Used | Cost |
|-------|-----------|------------|------|
| `paraphrase-multilingual-MiniLM-L12-v2` | 384 | Clustering (KMeans) | Free (local) |
| `text-embedding-3-small` (OpenAI) | 1536 | RAG vector search | $0.02/1M tokens |

### How Embeddings Work

An embedding converts text into a fixed-length array of numbers (a "vector") where **similar meanings produce similar vectors**.

```
"PW teacher quality is bad"   → [0.023, -0.041, 0.089, ... 1536 numbers]
"faculty at Physics Wallah dropped" → [0.025, -0.038, 0.092, ... 1536 numbers]

Cosine similarity = 0.89 (HIGH — similar meaning)

"PW teacher quality is bad"   → [0.023, -0.041, 0.089, ...]
"I love cricket"              → [-0.15, 0.203, -0.067, ...]

Cosine similarity = 0.12 (LOW — unrelated)
```

### Embedding Pipeline Flow

```
1. Scrape raw comments from Instagram/Reddit/Google
2. Store raw text in mention_embeddings table
3. Run scripts/embed_openai.py:
   - Fetch all rows missing embedding_openai
   - Batch encode via OpenAI API (100 texts per call)
   - Store 1536-dim vectors back to embedding_openai column
4. Run scripts/classify_sentiment.py:
   - Classify sentiment via GPT-4o-mini
   - Store sentiment_label + sentiment_score
5. pgvector HNSW index auto-updates for fast search
```

### Current State

| Metric | Value |
|--------|-------|
| Total mentions embedded | 1,439 |
| OpenAI embeddings (1536d) | 1,439 |
| MiniLM embeddings (384d) | 1,439 |
| Cluster embeddings | 20 |
| All sentiment-classified | Yes (GPT-4o-mini) |
| HNSW index | Active on both tables |

---

## 8. Clustering Engine

### What It Does

Groups 1,439 mentions into **20 clusters** based on semantic similarity. Each cluster represents a "theme" or "narrative" in the brand conversation.

### Method

| Parameter | Value |
|-----------|-------|
| Algorithm | KMeans (switched from HDBSCAN due to noise issues) |
| Embedding | paraphrase-multilingual-MiniLM-L12-v2 (384d) |
| Clusters | 20 (K=20) |
| Noise | 0% (KMeans assigns every point) |
| Language | Works on English + Hindi + Hinglish mixed text |

### Why KMeans Over HDBSCAN

HDBSCAN was tried first but produced **64-87% noise** on this dataset because:
- Mixed language (English + Hinglish + emoji) creates sparse embedding space
- 1,439 mentions is too small for density-based clustering
- Short texts (comments) lack the density gradients HDBSCAN needs

KMeans with K=20 produces **0% noise** and cleaner clusters.

### Cluster Labeling

Each cluster is auto-labeled using a prefix system:

```
PREFIX:SUBCATEGORY — Human-Readable Description

Prefixes:
  APPRECIATION  — Positive sentiment (praise, charity, fan content)
  NEGATIVE      — Negative sentiment (complaints, criticism)
  REQUEST       — Questions and help-seeking
  NEUTRAL       — Factual, banter, no strong sentiment
  MIXED         — Both positive and negative
  POLITICAL     — Politically sensitive content
  SPAM          — Low-value content (tag bait, discord links)
```

### All 20 Clusters (ranked by size)

| # | Cluster ID | Label | Mentions | Reddit | Instagram | YouTube |
|---|-----------|-------|----------|--------|-----------|---------|
| 1 | 17 | REQUEST:COURSE — Hinglish Help Requests, NEET/JEE Prep | 210 | 129 | 62 | 19 |
| 2 | 0 | MIXED — Alakh/NEET Daily Discussion | 111 | 56 | 49 | 6 |
| 3 | 8 | NEUTRAL — Hinglish Alakh Pandey Banter | 100 | 53 | 42 | 5 |
| 4 | 15 | APPRECIATION — Forbes Billionaire, Whiteboard Nostalgia | 92 | 83 | 7 | 2 |
| 5 | 2 | APPRECIATION:CHARITY — Respect Button, Alakh Donations | 84 | 10 | 65 | 9 |
| 6 | 6 | NEGATIVE:BUSINESS — Money Criticism, Shrewd Businessman | 80 | 74 | 5 | 1 |
| 7 | 11 | POLITICAL — Reservation, Caste, Government Debate | 69 | 65 | 4 | — |
| 8 | 13 | APPRECIATION:FAN — #physicswallah Shorts & Reels | 68 | 19 | 48 | 1 |
| 9 | 5 | SPAM — Kota Factory Memes, Tag & Follow Bait | 68 | 17 | 47 | 4 |
| 10 | 4 | REQUEST:COURSE — Batch Reviews, Course Availability | 67 | 55 | 12 | — |
| 11 | 9 | REQUEST:COURSE — PW vs Allen, Batch Queries | 60 | 44 | 15 | 1 |
| 12 | 12 | NEGATIVE:STUDENT — College Struggles, Career Reality | 57 | 56 | 1 | — |
| 13 | 3 | APPRECIATION — Love, Admiration, Wholesome Reactions | 54 | 41 | 12 | 1 |
| 14 | 18 | NEGATIVE:PRODUCT — Teacher Quality, PW Skills Reviews | 50 | 24 | 25 | 1 |
| 15 | 1 | NEGATIVE:EMPLOYER — Pen Interview & Job Criticism | 49 | 46 | 3 | — |
| 16 | 10 | NEGATIVE:BUSINESS — IPO, Trading, Stock Criticism | 49 | 34 | 15 | — |
| 17 | 16 | NEGATIVE:ADVICE — JEE Doubts, Drop Year Reality | 49 | 39 | 8 | 2 |
| 18 | 19 | APPRECIATION — Board Toppers, Rank Celebrations | 47 | 25 | 21 | 1 |
| 19 | 7 | NEGATIVE:EMPLOYER — Sell-a-Pen Interview Culture | 41 | 41 | — | — |
| 20 | 14 | SPAM — Discord Links, Auto-mod, Contact Requests | 34 | 32 | 1 | 1 |

### Cluster Categories Summary

| Category | Clusters | Total Mentions | % of Total |
|----------|----------|---------------|------------|
| NEGATIVE | 7 | 375 | 26% |
| APPRECIATION | 5 | 345 | 24% |
| REQUEST | 3 | 337 | 23% |
| MIXED/NEUTRAL | 2 | 211 | 15% |
| SPAM | 2 | 102 | 7% |
| POLITICAL | 1 | 69 | 5% |

---

## 9. Geographic Inference

**File**: `analysis/geo_inference.py`

### How Location Is Inferred (No GPS Data)

Since social media comments don't include GPS coordinates, we use **4 inference methods** with different confidence levels:

#### Method 1: Subreddit → State (Confidence: 0.85)

```python
SUBREDDIT_TO_STATE = {
    "mumbai": "MH",           # Maharashtra
    "delhi": "DL",             # Delhi
    "bangalore": "KA",         # Karnataka
    "hyderabad": "TG",         # Telangana
    "chennai": "TN",           # Tamil Nadu
    "kolkata": "WB",           # West Bengal
    "pune": "MH",              # Maharashtra
    "ahmedabad": "GJ",         # Gujarat
    "JEENEETards": "RJ",       # Rajasthan (Kota association)
    "CBSE": None,              # National, no state
}
```

#### Method 2: Instagram Location Tags (Confidence: 0.95)

When an IG post has a location tag, we extract it from the post's `raw_data`:
```python
post.raw_data.location.name → "Physics Wallah Vidyapeeth, Bhopal"
→ State: MP (Madhya Pradesh)
```

#### Method 3: Text Keyword Extraction (Confidence: 0.75)

Search comment text for city/state names:
```python
CITY_TO_STATE = {
    "mumbai": "MH", "delhi": "DL", "bangalore": "KA",
    "kota": "RJ", "jaipur": "RJ", "lucknow": "UP",
    "patna": "BR", "bhopal": "MP", "indore": "MP",
    ... # 80+ cities mapped
}

PW_CENTRES = {
    "vidyapeeth bhopal": "MP",
    "vidyapeeth jaipur": "RJ",
    "vidyapeeth delhi": "DL",
    ... # 15 Vidyapeeth campus locations
}
```

#### Method 4: Comment Keyword Fallback (Confidence: 0.65)

Looser keyword match in comment text for state names.

### Aggregation

All geo signals are combined into `geo_aggregates` per state:
```
State: Rajasthan (RJ)
  Total mentions: 45
  Negative: 12 (27%)
  Positive: 18
  Neutral: 15
  Top platform: Reddit (38)
  Top issue: "Teacher quality"
```

### Coverage
- **23 Indian states** mapped with lat/lng coordinates
- **80+ cities** → state mappings
- **15 PW Vidyapeeth centres** as anchor points

---

## 10. RAG System

**Files**: `oval/src/lib/rag.ts` (frontend), `analysis/rag.py` (backend)

### What Is RAG?

**Retrieval Augmented Generation** — instead of the LLM making things up, we first **retrieve real data** from our database, then ask the LLM to analyze only that data. Every answer is grounded in actual scraped mentions.

### The 5-Step Pipeline

```
Step 1: EMBED THE QUERY
   "What are students complaining about?"
        ↓
   OpenAI text-embedding-3-small
        ↓
   [0.023, -0.041, 0.089, ...] (1536 numbers)

Step 2: VECTOR SEARCH (pgvector)
   Find the 20 most semantically similar mentions
   from 1,439 stored vectors using cosine distance.
   HNSW index makes this ~20ms even at 100K vectors.
   
   Can filter by:
   - sentiment (negative-only for actionables)
   - platform (reddit-only, instagram-only)
   - brand_id

Step 3: RERANK (LLM Filter)
   Send 20 candidates to GPT-4o-mini:
   "Which of these are DIRECTLY relevant to the query?"
   GPT returns indices of relevant ones.
   Typically filters ~30% noise.
   Result: 10-12 high-quality matches.

Step 4: GENERATE (Grounded LLM)
   Feed verified mentions + cluster context to GPT-4o-mini:
   "Here are 12 REAL mentions. Analyze the patterns."
   LLM generates response citing actual quotes.

Step 5: CONFIDENCE SCORING
   confidence = (count_score × 0.4) + (similarity_score × 0.6)
   
   count_score = min(mentions_found / 10, 1.0)
   similarity_score = min(avg_cosine_similarity / 0.5, 1.0)
   
   Result: 0.0 to 1.0 (shown as percentage on dashboard)
```

### Supabase RPC Functions (pgvector)

| Function | Purpose | Filter |
|----------|---------|--------|
| `match_mentions_openai` | Search all mentions | threshold + brand_id |
| `match_mentions_negative` | Search only negative mentions | sentiment_label = 'negative' |
| `match_mentions_by_sentiment` | Search by any sentiment | configurable |
| `match_mentions_by_platform` | Search by platform + sentiment | platform + sentiment |
| `match_clusters_openai` | Search cluster summaries | brand_id |

### Why Two Embedding Models?

| Model | Dims | Purpose | Why |
|-------|------|---------|-----|
| MiniLM (384d) | 384 | Clustering | Free, fast, runs locally, good for grouping |
| OpenAI (1536d) | 1536 | RAG search | Higher quality for retrieval, same model for queries and documents |

You **cannot mix** embedding models — a query embedded with OpenAI can only search against documents also embedded with OpenAI. The vector spaces are completely different.

---

## 11. Dashboard APIs

### Overview API (`/api/overview`)

**Purpose**: Health score + executive briefing

**Data Sources**:
- `mentions` table (500 latest)
- `mention_embeddings` (LLM-classified sentiment — more accurate)
- `reddit_posts` (top 20), `instagram_posts` (top 20)
- `geo_aggregates` (state-level data)
- 2 RAG queries (negative themes + positive themes)

**Health Score Formula**:
```
healthScore = 50 + (positivePercent - negativePercent × 1.5) × 0.5 + min(totalMentions / 20, 15)

Range: 0-100
50 = neutral baseline
Negative mentions penalized 1.5× (brand risk is asymmetric)
Volume bonus capped at 15 (more data = more confidence)
```

**RAG Queries**:
1. Negative: "What are the biggest complaints about Physics Wallah right now?"
   - negative-only search, 20 mentions, reranked to 12
2. Positive: "What do students love about Physics Wallah?"
   - positive-only search, 15 mentions, reranked to 8

---

### Reddit API (`/api/reddit`)

**Data Sources**: `reddit_posts` (50), `reddit_comments` (200), `mentions` (reddit, 500), `mention_embeddings` (reddit, LLM-classified)

**RAG Query**: "What are the main themes and narratives about Physics Wallah on Reddit?"
- Platform filter: reddit only
- Generates: top 3 negative narratives, top 2 positive, overall verdict

**Outputs**: stats, posts, sentiment trend (12-week), subreddit breakdown, RAG analysis

---

### Instagram API (`/api/instagram`)

**Data Sources**: `instagram_posts` (200), `instagram_comments` (1000), `mentions` (instagram, 500), `mention_embeddings` (instagram, LLM-classified)

**RAG Query**: "What is the Instagram community saying? Any complaints visible?"
- Platform filter: instagram only
- Detects if Instagram is an "echo chamber" vs Reddit

**Outputs**: stats, top hashtags (12), top accounts (10), media type breakdown, sentiment trend, top comments (20), top posts (10), RAG analysis

---

### Google API (`/api/google`)

**Data Sources**: `google_autocomplete`, `google_news`, `google_trends`, `google_seo_results`

**No RAG** (data is structured, not unstructured comments)

**Outputs**:
- Autocomplete suggestions with sentiment labels
- Negative/warning suggestions highlighted
- Google Trends: interest over time (3 months, multi-line chart)
- Regional interest by Indian state (bar chart)
- SERP results grouped by query
- News articles (title, source, date, URL)

---

## 12. Actionables Engine

**File**: `oval/src/app/api/actionables/route.ts`

### How Action Items Are Generated

The system runs **10 semantic probe queries** against the database. Each probe targets a specific concern area and is assigned to a department.

### The 10 RAG Probes

| # | Probe ID | Department | Search Query | Keywords Tracked |
|---|----------|-----------|-------------|-----------------|
| 1 | refund | Operations | "Physics Wallah refund delayed cancellation fees too high money not returned course subscription" | refund, cancel, payment, money, delayed, return, fees |
| 2 | teacher-quality | Product | "PW teacher left mid batch quality dropped faculty bad replaced PW Skills course poor content" | teacher, faculty, quality, batch, replaced, teaching, skills |
| 3 | app-issues | Engineering | "Physics Wallah app crash bug buffering live class not working glitch error slow loading" | app, crash, bug, buffering, glitch, slow, error |
| 4 | scam-trust | Communications/PR | "PW scam fraud like BYJU edtech company looting students money waste commercialized broken promises" | scam, fraud, BYJU, loot, waste, commercialized |
| 5 | employer-brand | HR | "Physics Wallah sell pen interview toxic work culture low salary bad employer hiring experience" | interview, hiring, salary, job, pen, toxic, employer |
| 6 | ipo-business | Business/Finance | "PW IPO overvalued stock billionaire Alakh Pandey crore valuation investors money business criticism" | IPO, stock, valuation, billionaire, crore, business |
| 7 | political | Communications/PR | "Physics Wallah reservation caste political controversy religion communal sensitive debate" | reservation, caste, political, controversy, religion |
| 8 | marketing | Brand/Marketing | "PW aggressive upselling notifications popup spam marketing push ads course upgrade pressure" | upselling, notification, popup, spam, marketing, ads |
| 9 | support | Operations | "Physics Wallah customer support no response ticket ignored chatbot useless complaint unresolved help" | support, response, ticket, ignored, chatbot, complaint |
| 10 | content-freshness | Product | "PW recycled old lectures reused PDF notes outdated previous year batch same material stale content" | recycled, old, reused, outdated, previous year, stale |

### Pipeline Per Probe

```
1. Embed probe query → OpenAI 1536d vector (all 10 batched in one API call)
2. pgvector search → match_mentions_negative (only negative mentions, top 20)
3. pgvector search → match_clusters_openai (top 5 similar clusters)
4. LLM Reranker → filter noise, keep top 10
5. GPT-4o-mini generates:
   - task_title (max 80 chars)
   - task_description (2-3 sentences with evidence)
   - suggested_actions (4 concrete actions)
   - reasoning (why this is actionable)
6. Priority scoring:
   volume (mentions) + similarity + cluster_volume → high/medium/low
7. Keyword matching:
   Check which probe keywords actually appear in retrieved evidence
```

### Priority Scoring Formula

```
volumeScore     = mentions >= 10 → 3, >= 5 → 2, else 1
similarityScore = avg_sim >= 0.42 → 3, >= 0.35 → 2, else 1
clusterVolume   = cluster_mentions >= 80 → 2, >= 40 → 1, else 0

total = volumeScore + similarityScore + clusterVolume
HIGH   = total >= 7
MEDIUM = total >= 4
LOW    = total < 4
```

### Transparency

Each actionable shows (expandable "RAG Details" panel):
- The exact semantic search query used
- Which keywords were found in evidence (vs not found)
- Similarity range (min–max cosine score)
- Platform breakdown (Reddit vs Instagram)
- Related clusters matched by vector similarity
- LLM reasoning for why this is actionable

---

## 13. Competitor Intelligence

**File**: `oval/src/app/api/competitors/route.ts`

### Competitors Tracked
```
Allen, Unacademy, BYJU, Aakash, Vedantu
```

### How It Works

1. Fetch all 1,500 mention_embeddings
2. For each mention, check if text contains any competitor name (case-insensitive)
3. Use the LLM-classified sentiment for that mention
4. Aggregate: mention count, sentiment breakdown, sample quotes, platform split

### RAG Query

"How is Physics Wallah compared to Allen, Unacademy, BYJU's, Aakash, Vedantu?"
- Returns: comparison analysis, biggest threat, key comparison points

### Current Results

| Competitor | Mentions | Sentiment | Dominant Platform |
|-----------|----------|-----------|-------------------|
| Allen | 15 | Mixed (2P/3N/10Neu) | Reddit |
| Unacademy | 7 | Mixed (1P/3N/3Neu) | Reddit |
| BYJU | 3 | Negative (0P/2N/1Neu) | Reddit |
| Aakash | 2 | Mixed (1P/1N) | Reddit |
| Vedantu | 0 | — | — |

### Share of Voice
```
PW: 1,473 mentions (dominant)
Allen: 15
Unacademy: 7
BYJU: 3
Aakash: 2
```

---

## 14. Task Scheduling

**Files**: `workers/tasks.py`, `workers/schedule.py`

### Celery Beat Schedule

| Task | Frequency | Time |
|------|-----------|------|
| `scrape_instagram` | Every 6 hours | :30 past |
| `scrape_reddit` | Every 4 hours | :00 |
| `scrape_youtube` | Every 6 hours | :00 |
| `scrape_twitter` | Every 2 hours | :00 |
| `scrape_seo_news` | Every 3 hours | :00 |
| `scrape_telegram` | Every 1 hour | :15 |
| `run_full_analysis` | Daily | 2:00 AM |
| `check_alerts` | Every 30 min | :00, :30 |
| `send_weekly_report` | Weekly | Monday 9:00 AM |

### Architecture
```
Celery Beat (scheduler) → Redis (message queue) → Celery Worker (executor) → Supabase (storage)
```

---

## 15. Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `brands` | Brand definitions | id, name, platforms, keywords, hashtags |
| `mentions` | Unified cross-platform mentions | id, brand_id, platform, content_text, sentiment_label, sentiment_score, cluster_id |
| `mention_embeddings` | Embedded mentions for RAG | mention_id, content_text, platform, sentiment_label, embedding (384d), embedding_openai (1536d) |
| `cluster_embeddings` | Cluster summaries + vectors | cluster_id, cluster_label, summary, mention_count, avg_sentiment, embedding_openai (1536d) |

### Platform Tables

| Table | Platform | Key Columns |
|-------|----------|-------------|
| `instagram_posts` | Instagram | account_name, caption_text, like_count, comment_count, reel_plays, media_type, hashtags |
| `instagram_comments` | Instagram | comment_text, comment_author, post_id, comment_date |
| `reddit_posts` | Reddit | subreddit_name, post_title, post_body, score, num_comments, post_url |
| `reddit_comments` | Reddit | comment_body, comment_author, comment_score, comment_depth |
| `google_autocomplete` | Google | query_text, suggestion, sentiment |
| `google_news` | Google | title, source, url, published |
| `google_trends` | Google | keyword, date, interest_value, region |
| `google_seo_results` | Google | query_text, organic_title, organic_url, organic_snippet, organic_position |

### Analysis Tables

| Table | Purpose |
|-------|---------|
| `severity_scores` | Crisis severity per mention |
| `analysis_runs` | Analysis execution log |
| `geo_mentions` | Per-mention geographic signals |
| `geo_aggregates` | State-level aggregated stats |
| `topic_themes` | L1 cluster themes |
| `topic_topics` | L2 cluster topics |
| `topic_subtopics` | L3 cluster subtopics |
| `mention_enrichments` | LLM-enriched mention metadata |

### pgvector Functions

| Function | Input | Output |
|----------|-------|--------|
| `match_mentions_openai(embedding, threshold, limit, brand_id)` | 1536d vector | Similar mentions + similarity score |
| `match_mentions_negative(embedding, threshold, limit, brand_id)` | 1536d vector | Negative mentions only |
| `match_mentions_by_sentiment(embedding, sentiment, threshold, limit, brand_id)` | 1536d vector + label | Filtered by sentiment |
| `match_mentions_by_platform(embedding, platform, sentiment, threshold, limit, brand_id)` | 1536d vector + filters | Filtered by platform + sentiment |
| `match_clusters_openai(embedding, limit, brand_id)` | 1536d vector | Similar cluster summaries |

---

## 16. All Clusters

### By Category

**APPRECIATION (5 clusters, 345 mentions, 24%)**
- Forbes Billionaire, Whiteboard Nostalgia (92)
- Respect Button, Alakh Donations (84)
- #physicswallah Shorts & Reels (68)
- Love, Admiration, Wholesome (54)
- Board Toppers, Rank Celebrations (47)

**NEGATIVE (7 clusters, 375 mentions, 26%)**
- Money Criticism, Shrewd Businessman (80)
- College Struggles, Career Reality (57)
- Teacher Quality, PW Skills Reviews (50)
- Pen Interview & Job Criticism (49)
- IPO, Trading, Stock Criticism (49)
- JEE Doubts, Drop Year Reality (49)
- Sell-a-Pen Interview Culture (41)

**REQUEST (3 clusters, 337 mentions, 23%)**
- Hinglish Help Requests, NEET/JEE Prep (210)
- Batch Reviews, Course Availability (67)
- PW vs Allen, Batch Queries (60)

**MIXED/NEUTRAL (2 clusters, 211 mentions, 15%)**
- Alakh/NEET Daily Discussion (111)
- Hinglish Alakh Pandey Banter (100)

**POLITICAL (1 cluster, 69 mentions, 5%)**
- Reservation, Caste, Government Debate (69)

**SPAM (2 clusters, 102 mentions, 7%)**
- Kota Factory Memes, Tag & Follow Bait (68)
- Discord Links, Auto-mod, Contact Requests (34)

---

## 17. All RAG Probes & Keywords

### 72 Unique Keywords Across 10 Probes

**Operations (2 probes)**:
refund, cancel, payment, money, delayed, return, fees, support, response, ticket, ignored, chatbot, complaint

**Product (2 probes)**:
teacher, faculty, quality, batch, replaced, teaching, skills, recycled, old, reused, outdated, previous year, stale

**Engineering (1 probe)**:
app, crash, bug, buffering, glitch, slow, error

**Communications/PR (2 probes)**:
scam, fraud, BYJU, loot, waste, commercialized, reservation, caste, political, controversy, religion

**HR (1 probe)**:
interview, hiring, salary, job, pen, toxic, employer

**Business/Finance (1 probe)**:
IPO, stock, valuation, billionaire, crore, business

**Brand/Marketing (1 probe)**:
upselling, notification, popup, spam, marketing, ads

---

## 18. Cost & Performance

### API Costs (Current Scale: 1,439 mentions)

| Operation | Provider | Cost |
|-----------|----------|------|
| Embed 1,439 mentions | OpenAI | $0.005 |
| Classify 1,439 mentions | GPT-4o-mini | $0.05 |
| Single dashboard page load | GPT-4o-mini (RAG queries) | ~$0.02 |
| Actionables (10 probes + 10 generations) | GPT-4o-mini | ~$0.05 |
| Overview (2 RAG queries) | GPT-4o-mini | ~$0.02 |
| **Monthly estimate (moderate use)** | | **~$5-10** |

### Performance

| Operation | Time |
|-----------|------|
| Vector search (pgvector, 1,439 vectors) | ~5ms |
| Single embedding (OpenAI) | ~200ms |
| Batch embed 100 texts | ~1.5s |
| LLM rerank (15 candidates) | ~1s |
| LLM generation (800 tokens) | ~2s |
| Full actionables API (10 probes) | ~15s |
| Full overview API (2 RAG queries) | ~8s |

### Scaling Limits

| Scale | Vector Search | Embed Cost | Classify Cost | Action |
|-------|-------------|------------|---------------|--------|
| 1,439 (now) | 5ms | $0.005 | $0.05 | Works as-is |
| 10,000 | 10ms | $0.03 | $0.35 | Works as-is |
| 1,00,000 | 20ms | $0.30 | Use XLM-RoBERTa (free) | Add caching layer |
| 10,00,000 | 50ms | $3.00 | Use XLM-RoBERTa (free) | Add Redis cache + cron precompute |

---

## File Index

| File | Purpose |
|------|---------|
| `scrapers/instagram.py` | Instagram scraping with curl_cffi + proxies |
| `scrapers/reddit.py` | Reddit public JSON API scraping |
| `scrapers/google_search.py` | Google autocomplete, SERP, news, trends |
| `analysis/rag.py` | Python RAG pipeline (MiniLM embeddings) |
| `analysis/geo_inference.py` | Geographic state inference |
| `analysis/deep_clustering/` | 7-stage clustering pipeline |
| `config/settings.py` | Environment variables |
| `config/hinglish_lexicon.py` | 350+ Hinglish sentiment terms |
| `severity/keywords.py` | Crisis keyword detection |
| `storage/queries.py` | Supabase CRUD operations |
| `workers/tasks.py` | Celery task definitions |
| `workers/schedule.py` | Celery beat schedule |
| `scripts/embed_openai.py` | OpenAI re-embedding script |
| `scripts/classify_sentiment.py` | GPT-4o-mini sentiment classification |
| `oval/src/lib/rag.ts` | Frontend RAG utility (embed, search, rerank, generate) |
| `oval/src/app/api/overview/route.ts` | Overview dashboard API |
| `oval/src/app/api/reddit/route.ts` | Reddit intelligence API |
| `oval/src/app/api/instagram/route.ts` | Instagram intelligence API |
| `oval/src/app/api/google/route.ts` | Google intelligence API |
| `oval/src/app/api/competitors/route.ts` | Competitor analysis API |
| `oval/src/app/api/actionables/route.ts` | RAG-powered action items API |
| `oval/src/app/api/ask/route.ts` | Ask OVAL chat endpoint |
| `schema.sql` | Full Supabase schema (24+ tables) |
