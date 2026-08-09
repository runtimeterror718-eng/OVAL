"""
30-day backfill for Reddit, Instagram, and Google/SEO News.

Each platform now honors an explicit [after_date, before_date] window
(wired into scrapers/reddit.py, scrapers/instagram.py, scrapers/seo_news.py).

  - Reddit & Instagram run their full run_pipeline (LLM triage, comments,
    platform tables + mentions).
  - SEO/News runs through search.engine.search_and_fulfill, which persists
    mentions + fulfillment results.

Usage:
    python scripts/backfill_30d.py                      # all three, 30 days
    python scripts/backfill_30d.py --days 14            # custom window
    python scripts/backfill_30d.py --platforms reddit   # subset
    python scripts/backfill_30d.py --brand-id <uuid>    # reuse a brand
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_ROOT, ".env"), override=True)
load_dotenv(os.path.join(_ROOT, "secrets", ".env.keys"), override=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("backfill_30d")

from scrapers.reddit import RedditScraper, PW_SEARCH_QUERIES  # noqa: E402
from scrapers.instagram import InstagramScraper  # noqa: E402
from search.engine import search_and_fulfill  # noqa: E402
from storage import queries as db  # noqa: E402

BRAND_NAME = "PhysicsWallah"
PW_KEYWORDS = ["physicswallah", "physics wallah", "alakh pandey", "pw live"]


def _ensure_brand(brand_id: str | None) -> str:
    if brand_id:
        return brand_id
    brand = db.upsert_brand({
        "name": BRAND_NAME,
        "keywords": PW_KEYWORDS,
        "platforms": ["reddit", "instagram", "seo_news"],
    })
    logger.info("Using brand '%s' -> %s", BRAND_NAME, brand["id"])
    return brand["id"]


async def _backfill_reddit(brand_id, after, before) -> dict:
    logger.info("=== Reddit backfill (%s → %s) ===", after.date(), before.date())
    scraper = RedditScraper()
    return await scraper.run_pipeline(
        brand_id=brand_id,
        keywords=PW_SEARCH_QUERIES,
        hashtags=[],
        max_posts=200,
        max_comments=100,
        after_date=after,
        before_date=before,
    )


async def _backfill_instagram(brand_id, after, before) -> dict:
    logger.info("=== Instagram backfill (%s → %s) ===", after.date(), before.date())
    scraper = InstagramScraper()
    try:
        return await scraper.run_pipeline(
            brand_id=brand_id,
            keywords=PW_KEYWORDS,
            hashtags=["physicswallah"],
            max_posts_per_account=60,  # deeper than the 30 default to reach 30d back
            max_comments_per_post=30,
            after_date=after,
            before_date=before,
        )
    finally:
        await scraper.close()


async def _backfill_seo(brand_id, after, before) -> dict:
    logger.info("=== Google/SEO News backfill (%s → %s) ===", after.date(), before.date())
    fulfilled = await search_and_fulfill({
        "keywords": PW_KEYWORDS,
        "platforms": ["seo_news"],
        "brand_id": brand_id,
        "after_date": after.isoformat(),
        "before_date": before.isoformat(),
        "max_results_per_platform": 100,
    })
    return {"fulfilled": len(fulfilled or [])}


async def _main():
    parser = argparse.ArgumentParser(description="30-day backfill for reddit/instagram/seo")
    parser.add_argument("--days", type=int, default=30, help="Lookback window in days")
    parser.add_argument("--brand-id", help="Existing brand UUID (otherwise upserts one)")
    parser.add_argument(
        "--platforms",
        default="reddit,instagram,seo_news",
        help="Comma-separated subset of: reddit,instagram,seo_news",
    )
    args = parser.parse_args()

    platforms = {p.strip() for p in args.platforms.split(",") if p.strip()}
    before = datetime.now(timezone.utc)
    after = before - timedelta(days=args.days)
    brand_id = _ensure_brand(args.brand_id)

    summary: dict[str, object] = {}

    # Sequential (each is rate-limited / proxy-bound independently).
    if "reddit" in platforms:
        try:
            summary["reddit"] = await _backfill_reddit(brand_id, after, before)
        except Exception as e:
            logger.exception("Reddit backfill failed")
            summary["reddit"] = {"error": str(e)}

    if "instagram" in platforms:
        try:
            summary["instagram"] = await _backfill_instagram(brand_id, after, before)
        except Exception as e:
            logger.exception("Instagram backfill failed")
            summary["instagram"] = {"error": str(e)}

    if "seo_news" in platforms:
        try:
            summary["seo_news"] = await _backfill_seo(brand_id, after, before)
        except Exception as e:
            logger.exception("SEO backfill failed")
            summary["seo_news"] = {"error": str(e)}

    print("\n" + "=" * 60)
    print(f"  BACKFILL COMPLETE — last {args.days} days (brand {brand_id})")
    print("=" * 60)
    for plat, res in summary.items():
        print(f"  {plat:12s}: {res}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(_main())
