"""
Fetch comments for stored r/PhysicsWallah posts via REDD, and write them to
Supabase (reddit_comments). RUN THIS FROM YOUR OWN LAPTOP on home wifi — Reddit
403-blocks datacenter/sandbox IPs, but a residential IP works fine.

Setup (once):
    cd "/Users/abhishektakkhi/OVAL 2.0"
    python3.11 -m pip install redd
Run:
    python3.11 scripts/fetch_reddit_comments_local.py
    # optional: --days 60  --sentiment   (--sentiment classifies each comment via OpenAI)
"""
from __future__ import annotations

import argparse
import sys
import time
import random
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

from config.supabase_client import get_service_client

BRAND_NAME = "PhysicsWallah"
SUBREDDIT = "PhysicsWallah"


def _permalink(url: str) -> str:
    """Reduce a full post URL to the /r/.../comments/... path REDD expects."""
    u = (url or "").strip()
    if "reddit.com" in u:
        u = "/" + u.split("reddit.com/", 1)[1]
    return u.rstrip("/") + "/"


def _flatten(comments, post_id, depth=0, parent_id="", out=None):
    """Depth-first flatten of REDD's nested comment tree into DB rows."""
    if out is None:
        out = []
    for c in comments or []:
        body = (getattr(c, "body", "") or "").strip()
        if body and body not in ("[deleted]", "[removed]"):
            out.append({
                "post_id": post_id,
                "comment_body": body[:2000],
                "comment_author": (getattr(c, "author", "") or "[deleted]"),
                "comment_score": int(getattr(c, "score", 0) or 0),
                "comment_parent_id": parent_id,
                "comment_depth": depth,
                "created_at": None,
                "comment_sentiment_label": "neutral",
            })
        _flatten(getattr(c, "replies", None), post_id, depth + 1, parent_id, out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--sentiment", action="store_true", help="classify each comment via OpenAI")
    args = ap.parse_args()

    from redd import Redd

    sb = get_service_client()
    ids = [b["id"] for b in sb.table("brands").select("id").eq("name", BRAND_NAME).execute().data]
    since = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()
    posts = (
        sb.table("reddit_posts").select("post_id,post_url,post_title")
        .in_("brand_id", ids).eq("subreddit_name", SUBREDDIT).gte("created_at", since).execute().data
    )
    print(f"posts to fetch comments for: {len(posts)} (last {args.days} days)")

    r = Redd(throttle=(1.5, 3.0))
    total_stored = 0
    for i, p in enumerate(posts, 1):
        link = _permalink(p.get("post_url", ""))
        if "/comments/" not in link:
            continue
        try:
            detail = r.get_post(link)
            rows = _flatten(getattr(detail, "comments", []), p["post_id"])
            if args.sentiment and rows:
                _classify(rows)
            if rows:
                # replace any prior comments for this post, then insert fresh
                sb.table("reddit_comments").delete().eq("post_id", p["post_id"]).execute()
                # insert in chunks of 200
                for j in range(0, len(rows), 200):
                    sb.table("reddit_comments").insert(rows[j:j + 200]).execute()
                total_stored += len(rows)
            print(f"  [{i}/{len(posts)}] {p['post_title'][:40]!r}: {len(rows)} comments")
        except Exception as e:
            print(f"  [{i}/{len(posts)}] FAILED {link}: {str(e)[:80]}")
        time.sleep(random.uniform(1.5, 3.0))

    print(f"\nDONE — stored {total_stored} comments across {len(posts)} posts")


def _classify(rows):
    """Optional: label each comment positive/negative/neutral via OpenAI (Hinglish-aware)."""
    import os, json
    from openai import OpenAI
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return
    client = OpenAI(api_key=key)
    items = [f"[{i}] {r['comment_body'][:200]}" for i, r in enumerate(rows)]
    try:
        resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"), temperature=0.1, max_tokens=800,
            messages=[
                {"role": "system", "content": "Classify each Reddit comment's sentiment toward Physics Wallah. Understand Hinglish/Indian slang/sarcasm. Return ONLY index:label per line. Labels: positive, negative, neutral."},
                {"role": "user", "content": "\n".join(items)},
            ],
        )
        for line in (resp.choices[0].message.content or "").splitlines():
            if ":" not in line:
                continue
            idx, _, lab = line.partition(":")
            try:
                i = int(idx.strip()); lab = lab.strip().lower().rstrip(".")
                if lab in ("positive", "negative", "neutral") and 0 <= i < len(rows):
                    rows[i]["comment_sentiment_label"] = lab
            except ValueError:
                pass
    except Exception:
        pass


if __name__ == "__main__":
    main()
