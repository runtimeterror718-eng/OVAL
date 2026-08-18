"""
Celery task wrappers — the glue between workers and business logic.
"""

from __future__ import annotations

import asyncio
import logging
import os

import httpx

from workers.celery_app import app
from brand.monitor import get_monitored_brands
from storage import queries as db

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Helper to run async code from sync Celery tasks."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _run_youtube_unofficial_pipeline(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    """Run the YouTube unofficial pipeline for a single brand."""
    from scrapers.youtube import run_unofficial_youtube_pipeline_for_brand

    summary = _run_async(run_unofficial_youtube_pipeline_for_brand(brand, **pipeline_kwargs))
    logger.info(
        "YouTube unofficial pipeline complete for brand=%s: discovered=%s flagged=%s enriched=%s",
        brand.get("name", ""),
        summary.get("discovered", 0),
        summary.get("flagged", 0),
        summary.get("enriched", 0),
    )
    return summary


def _run_youtube_title_triage_sync_ingestion(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.youtube import run_youtube_title_triage_sync_ingestion_for_brand

    summary = _run_async(run_youtube_title_triage_sync_ingestion_for_brand(brand, **pipeline_kwargs))
    logger.info(
        "YouTube sync title-triage ingestion complete for brand=%s discovered=%s triaged=%s",
        brand.get("name", ""),
        summary.get("discovered", 0),
        summary.get("titles_triaged", 0),
    )
    return summary


# NOTE: legacy batch submit/poll/ingest helpers are retained for safe rollback.
# Active cron-friendly flow is sync layer_1 + sync layer_2 tasks below.
def _submit_youtube_title_triage_batch(brand: dict, **pipeline_kwargs) -> dict:
    from scrapers.youtube import submit_youtube_title_triage_batch_for_brand

    summary = _run_async(submit_youtube_title_triage_batch_for_brand(brand, **pipeline_kwargs))
    logger.info(
        "YouTube title-triage submit complete for brand=%s discovered=%s batch_id=%s status=%s",
        brand.get("name", ""),
        summary.get("discovered", 0),
        summary.get("provider_batch_id"),
        summary.get("batch_status"),
    )
    return summary


def _poll_youtube_title_triage_batch(brand: dict, **pipeline_kwargs) -> dict:
    from scrapers.youtube import poll_youtube_title_triage_batch_for_brand

    summary = poll_youtube_title_triage_batch_for_brand(brand, **pipeline_kwargs)
    logger.info(
        "YouTube title-triage poll complete for brand=%s batches_polled=%s triage_updates=%s",
        brand.get("name", ""),
        summary.get("batches_polled", 0),
        summary.get("videos_updated_with_triage_results", 0),
    )
    return summary


def _ingest_youtube_title_triage_results(
    brand: dict,
    batch_meta: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.youtube import ingest_youtube_title_triage_results_for_brand

    summary = ingest_youtube_title_triage_results_for_brand(
        brand=brand,
        batch_meta=batch_meta,
        target_custom_ids=pipeline_kwargs.get("target_custom_ids"),
        query_buckets_hint=pipeline_kwargs.get("query_buckets_hint"),
    )
    logger.info(
        "YouTube title-triage ingest complete for brand=%s batch_id=%s triage_updates=%s",
        brand.get("name", ""),
        summary.get("provider_batch_id"),
        summary.get("videos_updated_with_triage_results", 0),
    )
    return summary


def _enrich_flagged_youtube_mentions(
    brand: dict,
    flagged_video_ids: list[str],
) -> dict:
    from scrapers.youtube import enrich_flagged_youtube_mentions

    summary = _run_async(enrich_flagged_youtube_mentions(brand, flagged_video_ids))
    logger.info(
        "YouTube flagged enrichment complete for brand=%s enriched=%s",
        brand.get("name", ""),
        summary.get("enriched", 0),
    )
    return summary


def _run_youtube_layer2_sync_fetch(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.youtube import run_youtube_layer2_fetch_sync_for_brand

    summary = run_youtube_layer2_fetch_sync_for_brand(brand, **pipeline_kwargs)
    logger.info(
        "YouTube layer-2 sync fetch complete for brand=%s page_candidates=%s transcript_success=%s comments_success=%s",
        brand.get("name", ""),
        summary.get("page_candidates", 0),
        summary.get("transcript_success", 0),
        summary.get("comments_success", 0),
    )
    return summary


def _run_youtube_transcript_sentiment_sync(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.youtube import run_youtube_transcript_sentiment_sync_for_brand

    summary = run_youtube_transcript_sentiment_sync_for_brand(brand, **pipeline_kwargs)
    logger.info(
        "YouTube transcript sentiment sync complete for brand=%s processed=%s failed=%s",
        brand.get("name", ""),
        summary.get("processed", 0),
        summary.get("failed", 0),
    )
    return summary


def _run_youtube_comment_sentiment_sync(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.youtube import run_youtube_comment_sentiment_sync_for_brand

    summary = run_youtube_comment_sentiment_sync_for_brand(brand, **pipeline_kwargs)
    logger.info(
        "YouTube comment sentiment sync complete for brand=%s comments_classified=%s comments_updated=%s",
        brand.get("name", ""),
        summary.get("comments_classified", 0),
        summary.get("comments_updated", 0),
    )
    return summary


def _run_telegram_phase2_pipeline(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.telegram import run_telegram_phase2_pipeline_for_brand

    summary = _run_async(run_telegram_phase2_pipeline_for_brand(brand, **pipeline_kwargs))
    logger.info(
        "Telegram phase-2 pipeline complete for brand=%s discovered=%s classified=%s monitored=%s ingested=%s",
        brand.get("name", ""),
        summary.get("discovered", 0),
        summary.get("channels_classified", 0),
        summary.get("channels_monitored", 0),
        summary.get("messages_ingested", 0),
    )
    return summary


def _run_telegram_channel_fulfilment(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.telegram import run_telegram_channel_fulfilment

    summary = run_telegram_channel_fulfilment(
        brand_id=brand.get("id"),
        **pipeline_kwargs,
    )
    logger.info(
        "Telegram fulfilment complete for brand=%s considered=%s classified=%s suspicious_fake=%s monitor=%s",
        brand.get("name", ""),
        summary.get("total_considered", 0),
        summary.get("classified", 0),
        summary.get("suspicious_fake", 0),
        summary.get("should_monitor_count", 0),
    )
    return summary


def _run_telegram_message_fetch_pipeline(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.telegram import run_telegram_message_fetch_pipeline_for_brand

    summary = _run_async(
        run_telegram_message_fetch_pipeline_for_brand(
            brand,
            **pipeline_kwargs,
        )
    )
    logger.info(
        "Telegram message fetch complete for brand=%s channels=%s historical=%s daily=%s messages=%s batches=%s failed=%s",
        brand.get("name", ""),
        summary.get("channels_considered", 0),
        summary.get("historical_channels", 0),
        summary.get("daily_channels", 0),
        summary.get("messages_upserted", 0),
        summary.get("batches_processed", 0),
        summary.get("failed", 0),
    )
    return summary


def _run_telegram_message_analysis(
    brand: dict,
    **pipeline_kwargs,
) -> dict:
    from scrapers.telegram import run_telegram_message_analysis_pipeline

    summary = run_telegram_message_analysis_pipeline(
        brand_id=brand.get("id"),
        **pipeline_kwargs,
    )
    logger.info(
        "Telegram message analysis complete for brand=%s mode=%s analyzed=%s safe=%s suspicious=%s copyright=%s",
        brand.get("name", ""),
        summary.get("mode"),
        summary.get("analyzed", 0),
        summary.get("safe", 0),
        summary.get("suspicious", 0),
        summary.get("copyright_infringement", 0),
    )
    return summary


def _queue_youtube_unofficial_pipeline_stub(brand: dict, **pipeline_kwargs) -> dict:
    """
    Backward-compatible alias for previous helper name.
    """
    return _run_youtube_unofficial_pipeline(brand, **pipeline_kwargs)


@app.task(bind=True, max_retries=3, default_retry_delay=60)
def scrape_platform(self, platform: str):
    """Scrape a specific platform for all monitored brands."""
    from search.engine import ensure_searchers_loaded, search_and_fulfill

    ensure_searchers_loaded([platform])
    brands = get_monitored_brands()
    for brand in brands:
        try:
            if platform == "youtube":
                sync_summary = _run_youtube_title_triage_sync_ingestion(
                    brand,
                    triage_batch_size=10,
                )
                logger.info(
                    "YouTube sync ingestion-only run complete for brand=%s: discovered=%s triaged=%s chunks=%s enrichment_triggered=%s",
                    brand.get("name", ""),
                    sync_summary.get("discovered", 0),
                    sync_summary.get("titles_triaged", 0),
                    sync_summary.get("triage_chunks_processed", 0),
                    sync_summary.get("enrichment_triggered", False),
                )
                # Layer-2 (transcript/comments) is intentionally manual/cron-invoked
                # via run_youtube_layer2_sync_fetch for now.
                continue
            if platform == "telegram":
                from config.settings import (
                    TELEGRAM_DISCOVERY_MAX_RESULTS_PER_KEYWORD,
                    TELEGRAM_MESSAGE_BACKFILL_LIMIT,
                    TELEGRAM_MESSAGE_INCREMENTAL_LIMIT,
                )

                telegram_summary = _run_telegram_phase2_pipeline(
                    brand,
                    keywords=brand.get("keywords") or [],
                    per_keyword_limit=TELEGRAM_DISCOVERY_MAX_RESULTS_PER_KEYWORD,
                    message_backfill_limit=TELEGRAM_MESSAGE_BACKFILL_LIMIT,
                    incremental_fetch_limit=TELEGRAM_MESSAGE_INCREMENTAL_LIMIT,
                    force_reclassify=False,
                )
                logger.info(
                    "Telegram phase-2 scrape complete for brand=%s discovered=%s classified=%s monitored=%s ingested=%s",
                    brand.get("name", ""),
                    telegram_summary.get("discovered", 0),
                    telegram_summary.get("channels_classified", 0),
                    telegram_summary.get("channels_monitored", 0),
                    telegram_summary.get("messages_ingested", 0),
                )
                continue

            params = {
                "keywords": brand.get("keywords", []),
                "hashtags": brand.get("hashtags", []),
                "platforms": [platform],
                "brand_id": brand["id"],
            }
            results = _run_async(search_and_fulfill(params))
            logger.info(
                "Scraped %s for brand %s: %d results passed fulfillment",
                platform, brand["name"], len(results),
            )
        except Exception as exc:
            logger.exception("Scrape failed: %s / %s", platform, brand["name"])
            raise self.retry(exc=exc)


def _safe_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _normalize_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        out: list[str] = []
        for item in value:
            text = str(item or "").strip()
            if text:
                out.append(text)
        return out
    text = str(value).strip()
    return [text] if text else []


def _get_target_brands(brand_id: str | None = None) -> list[dict]:
    brands = get_monitored_brands()
    if not brand_id:
        return brands
    return [b for b in brands if str(b.get("id")) == str(brand_id)]


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_youtube_title_triage_sync_ingestion(
    self,
    brand_id: str | None = None,
    triage_batch_size: int = 10,
    **pipeline_kwargs,
):
    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_youtube_title_triage_sync_ingestion(
                    brand,
                    triage_batch_size=triage_batch_size,
                    **pipeline_kwargs,
                )
            )
        except Exception as exc:
            logger.exception("YouTube sync title-triage ingestion failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_telegram_phase2_pipeline(
    self,
    brand_id: str | None = None,
    keywords: list[str] | str | None = None,
    per_keyword_limit: int | None = None,
    message_backfill_limit: int | None = None,
    incremental_fetch_limit: int | None = None,
    force_reclassify: bool = False,
    target_channels: list[str] | str | None = None,
):
    from config.settings import (
        TELEGRAM_DISCOVERY_MAX_RESULTS_PER_KEYWORD,
        TELEGRAM_MESSAGE_BACKFILL_LIMIT,
        TELEGRAM_MESSAGE_INCREMENTAL_LIMIT,
    )

    resolved_keywords = _normalize_list(keywords)
    resolved_targets = _normalize_list(target_channels)
    resolved_per_keyword_limit = (
        _safe_int(per_keyword_limit)
        or TELEGRAM_DISCOVERY_MAX_RESULTS_PER_KEYWORD
    )
    resolved_backfill_limit = (
        _safe_int(message_backfill_limit)
        or TELEGRAM_MESSAGE_BACKFILL_LIMIT
    )
    resolved_incremental_limit = (
        _safe_int(incremental_fetch_limit)
        or TELEGRAM_MESSAGE_INCREMENTAL_LIMIT
    )

    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_telegram_phase2_pipeline(
                    brand,
                    keywords=resolved_keywords or brand.get("keywords") or [],
                    per_keyword_limit=resolved_per_keyword_limit,
                    message_backfill_limit=resolved_backfill_limit,
                    incremental_fetch_limit=resolved_incremental_limit,
                    force_reclassify=bool(force_reclassify),
                    target_channels=resolved_targets,
                )
            )
        except Exception as exc:
            logger.exception("Telegram phase-2 pipeline failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_telegram_fulfilment(
    self,
    brand_id: str | None = None,
    limit: int = 200,
    only_unclassified: bool = True,
    discovered_since_hours: int | None = None,
    force_refulfilment: bool = False,
    target_channels: list[str] | str | None = None,
):
    resolved_targets = _normalize_list(target_channels)
    resolved_limit = max(1, _safe_int(limit) or 200)
    resolved_since_hours = _safe_int(discovered_since_hours) if discovered_since_hours is not None else None

    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_telegram_channel_fulfilment(
                    brand,
                    limit=resolved_limit,
                    only_unclassified=bool(only_unclassified),
                    discovered_since_hours=resolved_since_hours,
                    force_refulfilment=bool(force_refulfilment),
                    target_channels=resolved_targets,
                )
            )
        except Exception as exc:
            logger.exception("Telegram fulfilment failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_telegram_message_fetch_pipeline(
    self,
    brand_id: str | None = None,
    limit_channels: int = 500,
    batch_size: int | None = None,
    historical_months: int | None = None,
    daily_lookback_days: int | None = None,
    batch_sleep_min_seconds: int | None = None,
    batch_sleep_max_seconds: int | None = None,
    between_channels_sleep_seconds: int | None = None,
    target_channels: list[str] | str | None = None,
    max_media_bytes: int | None = None,
):
    from config.settings import (
        TELEGRAM_MESSAGE_FETCH_BATCH_SIZE,
        TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MAX_SECONDS,
        TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MIN_SECONDS,
        TELEGRAM_MESSAGE_FETCH_CHANNEL_SLEEP_SECONDS,
        TELEGRAM_MESSAGE_FETCH_DAILY_LOOKBACK_DAYS,
        TELEGRAM_MESSAGE_FETCH_HISTORICAL_MONTHS,
        TELEGRAM_MESSAGE_MEDIA_MAX_BYTES,
    )

    resolved_targets = _normalize_list(target_channels)
    resolved_limit_channels = max(1, _safe_int(limit_channels) or 500)
    resolved_batch_size = max(1, _safe_int(batch_size) or TELEGRAM_MESSAGE_FETCH_BATCH_SIZE)
    resolved_historical_months = max(
        1,
        _safe_int(historical_months) or TELEGRAM_MESSAGE_FETCH_HISTORICAL_MONTHS,
    )
    resolved_daily_lookback_days = max(
        1,
        _safe_int(daily_lookback_days) or TELEGRAM_MESSAGE_FETCH_DAILY_LOOKBACK_DAYS,
    )
    resolved_batch_sleep_min = max(
        0,
        _safe_int(batch_sleep_min_seconds) or TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MIN_SECONDS,
    )
    resolved_batch_sleep_max = max(
        resolved_batch_sleep_min,
        _safe_int(batch_sleep_max_seconds) or TELEGRAM_MESSAGE_FETCH_BATCH_SLEEP_MAX_SECONDS,
    )
    resolved_between_channels_sleep = max(
        0,
        _safe_int(between_channels_sleep_seconds) or TELEGRAM_MESSAGE_FETCH_CHANNEL_SLEEP_SECONDS,
    )
    resolved_max_media_bytes = max(
        1,
        _safe_int(max_media_bytes) or TELEGRAM_MESSAGE_MEDIA_MAX_BYTES,
    )

    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_telegram_message_fetch_pipeline(
                    brand,
                    limit_channels=resolved_limit_channels,
                    batch_size=resolved_batch_size,
                    historical_months=resolved_historical_months,
                    daily_lookback_days=resolved_daily_lookback_days,
                    batch_sleep_min_seconds=resolved_batch_sleep_min,
                    batch_sleep_max_seconds=resolved_batch_sleep_max,
                    between_channels_sleep_seconds=resolved_between_channels_sleep,
                    target_channels=resolved_targets,
                    max_media_bytes=resolved_max_media_bytes,
                )
            )
        except Exception as exc:
            logger.exception("Telegram message fetch failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_telegram_message_analysis(
    self,
    brand_id: str | None = None,
    mode: str = "daily",
    limit: int = 500,
    only_unanalyzed: bool = True,
    message_since_hours: int | None = None,
    force_reanalysis: bool = False,
    target_channels: list[str] | str | None = None,
    batch_size: int | None = None,
    limit_channels: int | None = None,
    max_messages_per_channel: int | None = None,
    persist_channel_rollup: bool = True,
):
    from config.settings import (
        TELEGRAM_MESSAGE_ANALYSIS_DAILY_BATCH_SIZE,
        TELEGRAM_MESSAGE_ANALYSIS_DAILY_LOOKBACK_HOURS,
        TELEGRAM_MESSAGE_ANALYSIS_HISTORICAL_BATCH_SIZE,
        TELEGRAM_MESSAGE_ANALYSIS_LIMIT_CHANNELS,
        TELEGRAM_MESSAGE_ANALYSIS_MAX_MESSAGES_PER_CHANNEL,
    )

    resolved_mode = str(mode or "daily").strip().lower()
    if resolved_mode not in {"historical", "daily"}:
        resolved_mode = "daily"

    resolved_targets = _normalize_list(target_channels)
    resolved_limit = max(1, _safe_int(limit) or 500)
    resolved_message_since_hours = (
        _safe_int(message_since_hours)
        if message_since_hours is not None
        else (
            TELEGRAM_MESSAGE_ANALYSIS_DAILY_LOOKBACK_HOURS
            if resolved_mode == "daily"
            else None
        )
    )
    resolved_batch_size = max(
        1,
        _safe_int(batch_size)
        or (
            TELEGRAM_MESSAGE_ANALYSIS_HISTORICAL_BATCH_SIZE
            if resolved_mode == "historical"
            else TELEGRAM_MESSAGE_ANALYSIS_DAILY_BATCH_SIZE
        ),
    )
    resolved_limit_channels = max(
        1,
        _safe_int(limit_channels) or TELEGRAM_MESSAGE_ANALYSIS_LIMIT_CHANNELS,
    )
    resolved_max_messages_per_channel = max(
        1,
        _safe_int(max_messages_per_channel) or TELEGRAM_MESSAGE_ANALYSIS_MAX_MESSAGES_PER_CHANNEL,
    )

    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_telegram_message_analysis(
                    brand,
                    mode=resolved_mode,
                    limit=resolved_limit,
                    only_unanalyzed=bool(only_unanalyzed),
                    message_since_hours=resolved_message_since_hours,
                    force_reanalysis=bool(force_reanalysis),
                    target_channels=resolved_targets,
                    batch_size=resolved_batch_size,
                    limit_channels=resolved_limit_channels,
                    max_messages_per_channel=resolved_max_messages_per_channel,
                    persist_channel_rollup=bool(persist_channel_rollup),
                )
            )
        except Exception as exc:
            logger.exception("Telegram message analysis failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_youtube_layer2_sync_fetch(
    self,
    brand_id: str | None = None,
    page_size: int = 50,
    page_offset: int = 0,
    scan_limit: int = 2000,
    comments_max_per_video_override: int | None = None,
    include_completed: bool = False,
    use_fallback_transcript: bool = True,
):
    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_youtube_layer2_sync_fetch(
                    brand,
                    page_size=page_size,
                    page_offset=page_offset,
                    scan_limit=scan_limit,
                    comments_max_per_video_override=comments_max_per_video_override,
                    include_completed=include_completed,
                    use_fallback_transcript=use_fallback_transcript,
                )
            )
        except Exception as exc:
            logger.exception("YouTube layer-2 sync fetch failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_youtube_transcript_sentiment_sync(
    self,
    brand_id: str | None = None,
    page_size: int = 100,
    page_offset: int = 0,
    scan_limit: int = 5000,
    force_reprocess: bool = False,
):
    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_youtube_transcript_sentiment_sync(
                    brand,
                    page_size=page_size,
                    page_offset=page_offset,
                    scan_limit=scan_limit,
                    force_reprocess=force_reprocess,
                )
            )
        except Exception as exc:
            logger.exception("YouTube transcript sentiment sync failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_youtube_comment_sentiment_sync(
    self,
    brand_id: str | None = None,
    video_page_size: int = 100,
    video_page_offset: int = 0,
    scan_limit: int = 5000,
    comment_batch_size: int = 20,
    max_comments_per_video: int = 2000,
    force_reprocess: bool = False,
):
    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(
                _run_youtube_comment_sentiment_sync(
                    brand,
                    video_page_size=video_page_size,
                    video_page_offset=video_page_offset,
                    scan_limit=scan_limit,
                    comment_batch_size=comment_batch_size,
                    max_comments_per_video=max_comments_per_video,
                    force_reprocess=force_reprocess,
                )
            )
        except Exception as exc:
            logger.exception("YouTube comment sentiment sync failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def submit_youtube_title_triage_batch(self, brand_id: str | None = None, **pipeline_kwargs):
    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(_submit_youtube_title_triage_batch(brand, **pipeline_kwargs))
        except Exception as exc:
            logger.exception("YouTube title-triage submit failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def poll_youtube_title_triage_batch(self, brand_id: str | None = None, **pipeline_kwargs):
    summaries: list[dict] = []
    for brand in _get_target_brands(brand_id):
        try:
            summaries.append(_poll_youtube_title_triage_batch(brand, **pipeline_kwargs))
        except Exception as exc:
            logger.exception("YouTube title-triage poll failed for %s", brand.get("name", ""))
            raise self.retry(exc=exc)
    return summaries


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def ingest_youtube_title_triage_results(
    self,
    brand_id: str,
    batch_meta: dict,
    target_custom_ids: list[str] | None = None,
    query_buckets_hint: dict | None = None,
):
    targets = _get_target_brands(brand_id)
    if not targets:
        return {"status": "skipped", "reason": "brand_not_monitored", "brand_id": brand_id}
    brand = targets[0]
    try:
        return _ingest_youtube_title_triage_results(
            brand=brand,
            batch_meta=batch_meta,
            target_custom_ids=target_custom_ids or [],
            query_buckets_hint=query_buckets_hint or {},
        )
    except Exception as exc:
        logger.exception("YouTube title-triage ingest failed for %s", brand.get("name", ""))
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=2, default_retry_delay=60)
def enrich_flagged_youtube_mentions(self, brand_id: str, flagged_video_ids: list[str]):
    targets = _get_target_brands(brand_id)
    if not targets:
        return {"status": "skipped", "reason": "brand_not_monitored", "brand_id": brand_id}
    brand = targets[0]
    try:
        return _enrich_flagged_youtube_mentions(brand, flagged_video_ids or [])
    except Exception as exc:
        logger.exception("YouTube flagged enrichment failed for %s", brand.get("name", ""))
        raise self.retry(exc=exc)


@app.task(bind=True, max_retries=2)
def run_full_analysis(self):
    """Run the full 3-tier analysis pipeline for all monitored brands."""
    from analysis.pipeline import run_analysis
    from severity.index import score_mentions
    from datetime import datetime, timedelta

    brands = get_monitored_brands()
    since = datetime.utcnow() - timedelta(days=1)

    for brand in brands:
        try:
            mentions = db.get_mentions(brand["id"], since=since)
            if not mentions:
                continue

            # Run analysis
            report = _run_async(run_analysis(
                brand["id"], brand["name"], mentions
            ))

            # Score severity
            score_mentions(mentions, brand)

            logger.info(
                "Analysis complete for %s: %d mentions, %d clusters",
                brand["name"],
                report.get("mention_count", 0),
                report.get("cluster_count", 0),
            )
        except Exception as exc:
            logger.exception("Analysis failed for %s", brand["name"])
            raise self.retry(exc=exc)


@app.task
def check_alerts():
    """Check all brands for crisis alerts."""
    from alerts.router import route_alerts

    brands = get_monitored_brands()
    for brand in brands:
        try:
            result = _run_async(route_alerts(brand["id"], brand["name"]))
            if result.get("alerted"):
                logger.warning("Alert sent for %s: %s", brand["name"], result)
        except Exception:
            logger.exception("Alert check failed for %s", brand["name"])


@app.task
def send_weekly_report():
    """Send weekly email summary for all brands."""
    from alerts.email_report import send_email_report
    from brand.health import compute_health_score
    from severity.index import aggregate_severity

    brands = get_monitored_brands()
    for brand in brands:
        try:
            health = compute_health_score(brand["id"])
            severity = aggregate_severity(brand["id"])
            latest = db.get_latest_analysis(brand["id"])

            report = {
                "health": health,
                "severity_summary": severity,
                "themes": latest.get("themes", []) if latest else [],
                "risks": latest.get("risks", []) if latest else [],
            }
            send_email_report(brand["name"], report)
        except Exception:
            logger.exception("Weekly report failed for %s", brand["name"])


@app.task(bind=True, max_retries=2, default_retry_delay=60, name="workers.tasks.process_shield_crawl_queue")
def process_shield_crawl_queue(self, max_jobs: int = 5):
    """Drain a bounded number of persisted Shield jobs; each claim is idempotent."""
    from shield.worker import process_next_job

    output = []
    for _ in range(max(1, min(max_jobs, 20))):
        result = _run_async(process_next_job())
        output.append(result)
        if result.get("status") in {"idle", "contended"}:
            break
    return output


@app.task(bind=True, max_retries=2, default_retry_delay=300, name="workers.tasks.run_gati_scheduled_discovery")
def run_gati_scheduled_discovery(self, max_results: int = 50):
    """Trigger the private, idempotent Gati discovery workflow."""
    base_url = os.getenv("OVAL_INTERNAL_URL", "http://127.0.0.1:3001").rstrip("/")
    token = os.getenv("SHIELD_TRIGGER_TOKEN", "")
    if not token:
        raise RuntimeError("SHIELD_TRIGGER_TOKEN is required for Gati scheduling")
    try:
        response = httpx.post(
            f"{base_url}/api/shield/gati/scheduled",
            headers={"x-shield-trigger-token": token},
            json={
                "threatType": "all",
                "dateScope": "30d",
                "maxResults": max(1, min(int(max_results), 100)),
                "sources": ["exa", "certificate_transparency", "oval_social"],
            },
            timeout=300,
        )
        response.raise_for_status()
        return response.json()
    except Exception as exc:
        logger.exception("Gati scheduled discovery failed")
        raise self.retry(exc=exc)
