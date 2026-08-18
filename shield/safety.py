"""Network safety primitives used before and during Shield captures."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

TRACKING_KEYS = {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "ref", "referrer"}


def canonicalize_url(raw: str) -> str:
    parsed = urlsplit((raw or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only absolute HTTP(S) URLs are supported")
    if parsed.username or parsed.password:
        raise ValueError("Credential-bearing URLs are blocked")
    host = parsed.hostname.encode("idna").decode("ascii").lower()
    port = parsed.port
    netloc = host if port is None or (parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443) else f"{host}:{port}"
    query = sorted((key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True) if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS)
    return urlunsplit((parsed.scheme, netloc, parsed.path or "/", urlencode(query), ""))


def is_public_ip(value: str) -> bool:
    try:
        address = ipaddress.ip_address(value.split("%")[0])
    except ValueError:
        return False
    return bool(address.is_global and not address.is_multicast and not address.is_reserved)


def resolve_public(hostname: str) -> set[str]:
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise ValueError("Local destinations are blocked")
    addresses = {record[4][0] for record in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)}
    if not addresses or not all(is_public_ip(address) for address in addresses):
        raise ValueError("Private, loopback, link-local or reserved destinations are blocked")
    return addresses


def assert_no_rebinding(before: set[str], after: set[str]) -> None:
    if not before or not after or not before.intersection(after) or not all(is_public_ip(address) for address in before | after):
        raise ValueError("DNS rebinding protection blocked the destination")


def is_authorised(hostname: str, rows: list[dict]) -> bool:
    host = hostname.encode("idna").decode("ascii").lower()
    return any(host == row["domain"] or (row.get("allow_subdomains", True) and host.endswith(f".{row['domain']}")) for row in rows)
