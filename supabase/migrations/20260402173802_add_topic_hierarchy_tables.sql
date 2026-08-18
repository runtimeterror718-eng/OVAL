
-- 3-level topic hierarchy tables

-- Level 1: Themes (4-8 per brand)
CREATE TABLE IF NOT EXISTS topic_themes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    theme_id INT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    mention_count INT DEFAULT 0,
    avg_sentiment FLOAT,
    velocity FLOAT DEFAULT 0,
    lifecycle TEXT DEFAULT 'unknown',
    actionability_score FLOAT DEFAULT 0,
    platform_distribution JSONB DEFAULT '{}',
    platform_sentiments JSONB DEFAULT '{}',
    platform_divergence FLOAT DEFAULT 0,
    intent_distribution JSONB DEFAULT '{}',
    emotion_distribution JSONB DEFAULT '{}',
    user_segment_distribution JSONB DEFAULT '{}',
    complaint_categories JSONB DEFAULT '{}',
    representative_texts TEXT[],
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, theme_id)
);

-- Level 2: Topics (15-40 per brand)
CREATE TABLE IF NOT EXISTS topic_topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    topic_id INT NOT NULL,
    parent_theme_id INT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    mention_count INT DEFAULT 0,
    avg_sentiment FLOAT,
    velocity FLOAT DEFAULT 0,
    lifecycle TEXT DEFAULT 'unknown',
    actionability_score FLOAT DEFAULT 0,
    platform_distribution JSONB DEFAULT '{}',
    platform_sentiments JSONB DEFAULT '{}',
    platform_divergence FLOAT DEFAULT 0,
    intent_distribution JSONB DEFAULT '{}',
    emotion_distribution JSONB DEFAULT '{}',
    user_segment_distribution JSONB DEFAULT '{}',
    complaint_categories JSONB DEFAULT '{}',
    representative_texts TEXT[],
    keywords TEXT[],
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, topic_id)
);

-- Level 3: Sub-topics (50-150 per brand)
CREATE TABLE IF NOT EXISTS topic_subtopics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    subtopic_id INT NOT NULL,
    parent_topic_id INT NOT NULL,
    parent_theme_id INT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    mention_count INT DEFAULT 0,
    avg_sentiment FLOAT,
    velocity FLOAT DEFAULT 0,
    lifecycle TEXT DEFAULT 'unknown',
    actionability_score FLOAT DEFAULT 0,
    platform_distribution JSONB DEFAULT '{}',
    representative_texts TEXT[],
    keywords TEXT[],
    is_misc BOOLEAN DEFAULT FALSE,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brand_id, subtopic_id)
);

-- Per-mention enrichment (LLM pre-classification metadata)
CREATE TABLE IF NOT EXISTS mention_enrichments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mention_id UUID REFERENCES mentions(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    intent TEXT,
    emotion TEXT,
    specificity TEXT,
    product_mentioned TEXT,
    person_mentioned TEXT,
    competitor_mentioned TEXT,
    complaint_category TEXT,
    user_segment TEXT,
    urgency TEXT DEFAULT 'low',
    is_actionable BOOLEAN DEFAULT FALSE,
    action_type TEXT,
    theme_id INT,
    topic_id INT,
    subtopic_id INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_topic_themes_brand ON topic_themes(brand_id);
CREATE INDEX IF NOT EXISTS idx_topic_topics_brand ON topic_topics(brand_id);
CREATE INDEX IF NOT EXISTS idx_topic_topics_parent ON topic_topics(parent_theme_id);
CREATE INDEX IF NOT EXISTS idx_topic_subtopics_brand ON topic_subtopics(brand_id);
CREATE INDEX IF NOT EXISTS idx_topic_subtopics_parent ON topic_subtopics(parent_topic_id);
CREATE INDEX IF NOT EXISTS idx_mention_enrichments_brand ON mention_enrichments(brand_id);
CREATE INDEX IF NOT EXISTS idx_mention_enrichments_mention ON mention_enrichments(mention_id);
CREATE INDEX IF NOT EXISTS idx_mention_enrichments_theme ON mention_enrichments(theme_id);
;
