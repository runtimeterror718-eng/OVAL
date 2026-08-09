"""
Common Supabase queries for all tables.
Covers: brands, platform-specific tables, mentions, severity, fulfillment, analysis.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from config.supabase_client import get_service_client


# ---------------------------------------------------------------------------
# Brands
# ---------------------------------------------------------------------------

def get_brand(brand_id: str) -> dict | None:
    resp = get_service_client().table("brands").select("*").eq("id", brand_id).execute()
    return resp.data[0] if resp.data else None


def get_all_brands() -> list[dict]:
    resp = get_service_client().table("brands").select("*").execute()
    return resp.data


def upsert_brand(brand: dict) -> dict:
    name = str(brand.get("name") or "").strip()
    if name:
        existing = (
            get_service_client()
            .table("brands")
            .select("*")
            .eq("name", name)
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )
        if existing.data:
            brand_id = existing.data[0]["id"]
            updated = (
                get_service_client()
                .table("brands")
                .update(brand)
                .eq("id", brand_id)
                .execute()
            )
            return updated.data[0]
    resp = get_service_client().table("brands").insert(brand).execute()
    return resp.data[0]


# ---------------------------------------------------------------------------
# Instagram
# ---------------------------------------------------------------------------

def upsert_instagram_account(account: dict) -> dict:
    resp = get_service_client().table("instagram_accounts").upsert(account).execute()
    return resp.data[0]


def insert_instagram_post(post: dict) -> dict:
    resp = get_service_client().table("instagram_posts").upsert(
        post, on_conflict="post_id"
    ).execute()
    return resp.data[0]


def insert_instagram_posts_batch(posts: list[dict]) -> list[dict]:
    if not posts:
        return []
    resp = get_service_client().table("instagram_posts").upsert(
        posts, on_conflict="post_id"
    ).execute()
    return resp.data


def insert_instagram_comment(comment: dict) -> dict:
    resp = get_service_client().table("instagram_comments").insert(comment).execute()
    return resp.data[0]


def insert_instagram_comments_batch(comments: list[dict]) -> list[dict]:
    if not comments:
        return []
    resp = get_service_client().table("instagram_comments").insert(comments).execute()
    return resp.data


def get_instagram_posts(brand_id: str, limit: int = 100) -> list[dict]:
    resp = (
        get_service_client()
        .table("instagram_posts")
        .select("*")
        .eq("brand_id", brand_id)
        .order("scraped_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data


# ---------------------------------------------------------------------------
# Reddit
# ---------------------------------------------------------------------------

def insert_reddit_post(post: dict) -> dict:
    resp = get_service_client().table("reddit_posts").upsert(
        post, on_conflict="post_id"
    ).execute()
    return resp.data[0]


def insert_reddit_posts_batch(posts: list[dict]) -> list[dict]:
    if not posts:
        return []
    resp = get_service_client().table("reddit_posts").upsert(
        posts, on_conflict="post_id"
    ).execute()
    return resp.data


def insert_reddit_comment(comment: dict) -> dict:
    resp = get_service_client().table("reddit_comments").insert(comment).execute()
    return resp.data[0]


def insert_reddit_comments_batch(comments: list[dict]) -> list[dict]:
    if not comments:
        return []
    resp = get_service_client().table("reddit_comments").insert(comments).execute()
    return resp.data


def get_reddit_posts(brand_id: str, limit: int = 100) -> list[dict]:
    resp = (
        get_service_client()
        .table("reddit_posts")
        .select("*")
        .eq("brand_id", brand_id)
        .order("scraped_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data


# ---------------------------------------------------------------------------
# Mentions (unified cross-platform)
# ---------------------------------------------------------------------------

def insert_mention(mention: dict) -> dict:
    resp = get_service_client().table("mentions").insert(mention).execute()
    return resp.data[0]


def insert_mentions_batch(mentions: list[dict]) -> list[dict]:
    if not mentions:
        return []
    resp = get_service_client().table("mentions").insert(mentions).execute()
    return resp.data


def get_mentions(
    brand_id: str,
    platform: str | None = None,
    since: datetime | None = None,
    limit: int = 500,
) -> list[dict]:
    q = (
        get_service_client()
        .table("mentions")
        .select("*")
        .eq("brand_id", brand_id)
        .order("scraped_at", desc=True)
        .limit(limit)
    )
    if platform:
        q = q.eq("platform", platform)
    if since:
        q = q.gte("scraped_at", since.isoformat())
    return q.execute().data


def get_mention(mention_id: str) -> dict | None:
    resp = (
        get_service_client()
        .table("mentions")
        .select("*")
        .eq("id", mention_id)
        .execute()
    )
    return resp.data[0] if resp.data else None


def update_mention(mention_id: str, updates: dict) -> dict:
    resp = (
        get_service_client()
        .table("mentions")
        .update(updates)
        .eq("id", mention_id)
        .execute()
    )
    return resp.data[0]


def get_mention_by_platform_ref(
    brand_id: str | None,
    platform: str,
    platform_ref_id: str,
) -> dict | None:
    q = (
        get_service_client()
        .table("mentions")
        .select("*")
        .eq("platform", platform)
        .eq("platform_ref_id", platform_ref_id)
        .order("scraped_at", desc=True)
        .limit(1)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    resp = q.execute()
    return resp.data[0] if resp.data else None


def upsert_mention_by_platform_ref(mention: dict) -> dict:
    existing = get_mention_by_platform_ref(
        mention.get("brand_id"),
        mention.get("platform", ""),
        mention.get("platform_ref_id", ""),
    )
    if existing:
        updated = (
            get_service_client()
            .table("mentions")
            .update(mention)
            .eq("id", existing["id"])
            .execute()
        )
        return updated.data[0]
    return insert_mention(mention)


# ---------------------------------------------------------------------------
# Transcriptions
# ---------------------------------------------------------------------------

def insert_transcription(transcription: dict) -> dict:
    resp = (
        get_service_client()
        .table("transcriptions")
        .insert(transcription)
        .execute()
    )
    return resp.data[0]


def _get_mention_platform_context(mention_id: str) -> dict | None:
    if not mention_id:
        return None
    resp = (
        get_service_client()
        .table("mentions")
        .select("id,platform,platform_ref_id,brand_id")
        .eq("id", mention_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_youtube_video_transcript(video_id: str, transcript: dict) -> dict:
    normalized_video_id = str(video_id or "").strip()
    if not normalized_video_id:
        return {}
    updates = {
        "transcript_source_type": transcript.get("source_type"),
        "transcript_text": transcript.get("transcript_text"),
        "transcript_language": transcript.get("language"),
        "transcript_duration_seconds": transcript.get("duration_seconds"),
        "transcript_metadata": (
            transcript.get("brand_mentions")
            if isinstance(transcript.get("brand_mentions"), dict)
            else {}
        ),
        "transcript_updated_at": transcript.get("created_at") or datetime.utcnow().isoformat(),
    }
    return update_youtube_video_by_video_id(normalized_video_id, updates)


def get_youtube_video_transcript(video_id: str) -> dict | None:
    row = get_youtube_video_by_video_id(video_id)
    if not row:
        return None
    text = str(row.get("transcript_text") or "").strip()
    if not text:
        return None
    return {
        "video_id": row.get("video_id"),
        "source_type": row.get("transcript_source_type"),
        "transcript_text": row.get("transcript_text"),
        "language": row.get("transcript_language"),
        "duration_seconds": row.get("transcript_duration_seconds"),
        "brand_mentions": row.get("transcript_metadata") if isinstance(row.get("transcript_metadata"), dict) else {},
        "created_at": row.get("transcript_updated_at"),
    }


def get_transcription_by_mention(mention_id: str) -> dict | None:
    mention = _get_mention_platform_context(mention_id)
    if mention and str(mention.get("platform") or "").strip().lower() == "youtube":
        video_id = str(mention.get("platform_ref_id") or "").strip()
        transcript = get_youtube_video_transcript(video_id)
        if not transcript:
            return None
        return {
            "mention_id": mention_id,
            **transcript,
        }

    resp = (
        get_service_client()
        .table("transcriptions")
        .select("*")
        .eq("mention_id", mention_id)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_transcription_for_mention(transcription: dict) -> dict:
    mention_id = transcription.get("mention_id")
    source_type = transcription.get("source_type")
    if not mention_id:
        return insert_transcription(transcription)

    mention = _get_mention_platform_context(str(mention_id))
    if mention and str(mention.get("platform") or "").strip().lower() == "youtube":
        video_id = str(mention.get("platform_ref_id") or "").strip()
        if not video_id:
            return {}
        row = upsert_youtube_video_transcript(video_id, transcription)
        return {
            "mention_id": mention_id,
            "video_id": video_id,
            "source_type": row.get("transcript_source_type"),
            "transcript_text": row.get("transcript_text"),
            "language": row.get("transcript_language"),
            "duration_seconds": row.get("transcript_duration_seconds"),
            "brand_mentions": row.get("transcript_metadata") if isinstance(row.get("transcript_metadata"), dict) else {},
            "created_at": row.get("transcript_updated_at"),
        }

    q = (
        get_service_client()
        .table("transcriptions")
        .select("*")
        .eq("mention_id", mention_id)
        .order("created_at", desc=True)
        .limit(1)
    )
    if source_type:
        q = q.eq("source_type", source_type)
    resp = q.execute()
    if resp.data:
        updated = (
            get_service_client()
            .table("transcriptions")
            .update(transcription)
            .eq("id", resp.data[0]["id"])
            .execute()
        )
        return updated.data[0]
    return insert_transcription(transcription)


# ---------------------------------------------------------------------------
# Severity Scores
# ---------------------------------------------------------------------------

def insert_severity_score(score: dict) -> dict:
    resp = (
        get_service_client()
        .table("severity_scores")
        .insert(score)
        .execute()
    )
    return resp.data[0]


def get_severity_scores(
    brand_id: str,
    level: str | None = None,
    since: datetime | None = None,
    limit: int = 200,
) -> list[dict]:
    q = (
        get_service_client()
        .table("severity_scores")
        .select("*")
        .eq("brand_id", brand_id)
        .order("computed_at", desc=True)
        .limit(limit)
    )
    if level:
        q = q.eq("severity_level", level)
    if since:
        q = q.gte("computed_at", since.isoformat())
    return q.execute().data


# ---------------------------------------------------------------------------
# Fulfillment Results
# ---------------------------------------------------------------------------

def insert_fulfillment_result(result: dict) -> dict:
    resp = (
        get_service_client()
        .table("fulfillment_results")
        .insert(result)
        .execute()
    )
    return resp.data[0]


def get_latest_fulfillment_result_for_mention(mention_id: str) -> dict | None:
    resp = (
        get_service_client()
        .table("fulfillment_results")
        .select("*")
        .eq("mention_id", mention_id)
        .order("evaluated_at", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_fulfillment_result_for_mention(result: dict) -> dict:
    mention_id = result.get("mention_id")
    if not mention_id:
        return insert_fulfillment_result(result)

    existing = get_latest_fulfillment_result_for_mention(mention_id)
    if existing:
        updated = (
            get_service_client()
            .table("fulfillment_results")
            .update(result)
            .eq("id", existing["id"])
            .execute()
        )
        return updated.data[0]
    return insert_fulfillment_result(result)


# ---------------------------------------------------------------------------
# YouTube Raw Tables
# ---------------------------------------------------------------------------

def get_youtube_video_by_video_id(video_id: str) -> dict | None:
    resp = (
        get_service_client()
        .table("youtube_videos")
        .select("*")
        .eq("video_id", video_id)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def upsert_youtube_video(video: dict) -> dict:
    resp = (
        get_service_client()
        .table("youtube_videos")
        .upsert(video, on_conflict="video_id")
        .execute()
    )
    if resp.data:
        return resp.data[0]
    row = get_youtube_video_by_video_id(video.get("video_id", ""))
    return row or {}


def update_youtube_video_by_video_id(video_id: str, updates: dict) -> dict:
    resp = (
        get_service_client()
        .table("youtube_videos")
        .update(updates)
        .eq("video_id", video_id)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    row = get_youtube_video_by_video_id(video_id)
    return row or {}


def get_youtube_videos_for_brand(
    brand_id: str | None,
    limit: int = 500,
) -> list[dict]:
    q = (
        get_service_client()
        .table("youtube_videos")
        .select("*")
        .order("scraped_at", desc=True)
        .limit(limit)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    resp = q.execute()
    return resp.data or []


def get_youtube_videos_by_video_ids(video_ids: list[str]) -> list[dict]:
    ids = [str(v).strip() for v in (video_ids or []) if str(v).strip()]
    if not ids:
        return []
    resp = (
        get_service_client()
        .table("youtube_videos")
        .select("*")
        .in_("video_id", ids)
        .execute()
    )
    return resp.data or []


def _deep_merge_dicts(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in (patch or {}).items():
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = _deep_merge_dicts(existing, value)
        else:
            merged[key] = value
    return merged


def merge_youtube_video_analysis_artifacts(video_id: str, patch: dict[str, Any]) -> dict:
    row = get_youtube_video_by_video_id(video_id) or {}
    artifacts = row.get("analysis_artifacts")
    if not isinstance(artifacts, dict):
        artifacts = {}
    merged = _deep_merge_dicts(artifacts, patch or {})
    return update_youtube_video_by_video_id(video_id, {"analysis_artifacts": merged})


def find_youtube_channel(
    channel_id: str,
    brand_id: str | None = None,
) -> dict | None:
    q = (
        get_service_client()
        .table("youtube_channels")
        .select("*")
        .eq("channel_id", channel_id)
        .order("scraped_at", desc=True)
        .limit(1)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    resp = q.execute()
    return resp.data[0] if resp.data else None


def upsert_youtube_channel(channel: dict) -> dict:
    existing = find_youtube_channel(
        channel.get("channel_id", ""),
        brand_id=channel.get("brand_id"),
    )
    if existing:
        resp = (
            get_service_client()
            .table("youtube_channels")
            .update(channel)
            .eq("id", existing["id"])
            .execute()
        )
        return resp.data[0]

    resp = (
        get_service_client()
        .table("youtube_channels")
        .insert(channel)
        .execute()
    )
    return resp.data[0]


def get_youtube_comments(video_id: str, limit: int = 1000) -> list[dict]:
    resp = (
        get_service_client()
        .table("youtube_comments")
        .select("*")
        .eq("video_id", video_id)
        .order("comment_date", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def insert_youtube_comments_batch(comments: list[dict]) -> list[dict]:
    if not comments:
        return []

    video_id = comments[0].get("video_id")
    if not video_id:
        return []

    def _row_key(row: dict) -> tuple[str, str, str]:
        return (
            (row.get("comment_author") or "").strip().lower(),
            (row.get("comment_text") or "").strip(),
            str(row.get("comment_date") or ""),
        )

    existing_rows = get_youtube_comments(video_id, limit=5000)
    existing_comment_ids = {
        str(row.get("comment_id") or "").strip()
        for row in existing_rows
        if str(row.get("comment_id") or "").strip()
    }
    existing_keys = {_row_key(row) for row in existing_rows}
    existing_rows_by_key: dict[tuple[str, str, str], dict] = {}
    for row in existing_rows:
        key = _row_key(row)
        selected = existing_rows_by_key.get(key)
        if not selected:
            existing_rows_by_key[key] = row
            continue
        selected_has_id = bool(str(selected.get("comment_id") or "").strip())
        row_has_id = bool(str(row.get("comment_id") or "").strip())
        if selected_has_id and not row_has_id:
            existing_rows_by_key[key] = row

    to_insert: list[dict] = []
    to_hydrate: list[tuple[str, dict]] = []
    hydrated_row_ids: set[str] = set()
    seen_new_ids: set[str] = set()
    seen_new: set[tuple[str, str, str]] = set()
    for row in comments:
        key = _row_key(row)
        comment_id = str(row.get("comment_id") or "").strip()
        if comment_id:
            if comment_id in existing_comment_ids or comment_id in seen_new_ids:
                continue
            existing = existing_rows_by_key.get(key)
            existing_row_id = str((existing or {}).get("id") or "").strip()
            existing_comment_id = str((existing or {}).get("comment_id") or "").strip()
            if existing and existing_row_id and not existing_comment_id and existing_row_id not in hydrated_row_ids:
                hydrate_payload = {
                    "comment_id": comment_id,
                    "parent_comment_id": row.get("parent_comment_id"),
                    "thread_comment_id": row.get("thread_comment_id"),
                    "is_reply": row.get("is_reply"),
                    "comment_replies": row.get("comment_replies"),
                    "comment_likes": row.get("comment_likes"),
                    "scraped_at": row.get("scraped_at"),
                }
                if row.get("raw_payload") is not None:
                    hydrate_payload["raw_payload"] = row.get("raw_payload")
                to_hydrate.append((existing_row_id, hydrate_payload))
                hydrated_row_ids.add(existing_row_id)
                seen_new_ids.add(comment_id)
                continue
            seen_new_ids.add(comment_id)
            to_insert.append(row)
            continue

        if key in existing_keys or key in seen_new:
            continue
        seen_new.add(key)
        to_insert.append(row)

    for row_id, updates in to_hydrate:
        (
            get_service_client()
            .table("youtube_comments")
            .update(updates)
            .eq("id", row_id)
            .execute()
        )

    if not to_insert:
        return []

    resp = (
        get_service_client()
        .table("youtube_comments")
        .insert(to_insert)
        .execute()
    )
    return resp.data or []


def update_youtube_comment_by_comment_id(comment_id: str, updates: dict) -> dict:
    normalized_comment_id = str(comment_id or "").strip()
    if not normalized_comment_id:
        return {}
    resp = (
        get_service_client()
        .table("youtube_comments")
        .update(updates)
        .eq("comment_id", normalized_comment_id)
        .execute()
    )
    return resp.data[0] if resp.data else {}


def update_youtube_comment_sentiments(
    sentiment_updates: list[dict[str, Any]],
) -> int:
    updated = 0
    for row in sentiment_updates or []:
        comment_id = str(row.get("comment_id") or "").strip()
        if not comment_id:
            continue
        payload = {
            "comment_sentiment_label": row.get("comment_sentiment_label"),
            "comment_sentiment_custom_id": row.get("comment_sentiment_custom_id"),
            "comment_sentiment_processed_at": row.get("comment_sentiment_processed_at"),
        }
        result = update_youtube_comment_by_comment_id(comment_id, payload)
        if result:
            updated += 1
    return updated


# ---------------------------------------------------------------------------
# Telegram Raw Tables
# ---------------------------------------------------------------------------

def get_telegram_channel(
    brand_id: str | None,
    channel_id: str,
) -> dict | None:
    normalized_channel_id = str(channel_id or "").strip()
    if not normalized_channel_id:
        return None
    q = (
        get_service_client()
        .table("telegram_channels")
        .select("*")
        .eq("channel_id", normalized_channel_id)
        .order("updated_at", desc=True)
        .limit(1)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    resp = q.execute()
    return resp.data[0] if resp.data else None


def list_telegram_channels_for_brand(
    brand_id: str | None,
    should_monitor: bool | None = None,
    historical_data: bool | None = None,
    limit: int = 500,
) -> list[dict]:
    q = (
        get_service_client()
        .table("telegram_channels")
        .select("*")
        .order("updated_at", desc=True)
        .limit(limit)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    if should_monitor is not None:
        q = q.eq("should_monitor", bool(should_monitor))
    if historical_data is not None:
        q = q.eq("historical_data", bool(historical_data))
    resp = q.execute()
    return resp.data or []


def _telegram_channel_needs_fulfilment(row: dict[str, Any]) -> bool:
    response = row.get("llm_classification_response")
    if not isinstance(response, dict) or not response:
        return True
    if not str(row.get("classification_label") or "").strip():
        return True
    if row.get("should_monitor") is None:
        return True
    if row.get("is_fake") is None:
        return True
    if "fake_score_10" in row and row.get("fake_score_10") is None:
        return True
    return False


def list_telegram_channels_for_fulfilment(
    brand_id: str | None = None,
    only_unclassified: bool = True,
    discovered_since_hours: int | None = None,
    limit: int = 200,
    target_channel_ids: list[str] | None = None,
    target_channel_usernames: list[str] | None = None,
) -> list[dict]:
    capped_limit = max(1, int(limit or 1))
    scan_limit = capped_limit
    if bool(only_unclassified):
        scan_limit = max(capped_limit * 5, capped_limit)
    q = (
        get_service_client()
        .table("telegram_channels")
        .select("*")
        .order("first_discovered_at", desc=True)
        .limit(scan_limit)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    if discovered_since_hours is not None and int(discovered_since_hours) > 0:
        since_iso = (datetime.utcnow() - timedelta(hours=int(discovered_since_hours))).isoformat()
        q = q.gte("first_discovered_at", since_iso)

    resp = q.execute()
    rows = resp.data or []

    ids = {
        str(item).strip()
        for item in (target_channel_ids or [])
        if str(item).strip()
    }
    usernames = {
        str(item).strip().lower().lstrip("@")
        for item in (target_channel_usernames or [])
        if str(item).strip()
    }
    if ids or usernames:
        filtered: list[dict] = []
        for row in rows:
            row_channel_id = str(row.get("channel_id") or "").strip()
            row_username = str(row.get("channel_username") or "").strip().lower().lstrip("@")
            if (row_channel_id and row_channel_id in ids) or (row_username and row_username in usernames):
                filtered.append(row)
        rows = filtered

    if only_unclassified:
        rows = [row for row in rows if _telegram_channel_needs_fulfilment(row)]

    return rows[:capped_limit]


def list_telegram_channels_for_message_fetch(
    brand_id: str | None = None,
    limit: int = 500,
    target_channel_ids: list[str] | None = None,
    target_channel_usernames: list[str] | None = None,
) -> list[dict]:
    rows = list_telegram_channels_for_brand(
        brand_id=brand_id,
        should_monitor=True,
        limit=max(1, int(limit or 1)),
    )
    ids = {
        str(item).strip()
        for item in (target_channel_ids or [])
        if str(item).strip()
    }
    usernames = {
        str(item).strip().lower().lstrip("@")
        for item in (target_channel_usernames or [])
        if str(item).strip()
    }
    if not ids and not usernames:
        return rows

    filtered: list[dict] = []
    for row in rows:
        row_channel_id = str(row.get("channel_id") or "").strip()
        row_username = str(row.get("channel_username") or "").strip().lower().lstrip("@")
        if (row_channel_id and row_channel_id in ids) or (row_username and row_username in usernames):
            filtered.append(row)
    return filtered


def upsert_telegram_channel(channel: dict) -> dict:
    normalized_channel_id = str(channel.get("channel_id") or "").strip()
    if not normalized_channel_id:
        raise ValueError("telegram channel upsert requires non-empty channel_id")

    payload = dict(channel)
    payload["channel_id"] = normalized_channel_id
    existing = get_telegram_channel(payload.get("brand_id"), normalized_channel_id)
    if existing:
        resp = (
            get_service_client()
            .table("telegram_channels")
            .update(payload)
            .eq("id", existing["id"])
            .execute()
        )
        return resp.data[0] if resp.data else existing

    resp = (
        get_service_client()
        .table("telegram_channels")
        .insert(payload)
        .execute()
    )
    return resp.data[0]


def upsert_telegram_channels_batch(channels: list[dict]) -> list[dict]:
    if not channels:
        return []
    rows: list[dict] = []
    for channel in channels:
        rows.append(upsert_telegram_channel(channel))
    return rows


def update_telegram_channel(channel_row_id: str, updates: dict) -> dict:
    resp = (
        get_service_client()
        .table("telegram_channels")
        .update(updates)
        .eq("id", channel_row_id)
        .execute()
    )
    return resp.data[0] if resp.data else {}


def get_latest_telegram_message_for_channel(
    channel_id: str,
    brand_id: str | None = None,
) -> dict | None:
    normalized_channel_id = str(channel_id or "").strip()
    if not normalized_channel_id:
        return None
    q = (
        get_service_client()
        .table("telegram_messages")
        .select("*")
        .eq("channel_id", normalized_channel_id)
        .order("message_timestamp", desc=True)
        .limit(1)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    resp = q.execute()
    return resp.data[0] if resp.data else None


def upsert_telegram_message(message: dict) -> dict:
    payload = dict(message)
    if payload.get("channel_id") is not None:
        payload["channel_id"] = str(payload.get("channel_id") or "").strip()
    if payload.get("message_id") is not None:
        payload["message_id"] = str(payload.get("message_id") or "").strip()

    resp = (
        get_service_client()
        .table("telegram_messages")
        .upsert(payload, on_conflict="brand_id,channel_username,message_id")
        .execute()
    )
    return resp.data[0] if resp.data else {}


def upsert_telegram_messages_batch(messages: list[dict]) -> list[dict]:
    if not messages:
        return []
    payloads = []
    for row in messages:
        payload = dict(row)
        if payload.get("channel_id") is not None:
            payload["channel_id"] = str(payload.get("channel_id") or "").strip()
        if payload.get("message_id") is not None:
            payload["message_id"] = str(payload.get("message_id") or "").strip()
        payloads.append(payload)
    resp = (
        get_service_client()
        .table("telegram_messages")
        .upsert(payloads, on_conflict="brand_id,channel_username,message_id")
        .execute()
    )
    return resp.data or []


def update_telegram_message(message_row_id: str, updates: dict) -> dict:
    resp = (
        get_service_client()
        .table("telegram_messages")
        .update(updates)
        .eq("id", message_row_id)
        .execute()
    )
    return resp.data[0] if resp.data else {}


def _telegram_message_needs_analysis(row: dict[str, Any]) -> bool:
    response = row.get("llm_analysis_response")
    if not isinstance(response, dict) or not response:
        return True
    if not str(row.get("risk_label") or "").strip():
        return True
    if row.get("risk_score") is None:
        return True
    if row.get("analyzed_at") is None:
        return True
    return False


def list_telegram_messages_for_analysis(
    brand_id: str | None = None,
    only_unanalyzed: bool = True,
    message_since_hours: int | None = None,
    limit: int = 300,
    target_channel_ids: list[str] | None = None,
    target_channel_usernames: list[str] | None = None,
) -> list[dict]:
    capped_limit = max(1, int(limit or 1))
    scan_limit = capped_limit
    if bool(only_unanalyzed):
        scan_limit = max(capped_limit * 5, capped_limit)

    q = (
        get_service_client()
        .table("telegram_messages")
        .select("*")
        .order("message_timestamp", desc=True)
        .limit(scan_limit)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    if message_since_hours is not None and int(message_since_hours) > 0:
        since_iso = (datetime.utcnow() - timedelta(hours=int(message_since_hours))).isoformat()
        q = q.gte("message_timestamp", since_iso)

    resp = q.execute()
    rows = resp.data or []

    ids = {
        str(item).strip()
        for item in (target_channel_ids or [])
        if str(item).strip()
    }
    usernames = {
        str(item).strip().lower().lstrip("@")
        for item in (target_channel_usernames or [])
        if str(item).strip()
    }
    if ids or usernames:
        filtered: list[dict] = []
        for row in rows:
            row_channel_id = str(row.get("channel_id") or "").strip()
            row_username = str(row.get("channel_username") or "").strip().lower().lstrip("@")
            if (row_channel_id and row_channel_id in ids) or (row_username and row_username in usernames):
                filtered.append(row)
        rows = filtered

    if only_unanalyzed:
        rows = [row for row in rows if _telegram_message_needs_analysis(row)]

    return rows[:capped_limit]


def get_telegram_messages(
    brand_id: str | None = None,
    channel_id: str | None = None,
    since: datetime | None = None,
    limit: int = 500,
) -> list[dict]:
    q = (
        get_service_client()
        .table("telegram_messages")
        .select("*")
        .order("message_timestamp", desc=True)
        .limit(limit)
    )
    if brand_id:
        q = q.eq("brand_id", brand_id)
    if channel_id:
        q = q.eq("channel_id", str(channel_id).strip())
    if since:
        q = q.gte("message_timestamp", since.isoformat())
    resp = q.execute()
    return resp.data or []


# ---------------------------------------------------------------------------
# Analysis Runs
# ---------------------------------------------------------------------------

def insert_analysis_run(run: dict) -> dict:
    resp = (
        get_service_client()
        .table("analysis_runs")
        .insert(run)
        .execute()
    )
    return resp.data[0]


def get_latest_analysis(brand_id: str) -> dict | None:
    resp = (
        get_service_client()
        .table("analysis_runs")
        .select("*")
        .eq("brand_id", brand_id)
        .order("ran_at", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------

def get_mention_count_since(
    brand_id: str, since: datetime, platform: str | None = None
) -> int:
    q = (
        get_service_client()
        .table("mentions")
        .select("id", count="exact")
        .eq("brand_id", brand_id)
        .gte("scraped_at", since.isoformat())
    )
    if platform:
        q = q.eq("platform", platform)
    return q.execute().count or 0


def get_hourly_mention_rate(brand_id: str, last_hours: int = 2) -> float:
    since = datetime.utcnow().replace(microsecond=0) - timedelta(hours=last_hours)
    count = get_mention_count_since(brand_id, since)
    return count / max(last_hours, 1)


def get_avg_hourly_rate(brand_id: str, last_days: int = 7) -> float:
    since = datetime.utcnow().replace(microsecond=0) - timedelta(days=last_days)
    count = get_mention_count_since(brand_id, since)
    total_hours = last_days * 24
    return count / max(total_hours, 1)


# ---------------------------------------------------------------------------
# Geographic data
# ---------------------------------------------------------------------------

def get_geo_aggregates(brand_id: str) -> list[dict]:
    resp = (
        get_service_client()
        .table("geo_aggregates")
        .select("*")
        .eq("brand_id", brand_id)
        .order("negative_pct", desc=True)
        .execute()
    )
    return resp.data


def get_geo_mentions(brand_id: str, state_code: str | None = None, limit: int = 200) -> list[dict]:
    q = (
        get_service_client()
        .table("geo_mentions")
        .select("*")
        .eq("brand_id", brand_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if state_code:
        q = q.eq("state_code", state_code)
    return q.execute().data
