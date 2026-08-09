"""
Reddit scraper — OAuth-first scraper for negative PR detection.

Owner: Team A

Pipeline:
  1. Search targeted subreddits for PW mentions via Reddit OAuth when configured
  2. Scrape posts + ALL comments (comments = where real criticism lives)
  3. Store to reddit_posts + reddit_comments + mentions

Falls back to Reddit's public JSON endpoints only when OAuth credentials are not
configured.

Usage:
    python -m scrapers.reddit --brand "PhysicsWallah" --max-posts 50 --max-comments 100
"""

from __future__ import annotations

import asyncio
import logging
import time
import random
from datetime import datetime, timezone
from typing import Any

import requests as http_requests

from scrapers.base import BaseScraper, fetch_with_backoff
from search.engine import register_searcher
from search.filters import SearchParams, in_window, reddit_time_filter
from storage import queries as db

logger = logging.getLogger(__name__)

# Browser UA — Reddit now 403s the old "bot"-style UA on its public JSON/RSS.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

# ---------------------------------------------------------------------------
# Subreddits and queries for PW negative PR
# ---------------------------------------------------------------------------

PW_SUBREDDITS = [
    "PhysicsWallah",
    "JEENEETards",
    "IndianAcademia",
    "btechtards",
    "Indian_Education",
    "CBSE",
    "india",
    "indiasocial",
]

PW_SEARCH_QUERIES = [
    "physicswallah",
    "physics wallah",
    "alakh pandey",
    "pw arjuna",
    "physics wallah arjuna",
    "arjuna batch pw",
    "pw lakshya",
    "physics wallah lakshya",
    "lakshya batch pw",
    "pw yakeen",
    "pw prayas",
    "pw vidyapeeth",
    "PW scam OR fraud OR controversy",
    "PW quality OR teachers leaving OR refund",
    "PW layoffs OR data leak OR IPO",
]

PW_BRAND_TERMS = [
    "physicswallah",
    "physics wallah",
    "physics-wallah",
    "alakh pandey",
    "alakh sir",
    "pw app",
    "pw live",
    "pwonlyias",
    "pw skills",
]

PW_COURSE_TERMS = [
    "arjuna",
    "lakshya",
    "yakeen",
    "prayas",
    "vidyapeeth",
    "pathshala",
    "khazana",
    "pw infinity",
]

PW_CONTEXT_TERMS = [
    "pw",
    "physics",
    "wallah",
    "jee",
    "neet",
    "batch",
    "teacher",
    "module",
    "lecture",
    "dpp",
    "test series",
]


def is_pw_specific_text(*parts: Any) -> bool:
    """Return true only for Reddit text that is clearly about Physics Wallah."""
    text = " ".join(str(part or "") for part in parts).lower()
    if not text.strip():
        return False
    if any(term in text for term in PW_BRAND_TERMS):
        return True
    if " pw " in f" {text} ":
        return True
    has_course = any(term in text for term in PW_COURSE_TERMS)
    has_context = any(term in text for term in PW_CONTEXT_TERMS)
    return has_course and has_context


# ---------------------------------------------------------------------------
# Reddit API helpers
# ---------------------------------------------------------------------------

def _get_reddit_client():
    """Return a PRAW client when Reddit OAuth credentials are configured."""
    try:
        from config.settings import REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT

        if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
            return None

        import praw

        return praw.Reddit(
            client_id=REDDIT_CLIENT_ID,
            client_secret=REDDIT_CLIENT_SECRET,
            user_agent=REDDIT_USER_AGENT or HEADERS["User-Agent"],
            check_for_async=False,
        )
    except Exception as e:
        logger.warning("Reddit OAuth client unavailable, falling back to JSON API: %s", e)
        return None


