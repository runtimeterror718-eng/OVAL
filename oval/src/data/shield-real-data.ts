import type { ShieldEvidence, ShieldThreatCase } from "@/lib/shield-types";

const SCAN_AT = "2026-08-10T17:40:00+05:30";

type RealCaseInput = Pick<
  ShieldThreatCase,
  | "id"
  | "title"
  | "description"
  | "category"
  | "sourceType"
  | "sourceUrl"
  | "domain"
  | "platform"
  | "affectedEntity"
  | "severity"
  | "confidence"
  | "estimatedReach"
  | "recommendedActions"
  | "status"
  | "verificationState"
  | "dataOrigin"
  | "sourceExcerpt"
> &
  Partial<ShieldThreatCase>;

function evidence(input: RealCaseInput): ShieldEvidence {
  return {
    id: `ev-${input.id}`,
    version: 1,
    exactUrl: input.sourceUrl,
    pageTitle: input.title,
    captureTimestamp: input.verifiedAt || SCAN_AT,
    screenshotLabel:
      "Public-page metadata captured · full legal evidence capture pending",
    dnsData: input.nameservers?.length
      ? `Nameservers: ${input.nameservers.join(", ")}`
      : "DNS enrichment pending",
    registrar: input.registrar || "Registrar enrichment pending",
    hostingData: input.hostingProvider || "Hosting enrichment pending",
    resolvedIp: input.resolvedIp || "Not resolved during scan",
    certificateInfo: "TLS metadata not yet preserved",
    originalAsset: input.affectedAsset || input.affectedEntity,
    suspectedAsset: input.title,
    similarityScore: input.confidence,
    contentHash: `pending-full-capture:${input.id.toLowerCase()}`,
    detectionSource: input.dataOrigin,
    reachEvidence:
      input.trafficSignals || "No reliable public reach figure was available",
    immutable: false,
    captureStatus: "Captured",
  };
}

function realCase(input: RealCaseInput): ShieldThreatCase {
  const firstDetectedAt = input.firstDetectedAt || SCAN_AT;
  return {
    sourcePublishedAt: undefined,
    verifiedAt: SCAN_AT,
    firstDetectedAt,
    lastSeenAt: input.lastSeenAt || SCAN_AT,
    registrar: "Registrar enrichment pending",
    hostingProvider: "Hosting enrichment pending",
    nameservers: [],
    resolvedIp: "Not resolved during scan",
    cloudflareRelationship: "Unconfirmed",
    relatedDomains: [],
    relatedSocialPosts: [],
    affectedAsset: input.affectedEntity,
    classificationReasoning:
      "The source explicitly associates Physics Wallah or PW with free, unlocked, copied or unofficial access. This is a discovery signal, not a legal conclusion; a rights-holder must verify the protected asset and context.",
    severityExplanation:
      "Severity combines possible learner harm, credential risk, public availability, stated distribution and source recency. It does not establish infringement by itself.",
    trafficSignals: "No reliable public reach figure was available",
    detectedAfterMinutes: 0,
    actionAfterMinutes: 0,
    evidenceReadiness: "Partial",
    owner: "Unassigned",
    supportingTeam: "Brand",
    sla:
      input.severity === "Critical"
        ? "4 hours"
        : input.severity === "High"
          ? "24 hours"
          : input.severity === "Medium"
            ? "3 business days"
            : "7 business days",
    dueAt:
      input.severity === "Critical"
        ? "2026-08-10T21:40:00+05:30"
        : input.severity === "High"
          ? "2026-08-11T17:40:00+05:30"
          : "2026-08-13T17:40:00+05:30",
    nextAction: input.recommendedActions[0],
    legalReviewStatus: "Not Requested",
    enforcementDestination: "Human verification queue",
    submissionHistory: [],
    relatedCaseIds: [],
    reappearanceCount: 0,
    auditTrail: [
      {
        id: `audit-${input.id}-discovery`,
        at: firstDetectedAt,
        actor: "OVAL Shield public-web scan",
        action: "Signal detected",
        detail:
          "A public source was added to the human-verification queue. No complaint or takedown was submitted.",
      },
    ],
    ...input,
    evidence: input.evidence || [evidence(input)],
  };
}

