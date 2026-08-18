"""
Cluster Freshdesk tickets by semantic content and merge results into the
freshdesk-insights.json artifact consumed by the dashboard.

Pipeline:
  1. Load ticket CSV, strip boilerplate (device info, phone numbers, links).
  2. Embed title+description with a multilingual sentence-transformer
     (handles Hindi / Hinglish / Bengali ticket text).
  3. KMeans clustering on normalized embeddings.
  4. Auto-label clusters via TF-IDF keywords + representative tickets.
  5. Write a `clusters` block into the insights JSON.

Usage:
  python3 scripts/cluster_freshdesk_tickets.py <tickets.csv> \
      --output oval/src/data/freshdesk-insights.json [--k 14]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_freshdesk_insights import clean_text, normalized_status, value  # noqa: E402

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

PRIORITY_LABELS = {"1": "Low", "2": "Medium", "3": "High", "4": "Urgent"}

# Boilerplate lines injected by the mobile app / social-ticket bridge that add
# noise to embeddings without carrying issue semantics.
BOILERPLATE_PATTERNS = [
    re.compile(r"phone_number\s*:\s*\S+", re.I),
    re.compile(r"device_info\s*:\s*\S+", re.I),
    re.compile(r"client\s*type\s*:\s*\S+", re.I),
    re.compile(r"client\s*version\s*\S+", re.I),
    re.compile(r"batch_name\s*:", re.I),
    re.compile(r"reference ticket id\s*-\s*\S+", re.I),
    re.compile(r"(post url|replyurl|viewticket)\s*-\s*\S+", re.I),
    re.compile(r"https?://\S+"),
]

# Human-readable names keyed by dominant TF-IDF keywords discovered on the
# 2026-07-24 export. Clusters whose keywords don't match keep an auto label.
LABEL_RULES: list[tuple[str, list[str]]] = [
    ("IVR Call-back Auto Tickets", ["ivr", "ivr registered", "registered issue", "issue id"]),
    ("Social Media Comments (FB/IG bridge)", ["facebook", "comments", "instagram", "sentiment", "profile"]),
    ("Social Media Comments (FB/IG bridge)", ["pandey", "alakh", "alakh pandey", "message"]),
    ("CuriousJr Video/Audio Reports", ["topic", "batch subject", "batch class", "curiousjr"]),
    ("In-App Video Problem Reports", ["video_name", "app_version", "problem"]),
    ("Hinglish Batch Queries & Requests", ["hai", "sir", "nhi", "ho", "hindi"]),
    ("Live-Class Poll Not Received", ["scheduleid", "entitytypeid", "poll", "entity"]),
    ("Live/Recorded Class Not Playing", ["live class", "class", "playing", "live"]),
    ("OTP Not Received", ["otp", "received", "working otp", "received working"]),
    ("Play Store Review Bridge Tickets", ["playstore", "review star", "learning platform", "device"]),
    ("Admit Card / Test Access", ["admit", "card", "test", "exam", "scholarship"]),
    ("Batch Change / Upgrade Requests", ["batch change", "change batch", "batch", "upgrade"]),
    ("Refunds & Payment Failures", ["refund", "payment", "paid", "amount", "money", "deducted"]),
    ("Book / Kit Delivery & Orders", ["book", "order", "delivery", "parcel", "module", "kit", "address"]),
    ("Video / App Playback Issues", ["video", "lecture", "playing", "buffer", "loading", "app"]),
    ("Login / OTP / Account Access", ["login", "otp", "number", "account", "mobile number"]),
    ("Batch / Content Access Locked", ["access", "locked", "unlock", "content", "purchased"]),
    ("Doubts, Mentorship & Guidance", ["doubt", "mentor", "saarthi", "guidance", "teacher"]),
    ("Test Series / DPP Issues", ["test series", "dpp", "test", "result", "answer"]),
]


def compose_text(row: dict[str, str]) -> str:
    text = f"{value(row, 'Subject', 'title')}. {value(row, 'Description', 'description')}"
    for pattern in BOILERPLATE_PATTERNS:
        text = pattern.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def sample_ticket(row: dict[str, str]) -> dict[str, Any]:
    return {
        "ticketId": value(row, "Ticket ID", "ticket_id"),
        "status": normalized_status(row),
        "group": value(row, "Group", "team", "group_id") or "Unassigned",
        "issueL1": value(row, "Issue L1", "issue_category") or "Uncategorized",
        "issueL2": value(row, "Issue L2", "issue_subcategory"),
        "category": None,
        "subject": clean_text(value(row, "Subject", "title"), 140),
        "description": clean_text(value(row, "Description", "description")),
    }


def label_for(keywords: list[str]) -> str | None:
    joined = " ".join(keywords)
    best: tuple[int, str] | None = None
    for name, terms in LABEL_RULES:
        score = sum(1 for term in terms if term in joined)
        if score >= 2 and (best is None or score > best[0]):
            best = (score, name)
    return best[1] if best else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--k", type=int, default=14)
    args = parser.parse_args()

    rows: list[dict[str, str]] = []
    texts: list[str] = []
    with args.input.open("r", encoding="utf-8-sig", newline="", errors="replace") as handle:
        for row in csv.DictReader(handle):
            text = compose_text(row)
            if len(text) < 5:
                continue
            rows.append(row)
            texts.append(text)
    print(f"Loaded {len(rows)} tickets with usable text")

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(
        texts, batch_size=64, show_progress_bar=True, normalize_embeddings=True
    )

    from sklearn.cluster import KMeans
    from sklearn.feature_extraction.text import TfidfVectorizer

    km = KMeans(n_clusters=args.k, random_state=42, n_init=10)
    assignments = km.fit_predict(embeddings)

    # TF-IDF keywords per cluster (English + romanized tokens carry the signal).
    vectorizer = TfidfVectorizer(
        max_features=6000, stop_words="english", ngram_range=(1, 2), min_df=3
    )
    tfidf = vectorizer.fit_transform(texts)
    vocab = np.array(vectorizer.get_feature_names_out())

    total = len(rows)
    clusters: list[dict[str, Any]] = []
    for cluster_id in range(args.k):
        idx = np.where(assignments == cluster_id)[0]
        if len(idx) == 0:
            continue
        centroid_scores = np.asarray(tfidf[idx].mean(axis=0)).ravel()
        keywords = [str(k) for k in vocab[centroid_scores.argsort()[::-1][:10]]]

        # Representative tickets = closest to embedding centroid.
        centroid = embeddings[idx].mean(axis=0)
        centroid /= np.linalg.norm(centroid)
        order = idx[np.argsort(-(embeddings[idx] @ centroid))]

        statuses = Counter(normalized_status(rows[i]) for i in idx)
        priorities = Counter(
            PRIORITY_LABELS.get(value(rows[i], "priority"), "Unknown") for i in idx
        )
        open_count = sum(v for s, v in statuses.items() if s not in {"Closed", "Resolved"})

        clusters.append(
            {
                "id": int(cluster_id),
                "label": label_for(keywords) or f"Cluster: {', '.join(keywords[:3])}",
                "autoLabel": ", ".join(keywords[:3]),
                "keywords": keywords,
                "count": int(len(idx)),
                "share": round(len(idx) / total * 100, 1),
                "openCount": int(open_count),
                "openRate": round(open_count / len(idx) * 100, 1),
                "urgentCount": int(priorities.get("Urgent", 0) + priorities.get("High", 0)),
                "statusBreakdown": dict(statuses.most_common(5)),
                "priorityBreakdown": dict(priorities.most_common()),
                "examples": [sample_ticket(rows[i]) for i in order[:20]],
            }
        )

    clusters.sort(key=lambda c: c["count"], reverse=True)
    for cluster in clusters:
        print(f"[{cluster['count']:5d}] {cluster['label']}  ::  {', '.join(cluster['keywords'][:6])}")

    artifact = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {}
    artifact["clusters"] = clusters
    artifact["clustering"] = {
        "method": f"KMeans(k={args.k}) on {MODEL_NAME} embeddings",
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "ticketsClustered": total,
    }
    args.output.write_text(
        json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print(f"Wrote clusters into {args.output}")


if __name__ == "__main__":
    main()
