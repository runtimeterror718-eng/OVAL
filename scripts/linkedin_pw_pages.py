"""
LinkedIn PW own-pages monitor.

Scrapes Physics Wallah's OWN public LinkedIn company pages via the bare
in.linkedin.com/company/<slug>/ URL (the only route that reliably renders post
text to logged-out clients — /posts/ and third-party pages serve empty JS shells),
parses recent posts, and stores them to linkedin_posts + mentions under the
dashboard brand.

Usage:
    python3.11 scripts/linkedin_pw_pages.py
    python3.11 scripts/linkedin_pw_pages.py --days 60 --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
import random
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

import requests
from scrapers.linkedin import (
    parse_public_linkedin_activity_html,
    _parse_dt,
    _stable_id,
    PW_TERMS_RE,
    PUBLIC_HEADERS,
)
from config.supabase_client import get_service_client
from storage.queries import upsert_mention_by_platform_ref

BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"  # canonical PhysicsWallah (dashboard brand)

# PW's own pages — bare /company/<slug>/ URL is the working route.
# (Slugs verified live: these render post text to logged-out clients; other PW
# sub-entity slugs 404 or serve empty JS shells.)
PW_PAGES = [
    ("physicswallah", "https://in.linkedin.com/company/physicswallah/"),
    ("pw-skills-official", "https://in.linkedin.com/company/pw-skills-official/"),
]


def scrape_page(slug: str, url: str, after_ts: float, limit: int = 25) -> list[dict]:
    try:
        r = requests.get(url, headers=PUBLIC_HEADERS, timeout=20)
    except Exception as e:
        print(f"  {slug}: fetch error {str(e)[:50]}")
        return []
    if r.status_code != 200:
        print(f"  {slug}: HTTP {r.status_code}")
        return []
    posts = parse_public_linkedin_activity_html(r.text, url, limit=limit)
    kept = []
    for p in posts:
        # window filter (published_at may be relative like "2w" -> already ISO via parser)
        pub = p.get("published_at")
        if pub:
            try:
                ts = datetime.fromisoformat(str(pub).replace("Z", "+00:00")).timestamp()
                if ts < after_ts:
                    continue
            except ValueError:
                pass
        p["_page_slug"] = slug
        kept.append(p)
    print(f"  {slug}: {len(posts)} parsed, {len(kept)} in window")
    return kept


def to_rows(post: dict) -> tuple[dict, dict]:
    slug = post.get("_page_slug", "")
    text = (post.get("content_text") or "").strip()
    pid = post.get("post_id") or _stable_id(post.get("source_url"), text)
    url = post.get("source_url") or ""
    pub = post.get("published_at")
    post_row = {
        "brand_id": BRAND_ID,
        "post_text": text,
        "author_name": post.get("author_name") or slug,
        "author_headline": post.get("author_headline") or "",
        "reactions_count": post.get("likes", 0) or 0,
        "comments_count": post.get("comments_count", 0) or 0,
        "shares_count": post.get("shares", 0) or 0,
        "published_date": pub,
        "post_url": url,
        "raw_data": {**(post.get("raw_data") or {}), "page": slug, "platform_ref_id": pid},
    }
    mention_row = {
        "brand_id": BRAND_ID,
        "platform": "linkedin",
        "platform_ref_id": pid,
        "content_text": text,
        "content_type": "linkedin_post",
        "author_handle": post.get("author_name") or slug,
        "author_name": post.get("author_name") or slug,
        "engagement_score": (post.get("likes", 0) or 0) + (post.get("comments_count", 0) or 0),
        "likes": post.get("likes", 0) or 0,
        "comments_count": post.get("comments_count", 0) or 0,
        "language": "en",
        "source_url": url,
        "published_at": pub,
        "raw_data": {"page": slug, "source": "linkedin_public_html"},
    }
    return post_row, mention_row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    after_ts = (datetime.now(timezone.utc) - timedelta(days=args.days)).timestamp()
    print(f"LinkedIn PW own-pages monitor — window {args.days}d")

    all_posts = []
    for slug, url in PW_PAGES:
        all_posts.extend(scrape_page(slug, url, after_ts))
        time.sleep(random.uniform(2.5, 4.5))  # polite throttle between pages

    # dedup by post_id / url
    seen, unique = set(), []
    for p in all_posts:
        key = p.get("post_id") or p.get("source_url")
        if key and key not in seen:
            seen.add(key)
            unique.append(p)

    print(f"\nTotal unique in-window posts: {len(unique)}")
    if args.dry_run:
        for p in unique[:12]:
            print(f"  [{p.get('_page_slug')}] {(p.get('content_text') or '')[:90]}")
        return

    if not unique:
        print("Nothing to store.")
        return

    sb = get_service_client()
    stored = 0
    for p in unique:
        post_row, mention_row = to_rows(p)
        try:
            sb.table("linkedin_posts").insert(post_row).execute()
        except Exception as e:
            print(f"  post store note: {str(e)[:60]}")
        try:
            upsert_mention_by_platform_ref(mention_row)
            stored += 1
        except Exception as e:
            print(f"  mention store note: {str(e)[:60]}")

    print(f"\nDONE — stored {stored} LinkedIn posts under {BRAND_ID[:8]}")


if __name__ == "__main__":
    main()
