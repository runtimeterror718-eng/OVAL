import { NextResponse } from "next/server";
import { SHIELD_REAL_CASES } from "@/data/shield-real-data";
import {
  migrationMissing,
  requireShieldContext,
  shieldErrorResponse,
} from "@/lib/shield-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export async function GET() {
  try {
    const { admin, member } = await requireShieldContext("read");
    const result = await admin
      .from("url_candidates")
      .select(
        "*,domain:domains(*,snapshots:domain_snapshots(*,infrastructure:infrastructure_observations(*))),results:crawl_results(id,capture_version,http_status,response_headers,redirect_chain,page_title,metadata,indicators,detected_images,external_links,download_links,social_links,network_destinations,sanitised_html_object_path,screenshot_object_path,content_sha256,crawler_version,captured_at),scores:threat_scores(*),qualifications:gati_qualification_results(*),artifacts:gati_artifact_analyses(*),cases:threat_cases(*),events:discovery_events(*)",
      )
      .eq("brand_id", member.brand_id)
      .order("created_at", { ascending: false })
      .limit(250);
    if (result.error) throw result.error;
    const databaseCases = (result.data || []).map(toDashboardCase);
    const snapshotHashes = new Set(
      databaseCases.map((item: any) => item.sourceUrl),
    );
    const cases = [
      ...databaseCases,
      ...SHIELD_REAL_CASES.filter(
        (item) => !snapshotHashes.has(item.sourceUrl),
      ),
    ];
    return response({
      live: true,
      mode: "database",
      source: "Gati · OVAL Shield proprietary threat engine",
      cases,
    });
  } catch (error) {
    if (!migrationMissing(error)) return shieldErrorResponse(error);
    return response({
      live: false,
      mode: "verified_snapshot",
      source: "Verified public-web snapshot · Phase 1 migration pending",
      cases: SHIELD_REAL_CASES,
    });
  }
}

