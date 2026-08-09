from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from scrapers.reddit import _reddit_oauth_new_since


def _submission(post_id: str, created_at: datetime):
    return SimpleNamespace(
        id=post_id,
        created_utc=created_at.timestamp(),
        subreddit="PhysicsWallah",
        permalink=f"/r/PhysicsWallah/comments/{post_id}/test/",
        url="https://example.com",
        title=f"Post {post_id}",
        selftext="Physics Wallah",
        author="student",
        score=1,
        num_comments=0,
        upvote_ratio=1,
        is_self=True,
        total_awards_received=0,
        link_flair_text=None,
    )


class _Subreddit:
    def __init__(self, submissions):
        self.submissions = submissions
        self.requested_limit = None

    def new(self, limit):
        self.requested_limit = limit
        yield from self.submissions


class _Reddit:
    def __init__(self, listing):
        self.listing = listing

    def subreddit(self, name):
        assert name == "PhysicsWallah"
        return self.listing


def test_reddit_new_backfill_applies_exact_window_and_stops_at_cutoff():
    now = datetime.now(timezone.utc)
    listing = _Subreddit([
        _submission("future", now + timedelta(days=1)),
        _submission("recent", now - timedelta(days=10)),
        _submission("boundary", now - timedelta(days=60)),
        _submission("old", now - timedelta(days=61)),
        _submission("never-read", now - timedelta(days=20)),
    ])

    posts = _reddit_oauth_new_since(
        _Reddit(listing),
        "PhysicsWallah",
        after_date=now - timedelta(days=60),
        before_date=now,
    )

    assert [post["post_id"] for post in posts] == ["recent", "boundary"]
    assert listing.requested_limit == 1000

