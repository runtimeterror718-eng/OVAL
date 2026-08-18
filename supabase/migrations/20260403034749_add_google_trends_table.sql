
CREATE TABLE IF NOT EXISTS google_trends (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    date DATE,
    interest_value INT DEFAULT 0,
    region TEXT,
    region_interest INT DEFAULT 0,
    related_query TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_autocomplete (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    suggestion TEXT NOT NULL,
    sentiment TEXT DEFAULT 'neutral',
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_news (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
    title TEXT,
    source TEXT,
    url TEXT,
    published TEXT,
    snippet TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_trends_brand ON google_trends(brand_id);
CREATE INDEX IF NOT EXISTS idx_google_autocomplete_brand ON google_autocomplete(brand_id);
CREATE INDEX IF NOT EXISTS idx_google_news_brand ON google_news(brand_id);
;
