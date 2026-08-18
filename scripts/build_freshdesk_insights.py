"""
Build a compact Freshdesk support-intelligence artifact from a ticket CSV export.

The source export can contain customer names, phone numbers, order IDs, and image
links in free text. This script stores aggregates plus anonymized examples only.
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


ACTIVE_STATUSES = {
    "Open",
    "Responded",
    "Waiting on Customer",
    "Pending on Internal team",
    "Pending",
    "Not picked",
    "Pending on SST (Backend)",
}

CONTROLLED_STATUSES = {"Closed", "Resolved"}

# Freshdesk exports can use either display labels or the numeric status values.
# Values 2-5 are the platform defaults; other values are custom statuses and are
# treated as active until an explicit resolved/closed value is provided.
STATUS_LABELS = {
    "2": "Open",
    "3": "Pending",
    "4": "Resolved",
    "5": "Closed",
}


def value(row: dict[str, str], *names: str) -> str:
    """Read a field from either the legacy or the current CSV export shape."""
    for name in names:
        candidate = row.get(name)
        if candidate is not None:
            return str(candidate).strip()
    return ""


def normalized_status(row: dict[str, str]) -> str:
    raw = value(row, "Status", "status")
    if raw in STATUS_LABELS:
        return STATUS_LABELS[raw]
    return f"Custom status {raw}" if raw.isdigit() else raw or "Unknown"


def normalized_group(row: dict[str, str]) -> str:
    return value(row, "Group", "team", "group_id") or "Unassigned"

CATEGORY_KEYWORDS = {
    "Store & Logistics": [
        "order", "delivery", "shipped", "parcel", "product", "book", "tracking", "kit",
        "address", "returned", "missing", "wrong product",
    ],
    "Access & Entitlement": [
        "access", "locked", "batch access", "content got locked", "not granted", "subscription",
        "purchased but", "cannot see", "login", "restore my account",
    ],
    "Payment & Refund": [
        "refund", "payment", "paid", "amount deducted", "emi", "money", "failed", "pending",
        "retry", "invoice",
    ],
    "App & Video Technical": [
        "app", "video", "recorded", "loading", "slow", "not working", "android", "network",
        "buffer", "play", "client version",
    ],
    "Batch Operations": [
        "batch change", "batch validity", "number change", "unblock", "planner", "test series",
        "real test", "dpp", "test not visible",
    ],
    "Mentorship & Saarthi": [
        "saarthi", "mentor", "coach", "mentorship", "chemistry mentor", "coach change",
    ],
    "Guidance & Purchase": [
        "purchase", "buy", "guidance", "appropriate batch", "new course", "want to buy",
    ],
    "Student Wellbeing": [
        "anxiety", "stress", "unable to focus", "personal problem", "mental", "depressed",
    ],
}

URGENCY_TERMS = [
    "urgent", "final request", "please", "help", "bahut jarurat", "as soon as possible",
    "disappointed", "not addressed", "complaint", "consumer", "legal", "last",
]

# These are deliberately narrow, ordered operational clusters. They prevent a
# noisy technical field (for example "client version") from hiding the actual
# student ask. Tickets that do not match remain visible as "Needs review"
# instead of being forced into a misleading theme.
OPERATIONAL_CLUSTERS = [
    ("IVR / callback registration", ["ivr registered", "registered call", "call registered"], "Support Operations", "Audit IVR registration failures and callback routing."),
    ("Exam, admit card & centre", ["admit card", "exam centre", "centre assigned", "exam center"], "Exam Operations", "Resolve admit-card availability and incorrect-centre cases before exam cut-offs."),
    ("Login, OTP & account recovery", ["otp", "unable to login", "cannot login", "login credentials", "account recovery", "device limit"], "Identity & Access", "Trace authentication, OTP delivery, and device-limit failures."),
    ("Video & live-class playback", ["video", "live class", "recorded class", "lecture", "audio", "buffering", "playing"], "Product Reliability", "Cluster by app version, device, and course; publish incident workarounds."),
    ("Batch, profile & entitlement changes", ["batch change", "number change", "unblock", "batch validity", "wrong batch", "change batch"], "Batch Operations", "Automate common batch, mobile-number, and unblock requests."),
    ("Orders, books & delivery", ["order", "delivery", "shipped", "parcel", "book", "tracking", "kit", "pincode"], "PW Store Operations", "Prioritise overdue shipments and proactively share tracking updates."),
    ("Tests, polls & practice", ["test", "poll", "infinite practice", "practice", "dpp"], "Assessment Product", "Investigate assessment availability, scoring, and poll failures."),
    ("Access to paid content", ["access", "locked", "subscription", "purchased", "content", "not visible"], "Entitlements", "Verify purchase-to-access sync and route paid-access failures first."),
    ("Payments & refunds", ["refund", "payment", "amount deducted", "emi", "invoice"], "Finance Support", "Validate payment state and give a clear refund-stage update."),
    ("Notes & downloads", ["pdf", "download", "notes", "material"], "Content Platform", "Fix document availability and download reliability."),
]


def clean_text(value: str, limit: int = 360) -> str:
    text = re.sub(r"https?://\S+", "[link]", value or "")
    text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "[email]", text)
    text = re.sub(r"\border\s*id\s*:\s*[A-Za-z0-9/-]+", "orderId : [order-id]", text, flags=re.I)
    text = re.sub(r"\borderId\s*:\s*[A-Za-z0-9/-]+", "orderId : [order-id]", text, flags=re.I)
    text = re.sub(r"\b\d{10}\b", "[phone]", text)
    text = re.sub(r"\bPWT[A-Z0-9/-]+\b", "[order-id]", text, flags=re.I)
    text = re.sub(r"\b\d{7,}\b", "[id]", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def row_text(row: dict[str, str]) -> str:
    return f"{value(row, 'Subject', 'title')} {value(row, 'Description', 'description')}".lower()


def classify_category(row: dict[str, str]) -> str:
    fields = " ".join(
        [
            normalized_group(row),
            value(row, "Issue L1", "issue_category"),
            value(row, "Issue L2", "issue_subcategory"),
            value(row, "Issue L3"),
            value(row, "Issue L4"),
            value(row, "Subject", "title"),
            value(row, "Description", "description"),
        ]
    ).lower()
    scores = {
        category: sum(1 for keyword in keywords if keyword in fields)
        for category, keywords in CATEGORY_KEYWORDS.items()
    }
    category, score = max(scores.items(), key=lambda item: item[1])
    return category if score else "Uncategorized / Needs Routing"


def classify_operational_cluster(row: dict[str, str]) -> tuple[str, str, str]:
    text = row_text(row)
    for name, phrases, owner, action in OPERATIONAL_CLUSTERS:
        if any(phrase in text for phrase in phrases):
            return name, owner, action
    return "Needs review / unstructured ask", "Support Operations", "Sample this queue and extend the routing taxonomy only where a repeatable pattern emerges."


def pct(part: int | float, total: int | float) -> float:
    return round(part / total * 100, 1) if total else 0.0


def sample_ticket(row: dict[str, str], category: str | None = None) -> dict[str, Any]:
    return {
        "ticketId": value(row, "Ticket ID", "ticket_id"),
        "status": normalized_status(row),
        "group": normalized_group(row),
        "issueL1": value(row, "Issue L1", "issue_category") or "Uncategorized",
        "issueL2": value(row, "Issue L2", "issue_subcategory"),
        "category": category,
        "subject": clean_text(value(row, "Subject", "title"), 140),
        "description": clean_text(value(row, "Description", "description")),
    }


def build_insights(path: Path) -> dict[str, Any]:
    total = 0
    text_count = 0
    status_counts: Counter[str] = Counter()
    group_counts: Counter[str] = Counter()
    l1_counts: Counter[str] = Counter()
    l2_counts: Counter[str] = Counter()
    l3_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    active_by_group: Counter[str] = Counter()
    blank_l1 = blank_l2 = blank_l3 = 0
    created_dates: list[str] = []
    urgent_rows: list[dict[str, str]] = []
    category_examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    cluster_counts: Counter[str] = Counter()
    active_by_cluster: Counter[str] = Counter()
    cluster_examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    cluster_metadata: dict[str, tuple[str, str]] = {}
    group_examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    active_examples: list[dict[str, Any]] = []

    with path.open("r", encoding="utf-8-sig", newline="", errors="replace") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        for row in reader:
            total += 1
            status = normalized_status(row)
            group = normalized_group(row)
            l1 = value(row, "Issue L1", "issue_category")
            l2 = value(row, "Issue L2", "issue_subcategory")
            l3 = value(row, "Issue L3")
            text = row_text(row)
            category = classify_category(row)
            cluster, cluster_owner, cluster_action = classify_operational_cluster(row)
            cluster_metadata[cluster] = (cluster_owner, cluster_action)

            created_at = value(row, "created_at", "Created at", "Created At")
            if created_at:
                created_dates.append(created_at)

            if value(row, "Subject", "title") or value(row, "Description", "description"):
                text_count += 1
            if not l1:
                blank_l1 += 1
            if not l2:
                blank_l2 += 1
            if not l3:
                blank_l3 += 1

            status_counts[status] += 1
            group_counts[group] += 1
            l1_counts[l1 or "Uncategorized"] += 1
            l2_counts[l2 or "Uncategorized"] += 1
            l3_counts[l3 or "Uncategorized"] += 1
            category_counts[category] += 1
            cluster_counts[cluster] += 1

            if status not in CONTROLLED_STATUSES:
                active_by_group[group] += 1
                active_by_cluster[cluster] += 1
                if len(active_examples) < 30:
                    active_examples.append(sample_ticket(row, category))

            if any(term in text for term in URGENCY_TERMS) and len(urgent_rows) < 60:
                urgent_rows.append(row)

            if len(category_examples[category]) < 24:
                category_examples[category].append(sample_ticket(row, category))
            if len(cluster_examples[cluster]) < 24:
                cluster_examples[cluster].append(sample_ticket(row, category))
            if len(group_examples[group]) < 12:
                group_examples[group].append(sample_ticket(row, category))

    status_rows = [
        {"status": name, "count": count, "share": pct(count, total)}
        for name, count in status_counts.most_common()
    ]
    active_total = sum(status_counts[status] for status in ACTIVE_STATUSES)
    controlled_total = sum(status_counts[status] for status in CONTROLLED_STATUSES)

    categories = []
    for name, count in category_counts.most_common():
        examples = category_examples.get(name, [])
        categories.append(
            {
                "name": name,
                "count": count,
                "share": pct(count, total),
                "examples": examples,
            }
        )

    groups = []
    for name, count in group_counts.most_common(15):
        groups.append(
            {
                "name": name,
                "tickets": count,
                "share": pct(count, total),
                "active": active_by_group.get(name, 0),
                "examples": group_examples.get(name, []),
            }
        )

    clusters = []
    for name, count in cluster_counts.most_common(10):
        owner, action = cluster_metadata[name]
        clusters.append(
            {
                "name": name,
                "count": count,
                "share": pct(count, total),
                "active": active_by_cluster[name],
                "owner": owner,
                "action": action,
                "examples": cluster_examples[name],
            }
        )

    taxonomy_gaps = [
        {"level": "Issue L1", "blank": blank_l1, "blankRate": pct(blank_l1, total)},
        {"level": "Issue L2", "blank": blank_l2, "blankRate": pct(blank_l2, total)},
        {"level": "Issue L3", "blank": blank_l3, "blankRate": pct(blank_l3, total)},
    ]

    return {
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "sourceFile": path.name,
        "fieldnames": fieldnames,
        "dataWindow": {
            "createdAtMin": min(created_dates) if created_dates else None,
            "createdAtMax": max(created_dates) if created_dates else None,
        },
        "stats": {
            "totalTickets": total,
            "textTickets": text_count,
            "controlledTickets": controlled_total,
            "controlledRate": pct(controlled_total, total),
            "activeTickets": active_total,
            "activeRate": pct(active_total, total),
            "statusCount": len(status_counts),
            "groupCount": len(group_counts),
            "taxonomyCompletionL1": pct(total - blank_l1, total),
            "uncategorizedTickets": l1_counts.get("Uncategorized", 0),
        },
        "statusBreakdown": status_rows,
        "groups": groups,
        "categories": categories,
        "clusters": clusters,
        "taxonomyGaps": taxonomy_gaps,
        "topL1": [
            {"name": name, "count": count, "share": pct(count, total)}
            for name, count in l1_counts.most_common(14)
        ],
        "topL2": [
            {"name": name, "count": count, "share": pct(count, total)}
            for name, count in l2_counts.most_common(16)
        ],
        "topL3": [
            {"name": name, "count": count, "share": pct(count, total)}
            for name, count in l3_counts.most_common(16)
        ],
        "activeExamples": active_examples,
        "urgentExamples": [sample_ticket(row, classify_category(row)) for row in urgent_rows[:24]],
        "confidence": {
            "volume": "high" if total >= 10000 else "medium" if total >= 1000 else "low",
            "timeSeries": "none",
            "reason": "This is a CSV snapshot. Created/resolved fields are available, but a single export cannot establish a trend or SLA recovery curve.",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    artifact = build_insights(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
