"""Bounded, public-only Shield crawler and persisted queue processor.

The crawler never submits forms, executes downloads, accesses authenticated
content, or performs enforcement. Every navigation and subresource host passes
public-IP checks; evidence is immutable, versioned and stored privately.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import socket
import ssl
import subprocess
from difflib import SequenceMatcher
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
import dns.exception
import dns.resolver
from playwright.async_api import async_playwright

from config.supabase_client import get_service_client
from shield.gati import (
    GATI_ARTIFACT_VERSION,
    GATI_GRAPH_VERSION,
    campaign_identity,
    extract_graph_entities,
    qualify_capture,
)
from shield.safety import assert_no_rebinding, canonicalize_url, is_authorised, resolve_public

logger = logging.getLogger(__name__)
BUCKET = os.getenv("SHIELD_EVIDENCE_BUCKET", "shield-evidence")
TIMEOUT_MS = min(int(os.getenv("SHIELD_CRAWL_TIMEOUT_MS", "15000")), 30000)
MAX_BYTES = min(int(os.getenv("SHIELD_MAX_PAGE_BYTES", str(5 * 1024 * 1024))), 10 * 1024 * 1024)
MAX_SCREENSHOT_HEIGHT = min(int(os.getenv("SHIELD_MAX_SCREENSHOT_HEIGHT", "12000")), 16000)
DOWNLOAD_SUFFIXES = (".apk", ".xapk", ".apks", ".zip", ".rar", ".7z", ".pdf", ".exe", ".dmg")
SOCIAL_HOSTS = {"t.me", "telegram.me", "youtube.com", "www.youtube.com", "youtu.be", "instagram.com", "www.instagram.com", "facebook.com", "www.facebook.com", "x.com", "twitter.com"}
SECURITY_HEADERS = {
    "content-security-policy": "Content-Security-Policy",
    "strict-transport-security": "Strict-Transport-Security",
    "x-content-type-options": "X-Content-Type-Options",
    "referrer-policy": "Referrer-Policy",
}


def passive_security_observations(final_url: str, headers: dict,
                                  forms: list[dict], links: list[dict]) -> dict:
    """Return non-intrusive posture signals from an already captured page.

    These observations are evidence-routing hints, not vulnerability findings.
    No payloads are sent and no weakness is exercised.
    """
    normalised_headers = {str(key).lower(): str(value) for key, value in (headers or {}).items()}
    credential_fields = sorted({
        str(field.get("type") or field.get("name") or "unknown").lower()
        for field in forms
        if str(field.get("type") or "").lower() in {"password", "tel"}
        or re.search(r"otp|pass(word)?|mobile|phone", str(field.get("name") or ""), re.I)
    })
    insecure_form_actions = sorted({
        str(field.get("action")) for field in forms
        if str(field.get("action") or "").lower().startswith("http://")
    })
    download_links = sorted({
        str(link.get("href")) for link in links
        if link.get("href") and (
            bool(link.get("download"))
            or urlsplit(str(link["href"])).path.lower().endswith(DOWNLOAD_SUFFIXES)
            or re.search(r"\b(download|apk|xapk)\b", str(link.get("text") or ""), re.I)
        )
    })
    social_links = sorted({
        str(link.get("href")) for link in links
        if (urlsplit(str(link.get("href") or "")).hostname or "").lower() in SOCIAL_HOSTS
    })
    return {
        "assessmentType": "passive_observation_only",
        "missingSecurityHeaders": [display for key, display in SECURITY_HEADERS.items()
                                   if key not in normalised_headers],
        "serverDisclosure": normalised_headers.get("server"),
        "credentialFieldTypes": credential_fields,
        "insecureFormActions": insecure_form_actions,
        "insecurePageTransport": urlsplit(final_url).scheme.lower() != "https",
        "downloadLinks": download_links[:100],
        "socialLinks": social_links[:100],
        "disclaimer": "Passive signals are not proof of an exploitable vulnerability.",
    }


async def safe_capture(url: str, authorised_domains: list[dict]) -> dict:
    canonical = canonicalize_url(url)
    host = urlsplit(canonical).hostname or ""
    if is_authorised(host, authorised_domains):
        raise ValueError("Authorised PW destinations are excluded from suspicious crawling")
    initial_addresses = resolve_public(host)
    redirect_chain: list[str] = []
    network_hosts: set[str] = set()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=["--disable-dev-shm-usage", "--no-sandbox"])
        context = await browser.new_context(accept_downloads=False, java_script_enabled=True)
        page = await context.new_page()

        async def route_guard(route):
            request_url = route.request.url
            try:
                parsed = urlsplit(request_url)
                if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                    return await route.abort()
                addresses = resolve_public(parsed.hostname)
                network_hosts.add(parsed.hostname)
                if is_authorised(parsed.hostname, authorised_domains):
                    return await route.abort()
                if route.request.resource_type in {"media", "font"}:
                    return await route.abort()
                await route.continue_()
            except Exception:
                await route.abort()

        await page.route("**/*", route_guard)
        response = await page.goto(canonical, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
        final_url = canonicalize_url(page.url)
        final_host = urlsplit(final_url).hostname or ""
        final_addresses = resolve_public(final_host)
        if final_host == host:
            assert_no_rebinding(initial_addresses, final_addresses)
        if is_authorised(final_host, authorised_domains):
            raise ValueError("Redirect to an authorised PW destination was blocked")
        redirect = response.request.redirected_from if response else None
        while redirect and len(redirect_chain) < 5:
            redirect_chain.insert(0, redirect.url)
            redirect = redirect.redirected_from
        if len(redirect_chain) >= 5:
            raise ValueError("Redirect limit exceeded")
        content = await page.content()
        encoded = content.encode("utf-8")
        if len(encoded) > MAX_BYTES:
            raise ValueError("Capture exceeded the page-size limit")
        title = await page.title()
        visible_text = await page.locator("body").inner_text(timeout=3000)
        forms = await page.locator("input,select,textarea").evaluate_all("els => els.slice(0,100).map(e => ({tag:e.tagName.toLowerCase(),type:e.type||null,name:e.name||null,placeholder:e.placeholder||null,autocomplete:e.autocomplete||null,method:(e.form&&e.form.method)||null,action:(e.form&&e.form.action)||null}))")
        links = await page.locator("a[href]").evaluate_all("els => els.slice(0,500).map(e => ({href:e.href,text:(e.innerText||e.textContent||'').trim().slice(0,300),download:e.hasAttribute('download')}))")
        images = await page.locator("img[src]").evaluate_all("els => els.slice(0,200).map(e => ({src:e.currentSrc||e.src,alt:(e.alt||'').slice(0,300),width:e.naturalWidth||null,height:e.naturalHeight||null}))")
        seo = await page.evaluate("""() => {
          const meta = (selector) => document.querySelector(selector)?.getAttribute('content') || null;
          const texts = (selector, limit = 12) => Array.from(document.querySelectorAll(selector))
            .slice(0, limit).map((node) => (node.textContent || '').trim()).filter(Boolean);
          const schemaTypes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
            .slice(0, 20).flatMap((node) => {
              try {
                const value = JSON.parse(node.textContent || '{}');
                const values = Array.isArray(value) ? value : [value];
                return values.flatMap((item) => {
                  const graph = Array.isArray(item?.['@graph']) ? item['@graph'] : [item];
                  return graph.flatMap((entry) => Array.isArray(entry?.['@type']) ? entry['@type'] : [entry?.['@type']]).filter(Boolean);
                });
              } catch { return []; }
            });
          return {
            title: document.title || null,
            description: meta('meta[name="description"]'),
            canonical: document.querySelector('link[rel="canonical"]')?.href || null,
            robots: meta('meta[name="robots"]'),
            language: document.documentElement.lang || null,
            h1: texts('h1', 8),
            h2: texts('h2', 16),
            openGraph: {
              title: meta('meta[property="og:title"]'),
              description: meta('meta[property="og:description"]'),
              type: meta('meta[property="og:type"]'),
              image: meta('meta[property="og:image"]'),
              siteName: meta('meta[property="og:site_name"]')
            },
            twitter: {
              card: meta('meta[name="twitter:card"]'),
              title: meta('meta[name="twitter:title"]'),
              description: meta('meta[name="twitter:description"]')
            },
            schemaTypes: Array.from(new Set(schemaTypes)).slice(0, 30),
            internalLinkCount: Array.from(document.links).filter((link) => link.hostname === location.hostname).length,
            externalLinkCount: Array.from(document.links).filter((link) => link.hostname && link.hostname !== location.hostname).length,
            imageCount: document.images.length
          };
        }""")
        document_height = await page.evaluate("Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)")
        screenshot = await page.screenshot(type="png", full_page=False, clip={"x": 0, "y": 0, "width": 1280, "height": min(MAX_SCREENSHOT_HEIGHT, max(720, int(document_height)))})
        status = response.status if response else None
        headers = dict(await response.all_headers()) if response else {}
        passive = passive_security_observations(final_url, headers, forms, links)
        await context.close()
        await browser.close()
    return {
        "canonical_url": final_url,
        "http_status": status,
        "response_headers": headers,
        "redirect_chain": redirect_chain,
        "page_title": title[:500],
        "metadata": {"seo": seo},
        "visible_text": visible_text[:200000],
        "sanitised_html": _sanitise_html(content),
        "screenshot": screenshot,
        "form_fields": forms,
        "external_links": [item["href"] for item in links if item.get("href")],
        "download_links": passive["downloadLinks"],
        "social_links": passive["socialLinks"],
        "detected_images": images,
        "indicators": {"passiveSecurityPosture": passive},
        "network_destinations": sorted(network_hosts),
        "resolved_ips": sorted(final_addresses),
        "content_sha256": hashlib.sha256(encoded).hexdigest(),
    }


def _sanitise_html(value: str) -> str:
    value = re.sub(r"<script\b[^>]*>.*?</script>", "", value, flags=re.I | re.S)
    value = re.sub(r"<iframe\b[^>]*>.*?</iframe>", "", value, flags=re.I | re.S)
    value = re.sub(r"\son\w+\s*=\s*(['\"]).*?\1", "", value, flags=re.I | re.S)
    return value


def _upload(path: str, content: bytes, content_type: str) -> None:
    get_service_client().storage.from_(BUCKET).upload(path, content, {"content-type": content_type, "upsert": "false"})


def _tls_metadata(host: str) -> dict:
    try:
        with socket.create_connection((host, 443), timeout=5) as sock:
            with ssl.create_default_context().wrap_socket(sock, server_hostname=host) as secure:
                cert = secure.getpeercert()
                return {"issuer": cert.get("issuer"), "subject": cert.get("subject"), "notBefore": cert.get("notBefore"), "notAfter": cert.get("notAfter"), "version": secure.version()}
    except Exception as exc:
        return {"unavailable": type(exc).__name__}


def _rdap_metadata(host: str) -> dict:
    try:
        response = httpx.get(f"https://rdap.org/domain/{host}", timeout=10, follow_redirects=False)
        if response.status_code != 200:
            return {"unavailable": f"http_{response.status_code}"}
        value = response.json()
        events = {item.get("eventAction"): item.get("eventDate") for item in value.get("events", [])}
        registrar = None
        abuse_contact = None
        for entity in value.get("entities", []):
            roles = set(entity.get("roles") or [])
            properties = (entity.get("vcardArray") or [None, []])[1] or []
            for prop in properties:
                if len(prop) < 4:
                    continue
                if "registrar" in roles and prop[0] == "fn" and not registrar:
                    registrar = prop[3]
                if ("abuse" in roles or "registrar" in roles) and prop[0] == "email" and not abuse_contact:
                    abuse_contact = prop[3]
        return {"handle": value.get("handle"), "status": value.get("status", []), "events": events, "nameservers": [item.get("ldhName") for item in value.get("nameservers", []) if item.get("ldhName")], "registrar": registrar, "abuseContact": abuse_contact, "raw": value}
    except Exception as exc:
        return {"unavailable": type(exc).__name__}


def parse_whois_response(raw: str, *, target_type: str) -> dict:
    """Parse useful provider fields without retaining registrant PII or raw text."""
    values: dict[str, list[str]] = {}
    for line in raw.splitlines():
        match = re.match(r"^\s*([A-Za-z][A-Za-z0-9 _-]{1,48})\s*:\s*(.*?)\s*$", line)
        if not match or not match.group(2):
            continue
        key = re.sub(r"[\s_-]+", "_", match.group(1).strip().lower())
        value = match.group(2).strip()
        if value and value not in values.setdefault(key, []):
            values[key].append(value)

    def first(*keys: str) -> str | None:
        for key in keys:
            if values.get(key):
                return values[key][0]
        return None

    common = {
        "available": bool(values),
        "source": "whois",
        "targetType": target_type,
        "responseSha256": hashlib.sha256(raw.encode("utf-8", errors="ignore")).hexdigest(),
    }
    if target_type == "domain":
        return {
            **common,
            "registrar": first("registrar", "sponsoring_registrar"),
            "registrarWhoisServer": first("registrar_whois_server", "whois"),
            "registrarUrl": first("registrar_url", "referral_url"),
            "registrarIanaId": first("registrar_iana_id"),
            "abuseEmail": first("registrar_abuse_contact_email", "abuse_email"),
            "abusePhone": first("registrar_abuse_contact_phone", "abuse_phone"),
            "createdAt": first("creation_date", "created", "registered_on"),
            "expiresAt": first("registry_expiry_date", "registrar_registration_expiration_date", "expiry_date", "expires"),
            "updatedAt": first("updated_date", "last_updated_on", "changed"),
            # `nserver` commonly contains the IANA TLD server list from the
            # referral preamble. `Name Server` is the domain-level record.
            "nameservers": sorted(set(values.get("name_server", [])))[:20],
            "statuses": values.get("domain_status", [])[:20],
            "registrantOrganisation": first("registrant_organization", "registrant_organisation"),
            "registrantCountry": first("registrant_country"),
        }
    ignored_operators = {
        "arin", "ripe ncc", "apnic", "lacnic", "afrinic",
        "private customer", "private person", "not disclosed",
    }
    operator = None
    for key in ("org_name", "orgname", "organization", "owner", "descr", "netname", "organisation"):
        for candidate in values.get(key, []):
            if candidate.strip().lower() not in ignored_operators:
                operator = candidate.strip()
                break
        if operator:
            break
    return {
        **common,
        "networkName": first("netname", "network_name"),
        "networkOperator": operator,
        "asn": first("originas", "origin", "origin_as"),
        "cidr": first("cidr", "route", "netrange", "inetnum"),
        "country": first("country"),
        "abuseEmail": first("orgabuseemail", "abuse_mailbox", "abuse_email"),
        "abusePhone": first("orgabusephone", "abuse_phone"),
    }


def _whois_metadata(target: str, *, target_type: str) -> dict:
    """Run the system WHOIS client with a timeout and return parsed metadata."""
    valid = (
        bool(re.fullmatch(r"[A-Za-z0-9.-]{1,253}", target))
        if target_type == "domain"
        else _is_ip_literal(target)
    )
    executable = shutil.which("whois")
    if not valid:
        return {"available": False, "source": "whois", "unavailable": "invalid_target"}
    if not executable:
        return {"available": False, "source": "whois", "unavailable": "client_missing"}
    try:
        completed = subprocess.run(
            [executable, target],
            capture_output=True,
            check=False,
            text=True,
            timeout=15,
            env={**os.environ, "LANG": "C", "LC_ALL": "C"},
        )
        raw = (completed.stdout or "")[:256_000]
        if completed.returncode != 0 and not raw:
            return {"available": False, "source": "whois", "unavailable": f"exit_{completed.returncode}"}
        return parse_whois_response(raw, target_type=target_type)
    except subprocess.TimeoutExpired:
        return {"available": False, "source": "whois", "unavailable": "timeout"}
    except Exception as exc:
        return {"available": False, "source": "whois", "unavailable": type(exc).__name__}


def _domain_whois_metadata(host: str, registrable_hint: str | None = None) -> dict:
    """Follow a bounded parent-domain fallback when stored suffix parsing was weak."""
    candidates: list[str] = []
    for value in (registrable_hint, host):
        normalised = str(value or "").strip(".").lower()
        if normalised and normalised not in candidates:
            candidates.append(normalised)
    labels = host.strip(".").lower().split(".")
    for offset in range(1, min(3, max(1, len(labels) - 1))):
        parent = ".".join(labels[offset:])
        if parent.count(".") >= 1 and parent not in candidates:
            candidates.append(parent)
    last: dict = {"available": False, "source": "whois", "unavailable": "no_result"}
    for target in candidates[:4]:
        result = _whois_metadata(target, target_type="domain")
        result["queriedDomain"] = target
        last = result
        if result.get("registrar") or result.get("abuseEmail"):
            return result
    return last


def _clean_nameservers(values: list[str]) -> list[str]:
    output = set()
    for value in values:
        nameserver = str(value or "").strip().rstrip(".")
        if re.fullmatch(r"(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}", nameserver):
            output.add(nameserver.upper())
    return sorted(output)[:30]


def _is_ip_literal(value: str) -> bool:
    try:
        socket.inet_pton(socket.AF_INET6 if ":" in value else socket.AF_INET, value)
        return True
    except OSError:
        return False


def classify_network_provider(whois: dict, *, response_server: str = "") -> dict:
    """Distinguish edge/CDN ownership from a probable origin hosting provider."""
    operator = str(whois.get("networkOperator") or whois.get("networkName") or "").strip()
    evidence = f"{operator} {response_server}".lower()
    cdn_names = {
        "cloudflare": "Cloudflare",
        "akamai": "Akamai",
        "fastly": "Fastly",
        "cloudfront": "Amazon CloudFront",
        "google frontend": "Google Front End",
        "imperva": "Imperva",
        "incapsula": "Imperva",
    }
    cdn = next((label for marker, label in cdn_names.items() if marker in evidence), None)
    return {
        "network_operator": operator or None,
        "likely_hosting_provider": None if cdn else (operator or None),
        "cdn_provider": cdn,
        "confidence": 0.9 if operator else 0.25,
        "basis": "ip_whois" if operator else "whois_unavailable",
    }


def _dns_metadata(host: str) -> dict:
    """Collect passive public DNS records through the configured resolver."""
    output: dict[str, list[dict]] = {}
    for record_type in ("A", "AAAA", "CNAME", "NS", "MX", "TXT"):
        try:
            answers = dns.resolver.resolve(host, record_type, lifetime=6)
            ttl = answers.rrset.ttl if answers.rrset else None
            output[record_type.lower()] = [
                {
                    "name": host,
                    "ttl": ttl,
                    "data": item.to_text(),
                }
                for item in list(answers)[:50]
            ]
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            output[record_type.lower()] = []
        except Exception as exc:
            output[record_type.lower()] = [{"unavailable": type(exc).__name__}]
    return output


def _malicious_url_intelligence(url: str) -> dict:
    key = os.getenv("GOOGLE_WEB_RISK_API_KEY")
    if not key:
        return {"provider": "google_web_risk", "verdict": "not_queried", "configured": False}
    try:
        params = [("key", key), ("uri", url), ("threatTypes", "MALWARE"), ("threatTypes", "SOCIAL_ENGINEERING"), ("threatTypes", "UNWANTED_SOFTWARE")]
        response = httpx.get("https://webrisk.googleapis.com/v1/uris:search", params=params, timeout=10)
        response.raise_for_status()
        value = response.json()
        return {"provider": "google_web_risk", "verdict": "listed" if value.get("threat") else "no_match", "threats": (value.get("threat") or {}).get("threatTypes", []), "configured": True, "warning": "no_match means not listed by this query, not safe"}
    except Exception as exc:
        return {"provider": "google_web_risk", "verdict": "unavailable", "error_code": type(exc).__name__, "configured": True}


def _heartbeat(db, worker_id: str, status: str, *, job_id: int | None = None,
               metrics: dict | None = None, worker_type: str = "web_crawler",
               queue_name: str = "gati.web") -> None:
    """Upsert lightweight worker health without exposing process secrets."""
    db.table("gati_worker_heartbeats").upsert({
        "worker_type": worker_type,
        "worker_id": worker_id,
        "status": status,
        "queue_name": queue_name,
        "current_job_id": str(job_id) if job_id is not None else None,
        "metrics": metrics or {},
        "version": f"gati-{worker_type}-v1",
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="worker_type,worker_id").execute()


def backfill_gati(max_items: int = 100, worker_id: str = "gati-backfill") -> dict:
    """Qualify historical captures that predate the Gati v1 schema."""
    db = get_service_client()
    bounded = max(1, min(int(max_items), 500))
    _heartbeat(
        db,
        worker_id,
        "working",
        metrics={"requested": bounded},
        worker_type="intelligence",
        queue_name="gati.intelligence",
    )
    results = (
        db.table("crawl_results")
        .select("*,candidate:url_candidates(*,domain:domains(*))")
        .order("captured_at", desc=True)
        .limit(bounded)
        .execute()
        .data
        or []
    )
    processed = 0
    skipped = 0
    failed = 0
    for result in results:
        candidate = result.get("candidate") or {}
        if not candidate.get("id"):
            skipped += 1
            continue
        exists = (
            db.table("gati_qualification_results")
            .select("id")
            .eq("crawl_result_id", result["id"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if exists:
            skipped += 1
            continue
        snapshot = (
            db.table("domain_snapshots")
            .select("tls,nameservers")
            .eq("domain_id", candidate["domain_id"])
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        try:
            _analyse_capture(
                db,
                result["brand_id"],
                candidate,
                result,
                result,
                tls=(snapshot[0].get("tls") if snapshot else {}),
                nameservers=(snapshot[0].get("nameservers") if snapshot else []),
                screenshot_sha256=((result.get("metadata") or {}).get("gati") or {}).get("screenshotSha256"),
            )
            processed += 1
        except Exception:
            failed += 1
            logger.exception("gati_backfill_failed result_id=%s", result.get("id"))
    _heartbeat(
        db,
        worker_id,
        "idle" if not failed else "degraded",
        metrics={"processed": processed, "skipped": skipped, "failed": failed},
        worker_type="intelligence",
        queue_name="gati.intelligence",
    )
    return {"processed": processed, "skipped": skipped, "failed": failed}


def backfill_whois(max_domains: int = 100, worker_id: str = "gati-whois-backfill") -> dict:
    """Enrich the latest stored snapshot for each domain with domain and IP WHOIS."""
    db = get_service_client()
    bounded = max(1, min(int(max_domains), 250))
    _heartbeat(
        db,
        worker_id,
        "working",
        metrics={"requested": bounded},
        worker_type="domain_enrichment",
        queue_name="gati.infrastructure",
    )
    domains = db.table("domains").select("id,brand_id,ascii_domain,registrable_domain").order("last_seen_at", desc=True).limit(bounded).execute().data or []
    processed = skipped = failed = 0
    for domain in domains:
        snapshots = db.table("domain_snapshots").select("*").eq("domain_id", domain["id"]).order("captured_at", desc=True).limit(1).execute().data or []
        if not snapshots:
            skipped += 1
            continue
        snapshot = snapshots[0]
        try:
            whois_target = domain.get("registrable_domain") or domain["ascii_domain"]
            domain_whois = _domain_whois_metadata(domain["ascii_domain"], whois_target)
            resolved_ips = [str(item) for item in snapshot.get("resolved_ips") or []]
            ip_whois = {ip: _whois_metadata(ip, target_type="ip") for ip in resolved_ips}
            providers = {ip: classify_network_provider(value) for ip, value in ip_whois.items()}
            registrar = snapshot.get("registrar") or domain_whois.get("registrar")
            nameservers = _clean_nameservers((snapshot.get("nameservers") or []) + (domain_whois.get("nameservers") or []))
            cloudflare_relationship = snapshot.get("cloudflare_relationship")
            if cloudflare_relationship in {None, "relationship_unknown", "none_detected"}:
                if re.search(r"cloudflare", str(registrar or ""), re.I):
                    cloudflare_relationship = "registrar_confirmed"
                elif any(item.get("cdn_provider") == "Cloudflare" for item in providers.values()) or any(re.search(r"cloudflare", item, re.I) for item in nameservers):
                    cloudflare_relationship = "reverse_proxy_likely"
                elif providers:
                    cloudflare_relationship = "none_detected"
            db.table("domain_snapshots").update({
                "whois": domain_whois,
                "registrar": registrar,
                "abuse_contact": snapshot.get("abuse_contact") or domain_whois.get("abuseEmail"),
                "nameservers": nameservers,
                "cloudflare_relationship": cloudflare_relationship or "relationship_unknown",
            }).eq("id", snapshot["id"]).execute()
            for ip, provider in providers.items():
                asn_value = re.sub(r"\D", "", str(ip_whois[ip].get("asn") or ""))
                payload = {
                    "brand_id": domain["brand_id"],
                    "domain_snapshot_id": snapshot["id"],
                    "ip": ip,
                    "asn": int(asn_value) if asn_value else None,
                    "network_operator": provider["network_operator"],
                    "likely_hosting_provider": provider["likely_hosting_provider"],
                    "cdn_provider": provider["cdn_provider"],
                    "infrastructure_confidence": provider["confidence"],
                    "relationship_features": {
                        "source": provider["basis"],
                        "whois": ip_whois[ip],
                        "originHostConfirmed": False,
                        "warning": "IP WHOIS identifies the network owner; a reverse proxy or CDN may conceal the origin host.",
                    },
                }
                existing = db.table("infrastructure_observations").select("id").eq("domain_snapshot_id", snapshot["id"]).eq("ip", ip).limit(1).execute().data or []
                if existing:
                    db.table("infrastructure_observations").update(payload).eq("id", existing[0]["id"]).execute()
                else:
                    db.table("infrastructure_observations").insert(payload).execute()
            processed += 1
        except Exception:
            failed += 1
            logger.exception("gati_whois_backfill_failed domain=%s", domain.get("ascii_domain"))
    _heartbeat(
        db,
        worker_id,
        "idle" if not failed else "degraded",
        metrics={"processed": processed, "skipped": skipped, "failed": failed},
        worker_type="domain_enrichment",
        queue_name="gati.infrastructure",
    )
    return {"processed": processed, "skipped": skipped, "failed": failed}


async def process_next_job(worker_id: str = "shield-celery") -> dict:
    db = get_service_client()
    _heartbeat(db, worker_id, "idle")
    jobs = db.table("crawl_jobs").select("*,candidate:url_candidates(*,domain:domains(*))").eq("status", "queued").lte("available_at", datetime.now(timezone.utc).isoformat()).order("priority", desc=True).order("created_at").limit(1).execute().data or []
    if not jobs:
        return {"status": "idle"}
    job = jobs[0]
    claim = db.table("crawl_jobs").update({"status": "processing", "started_at": datetime.now(timezone.utc).isoformat(), "worker_id": worker_id, "attempt_count": job["attempt_count"] + 1}).eq("id", job["id"]).eq("status", "queued").execute().data or []
    if not claim:
        return {"status": "contended"}
    _heartbeat(db, worker_id, "working", job_id=job["id"], metrics={"attempt": job["attempt_count"] + 1})
    candidate = job["candidate"]
    allowlist = db.table("authorised_domains").select("domain,allow_subdomains").eq("brand_id", job["brand_id"]).eq("active", True).execute().data or []
    try:
        capture = await safe_capture(candidate["canonical_url"], allowlist)
        versions = db.table("crawl_results").select("capture_version").eq("candidate_id", candidate["id"]).order("capture_version", desc=True).limit(1).execute().data or []
        version = (versions[0]["capture_version"] if versions else 0) + 1
        # Include the job attempt in the object prefix. A capture can reach
        # Storage before the database insert fails; retries must never
        # overwrite that immutable evidence or collide with its object path.
        prefix = (
            f"{job['brand_id']}/{candidate['id']}/v{version}"
            f"-job{job['id']}-attempt{job['attempt_count'] + 1}"
        )
        sanitised_html = capture.pop("sanitised_html")
        screenshot = capture.pop("screenshot")
        screenshot_sha256 = hashlib.sha256(screenshot).hexdigest()
        _upload(f"{prefix}/page.html", sanitised_html.encode(), "text/html")
        _upload(f"{prefix}/screenshot.png", screenshot, "image/png")
        resolved_ips = capture.pop("resolved_ips")
        canonical_url = capture.pop("canonical_url", candidate["canonical_url"])
        capture["metadata"] = {
            **(capture.get("metadata") or {}),
            "canonical_url": canonical_url,
            "gati": {
                "screenshotSha256": screenshot_sha256,
                "captureVersion": version,
                "analysisMode": "deterministic_public_evidence",
            },
        }
        capture["indicators"] = {**(capture.get("indicators") or {}), "maliciousUrlIntelligence": _malicious_url_intelligence(candidate["canonical_url"])}
        manifest = json.dumps({key: value for key, value in capture.items() if key != "visible_text"}, sort_keys=True, default=str)
        result = db.table("crawl_results").insert({"brand_id": job["brand_id"], "candidate_id": candidate["id"], "crawl_job_id": job["id"], "capture_version": version, **capture, "sanitised_html_object_path": f"{prefix}/page.html", "screenshot_object_path": f"{prefix}/screenshot.png", "manifest_sha256": hashlib.sha256(manifest.encode()).hexdigest(), "crawler_version": "shield-safe-crawler-v1"}).execute().data[0]
        host = urlsplit(candidate["canonical_url"]).hostname or ""
        registrable_domain = (candidate.get("domain") or {}).get("registrable_domain") or host
        rdap = _rdap_metadata(registrable_domain)
        domain_whois = _domain_whois_metadata(host, registrable_domain)
        events = rdap.get("events") or {}
        dns = _dns_metadata(host)
        tls = _tls_metadata(host)
        nameservers = _clean_nameservers(
            (rdap.get("nameservers") or [])
            + (domain_whois.get("nameservers") or [])
            + [item.get("data", "").rstrip(".") for item in dns.get("ns", []) if item.get("data")]
        )
        registrar = rdap.get("registrar") or domain_whois.get("registrar")
        abuse_contact = rdap.get("abuseContact") or domain_whois.get("abuseEmail")
        response_server = str((capture.get("response_headers") or {}).get("server") or "")
        ip_whois = {ip: _whois_metadata(ip, target_type="ip") for ip in resolved_ips}
        providers = {
            ip: classify_network_provider(metadata, response_server=response_server)
            for ip, metadata in ip_whois.items()
        }
        cloudflare_relationship = (
            "registrar_confirmed"
            if re.search(r"cloudflare", str(registrar or ""), re.I)
            else "reverse_proxy_likely"
            if any(item.get("cdn_provider") == "Cloudflare" for item in providers.values())
            or any(re.search(r"cloudflare", item, re.I) for item in nameservers)
            else "none_detected"
            if providers
            else "relationship_unknown"
        )
        snapshot_row = db.table("domain_snapshots").insert({
            "brand_id": job["brand_id"],
            "domain_id": candidate["domain_id"],
            "dns": dns,
            "tls": tls,
            "rdap": rdap,
            "whois": domain_whois,
            "cloudflare_relationship": cloudflare_relationship,
            "registration_date": events.get("registration"),
            "expiration_date": events.get("expiration"),
            "registrar": registrar,
            "abuse_contact": abuse_contact,
            "nameservers": nameservers,
            "resolved_ips": resolved_ips,
        }).execute().data[0]
        for ip, provider in providers.items():
            asn_value = re.sub(r"\D", "", str(ip_whois[ip].get("asn") or ""))
            db.table("infrastructure_observations").insert({
                "brand_id": job["brand_id"],
                "domain_snapshot_id": snapshot_row["id"],
                "ip": ip,
                "asn": int(asn_value) if asn_value else None,
                "network_operator": provider["network_operator"],
                "likely_hosting_provider": provider["likely_hosting_provider"],
                "cdn_provider": provider["cdn_provider"],
                "infrastructure_confidence": provider["confidence"],
                "relationship_features": {
                    "source": provider["basis"],
                    "serverHeader": response_server or None,
                    "whois": ip_whois[ip],
                    "originHostConfirmed": False,
                    "warning": "IP WHOIS identifies the network owner; a reverse proxy or CDN may conceal the origin host.",
                },
            }).execute()
        analysis = _analyse_capture(
            db,
            job["brand_id"],
            candidate,
            result,
            {**capture, "resolved_ips": resolved_ips},
            tls=tls,
            nameservers=nameservers,
            screenshot_sha256=screenshot_sha256,
        )
        db.table("url_candidates").update({"candidate_status": "review", "last_scanned_at": datetime.now(timezone.utc).isoformat(), "version": candidate["version"] + 1}).eq("id", candidate["id"]).execute()
        db.table("crawl_jobs").update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()}).eq("id", job["id"]).execute()
        _heartbeat(db, worker_id, "idle", metrics={"lastCompletedJob": job["id"], "lastResultId": result["id"]})
        logger.info("shield_capture_completed job_id=%s candidate_id=%s version=%s", job["id"], candidate["id"], version)
        return {"status": "completed", "job_id": job["id"], "result_id": result["id"], "analysis": analysis}
    except Exception as exc:
        terminal = job["attempt_count"] + 1 >= job["max_attempts"]
        retry_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        db.table("crawl_jobs").update({"status": "dead_letter" if terminal else "queued", "available_at": retry_at, "completed_at": datetime.now(timezone.utc).isoformat() if terminal else None, "last_error_code": type(exc).__name__, "last_error_detail": str(exc)[:500]}).eq("id", job["id"]).execute()
        if terminal:
            db.table("url_candidates").update({"candidate_status": "failed"}).eq("id", candidate["id"]).execute()
        logger.warning("shield_capture_failed job_id=%s code=%s", job["id"], type(exc).__name__)
        _heartbeat(db, worker_id, "degraded", job_id=job["id"], metrics={"errorCode": type(exc).__name__})
        return {"status": "failed", "job_id": job["id"], "error_code": type(exc).__name__}


def _analyse_capture(db, brand_id: str, candidate: dict, crawl_result: dict,
                     capture: dict, *, tls: dict | None = None,
                     nameservers: list[str] | None = None,
                     screenshot_sha256: str | None = None) -> dict:
    terms = db.table("brand_terms").select("*").eq("brand_id", brand_id).eq("active", True).execute().data or []
    assets = db.table("brand_assets").select("id,name,asset_type,canonical_value").eq("brand_id", brand_id).eq("active", True).execute().data or []
    text = f"{capture.get('page_title', '')} {capture.get('visible_text', '')}".lower()
    strong_hits = []
    ambiguous_hits = []
    for term in terms:
        value = str(term.get("term", "")).lower().strip()
        if not value or not re.search(rf"(?<!\w){re.escape(value)}(?!\w)", text, flags=re.I):
            continue
        if term.get("requires_context"):
            context = [str(item).lower() for item in term.get("context_terms") or []]
            if any(re.search(rf"\b{re.escape(item)}\b", text) for item in context):
                ambiguous_hits.append(value)
        else:
            strong_hits.append(value)
    domain = (candidate.get("domain") or {}).get("ascii_domain") or urlsplit(candidate["canonical_url"]).hostname or ""
    protected = [str(item.get("canonical_value", "")) for item in assets if item.get("asset_type") in {"domain", "brand"}] + ["physicswallah", "pw"]
    domain_similarity = max((SequenceMatcher(None, domain.split(".")[0].replace("-", ""), item.split(".")[0].replace("-", "").lower()).ratio() for item in protected if item), default=0)
    brand_match = min(100, len(strong_hits) * 24 + len(ambiguous_hits) * 12 + domain_similarity * 35)
    indicators = {
        "login": bool(re.search(r"\b(login|sign in|password|otp)\b", text)),
        "payment": bool(re.search(r"\b(payment|upi|pay now|discount|refund)\b", text)),
        "piracy": bool(re.search(r"\b(free download|leaked|cracked|mod apk|shared account|watch free)\b", text)),
        "brandTerms": strong_hits,
        "contextualTerms": ambiguous_hits,
        "domainSimilarity": round(domain_similarity * 100, 2),
    }
    qualification = qualify_capture(
        url=candidate["canonical_url"],
        title=capture.get("page_title") or "",
        text=capture.get("visible_text") or "",
        forms=capture.get("form_fields") or [],
        download_links=capture.get("download_links") or [],
        social_links=capture.get("social_links") or [],
        domain_similarity=domain_similarity * 100,
    )
    infringement = qualification.threat_evidence_score
    classification = qualification.confidence
    harm = (
        95
        if qualification.threat_type in {"phishing", "credential_extraction"}
        else 82
        if qualification.threat_type in {"piracy", "malicious_application"}
        else 25
        if qualification.verdict in {"discard", "benign_reference"}
        else 45
    )
    reach = min(100, 15 + len(capture.get("external_links") or []) / 5)
    velocity = 20
    previous = db.table("crawl_results").select("candidate_id,content_sha256").eq("brand_id", brand_id).eq("content_sha256", crawl_result.get("content_sha256")).neq("candidate_id", candidate["id"]).limit(20).execute().data or []
    recurrence = 85 if previous else 10
    priority = round(
        0.25 * harm
        + 0.20 * qualification.threat_evidence_score
        + 0.15 * reach
        + 0.10 * velocity
        + 0.10 * classification
        + 0.10 * recurrence
        + 0.10 * qualification.brand_relevance_score,
        2,
    )
    band = "urgent" if priority >= 85 else "high" if priority >= 70 else "analyst_review" if priority >= 50 else "low" if priority >= 30 else "monitor"
    db.table("content_matches").insert({"brand_id": brand_id, "candidate_id": candidate["id"], "crawl_result_id": crawl_result["id"], "match_type": "brand_entity", "score": round(qualification.brand_relevance_score / 100, 4), "deterministic": True, "feature_explanation": qualification.brand_signals, "model_version": qualification.model_version}).execute()
    qualification_versions = db.table("gati_qualification_results").select("analysis_version").eq("candidate_id", candidate["id"]).order("analysis_version", desc=True).limit(1).execute().data or []
    analysis_version = (qualification_versions[0]["analysis_version"] if qualification_versions else 0) + 1
    qualification_row = db.table("gati_qualification_results").insert({
        "brand_id": brand_id,
        "candidate_id": candidate["id"],
        "crawl_result_id": crawl_result["id"],
        "analysis_version": analysis_version,
        **qualification.as_record(),
    }).execute().data[0]
    db.table("threat_scores").insert({"brand_id": brand_id, "candidate_id": candidate["id"], "brand_match_score": qualification.brand_relevance_score, "infringement_confidence": infringement, "harm_score": harm, "reach_score": reach, "velocity_score": velocity, "classification_confidence": classification, "recurrence_score": recurrence, "priority_score": priority, "handling_band": band, "formula_version": "gati-priority-v1", "feature_explanation": {"qualificationId": qualification_row["id"], "brandSignals": qualification.brand_signals, "threatSignals": qualification.threat_signals, "reach": reach, "legalDetermination": False}}).execute()
    db.table("gati_artifact_analyses").insert({
        "brand_id": brand_id,
        "candidate_id": candidate["id"],
        "crawl_result_id": crawl_result["id"],
        "artifact_type": "screenshot",
        "source_url": candidate["canonical_url"],
        "object_path": crawl_result.get("screenshot_object_path"),
        "sha256": screenshot_sha256,
        "perceptual_hash": screenshot_sha256,
        "findings": {
            "detectedImages": len(capture.get("detected_images") or []),
            "visualEmbeddingStatus": "adapter_ready",
            "executionPerformed": False,
        },
        "risk_score": qualification.threat_evidence_score,
        "analyzer_version": GATI_ARTIFACT_VERSION,
    }).execute()
    entities = extract_graph_entities(
        url=candidate["canonical_url"],
        capture=capture,
        tls=tls,
        nameservers=nameservers,
    )
    persisted_entities: dict[tuple[str, str], dict] = {}
    for entity in entities:
        row = db.table("gati_entities").upsert({
            "brand_id": brand_id,
            **entity,
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="brand_id,entity_type,value_hash").execute().data[0]
        persisted_entities[(entity["entity_type"], entity["canonical_value"])] = row
    domain_entity = next((row for (kind, _), row in persisted_entities.items() if kind == "domain"), None)
    if domain_entity:
        relation_by_type = {
            "ip": "resolves_to",
            "nameserver": "uses_nameserver",
            "tls_certificate": "uses_certificate",
            "social_account": "links_to",
            "telegram_channel": "distributes",
            "repository": "links_to",
            "content_fingerprint": "shares_content",
        }
        for (kind, _), target in persisted_entities.items():
            relation = relation_by_type.get(kind)
            if not relation or target["id"] == domain_entity["id"]:
                continue
            db.table("gati_entity_links").upsert({
                "brand_id": brand_id,
                "source_entity_id": domain_entity["id"],
                "target_entity_id": target["id"],
                "relation_type": relation,
                "confidence": 0.95 if kind in {"ip", "nameserver", "tls_certificate", "content_fingerprint"} else 0.75,
                "evidence": {"crawlResultId": crawl_result["id"], "graphVersion": GATI_GRAPH_VERSION},
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            }, on_conflict="source_entity_id,target_entity_id,relation_type").execute()
    campaign = campaign_identity(
        qualification=qualification,
        url=candidate["canonical_url"],
        content_sha256=crawl_result.get("content_sha256"),
        entities=entities,
    )
    campaign_row = db.table("gati_campaigns").upsert({
        "brand_id": brand_id,
        **{key: campaign[key] for key in ("campaign_key", "title", "campaign_type", "status", "risk_score", "summary")},
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="brand_id,campaign_key").execute().data[0]
    db.table("gati_campaign_members").upsert({
        "brand_id": brand_id,
        "campaign_id": campaign_row["id"],
        "candidate_id": candidate["id"],
        "match_score": campaign["match_score"],
        "match_reasons": campaign["match_reasons"],
    }, on_conflict="campaign_id,candidate_id").execute()
    for prior in previous:
        cases = db.table("threat_cases").select("id").eq("candidate_id", prior["candidate_id"]).limit(1).execute().data or []
        if cases:
            db.table("reappearance_links").upsert({"brand_id": brand_id, "original_case_id": cases[0]["id"], "new_candidate_id": candidate["id"], "match_score": 95, "match_features": {"contentSha256": True}, "status": "suspected"}, on_conflict="original_case_id,new_candidate_id").execute()
    return {
        "brand_match": qualification.brand_relevance_score,
        "infringement_confidence": qualification.threat_evidence_score,
        "priority": priority,
        "handling_band": band,
        "verdict": qualification.verdict,
        "threat_type": qualification.threat_type,
        "campaign_id": campaign_row["id"],
    }
