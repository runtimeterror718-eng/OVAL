"""
Seed existing local Play Store review history into Supabase.

Requires:
    - oval/.env.local with NEXT_PUBLIC_SUPABASE_URL
    - SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY for RLS-safe upsert

Usage:
    python3 scripts/seed_playstore_reviews_to_supabase.py
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

REPO_ROOT = Path(__file__).resolve().parent.parent
LIVE_PATH = REPO_ROOT / "oval" / "src" / "data" / "playstore-live-reviews.json"
PACKAGE = "xyz.penpencil.physicswala"

load_dotenv(REPO_ROOT / "oval" / ".env.local")
load_dotenv(REPO_ROOT / ".env")

SUPABASE_TABLE = os.getenv("PLAYSTORE_REVIEWS_TABLE", "playstore_reviews")
BATCH_SIZE = 500


def _supabase_client():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def _load_reviews() -> list[dict]:
    payload = json.loads(LIVE_PATH.read_text())
    return list((payload.get("reviews") or {}).values())


def _row(review: dict) -> dict:
    return {
        "package_name": PACKAGE,
        "review_id": review.get("reviewId"),
        "author": review.get("author"),
        "rating": review.get("rating"),
        "review_text": review.get("text"),
        "language": review.get("language"),
        "device": review.get("device"),
        "android_os_version": review.get("androidOsVersion"),
        "app_version": review.get("version"),
        "thumbs_up_count": review.get("thumbsUpCount") or 0,
        "posted_at": review.get("date"),
        "replied": bool(review.get("replied")),
        "reply_text": review.get("replyText"),
        "reply_posted_at": review.get("replyDate"),
        "source": "local-history-import",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_data": review,
    }


def main() -> None:
    client = _supabase_client()
    rows = [_row(review) for review in _load_reviews() if review.get("reviewId")]
    if not rows:
        raise SystemExit("No local Play Store reviews found to seed.")

    upserted = 0
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        client.table(SUPABASE_TABLE).upsert(batch, on_conflict="review_id").execute()
        upserted += len(batch)
        print(f"[seed] upserted {upserted}/{len(rows)}")

    print(f"[seed] done table={SUPABASE_TABLE} rows={upserted}")


if __name__ == "__main__":
    main()
