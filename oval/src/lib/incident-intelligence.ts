import freshdeskInsights from "@/data/freshdesk-insights.json";
import playstoreInsights from "@/data/playstore-insights.json";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "detected" | "needs_validation" | "confirmed" | "assigned" | "in_progress" | "resolved" | "monitoring" | "closed";
export type IncidentTrend = "accelerating" | "rising" | "stable" | "recovering";
export type IncidentSentiment = "negative" | "mixed" | "positive" | "neutral";
export type VerificationState = "ai_generated" | "human_verified" | "needs_review";

export type EvidenceItem = {
  id: string;
  channel: "Play Store" | "Freshdesk" | "Google" | "Reddit" | "Instagram" | "YouTube";
  text: string;
  sourceLabel: string;
  timestamp: string;
  sentiment: IncidentSentiment;
  severity: IncidentSeverity;
  confidence: number;
  whyIncluded: string;
  metadata: Record<string, string | number | boolean>;
};

export type IncidentAction = {
  id: string;
  title: string;
  owner: string;
  due: string;
  status: "open" | "in_progress" | "done";
};

export type TimelineEvent = {
  at: string;
  title: string;
  detail: string;
  type: "signal" | "alert" | "assignment" | "action" | "resolution";
};

export type Incident = {
  id: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  trend: IncidentTrend;
  sentiment: IncidentSentiment;
  sources: string[];
  affectedEntity: string;
  owner: string;
  team: string;
  mentions: number;
  uniqueUsers: number;
  firstSeen: string;
  lastActivity: string;
  due: string;
  confidence: number;
  verification: VerificationState;
  priorityReason: string;
  recommendedAction: string;
  impact: {
    negativeShare: number;
    supportTickets: number;
    ratingImpact?: string;
    reach?: number;
    affectedVersions?: string[];
    devices?: string[];
    operationalImpact: string;
  };
  channelContributions: { channel: string; role: string; volume: number; signal: string }[];
  evidence: EvidenceItem[];
  actions: IncidentAction[];
  timeline: TimelineEvent[];
  modelDetails: {
    dataCompleteness: string;
    sourcesUsed: string[];
    limitations: string[];
    adapterBoundary: string;
  };
};

export type IncidentDashboard = {
  live: true;
  generatedAt: string;
  freshness: { label: string; status: "fresh" | "partial" | "stale"; detail: string };
  metrics: {
    healthScore: number;
    healthDriver: string;
    activeIncidents: number;
    criticalHigh: number;
    negativeChange: number;
    openActions: number;
    positiveAdvocacy: number;
    connectedChannels: number;
  };
  dailyBrief: {
    generatedAt: string;
    confidence: number;
    findings: { title: string; detail: string; incidentId?: string; evidenceCount: number }[];
  };
  emergingTrends: {
    theme: string;
    growth: number;
    volume: number;
    sentiment: IncidentSentiment;
    sources: string[];
    firstSeen: string;
    label: "New" | "Accelerating" | "Monitoring";
  }[];
  channelHealth: {
    channel: string;
    volume: number;
    sentiment: { positive: number; neutral: number; negative: number };
    topIssue: string;
    trend: string;
    freshness: string;
    status: "connected" | "partial";
    note: string;
  }[];
  positiveSignals: { title: string; detail: string; source: string; trend: string }[];
  ownership: { team: string; open: number; overdue: number; monitoring: number }[];
  incidents: Incident[];
};

type PlayReview = {
  rating?: number;
  text?: string;
  version?: string;
  date?: string;
  replied?: boolean;
  theme?: string;
};

type FreshdeskExample = {
  ticketId?: string;
  status?: string;
  group?: string;
  issueL1?: string;
  issueL2?: string;
  category?: string;
  subject?: string;
  description?: string;
};

const generatedAt = new Date().toISOString();
const play = playstoreInsights as any;
const freshdesk = freshdeskInsights as any;
const primaryPlay = play.apps?.[play.primaryPackage] || {};
const release = primaryPlay.releaseComparison || {};
const freshStats = freshdesk.stats || {};
const freshCategories = (freshdesk.categories || []) as any[];

