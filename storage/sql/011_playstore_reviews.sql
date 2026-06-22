-- Dedicated Play Store review storage for OVAL.
-- Apply this in Supabase SQL Editor, or through psql/Supabase CLI when available.

CREATE TABLE IF NOT EXISTS playstore_reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    package_name TEXT NOT NULL DEFAULT 'xyz.penpencil.physicswala',
    review_id TEXT NOT NULL UNIQUE,
    author TEXT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    language TEXT,
    device TEXT,
    android_os_version TEXT,
    app_version TEXT,
    thumbs_up_count INT DEFAULT 0,
    posted_at TIMESTAMPTZ,
    replied BOOLEAN DEFAULT FALSE,
    reply_text TEXT,
    reply_posted_at TIMESTAMPTZ,
    source TEXT DEFAULT 'google-play-developer-api',
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_playstore_reviews_package_posted_at
    ON playstore_reviews (package_name, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_playstore_reviews_rating_posted_at
    ON playstore_reviews (rating, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_playstore_reviews_app_version
    ON playstore_reviews (app_version);

CREATE INDEX IF NOT EXISTS idx_playstore_reviews_brand_id
    ON playstore_reviews (brand_id);

ALTER TABLE playstore_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "playstore_reviews_public_read" ON playstore_reviews;
CREATE POLICY "playstore_reviews_public_read"
    ON playstore_reviews
    FOR SELECT
    USING (true);
