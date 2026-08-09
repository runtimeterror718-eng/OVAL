
-- Add OpenAI embedding columns (1536-dim from text-embedding-3-small)
ALTER TABLE mention_embeddings ADD COLUMN IF NOT EXISTS embedding_openai vector(1536);
ALTER TABLE cluster_embeddings ADD COLUMN IF NOT EXISTS embedding_openai vector(1536);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_mention_embeddings_openai 
ON mention_embeddings USING ivfflat (embedding_openai vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_cluster_embeddings_openai 
ON cluster_embeddings USING ivfflat (embedding_openai vector_cosine_ops) WITH (lists = 10);

-- Match function for mentions using OpenAI embeddings
CREATE OR REPLACE FUNCTION match_mentions_openai(
    query_embedding vector(1536),
    match_threshold double precision DEFAULT 0.3,
    match_count integer DEFAULT 10,
    filter_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    mention_id uuid,
    content_text text,
    platform varchar,
    cluster_id integer,
    sentiment_label varchar,
    sentiment_score double precision,
    similarity double precision
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
        me.sentiment_score,
        1 - (me.embedding_openai <=> query_embedding) AS similarity
    FROM mention_embeddings me
    WHERE me.embedding_openai IS NOT NULL
      AND (filter_brand_id IS NULL OR me.brand_id = filter_brand_id)
      AND 1 - (me.embedding_openai <=> query_embedding) > match_threshold
    ORDER BY me.embedding_openai <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Match function for clusters using OpenAI embeddings
CREATE OR REPLACE FUNCTION match_clusters_openai(
    query_embedding vector(1536),
    match_count integer DEFAULT 5,
    filter_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    cluster_id integer,
    cluster_label text,
    summary text,
    mention_count integer,
    avg_sentiment double precision,
    representative_texts text[],
    similarity double precision
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
        1 - (ce.embedding_openai <=> query_embedding) AS similarity
    FROM cluster_embeddings ce
    WHERE ce.embedding_openai IS NOT NULL
      AND (filter_brand_id IS NULL OR ce.brand_id = filter_brand_id)
    ORDER BY ce.embedding_openai <=> query_embedding
    LIMIT match_count;
END;
$$;
;