def _praw_submission_to_dict(submission: Any) -> dict[str, Any]:
    """Convert a PRAW submission to our standard format."""
    published = datetime.utcfromtimestamp(getattr(submission, "created_utc", 0) or 0)
    subreddit = str(getattr(submission, "subreddit", "") or "")
    permalink = getattr(submission, "permalink", "") or ""
    source_url = getattr(submission, "url", "") or ""
    if permalink:
        source_url = f"https://reddit.com{permalink}"

    return {
        "post_id": getattr(submission, "id", "") or "",
        "content_text": f"{getattr(submission, 'title', '') or ''}\n{getattr(submission, 'selftext', '') or ''}",
        "content_type": "text",
        "author_handle": str(getattr(submission, "author", "") or "[deleted]"),
        "author_name": str(getattr(submission, "author", "") or "[deleted]"),
        "engagement_score": getattr(submission, "score", 0) or 0,
        "likes": getattr(submission, "score", 0) or 0,
        "shares": 0,
        "comments_count": getattr(submission, "num_comments", 0) or 0,
        "source_url": source_url,
        "published_at": published.isoformat(),
        "language": "en",
        "raw_data": {
            "subreddit": subreddit,
            "id": getattr(submission, "id", "") or "",
            "upvote_ratio": getattr(submission, "upvote_ratio", 0) or 0,
            "permalink": permalink,
            "is_self": getattr(submission, "is_self", True),
            "num_awards": getattr(submission, "total_awards_received", 0) or 0,
            "flair": getattr(submission, "link_flair_text", None),
        },
    }


def _reddit_oauth_search(
    reddit: Any,
    subreddit: str,
    query: str,
    sort: str = "relevance",
    time_filter: str = "year",
    limit: int = 25,
) -> list[dict[str, Any]]:
    """Search Reddit via OAuth/PRAW and normalize submissions."""
    try:
        submissions = reddit.subreddit(subreddit).search(
            query,
            sort=sort,
            time_filter=time_filter,
            limit=limit,
        )
        return [_praw_submission_to_dict(s) for s in submissions]
    except Exception as e:
        logger.warning("Reddit OAuth search error for r/%s '%s': %s", subreddit, query, e)
        return []


