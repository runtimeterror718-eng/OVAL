"""
Import Google Play Console review CSV exports into Supabase playstore_reviews.

The Play Console exports are UTF-16 CSV files. This importer preserves the
package_name from the CSV, so multiple apps can share the same Supabase table.

Usage:
    python3 scripts/import_playstore_csv_to_supabase.py /path/to/reviews_*.csv
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client

REPO_ROOT = Path(__file__).resolve().parent.parent
BATCH_SIZE = 500

def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and not os.environ.get(key):
            os.environ[key] = value


load_env_file(REPO_ROOT / "oval" / ".env.local")
load_env_file(REPO_ROOT / "secrets" / ".env.keys")
load_env_file(REPO_ROOT / ".env")

SUPABASE_TABLE = os.getenv("PLAYSTORE_REVIEWS_TABLE", "playstore_reviews")


def supabase_client():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def parse_review_id(link: str) -> str | None:
    match = re.search(r"[?&]reviewId=([^&]+)", link or "")
    return match.group(1) if match else None


def stable_review_id(row: dict[str, str], source_name: str) -> str:
    raw = "|".join(
        [
            row.get("Package Name", ""),
            row.get("Review Submit Millis Since Epoch", ""),
            row.get("Review Last Update Millis Since Epoch", ""),
            row.get("Star Rating", ""),
            row.get("Review Text", ""),
            source_name,
        ]
    )
    return "csv-" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def iso_or_none(value: str) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return None


def int_or_none(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def rows_from_csv(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open("r", encoding="utf-16", newline="") as handle:
        for row in csv.DictReader(handle):
            package_name = (row.get("Package Name") or "").strip()
            if not package_name:
                continue
            link = (row.get("Review Link") or "").strip()
            review_id = parse_review_id(link) or stable_review_id(row, path.name)
            reply_text = (row.get("Developer Reply Text") or "").strip() or None
            rows.append(
                {
                    "package_name": package_name,
                    "review_id": review_id,
                    "author": None,
                    "rating": int_or_none(row.get("Star Rating") or ""),
                    "review_text": (row.get("Review Text") or row.get("Review Title") or "").strip() or None,
                    "language": (row.get("Reviewer Language") or "").strip() or None,
                    "device": (row.get("Device") or "").strip() or None,
                    "android_os_version": None,
                    "app_version": (row.get("App Version Name") or "").strip() or None,
                    "thumbs_up_count": 0,
                    "posted_at": iso_or_none(row.get("Review Submit Date and Time") or ""),
                    "replied": bool(reply_text or (row.get("Developer Reply Date and Time") or "").strip()),
                    "reply_text": reply_text,
                    "reply_posted_at": iso_or_none(row.get("Developer Reply Date and Time") or ""),
                    "source": "google-play-console-csv",
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                    "raw_data": {**row, "source_file": path.name},
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    args = parser.parse_args()

    client = supabase_client()
    rows: list[dict] = []
    for path in args.inputs:
        rows.extend(rows_from_csv(path))
    if not rows:
        raise SystemExit("No rows found in input CSVs.")

    upserted = 0
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        client.table(SUPABASE_TABLE).upsert(batch, on_conflict="review_id").execute()
        upserted += len(batch)
        print(f"[import] upserted {upserted}/{len(rows)}")

    packages = sorted({row["package_name"] for row in rows})
    print(f"[import] done table={SUPABASE_TABLE} packages={packages} rows={upserted}")


if __name__ == "__main__":
    main()
