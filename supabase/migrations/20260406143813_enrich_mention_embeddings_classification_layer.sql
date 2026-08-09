
-- ═══════════════════════════════════════════════════════════════
-- ENRICHMENT LAYER: Add classification + source + engagement
-- columns to mention_embeddings. No existing data is modified.
-- ═══════════════════════════════════════════════════════════════

-- ── SOURCE TRACEABILITY ──────────────────────────────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS content_hash varchar,
ADD COLUMN IF NOT EXISTS content_type varchar,
ADD COLUMN IF NOT EXISTS platform_ref_id varchar,
ADD COLUMN IF NOT EXISTS source_url varchar,
ADD COLUMN IF NOT EXISTS author_handle varchar,
ADD COLUMN IF NOT EXISTS parent_post_id varchar;

-- ── ENGAGEMENT METRICS ───────────────────────────────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS likes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS views integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS upvotes integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS forwards integer DEFAULT 0;

-- ── LLM CLASSIFICATION (full GPT output) ─────────────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS severity varchar,
ADD COLUMN IF NOT EXISTS issue_type varchar,
ADD COLUMN IF NOT EXISTS recommended_action varchar,
ADD COLUMN IF NOT EXISTS classification_reason text,
ADD COLUMN IF NOT EXISTS intent varchar,
ADD COLUMN IF NOT EXISTS emotion varchar,
ADD COLUMN IF NOT EXISTS target_entity varchar,
ADD COLUMN IF NOT EXISTS complaint_category varchar,
ADD COLUMN IF NOT EXISTS mentioned_competitors text[],
ADD COLUMN IF NOT EXISTS matched_keywords text[],
ADD COLUMN IF NOT EXISTS is_actionable boolean DEFAULT false;

-- ── AUDIO / TRANSCRIPT ───────────────────────────────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS has_audio boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS transcript_text text,
ADD COLUMN IF NOT EXISTS transcript_language varchar;

-- ── GEOGRAPHIC ───────────────────────────────────────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS geo_state_code varchar,
ADD COLUMN IF NOT EXISTS geo_state_name varchar,
ADD COLUMN IF NOT EXISTS geo_confidence float;

-- ── CLUSTER LABEL (denormalized for fast queries) ────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS cluster_label varchar;

-- ── PROVENANCE / AUDIT ───────────────────────────────────────
ALTER TABLE mention_embeddings
ADD COLUMN IF NOT EXISTS classification_model varchar,
ADD COLUMN IF NOT EXISTS classification_provider varchar,
ADD COLUMN IF NOT EXISTS classified_at timestamptz,
ADD COLUMN IF NOT EXISTS scraped_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── DEDUP INDEX ──────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_me_content_hash 
ON mention_embeddings (content_hash) WHERE content_hash IS NOT NULL;

-- ── QUERY INDEXES for UI filters ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_me_platform_sentiment 
ON mention_embeddings (platform, sentiment_label);

CREATE INDEX IF NOT EXISTS idx_me_issue_type 
ON mention_embeddings (issue_type) WHERE issue_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_me_severity 
ON mention_embeddings (severity) WHERE severity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_me_pr_risk 
ON mention_embeddings (is_pr_risk) WHERE is_pr_risk = true;

CREATE INDEX IF NOT EXISTS idx_me_geo 
ON mention_embeddings (geo_state_code) WHERE geo_state_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_me_scraped_at 
ON mention_embeddings (scraped_at);

CREATE INDEX IF NOT EXISTS idx_me_author 
ON mention_embeddings (author_handle) WHERE author_handle IS NOT NULL;
;