def _reddit_oauth_new_since(
    reddit: Any,
    subreddit: str,
    after_date: datetime,
    before_date: datetime | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """Walk r/subreddit/new newest-first and return the requested date window.

    Reddit's search endpoint only offers coarse time buckets and ranked results.
    The chronological listing is the most reliable way to backfill a subreddit;
    Reddit caps listings at roughly 1,000 submissions, so high-volume subreddits
    can still require an archive provider for a complete 60-day history.
    """
    after_utc = after_date.replace(tzinfo=timezone.utc) if after_date.tzinfo is None else after_date.astimezone(timezone.utc)
    before_utc = None
    if before_date is not None:
        before_utc = before_date.replace(tzinfo=timezone.utc) if before_date.tzinfo is None else before_date.astimezone(timezone.utc)

    posts: list[dict[str, Any]] = []
    try:
        for submission in reddit.subreddit(subreddit).new(limit=limit):
            created = datetime.fromtimestamp(
                getattr(submission, "created_utc", 0) or 0,
                tz=timezone.utc,
            )
            if created < after_utc:
                break
            if before_utc is not None and created > before_utc:
                continue
            posts.append(_praw_submission_to_dict(submission))
    except Exception as e:
        logger.warning("Reddit OAuth /new backfill error for r/%s: %s", subreddit, e)
    return posts


def _reddit_get_comments_oauth(reddit: Any, source_url: str, limit: int = 100) -> list[dict[str, Any]]:
    """Get comments for a post via OAuth/PRAW."""
    try:
        submission = reddit.submission(url=source_url)
        submission.comment_sort = "top"
        submission.comments.replace_more(limit=0)

        comments = []
        for c in submission.comments.list():
            body = getattr(c, "body", "") or ""
            if not body or body == "[deleted]":
                continue
            created = datetime.utcfromtimestamp(getattr(c, "created_utc", 0) or 0)
            comments.append({
                "post_id": getattr(submission, "id", "") or "",
                "comment_body": body,
                "comment_author": str(getattr(c, "author", "") or "[deleted]"),
                "comment_score": getattr(c, "score", 0) or 0,
                "comment_parent_id": getattr(c, "parent_id", "") or "",
                "comment_depth": getattr(c, "depth", 0) or 0,
                "created_at": created.isoformat(),
            })
            if len(comments) >= limit:
                break

        return comments
    except Exception as e:
        logger.warning("Reddit OAuth comment scrape error: %s", e)
        return []

def _reddit_search(
    subreddit: str,
    query: str,
    sort: str = "relevance",
    time_filter: str = "year",
    limit: int = 25,
) -> list[dict]:
    """Search a subreddit via public JSON API."""
    try:
        resp = http_requests.get(
            f"https://www.reddit.com/r/{subreddit}/search.json",
            params={
                "q": query,
                "sort": sort,
                "t": time_filter,
                "limit": str(limit),
                "restrict_sr": "on",
            },
            headers=HEADERS,
            timeout=15,
        )
        if resp.status_code == 429:
            logger.warning("Reddit rate limited, waiting 10s...")
            time.sleep(10)
            return []
        if resp.status_code != 200:
            logger.warning("Reddit search %d for r/%s '%s'", resp.status_code, subreddit, query)
            return []
        return resp.json().get("data", {}).get("children", [])
    except Exception as e:
        logger.warning("Reddit search error for r/%s: %s", subreddit, e)
        return []


def _rss_entry_to_dict(entry: Any, subreddit: str = "") -> dict[str, Any]:
    """Convert a Reddit search.rss entry to our standard normalized format."""
    import html
    import re
    from email.utils import parsedate_to_datetime

    link = entry.get("link", "") or ""
    # Extract the post id from /comments/<id>/ and the subreddit from /r/<sub>/.
    m_id = re.search(r"/comments/([a-z0-9]+)/", link)
    m_sub = re.search(r"/r/([^/]+)/", link)
    post_id = m_id.group(1) if m_id else (entry.get("id", "") or "").split("/")[-1]
    sub = subreddit or (m_sub.group(1) if m_sub else "")

    # RSS 'updated' is the reliable timestamp; 'published' can be wrong on search feeds.
    ts = entry.get("updated") or entry.get("published")
    published_iso = None
    if ts:
        try:
            published_iso = datetime.fromisoformat(ts.replace("Z", "+00:00")).isoformat()
        except ValueError:
            try:
                published_iso = parsedate_to_datetime(ts).isoformat()
            except (TypeError, ValueError):
                published_iso = None

    # The RSS <content> is HTML; strip tags + unescape entities for a rough body.
    raw_body = entry.get("summary", "") or ""
    body = re.sub(r"<[^>]+>", " ", raw_body)
    body = html.unescape(re.sub(r"\s+", " ", body)).strip()
    title = html.unescape(entry.get("title", "") or "")

    author = entry.get("author", "") or ""
    author = author.lstrip("/").removeprefix("u/")

    return {
        "post_id": post_id,
        "content_text": f"{title}\n{body}",
        "content_type": "text",
        "author_handle": author,
        "author_name": author,
        "engagement_score": 0,
        "likes": 0,
        "shares": 0,
        "comments_count": 0,
        "source_url": link,
        "published_at": published_iso,
        "language": "en",
        "raw_data": {
            "subreddit": sub,
            "id": post_id,
            "permalink": link.replace("https://www.reddit.com", ""),
            "is_self": True,
            "source": "rss",
        },
    }


def _reddit_rss_search(query: str, subreddit: str = "", sort: str = "new", limit: int = 25) -> list[dict]:
    """Fallback search via Reddit's public RSS feed (works without OAuth).

    Reddit blocks the unauthenticated search.json with 403, but search.rss
    remains accessible. Uses exponential backoff for transient blocks.
    """
    import feedparser

    if subreddit and subreddit != "all":
        url = f"https://www.reddit.com/r/{subreddit}/search.rss"
        params = {"q": query, "restrict_sr": "on", "sort": sort, "limit": str(limit)}
    else:
        url = "https://www.reddit.com/search.rss"
        params = {"q": query, "sort": sort, "limit": str(limit)}

    resp = fetch_with_backoff(url, params=params, headers=HEADERS, label="reddit-rss")
    if resp is None or resp.status_code != 200:
        logger.warning(
            "Reddit RSS search %s for r/%s '%s'",
            resp.status_code if resp else "no-response", subreddit or "all", query,
        )
        return []
    feed = feedparser.parse(resp.text)
    return [_rss_entry_to_dict(e, subreddit) for e in feed.entries]


def _reddit_get_comments(permalink: str, limit: int = 100) -> list[dict]:
    """Get comments for a post via public JSON API."""
    try:
        url = f"https://www.reddit.com{permalink}.json"
        resp = http_requests.get(
            url,
            params={"limit": str(limit), "sort": "top"},
            headers=HEADERS,
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        if len(data) < 2:
            return []

        comments = []
        comment_listing = data[1].get("data", {}).get("children", [])
        for child in comment_listing:
            if child.get("kind") != "t1":
                continue
            c = child.get("data", {})
            if not c.get("body") or c["body"] == "[deleted]":
                continue
            created = datetime.utcfromtimestamp(c.get("created_utc", 0))
            comments.append({
                "comment_body": c["body"],
                "comment_author": c.get("author", "[deleted]"),
                "comment_score": c.get("score", 0),
                "comment_parent_id": c.get("parent_id", ""),
                "comment_depth": c.get("depth", 0),
                "created_at": created.isoformat(),
            })

            # Also get replies (1 level deep)
            replies = c.get("replies")
            if isinstance(replies, dict):
                for reply_child in replies.get("data", {}).get("children", []):
                    if reply_child.get("kind") != "t1":
                        continue
                    r = reply_child.get("data", {})
                    if not r.get("body") or r["body"] == "[deleted]":
                        continue
                    r_created = datetime.utcfromtimestamp(r.get("created_utc", 0))
                    comments.append({
                        "comment_body": r["body"],
                        "comment_author": r.get("author", "[deleted]"),
                        "comment_score": r.get("score", 0),
                        "comment_parent_id": r.get("parent_id", ""),
                        "comment_depth": r.get("depth", 1),
                        "created_at": r_created.isoformat(),
                    })

        return comments[:limit]
    except Exception as e:
        logger.warning("Reddit comment scrape error: %s", e)
        return []


def _submission_to_dict(post_data: dict, subreddit: str = "") -> dict[str, Any]:
    """Convert Reddit JSON post to our standard format."""
    d = post_data.get("data", post_data)
    published = datetime.utcfromtimestamp(d.get("created_utc", 0))
    sub = subreddit or d.get("subreddit", "")
    return {
        "post_id": d.get("id", ""),
        "content_text": f"{d.get('title', '')}\n{d.get('selftext', '')}",
        "content_type": "text",
        "author_handle": d.get("author", "[deleted]"),
        "author_name": d.get("author", "[deleted]"),
        "engagement_score": d.get("score", 0),
        "likes": d.get("score", 0),
        "shares": 0,
        "comments_count": d.get("num_comments", 0),
        "source_url": f"https://reddit.com{d.get('permalink', '')}",
        "published_at": published.isoformat(),
        "language": "en",
        "raw_data": {
            "subreddit": sub,
            "id": d.get("id", ""),
            "upvote_ratio": d.get("upvote_ratio", 0),
            "permalink": d.get("permalink", ""),
            "is_self": d.get("is_self", True),
            "num_awards": d.get("total_awards_received", 0),
            "flair": d.get("link_flair_text"),
        },
    }


# ---------------------------------------------------------------------------
# LLM Intelligence Layer
# ---------------------------------------------------------------------------

def _get_llm_client():
    from config.settings import (
        AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_VERSION,
        AZURE_OPENAI_DEPLOYMENT_GPT54, AZURE_OPENAI_DEPLOYMENT_GPT53,
        AZURE_OPENAI_DEPLOYMENT_GPT52, OPENAI_API_KEY, OPENAI_MODEL,
    )
    dep = AZURE_OPENAI_DEPLOYMENT_GPT54 or AZURE_OPENAI_DEPLOYMENT_GPT53 or AZURE_OPENAI_DEPLOYMENT_GPT52
    if AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT and dep:
        from openai import AzureOpenAI
        return AzureOpenAI(api_key=AZURE_OPENAI_API_KEY, api_version=AZURE_OPENAI_API_VERSION, azure_endpoint=AZURE_OPENAI_ENDPOINT), dep
    if OPENAI_API_KEY:
        from openai import OpenAI
        return OpenAI(api_key=OPENAI_API_KEY), OPENAI_MODEL or "gpt-4o-mini"
    return None, None


def _llm_json(system: str, user: str) -> dict:
    import json as _j
    c, m = _get_llm_client()
    if not c: return {}
    try:
        r = c.chat.completions.create(model=m, messages=[{"role":"system","content":system},{"role":"user","content":user}], temperature=0.0, response_format={"type":"json_object"})
        return _j.loads(r.choices[0].message.content or "{}")
    except Exception as e:
        logger.warning("LLM call failed: %s", e)
        return {}


def triage_reddit_post(title: str, body: str, subreddit: str, score: int) -> dict[str, Any]:
    """LLM triage of Reddit post → sentiment, PR risk, issue type, severity."""
    text = f"{title}\n{body[:1500]}" if body else title
    if len(text.strip()) < 10:
        return {"label": "neutral", "is_pr_risk": False, "confidence": 0.3, "issue_type": "none", "severity": "low", "reason": "empty"}
    r = _llm_json(
        "You are a brand PR analyst for Physics Wallah (PW), Indian edtech. Classify this Reddit post. Return JSON: {\"label\":\"positive|negative|neutral|uncertain\",\"is_pr_risk\":true/false,\"confidence\":0.0-1.0,\"issue_type\":\"brand_praise|course_review|refund_complaint|quality_complaint|scam_allegation|teacher_exodus|app_issue|employer_criticism|ipo_discussion|political|student_experience|competitor_comparison|meme|other\",\"severity\":\"low|medium|high|critical\",\"reason\":\"1 sentence\"}",
        f"Subreddit: r/{subreddit}\nScore: {score}\nTitle: {title}\nBody:\n{(body or '')[:2000]}",
    )
    return {"label": r.get("label","neutral"), "is_pr_risk": r.get("is_pr_risk",False), "confidence": min(1.0, max(0.0, r.get("confidence",0.5))), "issue_type": r.get("issue_type","other"), "severity": r.get("severity","low"), "reason": r.get("reason","")}


def classify_reddit_comments_batch(comments: list[dict]) -> dict[int, str]:
    """Batch classify Reddit comments."""
    if not comments: return {}
    items = [f"[{i}] {(c.get('comment_body') or '')[:200]}" for i, c in enumerate(comments)]
    c, m = _get_llm_client()
    if not c: return {}
    try:
        r = c.chat.completions.create(model=m, messages=[
            {"role":"system","content":"Classify each Reddit comment sentiment toward Physics Wallah. Understand Indian slang, Hinglish, sarcasm. Return ONLY index:label, one per line. Labels: positive, negative, neutral."},
            {"role":"user","content":f"Classify all {len(items)}:\n"+"\n".join(items)},
        ], temperature=0.1, max_tokens=800)
        raw = r.choices[0].message.content or ""
        results = {}
        for line in raw.strip().split("\n"):
            if ":" not in line: continue
            parts = line.split(":", 1)
            try:
                idx = int(parts[0].strip())
                lab = parts[1].strip().lower().rstrip(".")
                if lab in ("positive","negative","neutral") and 0 <= idx < len(comments):
                    results[idx] = lab
            except (ValueError, IndexError): pass
        return results
    except Exception as e:
        logger.warning("Reddit comment classification failed: %s", e)
        return {}


def synthesize_reddit_post(triage: dict, comment_stats: dict) -> dict[str, Any]:
    """Final synthesis: combine post triage + comment sentiment → verdict."""
    final = triage.get("label", "neutral")
    severity = triage.get("severity", "low")
    risk = triage.get("is_pr_risk", False)
    issue = triage.get("issue_type", "other")
    action = "ignore"

    neg = comment_stats.get("negative", 0)
    total = comment_stats.get("total", 0)
    if total > 3 and neg / total > 0.5:
        risk = True
        if severity == "low": severity = "medium"
        action = "monitor"

    sev = {"low":0,"medium":1,"high":2,"critical":3}
    if sev.get(severity,0) >= 2:
        action = "escalate" if severity == "critical" else "respond"
    elif risk and action == "ignore":
        action = "monitor"

    return {"final_sentiment": final, "final_severity": severity, "final_is_pr_risk": risk, "final_issue_type": issue, "final_recommended_action": action}


# ---------------------------------------------------------------------------
# Scraper class
# ---------------------------------------------------------------------------

class RedditScraper(BaseScraper):
    platform = "reddit"

    async def search(self, params: SearchParams) -> list[dict[str, Any]]:
        """Search Reddit for PW mentions across targeted subreddits."""
        results = []
        seen_ids = set()
        reddit = _get_reddit_client()

        queries = params.keywords or PW_SEARCH_QUERIES
        subreddits = getattr(params, '_reddit_subreddits', None) or PW_SUBREDDITS
        max_per = max(params.max_results_per_platform // max(len(queries) * len(subreddits), 1), 10)

        # Reddit search supports only coarse time buckets; pick the smallest
        # one that covers the requested lookback, then apply an exact cut below.
        tf = reddit_time_filter(params.after_date)

        def _add(p: dict, sub: str = "") -> None:
            normalized = p if p.get("post_id") else _submission_to_dict(p, sub)
            pid = normalized.get("post_id", "")
            if not pid or pid in seen_ids:
                return
            if not in_window(normalized.get("published_at"), params.after_date, params.before_date):
                return
            raw = normalized.get("raw_data", {})
            if not is_pw_specific_text(
                normalized.get("content_text", ""),
                raw.get("subreddit", ""),
                raw.get("flair", ""),
            ):
                return
            seen_ids.add(pid)
            results.append(normalized)

        # RSS sort has no "relevance"; map to a supported value.
        rss_sort = "new" if params.after_date else "relevance"
        public_fallback_failures = 0

        def _query_sub(sub: str, query: str, sort: str) -> list[dict]:
            """Try OAuth → JSON API → RSS fallback, in order, until one yields posts."""
            nonlocal public_fallback_failures
            if reddit:
                posts = _reddit_oauth_search(reddit, sub, query, sort=sort, time_filter=tf, limit=max_per)
                if posts:
                    return posts
            elif public_fallback_failures >= 3:
                return []
            posts = _reddit_search(sub, query, sort=sort, time_filter=tf, limit=max_per)
            if posts:
                public_fallback_failures = 0
                return posts
            # Both OAuth and JSON unavailable/blocked → RSS (with backoff).
            posts = _reddit_rss_search(query, subreddit=sub, sort=rss_sort, limit=max_per)
            if posts:
                public_fallback_failures = 0
                return posts
            if not reddit:
                public_fallback_failures += 1
                if public_fallback_failures == 3:
                    logger.warning(
                        "Reddit public endpoints are blocked/rate-limited; skipping remaining public fallback searches. "
                        "Configure REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET for reliable backfills."
                    )
            return []

        def _search():
            # For an exact backfill, first walk each target subreddit's
            # chronological listing. Query search below supplements this for
            # busy subreddits whose 1,000-item listing does not reach the cutoff.
            if reddit and params.after_date:
                for sub in subreddits:
                    for p in _reddit_oauth_new_since(
                        reddit,
                        sub,
                        params.after_date,
                        params.before_date,
                    ):
                        _add(p, sub)
                    logger.info("Backfilled r/%s/new: %d matching posts so far", sub, len(results))

            for sub in subreddits:
                for query in queries:
                    if not reddit and public_fallback_failures >= 3:
                        break
                    time.sleep(random.uniform(1, 2))
                    for p in _query_sub(sub, query, "relevance"):
                        _add(p, sub)
                logger.info("Searched r/%s: %d queries, %d total posts so far", sub, len(queries), len(results))
                if not reddit and public_fallback_failures >= 3:
                    break

            # Also search r/all for top PW content
            for query in queries[:3]:
                if not reddit and public_fallback_failures >= 3:
                    break
                time.sleep(random.uniform(1, 2))
                for p in _query_sub("all", query, "top"):
                    _add(p)

        await asyncio.get_event_loop().run_in_executor(None, _search)
        logger.info("Reddit search complete: %d unique posts (window: %s)", len(results), tf)
        return results

    async def scrape_and_store_post(
        self, submission_data: dict[str, Any], brand_id: str,
    ) -> dict[str, Any]:
        """Store a Reddit post to reddit_posts + mentions."""
        raw = submission_data.get("raw_data", {})
        published = submission_data.get("published_at")

        post_row = {
            "brand_id": brand_id,
            "post_id": submission_data.get("post_id", raw.get("id", "")),
            "post_title": submission_data.get("content_text", "").split("\n")[0],
            "post_body": "\n".join(submission_data.get("content_text", "").split("\n")[1:]),
            "author_username": submission_data.get("author_handle", ""),
            "subreddit_name": raw.get("subreddit", ""),
            "score": submission_data.get("likes", 0),
            "upvote_ratio": raw.get("upvote_ratio"),
            "num_comments": submission_data.get("comments_count", 0),
            "created_at": published,
            "post_url": submission_data.get("source_url", ""),
            "post_flair": raw.get("flair"),
            "is_self_post": raw.get("is_self", True),
            "awards_received": raw.get("num_awards", 0),
            "raw_data": raw,
        }

        stored_post = {}
        try:
            stored_post = db.insert_reddit_post(post_row)
            logger.info(
                "Stored r/%s post [%+d] %s",
                post_row.get("subreddit_name", "?"),
                post_row.get("score", 0),
                post_row["post_id"],
            )
        except Exception:
            logger.exception("Failed to store Reddit post %s", post_row["post_id"])

        try:
            mention = db.insert_mention({
                "brand_id": brand_id,
                "platform": "reddit",
                "platform_ref_id": stored_post.get("id", ""),
                "content_text": submission_data.get("content_text", ""),
                "content_type": "text",
                "author_handle": submission_data.get("author_handle", ""),
                "engagement_score": submission_data.get("likes", 0),
                "likes": submission_data.get("likes", 0),
                "comments_count": submission_data.get("comments_count", 0),
                "source_url": submission_data.get("source_url", ""),
                "published_at": published,
                "raw_data": raw,
            })
            stored_post["_mention_id"] = mention.get("id")
        except Exception:
            logger.exception("Failed to store mention for Reddit post %s", post_row["post_id"])

        return stored_post

    async def scrape_comments(self, source_url: str, limit: int = 200) -> list[dict[str, Any]]:
        """Scrape comments from a Reddit post via OAuth, with public JSON fallback."""
        raw_permalink = source_url.replace("https://reddit.com", "")
        comments = []
        reddit = _get_reddit_client()

        def _scrape():
            nonlocal comments
            time.sleep(random.uniform(0.5, 1.5))
            raw_comments = _reddit_get_comments_oauth(reddit, source_url, limit=limit) if reddit else []
            if not raw_comments:
                raw_comments = _reddit_get_comments(raw_permalink, limit=limit)
            for c in raw_comments:
                if not c.get("post_id"):
                    c["post_id"] = raw_permalink.split("/comments/")[1].split("/")[0] if "/comments/" in raw_permalink else ""
            comments = raw_comments

        await asyncio.get_event_loop().run_in_executor(None, _scrape)

        if comments:
            try:
                db.insert_reddit_comments_batch(comments)
                logger.info("Stored %d comments for %s", len(comments), source_url.split("/")[-2][:20])
            except Exception:
                logger.exception("Failed to store Reddit comments")

        return comments

    async def run_pipeline(
        self, brand_id: str, keywords: list[str], hashtags: list[str],
        max_posts: int = 50,
        max_comments: int = 100,
        enable_llm_triage: bool = True,
        enable_comment_classification: bool = True,
        after_date: datetime | None = None,
        before_date: datetime | None = None,
        subreddits: list[str] | None = None,
    ) -> dict:
        """
        Full Reddit pipeline with LLM intelligence:
        1. Search subreddits for PW mentions
        2. LLM triage every post (title + body → sentiment, PR risk, severity)
        3. Store posts with intelligence fields
        4. Scrape comments → LLM batch classify
        5. Final synthesis → risk score + recommended action
        6. Geo inference
        """
        params = SearchParams(
            keywords=keywords,
            hashtags=hashtags,
            platforms=["reddit"],
            brand_id=brand_id,
            max_results_per_platform=max_posts,
            after_date=after_date,
            before_date=before_date,
        )
        if subreddits:
            params._reddit_subreddits = subreddits

        search_results = await self.search(params)
        logger.info("Reddit pipeline: %d posts found", len(search_results))
        search_results.sort(key=lambda x: x.get("engagement_score", 0), reverse=True)

        posts_stored = 0
        posts_triaged = 0
        comments_scraped = 0
        comments_classified = 0
        pr_risks_flagged = 0

        for result in search_results:
            raw = result.get("_raw_post", result)
            post_id = result.get("post_id", "")
            title = raw.get("post_title", "") or result.get("content_text", "")
            body = raw.get("post_body", "")
            subreddit = raw.get("subreddit_name", "")
            score = raw.get("score", 0)

            # ── LLM Post Triage ───────────────────────────────
            triage_result = {}
            if enable_llm_triage:
                triage_result = triage_reddit_post(title, body, subreddit, score)
                posts_triaged += 1
                if triage_result.get("is_pr_risk"):
                    logger.warning("REDDIT PR RISK: r/%s [%s] %s — %s",
                        subreddit, triage_result["severity"], triage_result["issue_type"], triage_result["reason"])

            # ── Store post ────────────────────────────────────
            stored = await self.scrape_and_store_post(result, brand_id)
            if stored:
                posts_stored += 1

            # ── Scrape + classify comments ────────────────────
            comment_stats = {"positive": 0, "negative": 0, "neutral": 0, "total": 0}
            if result.get("comments_count", 0) > 0 and max_comments > 0:
                post_comments = await self.scrape_comments(result["source_url"], limit=max_comments)
                comments_scraped += len(post_comments)
                comment_stats["total"] = len(post_comments)

                if enable_comment_classification and post_comments:
                    for batch_start in range(0, len(post_comments), 30):
                        batch = post_comments[batch_start:batch_start + 30]
                        labels = classify_reddit_comments_batch(batch)
                        for idx, label in labels.items():
                            comments_classified += 1
                            comment_stats[label] = comment_stats.get(label, 0) + 1
                            # Update comment in DB
                            cid = batch[idx].get("id") or batch[idx].get("comment_id")
                            if cid:
                                try:
                                    from config.supabase_client import get_service_client
                                    get_service_client().table("reddit_comments").update({"comment_sentiment_label": label}).eq("id", cid).execute()
                                except Exception:
                                    pass

            # ── Final synthesis ────────────────────────────────
            if triage_result:
                synthesis = synthesize_reddit_post(triage_result, comment_stats)
                if synthesis.get("final_is_pr_risk"):
                    pr_risks_flagged += 1

                # Write intelligence fields to reddit_posts
                update_fields = {
                    "post_triage_label": triage_result.get("label"),
                    "post_triage_is_pr_risk": triage_result.get("is_pr_risk", False),
                    "post_triage_confidence": triage_result.get("confidence", 0),
                    "post_triage_issue_type": triage_result.get("issue_type"),
                    "post_triage_severity": triage_result.get("severity"),
                    "post_triage_reason": triage_result.get("reason"),
                    **synthesis,
                }
                if post_id:
                    try:
                        from config.supabase_client import get_service_client
                        get_service_client().table("reddit_posts").update(update_fields).eq("post_id", post_id).execute()
                    except Exception:
                        logger.exception("Failed to update reddit post intelligence for %s", post_id)

        # ── Geo inference ─────────────────────────────────────
        geo_result = {"geo_records_created": 0, "unique_states": 0}
        try:
            from analysis.geo_inference import process_mentions_geo
            geo_result = process_mentions_geo(brand_id)
        except Exception:
            logger.exception("Geo inference failed (non-fatal)")

        summary = {
            "platform": "reddit",
            "brand_id": brand_id,
            "posts_found": len(search_results),
            "posts_stored": posts_stored,
            "posts_triaged": posts_triaged,
            "comments_scraped": comments_scraped,
            "comments_classified": comments_classified,
            "pr_risks_flagged": pr_risks_flagged,
            "geo_records": geo_result.get("geo_records_created", 0),
        }
        logger.info("Reddit pipeline complete: %s", summary)
        return summary


# Register searcher
_scraper = RedditScraper()
register_searcher("reddit", _scraper.search)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Reddit negative PR scraper")
    parser.add_argument("--brand", required=True, help="Brand name to monitor")
    parser.add_argument("--brand-id", help="Existing brand UUID in Supabase")
    parser.add_argument("--keywords", default="",
                        help="Extra search keywords (comma-separated)")
    parser.add_argument("--max-posts", type=int, default=50,
                        help="Max total posts")
    parser.add_argument("--max-comments", type=int, default=50,
                        help="Max comments per post")
    parser.add_argument("--days", type=int, default=0,
                        help="Backfill window in days (0 = no date filter)")
    parser.add_argument("--subreddits", default="",
                        help="Only scrape these subreddits (comma-separated, without r/)")
    args = parser.parse_args()

    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    if not keywords:
        keywords = PW_SEARCH_QUERIES
    subreddits = [s.strip().removeprefix("r/") for s in args.subreddits.split(",") if s.strip()]

    from datetime import timezone, timedelta
    after_date = before_date = None
    if args.days > 0:
        before_date = datetime.now(timezone.utc)
        after_date = before_date - timedelta(days=args.days)

    print(f"{'='*60}")
    print(f"  Reddit Negative PR Detection")
    print(f"{'='*60}")
    print(f"  Subreddits:   {', '.join(subreddits or PW_SUBREDDITS)}")
    print(f"  Queries:      {len(keywords)}")
    print(f"  Max posts:    {args.max_posts}")
    print(f"  Max comments: {args.max_comments}/post")
    print(f"  Window:       {f'last {args.days}d' if args.days > 0 else 'all time'}")
    print(f"{'='*60}")
    print()

    brand_id = args.brand_id
    if not brand_id:
        brand = db.upsert_brand({
            "name": args.brand,
            "keywords": keywords[:5],
            "platforms": ["reddit"],
        })
        brand_id = brand["id"]
        print(f"Brand '{args.brand}' -> {brand_id}")

    loop = asyncio.new_event_loop()
    scraper = RedditScraper()
    try:
        result = loop.run_until_complete(scraper.run_pipeline(
            brand_id=brand_id,
            keywords=keywords,
            hashtags=[],
            max_posts=args.max_posts,
            max_comments=args.max_comments,
            after_date=after_date,
            before_date=before_date,
            subreddits=subreddits or None,
        ))
    finally:
        loop.close()

    print(f"\n{'='*60}")
    print(f"  RESULTS")
    print(f"{'='*60}")
    print(f"  Posts found:      {result['posts_found']}")
    print(f"  Posts stored:     {result['posts_stored']}")
    print(f"  Comments scraped: {result['comments_scraped']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
