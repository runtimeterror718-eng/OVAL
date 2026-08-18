import pytest

from shield.safety import assert_no_rebinding, canonicalize_url, is_authorised, is_public_ip
from shield.worker import (
    classify_network_provider,
    parse_whois_response,
    passive_security_observations,
)


def test_canonicalization_and_tracking_deduplication():
    assert canonicalize_url("https://Example.COM:443/path?utm_source=x&id=2#x") == "https://example.com/path?id=2"


def test_ssrf_ranges_are_not_public():
    for address in ["127.0.0.1", "10.2.3.4", "169.254.169.254", "::1", "fc00::1"]:
        assert not is_public_ip(address)


def test_dns_rebinding_requires_a_stable_public_address():
    with pytest.raises(ValueError):
        assert_no_rebinding({"93.184.216.34"}, {"1.1.1.1"})
    assert_no_rebinding({"93.184.216.34"}, {"93.184.216.34", "93.184.216.35"})


def test_authorised_domain_does_not_accept_suffix_attack():
    rows = [{"domain": "pw.live", "allow_subdomains": True}]
    assert is_authorised("learn.pw.live", rows)
    assert not is_authorised("pw.live.attacker.example", rows)


def test_credentials_and_non_http_urls_are_blocked():
    with pytest.raises(ValueError):
        canonicalize_url("file:///etc/passwd")
    with pytest.raises(ValueError):
        canonicalize_url("https://user:pass@example.com/")


def test_passive_posture_classifies_credentials_downloads_without_claiming_exploitability():
    result = passive_security_observations(
        "https://suspected.example/",
        {"content-security-policy": "default-src 'self'", "server": "nginx"},
        [{"type": "password", "name": "password", "action": "http://collector.example/login"}],
        [
            {"href": "https://cdn.example/pw.apk", "text": "Download APK", "download": False},
            {"href": "https://t.me/example", "text": "Telegram", "download": False},
        ],
    )
    assert result["assessmentType"] == "passive_observation_only"
    assert result["credentialFieldTypes"] == ["password"]
    assert result["insecureFormActions"] == ["http://collector.example/login"]
    assert result["downloadLinks"] == ["https://cdn.example/pw.apk"]
    assert result["socialLinks"] == ["https://t.me/example"]
    assert "Strict-Transport-Security" in result["missingSecurityHeaders"]
    assert "not proof" in result["disclaimer"]


def test_domain_whois_parser_extracts_provider_fields_without_raw_response():
    raw = """
Domain Name: EXAMPLE.COM
Registrar: Example Registrar, LLC
Registrar WHOIS Server: whois.example.test
Registrar Abuse Contact Email: abuse@example.test
Creation Date: 2024-01-01T00:00:00Z
Registry Expiry Date: 2027-01-01T00:00:00Z
Name Server: NS1.EXAMPLE.TEST
Registrant Organization: Privacy Service
"""
    result = parse_whois_response(raw, target_type="domain")
    assert result["registrar"] == "Example Registrar, LLC"
    assert result["registrarWhoisServer"] == "whois.example.test"
    assert result["abuseEmail"] == "abuse@example.test"
    assert result["nameservers"] == ["NS1.EXAMPLE.TEST"]
    assert "raw" not in result
    assert len(result["responseSha256"]) == 64


def test_ip_whois_distinguishes_cdn_from_probable_host():
    cloudflare = parse_whois_response(
        "NetName: CLOUDFLARENET\nOrgName: Cloudflare, Inc.\nOrgAbuseEmail: abuse@cloudflare.com",
        target_type="ip",
    )
    edge = classify_network_provider(cloudflare, response_server="cloudflare")
    assert edge["cdn_provider"] == "Cloudflare"
    assert edge["likely_hosting_provider"] is None

    origin = parse_whois_response(
        "NetName: EXAMPLE-HOST\nOrgName: Example Hosting Pvt Ltd\nOriginAS: AS64500",
        target_type="ip",
    )
    host = classify_network_provider(origin)
    assert host["network_operator"] == "Example Hosting Pvt Ltd"
    assert host["likely_hosting_provider"] == "Example Hosting Pvt Ltd"

    ripe = parse_whois_response(
        "organisation: RIPE NCC\nnetname: HOSTINGER-HOSTING\ndescr: HOSTINGER GB\norg-name: Private Customer",
        target_type="ip",
    )
    assert ripe["networkOperator"] == "HOSTINGER GB"
