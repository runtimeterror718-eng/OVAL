"""
Pull Play Store reviews via the official Google Play Developer API.

Authenticates with the service account key in secrets/playstore-service-account.json,
fetches all available reviews (the API exposes text reviews from roughly the last
7 days), merges them into oval/src/data/playstore-live-reviews.json (deduped by
reviewId), and appends an entry to oval/src/data/playstore-pull-log.json.

Usage:
    python3 scripts/pull_playstore_reviews.py            # one-shot pull
    python3 scripts/pull_playstore_reviews.py --loop 300 # poll every 5 minutes
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

REPO_ROOT = Path(__file__).resolve().parent.parent
KEY_PATH = REPO_ROOT / "secrets" / "playstore-service-account.json"
LIVE_PATH = REPO_ROOT / "oval" / "src" / "data" / "playstore-live-reviews.json"
LOG_PATH = REPO_ROOT / "oval" / "src" / "data" / "playstore-pull-log.json"
PACKAGE = "xyz.penpencil.physicswala"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"
BASE_URL = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}/reviews"
MAX_LOG_ENTRIES = 100

SUPABASE_TABLE = os.getenv("PLAYSTORE_REVIEWS_TABLE", "playstore_reviews")


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(REPO_ROOT / "oval" / ".env.local")
_load_env_file(REPO_ROOT / ".env")


def _token() -> str:
    creds = service_account.Credentials.from_service_account_file(str(KEY_PATH), scopes=[SCOPE])
    creds.refresh(Request())
    return creds.token


def _iso(seconds: str | int | None) -> str | None:
    if not seconds:
        return None
    return datetime.fromtimestamp(int(seconds), tz=timezone.utc).isoformat()


def _normalize(review: dict) -> dict | None:
    comments = review.get("comments") or []
    user_comment = next((c["userComment"] for c in comments if "userComment" in c), None)
    if not user_comment:
        return None
    developer_comment = next((c["developerComment"] for c in comments if "developerComment" in c), None)
    text = (user_comment.get("text") or "").replace("\t", " ").strip()
    return {
        "reviewId": review.get("reviewId"),
        "author": (review.get("authorName") or "").strip() or None,
        "rating": user_comment.get("starRating"),
        "text": text or None,
        "language": user_comment.get("reviewerLanguage"),
        "device": user_comment.get("device"),
        "androidOsVersion": user_comment.get("androidOsVersion"),
        "version": user_comment.get("appVersionName"),
        "thumbsUpCount": user_comment.get("thumbsUpCount", 0),
        "date": _iso((user_comment.get("lastModified") or {}).get("seconds")),
        "replied": developer_comment is not None,
        "replyText": (developer_comment or {}).get("text", "").replace("\t", " ").strip() or None,
        "replyDate": _iso(((developer_comment or {}).get("lastModified") or {}).get("seconds")),
        "rawData": review,
    }


def fetch_all() -> list[dict]:
    token = _token()
    headers = {"Authorization": f"Bearer {token}"}
    reviews: list[dict] = []
    page_token: str | None = None
    while True:
        params: dict = {"maxResults": 100}
        if page_token:
            params["token"] = page_token
        resp = requests.get(BASE_URL, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        for raw in payload.get("reviews", []):
            normalized = _normalize(raw)
            if normalized and normalized["reviewId"]:
                reviews.append(normalized)
        page_token = (payload.get("tokenPagination") or {}).get("nextPageToken")
        if not page_token:
            break
    return reviews


def _load_json(path: Path, fallback):
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return fallback
    return fallback


def _append_log(entry: dict) -> None:
    log = _load_json(LOG_PATH, [])
    log.insert(0, entry)
    LOG_PATH.write_text(json.dumps(log[:MAX_LOG_ENTRIES], indent=1))


def _supabase_credentials() -> tuple[str | None, str | None]:
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_KEY")
    )
    return url, key


def _supabase_row(review: dict) -> dict:
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
        "source": "google-play-developer-api",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_data": review.get("rawData") or review,
    }


def _upsert_supabase(reviews: list[dict]) -> dict:
    url, key = _supabase_credentials()
    rows = [_supabase_row(review) for review in reviews if review.get("reviewId")]
    if not url or not key or not rows:
        return {"enabled": bool(url and key), "upserted": 0, "error": None}
    try:
        endpoint = f"{url.rstrip('/')}/rest/v1/{SUPABASE_TABLE}"
        response = requests.post(
            endpoint,
            params={"on_conflict": "review_id"},
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json=rows,
            timeout=60,
        )
        response.raise_for_status()
        return {"enabled": True, "upserted": len(rows), "error": None}
    except Exception as err:  # noqa: BLE001 - keep local cache alive if Supabase fails
        return {"enabled": True, "upserted": 0, "error": str(err)[:300]}


def pull_once() -> dict:
    pulled_at = datetime.now(timezone.utc).isoformat()
    store = _load_json(LIVE_PATH, {"reviews": {}})
    existing = store.get("reviews", {})
    try:
        fetched = fetch_all()
    except requests.HTTPError as err:
        status = err.response.status_code if err.response is not None else "?"
        detail = ""
        try:
            detail = err.response.json().get("error", {}).get("message", "")[:200]
        except Exception:
            pass
        message = f"HTTP {status}: {detail or err}"
        if status == 403:
            message += " (service account not yet authorized in Play Console, or permission still propagating)"
        _append_log({"pulledAt": pulled_at, "status": "error", "fetched": 0, "new": 0, "updated": 0,
                     "totalStored": len(existing), "message": message})
        print(f"[pull] ERROR {message}")
        return {"status": "error", "message": message}
    except Exception as err:  # noqa: BLE001 - log and surface any pull failure
        _append_log({"pulledAt": pulled_at, "status": "error", "fetched": 0, "new": 0, "updated": 0,
                     "totalStored": len(existing), "message": str(err)[:300]})
        print(f"[pull] ERROR {err}")
        return {"status": "error", "message": str(err)}

    new_count = 0
    updated_count = 0
    for review in fetched:
        rid = review["reviewId"]
        if rid not in existing:
            new_count += 1
            existing[rid] = review
        elif existing[rid].get("date") != review.get("date") or existing[rid].get("replied") != review.get("replied"):
            updated_count += 1
            existing[rid] = review

    supabase_result = _upsert_supabase(list(existing.values()))

    store = {
        "package": PACKAGE,
        "lastPulledAt": pulled_at,
        "reviews": existing,
    }
    LIVE_PATH.write_text(json.dumps(store, indent=1))
    _append_log({
        "pulledAt": pulled_at,
        "status": "ok",
        "fetched": len(fetched),
        "new": new_count,
        "updated": updated_count,
        "totalStored": len(existing),
        "message": supabase_result["error"],
        "supabaseUpserted": supabase_result["upserted"],
    })
    suffix = f" supabase_upserted={supabase_result['upserted']}" if supabase_result["enabled"] else " supabase=disabled"
    if supabase_result["error"]:
        suffix += f" supabase_error={supabase_result['error']}"
    print(f"[pull] ok fetched={len(fetched)} new={new_count} updated={updated_count} total={len(existing)}{suffix}")
    return {
        "status": "ok",
        "fetched": len(fetched),
        "new": new_count,
        "updated": updated_count,
        "supabase_upserted": supabase_result["upserted"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", type=int, default=0, help="poll continuously every N seconds")
    args = parser.parse_args()
    if args.loop > 0:
        interval = max(60, args.loop)
        print(f"[pull] polling every {interval}s — Ctrl+C to stop")
        while True:
            pull_once()
            time.sleep(interval)
    else:
        pull_once()


if __name__ == "__main__":
    main()
