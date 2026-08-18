
-- Store full composite embeddings (text + metadata) for clustering re-use
-- Dimension varies based on metadata features, so use a large cap
CREATE TABLE IF NOT EXISTS composite_embeddings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    mention_index INT NOT NULL,
    original_table TEXT,
    original_id UUID,
    platform TEXT,
    content_preview TEXT,
    text_embedding vector(384),
    composite_embedding vector(500),
    enrichment JSONB,
    cluster_assignment JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_composite_emb_brand ON composite_embeddings(brand_id);
CREATE INDEX IF NOT EXISTS idx_composite_text_vec ON composite_embeddings USING ivfflat (text_embedding vector_cosine_ops) WITH (lists = 20);
;
