"""
Ingest LinkedIn posts about PW discovered via Exa into Supabase.

Exa's MCP search runs inside the agent session, not here — so the agent dumps
Exa result JSON to a file and this script ingests it: classify sentiment
(uses Exa's own summary + a keyword pass), store to linkedin_posts + mentions
under the dashboard brand. The /api/linkedin route then reads from Supabase.

Usage:
    python3.11 scripts/ingest_linkedin_exa.py <exa_results.json> [<more.json> ...]
"""
from __future__ import annotations

import json
import re
import sys
import hashlib
from datetime import datetime, timezone

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

from config.supabase_client import get_service_client
from scrapers.linkedin import PW_TERMS_RE
from storage.queries import upsert_mention_by_platform_ref

BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"

NEG_RE = re.compile(r"\b(scam|fraud|toxic|layoff|laid off|fired|terminat|resign|overrated|worst|complaint|mislead|refund|ex-?employee|harass|overpriced|overvalued|cheat|disappoint|regret|avoid|unpaid|salary|byju|loss|caution|beware|fear|humiliat)\b", re.I)
POS_RE = re.compile(r"\b(proud|congratulations|grateful|thankful|milestone|success|inspiring|excellent|best teacher|love|amazing|great initiative|kudos)\b", re.I)


def _stable_id(*parts) -> str:
    return hashlib.sha1("|".join(str(p or "") for p in parts).encode()).hexdigest()[:24]


def classify(text: str, summary: str) -> str:
    """Sentiment from Exa's summary verdict first, then keyword fallback.

    NEGATIVE is enforced strictly: a summary verdict alone is not enough — the
    post text itself must also carry negative-keyword signal, otherwise the
    post is downgraded to neutral. This keeps neutral posts out of the
    negative bucket.
    """
    s = (summary or "").strip().lower()
    text_neg = len(NEG_RE.findall(text))
    text_pos = len(POS_RE.findall(text))

    # Preferred: one-word verdict prompt ("NEGATIVE ...", "NEUTRAL ...", "POSITIVE ...")
    m = re.match(r"^\W*(negative|positive|neutral)\b", s)
    if m:
        verdict = m.group(1)
    # Legacy yes/no prompt ("Is this post negative/critical about PW?")
    elif s.startswith("yes") or "negative/critical" in s or "is negative" in s or "is critical" in s:
        verdict = "negative"
    elif s.startswith("no") and ("positive" in s or "not negative" in s):
        verdict = "positive"
    else:
        verdict = ""

    if verdict == "negative":
        return "negative" if text_neg >= 1 and text_neg > text_pos else "neutral"
    if verdict == "positive":
        return "positive"
    if verdict == "neutral":
        return "neutral"
    # No usable verdict: keyword fallback — negative needs a clear margin.
    if text_neg >= 2 and text_neg > text_pos:
        return "negative"
    if text_pos > text_neg:
        return "positive"
    return "neutral"


def load_results(path: str) -> list[dict]:
    d = json.loads(open(path).read())
    if isinstance(d, dict):
        return d.get("results") or d.get("data", {}).get("results") or []
    return d if isinstance(d, list) else []


def main():
    argv = [a for a in sys.argv[1:] if a != "--only-negative"]
    only_negative = "--only-negative" in sys.argv
    if not argv:
        print("usage: ingest_linkedin_exa.py [--only-negative] <exa_results.json> [...]")
        sys.exit(1)

    rows = []
    for path in argv:
        rows.extend(load_results(path))
    print(f"loaded {len(rows)} Exa results" + (" (only-negative mode)" if only_negative else ""))

    sb = get_service_client()
    # URLs already in linkedin_posts — repeated runs must not re-insert them.
    existing = sb.table("linkedin_posts").select("post_url").eq("brand_id", BRAND_ID).limit(5000).execute().data
    existing_urls = {(e.get("post_url") or "").split("?")[0] for e in existing}
    seen, stored, skipped_irrelevant = set(), 0, 0
    sentiment_counts = {"negative": 0, "positive": 0, "neutral": 0}
    for r in rows:
        url = (r.get("url") or "").split("?")[0]
        text = (r.get("text") or "").strip()
        summary = r.get("summary") or ""
        title = (r.get("title") or "").strip()
        if not url or not text:
            continue
        # HARD relevance gate: the post itself (text/title) must mention a PW
        # brand term. Deliberately excludes `summary` — the Exa summary prompt
        # names Physics Wallah, so it would match for every result.
        if not PW_TERMS_RE.search(f"{title} {text}"):
            skipped_irrelevant += 1
            continue
        pid = _stable_id(url)
        if pid in seen:
            continue
        seen.add(pid)

        sentiment = classify(text, summary)
        if only_negative and sentiment != "negative":
            continue
        sentiment_counts[sentiment] += 1
        author = r.get("author") or ""
        pub = r.get("publishedDate")

        if url not in existing_urls:
            existing_urls.add(url)
            try:
                sb.table("linkedin_posts").insert({
                    "brand_id": BRAND_ID,
                    "post_text": text[:8000],
                    "author_name": author[:200],
                    "author_headline": title[:300],
                    "reactions_count": 0, "comments_count": 0, "shares_count": 0,
                    "published_date": pub,
                    "post_url": url,
                    "raw_data": {"source": "exa", "sentiment": sentiment, "summary": summary[:1000], "title": title},
                }).execute()
            except Exception as e:
                print(f"  post store note: {str(e)[:60]}")
        else:
            # Re-running a verified Exa result may improve its classification
            # or summary. Keep the canonical post row aligned with the mention
            # upsert instead of leaving stale raw_data behind.
            try:
                sb.table("linkedin_posts").update({
                    "raw_data": {
                        "source": "exa",
                        "sentiment": sentiment,
                        "summary": summary[:1000],
                        "title": title,
                    },
                }).eq("brand_id", BRAND_ID).eq("post_url", url).execute()
            except Exception as e:
                print(f"  post refresh note: {str(e)[:60]}")
        try:
            upsert_mention_by_platform_ref({
                "brand_id": BRAND_ID, "platform": "linkedin", "platform_ref_id": pid,
                "content_text": text[:8000], "content_type": "linkedin_post",
                "author_handle": author, "author_name": author,
                "engagement_score": 0, "likes": 0, "comments_count": 0,
                "sentiment_label": sentiment, "language": "en",
                "source_url": url, "published_at": pub,
                "raw_data": {"source": "exa", "summary": summary[:1000]},
            })
            stored += 1
        except Exception as e:
            print(f"  mention store note: {str(e)[:60]}")

    print(f"\nDONE — stored {stored} LinkedIn posts under {BRAND_ID[:8]}")
    print(f"skipped (no PW mention in post text/title): {skipped_irrelevant}")
    print(f"sentiment: {sentiment_counts}")


if __name__ == "__main__":
    main()