function response(input: {
  live: boolean;
  mode: string;
  source: string;
  cases: any[];
}) {
  const scannedAt = input.cases.reduce(
    (latest, item) => (item.verifiedAt > latest ? item.verifiedAt : latest),
    "",
  );
  return NextResponse.json(
    {
      ...input,
      scannedAt,
      caseCount: input.cases.length,
      warnings: [
        "Discovery is not a legal determination. Suspected sources require human verification.",
        "Search coverage is not exhaustive and can include stale indexed pages.",
        "No external complaint, report or takedown is submitted automatically.",
      ],
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

function toDashboardCase(row: any) {
  const qualification =
    [...(row.qualifications || [])].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    )[0] || null;
  const artifacts = [...(row.artifacts || [])].sort((a, b) =>
    String(b.analyzed_at).localeCompare(String(a.analyzed_at)),
  );
  const score =
    [...(row.scores || [])].sort((a, b) =>
      String(b.scored_at).localeCompare(String(a.scored_at)),
    )[0] || {};
  const threatCase = row.cases?.[0] || {};
  const event =
    [...(row.events || [])].sort((a, b) =>
      String(b.discovered_at).localeCompare(String(a.discovered_at)),
    )[0] || {};
  const capture =
    [...(row.results || [])].sort((a, b) =>
      String(b.captured_at).localeCompare(String(a.captured_at)),
    )[0] || {};
  const snapshot =
    [...(row.domain?.snapshots || [])].sort((a, b) =>
      String(b.captured_at).localeCompare(String(a.captured_at)),
    )[0] || {};
  const infrastructure = snapshot.infrastructure?.[0] || {};
  const domainWhois = snapshot.whois || {};
  const networkWhois = infrastructure.relationship_features?.whois || {};
  const dnsRecords = Object.entries(snapshot.dns || {}).map(
    ([type, records]: [string, any]) => ({
      type: type.toUpperCase(),
      values: (Array.isArray(records) ? records : [])
        .map((record: any) =>
          typeof record === "string"
            ? record
            : record?.data || record?.address || record?.unavailable,
        )
        .filter(Boolean),
    }),
  );
  const seo = capture.metadata?.seo || {};
  const nameservers = snapshot.nameservers || [];
  const resolvedIps = (snapshot.resolved_ips || []).map(String);
  const tls = snapshot.tls || {};
  const rdap = snapshot.rdap || {};
  const safeHeaderNames = new Set([
    "content-type",
    "content-length",
    "cache-control",
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "server",
    "location",
  ]);
  const responseHeaders = Object.entries(capture.response_headers || {})
    .filter(([name]) => safeHeaderNames.has(name.toLowerCase()))
    .map(([name, value]) => ({ name, value: String(value) }));
  const confidence = Math.round(
    Number(score.brand_match_score || row.provider_confidence || 0) *
      (Number(score.brand_match_score || 0) <= 1 ? 100 : 1),
  );
  const severity =
    Number(score.priority_score || 0) >= 85
      ? "Critical"
      : Number(score.priority_score || 0) >= 70
        ? "High"
        : Number(score.priority_score || 0) >= 50
          ? "Medium"
          : "Low";
  const statusMap: Record<string, string> = {
    discovered: "New",
    queued: "New",
    scanning: "Investigating",
    analysed: "Investigating",
    review: "Investigating",
    verified: "Verified",
    irrelevant: "Rejected",
    false_positive: "False Positive",
    case_created: "Investigating",
    failed: "Monitoring",
  };
  return {
    id: threatCase.id || row.id,
    title:
      threatCase.title ||
      event.title ||
      row.suspected_threat_type ||
      "Suspicious PW signal",
    description:
      event.excerpt ||
      row.source_context?.description ||
      "Candidate awaiting safe analysis.",
    category: row.suspected_threat_type || "Trademark Misuse",
    sourceType: "Search Monitoring",
    sourceUrl: row.canonical_url,
    sourcePublishedAt: event.provider_timestamp || undefined,
    verifiedAt: capture.captured_at || row.last_scanned_at || row.created_at,
    verificationState:
      threatCase.verification_status === "verified"
        ? "Verified"
        : row.candidate_status === "failed"
          ? "Unavailable"
          : "Detected",
    dataOrigin: event.discovery_method || "Gati discovery pipeline",
    sourceExcerpt: event.excerpt || "Discovery event awaiting content capture.",
    domain: row.domain?.ascii_domain || new URL(row.canonical_url).hostname,
    platform: event.provider || "Web",
    affectedEntity:
      row.suspected_threat_type || "Physics Wallah brand or content",
    severity,
    confidence,
    estimatedReach: Number(score.feature_explanation?.reach || 0),
    detectedAfterMinutes: 0,
    actionAfterMinutes: 0,
    firstDetectedAt: row.created_at,
    lastSeenAt: capture.captured_at || row.updated_at,
    registrar: snapshot.registrar || rdap.registrar || "Pending enrichment",
    hostingProvider: infrastructure.likely_hosting_provider
      ? infrastructure.likely_hosting_provider
      : infrastructure.cdn_provider
        ? `Origin concealed behind ${infrastructure.cdn_provider}`
        : infrastructure.network_operator || "Pending enrichment",
    networkOperator: infrastructure.network_operator || undefined,
    cdnProvider: infrastructure.cdn_provider || undefined,
    infrastructureSource:
      infrastructure.relationship_features?.source || undefined,
    networkAbuseContact: networkWhois.abuseEmail || undefined,
    nameservers,
    resolvedIp: resolvedIps.join(" · ") || "Pending enrichment",
    cloudflareRelationship: cloudflareLabel(snapshot.cloudflare_relationship),
    relatedDomains: [],
    relatedSocialPosts: [],
    affectedAsset: row.suspected_threat_type || "PW asset pending match",
    classificationReasoning:
      "Deterministic discovery and scoring features are preserved in the candidate record. Human verification is required.",
    severityExplanation: `Priority score ${score.priority_score || 0}/100 using ${score.formula_version || "pending scoring"}.`,
    trafficSignals: "Reach remains unverified until enrichment is complete.",
    gati: qualification
      ? {
          brandRelevance: Number(qualification.brand_relevance_score || 0),
          threatEvidence: Number(qualification.threat_evidence_score || 0),
          verdict: qualification.verdict,
          threatType: qualification.threat_type,
          explanation: qualification.explanation,
          positiveSignals: qualification.positive_signals || [],
          negativeSignals: qualification.negative_signals || [],
          analysisVersion: qualification.analysis_version,
          artifacts: artifacts.map((artifact: any) => ({
            type: artifact.artifact_type,
            riskScore: Number(artifact.risk_score || 0),
            packageName: artifact.package_name,
            applicationLabel: artifact.application_label,
            sha256: artifact.sha256,
            findings: artifact.findings || {},
          })),
        }
      : undefined,
    evidence: capture.id
      ? [
          {
            id: capture.id,
            version: capture.capture_version,
            exactUrl: row.canonical_url,
            pageTitle: capture.page_title || event.title || row.domain?.ascii_domain,
            captureTimestamp: capture.captured_at,
            screenshotLabel: capture.screenshot_object_path
              ? "Private screenshot captured"
              : "Screenshot unavailable",
            dnsData:
              dnsRecords
                .filter((item) => item.values.length)
                .map((item) => `${item.type}: ${item.values.join(", ")}`)
                .join(" · ") || "DNS pending",
            registrar: snapshot.registrar || "Pending enrichment",
            hostingData:
              infrastructure.likely_hosting_provider || "Unattributed",
            resolvedIp: resolvedIps.join(" · ") || "Unavailable",
            certificateInfo:
              tls.issuer || tls.subject
                ? JSON.stringify({ issuer: tls.issuer, subject: tls.subject })
                : tls.unavailable || "TLS metadata unavailable",
            originalAsset: row.suspected_threat_type || "PW protected asset",
            suspectedAsset: capture.page_title || event.title || row.canonical_url,
            similarityScore: confidence,
            contentHash: capture.content_sha256 || "Unavailable",
            detectionSource: event.discovery_method || "Gati",
            reachEvidence: "Public-page capture; traffic remains unverified",
            immutable: false,
            captureStatus: "Captured",
          },
        ]
      : [],
    evidenceReadiness: capture.id ? "Ready" : "Capturing",
    recommendedActions: ["Monitor Only"],
    owner: "Unassigned",
    supportingTeam: "Brand",
    sla:
      severity === "Critical"
        ? "4 hours"
        : severity === "High"
          ? "24 hours"
          : "3 business days",
    dueAt: row.next_scan_at || row.updated_at,
    nextAction: "Complete safe crawl and human verification",
    status: statusMap[row.candidate_status] || "New",
    legalReviewStatus:
      threatCase.legal_status === "approved" ? "Approved" : "Not Requested",
    enforcementDestination: "Human review queue",
    submissionHistory: [],
    relatedCaseIds: [],
    reappearanceCount: Number(threatCase.recurrence_count || 0),
    auditTrail: [
      {
        id: `audit-${row.id}`,
        at: row.created_at,
        actor: "Gati",
        action: "Candidate discovered",
        detail: "Candidate entered the human-review pipeline.",
      },
    ],
    domainIntelligence: snapshot.id
      ? {
          similarity: confidence,
          threatTypes: [row.suspected_threat_type || "Unclassified"],
          registrationAgeDays: ageInDays(
            snapshot.registration_date || rdap.events?.registration,
          ),
          copiedAssets: Array.isArray(capture.detected_images)
            ? capture.detected_images.length
            : 0,
          loginDetected: Boolean(capture.indicators?.login),
          paymentDetected: Boolean(capture.indicators?.payment),
          riskScore: Math.round(Number(score.priority_score || 0)),
        }
      : undefined,
    webIntelligence: capture.id || snapshot.id
      ? {
          capturedAt: capture.captured_at || snapshot.captured_at,
          httpStatus: capture.http_status,
          redirectChain: capture.redirect_chain || [],
          responseHeaders,
          dnsRecords,
          rdap: {
            registrar: snapshot.registrar || rdap.registrar,
            registeredAt: snapshot.registration_date || rdap.events?.registration,
            expiresAt: snapshot.expiration_date || rdap.events?.expiration,
            abuseContact: snapshot.abuse_contact || rdap.abuseContact,
          },
          whois: {
            available: Boolean(domainWhois.available),
            registrar: domainWhois.registrar,
            registrarWhoisServer: domainWhois.registrarWhoisServer,
            registrarUrl: domainWhois.registrarUrl,
            registrarIanaId: domainWhois.registrarIanaId,
            abuseEmail: domainWhois.abuseEmail,
            abusePhone: domainWhois.abusePhone,
            createdAt: domainWhois.createdAt,
            expiresAt: domainWhois.expiresAt,
            updatedAt: domainWhois.updatedAt,
            registrantOrganisation: domainWhois.registrantOrganisation,
            registrantCountry: domainWhois.registrantCountry,
            responseSha256: domainWhois.responseSha256,
          },
          tls: {
            protocol: tls.version,
            issuer: tls.issuer ? JSON.stringify(tls.issuer) : undefined,
            subject: tls.subject ? JSON.stringify(tls.subject) : undefined,
            validFrom: tls.notBefore,
            validTo: tls.notAfter,
          },
          seo: {
            title: seo.title,
            description: seo.description,
            canonical: seo.canonical,
            robots: seo.robots,
            language: seo.language,
            h1: seo.h1 || [],
            h2: seo.h2 || [],
            schemaTypes: seo.schemaTypes || [],
            internalLinkCount: seo.internalLinkCount,
            externalLinkCount: seo.externalLinkCount,
            imageCount: seo.imageCount,
            openGraph: cleanMetadataRecord(seo.openGraph),
            twitter: cleanMetadataRecord(seo.twitter),
          },
          links: {
            external: stringList(capture.external_links),
            downloads: stringList(capture.download_links),
            social: stringList(capture.social_links),
            networkDestinations: stringList(capture.network_destinations),
          },
        }
      : undefined,
  };
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) =>
      typeof item === "string"
        ? item
        : item?.url || item?.href || item?.destination || item?.host,
    )
    .filter(Boolean)
    .map(String)
    .slice(0, 25);
}

function cleanMetadataRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "string" && item.trim())
      .map(([key, item]) => [key, String(item)]),
  );
}

function cloudflareLabel(value: string | undefined) {
  if (value === "reverse_proxy_likely") return "Reverse proxy only";
  if (value === "registrar_confirmed") return "Registrar only";
  if (value === "hosted_service_detected") return "Cloudflare-hosted service";
  if (value === "none_detected") return "None detected";
  return "Unconfirmed";
}

function ageInDays(value: string | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
    : 0;
}
