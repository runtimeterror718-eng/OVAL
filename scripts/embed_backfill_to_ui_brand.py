"""
Embed the 30-day backfill into mention_embeddings under the UI's brand.

The dashboard's Action Items page does RAG over `mention_embeddings` filtered by
the brand `getBrandId()` resolves to — the FIRST brand named exactly
"PhysicsWallah" (166d8523…). The 30-day backfill landed under a different brand
(97292c5e = "PW Live Smoke") and was never embedded, so the page generated tasks
from stale vectors.

This script pulls the backfilled rows from the SOURCE brand's platform/mentions
tables, re-tags each embedding with the UI (TARGET) brand, embeds + classifies,
and upserts into mention_embeddings. Platform tables are left untouched.

Usage:
    python scripts/embed_backfill_to_ui_brand.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Reuse the embed/classify/store machinery from the main backfill script.
from scripts.backfill_automate import (  # noqa: E402
    sb,
    pull_reddit,
    pull_instagram,
    pull_youtube,
    get_existing_texts,
    process_and_store,
)

# Source = where the backfill landed; Target = what the UI reads.
SOURCE_BRAND_ID = "97292c5e-f230-4732-8518-e159349eca07"  # "PW Live Smoke"
TARGET_BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"  # UI "PhysicsWallah"


def pull_seo_from_mentions(source_brand_ids: list, existing: set) -> list[dict]:
    """SEO/news has no platform table — pull it from the unified mentions table."""
    print("  Pulling SEO/news from mentions...")
    rows = []
    resp = (
        sb.table("mentions")
        .select("id, content_text, source_url, author_handle, platform, brand_id")
        .in_("brand_id", source_brand_ids)
        .eq("platform", "seo_news")
        .execute()
    )
    for r in (resp.data or []):
        text = (r.get("content_text") or "").strip()
        if not text or len(text) < 10 or text[:100] in existing:
            continue
        rows.append({
            "brand_id": r["brand_id"], "platform": "seo_news", "content_type": "article",
            "content_text": text[:2000], "platform_ref_id": str(r.get("id", "")),
            "source_url": r.get("source_url"), "author_handle": r.get("author_handle"),
        })
    print(f"    Found {len(rows)} missing SEO rows")
    return rows


def main():
    print("=" * 60)
    print("  Embed 30-day backfill → UI brand")
    print(f"  source: {SOURCE_BRAND_ID[:8]} (PW Live Smoke)")
    print(f"  target: {TARGET_BRAND_ID[:8]} (UI PhysicsWallah)")
    print("=" * 60)

    source = [SOURCE_BRAND_ID]
    existing = get_existing_texts()
    print(f"  {len(existing)} existing embedding texts (dedup set)")

    all_rows = []
    all_rows += pull_reddit(source, existing)
    all_rows += pull_instagram(source, existing)
    all_rows += pull_youtube(source, existing)
    all_rows += pull_seo_from_mentions(source, existing)

    if not all_rows:
        print("\n  Nothing new to embed — backfill already represented in mention_embeddings.")
        return

    # Re-tag every row to the UI brand so the dashboard's brand filter picks it up.
    for r in all_rows:
        r["brand_id"] = TARGET_BRAND_ID

    print(f"\n  {len(all_rows)} rows re-tagged to UI brand; embedding + classifying...")
    stored, classified = process_and_store(all_rows, [TARGET_BRAND_ID])

    print("\n" + "=" * 60)
    print(f"  DONE — stored {stored} embeddings ({classified} classified) under {TARGET_BRAND_ID[:8]}")
    print("=" * 60)


if __name__ == "__main__":
    main()