function compact(value: number | undefined): number {
  return Math.max(0, Math.round(value || 0));
}

function reviewEvidence(idPrefix: string, reviews: PlayReview[], whyIncluded: string, severity: IncidentSeverity): EvidenceItem[] {
  return reviews.slice(0, 6).map((review, index) => ({
    id: `${idPrefix}-play-${index + 1}`,
    channel: "Play Store",
    text: review.text || "Review text unavailable",
    sourceLabel: `App review · ${review.rating || "?"}★ · v${review.version || "Unknown"}`,
    timestamp: review.date || "2026-06-01",
    sentiment: (review.rating || 0) <= 2 ? "negative" : "mixed",
    severity,
    confidence: 0.82,
    whyIncluded,
    metadata: {
      rating: review.rating || 0,
      version: review.version || "Unknown",
      replied: Boolean(review.replied),
      theme: review.theme || "Unlabeled",
    },
  }));
}

function ticketEvidence(idPrefix: string, tickets: FreshdeskExample[], whyIncluded: string, severity: IncidentSeverity): EvidenceItem[] {
  return tickets.slice(0, 6).map((ticket, index) => ({
    id: `${idPrefix}-ticket-${index + 1}`,
    channel: "Freshdesk",
    text: [ticket.subject, ticket.description].filter(Boolean).join(" — ") || "Ticket text unavailable",
    sourceLabel: `Ticket #${ticket.ticketId || "unknown"} · ${ticket.group || "Unassigned"}`,
    timestamp: "2026-06-03",
    sentiment: "negative",
    severity,
    confidence: 0.78,
    whyIncluded,
    metadata: {
      status: ticket.status || "Unknown",
      issueL1: ticket.issueL1 || "Uncategorized",
      issueL2: ticket.issueL2 || "Uncategorized",
      category: ticket.category || "Uncategorized",
    },
  }));
}

function categoryByName(name: string) {
  return freshCategories.find((category) => category.name === name) || { count: 0, share: 0, examples: [] };
}

const storeCategory = categoryByName("Store & Logistics");
const appCategory = categoryByName("App & Video Technical");
const accessCategory = categoryByName("Access & Entitlement");
const batchCategory = categoryByName("Batch Operations");
const paymentCategory = categoryByName("Payment & Refund");
const teachingTheme = (primaryPlay.themes || []).find((theme: any) => theme.name === "Teaching & Content") || primaryPlay.themes?.[0] || {};
const accessTheme = (primaryPlay.themes || []).find((theme: any) => theme.name === "Batch & Course Access") || {};
const criticalReviews = (primaryPlay.criticalReviews || []) as PlayReview[];

