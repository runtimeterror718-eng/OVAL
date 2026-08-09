"""
Ingest r/PhysicsWallah posts fetched via the Devvit app (reddit.getNewPosts,
official API — no 403) into OVAL's Supabase (reddit_posts + mentions), under the
canonical PhysicsWallah brand the dashboard reads.

The Devvit endpoint (/api/physics-wallah-posts) returns:
  { subreddit, fetched, withinLast60Days, posts: [
      { id, title, body, author, subreddit, permalink, url, score, comments,
        createdAt, flair, nsfw, spoiler, stickied } ] }

Usage:
    python3.11 scripts/ingest_devvit_reddit.py ~/pw_devvit_posts.json
    python3.11 scripts/ingest_devvit_reddit.py ~/pw_devvit_posts.json --triage   # + LLM sentiment
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

from config.supabase_client import get_service_client
from storage.queries import upsert_mention_by_platform_ref

BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"  # canonical PhysicsWallah (dashboard brand)


def _load(path: str) -> list[dict]:
    data = json.load(open(path))
    posts = data.get("posts", data) if isinstance(data, dict) else data
    if not isinstance(posts, list):
        raise SystemExit("Could not find a posts array in the file.")
    return posts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file", help="path to the Devvit JSON export")
    ap.add_argument("--triage", action="store_true", help="LLM-classify each post's sentiment")
    args = ap.parse_args()

    posts = _load(args.file)
    print(f"loaded {len(posts)} posts from {args.file}")
    sb = get_service_client()

    triage_fn = None
    if args.triage:
        from scrapers.reddit import triage_reddit_post
        triage_fn = triage_reddit_post

    post_rows, mention_rows = [], []
    now = datetime.now(timezone.utc).isoformat()
    for p in posts:
        pid = str(p.get("id") or "").replace("t3_", "")
        if not pid:
            continue
        title = (p.get("title") or "").strip()
        body = (p.get("body") or "").strip()
        url = p.get("url") or (f"https://www.reddit.com{p.get('permalink','')}" if p.get("permalink") else "")
        created = p.get("createdAt")

        supplied_label = str(p.get("sentiment") or "").strip().lower()
        label = supplied_label if supplied_label in {"positive", "negative", "neutral"} else "neutral"
        if triage_fn:
            try:
                label = triage_fn(title, body, "PhysicsWallah", p.get("score", 0)).get("label", "neutral")
            except Exception:
                pass

        post_rows.append({
            "brand_id": BRAND_ID,
            "post_id": pid,
            "post_title": title,
            "post_body": body,
            "author_username": p.get("author") or "[deleted]",
            "subreddit_name": p.get("subreddit") or "PhysicsWallah",
            "score": int(p.get("score", 0) or 0),
            "num_comments": int(p.get("comments", 0) or 0),
            "created_at": created,
            "post_url": url,
            "post_flair": p.get("flair"),
            "is_self_post": bool(body),
            "post_triage_label": label,
            "raw_data": p,
        })
        mention_rows.append({
            "brand_id": BRAND_ID,
            "platform": "reddit",
            "platform_ref_id": pid,
            "content_text": f"{title}\n{body}".strip(),
            "content_type": "post",
            "author_handle": p.get("author") or "[deleted]",
            "author_name": p.get("author") or "[deleted]",
            "engagement_score": int(p.get("score", 0) or 0),
            "likes": int(p.get("score", 0) or 0),
            "comments_count": int(p.get("comments", 0) or 0),
            "sentiment_label": label,
            "language": "en",
            "source_url": url,
            "published_at": created,
            "raw_data": p,
        })

    # Upsert posts (idempotent on post_id UNIQUE), then mentions via the
    # codebase helper (check-then-insert on brand+platform+platform_ref_id).
    up = mp = 0
    for i in range(0, len(post_rows), 200):
        sb.table("reddit_posts").upsert(post_rows[i:i + 200], on_conflict="post_id").execute()
        up += len(post_rows[i:i + 200])
    for m in mention_rows:
        try:
            upsert_mention_by_platform_ref(m)
            mp += 1
        except Exception as e:
            print("  mention skip:", str(e)[:80])

    print(f"\nDONE — upserted {up} reddit_posts + {mp} mentions under {BRAND_ID[:8]}")
    print("Refresh http://localhost:3000/reddit")


if __name__ == "__main__":
    main()
