export type ShieldSeverity = "Low" | "Medium" | "High" | "Critical";
export type ShieldCaseStatus =
  | "New"
  | "Investigating"
  | "Verified"
  | "Awaiting Legal Review"
  | "Action Approved"
  | "Complaint Prepared"
  | "Submitted"
  | "Removed"
  | "Rejected"
  | "Monitoring"
  | "Reappeared"
  | "False Positive";
export type ShieldCategory =
  | "Pirated Lecture"
  | "Pirated PDF or Module"
  | "Batch Resale"
  | "Credential Sharing"
  | "Fake PW Domain"
  | "Lookalike Login"
  | "Phishing"
  | "Trademark Misuse"
  | "Fake Application"
  | "Teacher Impersonation"
  | "False Factual Claim"
  | "Coordinated Narrative"
  | "Genuine Critical Feedback";
export type ShieldTeam =
  | "Brand"
  | "Legal"
  | "Information Security"
  | "Product"
  | "Customer Support"
  | "Academic"
  | "Teacher Operations"
  | "Communications";
export type ShieldEvidenceReadiness =
  | "Capturing"
  | "Partial"
  | "Ready"
  | "Immutable"
  | "Failed";
export type ShieldLegalReview =
  | "Not Required"
  | "Not Requested"
  | "Pending"
  | "Approved"
  | "Changes Requested";
export type ShieldAction =
  | "Report to Cloudflare"
  | "Report to Actual Hosting Provider"
  | "Report to Domain Registrar"
  | "Prepare Copyright Notice"
  | "Prepare Trademark Complaint"
  | "Report Phishing or Malware"
  | "Request Search De-indexing"
  | "Report to Social Platform"
  | "Escalate to PW Security"
  | "Send for PW Legal Review"
  | "Request Correction or Retraction"
  | "Prepare Public Response"
  | "Route to Product or Support"
  | "Monitor Only";
export type ShieldSourceType =
  | "Domain Scan"
  | "Search Monitoring"
  | "Social Listening"
  | "App Monitoring"
  | "Manual Review"
  | "Support Signal";
export type ShieldVerificationState =
  | "Detected"
  | "Suspected"
  | "Verified"
  | "Unavailable";

export type ShieldEvidence = {
  id: string;
  version: number;
  exactUrl: string;
  pageTitle: string;
  captureTimestamp: string;
  screenshotLabel: string;
  screenRecordingRef?: string;
  dnsData: string;
  registrar: string;
  hostingData: string;
  resolvedIp: string;
  certificateInfo: string;
  originalAsset: string;
  suspectedAsset: string;
  similarityScore: number;
  contentHash: string;
  detectionSource: string;
  reachEvidence: string;
  immutable: boolean;
  captureStatus: "Captured" | "Failed";
};

export type ShieldWebIntelligence = {
  capturedAt?: string;
  httpStatus?: number;
  redirectChain: string[];
  responseHeaders: { name: string; value: string }[];
  dnsRecords: { type: string; values: string[] }[];
  rdap: {
    registrar?: string;
    registeredAt?: string;
    expiresAt?: string;
    abuseContact?: string;
  };
  whois?: {
    available: boolean;
    registrar?: string;
    registrarWhoisServer?: string;
    registrarUrl?: string;
    registrarIanaId?: string;
    abuseEmail?: string;
    abusePhone?: string;
    createdAt?: string;
    expiresAt?: string;
    updatedAt?: string;
    registrantOrganisation?: string;
    registrantCountry?: string;
    responseSha256?: string;
  };
  tls: {
    protocol?: string;
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
  };
  seo: {
    title?: string;
    description?: string;
    canonical?: string;
    robots?: string;
    language?: string;
    h1: string[];
    h2: string[];
    schemaTypes: string[];
    internalLinkCount?: number;
    externalLinkCount?: number;
    imageCount?: number;
    openGraph: Record<string, string>;
    twitter: Record<string, string>;
  };
  links: {
    external: string[];
    downloads: string[];
    social: string[];
    networkDestinations: string[];
  };
};