const incidents: Incident[] = [
  {
    id: "inc-play-release-regression",
    title: `App release ${release.current?.version || "current"} shows a low-rating regression`,
    summary: `The current Play Store build is down ${Math.abs(release.ratingDelta || 0).toFixed(2)} stars from the previous build and low-rating share moved ${release.lowRatingRateDelta > 0 ? "+" : ""}${release.lowRatingRateDelta || 0} points. Treat this as a release investigation, not confirmed causality.`,
    severity: "high",
    status: "in_progress",
    trend: "rising",
    sentiment: "negative",
    sources: ["Play Store", "Freshdesk"],
    affectedEntity: `Android app v${release.current?.version || "Unknown"}`,
    owner: "Product Reliability",
    team: "Product Team",
    mentions: compact((release.current?.lowRatingCount || 0) + appCategory.count),
    uniqueUsers: compact((release.current?.reviews || 0) + appCategory.count * 0.72),
    firstSeen: "2026-05-30",
    lastActivity: "2026-06-01",
    due: "Today 6:00 PM",
    confidence: 0.81,
    verification: "needs_review",
    priorityReason: "Regression signature combines app-version rating movement with technical support tickets.",
    recommendedAction: "Compare 15.49.03 against 15.49.02 for playback, login, and quality-control changes; publish a support macro for affected users.",
    impact: {
      negativeShare: release.current?.lowRatingRate || primaryPlay.lowRatingRate || 0,
      supportTickets: appCategory.count,
      ratingImpact: `${release.ratingDelta || 0}★ vs previous build`,
      affectedVersions: [release.current?.version, release.previous?.version].filter(Boolean),
      devices: (primaryPlay.deviceBrands || []).slice(0, 3).map((row: any) => row.brand),
      operationalImpact: "Technical complaints are hitting the same mobile base that drives app usage and paid batch access.",
    },
    channelContributions: [
      { channel: "Play Store", role: "Version and rating evidence", volume: release.current?.reviews || 0, signal: `${release.current?.lowRatingRate || 0}% low ratings on current build` },
      { channel: "Freshdesk", role: "Affected-user support evidence", volume: appCategory.count, signal: "App and video technical tickets at support scale" },
    ],
    evidence: [
      ...reviewEvidence("release", criticalReviews, "Low-rating Play Store review tied to app experience or recent build quality.", "high"),
      ...ticketEvidence("release", appCategory.examples || [], "Freshdesk ticket classified as app/video technical issue.", "high"),
    ],
    actions: [
      { id: "act-release-1", title: "Diff release notes and playback-control commits for 15.49.03", owner: "Android Lead", due: "Today", status: "in_progress" },
      { id: "act-release-2", title: "Create Freshdesk macro for playback/login workaround", owner: "Support Ops", due: "Tomorrow", status: "open" },
      { id: "act-release-3", title: "Monitor low-rating share for next 48 hours", owner: "Product Analytics", due: "Jun 10", status: "open" },
    ],
    timeline: [
      { at: "2026-05-30", title: "Prior build baseline", detail: `v${release.previous?.version || "previous"} held ${release.previous?.averageRating || "n/a"}★ across ${release.previous?.reviews || 0} reviews.`, type: "signal" },
      { at: "2026-06-01", title: "Regression detected", detail: `v${release.current?.version || "current"} moved to ${release.current?.averageRating || "n/a"}★ with ${release.current?.lowRatingRate || 0}% low ratings.`, type: "alert" },
      { at: "2026-06-03", title: "Support correlation added", detail: `${compact(appCategory.count)} technical support tickets available in Freshdesk export.`, type: "action" },
    ],
    modelDetails: {
      dataCompleteness: "Partial: ratings, app versions, device brands, ticket categories, and text evidence exist; app crash telemetry does not.",
      sourcesUsed: ["Play Store reviews", "Freshdesk ticket taxonomy"],
      limitations: ["Correlation is directional", "No app session telemetry", "Freshdesk export has no created/resolved timestamps"],
      adapterBoundary: "Operational owner, due date, and timeline labels are typed mock fields in incident-intelligence.ts.",
    },
  },
  {
    id: "inc-store-logistics",
    title: "Store and logistics tickets dominate support volume",
    summary: `${compact(storeCategory.count)} Freshdesk tickets are classified as Store & Logistics. This is the largest support driver and includes order status, shipment, missing books, and delivery update complaints.`,
    severity: "high",
    status: "assigned",
    trend: "stable",
    sentiment: "negative",
    sources: ["Freshdesk", "Play Store"],
    affectedEntity: "PW Store orders and book delivery",
    owner: "Store Operations",
    team: "Support Operations",
    mentions: compact(storeCategory.count + 320),
    uniqueUsers: compact(storeCategory.count * 0.9),
    firstSeen: "2026-05-25",
    lastActivity: "2026-06-03",
    due: "Tomorrow 2:00 PM",
    confidence: 0.86,
    verification: "ai_generated",
    priorityReason: "The theme is high-volume, operationally actionable, and appears in both support tickets and app reviews.",
    recommendedAction: "Publish proactive order-status messaging and route delayed-shipment tickets to a dedicated backlog until volume drops.",
    impact: {
      negativeShare: storeCategory.share || 0,
      supportTickets: storeCategory.count || 0,
      operationalImpact: "Book delays create exam-prep risk and repeat contacts for students who depend on modules.",
    },
    channelContributions: [
      { channel: "Freshdesk", role: "Primary volume evidence", volume: storeCategory.count || 0, signal: `${storeCategory.share || 0}% of all tickets` },
      { channel: "Play Store", role: "Public escalation evidence", volume: 320, signal: "Book/order complaints inside public reviews" },
    ],
    evidence: ticketEvidence("store", storeCategory.examples || [], "Ticket belongs to the highest-volume logistics theme.", "high"),
    actions: [
      { id: "act-store-1", title: "Create delayed-order cohort and status broadcast", owner: "PW Store Ops", due: "Tomorrow", status: "open" },
      { id: "act-store-2", title: "Add order tracking evidence to weekly support review", owner: "Support Analytics", due: "Jun 11", status: "open" },
    ],
    timeline: [
      { at: "2026-06-03", title: "Freshdesk export processed", detail: `${compact(storeCategory.count)} store/logistics tickets found.`, type: "signal" },
      { at: "2026-06-03", title: "Owner proposed", detail: "Routed to Store Operations due to delivery/order ownership.", type: "assignment" },
    ],
    modelDetails: {
      dataCompleteness: "Partial: ticket text and taxonomy available; shipment system status is missing.",
      sourcesUsed: ["Freshdesk ticket taxonomy", "Play Store written reviews"],
      limitations: ["No ticket age/SLA fields", "No courier/order database attached"],
      adapterBoundary: "Owner, due date, and volume from Play Store public escalation are adapter-level estimates.",
    },
  },
  {
    id: "inc-access-entitlement",
    title: "Batch access and entitlement failures create paid-user risk",
    summary: `${compact(accessCategory.count + accessTheme.mentions)} combined support/review signals mention access, subscriptions, batch visibility, or entitlement gaps after purchase.`,
    severity: "medium",
    status: "needs_validation",
    trend: "rising",
    sentiment: "negative",
    sources: ["Freshdesk", "Play Store"],
    affectedEntity: "Batch access, subscriptions, and purchased content",
    owner: "Batch Operations",
    team: "Batch Operations Team",
    mentions: compact(accessCategory.count + (accessTheme.mentions || 0)),
    uniqueUsers: compact(accessCategory.count * 0.82),
    firstSeen: "2026-05-22",
    lastActivity: "2026-06-03",
    due: "Jun 10",
    confidence: 0.74,
    verification: "needs_review",
    priorityReason: "A paid-user failure can become refund, legal, and reputation risk if unresolved.",
    recommendedAction: "Validate entitlement service logs against tickets where students report paid batch access missing.",
    impact: {
      negativeShare: accessCategory.share || 0,
      supportTickets: accessCategory.count || 0,
      operationalImpact: "Access failures block learning after payment and can trigger refunds or public escalation.",
    },
    channelContributions: [
      { channel: "Freshdesk", role: "Operational support evidence", volume: accessCategory.count || 0, signal: "Access & Entitlement ticket cluster" },
      { channel: "Play Store", role: "Public paid-user experience", volume: accessTheme.mentions || 0, signal: "Batch & Course Access review theme" },
    ],
    evidence: [
      ...ticketEvidence("access", accessCategory.examples || [], "Freshdesk ticket categorized as access or entitlement issue.", "medium"),
      ...reviewEvidence("access", accessTheme.examples || [], "Play Store review mentions batch/course access experience.", "medium"),
    ],
    actions: [
      { id: "act-access-1", title: "Sample 25 paid-user access tickets and verify entitlement state", owner: "Batch Ops", due: "Jun 10", status: "open" },
      { id: "act-access-2", title: "Define auto-escalation when paid access is missing for 24h", owner: "Support Ops", due: "Jun 12", status: "open" },
    ],
    timeline: [
      { at: "2026-05-22", title: "Public reviews mention missing access", detail: "Play Store written reviews include purchased-batch access complaints.", type: "signal" },
      { at: "2026-06-03", title: "Support taxonomy confirms cluster", detail: `${compact(accessCategory.count)} access/entitlement tickets available.`, type: "alert" },
    ],
    modelDetails: {
      dataCompleteness: "Partial: ticket and review evidence available; payment entitlement logs are missing.",
      sourcesUsed: ["Freshdesk", "Play Store"],
      limitations: ["Cannot confirm successful payment without backend subscription fields"],
      adapterBoundary: "Unique-user estimates and SLA are adapter mocks until backend exports provide identities/timestamps.",
    },
  },
  {
    id: "inc-taxonomy-debt",
    title: "Freshdesk taxonomy gaps hide root-cause reporting",
    summary: `${compact(freshStats.uncategorizedTickets)} tickets are missing Issue L1 and Issue L3 is ${freshdesk.taxonomyGaps?.[2]?.blankRate || 0}% blank. This does not mean students have no issue; it means the reporting layer cannot route them reliably.`,
    severity: "medium",
    status: "confirmed",
    trend: "stable",
    sentiment: "neutral",
    sources: ["Freshdesk"],
    affectedEntity: "Support taxonomy and routing",
    owner: "Support Analytics",
    team: "Support Operations",
    mentions: compact(freshStats.uncategorizedTickets),
    uniqueUsers: compact(freshStats.uncategorizedTickets * 0.88),
    firstSeen: "2026-06-03",
    lastActivity: "2026-06-03",
    due: "Jun 14",
    confidence: 0.9,
    verification: "human_verified",
    priorityReason: "Bad taxonomy reduces confidence in every downstream support insight.",
    recommendedAction: "Backfill L1/L2 labels for the largest blank groups and add required routing rules for new tickets.",
    impact: {
      negativeShare: 28.5,
      supportTickets: compact(freshStats.uncategorizedTickets),
      operationalImpact: "Repeat issues can masquerade as one-off noise when taxonomy is blank.",
    },
    channelContributions: [
      { channel: "Freshdesk", role: "Data-quality evidence", volume: compact(freshStats.uncategorizedTickets), signal: `${freshStats.taxonomyCompletionL1 || 0}% L1 completion` },
    ],
    evidence: ticketEvidence("taxonomy", freshdesk.activeExamples || [], "Active ticket illustrates how routing gaps affect ownership.", "medium"),
    actions: [
      { id: "act-tax-1", title: "Create taxonomy completion dashboard by group", owner: "Support Analytics", due: "Jun 14", status: "open" },
      { id: "act-tax-2", title: "Make Issue L1 mandatory for closure on top queues", owner: "Freshdesk Admin", due: "Jun 18", status: "open" },
    ],
    timeline: [
      { at: "2026-06-03", title: "Taxonomy scan completed", detail: `${compact(freshStats.uncategorizedTickets)} tickets found without Issue L1.`, type: "signal" },
    ],
    modelDetails: {
      dataCompleteness: "High for taxonomy completeness; low for SLA because timestamps are absent.",
      sourcesUsed: ["Freshdesk CSV export"],
      limitations: ["No agent notes", "No created/resolved timestamps"],
      adapterBoundary: "Human verification state is seeded to demonstrate governance workflow.",
    },
  },
  {
    id: "inc-positive-teaching-advocacy",
    title: "Teaching quality remains the strongest positive advocacy signal",
    summary: `Teaching & Content is the largest Play Store text theme with ${compact(teachingTheme.mentions)} mentions. It contains complaints too, but positive faculty/content appreciation is still the strongest recoverable brand asset.`,
    severity: "low",
    status: "monitoring",
    trend: "recovering",
    sentiment: "positive",
    sources: ["Play Store", "YouTube", "Instagram"],
    affectedEntity: "Faculty and academic content perception",
    owner: "Academic Marketing",
    team: "Marketing Team",
    mentions: compact(teachingTheme.mentions),
    uniqueUsers: compact(teachingTheme.mentions * 0.75),
    firstSeen: "2026-05-01",
    lastActivity: "2026-06-01",
    due: "Jun 17",
    confidence: 0.69,
    verification: "ai_generated",
    priorityReason: "Positive advocacy should be tracked as an asset, not buried under risk-only dashboards.",
    recommendedAction: "Package the strongest faculty/content praise into a campaign while routing embedded complaints to Academic Ops.",
    impact: {
      negativeShare: Math.max(0, 100 - (teachingTheme.replyRate || 0)),
      supportTickets: batchCategory.count || 0,
      operationalImpact: "Academic trust can offset operational frustration when praise is amplified with evidence.",
    },
    channelContributions: [
      { channel: "Play Store", role: "Verbatim advocacy evidence", volume: teachingTheme.mentions || 0, signal: `${teachingTheme.replyRate || 0}% reply coverage in this theme` },
      { channel: "YouTube", role: "Academic/content context", volume: 0, signal: "Backend channel-native faculty fields pending" },
      { channel: "Instagram", role: "Campaign amplification context", volume: 0, signal: "Creator/post linkage pending" },
    ],
    evidence: reviewEvidence("positive", teachingTheme.examples || [], "Review belongs to Teaching & Content theme and can contain praise or mixed feedback.", "low"),
    actions: [
      { id: "act-positive-1", title: "Extract 10 verified faculty/content praise quotes", owner: "Brand Team", due: "Jun 17", status: "open" },
      { id: "act-positive-2", title: "Separate praise from embedded operational complaints", owner: "Analyst", due: "Jun 15", status: "open" },
    ],
    timeline: [
      { at: "2026-06-01", title: "Positive theme isolated", detail: `${compact(teachingTheme.mentions)} Teaching & Content mentions available in Play Store text reviews.`, type: "signal" },
    ],
    modelDetails: {
      dataCompleteness: "Partial: Play Store text themes exist; channel-native faculty/entity extraction is pending.",
      sourcesUsed: ["Play Store reviews"],
      limitations: ["Theme contains both praise and complaints", "No YouTube faculty-level adapter yet"],
      adapterBoundary: "Cross-channel advocacy sources beyond Play Store are placeholders until backend fields are connected.",
    },
  },
];

