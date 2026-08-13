import zipfile

from shield.gati import (
    analyse_application_artifact,
    campaign_identity,
    extract_graph_entities,
    qualify_capture,
)


def test_physical_book_resale_is_not_promoted_as_piracy():
    result = qualify_capture(
        url="https://market.example/pw-books",
        title="Physics Wallah used module set",
        text="Gently used physical books and test papers. Condition: like new.",
    )
    assert result.brand_relevance_score >= 55
    assert result.threat_evidence_score < 25
    assert result.threat_type == "legitimate_resale"
    assert result.verdict == "benign_reference"


def test_bulk_lecture_resale_is_sent_to_review():
    result = qualify_capture(
        url="https://market.example/pw-lectures",
        title="Physics Wallah course",
        text="All video lectures with DPP available on a 128 GB SSD. Pay now.",
    )
    assert result.brand_relevance_score >= 55
    assert result.threat_evidence_score >= 40
    assert result.threat_type == "piracy"
    assert result.verdict in {"analyst_review", "high_priority_review"}


def test_mod_apk_with_direct_download_is_high_priority():
    result = qualify_capture(
        url="https://mods.example/physics-wallah-mod.apk",
        title="Physics Wallah Mod APK Premium Unlocked",
        text="Free download cracked application",
        download_links=["https://cdn.example/pw-mod.apk"],
    )
    assert result.threat_type == "malicious_application"
    assert result.threat_evidence_score >= 70
    assert result.verdict == "high_priority_review"


def test_generic_pw_without_education_context_is_discarded():
    result = qualify_capture(
        url="https://industry.example/pw-output",
        title="PW quarterly output",
        text="Industrial production results",
    )
    assert result.brand_relevance_score < 30
    assert result.verdict == "discard"


def test_graph_and_campaign_are_deterministic():
    capture = {
        "resolved_ips": ["203.0.113.4"],
        "content_sha256": "abc123",
        "social_links": ["https://t.me/pw_leaks"],
    }
    entities = extract_graph_entities(
        url="https://piracy.example/pw",
        capture=capture,
        tls={"subject": "piracy.example"},
        nameservers=["NS1.EXAMPLE."],
    )
    qualification = qualify_capture(
        url="https://piracy.example/pw",
        title="Physics Wallah leaked batch",
        text="Watch free lectures",
        social_links=capture["social_links"],
    )
    first = campaign_identity(
        qualification=qualification,
        url="https://piracy.example/pw",
        content_sha256="abc123",
        entities=entities,
    )
    second = campaign_identity(
        qualification=qualification,
        url="https://piracy.example/pw",
        content_sha256="abc123",
        entities=entities,
    )
    assert first["campaign_key"] == second["campaign_key"]
    assert {item["entity_type"] for item in entities} >= {
        "domain",
        "url",
        "ip",
        "nameserver",
        "tls_certificate",
        "content_fingerprint",
        "telegram_channel",
    }


def test_static_application_analysis_never_executes_artifact(tmp_path):
    artifact = tmp_path / "pw-mod.apk"
    with zipfile.ZipFile(artifact, "w") as archive:
        archive.writestr("assets/config.json", '{"api":"https://collector.example/login"}')
        archive.writestr("lib/frida-hook.txt", "hook")
    result = analyse_application_artifact(artifact)
    assert result["artifact_type"] == "apk"
    assert "collector.example" in result["embedded_domains"]
    assert result["findings"]["executionPerformed"] is False
    assert result["risk_score"] > 15


def test_static_application_analysis_rejects_oversized_files(tmp_path):
    artifact = tmp_path / "oversized.apk"
    artifact.write_bytes(b"12345")
    try:
        analyse_application_artifact(artifact, max_bytes=4)
    except ValueError as error:
        assert "inspection limit" in str(error)
    else:
        raise AssertionError("oversized artifact should be rejected")
