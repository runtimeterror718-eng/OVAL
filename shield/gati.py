"""Gati v1 deterministic qualification, graphing and artifact analysis.

The module deliberately separates brand relevance from threat evidence. It
does not make a legal determination and does not submit enforcement actions.
"""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlsplit


GATI_MODEL_VERSION = "gati-qualification-v1"
GATI_GRAPH_VERSION = "gati-graph-v1"
GATI_ARTIFACT_VERSION = "gati-artifact-v1"

STRONG_BRAND_PATTERNS = {
    "physics_wallah": r"\bphysics\s*wallah\b",
    "pw_vidyapeeth": r"\bpw\s+vidyapeeth\b",
    "pw_skills": r"\bpw\s+skills\b",
    "pw_onlyias": r"\bpw\s+onlyias\b",
    "alakh_pandey": r"\balakh\s+pandey\b",
}
EDUCATION_CONTEXT = re.compile(
    r"\b(jee|neet|upsc|exam|batch|course|lecture|dpp|module|student|teacher|vidyapeeth|education)\b",
    re.I,
)
PIRACY_PATTERNS = {
    "mod_apk": r"\b(mod(?:ded)?\s*apk|premium\s+unlocked|cracked\s+apk)\b",
    "leaked_content": r"\b(leaked|pirated|watch\s+free|free\s+lecture|free\s+batch)\b",
    "unauthorised_download": r"\b(without\s+purchase|batch\s+extractor|txt\s+extractor|download\s+(?:all|paid)|course\s+extractor)\b",
    "shared_access": r"\b(shared\s+account|sell(?:ing)?\s+(?:pw\s+)?account|login\s+credentials|batch\s+access)\b",
    "bulk_course_media": r"\b(all\s+(?:video\s+)?lectures?|video\s+with\s+dpp|\d+\s*gb\b|ssd\s+.*lectures?)\b",
}
PHISHING_PATTERNS = {
    "credential_request": r"\b(password|otp|bearer\s+token|session\s+token|authorization\s+header)\b",
    "fake_login": r"\b(login|sign\s*in|verify\s+account)\b",
    "payment": r"\b(upi|pay\s+now|payment|refund|scholarship\s+fee|registration\s+fee)\b",
}
LEGITIMATE_RESALE = re.compile(
    r"\b(used\s+books?|gently\s+used|physical\s+books?|module\s+set|booklets?|test\s+papers?|condition:\s*(?:used|like\s+new))\b",
    re.I,
)
LEGITIMATE_TOOLING = re.compile(
    r"\b(own\s+legitimately\s+enrolled|does\s+not\s+provide\s+access\s+to\s+video|piracy\s+or\s+commercial\s+misuse\s+is\s+not\s+tolerated|security\s+research)\b",
    re.I,
)
APP_URL = re.compile(r"\.(apk|xapk|apks)(?:$|[?#])|\b(mod\s*apk|apk\s+download)\b", re.I)
DOMAIN_PATTERN = re.compile(r"https?://([^/\s:'\"<>]+)", re.I)


def clamp(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 2)


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()


@dataclass(frozen=True)
class Qualification:
    brand_relevance_score: float
    threat_evidence_score: float
    confidence: float
    verdict: str
    threat_type: str
    brand_signals: dict
    threat_signals: dict
    explanation: str
    model_version: str = GATI_MODEL_VERSION

    def as_record(self) -> dict:
        return asdict(self)


