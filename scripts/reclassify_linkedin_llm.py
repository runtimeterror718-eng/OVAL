"""
Reclassify stored LinkedIn posts about PW with the Anthropic API.

Keyword/verdict heuristics misfile corporate news and hiring posts as
negative. This runs every stored linkedin_posts row for the dashboard brand
through Claude with a strict rubric — negative means the AUTHOR is
badmouthing PW (complaint, attack, warning, bad personal experience);
news, acquisitions, financials, hiring and promotion are neutral — then
syncs linkedin_posts.raw_data.sentiment and mentions.sentiment_label.

Usage:
    python3.11 scripts/reclassify_linkedin_llm.py [--dry-run]
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

import anthropic

from config.supabase_client import get_service_client

BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
BATCH = 8

RUBRIC = """You classify LinkedIn posts about Physics Wallah (PW), an Indian edtech company, for a brand-monitoring dashboard.

For each post decide the author's stance toward Physics Wallah:
- "negative": the author is badmouthing PW — complaining about PW's courses, centers, teachers, refunds, support, work culture, salaries; accusing PW of scam/fraud/misleading; warning others away; describing a bad personal experience (their own or their child's).
- "positive": the author praises PW, celebrates its success, thanks PW, or shares a proud milestone at/with PW.
- "neutral": everything else — business news, acquisitions, IPO/financial reporting, hiring/job announcements, promotions, general commentary, posts where PW is only mentioned in passing.

Reply with ONLY a JSON array, one object per post, in the same order: [{"i": <index>, "sentiment": "negative|neutral|positive"}]"""


def classify_batch(client: anthropic.Anthropic, posts: list[str]) -> list[str]:
    lines = [f"--- POST {i} ---\n{p[:1800]}" for i, p in enumerate(posts)]
    msg = client.messages.create(
        model=MODEL,
        max_tokens=500,
        system=RUBRIC,
        messages=[{"role": "user", "content": "\n\n".join(lines)}],
    )
    raw = msg.content[0].text.strip()
    raw = raw[raw.find("[") : raw.rfind("]") + 1]
    out = {d["i"]: d["sentiment"] for d in json.loads(raw)}
    return [out.get(i, "neutral") for i in range(len(posts))]


def main():
    dry = "--dry-run" in sys.argv
    sb = get_service_client()
    client = anthropic.Anthropic()

    rows = (
        sb.table("linkedin_posts")
        .select("id, post_text, post_url, raw_data")
        .eq("brand_id", BRAND_ID)
        .limit(2000)
        .execute()
        .data
    )
    # classify each unique post once; apply to every duplicate row
    by_url: dict[str, list[dict]] = {}
    for r in rows:
        url = (r.get("post_url") or "").split("?")[0] or r["id"]
        by_url.setdefault(url, []).append(r)
    urls = list(by_url.keys())
    print(f"{len(rows)} rows, {len(urls)} unique posts — model {MODEL}")

    changed_posts = changed_mentions = 0
    for start in range(0, len(urls), BATCH):
        chunk = urls[start : start + BATCH]
        texts = [(by_url[u][0].get("post_text") or "") for u in chunk]
        labels = classify_batch(client, texts)
        for url, label in zip(chunk, labels):
            for r in by_url[url]:
                rd = r.get("raw_data") or {}
                old = rd.get("sentiment")
                if old == label:
                    continue
                print(f"  {old or '?'} -> {label}: {(r.get('post_text') or '')[:70]!r}")
                if not dry:
                    rd["sentiment"] = label
                    sb.table("linkedin_posts").update({"raw_data": rd}).eq("id", r["id"]).execute()
                changed_posts += 1
            pid = hashlib.sha1(url.encode()).hexdigest()[:24]
            if not dry:
                res = (
                    sb.table("mentions")
                    .update({"sentiment_label": label})
                    .eq("brand_id", BRAND_ID)
                    .eq("platform", "linkedin")
                    .eq("platform_ref_id", pid)
                    .neq("sentiment_label", label)
                    .execute()
                )
                changed_mentions += len(res.data or [])
        print(f"  ...{min(start + BATCH, len(urls))}/{len(urls)} classified")

    print(f"\nDONE — updated {changed_posts} linkedin_posts rows, {changed_mentions} mentions{' (dry-run, nothing written)' if dry else ''}")


if __name__ == "__main__":
    main()
