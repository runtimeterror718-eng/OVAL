
-- Reddit posts: add triage + risk scoring
ALTER TABLE reddit_posts
ADD COLUMN IF NOT EXISTS post_triage_label text,
ADD COLUMN IF NOT EXISTS post_triage_is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS post_triage_confidence float DEFAULT 0,
ADD COLUMN IF NOT EXISTS post_triage_issue_type text,
ADD COLUMN IF NOT EXISTS post_triage_severity text,
ADD COLUMN IF NOT EXISTS post_triage_reason text,
ADD COLUMN IF NOT EXISTS final_sentiment text,
ADD COLUMN IF NOT EXISTS final_severity text,
ADD COLUMN IF NOT EXISTS final_is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS final_issue_type text,
ADD COLUMN IF NOT EXISTS final_recommended_action text;

-- Reddit comments: add sentiment classification
ALTER TABLE reddit_comments
ADD COLUMN IF NOT EXISTS comment_sentiment_label text;

-- Google autocomplete: add risk fields
ALTER TABLE google_autocomplete
ADD COLUMN IF NOT EXISTS triage_label text,
ADD COLUMN IF NOT EXISTS triage_is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS triage_severity text,
ADD COLUMN IF NOT EXISTS triage_reason text;

-- Google news: add analysis fields
ALTER TABLE google_news
ADD COLUMN IF NOT EXISTS sentiment text,
ADD COLUMN IF NOT EXISTS is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS severity text,
ADD COLUMN IF NOT EXISTS issue_type text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reddit_posts_pr_risk ON reddit_posts(final_is_pr_risk) WHERE final_is_pr_risk = true;
CREATE INDEX IF NOT EXISTS idx_reddit_comments_sentiment ON reddit_comments(comment_sentiment_label);
;