export type ShieldAuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export type ShieldSubmission = {
  id: string;
  destination: string;
  submittedAt: string;
  status:
    | "Draft"
    | "Awaiting Approval"
    | "Submitted"
    | "Acknowledged"
    | "Rejected"
    | "Removed";
  providerResponse?: string;
};

export type ShieldThreatCase = {
  id: string;
  title: string;
  description: string;
  category: ShieldCategory;
  sourceType: ShieldSourceType;
  sourceUrl: string;
  sourcePublishedAt?: string;
  verifiedAt: string;
  verificationState: ShieldVerificationState;
  dataOrigin: string;
  sourceExcerpt: string;
  domain: string;
  platform: string;
  affectedEntity: string;
  severity: ShieldSeverity;
  confidence: number;
  estimatedReach: number;
  detectedAfterMinutes: number;
  actionAfterMinutes: number;
  firstDetectedAt: string;
  lastSeenAt: string;
  registrar: string;
  hostingProvider: string;
  networkOperator?: string;
  cdnProvider?: string;
  infrastructureSource?: string;
  networkAbuseContact?: string;
  nameservers: string[];
  resolvedIp: string;
  cloudflareRelationship:
    | "None detected"
    | "Registrar only"
    | "Reverse proxy only"
    | "Cloudflare-hosted service"
    | "Unconfirmed";
  relatedDomains: string[];
  relatedSocialPosts: string[];
  affectedAsset: string;
  classificationReasoning: string;
  severityExplanation: string;
  trafficSignals: string;
  gati?: {
    brandRelevance: number;
    threatEvidence: number;
    verdict: string;
    threatType: string;
    explanation: string;
    positiveSignals: string[];
    negativeSignals: string[];
    analysisVersion: string;
    artifacts: {
      type: string;
      riskScore: number;
      packageName?: string;
      applicationLabel?: string;
      sha256?: string;
      findings: Record<string, unknown>;
    }[];
  };
  evidence: ShieldEvidence[];
  evidenceReadiness: ShieldEvidenceReadiness;
  recommendedActions: ShieldAction[];
  owner: string;
  supportingTeam: ShieldTeam;
  sla: string;
  dueAt: string;
  nextAction: string;
  status: ShieldCaseStatus;
  legalReviewStatus: ShieldLegalReview;
  enforcementDestination: string;
  submissionHistory: ShieldSubmission[];
  relatedCaseIds: string[];
  reappearanceCount: number;
  auditTrail: ShieldAuditEvent[];
  webIntelligence?: ShieldWebIntelligence;
  domainIntelligence?: {
    similarity: number;
    threatTypes: string[];
    registrationAgeDays: number;
    copiedAssets: number;
    loginDetected: boolean;
    paymentDetected: boolean;
    riskScore: number;
  };
  piracyIntelligence?: {
    assetType:
      | "Lectures"
      | "PDFs and Modules"
      | "Test Series"
      | "Batch Access"
      | "Credentials"
      | "Modified Applications";
    originalAsset: string;
    detectionMethods: string[];
    copiesDetected: number;
    chain: {
      id: string;
      label: string;
      type: "Original" | "First Leak" | "Mirror" | "Social" | "Reappearance";
      evidenceId: string;
    }[];
  };
  reputationIntelligence?: {
    classification:
      | "Genuine Student Feedback"
      | "Critical Opinion"
      | "Unverified Allegation"
      | "Demonstrably False Claim"
      | "Possible Defamation — Legal Review"
      | "Coordinated Amplification"
      | "News Coverage"
      | "Parody or Satire";
    mentionVolume: number;
    velocity: number;
    sentiment: "Positive" | "Neutral" | "Negative" | "Mixed";
    credibility: "Low" | "Medium" | "High" | "Unconfirmed";
    influentialSources: string[];
    recommendationReasoning: string;
  };
};

export type ShieldPeriod =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "custom";

export interface ShieldDataAdapter {
  sourceLabel: string;
  mode: "prototype" | "live";
  loadCases(): Promise<ShieldThreatCase[]>;
}