def qualify_capture(
    *,
    url: str,
    title: str = "",
    text: str = "",
    forms: list[dict] | None = None,
    download_links: list[str] | None = None,
    social_links: list[str] | None = None,
    domain_similarity: float = 0,
) -> Qualification:
    """Score brand relevance and harmful intent independently."""
    combined = " ".join([title or "", text or "", url or ""])
    lowered = combined.lower()
    strong_hits = [name for name, pattern in STRONG_BRAND_PATTERNS.items() if re.search(pattern, combined, re.I)]
    ambiguous_pw = bool(re.search(r"\bpw\b", combined, re.I) and EDUCATION_CONTEXT.search(combined))
    # An unambiguous protected brand phrase is sufficient to establish strong
    # relevance; threat evidence is deliberately scored in a separate lane.
    brand_score = clamp(len(strong_hits) * 58 + (18 if ambiguous_pw else 0) + min(35, domain_similarity * 0.35))

    piracy_hits = [name for name, pattern in PIRACY_PATTERNS.items() if re.search(pattern, combined, re.I)]
    phishing_hits = [name for name, pattern in PHISHING_PATTERNS.items() if re.search(pattern, combined, re.I)]
    credential_fields = [
        field for field in (forms or [])
        if str(field.get("type") or "").lower() in {"password", "tel"}
        or re.search(r"otp|pass(word)?|mobile|phone|token", str(field.get("name") or ""), re.I)
    ]
    application_signal = bool(APP_URL.search(combined) or any(APP_URL.search(link or "") for link in (download_links or [])))
    direct_downloads = [link for link in (download_links or []) if re.search(r"\.(apk|xapk|apks|zip|rar|7z)(?:$|[?#])", link, re.I)]
    physical_resale = bool(LEGITIMATE_RESALE.search(combined))
    legitimate_tooling = bool(LEGITIMATE_TOOLING.search(combined))

    threat_score = 0.0
    threat_score += min(70, len(piracy_hits) * 28)
    threat_score += min(45, len(phishing_hits) * 15)
    threat_score += 28 if credential_fields else 0
    threat_score += 35 if application_signal else 0
    threat_score += 20 if direct_downloads else 0
    threat_score += 8 if social_links else 0
    if physical_resale and not re.search(PIRACY_PATTERNS["bulk_course_media"], combined, re.I):
        threat_score -= 45
    if legitimate_tooling and not credential_fields and not direct_downloads:
        threat_score -= 30
    threat_score = clamp(threat_score)

    if application_signal and threat_score >= 45:
        threat_type = "malicious_application"
    elif credential_fields or "credential_request" in phishing_hits:
        threat_type = "credential_extraction"
    elif phishing_hits and domain_similarity >= 45:
        threat_type = "phishing"
    elif piracy_hits or direct_downloads:
        threat_type = "piracy"
    elif physical_resale:
        threat_type = "legitimate_resale"
    elif legitimate_tooling:
        threat_type = "security_research"
    elif domain_similarity >= 55:
        threat_type = "impersonation"
    else:
        threat_type = "unknown"

    if brand_score < 30:
        verdict = "discard"
    elif brand_score >= 55 and threat_score >= 70:
        verdict = "high_priority_review"
    elif brand_score >= 45 and threat_score >= 40:
        verdict = "analyst_review"
    elif brand_score >= 55 and threat_score < 25:
        verdict = "benign_reference"
    else:
        verdict = "monitor"

    confidence = clamp(45 + min(30, len(strong_hits) * 10) + min(15, len(piracy_hits + phishing_hits) * 5) + (10 if credential_fields or direct_downloads else 0))
    explanation = (
        f"Brand relevance {brand_score:.0f}/100 and threat evidence {threat_score:.0f}/100. "
        f"Gati classified this as {threat_type.replace('_', ' ')} and routed it to {verdict.replace('_', ' ')}."
    )
    return Qualification(
        brand_relevance_score=brand_score,
        threat_evidence_score=threat_score,
        confidence=confidence,
        verdict=verdict,
        threat_type=threat_type,
        brand_signals={
            "strongTerms": strong_hits,
            "contextualPw": ambiguous_pw,
            "domainSimilarity": round(domain_similarity, 2),
        },
        threat_signals={
            "piracy": piracy_hits,
            "phishing": phishing_hits,
            "credentialFieldCount": len(credential_fields),
            "applicationSignal": application_signal,
            "directDownloads": direct_downloads[:20],
            "socialDistribution": (social_links or [])[:20],
            "physicalResaleSignal": physical_resale,
            "legitimateToolingSignal": legitimate_tooling,
        },
        explanation=explanation,
    )


def extract_graph_entities(*, url: str, capture: dict, tls: dict | None = None, nameservers: list[str] | None = None) -> list[dict]:
    """Extract stable campaign entities from already collected public evidence."""
    parsed = urlsplit(url)
    domain = (parsed.hostname or "").lower()
    output: list[dict] = []

    def add(entity_type: str, value: str, attributes: dict | None = None):
        clean = str(value or "").strip().lower()
        if not clean:
            return
        output.append({
            "entity_type": entity_type,
            "canonical_value": clean,
            "display_value": str(value).strip(),
            "value_hash": stable_hash(f"{entity_type}:{clean}"),
            "attributes": attributes or {},
        })

    add("domain", domain)
    add("url", url)
    for ip in capture.get("resolved_ips") or []:
        add("ip", str(ip))
    for nameserver in nameservers or []:
        add("nameserver", nameserver.rstrip("."))
    certificate = json.dumps(tls or {}, sort_keys=True, default=str)
    if tls and not tls.get("unavailable"):
        add("tls_certificate", stable_hash(certificate), {"certificate": tls})
    if capture.get("content_sha256"):
        add("content_fingerprint", capture["content_sha256"])
    for link in capture.get("social_links") or []:
        host = (urlsplit(link).hostname or "").lower()
        entity_type = "telegram_channel" if host in {"t.me", "telegram.me"} else "social_account"
        add(entity_type, link)
    if domain == "github.com" or domain.endswith(".github.com"):
        add("repository", url)
    return list({(item["entity_type"], item["value_hash"]): item for item in output}.values())


