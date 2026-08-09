
-- Negative-only vector search for actionables
CREATE OR REPLACE FUNCTION match_mentions_negative(
    query_embedding vector(1536),
    match_threshold double precision DEFAULT 0.25,
    match_count integer DEFAULT 15,
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
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT me.id, me.mention_id, me.content_text, me.platform, me.cluster_id,
           me.sentiment_label, me.sentiment_score,
           1 - (me.embedding_openai <=> query_embedding) AS similarity
    FROM mention_embeddings me
    WHERE me.embedding_openai IS NOT NULL
      AND me.sentiment_label = 'negative'
      AND (filter_brand_id IS NULL OR me.brand_id = filter_brand_id)
      AND 1 - (me.embedding_openai <=> query_embedding) > match_threshold
    ORDER BY me.embedding_openai <=> query_embedding
    LIMIT match_count;
END; $$;

-- Sentiment-filtered vector search (any label)
CREATE OR REPLACE FUNCTION match_mentions_by_sentiment(
    query_embedding vector(1536),
    filter_sentiment varchar DEFAULT NULL,
    match_threshold double precision DEFAULT 0.25,
    match_count integer DEFAULT 15,
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
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT me.id, me.mention_id, me.content_text, me.platform, me.cluster_id,
           me.sentiment_label, me.sentiment_score,
           1 - (me.embedding_openai <=> query_embedding) AS similarity
    FROM mention_embeddings me
    WHERE me.embedding_openai IS NOT NULL
      AND (filter_sentiment IS NULL OR me.sentiment_label = filter_sentiment)
      AND (filter_brand_id IS NULL OR me.brand_id = filter_brand_id)
      AND 1 - (me.embedding_openai <=> query_embedding) > match_threshold
    ORDER BY me.embedding_openai <=> query_embedding
    LIMIT match_count;
END; $$;

-- Platform-filtered vector search  
CREATE OR REPLACE FUNCTION match_mentions_by_platform(
    query_embedding vector(1536),
    filter_platform varchar DEFAULT NULL,
    filter_sentiment varchar DEFAULT NULL,
    match_threshold double precision DEFAULT 0.25,
    match_count integer DEFAULT 15,
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
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT me.id, me.mention_id, me.content_text, me.platform, me.cluster_id,
           me.sentiment_label, me.sentiment_score,
           1 - (me.embedding_openai <=> query_embedding) AS similarity
    FROM mention_embeddings me
    WHERE me.embedding_openai IS NOT NULL
      AND (filter_platform IS NULL OR me.platform = filter_platform)
      AND (filter_sentiment IS NULL OR me.sentiment_label = filter_sentiment)
      AND (filter_brand_id IS NULL OR me.brand_id = filter_brand_id)
      AND 1 - (me.embedding_openai <=> query_embedding) > match_threshold
    ORDER BY me.embedding_openai <=> query_embedding
    LIMIT match_count;
END; $$;

-- Aggregate stats view for dashboard overview
CREATE OR REPLACE VIEW brand_health_stats AS
SELECT 
    brand_id,
    count(*) as total_mentions,
    count(*) FILTER (WHERE sentiment_label = 'positive') as positive_count,
    count(*) FILTER (WHERE sentiment_label = 'negative') as negative_count,
    count(*) FILTER (WHERE sentiment_label = 'neutral') as neutral_count,
    round(avg(sentiment_score)::numeric, 3) as avg_sentiment,
    count(DISTINCT platform) as platform_count,
    jsonb_object_agg(
        COALESCE(platform, 'unknown'),
        platform_count
    ) as platform_breakdown
FROM (
    SELECT brand_id, platform, sentiment_label, sentiment_score,
           count(*) OVER (PARTITION BY brand_id, platform) as platform_count
    FROM mention_embeddings
    WHERE embedding_openai IS NOT NULL
) sub
GROUP BY brand_id;
;
