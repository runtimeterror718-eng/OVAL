"""Sync OVAL channel evidence and summaries into Qdrant.

The script reuses the 1,536-dimensional OpenAI vectors already stored in
Supabase ``mention_embeddings``. It writes raw evidence points plus one stable
``channel_summary`` point per platform. Re-running it is idempotent.

Examples:
    python3.11 scripts/qdrant_channel_sync.py --check
    python3.11 scripts/qdrant_channel_sync.py --dry-run
    python3.11 scripts/qdrant_channel_sync.py --platform linkedin
    python3.11 scripts/qdrant_channel_sync.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from openai import OpenAI  # noqa: E402
from qdrant_client import QdrantClient, models  # noqa: E402

from config.settings import (  # noqa: E402
    OPENAI_API_KEY,
    OPENAI_MODEL,
    QDRANT_API_KEY,
    QDRANT_COLLECTION,
    QDRANT_EMBEDDING_MODEL,
    QDRANT_URL,
    X_BEARER_TOKEN,
)
from config.supabase_client import get_service_client  # noqa: E402

TARGET_BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f"
VECTOR_SIZE = 1536
SUPPORTED_PLATFORMS = ("playstore", "linkedin", "youtube", "freshdesk", "reddit", "x", "facebook", "instagram")
PLATFORM_LABELS = {
    "playstore": "Play Store",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "freshdesk": "Freshdesk",
    "reddit": "Reddit",
    "x": "X",
    "facebook": "Facebook",
    "instagram": "Instagram",
}
SEMANTIC_ARTIFACT = ROOT / "oval" / "src" / "data" / "semantic-clusters.json"
X_QUERY = '(PhysicsWallah OR "Physics Wallah" OR "PW Skills" OR "PW Vidyapeeth" OR "PW OnlyIAS" OR "PW app" OR "PW batch" OR "Alakh Pandey") -is:retweet'
NEGATIVE_RE = re.compile(r"scam|fraud|refund|toxic|worst|bad|poor|issue|problem|crash|mislead|layoff|fired|termination|complaint|cheat|fake|unpaid|overpriced|waste|delay|buffer|not working|disappoint|controvers|critici", re.I)
POSITIVE_RE = re.compile(r"great|good|best|excellent|proud|success|congrat|inspiring|growth|achievement|helpful|affordable|love", re.I)
LINKEDIN_HIRING_PROMO_RE = re.compile(r"\b(?:we(?:['’]re| are) hiring|now hiring|hiring alert|job opening|job vacancy|open roles?|apply now|walk[- ]?in interview|recruitment drive|join our team|send (?:your )?(?:cv|resume)|career opportunit(?:y|ies))\b", re.I)
LINKEDIN_COMPLAINT_RE = re.compile(r"\b(?:complaint|concern regarding recruitment|candidate communication|interview experience|offer (?:revoked|withdrawn)|ghosted|rejection without|toxic work culture|termination|terminated|forced resign|layoff|fired|unfair|fraud|scam|mislead|harass|corruption|retaliat|humiliat|broken promise|misconduct|support failure|no response)\b", re.I)


def stable_point_id(platform: str, source_id: Any) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"oval:{TARGET_BRAND_ID}:{platform}:{source_id}"))


def redact_text(value: Any) -> str:
    text = str(value or "").replace("\x00", " ")
    text = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[email]", text)
    text = re.sub(r"(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)", "[phone]", text)
    return re.sub(r"\s+", " ", text).strip()


def require_configuration() -> None:
    missing = []
    if not QDRANT_URL:
        missing.append("QDRANT_URL")
    if not QDRANT_API_KEY:
        missing.append("QDRANT_API_KEY")
    if missing:
        raise RuntimeError(f"Missing Qdrant configuration: {', '.join(missing)}")


def qdrant() -> QdrantClient:
    require_configuration()
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=30)


def ensure_collection(client: QdrantClient) -> None:
    if client.collection_exists(QDRANT_COLLECTION):
        info = client.get_collection(QDRANT_COLLECTION)
        vector_config = info.config.params.vectors
        configured_size = getattr(vector_config, "size", None)
        if configured_size != VECTOR_SIZE:
            raise RuntimeError(
                f"Collection {QDRANT_COLLECTION} has vector size {configured_size}; expected {VECTOR_SIZE}. "
                "Use a new collection name rather than mixing incompatible embeddings."
            )
    else:
        client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE),
            on_disk_payload=True,
        )
    for field in ("document_type", "platform", "brand_id", "sentiment_label"):
        client.create_payload_index(
            collection_name=QDRANT_COLLECTION,
            field_name=field,
            field_schema=models.PayloadSchemaType.KEYWORD,
            wait=True,
        )


def fetch_embedded_rows(platform: str, limit: int) -> list[dict[str, Any]]:
    response = (
        get_service_client()
        .table("mention_embeddings")
        .select(
            "id,brand_id,platform,content_text,content_type,platform_ref_id,"
            "source_url,author_handle,sentiment_label,sentiment_score,issue_type,"
            "severity,is_pr_risk,likes,comments_count,views,upvotes,embedding_openai"
        )
        .eq("brand_id", TARGET_BRAND_ID)
        .eq("platform", platform)
        .not_.is_("embedding_openai", "null")
        .limit(limit)
        .execute()
    )
    rows = response.data or []
    valid_rows = []
    for row in rows:
        vector = row.get("embedding_openai")
        if isinstance(vector, str):
            try:
                vector = json.loads(vector)
            except json.JSONDecodeError:
                continue
        if isinstance(vector, list) and len(vector) == VECTOR_SIZE:
            row["embedding_openai"] = vector
            valid_rows.append(row)
    return valid_rows


def fetch_linkedin_rows(limit: int) -> list[dict[str, Any]]:
    sb = get_service_client()
    brands = sb.table("brands").select("id").eq("name", "PhysicsWallah").execute().data or []
    brand_ids = [row["id"] for row in brands]
    if not brand_ids:
        return []
    rows = (
        sb.table("linkedin_posts")
        .select("id,post_text,post_url,author_name,published_date,reactions_count,comments_count,raw_data")
        .in_("brand_id", brand_ids)
        .order("published_date", desc=True)
        .limit(limit)
        .execute().data or []
    )
    result = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    for row in rows:
        text = redact_text(row.get("post_text"))
        raw = row.get("raw_data") or {}
        published_at = row.get("published_date")
        # Keep the semantic index aligned with the public LinkedIn API. Legacy
        # imports that do not mention PW, or contain only a tiny fragment, must
        # not contribute issue counts that the dashboard cannot evidence.
        source_copy = f"{text} {raw.get('title') or ''}"
        if (published_at and str(published_at) < cutoff.isoformat()) or len(text) <= 20 or not re.search(
            r"\b(physics\s*wallah|physicswallah|pw skills|pw vidyapeeth|alakh pandey|infinity pro|pwians?|pwstories|gyaan-e|gate wallah)\b|#pw\b",
            source_copy,
            flags=re.I,
        ) or (LINKEDIN_HIRING_PROMO_RE.search(source_copy) and not LINKEDIN_COMPLAINT_RE.search(source_copy)):
            continue
        sentiment = str(raw.get("sentiment") or "neutral").lower()
        result.append({
            "id": stable_point_id("linkedin", row.get("id")),
            "brand_id": TARGET_BRAND_ID,
            "platform": "linkedin",
            "content_text": text,
            "content_type": "post",
            "platform_ref_id": str(row.get("id")),
            "source_url": row.get("post_url"),
            "author_handle": row.get("author_name"),
            "sentiment_label": sentiment if sentiment in {"positive", "neutral", "negative"} else "neutral",
            "issue_type": raw.get("category"),
            "likes": row.get("reactions_count") or 0,
            "comments_count": row.get("comments_count") or 0,
            "published_at": row.get("published_date"),
        })
    return result


def fetch_playstore_rows(limit: int) -> list[dict[str, Any]]:
    path = ROOT / "oval" / "src" / "data" / "playstore-live-reviews.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    reviews = list((payload.get("reviews") or {}).values())
    reviews.sort(key=lambda row: str(row.get("date") or ""), reverse=True)
    result = []
    for row in reviews[:limit]:
        text = redact_text(row.get("text"))
        if not text:
            continue
        rating = int(row.get("rating") or 0)
        result.append({
            "id": stable_point_id("playstore", row.get("reviewId")),
            "brand_id": TARGET_BRAND_ID,
            "platform": "playstore",
            "content_text": text,
            "content_type": "review",
            "platform_ref_id": row.get("reviewId"),
            "author_handle": row.get("author"),
            "sentiment_label": "positive" if rating >= 4 else "negative" if rating <= 2 else "neutral",
            "sentiment_score": rating,
            "published_at": row.get("date"),
        })
    return result


def fetch_freshdesk_rows(limit: int) -> list[dict[str, Any]]:
    path = ROOT / "oval" / "src" / "data" / "freshdesk-insights.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    candidates = [*(payload.get("activeExamples") or []), *(payload.get("urgentExamples") or [])]
    seen = set()
    result = []
    for row in candidates:
        ticket_id = str(row.get("ticketId") or "")
        if not ticket_id or ticket_id in seen:
            continue
        seen.add(ticket_id)
        text = redact_text(f"{row.get('subject') or ''}. {row.get('description') or ''}")
        if not text:
            continue
        result.append({
            "id": stable_point_id("freshdesk", ticket_id),
            "brand_id": TARGET_BRAND_ID,
            "platform": "freshdesk",
            "content_text": text,
            "content_type": "ticket",
            "platform_ref_id": ticket_id,
            "sentiment_label": "negative",
            "issue_type": row.get("category") or row.get("issueL1"),
            "severity": "high" if row in (payload.get("urgentExamples") or []) else "medium",
            "status": row.get("status"),
        })
        if len(result) >= limit:
            break
    return result


def classify_x_sentiment(text: str) -> str:
    if NEGATIVE_RE.search(text):
        return "negative"
    if POSITIVE_RE.search(text):
        return "positive"
    return "neutral"


def fetch_x_rows(limit: int) -> list[dict[str, Any]]:
    """Read recent public X evidence through the official API for explicit syncs."""
    if not X_BEARER_TOKEN:
        return []
    params = urllib.parse.urlencode({
        "query": X_QUERY,
        "max_results": str(max(10, min(100, limit))),
        "tweet.fields": "created_at,public_metrics,lang,author_id",
        "expansions": "author_id",
        "user.fields": "username,name,verified",
    })
    request = urllib.request.Request(
        f"https://api.x.com/2/tweets/search/recent?{params}",
        headers={"Authorization": f"Bearer {X_BEARER_TOKEN}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"x: official API retrieval unavailable ({type(exc).__name__})")
        return []
    users = {str(user.get("id")): user for user in payload.get("includes", {}).get("users", [])}
    rows = []
    for item in payload.get("data", []):
        text = redact_text(item.get("text"))
        if not text:
            continue
        user = users.get(str(item.get("author_id")), {})
        author = str(user.get("username") or "X user")
        metrics = item.get("public_metrics") or {}
        post_id = str(item.get("id") or "")
        rows.append({
            "id": stable_point_id("x", post_id),
            "brand_id": TARGET_BRAND_ID,
            "platform": "x",
            "content_text": text,
            "content_type": "post",
            "platform_ref_id": post_id,
            "source_url": f"https://x.com/{author}/status/{post_id}",
            "author_handle": author,
            "sentiment_label": classify_x_sentiment(text),
            "likes": int(metrics.get("like_count") or 0),
            "comments_count": int(metrics.get("reply_count") or 0),
            "upvotes": int(metrics.get("retweet_count") or 0),
            "published_at": item.get("created_at"),
        })
    return rows


def fetch_owned_social_rows(platform: str, limit: int) -> list[dict[str, Any]]:
    """Load OAuth-owned posts and comments when mention embeddings are not ready yet."""
    sb = get_service_client()
    posts = (
        sb.table("owned_social_posts")
        .select("id,provider_post_id,content_text,author_name,author_username,source_url,published_at,likes_count,comments_count,shares_count")
        .eq("brand_id", TARGET_BRAND_ID)
        .eq("provider", platform)
        .order("published_at", desc=True)
        .limit(limit)
        .execute().data or []
    )
    comments = (
        sb.table("owned_social_comments")
        .select("id,provider_comment_id,content_text,author_name,author_username,source_url,published_at,likes_count,replies_count")
        .eq("brand_id", TARGET_BRAND_ID)
        .eq("provider", platform)
        .order("published_at", desc=True)
        .limit(limit)
        .execute().data or []
    )
    result = []
    for kind, rows in (("post", posts), ("comment", comments)):
        for row in rows:
            text = redact_text(row.get("content_text"))
            if not text:
                continue
            source_id = row.get("provider_post_id") if kind == "post" else row.get("provider_comment_id")
            result.append({
                "id": stable_point_id(platform, f"owned:{kind}:{source_id}"),
                "brand_id": TARGET_BRAND_ID,
                "platform": platform,
                "content_text": text,
                "content_type": kind,
                "platform_ref_id": str(source_id),
                "source_url": row.get("source_url"),
                "author_handle": row.get("author_username") or row.get("author_name"),
                "sentiment_label": classify_x_sentiment(text),
                "likes": row.get("likes_count") or 0,
                "comments_count": row.get("comments_count") or row.get("replies_count") or 0,
                "upvotes": row.get("shares_count") or 0,
                "published_at": row.get("published_at"),
                "source_type": "owned",
            })
    result.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
    return result[:limit]


def fetch_channel_rows(platform: str, limit: int) -> list[dict[str, Any]]:
    embedded = fetch_embedded_rows(platform, limit)
    if embedded:
        return embedded
    if platform == "linkedin":
        return fetch_linkedin_rows(limit)
    if platform == "playstore":
        return fetch_playstore_rows(limit)
    if platform == "freshdesk":
        return fetch_freshdesk_rows(limit)
    if platform == "x":
        return fetch_x_rows(limit)
    if platform in {"facebook", "instagram"}:
        return fetch_owned_social_rows(platform, limit)
    return []


def add_missing_embeddings(rows: list[dict[str, Any]], openai_client: OpenAI) -> None:
    missing = [row for row in rows if not row.get("embedding_openai")]
    for start in range(0, len(missing), 100):
        batch = missing[start:start + 100]
        response = openai_client.embeddings.create(
            model=QDRANT_EMBEDDING_MODEL,
            input=[row["content_text"][:8000] for row in batch],
        )
        for row, item in zip(batch, response.data):
            if len(item.embedding) != VECTOR_SIZE:
                raise RuntimeError(f"Unexpected embedding size: {len(item.embedding)}")
            row["embedding_openai"] = item.embedding


def clean_payload(row: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "id", "brand_id", "platform", "content_text", "content_type",
        "platform_ref_id", "source_url", "author_handle", "sentiment_label",
        "sentiment_score", "issue_type", "severity", "is_pr_risk", "likes",
        "comments_count", "views", "upvotes",
        "published_at", "status", "source_type",
    }
    payload = {key: value for key, value in row.items() if key in allowed and value is not None}
    payload["document_type"] = "channel_evidence"
    return payload


def evidence_points(rows: list[dict[str, Any]]) -> list[models.PointStruct]:
    return [
        models.PointStruct(
            id=str(row["id"]),
            vector=row["embedding_openai"],
            payload=clean_payload(row),
        )
        for row in rows
    ]


def fallback_summary(platform: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    platform_label = PLATFORM_LABELS.get(platform, platform.title())
    sentiments = Counter(str(row.get("sentiment_label") or "neutral").lower() for row in rows)
    issues = Counter(str(row.get("issue_type") or "General conversation").strip() for row in rows)
    top_issue = issues.most_common(1)[0][0] if issues else "general conversation"
    total = len(rows)
    negative = sentiments.get("negative", 0)
    negative_rate = round((negative / total) * 100) if total else 0
    positive = sentiments.get("positive", 0)
    neutral = sentiments.get("neutral", 0)
    dated = sorted(str(row.get("published_at"))[:10] for row in rows if row.get("published_at"))
    window_label = f"{dated[0]} to {dated[-1]}" if len(dated) > 1 else dated[0] if dated else "current indexed snapshot"
    top_issues = [{"label": label, "count": count} for label, count in issues.most_common(5)]
    action_by_platform = {
        "playstore": "Review low-rating evidence by app version and assign the dominant reproducible issue to Product and Engineering.",
        "linkedin": "Review the highest-engagement critical posts and decide whether Communications should respond, clarify, or monitor.",
        "youtube": "Review high-reach negative videos and comments together before choosing a PR or content response.",
        "freshdesk": "Route the largest unresolved ticket cluster to its operational owner and track resolution separately from ticket volume.",
        "reddit": "Inspect the most engaged negative threads and feed recurring product or support problems to the owning team.",
        "x": "Validate the most engaged critical posts, separate original claims from amplification, and assign the underlying issue before responding.",
        "facebook": "Review the largest owned-Page comment cluster and route the underlying product or support problem to one accountable team.",
        "instagram": "Review the most repeated owned-account comment theme and decide whether Product, Support, Content, or Communications should act.",
    }
    why_by_platform = {
        "playstore": "Repeated low-rating feedback can identify release-specific product friction and affect store conversion.",
        "linkedin": "Critical professional-network posts can shape employer, parent, investor, and partner perception.",
        "youtube": "High-reach creator narratives can spread faster than owned-channel corrections.",
        "freshdesk": "Unresolved support demand represents blocked student journeys, not just negative sentiment.",
        "reddit": "Student-led discussion often exposes recurring questions and frustration before formal escalation.",
        "x": "Fast-moving public posts can connect isolated operational complaints to the wider founder and brand narrative.",
        "facebook": "Comments on owned Page posts provide direct evidence of how followers interpret campaigns, products, and support outcomes.",
        "instagram": "Replies on owned media reveal immediate audience reaction and recurring experience gaps around high-reach content.",
    }
    return {
        "headline": f"{top_issue} is the leading {platform_label} theme; {negative} of {total} signals {'is' if negative == 1 else 'are'} negative.",
        "summary": f"Across {total} indexed signals, the conversation contains {positive} positive, {neutral} neutral, and {negative} negative items. {top_issue} is the most frequently tagged theme.",
        "what_is_happening": f"{top_issue} is the largest retrieved theme. Negative evidence accounts for {negative_rate}% of the {total} indexed {platform_label} signals.",
        "why_it_matters": why_by_platform.get(platform, "The repeated pattern may require product, support, or communications follow-up."),
        "recommended_action": action_by_platform.get(platform, "Review the strongest evidence and assign the recurring issue to an accountable owner."),
        "key_findings": [
            {"label": item["label"], "count": item["count"], "interpretation": f"{item['count']} indexed {'signal is' if item['count'] == 1 else 'signals are'} tagged to this theme."}
            for item in top_issues[:3]
        ],
        "top_theme": top_issue,
        "issue_breakdown": top_issues,
        "window_label": window_label,
        "confidence_note": f"Based on {total} indexed signals. This is a snapshot; it does not claim a trend increase without time-series evidence.",
        "sentiment": {
            "positive": positive,
            "neutral": neutral,
            "negative": negative,
        },
        "risk_level": "high" if negative_rate >= 35 else "medium" if negative_rate >= 15 else "low",
    }


def generate_summary(platform: str, rows: list[dict[str, Any]], openai_client: OpenAI | None) -> dict[str, Any]:
    fallback = fallback_summary(platform, rows)
    if openai_client is None or not rows:
        return fallback

    ranked = sorted(
        rows,
        key=lambda row: (
            str(row.get("sentiment_label")).lower() == "negative",
            bool(row.get("is_pr_risk")),
            str(row.get("severity")).lower() in {"high", "critical"},
            int(row.get("comments_count") or 0) + int(row.get("likes") or 0),
        ),
        reverse=True,
    )[:40]
    evidence = [
        {
            "sentiment": row.get("sentiment_label") or "neutral",
            "issue": row.get("issue_type") or "general",
            "text": str(row.get("content_text") or "")[:600],
        }
        for row in ranked
    ]
    try:
        completion = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior brand-intelligence analyst. Explain what is happening now on one "
                        "Physics Wallah channel using only the supplied evidence and aggregate counts. Be direct, "
                        "specific, and useful to Product, Support, Communications, and leadership. Do not say a "
                        "topic is rising, falling, viral, or trending unless the supplied time evidence proves it. "
                        "Never invent counts, causes, owners, or business impact. Return JSON with: headline "
                        "(max 18 words); what_is_happening (max 45 words, include the dominant pattern and exact "
                        "sentiment counts); why_it_matters (max 30 words); recommended_action (max 25 words); "
                        "top_theme; risk_level (low|medium|high); and key_findings (2-3 objects with label, count, "
                        "and one-sentence interpretation). Use only counts present in sentiment or issue_breakdown."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "platform": platform,
                        "window": fallback["window_label"],
                        "sentiment": fallback["sentiment"],
                        "issue_breakdown": fallback["issue_breakdown"],
                        "evidence": evidence,
                    }),
                },
            ],
        )
        parsed = json.loads(completion.choices[0].message.content or "{}")
        return {
            **fallback,
            "headline": str(parsed.get("headline") or fallback["headline"]),
            "what_is_happening": str(parsed.get("what_is_happening") or fallback["what_is_happening"]),
            "why_it_matters": str(parsed.get("why_it_matters") or fallback["why_it_matters"]),
            "recommended_action": str(parsed.get("recommended_action") or fallback["recommended_action"]),
            # Keep finding labels and counts deterministic. The model explains the
            # pattern, but it cannot silently alter the measured aggregation.
            "key_findings": fallback["key_findings"],
            "top_theme": str(parsed.get("top_theme") or fallback["top_theme"]),
            "risk_level": str(parsed.get("risk_level") or fallback["risk_level"]).lower()
            if str(parsed.get("risk_level") or "").lower() in {"low", "medium", "high"}
            else fallback["risk_level"],
        }
    except Exception:
        return fallback


def embed_summary(summary: dict[str, Any], openai_client: OpenAI) -> list[float]:
    text = " ".join([
        summary["headline"],
        summary.get("what_is_happening", summary.get("summary", "")),
        summary.get("why_it_matters", ""),
        summary.get("recommended_action", ""),
        f"Theme: {summary['top_theme']}",
    ])
    response = openai_client.embeddings.create(model=QDRANT_EMBEDDING_MODEL, input=[text])
    vector = response.data[0].embedding
    if len(vector) != VECTOR_SIZE:
        raise RuntimeError(f"Unexpected embedding size: {len(vector)}")
    return vector


def summary_point(platform: str, rows: list[dict[str, Any]], openai_client: OpenAI) -> models.PointStruct:
    summary = generate_summary(platform, rows, openai_client)
    payload = {
        "document_type": "channel_summary",
        "brand_id": TARGET_BRAND_ID,
        "platform": platform,
        "source_count": len(rows),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **summary,
    }
    point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"oval:{TARGET_BRAND_ID}:{platform}:latest-summary"))
    return models.PointStruct(id=point_id, vector=embed_summary(summary, openai_client), payload=payload)


def semantic_cluster_points(platform: str, openai_client: OpenAI) -> list[models.PointStruct]:
    """Embed deterministic semantic clusters into the canonical 1,536d collection."""
    if not SEMANTIC_ARTIFACT.exists():
        return []
    artifact = json.loads(SEMANTIC_ARTIFACT.read_text(encoding="utf-8"))
    platform_data = (artifact.get("platforms") or {}).get(platform) or {}
    clusters = platform_data.get("clusters") or []
    if not clusters:
        return []
    texts = [
        " ".join([
            str(cluster.get("label") or ""),
            str(cluster.get("summary") or ""),
            str(cluster.get("why_it_matters") or ""),
            " ".join(cluster.get("subthemes") or []),
        ])[:8000]
        for cluster in clusters
    ]
    response = openai_client.embeddings.create(model=QDRANT_EMBEDDING_MODEL, input=texts)
    points = []
    for cluster, item in zip(clusters, response.data):
        public_cluster = {key: value for key, value in cluster.items() if key != "vector"}
        points.append(models.PointStruct(
            id=str(cluster.get("id") or stable_point_id(platform, f"semantic:{cluster.get('label')}")),
            vector=item.embedding,
            payload={
                "document_type": "semantic_cluster",
                "brand_id": TARGET_BRAND_ID,
                "platform": platform,
                "generated_at": artifact.get("generated_at"),
                "source_count": platform_data.get("source_count", 0),
                "cluster_method": platform_data.get("method"),
                **public_cluster,
            },
        ))
    return points


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify credentials and list collections only")
    parser.add_argument("--dry-run", action="store_true", help="Read and validate rows without writing to Qdrant")
    parser.add_argument("--platform", choices=SUPPORTED_PLATFORMS, action="append")
    parser.add_argument("--limit-per-platform", type=int, default=500)
    parser.add_argument("--skip-summaries", action="store_true")
    parser.add_argument("--skip-semantic-clusters", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.check:
        client = qdrant()
        collections = [item.name for item in client.get_collections().collections]
        print(f"Qdrant connection OK. Collections: {len(collections)}")
        return 0

    platforms = tuple(args.platform or SUPPORTED_PLATFORMS)
    rows_by_platform = {platform: fetch_channel_rows(platform, args.limit_per_platform) for platform in platforms}
    for platform, rows in rows_by_platform.items():
        embedded_count = sum(1 for row in rows if row.get("embedding_openai"))
        print(f"{platform}: {len(rows)} source rows ({embedded_count} already embedded)")
    if args.dry_run:
        return 0

    client = qdrant()
    ensure_collection(client)
    openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
    if not args.skip_summaries and openai_client is None:
        raise RuntimeError("OPENAI_API_KEY is required to embed channel summaries")

    for platform, rows in rows_by_platform.items():
        if rows and openai_client is None and any(not row.get("embedding_openai") for row in rows):
            raise RuntimeError(f"OPENAI_API_KEY is required to embed {platform} source rows")
        if rows and openai_client is not None:
            add_missing_embeddings(rows, openai_client)
        points = evidence_points(rows)
        if points:
            client.upload_points(
                collection_name=QDRANT_COLLECTION,
                points=points,
                batch_size=100,
                max_retries=3,
                wait=True,
            )
        if not args.skip_semantic_clusters and openai_client is not None:
            cluster_points = semantic_cluster_points(platform, openai_client)
            client.delete(
                collection_name=QDRANT_COLLECTION,
                points_selector=models.FilterSelector(filter=models.Filter(must=[
                    models.FieldCondition(key="document_type", match=models.MatchValue(value="semantic_cluster")),
                    models.FieldCondition(key="brand_id", match=models.MatchValue(value=TARGET_BRAND_ID)),
                    models.FieldCondition(key="platform", match=models.MatchValue(value=platform)),
                ])),
                wait=True,
            )
            if cluster_points:
                client.upsert(collection_name=QDRANT_COLLECTION, points=cluster_points, wait=True)
        if not args.skip_summaries and openai_client is not None:
            client.upsert(
                collection_name=QDRANT_COLLECTION,
                points=[summary_point(platform, rows, openai_client)],
                wait=True,
            )
        print(f"{platform}: synced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
