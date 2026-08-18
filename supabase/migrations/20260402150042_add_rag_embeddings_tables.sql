
-- Embeddings for individual mentions (for fine-grained retrieval)
CREATE TABLE IF NOT EXISTS mention_embeddings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mention_id UUID REFERENCES mentions(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    content_text TEXT,
    platform VARCHAR(20),
    cluster_id INT,
    sentiment_label VARCHAR(20),
    sentiment_score FLOAT,
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Embeddings for cluster summaries (for high-level retrieval)
CREATE TABLE IF NOT EXISTS cluster_embeddings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    cluster_id INT NOT NULL,
    cluster_label TEXT,
    summary TEXT,
    mention_count INT DEFAULT 0,
    avg_sentiment FLOAT,
    platforms JSONB,
    representative_texts TEXT[],
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, cluster_id)
);

-- Function for similarity search
CREATE OR REPLACE FUNCTION match_mentions(
    query_embedding vector(384),
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 10,
    filter_brand_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    mention_id UUID,
    content_text TEXT,
    platform VARCHAR(20),
    cluster_id INT,
    sentiment_label VARCHAR(20),
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        me.id,
        me.mention_id,
        me.content_text,
        me.platform,
        me.cluster_id,
        me.sentiment_label,
        1 - (me.embedding <=> query_embedding) AS similarity
    FROM mention_embeddings me
    WHERE (filter_brand_id IS NULL OR me.brand_id = filter_brand_id)
      AND 1 - (me.embedding <=> query_embedding) > match_threshold
    ORDER BY me.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function for cluster similarity search
CREATE OR REPLACE FUNCTION match_clusters(
    query_embedding vector(384),
    match_count INT DEFAULT 5,
    filter_brand_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    cluster_id INT,
    cluster_label TEXT,
    summary TEXT,
    mention_count INT,
    avg_sentiment FLOAT,
    representative_texts TEXT[],
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.id,
        ce.cluster_id,
        ce.cluster_label,
        ce.summary,
        ce.mention_count,
        ce.avg_sentiment,
        ce.representative_texts,
        1 - (ce.embedding <=> query_embedding) AS similarity
    FROM cluster_embeddings ce
    WHERE (filter_brand_id IS NULL OR ce.brand_id = filter_brand_id)
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_mention_embeddings_vec ON mention_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS idx_cluster_embeddings_vec ON cluster_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 5);
;
