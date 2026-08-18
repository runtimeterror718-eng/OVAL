
-- Instagram posts: add triage + Reel transcript + risk scoring columns
ALTER TABLE instagram_posts 
ADD COLUMN IF NOT EXISTS source_type text,
ADD COLUMN IF NOT EXISTS caption_triage_label text,
ADD COLUMN IF NOT EXISTS caption_triage_is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS caption_triage_confidence float DEFAULT 0,
ADD COLUMN IF NOT EXISTS caption_triage_issue_type text,
ADD COLUMN IF NOT EXISTS caption_triage_reason text,
ADD COLUMN IF NOT EXISTS caption_triage_severity text,
ADD COLUMN IF NOT EXISTS reel_transcript_text text,
ADD COLUMN IF NOT EXISTS reel_transcript_language text,
ADD COLUMN IF NOT EXISTS reel_transcript_source text,
ADD COLUMN IF NOT EXISTS reel_transcript_sentiment text,
ADD COLUMN IF NOT EXISTS reel_transcript_pr_risk boolean,
ADD COLUMN IF NOT EXISTS reel_transcript_severity text,
ADD COLUMN IF NOT EXISTS reel_transcript_key_claims text[],
ADD COLUMN IF NOT EXISTS final_sentiment text,
ADD COLUMN IF NOT EXISTS final_severity text,
ADD COLUMN IF NOT EXISTS final_is_pr_risk boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS final_issue_type text,
ADD COLUMN IF NOT EXISTS final_recommended_action text,
ADD COLUMN IF NOT EXISTS analysis_artifacts jsonb,
ADD COLUMN IF NOT EXISTS discovery_source text,
ADD COLUMN IF NOT EXISTS discovery_hashtag text;

-- Instagram comments: add sentiment classification
ALTER TABLE instagram_comments
ADD COLUMN IF NOT EXISTS comment_sentiment_label text,
ADD COLUMN IF NOT EXISTS comment_likes integer DEFAULT 0;

-- Index for quick risk filtering
CREATE INDEX IF NOT EXISTS idx_ig_posts_pr_risk ON instagram_posts(final_is_pr_risk) WHERE final_is_pr_risk = true;
CREATE INDEX IF NOT EXISTS idx_ig_posts_sentiment ON instagram_posts(final_sentiment);
CREATE INDEX IF NOT EXISTS idx_ig_comments_sentiment ON instagram_comments(comment_sentiment_label);
;
