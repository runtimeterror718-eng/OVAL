"""
Find & store CRITICAL / badmouthing LinkedIn posts about PW (last 30 days).

Discovery: DuckDuckGo HTML `site:linkedin.com/posts` + PW terms + negative terms.
Fetch/parse: the public-HTML parser in scrapers/linkedin.py (works per-post URL).
Store: linkedin_posts + mentions under the dashboard brand, sentiment=negative.

⚠️ RUN FROM YOUR LAPTOP (home wifi) — DuckDuckGo rate-limits (HTTP 202) datacenter
IPs. A residential IP works fine. Optionally pass --proxy http://user:pass@host:port.

Usage:
    python3.11 scripts/linkedin_pw_critical.py
    python3.11 scripts/linkedin_pw_critical.py --dry-run
    python3.11 scripts/linkedin_pw_critical.py --proxy http://user:pass@host:port
"""
from __future__ import annotations

import argparse
import re
import sys
import time
import random
from datetime import datetime, timezone, timedelta
from urllib.parse import quote_plus, unquote, urlparse, parse_qs

sys.path.insert(0, "/Users/abhishektakkhi/OVAL 2.0")
from dotenv import load_dotenv
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/.env", override=True)
load_dotenv("/Users/abhishektakkhi/OVAL 2.0/secrets/.env.keys", override=True)

import requests
from bs4 import BeautifulSoup

from scrapers.linkedin import fetch_public_linkedin_post, _stable_id, PW_TERMS_RE
from config.supabase_client import get_service_client
from storage.queries import upsert_mention_by_platform_ref

BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Negative / badmouthing angles to combine with the PW brand terms.
NEGATIVE_TERMS = "scam OR fraud OR toxic OR layoff OR fired OR resigned OR overrated OR worst OR complaint OR misleading OR refund OR ex-employee OR bad culture OR harassment OR overpriced"
PW_TERMS = ['"physics wallah"', '"physicswallah"', '"alakh pandey"', '"PW Skills"']
NEG_RE = re.compile(r"\b(scam|fraud|toxic|layoff|laid off|fired|resign|overrated|worst|complaint|mislead|refund|ex-?employee|harass|overpriced|cheat|disappoint|regret|avoid|poor|useless|waste)\b", re.I)


def _extract_li_posts(html: str, urls: set[str]) -> None:
    """Pull linkedin.com/posts URLs out of a DDG results page (Lite or HTML)."""
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        m = re.search(r"uddg=([^&]+)", href)
        real = unquote(m.group(1)) if m else href
        if "/posts/" in real and "linkedin.com" in real:
            urls.add(real.split("?")[0])
    # regex fallback for links embedded in text
    for m in re.findall(r"https?://[a-z]*\.?linkedin\.com/posts/[\w%-]+", html):
        urls.add(unquote(m).split("?")[0])