export const SHIELD_REAL_CASES: ShieldThreatCase[] = [
  realCase({
    id: "PW-REAL-001",
    title: "ApnaMod page advertises a PW MOD download",
    description:
      "The currently reachable page identifies the package as PW MOD, displays a downloadable APK and claims more than 10,000 downloads. The binary has not been downloaded or executed by OVAL.",
    category: "Fake Application",
    sourceType: "App Monitoring",
    sourceUrl: "https://apnamod.com/app/pw-mod",
    domain: "apnamod.com",
    platform: "APK website",
    affectedEntity: "Physics Wallah Android application and paid access",
    severity: "Critical",
    confidence: 96,
    estimatedReach: 10000,
    verificationState: "Suspected",
    dataOrigin: "Public web scan · page reachable with HTTP 200",
    sourceExcerpt:
      "The page labels the file PW MOD and presents an APK download with a publisher-reported 10,000+ downloads.",
    resolvedIp: "93.127.173.63 · 147.79.69.81",
    trafficSignals:
      "Publisher-displayed download count: 10,000+; independently audited reach unavailable",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Report to Actual Hosting Provider",
      "Request Search De-indexing",
    ],
    status: "Investigating",
    supportingTeam: "Information Security",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW Android application",
      detectionMethods: [
        "Exact brand-name match",
        "MOD/APK terminology",
        "Manual page availability check",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-001-original",
          label: "Official PW app",
          type: "Original",
          evidenceId: "ev-PW-REAL-001",
        },
        {
          id: "real-001-copy",
          label: "ApnaMod listing",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-001",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-002",
    title: "APKBros claims all PW batches are unlocked",
    description:
      "The reachable third-party page uses Physics Wallah branding and markets a modified APK as providing unrestricted premium course access. OVAL has not tested the downloadable file.",
    category: "Fake Application",
    sourceType: "App Monitoring",
    sourceUrl: "https://www.apkbros.com/pw-mod-apk/",
    domain: "apkbros.com",
    platform: "APK website",
    affectedEntity: "PW premium batches and Android application",
    severity: "High",
    confidence: 94,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Public web scan · page reachable with HTTP 200",
    sourceExcerpt:
      "The listing describes a PW MOD APK and claims premium features and all batches can be accessed without payment.",
    resolvedIp: "91.108.106.160 · 147.79.69.177",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Report to Actual Hosting Provider",
    ],
    status: "Investigating",
    supportingTeam: "Information Security",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW Android application and paid batches",
      detectionMethods: [
        "Brand-name match",
        "Unlocked-batch claim",
        "Manual page availability check",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-002-original",
          label: "Official PW app",
          type: "Original",
          evidenceId: "ev-PW-REAL-002",
        },
        {
          id: "real-002-copy",
          label: "APKBros listing",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-002",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-003",
    title: "APK.MOM advertises free premium PW access",
    description:
      "A reachable third-party listing claims to provide a modified PW application with all batches, live classes and premium subscription access. Its displayed vote total is not treated as verified reach.",
    category: "Fake Application",
    sourceType: "App Monitoring",
    sourceUrl: "https://apk.mom/pw/",
    domain: "apk.mom",
    platform: "APK website",
    affectedEntity: "PW subscriptions, live classes and paid batches",
    severity: "Critical",
    confidence: 95,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Public web scan · page reachable with HTTP 200",
    sourceExcerpt:
      "The listing markets all batches, premium subscription and live classes as unlocked in a PW MOD APK.",
    resolvedIp: "104.21.66.12 · 172.67.198.41",
    cloudflareRelationship: "Reverse proxy only",
    trafficSignals:
      "A very large publisher-displayed vote count appears on the page but is unverified and excluded from estimated reach",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Report to Cloudflare",
      "Report to Actual Hosting Provider",
    ],
    status: "New",
    supportingTeam: "Information Security",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW Android application and subscriptions",
      detectionMethods: [
        "Brand-name match",
        "Premium-unlock claim",
        "Manual page availability check",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-003-original",
          label: "Official PW app",
          type: "Original",
          evidenceId: "ev-PW-REAL-003",
        },
        {
          id: "real-003-copy",
          label: "APK.MOM listing",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-003",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-004",
    title: "PW MOD listing on Apkrabi no longer resolves",
    description:
      "Search discovery recorded a page advertising an all-batches-unlocked PW APK, but the hostname did not resolve during the current verification pass. It remains a historical lead rather than an active confirmed page.",
    category: "Fake Application",
    sourceType: "Search Monitoring",
    sourceUrl: "https://pw-apk.apkrabi.com/",
    domain: "pw-apk.apkrabi.com",
    platform: "APK website",
    affectedEntity: "PW Android application and paid batches",
    severity: "Medium",
    confidence: 72,
    estimatedReach: 0,
    verificationState: "Unavailable",
    dataOrigin:
      "Public search index · hostname did not resolve on verification",
    sourceExcerpt:
      "The indexed result described a PW MOD APK with all batches unlocked; the host is currently unavailable.",
    recommendedActions: ["Monitor Only", "Request Search De-indexing"],
    status: "Monitoring",
    supportingTeam: "Information Security",
    evidenceReadiness: "Partial",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW Android application",
      detectionMethods: ["Search-index evidence", "DNS availability check"],
      copiesDetected: 1,
      chain: [
        {
          id: "real-004-copy",
          label: "Unavailable indexed listing",
          type: "Mirror",
          evidenceId: "ev-PW-REAL-004",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-005",
    title: "Former AS Multiverse PW MOD page is now parked",
    description:
      "Search evidence associated AS Multiverse with PW MOD distribution, but the current domain resolves to an expired-domain sales page. The historical signal is retained for recurrence monitoring only.",
    category: "Fake Application",
    sourceType: "Search Monitoring",
    sourceUrl: "https://asmultiverse.xyz/",
    domain: "asmultiverse.xyz",
    platform: "Website",
    affectedEntity: "PW Android application and premium learning content",
    severity: "Low",
    confidence: 68,
    estimatedReach: 0,
    verificationState: "Unavailable",
    dataOrigin: "Public search index plus current page verification",
    sourceExcerpt:
      "The indexed result referred to PW MOD content; the domain currently displays an expired-domain sale page.",
    resolvedIp: "5.161.47.86 · 5.78.156.59 · 195.201.128.179",
    recommendedActions: ["Monitor Only"],
    status: "Removed",
    supportingTeam: "Information Security",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW Android application",
      detectionMethods: ["Search-index evidence", "Current page title check"],
      copiesDetected: 0,
      chain: [
        {
          id: "real-005-copy",
          label: "Historical listing; now parked",
          type: "Mirror",
          evidenceId: "ev-PW-REAL-005",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-006",
    title: "Public Telegram channel claims to provide free PW lectures",
    description:
      "A publicly indexed Telegram preview states that the channel provides free lectures from the Physics Wallah app. The visible preview showed seven subscribers during discovery; individual lecture ownership still requires verification.",
    category: "Pirated Lecture",
    sourceType: "Social Listening",
    sourceUrl: "https://www.t.me/s/physicswallahfreekhazana?before=2",
    domain: "t.me",
    platform: "Telegram",
    affectedEntity: "Physics Wallah app lectures",
    severity: "Medium",
    confidence: 89,
    estimatedReach: 7,
    verificationState: "Suspected",
    dataOrigin: "Public Telegram web preview · reachable with HTTP 200",
    sourceExcerpt:
      "The public channel description says it provides free lectures from the Physics Wallah app.",
    resolvedIp: "149.154.167.99",
    trafficSignals: "Public preview showed 7 subscribers at discovery time",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
      "Monitor Only",
    ],
    status: "Investigating",
    supportingTeam: "Legal",
    piracyIntelligence: {
      assetType: "Lectures",
      originalAsset: "Physics Wallah app lecture catalogue",
      detectionMethods: [
        "Channel-description match",
        "Manual public-preview review",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-006-original",
          label: "PW app lectures",
          type: "Original",
          evidenceId: "ev-PW-REAL-006",
        },
        {
          id: "real-006-social",
          label: "Telegram channel",
          type: "Social",
          evidenceId: "ev-PW-REAL-006",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-007",
    title: "Large Telegram index promoted PW MOD APK mirrors",
    description:
      "A third-party Telegram analytics index recorded an Arjuna JEE channel promoting two PW MOD APK links and described them as all-batches-unlocked alternatives. The analytics hostname did not resolve during this scan, so the indexed record needs independent capture.",
    category: "Fake Application",
    sourceType: "Social Listening",
    sourceUrl:
      "https://telemetr.io/en/channels/1656091466-arjuna_jee_2023_p_w/posts",
    domain: "telemetr.io",
    platform: "Telegram index",
    affectedEntity: "PW MOD APK and GATE/JEE batches",
    severity: "High",
    confidence: 82,
    estimatedReach: 38110,
    verificationState: "Detected",
    dataOrigin: "Public search-index snapshot of Telegram analytics page",
    sourceExcerpt:
      "The indexed archive reports a 38,110-subscriber channel promoting two PW MOD apps and backup links.",
    trafficSignals:
      "Indexed analytics snapshot displayed 38,110 subscribers; current count not independently verified",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
      "Escalate to PW Security",
    ],
    status: "New",
    supportingTeam: "Legal",
    evidenceReadiness: "Partial",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW app and paid GATE/JEE batches",
      detectionMethods: [
        "Telegram-index text match",
        "Subscriber-count snapshot",
        "Mirror-link language",
      ],
      copiesDetected: 2,
      chain: [
        {
          id: "real-007-original",
          label: "Official PW content",
          type: "Original",
          evidenceId: "ev-PW-REAL-007",
        },
        {
          id: "real-007-social",
          label: "Arjuna channel index",
          type: "Social",
          evidenceId: "ev-PW-REAL-007",
        },
        {
          id: "real-007-mirror",
          label: "Two advertised APK mirrors",
          type: "Mirror",
          evidenceId: "ev-PW-REAL-007",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-008",
    title: "Telegram seller advertises paid PW MOD access",
    description:
      "A Telegram analytics result indexed a channel advertising a paid modified PW application with unlocked batches and download functionality. The indexed page needs direct recapture because the analytics domain did not resolve in the current scan.",
    category: "Batch Resale",
    sourceType: "Social Listening",
    sourceUrl: "https://telemetr.io/en/channels/3665214302-pwmodapk57",
    domain: "telemetr.io",
    platform: "Telegram index",
    affectedEntity: "PW premium batches and modified application access",
    severity: "High",
    confidence: 80,
    estimatedReach: 794,
    verificationState: "Detected",
    dataOrigin: "Public search-index snapshot of Telegram analytics page",
    sourceExcerpt:
      "The indexed channel markets PW premium MOD access for ₹99 and displays a public audience figure near 794.",
    trafficSignals:
      "Indexed analytics snapshot displayed approximately 794 followers; current count not independently verified",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
      "Escalate to PW Security",
    ],
    status: "Investigating",
    supportingTeam: "Legal",
    piracyIntelligence: {
      assetType: "Batch Access",
      originalAsset: "PW premium batch access",
      detectionMethods: [
        "Offer-language match",
        "Price/resale indicator",
        "Telegram-index snapshot",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-008-original",
          label: "PW premium access",
          type: "Original",
          evidenceId: "ev-PW-REAL-008",
        },
        {
          id: "real-008-social",
          label: "Telegram resale channel",
          type: "Social",
          evidenceId: "ev-PW-REAL-008",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-009",
    title: "YouTube video promotes PW premium access for free",
    description:
      "A reachable YouTube page promotes a PW MOD APK and says premium courses and all lectures can be accessed without restrictions. Any linked binary remains untested.",
    category: "Fake Application",
    sourceType: "Social Listening",
    sourceUrl: "https://www.youtube.com/watch?v=3KPASpSdz1Y",
    domain: "youtube.com",
    platform: "YouTube",
    affectedEntity: "PW premium courses, batches and lectures",
    severity: "High",
    confidence: 93,
    estimatedReach: 37,
    verificationState: "Suspected",
    dataOrigin: "Public YouTube page and indexed description",
    sourceExcerpt:
      "The video description promotes an all-batches-unlocked PW MOD APK and says premium content is available free.",
    sourcePublishedAt: "2025-09-10T00:00:00Z",
    trafficSignals: "Public index displayed 37 views at discovery time",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
      "Escalate to PW Security",
    ],
    status: "Investigating",
    supportingTeam: "Legal",
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW app and paid course catalogue",
      detectionMethods: [
        "Title match",
        "Description match",
        "Manual page availability check",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-009-original",
          label: "Official PW app",
          type: "Original",
          evidenceId: "ev-PW-REAL-009",
        },
        {
          id: "real-009-social",
          label: "YouTube promotion",
          type: "Social",
          evidenceId: "ev-PW-REAL-009",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-010",
    title: "YouTube tutorial points users toward Telegram lecture copying",
    description:
      "A public tutorial describes saving PW lectures and directs viewers to Telegram bots or channels. The page is a distribution-enablement signal; the exact copied lectures and user entitlement require human review.",
    category: "Pirated Lecture",
    sourceType: "Social Listening",
    sourceUrl: "https://www.youtube.com/watch?v=YilRfriTx0M",
    domain: "youtube.com",
    platform: "YouTube",
    affectedEntity: "PW app lecture downloads",
    severity: "High",
    confidence: 88,
    estimatedReach: 8755,
    verificationState: "Detected",
    dataOrigin: "Public YouTube page and indexed description",
    sourceExcerpt:
      "The video describes saving PW lectures and refers users to Telegram bots and channel links.",
    sourcePublishedAt: "2024-03-01T00:00:00Z",
    trafficSignals: "Public index displayed 8,755 views at discovery time",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
      "Monitor Only",
    ],
    status: "Investigating",
    supportingTeam: "Legal",
    piracyIntelligence: {
      assetType: "Lectures",
      originalAsset: "PW app lecture catalogue",
      detectionMethods: [
        "Title match",
        "Description match",
        "Telegram distribution reference",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-010-original",
          label: "PW app lectures",
          type: "Original",
          evidenceId: "ev-PW-REAL-010",
        },
        {
          id: "real-010-social",
          label: "YouTube tutorial",
          type: "Social",
          evidenceId: "ev-PW-REAL-010",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-011",
    title: "Recent Reddit request seeks pirated PW lectures",
    description:
      "A recent public Reddit thread explicitly asks for pirated Physics Wallah lectures after Telegram access problems. This is demand and discovery evidence, not proof that Reddit hosts the protected files.",
    category: "Pirated Lecture",
    sourceType: "Social Listening",
    sourceUrl:
      "https://www.reddit.com/r/JEENEETards/comments/1u7lm9l/please_mujhe_lectures_chahiye/",
    domain: "reddit.com",
    platform: "Reddit",
    affectedEntity: "Physics Wallah lecture catalogue",
    severity: "Medium",
    confidence: 91,
    estimatedReach: 0,
    verificationState: "Detected",
    dataOrigin: "Public Reddit thread",
    sourceExcerpt:
      "The author states that they use pirated PW lectures and asks how to access them after Telegram disruption.",
    sourcePublishedAt: "2026-07-01T00:00:00Z",
    recommendedActions: ["Monitor Only"],
    status: "Monitoring",
    supportingTeam: "Brand",
    piracyIntelligence: {
      assetType: "Lectures",
      originalAsset: "PW lecture catalogue",
      detectionMethods: ["Explicit piracy-intent language", "Brand match"],
      copiesDetected: 0,
      chain: [
        {
          id: "real-011-social",
          label: "Demand signal on Reddit",
          type: "Social",
          evidenceId: "ev-PW-REAL-011",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-012",
    title: "PW Thor discussion raises credential and API-abuse risk",
    description:
      "A public Reddit discussion describes PW Thor as a pirated PW application, discusses free batch access and reports that it requests a mobile OTP. This needs security analysis before any user-harm conclusion.",
    category: "Credential Sharing",
    sourceType: "Social Listening",
    sourceUrl:
      "https://www.reddit.com/r/PhysicsWallah/comments/1rjzoyv/what_is_pw_thor_app/",
    domain: "reddit.com",
    platform: "Reddit",
    affectedEntity: "PW account authentication and batch-access APIs",
    severity: "Critical",
    confidence: 90,
    estimatedReach: 8,
    verificationState: "Detected",
    dataOrigin: "Public Reddit discussion",
    sourceExcerpt:
      "Participants describe PW Thor as a pirated PW app and discuss OTP login and access to unreleased or paid batches.",
    sourcePublishedAt: "2026-03-03T00:00:00Z",
    trafficSignals:
      "Thread displayed 8 votes at discovery time; broader usage is unknown",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Monitor Only",
    ],
    status: "New",
    supportingTeam: "Information Security",
    piracyIntelligence: {
      assetType: "Credentials",
      originalAsset: "PW login and batch-entitlement APIs",
      detectionMethods: [
        "OTP/login mention",
        "API-use claim",
        "Free-batch discussion",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-012-original",
          label: "PW account and entitlements",
          type: "Original",
          evidenceId: "ev-PW-REAL-012",
        },
        {
          id: "real-012-social",
          label: "PW Thor discussion",
          type: "Social",
          evidenceId: "ev-PW-REAL-012",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-013",
    title: "Reported PW recruitment impersonation domain",
    description:
      "Two public Reddit alerts and a PW-associated LinkedIn warning reported pwhiring.com as an unofficial recruitment operation that requested personal information and a fee. The domain currently serves a generic page, so active impersonation is not asserted.",
    category: "Fake PW Domain",
    sourceType: "Domain Scan",
    sourceUrl:
      "https://www.reddit.com/r/JEENEETards/comments/1ue9mmi/scam_alert_physics_wallah_impersonator/",
    domain: "pwhiring.com",
    platform: "Website / Reddit evidence",
    affectedEntity: "Physics Wallah recruitment identity and job applicants",
    severity: "High",
    confidence: 93,
    estimatedReach: 17,
    verificationState: "Unavailable",
    dataOrigin: "Public scam alerts plus current domain verification",
    sourceExcerpt:
      "The public alert reports a fake PW recruitment flow and a ₹2,000 fee; the domain now displays a generic site.",
    sourcePublishedAt: "2026-06-24T00:00:00Z",
    resolvedIp: "82.112.232.223",
    relatedDomains: ["pwhiring.com"],
    relatedSocialPosts: [
      "https://www.reddit.com/r/IsThisAScamIndia/comments/1ue9ufe/scam_alert_physics_wallah_impersonator_pwhiringcom/",
    ],
    trafficSignals:
      "Primary Reddit alert displayed 17 votes; actual applicant exposure is unknown",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Monitor Only",
    ],
    status: "Monitoring",
    supportingTeam: "Information Security",
    domainIntelligence: {
      similarity: 88,
      threatTypes: [
        "Recruitment impersonation",
        "Reported fee request",
        "Personal-data collection allegation",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: false,
      paymentDetected: false,
      riskScore: 84,
    },
  }),
  realCase({
    id: "PW-REAL-014",
    title: "Current Reddit thread asks for pirated PW course videos",
    description:
      "A recent thread in the PhysicsWallah community asks for a pirated one-shot course and Telegram-channel access. It is a current demand signal, not a hosted-copy finding.",
    category: "Pirated Lecture",
    sourceType: "Social Listening",
    sourceUrl:
      "https://www.reddit.com/r/PhysicsWallah/comments/1vctq2j/pirated_videos_in_the_ds_branch/",
    domain: "reddit.com",
    platform: "Reddit",
    affectedEntity: "PW Skills DS/Gateway course videos",
    severity: "Medium",
    confidence: 92,
    estimatedReach: 0,
    verificationState: "Detected",
    dataOrigin: "Public Reddit thread",
    sourceExcerpt:
      "The author asks for a pirated PW Skills one-shot course or a Telegram channel carrying it.",
    sourcePublishedAt: "2026-08-03T00:00:00Z",
    recommendedActions: ["Monitor Only"],
    status: "Monitoring",
    supportingTeam: "Brand",
    piracyIntelligence: {
      assetType: "Lectures",
      originalAsset: "PW Skills DS/Gateway course",
      detectionMethods: [
        "Explicit piracy-intent language",
        "Course-name match",
      ],
      copiesDetected: 0,
      chain: [
        {
          id: "real-014-social",
          label: "Demand signal on Reddit",
          type: "Social",
          evidenceId: "ev-PW-REAL-014",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-015",
    title: "Lakshya JEE channel advertises complete PW batch content",
    description:
      "A publicly indexed Telegram analytics page advertises a complete Physics Wallah Lakshya JEE 1.0 2027 collection, including lectures, notes, DPPs and test papers. The underlying files and ownership have not been verified by OVAL.",
    category: "Pirated Lecture",
    sourceType: "Search Monitoring",
    sourceUrl: "https://telemetr.me/content/lakshya_jee_2027_batch_lecture",
    domain: "telemetr.me",
    platform: "Telegram index",
    affectedEntity: "PW Lakshya JEE 1.0 2027 batch",
    severity: "High",
    confidence: 96,
    estimatedReach: 7846,
    verificationState: "Suspected",
    dataOrigin:
      "Live public-web search · indexed during current Shield refresh",
    sourceExcerpt:
      "The indexed channel description says it provides complete Class 12 Lakshya JEE 1.0 2027 content, including PW lectures, notes, DPPs and test papers.",
    sourcePublishedAt: "2026-07-28T07:03:00Z",
    trafficSignals:
      "The public index displayed 7,846 subscribers and 842 aggregate post views; figures are provider-displayed and not independently audited.",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
      "Monitor Only",
    ],
    status: "New",
    supportingTeam: "Legal",
    piracyIntelligence: {
      assetType: "Lectures",
      originalAsset: "PW Lakshya JEE 1.0 2027 paid batch",
      detectionMethods: [
        "Exact batch-name match",
        "Complete-content claim",
        "Lecture, DPP and test-paper references",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-015-social",
          label: "Indexed Telegram distribution channel",
          type: "Social",
          evidenceId: "ev-PW-REAL-015",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-016",
    title: "Telegram channel offers Physics Wallah lectures for free",
    description:
      "A public Telegram preview describes itself as providing free lectures from the Physics Wallah app. The preview is a distribution lead; OVAL has not downloaded or compared any lecture file.",
    category: "Pirated Lecture",
    sourceType: "Social Listening",
    sourceUrl: "https://www.t.me/s/physicswallahfreekhazana?before=2",
    domain: "t.me",
    platform: "Telegram",
    affectedEntity: "Physics Wallah app lecture catalogue",
    severity: "High",
    confidence: 94,
    estimatedReach: 7,
    verificationState: "Suspected",
    dataOrigin: "Live public-web search · public Telegram preview",
    sourceExcerpt:
      "The public channel preview states that it provides free lectures from the Physics Wallah app.",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
    ],
    status: "New",
    supportingTeam: "Legal",
  }),
  realCase({
    id: "PW-REAL-017",
    title: "Lakshya batch channel distributes lecture notes and DPPs",
    description:
      "A publicly reachable Telegram preview promotes Physics Wallah Lakshya batch lectures, notes and DPPs to thousands of subscribers. Rights-holder comparison is still required before enforcement.",
    category: "Pirated PDF or Module",
    sourceType: "Social Listening",
    sourceUrl: "https://t.me/physicswallah_lakshya_batch",
    domain: "t.me",
    platform: "Telegram",
    affectedEntity: "PW Lakshya batch notes, DPPs and lectures",
    severity: "High",
    confidence: 95,
    estimatedReach: 7797,
    verificationState: "Suspected",
    dataOrigin: "Live public-web search · public Telegram preview",
    sourceExcerpt:
      "The preview identifies Physicswallah Lakshya Batch Lecture Notes and DPPs and displayed 7,797 subscribers at discovery time.",
    trafficSignals:
      "Provider-displayed subscriber count: 7,797; actual content access and unique reach remain unverified.",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Social Platform",
    ],
    status: "New",
    supportingTeam: "Legal",
  }),
  realCase({
    id: "PW-REAL-018",
    title: "Active PW GATE batch subscription offered for resale",
    description:
      "A recent public post offers an active Shreshth GATE 2027 Physics Wallah batch subscription for ₹7,999 against a stated original price of ₹13,999. This is an account-entitlement resale signal, not proof of payment fraud.",
    category: "Batch Resale",
    sourceType: "Social Listening",
    sourceUrl:
      "https://www.reddit.com/r/PhysicsWallah/comments/1u6b8c1/selling_my_physics_wallah_pw_batch_subscription/",
    domain: "reddit.com",
    platform: "Reddit",
    affectedEntity: "PW Shreshth GATE 2027 batch entitlement",
    severity: "Medium",
    confidence: 98,
    estimatedReach: 0,
    verificationState: "Detected",
    dataOrigin: "Live public-web search · public Reddit listing",
    sourceExcerpt:
      "The seller names the Shreshth Batch 2027, states an original price of ₹13,999 and asks ₹7,999 for the remaining access.",
    sourcePublishedAt: "2026-06-15T00:00:00Z",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Monitor Only",
    ],
    status: "Investigating",
    supportingTeam: "Information Security",
  }),
  realCase({
    id: "PW-REAL-019",
    title: "PW content-creation batch advertised at 50% resale discount",
    description:
      "A current public listing offers a Physics Wallah content-creation batch at half the original price and asks buyers to contact the seller directly. The post is evidence of attempted subscription resale; legitimacy and transferability remain unverified.",
    category: "Batch Resale",
    sourceType: "Social Listening",
    sourceUrl:
      "https://www.reddit.com/r/PhysicsWallah/comments/1vka4cy/anyone_interested_in_buying_a_pw_content_creation/",
    domain: "reddit.com",
    platform: "Reddit",
    affectedEntity: "PW content-creation course entitlement",
    severity: "Medium",
    confidence: 97,
    estimatedReach: 0,
    verificationState: "Detected",
    dataOrigin: "Live public-web search · public Reddit listing",
    sourceExcerpt:
      "The listing offers the batch at 50% of the original price and describes recorded classes, live doubt support and course validity through May 2028.",
    sourcePublishedAt: "2026-08-10T00:00:00Z",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Monitor Only",
    ],
    status: "New",
    supportingTeam: "Information Security",
  }),
  realCase({
    id: "PW-REAL-020",
    title: "PW Thor site advertises premium batches and an Android APK",
    description:
      "The public PW Thor landing page uses PW naming, advertises access to premium educational batches and study material, and links to an Android APK. OVAL has not logged in, downloaded the APK or verified ownership of any hosted course.",
    category: "Fake PW Domain",
    sourceType: "Domain Scan",
    sourceUrl: "https://pwthor.live/",
    domain: "pwthor.live",
    platform: "Website / APK distribution",
    affectedEntity: "Physics Wallah brand, paid batches and learner credentials",
    severity: "Critical",
    confidence: 96,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Live public-web scan · landing page reachable",
    sourceExcerpt:
      "The page advertises premium educational content, batches and study materials and offers a PWThor Android APK.",
    relatedDomains: ["pwthor.site"],
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Report to Domain Registrar",
      "Report to Actual Hosting Provider",
      "Request Search De-indexing",
    ],
    status: "New",
    supportingTeam: "Information Security",
    domainIntelligence: {
      similarity: 98,
      threatTypes: [
        "PW brand-name match",
        "Suspected paid-batch access",
        "Unofficial APK distribution",
        "Credential-risk review",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: false,
      paymentDetected: false,
      riskScore: 94,
    },
    piracyIntelligence: {
      assetType: "Batch Access",
      originalAsset: "PW premium batches and study materials",
      detectionMethods: [
        "Exact PW-name match",
        "Premium-content claim",
        "Public APK link",
        "Manual public-page review",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-020-original",
          label: "Official PW course catalogue",
          type: "Original",
          evidenceId: "ev-PW-REAL-020",
        },
        {
          id: "real-020-copy",
          label: "pwthor.live",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-020",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-021",
    title: "Related PW Thor domain advertises PW access without purchase",
    description:
      "A related public PW Thor domain is indexed with PW branding, a login route, study access and an external application download. Its public wording promotes PW access without purchase. Current content and ownership require human verification.",
    category: "Fake PW Domain",
    sourceType: "Domain Scan",
    sourceUrl: "https://pwthor.site/",
    domain: "pwthor.site",
    platform: "Website / APK distribution",
    affectedEntity: "Physics Wallah brand, course access and learner credentials",
    severity: "Critical",
    confidence: 93,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Public-web index and page metadata",
    sourceExcerpt:
      "The indexed page uses PW branding, promotes access without purchase and links to login, study and app-download routes.",
    relatedDomains: ["pwthor.live"],
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Report to Domain Registrar",
      "Report to Actual Hosting Provider",
    ],
    status: "New",
    supportingTeam: "Information Security",
    domainIntelligence: {
      similarity: 98,
      threatTypes: [
        "PW brand-name match",
        "Access-without-purchase claim",
        "Login or credential exposure",
        "Unofficial app distribution",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: true,
      paymentDetected: false,
      riskScore: 92,
    },
    piracyIntelligence: {
      assetType: "Credentials",
      originalAsset: "PW login and course-entitlement services",
      detectionMethods: [
        "Exact PW-name match",
        "Access-without-purchase claim",
        "Public login route",
        "External app-download link",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-021-original",
          label: "Official PW access services",
          type: "Original",
          evidenceId: "ev-PW-REAL-021",
        },
        {
          id: "real-021-copy",
          label: "pwthor.site",
          type: "Mirror",
          evidenceId: "ev-PW-REAL-021",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-022",
    title: "RareStudy advertises free unlocked PW premium batches",
    description:
      "The public RareStudy page names Physics Wallah and advertises instant, subscription-free access to premium batches. OVAL has not opened protected lessons or determined ownership of individual course copies.",
    category: "Pirated Lecture",
    sourceType: "Domain Scan",
    sourceUrl: "https://rarestudy.in/",
    domain: "rarestudy.in",
    platform: "Course-streaming website",
    affectedEntity: "PW premium batches, lectures and study materials",
    severity: "High",
    confidence: 96,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Live public-web scan · landing page reachable",
    sourceExcerpt:
      "The page names Physics Wallah among its platforms and advertises premium courses as unlocked with no subscription.",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Domain Registrar",
      "Report to Actual Hosting Provider",
      "Request Search De-indexing",
    ],
    status: "New",
    supportingTeam: "Legal",
    domainIntelligence: {
      similarity: 76,
      threatTypes: [
        "Suspected premium-course distribution",
        "PW catalogue reference",
        "No-subscription claim",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: false,
      paymentDetected: false,
      riskScore: 89,
    },
    piracyIntelligence: {
      assetType: "Batch Access",
      originalAsset: "PW premium course catalogue",
      detectionMethods: [
        "Physics Wallah platform match",
        "Premium-unlocked claim",
        "No-subscription claim",
        "Manual public-page review",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-022-original",
          label: "Official PW premium batches",
          type: "Original",
          evidenceId: "ev-PW-REAL-022",
        },
        {
          id: "real-022-copy",
          label: "rarestudy.in",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-022",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-023",
    title: "Study Buddy page exposes a free Physics Wallah batch zone",
    description:
      "The public Study Buddy landing page includes a Physics Wallah zone offering all batches and Khazana access. The page is hosted on Netlify; OVAL has not accessed protected lessons or verified the provenance of course files.",
    category: "Pirated Lecture",
    sourceType: "Domain Scan",
    sourceUrl: "https://study-buddy-official.netlify.app/",
    domain: "study-buddy-official.netlify.app",
    platform: "Course-access website",
    affectedEntity: "PW batches and Khazana catalogue",
    severity: "High",
    confidence: 94,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Live public-web scan · landing page reachable",
    sourceExcerpt:
      "The page identifies a Physics Wallah zone and presents links for all batches and Khazana on a site described as completely free.",
    recommendedActions: [
      "Send for PW Legal Review",
      "Report to Actual Hosting Provider",
      "Request Search De-indexing",
    ],
    status: "New",
    supportingTeam: "Legal",
    domainIntelligence: {
      similarity: 72,
      threatTypes: [
        "Suspected batch distribution",
        "PW catalogue reference",
        "Khazana access claim",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: false,
      paymentDetected: false,
      riskScore: 86,
    },
    piracyIntelligence: {
      assetType: "Batch Access",
      originalAsset: "PW batches and Khazana catalogue",
      detectionMethods: [
        "Physics Wallah zone match",
        "All-batches claim",
        "Khazana reference",
        "Manual public-page review",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-023-original",
          label: "Official PW batches and Khazana",
          type: "Original",
          evidenceId: "ev-PW-REAL-023",
        },
        {
          id: "real-023-copy",
          label: "Study Buddy listing",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-023",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-024",
    title: "APKRabi page advertises a PW MOD APK with all batches unlocked",
    description:
      "The public APKRabi page names Physics Wallah, advertises a modified Android package with all batches unlocked, free subscription and live-class access, and exposes a download action. OVAL has not downloaded or executed the binary.",
    category: "Fake Application",
    sourceType: "App Monitoring",
    sourceUrl: "https://pw-apk.apkrabi.com/",
    domain: "pw-apk.apkrabi.com",
    platform: "APK website",
    affectedEntity: "PW Android application, premium batches and live classes",
    severity: "Critical",
    confidence: 98,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Live public-web scan · detailed listing reachable",
    sourceExcerpt:
      "The listing describes a PW MOD APK with all batches unlocked, free subscription, live classes and password-free access.",
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Report to Actual Hosting Provider",
      "Request Search De-indexing",
    ],
    status: "New",
    supportingTeam: "Information Security",
    domainIntelligence: {
      similarity: 92,
      threatTypes: [
        "PW brand-name match",
        "Modified APK distribution",
        "All-batches-unlocked claim",
        "Password-free access claim",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: false,
      paymentDetected: false,
      riskScore: 96,
    },
    piracyIntelligence: {
      assetType: "Modified Applications",
      originalAsset: "Official PW Android application and paid batches",
      detectionMethods: [
        "Exact PW app match",
        "MOD APK terminology",
        "Unlocked premium claim",
        "Public download action",
      ],
      copiesDetected: 1,
      chain: [
        {
          id: "real-024-original",
          label: "Official PW Android application",
          type: "Original",
          evidenceId: "ev-PW-REAL-024",
        },
        {
          id: "real-024-copy",
          label: "APKRabi PW MOD listing",
          type: "First Leak",
          evidenceId: "ev-PW-REAL-024",
        },
      ],
    },
  }),
  realCase({
    id: "PW-REAL-025",
    title: "StudyRays publicly identifies itself as a PW clone and streaming platform",
    description:
      "The live StudyRays landing page describes itself as a PW clone/CDN streaming platform and exposes three server routes. The sparse landing page does not itself prove which protected courses are available, so content ownership requires human verification.",
    category: "Fake PW Domain",
    sourceType: "Domain Scan",
    sourceUrl: "https://studyrays.cc/",
    domain: "studyrays.cc",
    platform: "Streaming website",
    affectedEntity: "PW platform identity and possible course streams",
    severity: "High",
    confidence: 84,
    estimatedReach: 0,
    verificationState: "Suspected",
    dataOrigin: "Live public-web scan · sparse landing page reachable",
    sourceExcerpt:
      "The page metadata identifies StudyRays as a PW clone and CDN streaming platform and offers three server links.",
    relatedDomains: ["pwthor.live", "pwthor.site"],
    recommendedActions: [
      "Escalate to PW Security",
      "Send for PW Legal Review",
      "Monitor Only",
    ],
    status: "New",
    supportingTeam: "Information Security",
    domainIntelligence: {
      similarity: 68,
      threatTypes: [
        "Self-described PW clone",
        "Streaming/CDN infrastructure",
        "Multi-server routing",
        "Course ownership unverified",
      ],
      registrationAgeDays: 0,
      copiedAssets: 0,
      loginDetected: false,
      paymentDetected: false,
      riskScore: 81,
    },
    piracyIntelligence: {
      assetType: "Batch Access",
      originalAsset: "PW platform and course-stream catalogue",
      detectionMethods: [
        "PW-clone metadata",
        "Streaming-platform metadata",
        "Public multi-server links",
        "Manual public-page review",
      ],
      copiesDetected: 0,
      chain: [
        {
          id: "real-025-suspected",
          label: "StudyRays streaming entry point",
          type: "Mirror",
          evidenceId: "ev-PW-REAL-025",
        },
      ],
    },
  }),
];
