"""
LinkedIn scraper — custom-endpoint-first collector for company posts/comments.

LinkedIn aggressively restricts direct scraping. This module does not browser-scrape
LinkedIn itself. It calls an approved custom collector endpoint that you control, or
optionally a configured Proxycurl-compatible company updates endpoint, then normalizes
the response into linkedin_posts + generic mentions.

Expected custom endpoint response:
  Either {"posts": [...]} or a raw list of posts.

Accepted post fields are intentionally flexible:
  id/post_id/urn, text/post_text/commentary, author_name/company_name,
  author_headline, url/post_url, published_at/published_date,
  reactions_count/likes, comments_count, shares_count, company_page_followers,
  employee_count, job_postings_count, comments.

Usage:
  python -m scrapers.linkedin --brand PhysicsWallah --brand-id <uuid> \
    --keywords "physics wallah,physicswallah,alakh pandey" --max-posts 50
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import os
from pathlib import Path
import random
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import requests
from bs4 import BeautifulSoup

from config.supabase_client import get_service_client
from scrapers.base import BaseScraper
from search.engine import register_searcher
from search.filters import SearchParams, in_window
from storage import queries as db

logger = logging.getLogger(__name__)

DEFAULT_LINKEDIN_KEYWORDS = [
    "Physics Wallah",
    "PhysicsWallah",
    "PW Skills",
    "PW Vidyapeeth",
    "Alakh Pandey",
]

PUBLIC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
}

LINKEDIN_POST_RE = re.compile(r"https?://(?:[\w-]+\.)?linkedin\.com/(?:posts|feed/update|pulse)/[^\s\"'<>]+", re.I)
PW_TERMS_RE = re.compile(r"\b(physics\s*wallah|physicswallah|pw skills|pw vidyapeeth|alakh pandey|infinity pro|pwians|pwstories|pwian|gyaan-e|gate wallah)\b|#pw\b", re.I)
PW_CONTEXT_RE = re.compile(r"\b(education|edtech|jee|neet|upsc|student|teacher|faculty|batch|course|learning|vidyapeeth|skills|alakh)\b", re.I)
EMPLOYEE_IDENTITY_RE = re.compile(r"\b(ex-?pw|ex employee|former employee|worked at|my time at|i worked at|inside pw|employee at physics wallah|employee of physics wallah)\b", re.I)
HR_CULTURE_NEGATIVE_RE = re.compile(r"\b(toxic|culture|workplace|harassment|burnout|micromanage|layoff|fired|salary|glassdoor|employer brand|bad boss|work environment|overwork|pip|humiliation|ghosted|recruit(?:er|ing)?|candidate|offer letter|waitlist|hr team|hiring team|abusive|tele-?calling|enrollment staff|counsellor|admissions? at any cost)\b", re.I)
PRODUCT_NEGATIVE_RE = re.compile(r"\b(app issue|app issues|product issue|product issues|bugs?|glitches?|crash(?:ed|es|ing)?|not working|poor ux|user experience|refunds?|support issue|support issues|playback|buffer(?:ing)?|feature request|feature requests|broken app|platform issue|downtime|outage|lag|slow app)\b", re.I)
LINKEDIN_AUTHOR_NOISE_RE = re.compile(r"^(user agreement|privacy policy|cookie policy|linkedin|sign in|join now|edited|image|skip to main content)$", re.I)

FOCUS_QUERY_TERMS = {
    "hr": [
        "toxic culture",
        "work culture",
        "former employee",
        "employee review",
        "interview experience",
        "recruiter ghosted",
        "abusive staff",
        "telecalling",
        "hiring",
        "salary",
        "workplace",
    ],
    "product": [
        "app issue",
        "app crashed",
        "product feedback",
        "bug",
        "not working",
        "poor UX",
        "refund issue",
        "support issue",
        "feature request",
    ],
}


def _env_list(name: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, "").split(",") if item.strip()]


def _parse_dt(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    text = str(value).strip()
    if not text:
        return None
    if text.lower() in {"edited", "modified"}:
        return None
    relative = re.search(r"\b(\d+)\s*(m|h|d|w|mo|yr|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\b", text, re.I)
    if relative:
        amount = int(relative.group(1))
        unit = relative.group(2).lower()
        if unit.startswith("m") and unit not in {"mo", "month", "months"}:
            delta = timedelta(minutes=amount)
        elif unit.startswith("h"):
            delta = timedelta(hours=amount)
        elif unit.startswith("d"):
            delta = timedelta(days=amount)
        elif unit.startswith("w"):
            delta = timedelta(weeks=amount)
        elif unit in {"mo", "month", "months"}:
            delta = timedelta(days=amount * 30)
        else:
            delta = timedelta(days=amount * 365)
        return (datetime.now(timezone.utc) - delta).isoformat()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return text


def _stable_id(*parts: Any) -> str:
    raw = "|".join(str(part or "") for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def _clean_url(url: str) -> str:
    text = str(url or "").strip()
    if not text:
        return ""
    parsed = urlparse(text)
    if "linkedin.com" not in parsed.netloc.lower():
        return ""
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme or 'https'}://{parsed.netloc}{path}/"


def _is_public_linkedin_post_url(url: str) -> bool:
    cleaned = _clean_url(url)
    return bool(cleaned and re.search(r"linkedin\.com/(posts|feed/update|pulse)/", cleaned, re.I))


def _is_public_linkedin_activity_url(url: str) -> bool:
    cleaned = _clean_url(url)
    return bool(cleaned and re.search(r"linkedin\.com/(in|company)/", cleaned, re.I))


def _safe_int(value: Any) -> int:
    text = str(value or "").replace(",", "").strip()
    match = re.search(r"\d+", text)
    return int(match.group(0)) if match else 0


def _line_text(soup: BeautifulSoup) -> list[str]:
    lines = [line.strip() for line in soup.get_text("\n").splitlines()]
    return [line for line in lines if line]


def _looks_like_time(line: str) -> bool:
    return bool(re.search(r"\b(\d+\s*(?:m|h|d|w|mo|yr)|\d+\s*(?:minutes?|hours?|days?|weeks?|months?|years?)|Edited)\b", line, re.I))


def _trim_linkedin_noise(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    text = re.sub(r"\bReport this (?:post|comment)\b", "", text, flags=re.I).strip()
    text = re.sub(r"\bLike\s+Reply\b.*$", "", text, flags=re.I).strip()
    text = re.sub(r"\bLike\s+Comment\b.*$", "", text, flags=re.I).strip()
    return text


def _looks_like_author_label(text: str) -> bool:
    candidate = str(text or "").strip("# ").strip()
    if not candidate:
        return False
    if re.fullmatch(r"[\W_]+", candidate):
        return False
    if re.fullmatch(r"[\W_]*(and|or|more)[\W_]*", candidate, re.I):
        return False
    if LINKEDIN_AUTHOR_NOISE_RE.match(candidate):
        return False
    if "linkedin" in candidate.lower():
        return False
    return len(candidate) < 90


def _author_from_post_url(source_url: str) -> str:
    match = re.search(r"linkedin\.com/posts/([^_/]+)_", source_url or "", re.I)
    if not match:
        return ""
    slug = match.group(1).strip("-_")
    if not slug:
        return ""
    words = [part for part in slug.split("-") if part and not part.isdigit()]
    return " ".join(word.capitalize() for word in words[:6]).strip()


def _extract_linkedin_candidates_from_search_html(html: str) -> list[str]:
    candidates = LINKEDIN_POST_RE.findall(html or "")
    soup = BeautifulSoup(html or "", "html.parser")
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        if not href:
            continue
        google_match = re.search(r"/url\?q=(https?://[^&]+)", href)
        if google_match:
            candidates.append(unquote(google_match.group(1)))
            continue
        if "duckduckgo.com/l/" in href and "uddg=" in href:
            qs = parse_qs(urlparse(href).query)
            for value in qs.get("uddg", []):
                candidates.append(unquote(value))
            continue
        if "linkedin.com/" in href:
            candidates.append(unquote(href))
    return candidates


def _normalize_focuses(focuses: list[str] | None) -> list[str]:
    normalized: list[str] = []
    for focus in focuses or []:
        value = str(focus or "").strip().lower()
        if value in {"hr", "human-resources", "people", "culture"}:
            normalized.append("hr")
        elif value in {"product", "app", "product-team"}:
            normalized.append("product")
    return sorted(set(normalized))


def is_physics_wallah_post(post: dict[str, Any]) -> bool:
    """Reject unrelated uses of the abbreviation PW before storage/export."""
    blob = " ".join(
        str(post.get(field) or "")
        for field in ("content_text", "author_name", "author_headline", "source_url")
    )
    if PW_TERMS_RE.search(blob):
        return True
    return bool(re.search(r"\bpw\b", blob, re.I) and PW_CONTEXT_RE.search(blob))


def _focus_metadata(post: dict[str, Any], focuses: list[str] | None = None) -> dict[str, Any]:
    normalized_focuses = _normalize_focuses(focuses)
    blob = " ".join(
        [
            str(post.get("content_text") or ""),
            str(post.get("author_name") or ""),
            str(post.get("author_headline") or ""),
            str(post.get("source_url") or ""),
        ]
    )
    lower_blob = blob.lower()
    matched_focuses: list[str] = []
    matched_signals: list[str] = []
    narrative = "general_pw_discussion"
    target_team = ""

    if HR_CULTURE_NEGATIVE_RE.search(lower_blob):
        matched_signals.append("hr_culture_negative")
    if EMPLOYEE_IDENTITY_RE.search(lower_blob):
        matched_signals.append("employee_identity")
    if PRODUCT_NEGATIVE_RE.search(lower_blob):
        matched_signals.append("product_negative")

    hr_match = "hr_culture_negative" in matched_signals or "employee_identity" in matched_signals
    product_match = "product_negative" in matched_signals
    official_company = bool(re.search(r"/company/physicswallah/?", str(post.get("source_url") or ""), re.I)) or str(post.get("author_name") or "").strip().lower() in {"physicswallah", "physics wallah", "pw (physicswallah)"}
    if official_company and "fraud alert" in lower_blob and not product_match:
        hr_match = False

    if hr_match:
        matched_focuses.append("hr")
    if product_match:
        matched_focuses.append("product")

    if "employee_identity" in matched_signals and "hr_culture_negative" in matched_signals:
        narrative = "employee_bad_mouthing"
        target_team = "HR Team"
    elif "hr_culture_negative" in matched_signals:
        narrative = "culture_bad_post"
        target_team = "HR Team"
    elif "product_negative" in matched_signals:
        narrative = "product_bad_post"
        target_team = "Product Team"

    negative = bool(matched_focuses)
    requested_match = not normalized_focuses or bool(set(normalized_focuses) & set(matched_focuses))

    return {
        "focuses": matched_focuses,
        "requested_focuses": normalized_focuses,
        "matched_requested_focus": requested_match,
        "negative_signal": negative,
        "signals": matched_signals,
        "narrative": narrative,
        "target_team": target_team,
    }


def _first(item: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return default


def _normalize_post(item: dict[str, Any]) -> dict[str, Any]:
    raw = item or {}
    text = str(_first(raw, "post_text", "text", "commentary", "content", "description", default="")).strip()
    url = str(_first(raw, "post_url", "url", "share_url", "permalink", default="")).strip()
    post_id = str(_first(raw, "post_id", "id", "urn", "activity_urn", default="")).strip()
    if not post_id:
        post_id = _stable_id(url, text, _first(raw, "published_at", "published_date"))
    published = _parse_dt(_first(raw, "published_at", "published_date", "created_at", "posted_at"))
    reactions = int(_first(raw, "reactions_count", "reaction_count", "likes", "num_likes", default=0) or 0)
    comments_count = int(_first(raw, "comments_count", "comment_count", "num_comments", default=0) or 0)
    shares_count = int(_first(raw, "shares_count", "share_count", "num_shares", default=0) or 0)
    author = str(_first(raw, "author_name", "company_name", "actor_name", "page_name", default="LinkedIn")).strip()

    return {
        "post_id": post_id,
        "content_text": text,
        "content_type": "linkedin_post",
        "author_handle": author,
        "author_name": author,
        "author_headline": _first(raw, "author_headline", "headline", default=""),
        "engagement_score": reactions + comments_count + shares_count,
        "likes": reactions,
        "shares": shares_count,
        "comments_count": comments_count,
        "source_url": url,
        "published_at": published,
        "language": _first(raw, "language", default="en"),
        "raw_data": raw,
        "comments": raw.get("comments") or [],
        "company_page_followers": int(_first(raw, "company_page_followers", "followers", default=0) or 0),
        "employee_count": int(_first(raw, "employee_count", default=0) or 0),
        "job_postings_count": int(_first(raw, "job_postings_count", "jobs_count", default=0) or 0),
    }


def _normalize_comment(item: dict[str, Any], post: dict[str, Any]) -> dict[str, Any]:
    text = str(_first(item, "comment_text", "text", "content", "message", default="")).strip()
    author = str(_first(item, "author_name", "author", "actor_name", default="LinkedIn user")).strip()
    published = _parse_dt(_first(item, "published_at", "created_at", "date"))
    likes = int(_first(item, "likes", "reactions_count", "reaction_count", default=0) or 0)
    comment_id = str(_first(item, "comment_id", "id", "urn", default="")).strip()
    if not comment_id:
        comment_id = _stable_id(post.get("post_id"), author, published, text)
    return {
        "comment_id": comment_id,
        "post_id": post.get("post_id"),
        "content_text": text,
        "content_type": "linkedin_comment",
        "author_handle": author,
        "author_name": author,
        "engagement_score": likes,
        "likes": likes,
        "shares": 0,
        "comments_count": 0,
        "source_url": post.get("source_url", ""),
        "published_at": published,
        "language": _first(item, "language", default="en"),
        "raw_data": item,
    }


def parse_public_linkedin_html(html: str, source_url: str) -> dict[str, Any] | None:
    """Parse content LinkedIn exposes in unauthenticated public HTML.

    This parser intentionally works only on static public page content. It does not
    use cookies, logged-in sessions, browser automation, or control bypasses.
    """
    soup = BeautifulSoup(html or "", "html.parser")
    lines = _line_text(soup)
    if not lines:
        return None

    title = soup.find("title").get_text(" ", strip=True) if soup.find("title") else ""
    author = ""
    for line in lines[:60]:
        if "’s Post" in line or "'s Post" in line:
            candidate = line.replace("’s Post", "").replace("'s Post", "").strip("# ").strip()
            if _looks_like_author_label(candidate):
                author = candidate
            break
    if not author:
        for line in lines[:80]:
            if not line.startswith("#") and _looks_like_author_label(line):
                author = line.strip("# ").strip()
                break
    if not author:
        author = _author_from_post_url(source_url)

    published = None
    for line in lines[:120]:
        if _looks_like_time(line):
            published = line
            break

    post_chunks: list[str] = []
    start = None
    for index, line in enumerate(lines):
        if "Report this post" in line:
            start = index
            remainder = line.split("Report this post", 1)[-1].strip()
            if remainder:
                post_chunks.append(remainder)
            break
    if start is not None:
        for line in lines[start + 1:]:
            if re.fullmatch(r"[\d,]+", line) or re.search(r"\b\d+\s+Comments?\b", line, re.I):
                break
            if line in {"Like", "Comment", "Share", "Copy", "LinkedIn", "Facebook", "X"}:
                break
            if "Report this comment" in line or "To view or add a comment" in line:
                break
            if not line.startswith("```"):
                post_chunks.append(line)

    post_text = _trim_linkedin_noise(" ".join(post_chunks))
    if not post_text:
        description = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
        post_text = _trim_linkedin_noise(description.get("content", "") if description else "")

    reactions = 0
    comments_count = 0
    for line in lines:
        if re.fullmatch(r"[\d,]+", line):
            reactions = max(reactions, _safe_int(line))
        comments_match = re.search(r"([\d,]+)\s+Comments?", line, re.I)
        if comments_match:
            comments_count = max(comments_count, _safe_int(comments_match.group(1)))

    comments: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        if "Report this comment" not in line:
            continue
        comment_author = ""
        for back in range(index - 1, max(index - 8, -1), -1):
            candidate = lines[back]
            if candidate and not _looks_like_time(candidate) and "linkedin.com" not in candidate.lower() and _looks_like_author_label(candidate):
                comment_author = candidate.strip("# ").strip()
                break

        chunks: list[str] = []
        remainder = line.split("Report this comment", 1)[-1].strip()
        if remainder:
            chunks.append(remainder)
        for next_line in lines[index + 1:]:
            if next_line in {"Like", "Reply", "Share", "Copy"} or re.search(r"\bLike\b|\bReply\b|\bReactions?\b", next_line):
                break
            if "Report this comment" in next_line or "See more comments" in next_line or "To view or add a comment" in next_line:
                break
            if not next_line.startswith("```"):
                chunks.append(next_line)
        comment_text = _trim_linkedin_noise(" ".join(chunks))
        if comment_text and len(comment_text) > 2:
            comments.append({
                "comment_id": _stable_id(source_url, comment_author, comment_text),
                "author_name": comment_author or "LinkedIn user",
                "comment_text": comment_text,
                "source": "public_html",
            })

    cleaned_url = _clean_url(source_url)
    post_id = _stable_id(cleaned_url, post_text)
    return _normalize_post({
        "post_id": post_id,
        "post_text": post_text,
        "author_name": author or "LinkedIn public post",
        "author_headline": title,
        "post_url": cleaned_url,
        "published_at": published,
        "reactions_count": reactions,
        "comments_count": comments_count,
        "comments": comments,
        "raw_data": {
            "source": "public_html",
            "title": title,
            "url": cleaned_url,
            "visible_comments_count": len(comments),
        },
    })


def parse_public_linkedin_activity_html(html: str, source_url: str, limit: int = 10) -> list[dict[str, Any]]:
    """Extract visible activity/update snippets from public profile/company pages."""
    soup = BeautifulSoup(html or "", "html.parser")
    lines = _line_text(soup)
    title = soup.find("title").get_text(" ", strip=True) if soup.find("title") else "LinkedIn public activity"
    page_author = title.split("|")[0].replace("#", "").strip() or "LinkedIn public profile"

    # On a /company/ page every post is authored by that company — derive the name
    # from the URL slug rather than back-scanning lines (which grabs "1w" / page chrome).
    company_match = re.search(r"/company/([^/]+)/?", source_url or "", re.I)
    is_company_page = bool(company_match)
    if is_company_page:
        page_author = company_match.group(1).replace("-", " ").title()

    posts: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Junk that must never be treated as an author name.
    _BAD_AUTHOR = {"user agreement", "privacy policy", "cookie policy", "sign in",
                   "join now", "activity", "posts", "comments", "reactions", "image"}

    for index, line in enumerate(lines):
        if not _looks_like_time(line):
            continue
        age_label = line
        author = page_author
        if not is_company_page:
            for back in range(index - 1, max(index - 8, -1), -1):
                candidate = lines[back].strip("# ").strip()
                low = candidate.lower()
                if not candidate or low in _BAD_AUTHOR:
                    continue
                if _looks_like_time(candidate) or "followers" in low or "connections" in low or "button:" in low:
                    continue
                if len(candidate) <= 90:
                    author = candidate
                    break

        chunks: list[str] = []
        for next_line in lines[index + 1:]:
            lower = next_line.lower()
            if _looks_like_time(next_line) or "public_profile__" in lower or "view profile" in lower:
                break
            if next_line in {"Like", "Comment", "Share", "Copy", "Image", "Follow"}:
                continue
            if "button:" in lower or "sign in" in lower or "join now" in lower:
                break
            if re.fullmatch(r"[\d,]+", next_line) or re.search(r"\b[\d,]+\s+Comments?\b", next_line, re.I):
                break
            chunks.append(next_line)
            if len(" ".join(chunks)) > 1200:
                break

        text = _trim_linkedin_noise(" ".join(chunks))
        if len(text) < 60 or not PW_TERMS_RE.search(text):
            continue
        key = _stable_id(source_url, author, age_label, text[:240])
        if key in seen:
            continue
        seen.add(key)
        posts.append(_normalize_post({
            "post_id": key,
            "post_text": text,
            "author_name": author,
            "author_headline": title,
            "post_url": _clean_url(source_url),
            "published_at": age_label,
            "reactions_count": 0,
            "comments_count": 0,
            "comments": [],
            "raw_data": {
                "source": "public_activity_html",
                "title": title,
                "url": _clean_url(source_url),
                "age_label": age_label,
            },
        }))
        if len(posts) >= limit:
            break
    return posts


def fetch_public_linkedin_post(url: str) -> dict[str, Any] | None:
    cleaned = _clean_url(url)
    if not _is_public_linkedin_post_url(cleaned):
        logger.warning("Skipping non-public LinkedIn post URL: %s", url)
        return None
    response = requests.get(cleaned, headers=PUBLIC_HEADERS, timeout=20)
    if response.status_code != 200:
        logger.warning("LinkedIn public URL returned %s: %s", response.status_code, cleaned)
        return None
    post = parse_public_linkedin_html(response.text, cleaned)
    if not post or not post.get("content_text"):
        logger.warning("No public post text extracted from %s", cleaned)
        return None
    return post


def fetch_public_linkedin_url(url: str, limit: int = 10) -> list[dict[str, Any]]:
    cleaned = _clean_url(url)
    if not cleaned:
        return []
    if _is_public_linkedin_post_url(cleaned):
        post = fetch_public_linkedin_post(cleaned)
        return [post] if post else []
    if not _is_public_linkedin_activity_url(cleaned):
        logger.warning("Skipping unsupported LinkedIn public URL: %s", url)
        return []
    response = requests.get(cleaned, headers=PUBLIC_HEADERS, timeout=20)
    if response.status_code != 200:
        logger.warning("LinkedIn public activity URL returned %s: %s", response.status_code, cleaned)
        return []
    return parse_public_linkedin_activity_html(response.text, cleaned, limit=limit)


def discover_public_linkedin_urls(keywords: list[str], limit: int = 25, focuses: list[str] | None = None) -> list[str]:
    """Discover public LinkedIn post URLs through search-result pages."""
    queries = []
    requested_focuses = _normalize_focuses(focuses)
    keyword_seed = (keywords or DEFAULT_LINKEDIN_KEYWORDS)[:4]
    for keyword in keyword_seed:
        quoted = f'"{keyword}"'
        queries.extend([
            f"site:linkedin.com/posts {quoted}",
            f"site:linkedin.com/feed/update {quoted}",
            f"site:linkedin.com/posts {quoted} PW",
            f"site:linkedin.com/in {quoted}",
            f"site:linkedin.com/company {quoted}",
        ])
        for focus in requested_focuses:
            for term in FOCUS_QUERY_TERMS.get(focus, []):
                queries.extend([
                    f'site:linkedin.com/posts {quoted} "{term}"',
                    f'site:linkedin.com/feed/update {quoted} "{term}"',
                    f'site:linkedin.com/in {quoted} "{term}"',
                    f'site:linkedin.com/company {quoted} "{term}"',
                ])

    found: list[str] = []
    seen: set[str] = set()
    for query in queries:
        if len(found) >= limit:
            break
        time.sleep(random.uniform(1.5, 3.0))
        search_urls = [
            f"https://www.google.com/search?q={quote_plus(query)}&hl=en&gl=in&num=10",
            f"https://www.bing.com/search?q={quote_plus(query)}&setlang=en-IN&count=10",
            f"https://html.duckduckgo.com/html/?q={quote_plus(query)}",
        ]
        try:
            for search_url in search_urls:
                response = requests.get(search_url, headers=PUBLIC_HEADERS, timeout=15)
                if response.status_code != 200:
                    logger.warning("LinkedIn discovery returned %s for %s via %s", response.status_code, query, urlparse(search_url).netloc)
                    continue
                candidates = _extract_linkedin_candidates_from_search_html(response.text)
                for candidate in candidates:
                    cleaned = _clean_url(candidate)
                    if not cleaned or cleaned in seen or not (_is_public_linkedin_post_url(cleaned) or _is_public_linkedin_activity_url(cleaned)):
                        continue
                    seen.add(cleaned)
                    found.append(cleaned)
                    if len(found) >= limit:
                        break
                if len(found) >= limit or candidates:
                    break
        except Exception as exc:
            logger.warning("LinkedIn public discovery failed for '%s': %s", query, exc)
    return found


class LinkedInScraper(BaseScraper):
    platform = "linkedin"

    def __init__(self):
        super().__init__()
        self.custom_url = os.environ.get("LINKEDIN_CUSTOM_SCRAPER_URL", "").strip()
        self.custom_comments_url = os.environ.get("LINKEDIN_CUSTOM_COMMENTS_URL", "").strip()
        self.custom_token = os.environ.get("LINKEDIN_CUSTOM_SCRAPER_TOKEN", "").strip()
        self.proxycurl_key = os.environ.get("LINKEDIN_PROXYCURL_API_KEY", "").strip()
        self.company_urls = _env_list("LINKEDIN_COMPANY_URLS")
        self.public_urls = _env_list("LINKEDIN_PUBLIC_URLS")
        self.enable_public_discovery = os.environ.get("LINKEDIN_ENABLE_PUBLIC_DISCOVERY", "").lower() in {"1", "true", "yes"}
        self.active_focuses: list[str] = []

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": "oval-linkedin-collector/1.0", "Accept": "application/json"}
        if self.custom_token:
            headers["Authorization"] = f"Bearer {self.custom_token}"
        return headers

    async def _fetch_custom_posts(self, params: SearchParams) -> list[dict[str, Any]]:
        if not self.custom_url:
            return []

        payload = {
            "keywords": params.keywords or DEFAULT_LINKEDIN_KEYWORDS,
            "hashtags": params.hashtags,
            "limit": params.max_results_per_platform,
            "company_urls": self.company_urls,
            "after_date": params.after_date.isoformat() if params.after_date else None,
            "before_date": params.before_date.isoformat() if params.before_date else None,
        }

        def _request() -> list[dict[str, Any]]:
            response = requests.post(self.custom_url, json=payload, headers=self._headers(), timeout=self.timeout)
            response.raise_for_status()
            body = response.json()
            posts = body.get("posts", body) if isinstance(body, dict) else body
            if not isinstance(posts, list):
                return []
            return [_normalize_post(post) for post in posts]

        return await asyncio.get_event_loop().run_in_executor(None, _request)

    async def _fetch_proxycurl_posts(self, params: SearchParams) -> list[dict[str, Any]]:
        if not self.proxycurl_key or not self.company_urls:
            return []

        def _request() -> list[dict[str, Any]]:
            posts: list[dict[str, Any]] = []
            for company_url in self.company_urls:
                response = requests.get(
                    "https://nubela.co/proxycurl/api/linkedin/company/updates/",
                    headers={"Authorization": f"Bearer {self.proxycurl_key}", "Accept": "application/json"},
                    params={"url": company_url},
                    timeout=self.timeout,
                )
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                body = response.json()
                raw_posts = body.get("updates") or body.get("posts") or body.get("data") or []
                if isinstance(raw_posts, list):
                    posts.extend(_normalize_post(post) for post in raw_posts)
            return posts[: params.max_results_per_platform]

        return await asyncio.get_event_loop().run_in_executor(None, _request)

    async def search(self, params: SearchParams) -> list[dict[str, Any]]:
        """Search LinkedIn via configured custom collector or Proxycurl-compatible endpoint."""
        results = await self._retry(self._fetch_custom_posts, params)
        if not results:
            results = await self._retry(self._fetch_proxycurl_posts, params)
        if self.public_urls:
            public_posts = await self._retry(self._fetch_public_url_posts, self.public_urls)
            results.extend(public_posts)
        if self.enable_public_discovery:
            discovered_urls = await self._retry(self._discover_public_posts, params)
            public_posts = await self._retry(self._fetch_public_url_posts, discovered_urls)
            results.extend(public_posts)
        if not results:
            logger.warning("LinkedIn scraper has no configured data source. Set LINKEDIN_CUSTOM_SCRAPER_URL, LINKEDIN_PROXYCURL_API_KEY + LINKEDIN_COMPANY_URLS, LINKEDIN_PUBLIC_URLS, or LINKEDIN_ENABLE_PUBLIC_DISCOVERY=true.")
        unique: dict[str, dict[str, Any]] = {}
        for result in results:
            unique[result.get("post_id") or result.get("source_url") or _stable_id(result.get("content_text"))] = result
        return list(unique.values())

    async def _fetch_public_url_posts(self, urls: list[str]) -> list[dict[str, Any]]:
        def _request() -> list[dict[str, Any]]:
            posts: list[dict[str, Any]] = []
            for public_url in urls:
                try:
                    posts.extend(fetch_public_linkedin_url(public_url, limit=5))
                except Exception as exc:
                    logger.warning("Public LinkedIn ingest failed for %s: %s", public_url, exc)
            return posts

        return await asyncio.get_event_loop().run_in_executor(None, _request)

    async def _discover_public_posts(self, params: SearchParams) -> list[str]:
        def _request() -> list[str]:
            return discover_public_linkedin_urls(
                params.keywords or DEFAULT_LINKEDIN_KEYWORDS,
                params.max_results_per_platform,
                focuses=self.active_focuses,
            )

        return await asyncio.get_event_loop().run_in_executor(None, _request)

    async def scrape_comments(self, source_url: str, limit: int = 200) -> list[dict[str, Any]]:
        """Fetch comments from the custom comments endpoint when configured."""
        if not self.custom_comments_url:
            return []

        def _request() -> list[dict[str, Any]]:
            response = requests.post(
                self.custom_comments_url,
                json={"post_url": source_url, "limit": limit},
                headers=self._headers(),
                timeout=self.timeout,
            )
            response.raise_for_status()
            body = response.json()
            comments = body.get("comments", body) if isinstance(body, dict) else body
            return comments if isinstance(comments, list) else []

        return await asyncio.get_event_loop().run_in_executor(None, _request)

    async def scrape_and_store_post(self, post: dict[str, Any], brand_id: str) -> dict[str, Any]:
        row = {
            "brand_id": brand_id,
            "post_text": post.get("content_text", ""),
            "author_name": post.get("author_name", ""),
            "author_headline": post.get("author_headline", ""),
            "reactions_count": post.get("likes", 0),
            "comments_count": post.get("comments_count", 0),
            "shares_count": post.get("shares", 0),
            "published_date": post.get("published_at"),
            "company_page_followers": post.get("company_page_followers", 0),
            "employee_count": post.get("employee_count", 0),
            "job_postings_count": post.get("job_postings_count", 0),
            "post_url": post.get("source_url", ""),
            "raw_data": post.get("raw_data", {}),
        }
        stored_post: dict[str, Any] = {}
        try:
            table = get_service_client().table("linkedin_posts")
            post_url = str(post.get("source_url") or "").strip()
            existing = None
            if post_url:
                existing_resp = table.select("*").eq("brand_id", brand_id).eq("post_url", post_url).limit(1).execute()
                existing = existing_resp.data[0] if existing_resp.data else None
            if not existing and row["post_text"]:
                existing_resp = table.select("*").eq("brand_id", brand_id).eq("post_text", row["post_text"]).limit(1).execute()
                existing = existing_resp.data[0] if existing_resp.data else None
            if existing:
                stored = table.update(row).eq("id", existing["id"]).execute()
            else:
                stored = table.insert(row).execute()
            stored_post = stored.data[0] if stored.data else {}
        except Exception:
            logger.exception("Failed to store LinkedIn post; continuing with generic mention only")

        mention_ref = post.get("post_id") or stored_post.get("id") or _stable_id(post.get("source_url"), post.get("content_text"))
        mention = db.upsert_mention_by_platform_ref({
            "brand_id": brand_id,
            "platform": "linkedin",
            "platform_ref_id": mention_ref,
            "content_text": post.get("content_text", ""),
            "content_type": "linkedin_post",
            "author_handle": post.get("author_handle", ""),
            "author_name": post.get("author_name", ""),
            "engagement_score": post.get("engagement_score", 0),
            "likes": post.get("likes", 0),
            "shares": post.get("shares", 0),
            "comments_count": post.get("comments_count", 0),
            "language": post.get("language"),
            "source_url": post.get("source_url", ""),
            "published_at": post.get("published_at"),
            "raw_data": post.get("raw_data", {}),
        })
        stored_post["_mention_id"] = mention.get("id")
        return stored_post

    async def scrape_and_store_comments(self, post: dict[str, Any], brand_id: str, limit: int) -> int:
        raw_comments = post.get("comments") or []
        if not raw_comments and post.get("source_url"):
            raw_comments = await self.scrape_comments(post["source_url"], limit=limit)
        stored = 0
        for raw_comment in raw_comments[:limit]:
            comment = _normalize_comment(raw_comment, post)
            if not comment.get("content_text"):
                continue
            db.upsert_mention_by_platform_ref({
                "brand_id": brand_id,
                "platform": "linkedin",
                "platform_ref_id": comment["comment_id"],
                "content_text": comment["content_text"],
                "content_type": "linkedin_comment",
                "author_handle": comment.get("author_handle", ""),
                "author_name": comment.get("author_name", ""),
                "engagement_score": comment.get("engagement_score", 0),
                "likes": comment.get("likes", 0),
                "shares": 0,
                "comments_count": 0,
                "language": comment.get("language"),
                "source_url": comment.get("source_url", ""),
                "published_at": comment.get("published_at"),
                "raw_data": comment.get("raw_data", {}),
            })
            stored += 1
        return stored

    async def run_pipeline(self, brand_id: str, keywords: list[str], max_posts: int = 50, max_comments: int = 50, urls: list[str] | None = None, discover_public: bool = False, focuses: list[str] | None = None, days: int = 30, store: bool = True) -> dict[str, Any]:
        self.active_focuses = _normalize_focuses(focuses)
        params = SearchParams(
            keywords=keywords or DEFAULT_LINKEDIN_KEYWORDS,
            platforms=["linkedin"],
            brand_id=brand_id,
            max_results_per_platform=max_posts,
            after_date=datetime.now(timezone.utc) - timedelta(days=max(1, days)),
            before_date=datetime.now(timezone.utc),
        )
        has_configured_search_source = bool(self.custom_url or self.proxycurl_key or self.public_urls or self.enable_public_discovery)
        posts = await self.search(params) if has_configured_search_source else []
        if urls:
            posts.extend(await self._fetch_public_url_posts(urls))
        if discover_public:
            discovered_urls = await self._discover_public_posts(params)
            posts.extend(await self._fetch_public_url_posts(discovered_urls))
        posts = [post for post in posts if post.get("content_text") or post.get("source_url")]
        deduped: dict[str, dict[str, Any]] = {}
        for post in posts:
            deduped[post.get("post_id") or post.get("source_url") or _stable_id(post.get("content_text"))] = post
        posts = list(deduped.values())
        filtered_posts: list[dict[str, Any]] = []
        for post in posts:
            if not in_window(post.get("published_at"), params.after_date, params.before_date):
                continue
            if not is_physics_wallah_post(post):
                continue
            focus_meta = _focus_metadata(post, self.active_focuses)
            raw_data = dict(post.get("raw_data") or {})
            raw_data.update({
                "oval_focuses": focus_meta["focuses"],
                "oval_requested_focuses": focus_meta["requested_focuses"],
                "oval_negative_signal": focus_meta["negative_signal"],
                "oval_focus_signals": focus_meta["signals"],
                "oval_narrative": focus_meta["narrative"],
                "oval_target_team": focus_meta["target_team"],
            })
            post["raw_data"] = raw_data
            if self.active_focuses:
                if not focus_meta["matched_requested_focus"] or not focus_meta["negative_signal"]:
                    continue
            filtered_posts.append(post)
        posts = filtered_posts
        posts.sort(key=lambda post: post.get("published_at") or "", reverse=True)

        posts_stored = 0
        comments_stored = 0
        selected_posts = posts[:max_posts]
        if store:
            for post in selected_posts:
                await self.scrape_and_store_post(post, brand_id)
                posts_stored += 1
                comments_stored += await self.scrape_and_store_comments(post, brand_id, max_comments)

        return {
            "posts_found": len(posts),
            "posts_stored": posts_stored,
            "comments_stored": comments_stored,
            "focuses": self.active_focuses,
            "days": days,
            "source": "custom" if self.custom_url else "proxycurl" if self.proxycurl_key else "public" if urls or discover_public or self.public_urls or self.enable_public_discovery else "unconfigured",
            "posts": selected_posts if not store else [],
        }


_scraper = LinkedInScraper()
register_searcher("linkedin", _scraper.search)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description="LinkedIn custom scraper")
    parser.add_argument("--brand", default="PhysicsWallah")
    parser.add_argument("--brand-id")
    parser.add_argument("--keywords", default="")
    parser.add_argument("--urls", default="", help="Comma-separated public LinkedIn post URLs to ingest")
    parser.add_argument("--discover-public", action="store_true", help="Discover public LinkedIn posts from search results for the given keywords")
    parser.add_argument("--focus", default="", help="Comma-separated focus areas: hr,product")
    parser.add_argument("--days", type=int, default=30, help="Only keep posts within the last N days")
    parser.add_argument("--max-posts", type=int, default=50)
    parser.add_argument("--max-comments", type=int, default=50)
    parser.add_argument("--no-store", action="store_true", help="Collect information without writing to Supabase")
    parser.add_argument("--output-json", default="", help="Write collected posts and run metadata to this JSON file")
    args = parser.parse_args()

    keywords = [keyword.strip() for keyword in args.keywords.split(",") if keyword.strip()] or DEFAULT_LINKEDIN_KEYWORDS
    urls = [url.strip() for url in args.urls.split(",") if url.strip()]
    focuses = [focus.strip() for focus in args.focus.split(",") if focus.strip()]
    brand_id = args.brand_id
    if not brand_id:
        if args.no_store:
            brand_id = "read-only"
        else:
            brand = db.upsert_brand({"name": args.brand, "keywords": keywords[:5], "platforms": ["linkedin"]})
            brand_id = brand["id"]

    scraper = LinkedInScraper()
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            scraper.run_pipeline(
                brand_id,
                keywords,
                args.max_posts,
                args.max_comments,
                urls=urls,
                discover_public=args.discover_public,
                focuses=focuses,
                days=args.days,
                store=not args.no_store,
            )
        )
    finally:
        loop.close()

    if args.output_json:
        output_path = Path(args.output_json).expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        print(f"  output_json: {output_path}")

    print("LinkedIn scraper complete")
    for key, value in result.items():
        if key == "posts":
            continue
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