def campaign_identity(*, qualification: Qualification, url: str, content_sha256: str | None, entities: list[dict]) -> dict:
    """Create a deterministic campaign identity from the strongest stable signal."""
    parsed = urlsplit(url)
    domain = (parsed.hostname or "unknown").lower()
    fingerprint = next((item["canonical_value"] for item in entities if item["entity_type"] == "content_fingerprint"), None)
    telegram = next((item["canonical_value"] for item in entities if item["entity_type"] == "telegram_channel"), None)
    anchor_type, anchor = (
        ("content", fingerprint or content_sha256)
        if fingerprint or content_sha256
        else ("telegram", telegram)
        if telegram
        else ("domain", domain)
    )
    key = stable_hash(f"{qualification.threat_type}:{anchor_type}:{anchor}")
    return {
        "campaign_key": key,
        "title": f"{qualification.threat_type.replace('_', ' ').title()} · {domain}",
        "campaign_type": qualification.threat_type if qualification.threat_type in {"phishing", "impersonation", "piracy", "malicious_application", "credential_extraction"} else "unknown",
        "status": "active" if qualification.verdict in {"analyst_review", "high_priority_review"} else "monitoring",
        "risk_score": qualification.threat_evidence_score,
        "summary": qualification.explanation,
        "match_score": clamp((qualification.brand_relevance_score + qualification.threat_evidence_score) / 2),
        "match_reasons": {"anchorType": anchor_type, "anchor": anchor, "modelVersion": qualification.model_version},
    }


def analyse_application_artifact(
    path: str | Path, *, max_bytes: int = 250 * 1024 * 1024
) -> dict:
    """Perform bounded static inspection of an APK/XAPK/ZIP without execution."""
    artifact = Path(path)
    if not artifact.is_file():
        raise ValueError("Artifact path must point to a regular file")
    size = artifact.stat().st_size
    if size > max_bytes:
        raise ValueError(f"Artifact exceeds the {max_bytes}-byte inspection limit")
    digest = hashlib.sha256()
    with artifact.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    sha256 = digest.hexdigest()
    embedded_domains: set[str] = set()
    suspicious_entries: list[str] = []
    entry_count = 0
    if not zipfile.is_zipfile(artifact):
        return {
            "artifact_type": artifact.suffix.lower().lstrip(".") or "archive",
            "sha256": sha256,
            "size_bytes": size,
            "embedded_domains": [],
            "findings": {"validZipContainer": False},
            "risk_score": 20,
            "analyzer_version": GATI_ARTIFACT_VERSION,
        }
    with zipfile.ZipFile(artifact) as archive:
        for info in archive.infolist()[:20000]:
            entry_count += 1
            name = info.filename.lower()
            if re.search(r"(payload|inject|hook|frida|xposed|credential|token)", name):
                suspicious_entries.append(info.filename)
            if info.file_size <= 2_000_000 and name.endswith((".xml", ".json", ".txt", ".html", ".js")):
                try:
                    content = archive.read(info)[:2_000_000].decode("utf-8", errors="ignore")
                    embedded_domains.update(match.lower() for match in DOMAIN_PATTERN.findall(content))
                except Exception:
                    continue
    risk = clamp(15 + min(40, len(suspicious_entries) * 10) + min(30, len(embedded_domains) * 2))
    return {
        "artifact_type": "xapk" if artifact.suffix.lower() == ".xapk" else "apk",
        "sha256": sha256,
        "size_bytes": size,
        "embedded_domains": sorted(embedded_domains)[:200],
        "findings": {
            "validZipContainer": True,
            "entryCount": entry_count,
            "suspiciousEntries": suspicious_entries[:100],
            "executionPerformed": False,
        },
        "risk_score": risk,
        "analyzer_version": GATI_ARTIFACT_VERSION,
    }
