"""
Build a compact Play Store intelligence artifact from Google Play Console CSV exports.

The exports are UTF-16 CSV files. This script intentionally stores aggregates and a
small set of representative reviews instead of committing the full raw review dump.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any


APP_NAMES = {
    "xyz.penpencil.physicswala": "Physics Wallah",
    "xyz.penpencil.unigo": "UniGo",
}

DEVICE_BRAND_PATTERNS = [
    ("Realme", re.compile(r"^(RMX|RE)", re.I)),
    ("OnePlus", re.compile(r"^(OP|CPH)", re.I)),
    ("Vivo / iQOO", re.compile(r"^V\d", re.I)),
    ("Samsung", re.compile(r"^(SM-|gta|a\d|beyond|star|dream)", re.I)),
    ("Xiaomi / Redmi", re.compile(r"^(Redmi|Mi |dandelion|sweet|sunny|mojito|camellia|lancelot|merlin)", re.I)),
    ("Motorola", re.compile(r"^(moto|fogos|rhode|hawaii|devon)", re.I)),
    ("Oppo", re.compile(r"^(P[A-Z]\w+|A\d{2,})", re.I)),
]

THEMES = {
    "Video & Playback": [
        "video", "playback", "buffer", "quality", "2x", "speed", "lecture", "download",
    ],
    "Login & Access": [
        "login", "log in", "otp", "open", "access", "account", "sign in", "not opening",
    ],
    "App Stability": [
        "crash", "bug", "glitch", "hang", "freeze", "slow", "lag", "loading", "not working",
    ],
    "Payments & Refunds": [
        "refund", "payment", "paid", "money", "fee", "fees", "purchase", "subscription",
    ],
    "Batch & Course Access": [
        "batch", "course", "class", "dpp", "test series", "material", "kit", "notes",
    ],
    "Support Experience": [
        "support", "customer care", "response", "contact", "help", "resolve", "complaint",
    ],
    "Teaching & Content": [
        "teacher", "faculty", "teaching", "content", "study", "learning", "sir", "mam",
    ],
    "Notifications & Ads": [
        "notification", "ads", "advertisement", "spam", "popup", "promotion",
    ],
}

POSITIVE_TERMS = [
    "good", "best", "great", "helpful", "excellent", "amazing", "love", "thank",
    "useful", "nice", "awesome", "affordable",
]

COMPLAINT_TERMS = [
    "not working", "not opening", "cannot", "can't", "unable", "issue", "problem",
    "bug", "glitch", "crash", "slow", "lag", "refund", "worst", "bad", "disappointed",
    "please fix", "need", "missing", "improve", "error", "failed", "delay", "wrong",
]

REQUEST_TERMS = [
    "please", "should", "need", "request", "add", "feature", "improve", "allow",
    "bring", "make", "want", "kindly", "option",
]


def parse_dt(value: str) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def read_reviews(paths: list[Path]) -> list[dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for path in paths:
        with path.open("r", encoding="utf-16", newline="") as handle:
            for row in csv.DictReader(handle):
                package = (row.get("Package Name") or "").strip()
                if not package:
                    continue
                key = (row.get("Review Link") or "").strip()
                if not key:
                    key = "|".join(
                        [
                            package,
                            row.get("Review Submit Millis Since Epoch") or "",
                            row.get("Review Text") or "",
                            row.get("Star Rating") or "",
                        ]
                    )
                rows[key] = {
                    "package": package,
                    "version_code": int(row.get("App Version Code") or 0),
                    "version": (row.get("App Version Name") or "").strip() or "Unknown",
                    "language": (row.get("Reviewer Language") or "").strip() or "unknown",
                    "device": (row.get("Device") or "").strip() or "Unknown",
                    "submitted_at": parse_dt(row.get("Review Submit Date and Time") or ""),
                    "updated_at": parse_dt(row.get("Review Last Update Date and Time") or ""),
                    "rating": int(row.get("Star Rating") or 0),
                    "title": (row.get("Review Title") or "").strip(),
                    "text": (row.get("Review Text") or "").strip(),
                    "reply_at": parse_dt(row.get("Developer Reply Date and Time") or ""),
                    "reply_text": (row.get("Developer Reply Text") or "").strip(),
                    "link": (row.get("Review Link") or "").strip(),
                }
    return list(rows.values())


def pct(part: int | float, total: int | float) -> float:
    return round((part / total * 100), 1) if total else 0.0


def avg(values: list[int | float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def month_key(row: dict[str, Any]) -> str:
    date = row["updated_at"] or row["submitted_at"]
    return date.strftime("%Y-%m") if date else "Unknown"


def normalize_text(row: dict[str, Any]) -> str:
    return f"{row['title']} {row['text']}".lower()


def sample_review(row: dict[str, Any], theme: str | None = None) -> dict[str, Any]:
    text = re.sub(r"\s+", " ", row["text"] or row["title"]).strip()
    return {
        "rating": row["rating"],
        "text": text[:320],
        "version": row["version"],
        "date": (row["updated_at"] or row["submitted_at"]).date().isoformat()
        if (row["updated_at"] or row["submitted_at"])
        else None,
        "replied": bool(row["reply_at"]),
        "theme": theme,
    }


def review_track(row: dict[str, Any]) -> str:
    text = normalize_text(row)
    has_complaint = any(term in text for term in COMPLAINT_TERMS)
    has_request = any(term in text for term in REQUEST_TERMS)
    has_positive = any(term in text for term in POSITIVE_TERMS)
    if has_request:
        return "What's being asked for"
    if row["rating"] <= 3 or has_complaint:
        return "What's broken"
    if row["rating"] >= 4 and has_positive:
        return "What's loved"
    return "Other written feedback"


def device_brand(device: str) -> str:
    value = (device or "").strip()
    if not value or value == "Unknown":
        return "Unknown"
    for brand, pattern in DEVICE_BRAND_PATTERNS:
        if pattern.search(value):
            return brand
    return "Other Android"


def summarize_app(package: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    ratings = [row["rating"] for row in rows if row["rating"]]
    text_rows = [row for row in rows if row["text"] or row["title"]]
    negative_rows = [row for row in text_rows if row["rating"] <= 2]
    replied_rows = [row for row in rows if row["reply_at"]]
    negative_replied = [row for row in negative_rows if row["reply_at"]]

    reply_hours = []
    for row in replied_rows:
        submitted = row["submitted_at"]
        replied = row["reply_at"]
        if submitted and replied and replied >= submitted:
            reply_hours.append((replied - submitted).total_seconds() / 3600)

    monthly: list[dict[str, Any]] = []
    grouped_months: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped_months[month_key(row)].append(row)
    for month, month_rows in sorted(grouped_months.items()):
        month_ratings = [row["rating"] for row in month_rows if row["rating"]]
        low = sum(1 for rating in month_ratings if rating <= 2)
        month_replies = sum(1 for row in month_rows if row["reply_at"])
        monthly.append(
            {
                "month": month,
                "reviews": len(month_rows),
                "averageRating": avg(month_ratings),
                "lowRatingRate": pct(low, len(month_ratings)),
                "replyRate": pct(month_replies, len(month_rows)),
            }
        )
    daily: list[dict[str, Any]] = []
    grouped_days: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        date = row["updated_at"] or row["submitted_at"]
        if date:
            grouped_days[date.date().isoformat()].append(row)
    for day, day_rows in sorted(grouped_days.items()):
        day_ratings = [row["rating"] for row in day_rows if row["rating"]]
        low = sum(1 for rating in day_ratings if rating <= 2)
        day_replies = sum(1 for row in day_rows if row["reply_at"])
        daily.append(
            {
                "date": day,
                "reviews": len(day_rows),
                "averageRating": avg(day_ratings),
                "lowRatingRate": pct(low, len(day_ratings)),
                "replyRate": pct(day_replies, len(day_rows)),
            }
        )

    distribution = Counter(ratings)
    rating_distribution = [
        {"rating": rating, "count": distribution[rating], "share": pct(distribution[rating], len(ratings))}
        for rating in range(5, 0, -1)
    ]

    theme_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in text_rows:
        text = normalize_text(row)
        for theme, keywords in THEMES.items():
            if any(keyword in text for keyword in keywords):
                theme_rows[theme].append(row)

    themes = []
    for theme, matched in sorted(theme_rows.items(), key=lambda item: len(item[1]), reverse=True):
        replied = sum(1 for row in matched if row["reply_at"])
        examples = sorted(
            matched,
            key=lambda row: (
                0 if review_track(row) == "What's broken" else 1,
                row["rating"],
                -(len(row["text"] or row["title"])),
            ),
        )
        track_counts = Counter(review_track(row) for row in matched)
        themes.append(
            {
                "name": theme,
                "mentions": len(matched),
                "shareOfTextReviews": pct(len(matched), len(text_rows)),
                "replyRate": pct(replied, len(matched)),
                "trackBreakdown": dict(track_counts),
                "examples": [sample_review(row, theme) for row in examples[:24]],
            }
        )

    track_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in text_rows:
        track_rows[review_track(row)].append(row)
    text_tracks = []
    for track in ["What's broken", "What's loved", "What's being asked for", "Other written feedback"]:
        matched = track_rows.get(track, [])
        if not matched:
            continue
        replied = sum(1 for row in matched if row["reply_at"])
        ordered = sorted(matched, key=lambda row: (row["rating"], -len(row["text"] or row["title"])))
        text_tracks.append(
            {
                "name": track,
                "count": len(matched),
                "shareOfTextReviews": pct(len(matched), len(text_rows)),
                "replyRate": pct(replied, len(matched)),
                "examples": [sample_review(row) for row in ordered[:24]],
            }
        )

    divergent_reviews = [
        row for row in text_rows
        if row["rating"] >= 4 and any(term in normalize_text(row) for term in COMPLAINT_TERMS)
    ]
    divergent_reviews.sort(key=lambda row: (-row["rating"], -len(row["text"] or row["title"])))

    reply_bands = []
    for label, band_rows in [
        ("1 star", [row for row in rows if row["rating"] == 1]),
        ("2-3 stars", [row for row in rows if row["rating"] in {2, 3}]),
        ("4 stars", [row for row in rows if row["rating"] == 4]),
        ("5 stars", [row for row in rows if row["rating"] == 5]),
    ]:
        band_text_rows = [row for row in band_rows if row["text"] or row["title"]]
        replied = sum(1 for row in band_rows if row["reply_at"])
        text_replied = sum(1 for row in band_text_rows if row["reply_at"])
        reply_bands.append(
            {
                "label": label,
                "reviews": len(band_rows),
                "textReviews": len(band_text_rows),
                "replyRate": pct(replied, len(band_rows)),
                "textReplyRate": pct(text_replied, len(band_text_rows)),
                "unrepliedTextReviews": len(band_text_rows) - text_replied,
                "unrepliedExamples": [
                    sample_review(row)
                    for row in sorted(
                        [row for row in band_text_rows if not row["reply_at"]],
                        key=lambda row: (row["rating"], -len(row["text"] or row["title"])),
                    )[:16]
                ],
            }
        )

    version_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["version"] != "Unknown":
            version_rows[row["version"]].append(row)
    versions = []
    for version, matched in version_rows.items():
        if len(matched) < 20:
            continue
        version_ratings = [row["rating"] for row in matched if row["rating"]]
        low = sum(1 for rating in version_ratings if rating <= 2)
        version_text_rows = [row for row in matched if row["text"] or row["title"]]
        version_theme_counts: Counter[str] = Counter()
        for row in version_text_rows:
            blob = normalize_text(row)
            for theme_name, keywords in THEMES.items():
                if any(keyword in blob for keyword in keywords):
                    version_theme_counts[theme_name] += 1
        version_negatives = sorted(
            [row for row in version_text_rows if row["rating"] and row["rating"] <= 2],
            key=lambda row: row["updated_at"] or row["submitted_at"] or datetime.min,
            reverse=True,
        )
        versions.append(
            {
                "version": version,
                "versionCode": max(row["version_code"] for row in matched),
                "reviews": len(matched),
                "averageRating": avg(version_ratings),
                "lowRatingCount": low,
                "lowRatingRate": pct(low, len(version_ratings)),
                "textReviews": sum(1 for row in matched if row["text"] or row["title"]),
                "latestReviewAt": max(
                    (row["updated_at"] or row["submitted_at"]) for row in matched
                    if row["updated_at"] or row["submitted_at"]
                ).isoformat(),
                "topThemes": [
                    {"name": theme_name, "count": count, "share": pct(count, len(version_text_rows))}
                    for theme_name, count in version_theme_counts.most_common(4)
                ],
                "negativeExamples": [sample_review(row) for row in version_negatives[:6]],
            }
        )
    versions_by_release = sorted(versions, key=lambda item: item["versionCode"], reverse=True)
    versions_by_risk = sorted(versions, key=lambda item: (-item["lowRatingRate"], -item["reviews"]))

    release_comparison = None
    if len(versions_by_release) >= 2:
        current = versions_by_release[0]
        previous = versions_by_release[1]
        release_comparison = {
            "current": current,
            "previous": previous,
            "ratingDelta": round(current["averageRating"] - previous["averageRating"], 2),
            "lowRatingRateDelta": round(current["lowRatingRate"] - previous["lowRatingRate"], 1),
            "directional": current["reviews"] < 100 or previous["reviews"] < 100,
        }

    languages = Counter(row["language"] for row in rows)
    devices = Counter(row["device"] for row in negative_rows)
    device_brands = Counter(device_brand(row["device"]) for row in rows)
    negative_device_brands = Counter(device_brand(row["device"]) for row in negative_rows)
    positive_with_text = [
        row for row in text_rows
        if row["rating"] >= 4 and any(term in normalize_text(row) for term in POSITIVE_TERMS)
    ]
    positive_with_text.sort(key=lambda row: -len(row["text"] or row["title"]))
    negative_rows.sort(key=lambda row: (row["rating"], -len(row["text"] or row["title"])))
    recent_text_rows = sorted(
        text_rows,
        key=lambda row: row["updated_at"] or row["submitted_at"] or datetime.min,
        reverse=True,
    )

    return {
        "package": package,
        "name": APP_NAMES.get(package, package),
        "sampleSize": len(rows),
        "textReviewCount": len(text_rows),
        "averageRating": avg(ratings),
        "lowRatingCount": sum(1 for rating in ratings if rating <= 2),
        "lowRatingRate": pct(sum(1 for rating in ratings if rating <= 2), len(ratings)),
        "fiveStarRate": pct(sum(1 for rating in ratings if rating == 5), len(ratings)),
        "replyCount": len(replied_rows),
        "replyRate": pct(len(replied_rows), len(rows)),
        "negativeReplyRate": pct(len(negative_replied), len(negative_rows)),
        "medianReplyHours": round(sorted(reply_hours)[len(reply_hours) // 2], 1) if reply_hours else 0,
        "ratingDistribution": rating_distribution,
        "monthlyTrend": monthly,
        "dailyTrend": daily,
        "themes": themes,
        "textTracks": text_tracks,
        "divergentReviews": [sample_review(row) for row in divergent_reviews[:24]],
        "replyBands": reply_bands,
        "releaseComparison": release_comparison,
        "recentVersions": versions_by_release[:10],
        "riskyVersions": versions_by_risk[:10],
        "topLanguages": [
            {"language": name, "count": count, "share": pct(count, len(rows))}
            for name, count in languages.most_common(6)
        ],
        "topNegativeDevices": [
            {"device": name, "count": count}
            for name, count in devices.most_common(8)
        ],
        "deviceBrands": [
            {
                "brand": name,
                "reviews": count,
                "share": pct(count, len(rows)),
                "negativeReviews": negative_device_brands.get(name, 0),
                "negativeRate": pct(negative_device_brands.get(name, 0), count),
            }
            for name, count in device_brands.most_common()
        ],
        "criticalReviews": [sample_review(row) for row in negative_rows[:12]],
        "positiveReviews": [sample_review(row) for row in positive_with_text[:8]],
        "recentReviews": [sample_review(row) for row in recent_text_rows[:300]],
        "confidence": {
            "overall": "high" if len(rows) >= 1000 else "medium" if len(rows) >= 100 else "low",
            "textThemes": "high" if len(text_rows) >= 500 else "medium" if len(text_rows) >= 50 else "low",
            "showTrend": all(item["reviews"] >= 100 for item in monthly) and len(monthly) >= 3,
            "showVersionCuts": len(rows) >= 500,
        },
    }


def build_insights(paths: list[Path]) -> dict[str, Any]:
    reviews = read_reviews(paths)
    apps: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in reviews:
        apps[row["package"]].append(row)
    review_dates = [
        row["updated_at"] or row["submitted_at"]
        for row in reviews
        if row["updated_at"] or row["submitted_at"]
    ]

    summaries = {
        package: summarize_app(package, rows)
        for package, rows in sorted(apps.items())
    }
    primary = summaries.get("xyz.penpencil.physicswala", {})
    comparator = summaries.get("xyz.penpencil.unigo", {})
    return {
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "source": "Google Play Console review exports",
        "sourceFiles": [path.name for path in paths],
        "dateRange": {
            "from": min(review_dates).date().isoformat() if review_dates else None,
            "to": max(review_dates).date().isoformat() if review_dates else None,
        },
        "apps": summaries,
        "primaryPackage": "xyz.penpencil.physicswala",
        "comparisonPackage": "xyz.penpencil.unigo",
        "comparisonCaveat": (
            f"UniGo has only {comparator.get('sampleSize', 0)} unique reviews in the supplied exports, "
            "so its comparison is directional, not statistically equivalent."
        ),
        "headline": {
            "reviewsAnalyzed": primary.get("sampleSize", 0),
            "averageRating": primary.get("averageRating", 0),
            "lowRatingRate": primary.get("lowRatingRate", 0),
            "replyRate": primary.get("replyRate", 0),
            "topRiskTheme": (primary.get("themes") or [{}])[0].get("name", "No dominant issue"),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    artifact = build_insights(args.inputs)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
