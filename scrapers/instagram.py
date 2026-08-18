"""
Instagram scraper — negative PR detection engine.

Owner: Team A

Pipeline:
  1. Scrape ecosystem accounts (competitors, meme pages, trolls, own brand)
  2. Filter: keep only videos/reels whose caption/hashtags/title mention PW
  3. For shortlisted posts → scrape comments (to find negative sentiment in replies)
  4. Store posts + comments to Supabase for analysis pipeline

Tables: instagram_posts, instagram_comments, mentions

Usage:
    python -m scrapers.instagram --brand "PhysicsWallah" --mode ecosystem --max-posts 30
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import instaloader

from scrapers.base import BaseScraper
from search.engine import register_searcher
from search.filters import SearchParams
from storage import queries as db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Proxy Pool — rotating residential proxies
# ---------------------------------------------------------------------------

# Decodo (Smartproxy) Indian residential proxies — each port = different residential IP
# Uses http:// CONNECT tunnel (traffic to IG is still HTTPS end-to-end)
# Set DECODO_USER and DECODO_PASS in secrets/.env.keys
_DECODO_USER = os.environ.get("DECODO_USER", "")
_DECODO_PASS = os.environ.get("DECODO_PASS", "")
_DECODO_HOST = os.environ.get("DECODO_HOST", "in.decodo.com")
PROXY_LIST = (
    [f"http://{_DECODO_USER}:{_DECODO_PASS}@{_DECODO_HOST}:{p}" for p in range(10001, 10011)]
    if _DECODO_USER and _DECODO_PASS
    else []
)


class ProxyPool:
    """Round-robin proxy rotation."""

    def __init__(self, proxies: list[str] | None = None):
        self._proxies = proxies or PROXY_LIST
        self._idx = 0
        self._lock = threading.Lock()

    def next(self) -> str:
        with self._lock:
            if not self._proxies:
                return ""  # no proxy configured → caller falls back to direct route
            proxy = self._proxies[self._idx % len(self._proxies)]
            self._idx += 1
            return proxy

    def random(self) -> str:
        return random.choice(self._proxies) if self._proxies else ""


_proxy_pool = ProxyPool()


# ---------------------------------------------------------------------------
# Ecosystem accounts to monitor
# ---------------------------------------------------------------------------

# ── Layer 1: Known Source Accounts (80+) ──────────────────────

# Own brand — all official PW Instagram accounts
OWN_BRAND_ACCOUNTS = [
    "physicswallah",               # Main brand (13M+ followers)
    "pw.live",                     # Platform account
    "pwvidyapeeth",                # Offline centres
    "alaboratory",                 # Alakh Pandey personal
    "pwians",                      # Student community
    "pw_faculties",                # Faculty showcase
    "competitionwallah",           # Comp exam vertical
    "jeewallah",                   # JEE vertical
    "neetwallah",                  # NEET vertical
    "pwskills.tech",               # PW Skills (upskilling)
]

# Competitors — official accounts that may post shade/comparisons
COMPETITOR_ACCOUNTS = [
    "unacademy",                   # Unacademy
    "allen_career_institute",      # Allen
    "competishun",                 # Competishun
    "etoosindia",                  # Etoos
    "vedantu",                     # Vedantu
    "aakash_institute",            # Aakash
    "byjus",                       # BYJU'S
    "motion_education",            # Motion Kota
]

# Ex-PW teachers who left and now run rival channels / post criticism
EX_PW_ACCOUNTS = [
    "sankalp_bharat",              # Tarun Kumar, Manish Dubey, Sarvesh Dixit — left PW
    "tarun_kumar_physics",         # Ex-PW teacher, bribery allegations drama
    "udaan.companions",            # Posted "Reality of Physics Wallah Fraud" viral reel
    "keep_crushing",               # Jyotiprasad Panigrahi — edtech commentary, PW criticism
    "manish.dubey.chemistry",      # Ex-PW chemistry teacher
    "sarvesh_dixit_physics",       # Ex-PW physics teacher
]

# Edtech news / meme / commentary accounts that cover PW controversies
ECOSYSTEM_ACCOUNTS = [
    "physicswallah.vs.unacademy",  # Fan comparison account
    "kota_factory_memes",          # JEE/NEET meme page — PW quality memes
    "neet_jee_aspirants",          # Student aspirant page — PW reviews/rants
    "neonmannews",                 # News — PW CEO wedding, IPO, controversies
    "inc42",                       # Startup news — "Can PW Fix Its Teacher Problem?"
    "storyboard18",                # Brand news — PW Kashmir FIR
    "businessinsider_in",          # Business news covering PW
    "yourstory_in",                # Startup media
    "entrackr",                    # Edtech tracking
    "the_edtech_review",           # Edtech reviews
]

# Student influencers — 10K-100K followers, review PW content
STUDENT_INFLUENCER_ACCOUNTS = [
    "neet_motivation_daily",       # NEET motivation + PW content
    "jee_neet_memes_official",     # JEE/NEET memes
    "iit_jee_motivation",          # JEE motivation
    "kota_life_official",          # Kota coaching life
    "neet_warriors_2026",          # NEET aspirants
    "edtech_truth",                # Edtech reviews
    "coaching_comparison",         # Coaching comparison reels
    "pw_batch_review",             # PW batch reviews
    "alakh_sir_fan_page",          # Alakh fan page
    "physicswallah_fan",           # PW fan content
    "pw_vidyapeeth_students",      # Vidyapeeth student reviews
    "kota_factory_edits",          # Kota edits
    "jee_neet_reality",            # Exam reality content
    "student_voice_india",         # Student opinions
]

# ── Layer 2: Hashtag Radar ────────────────────────────────────

# Hashtags to scrape feeds for (catches posts from unknown accounts)
MONITORED_HASHTAGS = [
    "physicswallah",               # Main brand
    "pw",                          # Short brand
    "alakhpandey",                 # Founder
    "pwscam",                      # Negative signal
    "pwexposed",                   # Negative signal
    "physicswallahreview",         # Review content
    "pwvidyapeeth",                # Offline centre reviews
    "arjunabatch",                 # Batch reviews
    "pwskills",                    # Skills vertical
    "pwians",                      # Student community
    "pwcontroversy",               # Controversy
    "physicswallahfraud",          # Fraud allegations
    "pwrefund",                    # Refund complaints
    "pwteachers",                  # Teacher content
    # "jeeneetmemes" removed — too broad, attracts unrelated meme/crush/love posts
    # that students spam with generic hashtags for reach
]

# Keywords to detect PW mentions in captions (case-insensitive)
PW_MENTION_KEYWORDS = [
    # Brand names
    "physicswallah", "physics wallah", "physics wala",
    "alakh pandey", "alakhpandey", "alakh sir",
    # Products
    "pw app", "pw vidyapeeth", "pw centre",
    "lakshya batch", "arjuna batch", "yakeen batch", "prayas batch",
    # Negative PR signals
    "pw scam", "pw fraud", "pw exposed", "pw controversy",
    "pw quality", "pw teachers", "pw downfall", "pw layoffs",
    "pw data leak", "pw data breach", "pw refund",
    "pw bribe", "pw bribery", "pw fired", "pw terminated",
    # Kashmir ad controversy
    "pw kashmir", "pw fir", "pw toofan", "baderkote",
    # Teacher exodus
    "sankalp", "left pw", "quit pw", "resigned pw",
    # Casteist slur controversy
    "casteist", "chor chamar", "rishi jain pw",
    # IPO criticism
    "pw ipo", "pw unpaid", "pw salary",
]

PW_MENTION_HASHTAGS = [
    "physicswallah", "pw", "pwians", "alakhpandey",
    "pwscam", "pwexposed", "physicswallahexposed",
    "pwcontroversy", "pwfraud", "pwdataleak",
    "sankalp", "pwteachers",
]

# Hashtags that clearly indicate non-PW content — reject posts containing these
# even if they pass the PW mention check (e.g. via #pw being spammed for reach)
BLOCKLIST_HASHTAGS: frozenset[str] = frozenset({
    # Relationship / crush content
    "flames", "crushedits", "crushes", "crush", "crushgoals",
    "crushstory", "proposalday", "lovequotes", "dil", "ishq",
    "pyaar", "mohabbat", "boyfriend", "girlfriend", "bae",
    # Generic viral/entertainment spam (not educational)
    "trendingreels", "trendingsongs", "explorepage", "exploremore",
    "viralreels", "viralvideo", "reelsviral", "reelsindia",
    "feelsvideo", "sadreels", "sadstatus", "lovesongs",
    "followforfollow", "likeforlike", "f4f", "l4l",
    # Unrelated meme/entertainment
    "memesdaily", "funnyvideos", "comedy", "dankмемы",
})


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class ScraperConfig:
    min_delay: float = 2.0
    max_delay: float = 5.0
    max_retries: int = 3
    session_ttl: int = 3600
    max_accounts: int = 5
    max_pages: int = 5
    items_per_page: int = 33


# ---------------------------------------------------------------------------
# Adaptive Rate Limiter
# ---------------------------------------------------------------------------

class AdaptiveRateLimiter:
    def __init__(self, min_delay: float = 2.0, max_delay: float = 5.0):
        self._min_delay = min_delay
        self._max_delay = max_delay
        self._current_delay = min_delay
        self._last_request = 0.0
        self._lock = threading.Lock()

    def wait(self):
        with self._lock:
            now = time.time()
            elapsed = now - self._last_request
            jitter = random.uniform(0, self._current_delay * 0.3)
            wait_time = max(0, self._current_delay + jitter - elapsed)
            if wait_time > 0:
                time.sleep(wait_time)
            self._last_request = time.time()

    def report_success(self):
        with self._lock:
            self._current_delay = max(self._min_delay, self._current_delay * 0.9)

    def report_error(self, is_rate_limit: bool = False):
        with self._lock:
            if is_rate_limit:
                self._current_delay = min(60.0, self._current_delay * 3)
            else:
                self._current_delay = min(self._max_delay * 2, self._current_delay * 1.5)


# ---------------------------------------------------------------------------
# Session Pool
# ---------------------------------------------------------------------------

@dataclass
class IGSession:
    username: str
    cookies: dict
    created_at: float
    is_healthy: bool = True
    error_count: int = 0


class SessionPool:
    def __init__(self, config: ScraperConfig):
        self._config = config
        self._sessions: list[IGSession] = []
        self._lock = threading.Lock()
        self._current_idx = 0
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            accounts = []
            primary_user = os.environ.get("IG_USERNAME", "")
            primary_pass = os.environ.get("IG_PASSWORD", "")
            if primary_user and primary_pass:
                accounts.append((primary_user, primary_pass))
            for i in range(2, self._config.max_accounts + 1):
                u = os.environ.get(f"IG_USERNAME_{i}", "")
                p = os.environ.get(f"IG_PASSWORD_{i}", "")
                if u and p:
                    accounts.append((u, p))
            for username, password in accounts:
                session = self._create_session(username, password)
                if session:
                    self._sessions.append(session)
            logger.info("IG session pool: %d active session(s)", len(self._sessions))
            self._initialized = True

    def _create_session(self, username: str, password: str) -> Optional[IGSession]:
        L = instaloader.Instaloader()
        session_dir = os.path.join(os.path.dirname(__file__), "..", "secrets")
        session_file = os.path.join(session_dir, f"instaloader-session-{username}")
        try:
            L.load_session_from_file(username, session_file)
            logger.info("Loaded saved session for @%s", username)
        except Exception:
            logger.info("Logging in as @%s ...", username)
            try:
                L.login(username, password)
                L.save_session_to_file(session_file)
                logger.info("Login successful for @%s", username)
            except Exception as e:
                logger.error("Login failed for @%s: %s", username, e)
                return None
        cookies = L.context._session.cookies.get_dict()
        return IGSession(username=username, cookies=cookies, created_at=time.time())

    def get_session(self) -> Optional[IGSession]:
        self.initialize()
        with self._lock:
            healthy = [s for s in self._sessions if s.is_healthy]
            if not healthy:
                for s in self._sessions:
                    s.is_healthy = True
                    s.error_count = 0
                healthy = self._sessions
            if not healthy:
                return None
            self._current_idx = self._current_idx % len(healthy)
            session = healthy[self._current_idx]
            self._current_idx += 1
            return session

    def report_failure(self, session: IGSession):
        with self._lock:
            session.error_count += 1
            if session.error_count >= 3:
                session.is_healthy = False

    def report_success(self, session: IGSession):
        with self._lock:
            session.error_count = 0
            session.is_healthy = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_auth_headers(session: IGSession) -> dict:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
        "Cookie": "; ".join(f"{k}={v}" for k, v in session.cookies.items()),
    }
    if "csrftoken" in session.cookies:
        headers["X-CSRFToken"] = session.cookies["csrftoken"]
    return headers


def _parse_api_media(item: dict, source_account: str = "") -> dict[str, Any]:
    """Parse a media item from the v1 feed API."""
    shortcode = item.get("code", "")
    caption_data = item.get("caption") or {}
    caption_text = caption_data.get("text", "") if isinstance(caption_data, dict) else ""
    hashtags = re.findall(r"#(\w+)", caption_text)
    duration = item.get("video_duration", 0) or 0

    views = item.get("play_count", 0) or item.get("view_count", 0) or 0
    likes = item.get("like_count", 0) or 0
    comments = item.get("comment_count", 0) or 0

    media_type = item.get("media_type", 1)
    product_type = item.get("product_type", "")
    type_map = {1: "image", 2: "video", 8: "carousel"}
    content_type = "reel" if product_type == "clips" else type_map.get(media_type, "image")

    thumbnail = ""
    image_versions = item.get("image_versions2", {}).get("candidates", [])
    if image_versions:
        thumbnail = image_versions[0].get("url", "")

    taken_at = item.get("taken_at", 0)
    published_date = None
    if taken_at:
        published_date = datetime.fromtimestamp(taken_at, tz=timezone.utc).isoformat()

    user = item.get("user", {})

    return {
        "post_id": shortcode or str(item.get("pk", "")),
        "account_name": user.get("username", ""),
        "caption_text": caption_text,
        "like_count": likes,
        "comment_count": comments,
        "media_type": content_type,
        "published_date": published_date,
        "hashtags": hashtags,
        "post_url": f"https://www.instagram.com/{'reel' if content_type == 'reel' else 'p'}/{shortcode}/",
        "video_views": views,
        "reel_plays": views if content_type == "reel" else 0,
        "video_duration": round(duration),
        "thumbnail_url": thumbnail,
        "raw_data": {
            "pk": str(item.get("pk", "")),
            "code": shortcode,
            "media_type": media_type,
            "product_type": product_type,
            "source_account": source_account,
            "user_id": str(user.get("pk", "")),
        },
    }


def _parse_web_profile_node(node: dict, source_account: str = "") -> dict[str, Any]:
    """Parse a timeline node from web_profile_info into our standard format.

    web_profile_info uses GraphQL field names (edge_*, *_timestamp) rather than
    the v1 feed API names, so it needs its own parser.
    """
    shortcode = node.get("shortcode", "")
    cap_edges = node.get("edge_media_to_caption", {}).get("edges", [])
    caption_text = cap_edges[0]["node"]["text"] if cap_edges else ""
    hashtags = re.findall(r"#(\w+)", caption_text)

    is_video = node.get("is_video", False)
    product_type = node.get("product_type", "")
    typename = node.get("__typename", "")
    if product_type == "clips" or typename == "GraphSidecar" and is_video:
        content_type = "reel" if product_type == "clips" else "video"
    elif typename == "GraphSidecar":
        content_type = "carousel"
    elif is_video:
        content_type = "video"
    else:
        content_type = "image"

    views = node.get("video_view_count", 0) or 0
    likes = node.get("edge_liked_by", {}).get("count", 0) or node.get("edge_media_preview_like", {}).get("count", 0) or 0
    comments = node.get("edge_media_to_comment", {}).get("count", 0) or 0

    taken_at = node.get("taken_at_timestamp", 0) or 0
    published_date = (
        datetime.fromtimestamp(taken_at, tz=timezone.utc).isoformat() if taken_at else None
    )
    owner = node.get("owner", {})

    return {
        "post_id": shortcode or str(node.get("id", "")),
        "account_name": owner.get("username", "") or source_account,
        "caption_text": caption_text,
        "like_count": likes,
        "comment_count": comments,
        "media_type": content_type,
        "published_date": published_date,
        "hashtags": hashtags,
        "post_url": f"https://www.instagram.com/{'reel' if content_type == 'reel' else 'p'}/{shortcode}/",
        "video_views": views,
        "reel_plays": views if content_type == "reel" else 0,
        "video_duration": round(node.get("video_duration", 0) or 0),
        "thumbnail_url": node.get("display_url", ""),
        "raw_data": {
            "pk": str(node.get("id", "")),
            "code": shortcode,
            "source_account": source_account,
            "user_id": str(owner.get("id", "")),
            "source": "web_profile_info",
        },
    }


def _scrape_profile_direct(
    username: str,
    max_posts: int = 30,
    after_ts: float | None = None,
    before_ts: float | None = None,
) -> list[dict[str, Any]]:
    """Direct (no-proxy) fallback: pull recent posts from web_profile_info.

    Used when the proxied v1 feed API is blocked (e.g. proxy auth 407). Returns
    the ~12 most recent timeline posts IG embeds in the profile payload, filtered
    to the date window. Uses exponential backoff for transient blocks.
    """
    from scrapers.base import fetch_with_backoff

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
    }
    resp = fetch_with_backoff(
        "https://www.instagram.com/api/v1/users/web_profile_info/",
        params={"username": username}, headers=headers, label=f"ig-direct@{username}",
    )
    if resp is None or resp.status_code != 200:
        logger.warning(
            "IG direct fallback failed for @%s (%s)",
            username, resp.status_code if resp else "no-response",
        )
        return []

    try:
        user = resp.json()["data"]["user"]
    except (KeyError, ValueError, TypeError):
        logger.warning("IG direct fallback: unexpected payload for @%s", username)
        return []

    edges = user.get("edge_owner_to_timeline_media", {}).get("edges", [])
    posts: list[dict[str, Any]] = []
    for edge in edges:
        node = edge.get("node", {})
        taken_at = node.get("taken_at_timestamp", 0) or 0
        if after_ts is not None and taken_at and taken_at < after_ts:
            continue
        if before_ts is not None and taken_at and taken_at > before_ts:
            continue
        posts.append(_parse_web_profile_node(node, source_account=username))
        if len(posts) >= max_posts:
            break

    logger.info("Scraped @%s via direct fallback: %d posts", username, len(posts))
    return posts


def _caption_mentions_pw(caption: str, hashtags: list[str]) -> bool:
    """Check if caption/hashtags mention PW in any form.

    Returns False immediately if the post contains blocklisted hashtags that
    clearly signal non-PW content (crush/love/viral entertainment spam).
    """
    lower_tags = [h.lower() for h in hashtags]

    # Reject posts whose hashtags clearly signal unrelated content
    if any(tag in BLOCKLIST_HASHTAGS for tag in lower_tags):
        return False

    text = caption.lower()
    for kw in PW_MENTION_KEYWORDS:
        if kw.lower() in text:
            return True
    for tag in PW_MENTION_HASHTAGS:
        if tag.lower() in lower_tags:
            return True
    return False


# ---------------------------------------------------------------------------
# curl_cffi session — Chrome TLS fingerprint impersonation
# This is the key to bypassing IG's JA3 fingerprint detection.
# ---------------------------------------------------------------------------

def _make_ig_session(proxy: str):
    """Create a curl_cffi session that looks like Chrome to Instagram."""
    from curl_cffi import requests as cffi_requests
    session = cffi_requests.Session(impersonate="chrome")
    session.proxies = {"https": proxy, "http": proxy}
    return session


IG_HEADERS = {
    "X-IG-App-ID": "936619743392459",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "*/*",
}


def _get_user_id_cffi(username: str, session) -> str:
    """Get IG user ID via web_profile_info (Chrome-impersonated)."""
    resp = session.get(
        f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}",
        headers=IG_HEADERS, timeout=15,
    )
    if resp.status_code == 404:
        return ""
    resp.raise_for_status()
    return resp.json().get("data", {}).get("user", {}).get("id", "")


# ---------------------------------------------------------------------------
# Step 1: Scrape profiles via v1 feed API + curl_cffi (Chrome fingerprint)
# ---------------------------------------------------------------------------

def _scrape_profile(
    username: str,
    rate_limiter: AdaptiveRateLimiter,
    max_posts: int = 30,
    after_ts: float | None = None,
    before_ts: float | None = None,
) -> list[dict[str, Any]]:
    """Scrape recent posts from a profile via IG's v1 feed API.

    Uses curl_cffi (Chrome TLS fingerprint) + Indian residential proxy.
    This combination bypasses all layers of IG's anti-bot detection.

    When ``after_ts`` is set, the feed (newest-first) is paginated until a post
    older than the window is seen, then stops. Posts outside [after_ts,
    before_ts] are dropped. ``max_posts`` still caps total returned posts.
    """
    proxy = _proxy_pool.next()
    # No proxy configured → skip the proxied path entirely and use the direct route.
    if not proxy:
        logger.info("No proxy configured; using direct route for @%s", username)
        return _scrape_profile_direct(username, max_posts=max_posts, after_ts=after_ts, before_ts=before_ts)

    proxy_label = proxy.split("@")[1] if "@" in proxy else proxy
    logger.info("Using proxy %s for @%s", proxy_label, username)

    session = _make_ig_session(proxy)

    # Step 1: Get user ID
    try:
        user_id = _get_user_id_cffi(username, session)
        if not user_id:
            logger.warning("Profile @%s not found (404), skipping", username)
            return []
        logger.info("Profile @%s loaded: user_id=%s", username, user_id)
    except Exception as e:
        # Proxy dead / blocked (e.g. 407) — fall back to the direct, proxy-less
        # web_profile_info route, which also carries recent timeline posts.
        logger.warning("Proxied route failed for @%s (%s); trying direct fallback", username, e)
        return _scrape_profile_direct(username, max_posts=max_posts, after_ts=after_ts, before_ts=before_ts)

    # Step 2: Paginate through the feed
    posts = []
    max_id = ""
    pages = 0
    # A date window may need deeper pagination than the default recent-posts cap.
    max_pages = 20 if after_ts is not None else 5
    reached_window_end = False

    while len(posts) < max_posts and pages < max_pages and not reached_window_end:
        rate_limiter.wait()

        params = {"count": "33"}
        if max_id:
            params["max_id"] = max_id

        try:
            resp = session.get(
                f"https://www.instagram.com/api/v1/feed/user/{user_id}/",
                headers=IG_HEADERS, params=params, timeout=15,
            )

            if resp.status_code in (401, 403, 429):
                rate_limiter.report_error(is_rate_limit=resp.status_code == 429)
                logger.warning("Feed API %d for @%s, stopping", resp.status_code, username)
                break

            resp.raise_for_status()
            rate_limiter.report_success()

            data = resp.json()
            items = data.get("items", [])
            if not items:
                break

            for item in items:
                taken_at = item.get("taken_at", 0) or 0
                # Feed is newest-first: once we drop below the window start,
                # every subsequent post is older — stop paginating.
                if after_ts is not None and taken_at and taken_at < after_ts:
                    reached_window_end = True
                    break
                if before_ts is not None and taken_at and taken_at > before_ts:
                    continue  # too new (pinned/future-dated) — skip but keep going
                parsed = _parse_api_media(item, source_account=username)
                posts.append(parsed)
                if len(posts) >= max_posts:
                    break

            pages += 1
            if not data.get("more_available") or not data.get("next_max_id"):
                break
            max_id = str(data["next_max_id"])

        except Exception as e:
            rate_limiter.report_error()
            logger.warning("Feed API error for @%s: %s", username, e)
            break

    # If the proxied feed yielded nothing (soft block), try the direct route.
    if not posts:
        logger.info("Proxied feed empty for @%s; trying direct fallback", username)
        return _scrape_profile_direct(username, max_posts=max_posts, after_ts=after_ts, before_ts=before_ts)

    logger.info("Scraped @%s: %d posts (via %s)", username, len(posts), proxy_label)
    return posts


# ---------------------------------------------------------------------------
# Step 3: Scrape comments via v1 API + curl_cffi
# ---------------------------------------------------------------------------

def _load_ig_cookies() -> dict:
    """Load IG auth cookies from .ig-cookies.json if available."""
    cookie_file = os.path.join(os.path.dirname(__file__), "..", "secrets", "ig-cookies.json")
    if os.path.exists(cookie_file):
        import json as _json
        with open(cookie_file) as f:
            cookies = _json.load(f)
        if cookies.get("sessionid"):
            return cookies
    return {}


def _scrape_comments(
    post_shortcode: str,
    media_pk: str,
    rate_limiter: AdaptiveRateLimiter,
    max_comments: int = 50,
) -> list[dict[str, Any]]:
    """Scrape comments for a post via IG's v1 comment API.

    Requires authenticated session cookies (.ig-cookies.json with valid sessionid).
    Without auth, comments API returns HTML redirect — will return empty list.
    """
    if not media_pk:
        return []

    auth_cookies = _load_ig_cookies()
    if not auth_cookies:
        logger.debug("No auth cookies for comments — skipping %s", post_shortcode)
        return []

    proxy = _proxy_pool.next()
    session = _make_ig_session(proxy)

    # Set auth cookies
    for k, v in auth_cookies.items():
        if v:
            session.cookies.set(k, v, domain=".instagram.com")

    headers = dict(IG_HEADERS)
    if auth_cookies.get("csrftoken"):
        headers["X-CSRFToken"] = auth_cookies["csrftoken"]

    rate_limiter.wait()
    comments = []

    try:
        resp = session.get(
            f"https://www.instagram.com/api/v1/media/{media_pk}/comments/",
            headers=headers,
            params={"can_support_threading": "true", "permalink_enabled": "false"},
            timeout=15,
        )

        if resp.status_code in (401, 403, 429):
            rate_limiter.report_error(is_rate_limit=resp.status_code == 429)
            return []

        resp.raise_for_status()

        # Check if response is JSON (not HTML redirect)
        if not resp.text or not resp.text.strip().startswith("{"):
            return []

        rate_limiter.report_success()

        import json as _json
        data = _json.loads(resp.text)
        for c in data.get("comments", [])[:max_comments]:
            comments.append({
                "post_id": post_shortcode,
                "comment_text": c.get("text", ""),
                "comment_author": c.get("user", {}).get("username", ""),
                "comment_date": (
                    datetime.fromtimestamp(c["created_at"], tz=timezone.utc).isoformat()
                    if c.get("created_at")
                    else None
                ),
            })

    except Exception as e:
        rate_limiter.report_error()
        logger.warning("Comment scrape failed for %s: %s", post_shortcode, e)

    if comments:
        logger.info("Comments for %s: %d scraped", post_shortcode, len(comments))
    return comments


# ---------------------------------------------------------------------------
# Layer 3: LLM Intelligence (Azure GPT-5.4 / OpenAI GPT-4o-mini fallback)
# ---------------------------------------------------------------------------

def _get_llm_client():
    """Get Azure OpenAI or regular OpenAI client."""
    from config.settings import (
        AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_VERSION,
        AZURE_OPENAI_DEPLOYMENT_GPT54, AZURE_OPENAI_DEPLOYMENT_GPT53,
        AZURE_OPENAI_DEPLOYMENT_GPT52, OPENAI_API_KEY, OPENAI_MODEL,
    )
    deployment = AZURE_OPENAI_DEPLOYMENT_GPT54 or AZURE_OPENAI_DEPLOYMENT_GPT53 or AZURE_OPENAI_DEPLOYMENT_GPT52
    if AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT and deployment:
        from openai import AzureOpenAI
        return AzureOpenAI(api_key=AZURE_OPENAI_API_KEY, api_version=AZURE_OPENAI_API_VERSION, azure_endpoint=AZURE_OPENAI_ENDPOINT), deployment
    if OPENAI_API_KEY:
        from openai import OpenAI
        return OpenAI(api_key=OPENAI_API_KEY), OPENAI_MODEL or "gpt-4o-mini"
    return None, None


def _llm_json_call(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    """Call LLM and parse JSON response."""
    import json as _json
    client, model = _get_llm_client()
    if not client:
        return {}
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        return _json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        logger.warning("LLM call failed: %s", exc)
        return {}


def triage_caption(caption: str, hashtags: list[str], account: str, media_type: str) -> dict[str, Any]:
    """LLM triage of Instagram post caption → sentiment, PR risk, issue type, severity."""
    if not caption or len(caption.strip()) < 10:
        return {"label": "neutral", "is_pr_risk": False, "confidence": 0.3, "issue_type": "none", "severity": "low", "reason": "empty_caption"}
    tags_str = ", ".join(hashtags[:15]) if hashtags else "none"
    r = _llm_json_call(
        "You are a brand PR analyst for Physics Wallah (PW), an Indian edtech. Classify this Instagram post. Return JSON: {\"label\":\"positive|negative|neutral|uncertain\",\"is_pr_risk\":true/false,\"confidence\":0.0-1.0,\"issue_type\":\"brand_praise|teacher_appreciation|course_review|refund_complaint|quality_complaint|scam_allegation|teacher_exodus|app_issue|competitor_comparison|meme|student_motivation|news_coverage|other\",\"severity\":\"low|medium|high|critical\",\"reason\":\"1 sentence\"}",
        f"Account: @{account}\nMedia: {media_type}\nHashtags: {tags_str}\nCaption:\n{caption[:1500]}",
    )
    return {"label": r.get("label", "neutral"), "is_pr_risk": r.get("is_pr_risk", False), "confidence": min(1.0, max(0.0, r.get("confidence", 0.5))), "issue_type": r.get("issue_type", "other"), "severity": r.get("severity", "low"), "reason": r.get("reason", "")}


def analyze_reel_transcript(transcript: str, caption: str, account: str) -> dict[str, Any]:
    """LLM analysis of Reel audio transcript from Whisper."""
    if not transcript or len(transcript.strip()) < 20:
        return {"sentiment": "neutral", "is_pr_risk": False, "severity": "low", "key_claims": [], "reason": "empty_transcript"}
    r = _llm_json_call(
        "You are a brand PR analyst for Physics Wallah (PW). Analyze this Instagram Reel transcript (Hindi/Hinglish). Return JSON: {\"sentiment\":\"positive|negative|neutral|mixed\",\"is_pr_risk\":true/false,\"severity\":\"low|medium|high|critical\",\"issue_type\":\"same as caption triage\",\"key_claims\":[\"list\"],\"brand_harm_evidence\":[\"quotes\"],\"recommended_action\":\"ignore|monitor|respond|escalate\",\"reason\":\"1-2 sentences\"}",
        f"Account: @{account}\nCaption: {caption[:500]}\nTranscript:\n{transcript[:3000]}",
    )
    return {"sentiment": r.get("sentiment", "neutral"), "is_pr_risk": r.get("is_pr_risk", False), "severity": r.get("severity", "low"), "issue_type": r.get("issue_type", "other"), "key_claims": r.get("key_claims", []), "brand_harm_evidence": r.get("brand_harm_evidence", []), "recommended_action": r.get("recommended_action", "ignore"), "reason": r.get("reason", "")}


def classify_comments_batch(comments: list[dict[str, Any]]) -> dict[int, str]:
    """Batch classify Instagram comments. Returns {index: label}."""
    if not comments:
        return {}
    items = [f"[{i}] {(c.get('comment_text') or '')[:200]}" for i, c in enumerate(comments)]
    client, model = _get_llm_client()
    if not client:
        return {}
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Classify each Instagram comment sentiment toward Physics Wallah. Understand Indian slang, Hinglish, emojis. Return ONLY index:label, one per line. Labels: positive, negative, neutral."},
                {"role": "user", "content": f"Classify all {len(items)}:\n" + "\n".join(items)},
            ],
            temperature=0.1, max_tokens=800,
        )
        raw = resp.choices[0].message.content or ""
        results = {}
        for line in raw.strip().split("\n"):
            if ":" not in line:
                continue
            parts = line.split(":", 1)
            try:
                idx = int(parts[0].strip())
                label = parts[1].strip().lower().rstrip(".")
                if label in ("positive", "negative", "neutral") and 0 <= idx < len(comments):
                    results[idx] = label
            except (ValueError, IndexError):
                continue
        return results
    except Exception as exc:
        logger.warning("Comment classification failed: %s", exc)
        return {}


def synthesize_post(caption_triage: dict, transcript_analysis: dict | None, comment_stats: dict) -> dict[str, Any]:
    """Final synthesis: combine caption + transcript + comments → final verdict (rule-based, no LLM)."""
    final = caption_triage.get("label", "neutral")
    severity = caption_triage.get("severity", "low")
    risk = caption_triage.get("is_pr_risk", False)
    issue = caption_triage.get("issue_type", "other")
    action = "ignore"

    if transcript_analysis and transcript_analysis.get("sentiment") != "neutral":
        if transcript_analysis.get("is_pr_risk"): risk = True
        if transcript_analysis.get("severity") in ("high", "critical"): severity = transcript_analysis["severity"]
        if transcript_analysis.get("sentiment") == "negative": final = "negative"
        if transcript_analysis.get("issue_type", "other") != "other": issue = transcript_analysis["issue_type"]
        if transcript_analysis.get("recommended_action") in ("respond", "escalate"): action = transcript_analysis["recommended_action"]

    neg = comment_stats.get("negative", 0)
    total = comment_stats.get("total", 0)
    if total > 5 and neg / total > 0.4:
        risk = True
        if severity == "low": severity = "medium"
        if action == "ignore": action = "monitor"

    sev_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    if sev_order.get(severity, 0) >= 2:
        action = "escalate" if severity == "critical" else "respond"
    elif risk and action == "ignore":
        action = "monitor"

    return {"final_sentiment": final, "final_severity": severity, "final_is_pr_risk": risk, "final_issue_type": issue, "final_recommended_action": action}


async def transcribe_reel(post_url: str, media_type: str) -> dict[str, Any]:
    """Download Reel audio + Whisper transcription."""
    if media_type not in ("reel", "video"):
        return {"text": "", "source": "skipped_not_video"}
    try:
        from transcription.extractor import download_audio
        from transcription.whisper import transcribe_async
        audio_path = await download_audio(post_url, "youtube")  # yt-dlp handles IG URLs
        if not audio_path:
            return {"text": "", "source": "download_failed"}
        result = await transcribe_async(str(audio_path))
        try:
            from pathlib import Path
            Path(audio_path).unlink(missing_ok=True)
        except Exception:
            pass
        return {"text": result.get("text", ""), "language": result.get("language", ""), "source": result.get("source_metadata", {}).get("provider", "whisper")}
    except Exception as exc:
        logger.warning("Reel transcription failed for %s: %s", post_url, exc)
        return {"text": "", "source": f"error:{exc}"}


# ---------------------------------------------------------------------------
# Main Scraper Engine
# ---------------------------------------------------------------------------

class InstagramScraper(BaseScraper):
    """
    Instagram brand intelligence scraper — 3-layer detection net.

    Layer 1: KNOWN SOURCES — 80+ accounts across 5 categories
    Layer 2: HASHTAG RADAR — 15 hashtag feeds catching unknown accounts
    Layer 3: INTELLIGENCE — LLM triage + Reel Whisper + comment classification + risk scoring
    """

    platform = "instagram"

    def __init__(self, config: ScraperConfig | None = None):
        super().__init__()
        self.config = config or ScraperConfig()
        self._rate_limiter = AdaptiveRateLimiter(
            min_delay=self.config.min_delay,
            max_delay=self.config.max_delay,
        )
        self._session_pool = SessionPool(self.config)

    async def search(self, params: SearchParams) -> list[dict[str, Any]]:
        """Search Instagram by scraping all 5 account categories for PW mentions."""
        accounts = getattr(params, '_ig_accounts', None) or []
        if not accounts:
            accounts = OWN_BRAND_ACCOUNTS + COMPETITOR_ACCOUNTS + EX_PW_ACCOUNTS + ECOSYSTEM_ACCOUNTS + STUDENT_INFLUENCER_ACCOUNTS
        accounts = list(dict.fromkeys(accounts))

        max_per = max(params.max_results_per_platform // max(len(accounts), 1), 20)

        after_ts = params.after_date.timestamp() if params.after_date else None
        before_ts = params.before_date.timestamp() if params.before_date else None

        # --- STEP 1: Scrape all accounts (with delay between accounts) ---
        all_posts: list[dict] = []
        for i, username in enumerate(accounts):
            if i > 0:
                delay = random.uniform(3, 7)
                logger.info("Waiting %.1fs before next account...", delay)
                time.sleep(delay)
            source_type = "own_brand"
            if username in COMPETITOR_ACCOUNTS:
                source_type = "competitor"
            elif username in EX_PW_ACCOUNTS:
                source_type = "ex_pw"
            elif username in ECOSYSTEM_ACCOUNTS:
                source_type = "ecosystem"

            posts = _scrape_profile(username, self._rate_limiter, max_posts=max_per, after_ts=after_ts, before_ts=before_ts)
            for p in posts:
                p["source_type"] = source_type
                p.setdefault("raw_data", {})["source_type"] = source_type
            all_posts.extend(posts)

        # Dedup
        seen = set()
        unique = []
        for p in all_posts:
            pid = p["post_id"]
            if pid and pid not in seen:
                seen.add(pid)
                unique.append(p)

        logger.info("Step 1 done: %d unique posts from %d accounts", len(unique), len(accounts))

        # --- STEP 2: Filter — keep posts that mention PW ---
        # Own brand: keep all (comments will reveal negative sentiment).
        # Ex-PW / ecosystem: keep all (these accounts exist to discuss PW).
        # Competitors: only if caption mentions PW.
        shortlisted = []
        for p in unique:
            src = p.get("source_type", "")
            if src in ("own_brand", "ex_pw"):
                shortlisted.append(p)
            elif src == "ecosystem":
                # Ecosystem/student accounts post diverse content (memes, crushes, etc.)
                # Only keep posts that actually mention PW
                if _caption_mentions_pw(p.get("caption_text", ""), p.get("hashtags", [])):
                    shortlisted.append(p)
            elif _caption_mentions_pw(p.get("caption_text", ""), p.get("hashtags", [])):
                shortlisted.append(p)

        own_count = len([p for p in shortlisted if p.get("source_type") == "own_brand"])
        eco_count = len([p for p in shortlisted if p.get("source_type") != "own_brand"])
        logger.info(
            "Step 2 done: %d shortlisted (%d own brand, %d ecosystem/ex-pw/competitor)",
            len(shortlisted), own_count, eco_count,
        )

        # Convert to result format
        results = []
        for p in shortlisted:
            results.append({
                "post_id": p["post_id"],
                "content_text": p.get("caption_text", ""),
                "content_type": p.get("media_type", "image"),
                "author_handle": p.get("account_name", ""),
                "engagement_score": p.get("like_count", 0) + p.get("comment_count", 0),
                "likes": p.get("like_count", 0),
                "comments_count": p.get("comment_count", 0),
                "source_url": p.get("post_url", ""),
                "published_at": p.get("published_date"),
                "raw_data": p.get("raw_data", {}),
                "_ig_post": p,
            })
        return results

    async def scrape_comments(self, source_url: str, limit: int = 200,
                              media_pk: str = "") -> list[dict[str, Any]]:
        m = re.search(r'instagram\.com/(?:reel|p)/([^/?#]+)', source_url)
        if not m:
            return []
        return _scrape_comments(m.group(1), media_pk, self._rate_limiter, max_comments=limit)

    async def scrape_and_store_post(
        self, post_data: dict[str, Any], brand_id: str,
    ) -> dict[str, Any]:
        ig = post_data.get("_ig_post", post_data)
        post_row = {
            "brand_id": brand_id,
            "post_id": ig.get("post_id", ""),
            "account_name": ig.get("account_name", ""),
            "caption_text": ig.get("caption_text", ""),
            "like_count": ig.get("like_count", 0),
            "comment_count": ig.get("comment_count", 0),
            "media_type": ig.get("media_type", "image"),
            "published_date": ig.get("published_date"),
            "hashtags": ig.get("hashtags", []),
            "post_url": ig.get("post_url", ""),
            "video_views": ig.get("video_views", 0),
            "reel_plays": ig.get("reel_plays", 0),
            "raw_data": ig.get("raw_data", {}),
        }
        stored = {}
        try:
            stored = db.insert_instagram_post(post_row)
            logger.info(
                "Stored post %s by @%s [%s]",
                post_row["post_id"], post_row["account_name"],
                ig.get("source_type", "?"),
            )
        except Exception:
            logger.exception("Failed to store post %s", post_row["post_id"])

        try:
            mention = db.insert_mention({
                "brand_id": brand_id,
                "platform": "instagram",
                "platform_ref_id": stored.get("id", ""),
                "content_text": ig.get("caption_text", ""),
                "content_type": ig.get("media_type", "image"),
                "author_handle": ig.get("account_name", ""),
                "engagement_score": ig.get("like_count", 0) + ig.get("comment_count", 0),
                "likes": ig.get("like_count", 0),
                "comments_count": ig.get("comment_count", 0),
                "source_url": ig.get("post_url", ""),
                "published_at": ig.get("published_date"),
                "raw_data": ig.get("raw_data", {}),
            })
            stored["_mention_id"] = mention.get("id")
        except Exception:
            logger.exception("Failed to store mention for post %s", post_row["post_id"])
        return stored

    async def run_pipeline(
        self,
        brand_id: str,
        keywords: list[str],
        hashtags: list[str],
        accounts: list[str] | None = None,
        max_posts_per_account: int = 30,
        max_comments_per_post: int = 50,
        enable_reel_transcription: bool = True,
        enable_llm_triage: bool = True,
        enable_comment_classification: bool = True,
        after_date: datetime | None = None,
        before_date: datetime | None = None,
    ) -> dict[str, Any]:
        """
        Full 3-layer pipeline:
          Layer 1: Scrape accounts → filter PW mentions → store posts
          Layer 2: LLM triage captions + Reel audio Whisper + LLM transcript analysis
          Layer 3: Scrape comments → LLM batch classify → final synthesis + risk score
        """
        params = SearchParams(
            keywords=keywords,
            hashtags=hashtags,
            platforms=["instagram"],
            brand_id=brand_id,
            max_results_per_platform=max_posts_per_account * max(len(accounts or []), 1),
            after_date=after_date,
            before_date=before_date,
        )
        params._ig_accounts = accounts or []

        # ── LAYER 1: Scrape + Filter ──────────────────────────────
        search_results = await self.search(params)
        logger.info("Layer 1: %d posts shortlisted from %d accounts", len(search_results), len(accounts or []))

        posts_stored = 0
        comments_stored = 0
        posts_triaged = 0
        reels_transcribed = 0
        comments_classified = 0
        pr_risks_flagged = 0

        for result in search_results:
            ig = result.get("_ig_post", result)
            post_id = ig.get("post_id", "")
            caption = ig.get("caption_text", "")
            account = ig.get("account_name", "")
            media_type = ig.get("media_type", "image")
            post_url = ig.get("post_url", "")
            post_hashtags = ig.get("hashtags", [])

            # ── LAYER 2a: LLM Caption Triage ─────────────────────
            caption_result = {}
            if enable_llm_triage:
                caption_result = triage_caption(caption, post_hashtags, account, media_type)
                posts_triaged += 1
                if caption_result.get("is_pr_risk"):
                    logger.warning("PR RISK detected: @%s [%s] %s — %s",
                        account, caption_result["severity"], caption_result["issue_type"], caption_result["reason"])

            # ── LAYER 2b: Reel Audio → Whisper → LLM ─────────────
            transcript_result = None
            if enable_reel_transcription and media_type in ("reel", "video") and post_url:
                whisper_result = await transcribe_reel(post_url, media_type)
                if whisper_result.get("text"):
                    reels_transcribed += 1
                    transcript_result = analyze_reel_transcript(whisper_result["text"], caption, account)
                    if transcript_result.get("is_pr_risk"):
                        logger.warning("REEL PR RISK: @%s — %s (audio)", account, transcript_result["reason"])

            # ── Store post with triage data ───────────────────────
            ig["source_type"] = ig.get("source_type", "unknown")
            stored = await self.scrape_and_store_post(result, brand_id)
            if stored:
                posts_stored += 1
                # Update with intelligence fields
                update_fields = {}
                if caption_result:
                    update_fields.update({
                        "caption_triage_label": caption_result.get("label"),
                        "caption_triage_is_pr_risk": caption_result.get("is_pr_risk", False),
                        "caption_triage_confidence": caption_result.get("confidence", 0),
                        "caption_triage_issue_type": caption_result.get("issue_type"),
                        "caption_triage_reason": caption_result.get("reason"),
                        "caption_triage_severity": caption_result.get("severity"),
                    })
                if transcript_result:
                    update_fields.update({
                        "reel_transcript_text": whisper_result.get("text", "")[:5000],
                        "reel_transcript_language": whisper_result.get("language", ""),
                        "reel_transcript_source": whisper_result.get("source", ""),
                        "reel_transcript_sentiment": transcript_result.get("sentiment"),
                        "reel_transcript_pr_risk": transcript_result.get("is_pr_risk", False),
                        "reel_transcript_severity": transcript_result.get("severity"),
                        "reel_transcript_key_claims": transcript_result.get("key_claims", []),
                    })

                # ── LAYER 3: Comments ─────────────────────────────
                comment_stats = {"positive": 0, "negative": 0, "neutral": 0, "total": 0}
                if max_comments_per_post > 0 and result.get("comments_count", 0) > 0:
                    source_url = result.get("source_url", "")
                    media_pk = result.get("raw_data", {}).get("pk", "")
                    if source_url:
                        comments = await self.scrape_comments(source_url, limit=max_comments_per_post, media_pk=media_pk)
                        if comments:
                            # LLM classify comments in batches of 30
                            if enable_comment_classification:
                                for batch_start in range(0, len(comments), 30):
                                    batch = comments[batch_start:batch_start + 30]
                                    labels = classify_comments_batch(batch)
                                    for idx, label in labels.items():
                                        if batch_start + idx < len(comments):
                                            comments[batch_start + idx]["comment_sentiment_label"] = label
                                            comment_stats[label] = comment_stats.get(label, 0) + 1
                                            comments_classified += 1
                                    comment_stats["total"] += len(batch)
                                    time.sleep(0.3)
                            else:
                                comment_stats["total"] = len(comments)

                            try:
                                db.insert_instagram_comments_batch(comments)
                                comments_stored += len(comments)
                            except Exception:
                                logger.exception("Failed to store comments for %s", post_id)

                # ── Final Synthesis ───────────────────────────────
                if caption_result or transcript_result:
                    synthesis = synthesize_post(caption_result or {}, transcript_result, comment_stats)
                    update_fields.update(synthesis)
                    if synthesis.get("final_is_pr_risk"):
                        pr_risks_flagged += 1

                # Write intelligence fields to Supabase
                if update_fields and post_id:
                    try:
                        from config.supabase_client import get_service_client
                        sb = get_service_client()
                        sb.table("instagram_posts").update(update_fields).eq("post_id", post_id).execute()
                    except Exception:
                        logger.exception("Failed to update intelligence fields for %s", post_id)

        # ── Geo inference ─────────────────────────────────────────
        geo_result = {"geo_records_created": 0, "unique_states": 0}
        try:
            from analysis.geo_inference import process_mentions_geo
            geo_result = process_mentions_geo(brand_id)
        except Exception:
            logger.exception("Geo inference failed (non-fatal)")

        summary = {
            "platform": "instagram",
            "brand_id": brand_id,
            "posts_found": len(search_results),
            "posts_stored": posts_stored,
            "posts_triaged": posts_triaged,
            "reels_transcribed": reels_transcribed,
            "comments_stored": comments_stored,
            "comments_classified": comments_classified,
            "pr_risks_flagged": pr_risks_flagged,
            "geo_records": geo_result.get("geo_records_created", 0),
            "timestamp": datetime.utcnow().isoformat(),
        }
        logger.info("Pipeline complete: %s", summary)
        return summary

    async def close(self):
        pass


# ---------------------------------------------------------------------------
# Register searcher
# ---------------------------------------------------------------------------

def _lazy_search(params):
    """Lazy wrapper — avoids creating InstagramScraper at import time."""
    global _scraper
    if _scraper is None:
        _scraper = InstagramScraper()
    return _scraper.search(params)

_scraper = None
register_searcher("instagram", _lazy_search)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    import argparse

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Instagram negative PR detection")
    parser.add_argument("--brand", required=True, help="Brand name to monitor")
    parser.add_argument("--brand-id", help="Existing brand UUID in Supabase")
    parser.add_argument("--accounts", default="",
                        help="Override: comma-separated IG usernames to scrape")
    parser.add_argument("--mode", choices=["ecosystem", "own", "all"], default="all",
                        help="ecosystem=competitors+trolls, own=brand accounts, all=both")
    parser.add_argument("--hashtags", default="", help="Extra hashtags for filtering")
    parser.add_argument("--keywords", default="", help="Extra keywords for filtering")
    parser.add_argument("--max-posts", type=int, default=30, help="Max posts per account")
    parser.add_argument("--max-comments", type=int, default=30, help="Max comments per post")
    parser.add_argument("--days", type=int, default=0,
                        help="Backfill window in days (0 = recent posts only)")
    args = parser.parse_args()

    from datetime import timedelta
    after_date = before_date = None
    if args.days > 0:
        before_date = datetime.now(timezone.utc)
        after_date = before_date - timedelta(days=args.days)

    accounts = [a.strip() for a in args.accounts.split(",") if a.strip()]
    hashtags = [h.strip() for h in args.hashtags.split(",") if h.strip()]
    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]

    if not accounts:
        if args.mode == "ecosystem":
            accounts = COMPETITOR_ACCOUNTS + EX_PW_ACCOUNTS + ECOSYSTEM_ACCOUNTS + STUDENT_INFLUENCER_ACCOUNTS
        elif args.mode == "own":
            accounts = OWN_BRAND_ACCOUNTS
        else:
            accounts = OWN_BRAND_ACCOUNTS + COMPETITOR_ACCOUNTS + EX_PW_ACCOUNTS + ECOSYSTEM_ACCOUNTS + STUDENT_INFLUENCER_ACCOUNTS

    if not hashtags and not keywords:
        hashtags = [args.brand.lower().replace(" ", "")]
        keywords = [args.brand.lower()]

    print(f"{'='*60}")
    print(f"  Instagram Negative PR Detection")
    print(f"{'='*60}")
    print(f"  Mode:       {args.mode}")
    print(f"  Accounts:   {len(accounts)} ({', '.join(accounts[:5])}{'...' if len(accounts) > 5 else ''})")
    print(f"  Proxies:    {len(PROXY_LIST)} rotating")
    print(f"  PW keywords: {len(PW_MENTION_KEYWORDS)} built-in + {len(keywords)} custom")
    print(f"  Max posts/account: {args.max_posts}")
    print(f"  Max comments/post: {args.max_comments}")
    print(f"  Window:     {f'last {args.days}d' if args.days > 0 else 'recent posts'}")
    print(f"  LLM Triage: ON | Reel Whisper: ON | Comment Classification: ON")
    print(f"{'='*60}")
    print()

    brand_id = args.brand_id
    if not brand_id:
        brand = db.upsert_brand({
            "name": args.brand,
            "keywords": keywords,
            "hashtags": [f"#{h}" for h in hashtags],
            "platforms": ["instagram"],
        })
        brand_id = brand["id"]
        print(f"Brand '{args.brand}' -> {brand_id}")

    loop = asyncio.new_event_loop()
    scraper = InstagramScraper()
    try:
        result = loop.run_until_complete(scraper.run_pipeline(
            brand_id=brand_id,
            keywords=keywords,
            hashtags=hashtags,
            accounts=accounts,
            max_posts_per_account=args.max_posts,
            max_comments_per_post=args.max_comments,
            after_date=after_date,
            before_date=before_date,
        ))
    finally:
        loop.run_until_complete(scraper.close())
        loop.close()

    print(f"\n{'='*60}")
    print(f"  RESULTS")
    print(f"{'='*60}")
    print(f"  Posts shortlisted:      {result['posts_found']}")
    print(f"  Posts stored:           {result['posts_stored']}")
    print(f"  Posts LLM triaged:      {result.get('posts_triaged', 0)}")
    print(f"  Reels transcribed:      {result.get('reels_transcribed', 0)}")
    print(f"  Comments stored:        {result['comments_stored']}")
    print(f"  Comments classified:    {result.get('comments_classified', 0)}")
    print(f"  PR RISKS FLAGGED:       {result.get('pr_risks_flagged', 0)}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
