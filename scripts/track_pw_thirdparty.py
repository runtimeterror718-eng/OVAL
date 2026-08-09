"""
Track third-party "what people say about PW" via the two routes that reliably
work: Google News RSS (press/media) + Instagram ecosystem & ex-PW accounts
(edtech media pages + ex-PW teachers). Stores to mentions under the dashboard
brand so it surfaces on the dashboard and Action Items.

Usage:
    python3.11 scripts/track_pw_thirdparty.py --days 30
    python3.11 scripts/track_pw_thirdparty.py --days 30 --only news
    python3.11 scripts/track_pw_thirdparty.py --days 30 --only instagram
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"  # canonical PhysicsWallah (dashboard brand)

# Third-party press/search queries — what OUTSIDE voices say about PW.
NEWS_QUERIES = [
    "Physics Wallah",
    "PhysicsWallah",
    "PW Skills",
    "Alakh Pandey",
    "Physics Wallah IPO OR valuation OR results",
    "Physics Wallah layoffs OR controversy OR complaint",
]


async def run_news(days: int) -> dict:
    """Google News RSS → mentions + fulfillment, via search_and_fulfill."""
    from search.engine import search_and_fulfill
    now = datetime.now(timezone.utc)
    print(f"[news] Google News RSS — last {days} days")
    fulfilled = await search_and_fulfill({
        "keywords": NEWS_QUERIES,
        "platforms": ["seo_news"],
        "brand_id": BRAND_ID,
        "after_date": (now - timedelta(days=days)).isoformat(),
        "before_date": now.isoformat(),
        "max_results_per_platform": 120,
    })
    n = len(fulfilled or [])
    print(f"[news] fulfilled/persisted: {n}")
    return {"news_articles": n}


async def run_instagram(days: int) -> dict:
    """Instagram ecosystem + ex-PW accounts → the third-party PW-talkers."""
    from scrapers.instagram import (
        InstagramScraper, ECOSYSTEM_ACCOUNTS, EX_PW_ACCOUNTS, COMPETITOR_ACCOUNTS,
    )
    accounts = list(dict.fromkeys(ECOSYSTEM_ACCOUNTS + EX_PW_ACCOUNTS + COMPETITOR_ACCOUNTS))
    now = datetime.now(timezone.utc)
    print(f"[instagram] {len(accounts)} third-party accounts — last {days} days")
    scraper = InstagramScraper()
    try:
        result = await scraper.run_pipeline(
            brand_id=BRAND_ID,
            keywords=["physics wallah", "physicswallah", "pw", "alakh pandey"],
            hashtags=["physicswallah"],
            accounts=accounts,
            max_posts_per_account=40,
            max_comments_per_post=20,
            after_date=now - timedelta(days=days),
            before_date=now,
        )
    finally:
        try:
            await scraper.close()
        except Exception:
            pass
    print(f"[instagram] posts stored: {result.get('posts_stored', 0)}, comments: {result.get('comments_stored', 0)}")
    return {"instagram": {k: result.get(k) for k in ("posts_found", "posts_stored", "comments_stored", "pr_risks_flagged")}}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--only", choices=["news", "instagram"], help="run just one source")
    args = ap.parse_args()

    summary = {}
    if args.only in (None, "news"):
        try:
            summary.update(await run_news(args.days))
        except Exception as e:
            print(f"[news] failed: {e}")
            summary["news_error"] = str(e)[:120]
    if args.only in (None, "instagram"):
        try:
            summary.update(await run_instagram(args.days))
        except Exception as e:
            print(f"[instagram] failed: {e}")
            summary["instagram_error"] = str(e)[:120]

    print("\n" + "=" * 56)
    print(f"  THIRD-PARTY PW TRACKING COMPLETE — last {args.days} days")
    print("=" * 56)
    for k, v in summary.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())
