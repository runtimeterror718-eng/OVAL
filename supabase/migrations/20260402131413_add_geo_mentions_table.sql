
CREATE TABLE IF NOT EXISTS geo_mentions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    mention_id UUID REFERENCES mentions(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL,
    state TEXT NOT NULL,
    state_code VARCHAR(5) NOT NULL,
    city TEXT,
    lat FLOAT,
    lng FLOAT,
    inference_method TEXT NOT NULL,
    confidence FLOAT DEFAULT 0.5,
    source_text TEXT,
    sentiment_label VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_mentions_brand ON geo_mentions(brand_id);
CREATE INDEX IF NOT EXISTS idx_geo_mentions_state ON geo_mentions(state_code);
CREATE INDEX IF NOT EXISTS idx_geo_mentions_platform ON geo_mentions(platform);

CREATE TABLE IF NOT EXISTS geo_aggregates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    state_code VARCHAR(5) NOT NULL,
    lat FLOAT,
    lng FLOAT,
    total_mentions INT DEFAULT 0,
    negative_mentions INT DEFAULT 0,
    positive_mentions INT DEFAULT 0,
    neutral_mentions INT DEFAULT 0,
    negative_pct FLOAT DEFAULT 0,
    top_issue TEXT,
    reddit_count INT DEFAULT 0,
    instagram_count INT DEFAULT 0,
    twitter_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, state_code)
);

CREATE INDEX IF NOT EXISTS idx_geo_agg_brand ON geo_aggregates(brand_id);
;