def ddg_discover(session: requests.Session) -> list[str]:
    urls: set[str] = set()

    # Warm up: hit the homepage first so DDG sets its cookies (cold operator
    # queries against the HTML endpoint trip the 202 bot-guard instantly).
    try:
        session.get("https://duckduckgo.com/", timeout=15)
        time.sleep(random.uniform(1.5, 3))
    except Exception:
        pass

    def _search(q: str) -> int:
        before = len(urls)
        # DDG Lite is the scrape-tolerant endpoint; POST is its native form method.
        for attempt in range(3):
            try:
                r = session.post(
                    "https://lite.duckduckgo.com/lite/",
                    data={"q": q, "df": "m", "kl": "in-en"},
                    headers={"Referer": "https://lite.duckduckgo.com/", "Content-Type": "application/x-www-form-urlencoded"},
                    timeout=20,
                )
                if r.status_code == 200 and "linkedin.com" in r.text:
                    _extract_li_posts(r.text, urls)
                    return len(urls) - before
                if r.status_code in (202, 403, 429):
                    wait = 6 * (attempt + 1) + random.uniform(0, 4)
                    print(f"    DDG {r.status_code}, backing off {wait:.0f}s (attempt {attempt+1}/3)")
                    time.sleep(wait)
                    continue
                return 0
            except Exception as e:
                print(f"    error: {str(e)[:50]}")
                time.sleep(5)
        return 0

    for pw in PW_TERMS:
        # Simpler query = fewer operators = far less likely to trip the bot-guard.
        q = f"site:linkedin.com/posts {pw} ({NEGATIVE_TERMS})"
        added = _search(q)
        print(f"  {pw}: +{added} ({len(urls)} unique total)")
        time.sleep(random.uniform(5, 9))  # slow, human-like pacing between queries
    return sorted(urls)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--proxy", default="", help="http://user:pass@host:port (use a residential proxy from a datacenter)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9"})
    if args.proxy:
        session.proxies = {"http": args.proxy, "https": args.proxy}

    print(f"Discovering critical PW LinkedIn posts (last {args.days} days)...")
    urls = ddg_discover(session)
    print(f"\nDiscovered {len(urls)} candidate LinkedIn post URLs")
    if not urls:
        print("Nothing discovered — likely rate-limited. Run from a residential IP or pass --proxy.")
        return

    after = datetime.now(timezone.utc) - timedelta(days=args.days)
    kept = []
    for u in urls:
        try:
            post = fetch_public_linkedin_post(u)
        except Exception as e:
            print(f"  fetch fail {u[:60]}: {str(e)[:50]}")
            continue
        if not post or not post.get("content_text"):
            continue
        text = post["content_text"]
        # keep only genuinely PW-related AND negative-toned
        if not PW_TERMS_RE.search(text) or not NEG_RE.search(text):
            continue
        # date window (published_at may be relative -> parser already normalized to ISO)
        pub = post.get("published_at")
        if pub:
            try:
                if datetime.fromisoformat(str(pub).replace("Z", "+00:00")) < after:
                    continue
            except ValueError:
                pass
        post["_neg_hits"] = NEG_RE.findall(text)
        kept.append(post)
        print(f"  ✓ {post.get('author_name','?')}: {text[:80].replace(chr(10),' ')}")
        time.sleep(random.uniform(1.5, 3))

    print(f"\n{len(kept)} critical PW posts after filtering")
    if args.dry_run or not kept:
        for p in kept:
            print(f"  - [{','.join(set(p['_neg_hits']))}] {p.get('source_url')}")
        return

    sb = get_service_client()
    stored = 0
    for p in kept:
        pid = p.get("post_id") or _stable_id(p.get("source_url"), p["content_text"])
        try:
            sb.table("linkedin_posts").insert({
                "brand_id": BRAND_ID, "post_text": p["content_text"],
                "author_name": p.get("author_name") or "", "author_headline": p.get("author_headline") or "",
                "reactions_count": p.get("likes", 0) or 0, "comments_count": p.get("comments_count", 0) or 0,
                "published_date": p.get("published_at"), "post_url": p.get("source_url") or "",
                "raw_data": {**(p.get("raw_data") or {}), "sentiment": "negative", "neg_hits": p["_neg_hits"]},
            }).execute()
        except Exception as e:
            print(f"  post store note: {str(e)[:50]}")
        try:
            upsert_mention_by_platform_ref({
                "brand_id": BRAND_ID, "platform": "linkedin", "platform_ref_id": pid,
                "content_text": p["content_text"], "content_type": "linkedin_post",
                "author_handle": p.get("author_name") or "", "author_name": p.get("author_name") or "",
                "engagement_score": (p.get("likes", 0) or 0) + (p.get("comments_count", 0) or 0),
                "likes": p.get("likes", 0) or 0, "comments_count": p.get("comments_count", 0) or 0,
                "sentiment_label": "negative", "language": "en",
                "source_url": p.get("source_url") or "", "published_at": p.get("published_at"),
                "raw_data": {"source": "linkedin_critical_ddg", "neg_hits": p["_neg_hits"]},
            })
            stored += 1
        except Exception as e:
            print(f"  mention store note: {str(e)[:50]}")

    print(f"\nDONE — stored {stored} critical PW LinkedIn posts under {BRAND_ID[:8]}")


if __name__ == "__main__":
    main()
