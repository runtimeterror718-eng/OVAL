"""
Parse and validate search parameters from user input.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from config.constants import FULFILLMENT_DEFAULT_LANGUAGES, PLATFORMS


def _to_utc(dt: datetime | None) -> datetime | None:
    """Coerce a datetime to timezone-aware UTC (naive is assumed UTC)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def in_window(
    published_at: datetime | str | None,
    after_date: datetime | None,
    before_date: datetime | None,
) -> bool:
    """True if ``published_at`` falls within [after_date, before_date].

    Used by scrapers to apply an exact date-window filter on top of whatever
    coarse filter the upstream API supports. Items with an unparseable or
    missing date are kept (we can't prove they're out of range).
    """
    if after_date is None and before_date is None:
        return True
    if isinstance(published_at, str):
        try:
            published_at = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        except ValueError:
            return True
    if not isinstance(published_at, datetime):
        return True
    published_at = _to_utc(published_at)
    if after_date and published_at < _to_utc(after_date):
        return False
    if before_date and published_at > _to_utc(before_date):
        return False
    return True


def reddit_time_filter(after_date: datetime | None) -> str:
    """Map an ``after_date`` to Reddit's coarsest covering time bucket.

    Reddit search has no exact date range — only hour/day/week/month/year/all.
    Pick the smallest bucket that still covers the requested lookback, then
    rely on ``in_window`` for the exact cut.
    """
    if after_date is None:
        return "year"
    days = (datetime.now(timezone.utc) - _to_utc(after_date)).days
    if days <= 1:
        return "day"
    if days <= 7:
        return "week"
    if days <= 31:
        return "month"
    if days <= 366:
        return "year"
    return "all"


@dataclass
class SearchParams:
    """Validated search parameters for multi-platform search."""

    keywords: list[str] = field(default_factory=list)
    hashtags: list[str] = field(default_factory=list)
    platforms: list[str] = field(default_factory=lambda: list(PLATFORMS))
    min_likes: int = 0
    min_shares: int = 0
    min_comments: int = 0
    after_date: datetime | None = None
    before_date: datetime | None = None
    languages: list[str] = field(
        default_factory=lambda: list(FULFILLMENT_DEFAULT_LANGUAGES)
    )
    brand_id: str | None = None
    max_results_per_platform: int = 100

    @classmethod
    def last_n_days(cls, n: int, **kwargs) -> "SearchParams":
        """Build params with a date window covering the last ``n`` days."""
        now = datetime.now(timezone.utc)
        return cls(
            after_date=now - timedelta(days=n),
            before_date=now,
            **kwargs,
        )

    def __post_init__(self):
        # Normalize hashtags
        self.hashtags = [
            h if h.startswith("#") else f"#{h}" for h in self.hashtags
        ]
        # Validate platforms
        self.platforms = [p for p in self.platforms if p in PLATFORMS]
        if not self.platforms:
            self.platforms = list(PLATFORMS)


def build_search_params(raw: dict) -> SearchParams:
    """Build a SearchParams from a raw dict (e.g. from API request)."""
    after = raw.get("after_date")
    before = raw.get("before_date")

    return SearchParams(
        keywords=raw.get("keywords", []),
        hashtags=raw.get("hashtags", []),
        platforms=raw.get("platforms", list(PLATFORMS)),
        min_likes=int(raw.get("min_likes", 0)),
        min_shares=int(raw.get("min_shares", 0)),
        min_comments=int(raw.get("min_comments", 0)),
        after_date=datetime.fromisoformat(after) if isinstance(after, str) else after,
        before_date=datetime.fromisoformat(before) if isinstance(before, str) else before,
        languages=raw.get("languages", list(FULFILLMENT_DEFAULT_LANGUAGES)),
        brand_id=raw.get("brand_id"),
        max_results_per_platform=int(raw.get("max_results_per_platform", 100)),
    )