const openStatuses: IncidentStatus[] = ["detected", "needs_validation", "confirmed", "assigned", "in_progress"];

export function getIncidentDashboard(): IncidentDashboard {
  const activeIncidents = incidents.filter((incident) => openStatuses.includes(incident.status));
  const criticalHigh = activeIncidents.filter((incident) => incident.severity === "critical" || incident.severity === "high").length;
  const openActions = incidents.flatMap((incident) => incident.actions).filter((action) => action.status !== "done").length;

  return {
    live: true,
    generatedAt,
    freshness: {
      label: "Partial live",
      status: "partial",
      detail: "Play Store and Freshdesk files are current snapshots; social channels still depend on existing APIs.",
    },
    metrics: {
      healthScore: 68,
      healthDriver: "Operational trust is pressured by app reliability, logistics, and access issues.",
      activeIncidents: activeIncidents.length,
      criticalHigh,
      negativeChange: release.lowRatingRateDelta || 0,
      openActions,
      positiveAdvocacy: compact(teachingTheme.mentions),
      connectedChannels: 7,
    },
    dailyBrief: {
      generatedAt,
      confidence: 0.78,
      findings: [
        { title: "Investigate the current Android build", detail: incidents[0].priorityReason, incidentId: incidents[0].id, evidenceCount: incidents[0].evidence.length },
        { title: "Treat store/logistics as the largest operational theme", detail: incidents[1].summary, incidentId: incidents[1].id, evidenceCount: incidents[1].evidence.length },
        { title: "Fix taxonomy before over-trusting support cuts", detail: incidents[3].summary, incidentId: incidents[3].id, evidenceCount: incidents[3].evidence.length },
        { title: "Keep positive academic advocacy visible", detail: incidents[4].summary, incidentId: incidents[4].id, evidenceCount: incidents[4].evidence.length },
      ],
    },
    emergingTrends: [
      { theme: "Playback and app technical issues", growth: release.lowRatingRateDelta || 2.6, volume: appCategory.count, sentiment: "negative", sources: ["Play Store", "Freshdesk"], firstSeen: "2026-06-01", label: "Accelerating" },
      { theme: "Book delivery and order tracking", growth: 18, volume: storeCategory.count, sentiment: "negative", sources: ["Freshdesk", "Play Store"], firstSeen: "2026-05-25", label: "Monitoring" },
      { theme: "Paid batch access gaps", growth: 11, volume: accessCategory.count, sentiment: "negative", sources: ["Freshdesk", "Play Store"], firstSeen: "2026-05-22", label: "New" },
      { theme: "Faculty/content appreciation", growth: 7, volume: compact(teachingTheme.mentions), sentiment: "positive", sources: ["Play Store"], firstSeen: "2026-05-01", label: "Monitoring" },
      { theme: "Payment and refund friction", growth: 6, volume: paymentCategory.count, sentiment: "negative", sources: ["Freshdesk"], firstSeen: "2026-06-03", label: "Monitoring" },
    ],
    channelHealth: [
      { channel: "Play Store", volume: primaryPlay.sampleSize || 0, sentiment: { positive: primaryPlay.fiveStarRate || 0, neutral: 100 - (primaryPlay.fiveStarRate || 0) - (primaryPlay.lowRatingRate || 0), negative: primaryPlay.lowRatingRate || 0 }, topIssue: "Release regression and app experience", trend: `${release.lowRatingRateDelta > 0 ? "+" : ""}${release.lowRatingRateDelta || 0}pt low-rating change`, freshness: "Jun 2026 export", status: "connected", note: "Ratings are app-store reviews, not support tickets." },
      { channel: "Freshdesk", volume: freshStats.totalTickets || 0, sentiment: { positive: 0, neutral: freshStats.controlledRate || 0, negative: freshStats.activeRate || 0 }, topIssue: "Store & Logistics", trend: `${freshStats.activeTickets || 0} active tickets`, freshness: "Jun 3 export", status: "partial", note: "No SLA timestamps in export." },
      { channel: "Google", volume: 100, sentiment: { positive: 20, neutral: 55, negative: 25 }, topIssue: "Reputation search risk", trend: "Existing API", freshness: "Live API dependent", status: "partial", note: "Autocomplete and news are reputation surfaces." },
      { channel: "Reddit", volume: 24, sentiment: { positive: 18, neutral: 36, negative: 46 }, topIssue: "Long-form trust debate", trend: "Existing API", freshness: "Live API dependent", status: "partial", note: "Reddit volume is not comparable to app/support volume." },
      { channel: "Instagram", volume: 24, sentiment: { positive: 61, neutral: 24, negative: 15 }, topIssue: "Campaign/community reaction", trend: "Existing API", freshness: "Live API dependent", status: "partial", note: "Engagement weighting matters more than raw count." },
    ],
    positiveSignals: [
      { title: "Teaching & content remains the most reusable advocacy asset", detail: `${compact(teachingTheme.mentions)} Play Store text mentions sit in the Teaching & Content theme.`, source: "Play Store", trend: "Stable positive base" },
      { title: "High support closure rate", detail: `${freshStats.controlledRate || 0}% of Freshdesk tickets are closed or resolved in the export.`, source: "Freshdesk", trend: "Operational strength" },
      { title: "Reply coverage on written reviews is strong", detail: `${primaryPlay.replyRate || 0}% reply rate across Play Store written reviews.`, source: "Play Store", trend: "Maintained coverage" },
    ],
    ownership: [
      { team: "Product Team", open: 1, overdue: 0, monitoring: 0 },
      { team: "Support Operations", open: 2, overdue: 0, monitoring: 0 },
      { team: "Batch Operations Team", open: 1, overdue: 0, monitoring: 0 },
      { team: "Marketing Team", open: 0, overdue: 0, monitoring: 1 },
    ],
    incidents,
  };
}

export function getIncidents(): Incident[] {
  return getIncidentDashboard().incidents;
}

export function getIncidentById(id: string): Incident | undefined {
  return getIncidents().find((incident) => incident.id === id);
}
