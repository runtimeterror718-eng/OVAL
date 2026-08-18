"""
SEO + News scraper — Google News RSS, SERP, long-tail keyword tracking.

Owner: Team A
Libraries: feedparser, trafilatura
Auth: None for RSS | Text-only (no transcription needed)
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote_plus

import feedparser
import trafilatura

from scrapers.base import BaseScraper
from search.engine import register_searcher
from search.filters import SearchParams, in_window

logger = logging.getLogger(__name__)


def _parse_rss_date(published: str | None) -> datetime | None:
    """Parse an RSS pubDate (RFC 822, e.g. 'Thu, 21 May 2026 07:00:00 GMT')."""
    if not published:
        return None
    from email.utils import parsedate_to_datetime

    try:
        return parsedate_to_datetime(published)
    except (TypeError, ValueError):
        return None


class SEONewsScraper(BaseScraper):
    platform = "seo_news"

    async def search(self, params: SearchParams) -> list[dict[str, Any]]:
        """Search Google News RSS + extract article text."""
        import asyncio

        query = " ".join(params.keywords)
        # Google News RSS honors the after:/before: query operators (YYYY-MM-DD),
        # giving a real date window instead of just "latest news".
        if params.after_date:
            query += f" after:{params.after_date.date().isoformat()}"
        if params.before_date:
            query += f" before:{params.before_date.date().isoformat()}"
        rss_url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en"
        results = []

        def _fetch():
            feed = feedparser.parse(rss_url)
            for entry in feed.entries[: params.max_results_per_platform]:
                # Exact-window guard in case RSS returns out-of-range entries.
                published = entry.get("published")
                published_dt = _parse_rss_date(published)
                if published and not in_window(published_dt, params.after_date, params.before_date):
                    continue
                # Extract full article text
                full_text = ""
                try:
                    downloaded = trafilatura.fetch_url(entry.link)
                    if downloaded:
                        full_text = trafilatura.extract(downloaded) or ""
                except Exception:
                    logger.debug("Could not extract text from %s", entry.link)

                results.append({
                    "content_text": full_text or entry.get("summary", entry.get("title", "")),
                    "content_type": "text",
                    "author_handle": entry.get("author", ""),
                    "author_name": entry.get("source", {}).get("title", ""),
                    "engagement_score": 0,
                    "likes": 0,
                    "shares": 0,
                    "comments_count": 0,
                    "source_url": entry.get("link", ""),
                    # Normalize to ISO-8601 so the unified mentions table and
                    # fulfillment's datetime.fromisoformat() stay consistent.
                    "published_at": published_dt.isoformat() if published_dt else None,
                    "language": "en",
                    "raw_data": dict(entry),
                })

        await asyncio.get_event_loop().run_in_executor(None, _fetch)
        return results

    async def scrape_comments(self, source_url: str, limit: int = 200) -> list[dict[str, Any]]:
        """News articles typically don't have accessible comments."""
        return []

    async def track_keywords(self, keywords: list[str]) -> list[dict[str, Any]]:
        """Track long-tail keyword rankings (lightweight SERP check)."""
        import asyncio

        tracking = []

        def _track():
            for kw in keywords:
                rss_url = f"https://news.google.com/rss/search?q={quote_plus(kw)}&hl=en"
                feed = feedparser.parse(rss_url)
                tracking.append({
                    "keyword": kw,
                    "result_count": len(feed.entries),
                    "top_sources": [
                        e.get("source", {}).get("title", "") for e in feed.entries[:5]
                    ],
                })

        await asyncio.get_event_loop().run_in_executor(None, _track)
        return tracking


_scraper = SEONewsScraper()
register_searcher("seo_news", _scraper.search)
