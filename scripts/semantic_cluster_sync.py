"""Build evidence-grounded semantic clusters for the canonical Qdrant sync.

The clustering stage is deliberately separate from Qdrant: Qdrant stores and
retrieves vectors, while normalized multilingual sentence embeddings and
semantic prototypes create the groups. Counts, sentiment totals, representative evidence
and source IDs are deterministic. A language model is not allowed to alter them.

Examples:
    python3.11 scripts/semantic_cluster_sync.py --dry-run
    python3.11 scripts/semantic_cluster_sync.py --platform playstore --write-artifact
    python3.11 scripts/qdrant_channel_sync.py
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.qdrant_channel_sync import (  # noqa: E402
    PLATFORM_LABELS,
    SUPPORTED_PLATFORMS,
    TARGET_BRAND_ID,
    fetch_channel_rows,
    redact_text,
)

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DEFAULT_ARTIFACT = ROOT / "oval" / "src" / "data" / "semantic-clusters.json"

SEMANTIC_STOP_WORDS = sorted(set(ENGLISH_STOP_WORDS) | {
    "physics", "wallah", "physicswallah", "pw", "app", "student", "students",
    "sir", "mam", "maam", "hai", "hain", "bhi", "aur", "kya", "nhi", "nahi",
    "ki", "ka", "ke", "ko", "se", "me", "mein", "ye", "yeh", "tha", "the",
    "good", "best", "nice", "bad", "please", "really", "just", "like", "use",
    "https", "http", "www", "com", "linkedin", "reddit", "2026", "2025",
    "are", "was", "were", "will", "would", "could", "should", "not", "and",
    "this", "that", "there", "from", "after", "before", "people", "dear",
    "mere", "par", "toh", "kyu", "sakt", "sakte", "karo", "karna", "hua",
})


LABELS: dict[str, list[dict[str, str]]] = {
    "playstore": [
        {"label": "Paid batch access and entitlement", "description": "paid batches missing, expiring early, validity mismatch, locked course access", "meaning": "Students paid for learning access but cannot reach the promised batch, class or validity period.", "why": "Paid-access failure turns a product defect into a direct trust and refund risk."},
        {"label": "App stability and loading", "description": "app crashes, bugs, glitches, lag, loading failures, blank screens", "meaning": "Students encounter crashes, glitches, lag or content that disappears while using the app.", "why": "Reliability problems interrupt study sessions and can depress app-store conversion."},
        {"label": "Video playback and downloads", "description": "video playback buffering drm screen cast download offline lecture problems", "meaning": "Lecture playback, DRM, casting and offline-download behaviour prevent students from consuming classes normally.", "why": "Video delivery is the core learning journey, so repeated playback failure deserves engineering ownership."},
        {"label": "Refunds, payments and deductions", "description": "refund delayed denied payment deducted money back transaction emi cancellation", "meaning": "Students describe completed payments, disputed deductions or refunds that remain unresolved after cancellation.", "why": "Money-related failures create the highest escalation and reputational risk."},
        {"label": "Support response and resolution", "description": "support email unanswered ticket call customer care no response unresolved", "meaning": "Students repeatedly seek help but report unanswered emails, calls or tickets and no visible resolution path.", "why": "Slow recovery amplifies otherwise-fixable product and payment problems."},
        {"label": "Books, notes and promised content", "description": "books modules notes pdf chapters missing incomplete promised content delivery", "meaning": "Purchased or promised books, notes, chapters and study resources are incomplete, unavailable or difficult to use.", "why": "Content fulfilment affects both academic outcomes and confidence in the purchase promise."},
        {"label": "Teaching and course experience", "description": "teacher faculty teaching course class lecture syllabus dpp test quality", "meaning": "Students discuss faculty quality, course structure, syllabus coverage and whether the teaching experience meets expectations.", "why": "This cluster protects PW's central academic proposition and should remain separate from app defects."},
        {"label": "Mis-selling and trust allegations", "description": "fraud scam cheating misleading false promise wrong information looted", "meaning": "Students use severe fraud or cheating language when the delivered experience differs from what they believe was promised.", "why": "Even low-volume allegations need evidence review because of their reputational severity."},
        {"label": "Account restrictions and login", "description": "account blocked login otp authentication device restriction access denied", "meaning": "Students cannot use purchased access because accounts are blocked or authentication and device controls fail.", "why": "Account restrictions require a transparent reason and an expedited appeal path."},
        {"label": "General dissatisfaction", "description": "bad worst poor spam dislike generic complaint without a specific issue", "meaning": "Low-rating comments express dissatisfaction but provide too little detail to diagnose a specific product failure.", "why": "These signals should be monitored but kept out of actionable engineering counts until clarified."},
    ],
    "reddit": [
        {"label": "Batch selection and course decisions", "description": "which batch course arjuna lakshya yakeen prayas worth advice", "meaning": "Students compare batches, ask which course to choose and seek peer validation before purchasing or switching.", "why": "Confusion before purchase signals a need for clearer course-positioning and comparison guidance."},
        {"label": "Teacher and faculty conversation", "description": "teacher sir maam faculty lecture teaching appreciation controversy", "meaning": "Community discussion centres on faculty quality, teacher loyalty, classroom moments and educator-related news.", "why": "Faculty sentiment is a major source of both community goodwill and rapid controversy."},
        {"label": "Study progress, exams and motivation", "description": "marks rank test leaderboard study log motivation exam score result", "meaning": "Students share preparation progress, exam results, study routines and motivation with peers.", "why": "This is primarily community engagement rather than a product incident."},
        {"label": "Access, login and app friction", "description": "app login access blocked otp download batch missing not working", "meaning": "Students report blocked accounts, missing entitlements and difficulty reaching purchased content.", "why": "Recurring access complaints should be routed to the same paid-entitlement workflow as app reviews."},
        {"label": "Refund, payment and EMI questions", "description": "refund payment paid money emi fees cancellation deducted", "meaning": "Students ask about refund eligibility, EMI cancellation and recovering payments after changing plans.", "why": "Clear policy and visible status can prevent uncertain questions becoming public complaints."},
        {"label": "Books, modules and resale", "description": "book module notes sell selling second hand delivery order", "meaning": "Posts mix official book fulfilment with peer-to-peer resale of modules and preparation material.", "why": "Marketplace activity must be separated from genuine PW fulfilment failures."},
        {"label": "Discounts, coupons and promotions", "description": "discount coupon promo code ambassador offer cheap affordable", "meaning": "Community members seek or advertise discounts, coupon codes and partner offers.", "why": "Promotional posts are not product complaints and should not inflate negative issue volume."},
        {"label": "General student community", "description": "student question meme casual discussion unrelated community post", "meaning": "Posts are general student discussion without a clear product, support or reputation issue.", "why": "This background conversation provides context but should not enter incident counts."},
        {"label": "Institution quality and trust", "description": "institution college ioi education quality placement claims business trust misleading reality", "meaning": "Students question whether the institutional experience, education quality or outcomes match PW's public promise.", "why": "These are high-consideration trust signals for offline and higher-education products."},
        {"label": "Brand memes and creator reactions", "description": "meme cringe influencer creator reaction alakh daddy viral joke brand personality", "meaning": "Community reactions use memes, sarcasm and creator commentary to shape the informal PW narrative.", "why": "This conversation can spread quickly, but should be separated from verified product incidents."},
    ],
    "linkedin": [
        {"label": "Workplace culture and employee dignity", "description": "toxic culture humiliation retaliation manager fear employee dignity hr complaint", "meaning": "Employees or former employees allege disrespect, intimidation, retaliation or ignored internal complaints.", "why": "Workplace claims can affect hiring, retention and leadership credibility."},
        {"label": "Termination, PIP and forced resignation", "description": "terminated fired pip forced resign laid off whistleblower", "meaning": "Posts connect termination, PIPs or resignation pressure with policy disputes or speaking up internally.", "why": "Each claim requires an evidence-led People and Legal review rather than a generic public response."},
        {"label": "Refund and post-enrolment support", "description": "refund support call center cancellation emi extension customer care enrolled", "meaning": "Students and parents describe unresolved refunds, EMI disputes, support silence and promises not honoured after enrolment.", "why": "These public cases connect operational recovery directly to brand trust."},
        {"label": "Sales conduct and misleading promises", "description": "counsellor sales misleading promise placement outcome foul language midnight call", "meaning": "Prospects allege aggressive or misleading counselling and difficulty validating outcomes before purchase.", "why": "Sales-governance failures can create both compliance risk and high-visibility warnings to other buyers."},
        {"label": "Fraud and governance allegations", "description": "fraud scam corruption financial misconduct manipulated documents whistleblower", "meaning": "Posts allege serious misconduct, document manipulation, corruption or unsafe internal practices.", "why": "Severe allegations must be verified factually before any communication decision."},
        {"label": "IPO, valuation and investor narrative", "description": "ipo valuation investor stock profitability loss crore byjus financial", "meaning": "Professional discussion evaluates PW's valuation, profitability, growth choices and comparisons with other edtech companies.", "why": "This mixed investor narrative should not be treated as entirely negative."},
        {"label": "Hiring and candidate experience", "description": "hiring recruitment interview offer letter joining incentive candidate", "meaning": "Posts discuss recruitment treatment, interview experience, offers and aggressive joining incentives.", "why": "Candidate experience shapes employer brand even when it is not an employee-relations incident."},
        {"label": "Positive growth and student outcomes", "description": "student success acquisition expansion growth result achievement positive", "meaning": "Posts highlight student outcomes, expansion, partnerships and positive business momentum.", "why": "Positive evidence is needed to represent the full professional narrative accurately."},
        {"label": "Reference-only or unrelated mentions", "description": "unrelated employer company merely tagged named reference false positive", "meaning": "PW is named or tagged, but the underlying experience concerns another company or is not materially about PW.", "why": "Reference-only matches must be excluded from PW incident counts before escalation."},
    ],
    "youtube": [
        {"label": "Scam, fraud and dark-pattern claims", "description": "scam fraud dark pattern exposed misleading refund allegation", "meaning": "Videos use strong scam, fraud or exposed framing around PW-related claims.", "why": "The exact allegation must be verified before choosing a factual response."},
        {"label": "Batch reviews and purchase decisions", "description": "batch reality review lakshya jee neet worth teacher schedule", "meaning": "Review videos evaluate whether paid batches deliver the promised teachers, schedules and learning experience.", "why": "These narratives can influence conversion at the point of purchase."},
        {"label": "Teacher clips and controversy", "description": "teacher faculty alakh sir clip controversy shorts credibility", "meaning": "Short-form clips recycle teacher moments and controversy, sometimes without their original context.", "why": "Escalation should depend on whether viewers question faculty credibility, not views alone."},
        {"label": "Student results and learning outcomes", "description": "neet jee result rank selection success student story", "meaning": "Videos discuss exam outcomes, ranks and student-success stories associated with PW.", "why": "Outcome evidence is a strong positive trust signal when claims are verifiable."},
        {"label": "Offers and owned-channel promotion", "description": "offer anniversary promotion discount owned channel launch", "meaning": "Owned content promotes offers, milestones and brand activity.", "why": "Promotional volume should remain separate from independent audience sentiment."},
        {"label": "Third-party disputes mentioning PW", "description": "third party creator dispute hashtag reference not central allegation", "meaning": "PW appears alongside creator or third-party disputes without always being central to the allegation.", "why": "Reference-only mentions should not be escalated as direct PW incidents."},
    ],
    "freshdesk": [
        {"label": "Login, account and OTP access", "description": "login otp account blocked access authentication mobile email", "meaning": "Students cannot authenticate or regain access to their accounts.", "why": "Identity and access failures block the entire learner journey."},
        {"label": "Batch entitlement and content visibility", "description": "batch not visible course access entitlement class content missing", "meaning": "Purchased batches or course content are not visible to the student account.", "why": "Entitlement failures should share one diagnostic path across Support and Product."},
        {"label": "Video playback and technical support", "description": "video playback buffering loading app crash technical issue", "meaning": "Students require support for playback, loading and application reliability problems.", "why": "Technical tickets should be linked to versions and reproducible defects."},
        {"label": "Payments, refunds and EMI", "description": "payment refund emi transaction deducted fee cancellation", "meaning": "Tickets concern payment confirmation, cancellation, EMI and refund resolution.", "why": "Financial cases need explicit status, timelines and accountable ownership."},
        {"label": "Books, orders and delivery", "description": "book order shipment delivery tracking module material", "meaning": "Students seek missing books, order status, delivery tracking or replacement material.", "why": "Fulfilment cases should be measured separately from digital product support."},
        {"label": "Academic and batch operations", "description": "teacher timetable class schedule test dpp syllabus batch change", "meaning": "Tickets concern teachers, schedules, tests, syllabus and day-to-day batch operation.", "why": "Academic operations require different owners and service levels from technical support."},
        {"label": "General unresolved support", "description": "help unresolved no response complaint follow up status", "meaning": "Tickets request follow-up but lack enough structured detail for confident routing.", "why": "Improving L1 and L2 taxonomy is required before this volume can drive product decisions."},
        {"label": "Tests, admit cards and registrations", "description": "test admit card registration number cbt exam center schedule real test series", "meaning": "Students cannot access tests or admit cards, or find incorrect registration and test-series information.", "why": "Assessment access is time-sensitive and needs a dedicated operational resolution path."},
        {"label": "Social comments and moderation", "description": "facebook comment abusive spam social media moderation profile message", "meaning": "Captured social comments require moderation or triage rather than learner product support.", "why": "Social moderation signals should not inflate product-support issue volume."},
    ],
    "x": [
        {"label": "Student support and refund complaints", "description": "refund support complaint money payment cancelled unresolved student", "meaning": "Public posts describe unresolved payments, refunds or support interactions affecting students.", "why": "Public recovery failures can spread beyond the original support case and weaken trust."},
        {"label": "Teaching and learning outcomes", "description": "teacher faculty class course learning result rank exam jee neet", "meaning": "The conversation evaluates teachers, courses, examinations and student learning outcomes.", "why": "Teaching credibility is central to the brand promise and can drive both advocacy and criticism."},
        {"label": "Brand trust and misconduct allegations", "description": "scam fraud fake misleading cheat controversy criticism exposed", "meaning": "Posts make or repeat severe claims about brand conduct, authenticity or misleading behaviour.", "why": "High-severity allegations require source verification before response or escalation."},
        {"label": "Workplace and employment narrative", "description": "employee workplace culture salary layoff fired termination hiring", "meaning": "Employees, candidates and observers discuss workplace culture, hiring and employment decisions.", "why": "Employment narratives affect recruiting, retention and leadership reputation."},
        {"label": "Business, IPO and growth", "description": "ipo valuation investor business revenue profit acquisition growth", "meaning": "Posts assess Physics Wallah's financial performance, expansion and investor narrative.", "why": "Business discussion influences partner and investor perception but is not automatically negative."},
        {"label": "Founder and public-interest narrative", "description": "alakh pandey founder charity relief donation public initiative interview", "meaning": "Posts focus on Alakh Pandey's public actions, statements and founder-led initiatives.", "why": "Founder perception has a direct and unusually strong influence on the wider brand narrative."},
        {"label": "Reference-only and unrelated posts", "description": "tagged reference unrelated abbreviation promotional spam", "meaning": "Physics Wallah is referenced, but the post does not contain a meaningful brand experience or claim.", "why": "Removing reference-only results prevents false themes and misleading sentiment counts."},
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", action="append", choices=SUPPORTED_PLATFORMS)
    parser.add_argument("--limit-per-platform", type=int, default=500)
    parser.add_argument("--clusters", type=int, default=0, help="Override automatic cluster count")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write-artifact", action="store_true")
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    return parser.parse_args()


def cluster_count(total: int, override: int) -> int:
    if total < 8:
        return max(1, min(total, override or 2))
    if override:
        return min(total, override)
    if total >= 100:
        return min(8, max(6, round(math.sqrt(total / 15))))
    if total >= 40:
        return 6
    if total >= 25:
        return 5
    return 4


def top_phrases(texts: list[str], limit: int = 4) -> list[str]:
    if not texts:
        return []
    try:
        vectorizer = TfidfVectorizer(
            stop_words=list(SEMANTIC_STOP_WORDS),
            ngram_range=(1, 2),
            min_df=2 if len(texts) >= 8 else 1,
            max_df=.82,
            max_features=1200,
        )
        matrix = vectorizer.fit_transform(texts)
        scores = np.asarray(matrix.mean(axis=0)).ravel()
        names = vectorizer.get_feature_names_out()
        ranked = scores.argsort()[::-1]
        result = []
        for index in ranked:
            phrase = str(names[index]).strip()
            if len(phrase) < 3 or any(phrase in item or item in phrase for item in result):
                continue
            result.append(phrase)
            if len(result) >= limit:
                break
        return result
    except ValueError:
        return []


def semantic_text(value: Any, platform: str) -> str:
    text = redact_text(value)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#*_>`|]+", " ", text)
    text = re.sub(r"\b(?:image|linkedin|engagement|comments? shown|reactions?)\b", " ", text, flags=re.I)
    if platform == "freshdesk":
        message = re.search(r"\bMessage\s*[-:]\s*(.+)$", text, flags=re.I)
        if message:
            text = message.group(1)
        else:
            text = re.split(r"\b(?:phone number|device info|client type|client version|attachments?|batch name)\s*[:\-]", text, maxsplit=1, flags=re.I)[0]
    return re.sub(r"\s+", " ", text).strip()


def representative_rows(rows: list[dict[str, Any]], vectors: np.ndarray, centroid: np.ndarray, limit: int = 6) -> list[dict[str, Any]]:
    similarity = vectors @ centroid
    selected = similarity.argsort()[::-1][:limit]
    result = []
    for index in selected:
        row = rows[int(index)]
        result.append({
            "id": str(row.get("platform_ref_id") or row.get("id") or ""),
            "text": redact_text(row.get("content_text"))[:700],
            "sentiment": str(row.get("sentiment_label") or "neutral").lower(),
            "author": redact_text(row.get("author_handle") or "Audience signal")[:100],
            "url": row.get("source_url"),
            "published_at": row.get("published_at"),
            "issue_type": row.get("issue_type"),
        })
    return result


def build_platform(platform: str, rows: list[dict[str, Any]], model: SentenceTransformer, override: int) -> dict[str, Any]:
    usable = []
    seen = set()
    for row in rows:
        text = semantic_text(row.get("content_text"), platform)
        if platform == "reddit" and not re.search(
            r"physics\s*wallah|physicswallah|\bpw\b|alakh|alecc|vidyapeeth|pwskills|pw skills|arjuna|lakshya|yakeen|prayas",
            text,
            flags=re.I,
        ):
            continue
        source_id = row.get("platform_ref_id") or row.get("id")
        # LinkedIn intentionally keeps every captured row because the audience
        # view exposes every ingested post and its semantic counts must reconcile
        # with that feed. Other public collectors still collapse exact text
        # duplicates before clustering.
        key = f"text:{text.lower()}" if platform in {"reddit", "youtube", "x"} else (f"id:{source_id}" if source_id else f"text:{text.lower()}")
        if len(text) < 12 or key in seen:
            continue
        seen.add(key)
        usable.append({**row, "content_text": text})
    if not usable:
        return {"platform": platform, "source_count": 0, "clusters": []}

    all_sentiments = Counter(str(row.get("sentiment_label") or "neutral").lower() for row in usable)
    issue_rows = [row for row in usable if str(row.get("sentiment_label") or "neutral").lower() == "negative"]
    # Issue cards intentionally cluster critical evidence. All comments remain
    # represented in source_count/sentiment and are stored as evidence by the
    # channel sync; positive and neutral items must not dilute issue meaning.
    if len(issue_rows) < 8:
        issue_rows = usable
    texts = [row["content_text"][:3000] for row in issue_rows]
    vectors = np.asarray(model.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=True))
    count = cluster_count(len(issue_rows), override)
    candidates = [
        item for item in LABELS[platform]
        if not (
            platform == "linkedin"
            and item["label"] in {
                "Positive growth and student outcomes",
                "Hiring and candidate experience",
            }
        )
    ]
    candidate_vectors = np.asarray(model.encode(
        [f"{item['label']}. {item['description']}" for item in candidates],
        normalize_embeddings=True,
        show_progress_bar=False,
    ))
    similarities = vectors @ candidate_vectors.T
    labels = np.argmax(similarities, axis=1)
    ranked_labels = [
        label for label, _ in Counter(int(value) for value in labels).most_common(count)
    ]
    clusters = []
    for label in ranked_labels:
        indices = np.where(labels == label)[0]
        cluster_vectors = vectors[indices]
        centroid = cluster_vectors.mean(axis=0)
        centroid /= np.linalg.norm(centroid) or 1
        definition = candidates[label]
        cluster_rows = [issue_rows[int(index)] for index in indices]
        sentiments = Counter(str(row.get("sentiment_label") or "neutral").lower() for row in cluster_rows)
        phrases = top_phrases([row["content_text"] for row in cluster_rows])
        cohesion = float(np.mean(cluster_vectors @ centroid))
        prototype_similarity = float(np.mean(similarities[indices, label]))
        representatives = representative_rows(cluster_rows, cluster_vectors, centroid)
        source_ids = [
            str(row.get("platform_ref_id") or row.get("id") or "")
            for row in cluster_rows
            if row.get("platform_ref_id") or row.get("id")
        ]
        count_value = len(cluster_rows)
        phrase_copy = ", ".join(phrases[:3]) if phrases else "the representative evidence"
        clusters.append({
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"oval:{TARGET_BRAND_ID}:{platform}:semantic:{definition['label']}")),
            "label": definition["label"],
            "summary": f"{definition['meaning']} Repeated semantic signals include {phrase_copy}.",
            "why_it_matters": definition["why"],
            "count": count_value,
            "share": round(count_value / len(issue_rows) * 100, 1),
            "cohesion": round(cohesion, 3),
            "prototype_similarity": round(prototype_similarity, 3),
            "confidence": "high" if cohesion >= .62 and count_value >= 12 else "medium" if cohesion >= .5 and count_value >= 5 else "low",
            "subthemes": phrases,
            "sentiment": {
                "positive": sentiments.get("positive", 0),
                "neutral": sentiments.get("neutral", 0),
                "negative": sentiments.get("negative", 0),
            },
            "source_ids": source_ids,
            "representative_evidence": representatives,
            "vector": centroid.tolist(),
        })
    clusters.sort(key=lambda item: item["count"], reverse=True)
    for rank, cluster in enumerate(clusters, start=1):
        cluster["rank"] = rank
    return {
        "platform": platform,
        "label": PLATFORM_LABELS.get(platform, platform.title()),
        "source_count": len(usable),
        "clustered_source_count": len(issue_rows),
        "cluster_scope": "negative evidence" if issue_rows is not usable else "all evidence",
        "sentiment": {
            "positive": all_sentiments.get("positive", 0),
            "neutral": all_sentiments.get("neutral", 0),
            "negative": all_sentiments.get("negative", 0),
        },
        "cluster_count": len(clusters),
        "model": MODEL_NAME,
        "method": "multilingual normalized sentence embeddings + semantic prototype clustering",
        "clusters": clusters,
    }


def public_payload(payload: dict[str, Any]) -> dict[str, Any]:
    clean = json.loads(json.dumps(payload))
    for platform in clean["platforms"].values():
        for cluster in platform["clusters"]:
            cluster.pop("vector", None)
    return clean


def main() -> int:
    args = parse_args()
    platforms = tuple(args.platform or SUPPORTED_PLATFORMS)
    model = SentenceTransformer(MODEL_NAME, local_files_only=True)
    payload: dict[str, Any] = {
        "version": "1.0",
        "brand_id": TARGET_BRAND_ID,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "platforms": {},
    }
    for platform in platforms:
        rows = fetch_channel_rows(platform, args.limit_per_platform)
        platform_data = build_platform(platform, rows, model, args.clusters)
        payload["platforms"][platform] = platform_data
        print(f"{platform}: {platform_data['source_count']} signals -> {platform_data.get('cluster_count', 0)} semantic clusters")
        for cluster in platform_data["clusters"][:5]:
            print(f"  {cluster['count']:>4}  {cluster['label']} ({cluster['confidence']}, cohesion {cluster['cohesion']})")

    if args.dry_run and not args.write_artifact:
        return 0
    if args.write_artifact:
        args.artifact.parent.mkdir(parents=True, exist_ok=True)
        output = public_payload(payload)
        if args.platform and args.artifact.exists():
            existing = json.loads(args.artifact.read_text(encoding="utf-8"))
            existing.setdefault("platforms", {}).update(output["platforms"])
            existing["generated_at"] = output["generated_at"]
            existing["brand_id"] = output["brand_id"]
            existing["version"] = output["version"]
            output = existing
        args.artifact.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Artifact written: {args.artifact}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
