"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileCheck2,
  Globe2,
  LockKeyhole,
  Search,
  Shield,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { OvalLoadingSkeleton } from "@/components/ui/page-skeleton";
import { shieldLiveAdapter } from "@/lib/shield-adapter";
import { openPwYtVerse } from "@/lib/youtube-navigation";
import { AuthProfileMenu } from "@/components/auth/auth-profile-menu";
import type {
  ShieldCaseStatus,
  ShieldCategory,
  ShieldEvidence,
  ShieldPeriod,
  ShieldSeverity,
  ShieldTeam,
  ShieldThreatCase,
} from "@/lib/shield-types";

const PERIODS: { id: ShieldPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "month", label: "Month Wise" },
  { id: "custom", label: "Custom Range" },
];
const SEVERITIES: ShieldSeverity[] = ["Low", "Medium", "High", "Critical"];
const STATUSES: ShieldCaseStatus[] = [
  "New",
  "Investigating",
  "Verified",
  "Awaiting Legal Review",
  "Action Approved",
  "Complaint Prepared",
  "Submitted",
  "Removed",
  "Rejected",
  "Monitoring",
  "Reappeared",
  "False Positive",
];
const TEAMS: ShieldTeam[] = [
  "Brand",
  "Legal",
  "Information Security",
  "Product",
  "Customer Support",
  "Academic",
  "Teacher Operations",
  "Communications",
];
const OWNERS = [
  "Unassigned",
  "Riya Mehta",
  "Arjun Rao",
  "Meera Joshi",
  "Kabir Singh",
  "Neha Verma",
];
const DOMAIN_FILTERS = [
  "All",
  "Typosquatting",
  "Logo Copy",
  "Content Mirror",
  "Phishing",
  "Fake Payment",
  "API Proxy",
  "Newly Registered",
  "Reappeared",
];
const RADAR_AXES = [
  {
    key: "Content Piracy",
    categories: [
      "Pirated Lecture",
      "Pirated PDF or Module",
      "Batch Resale",
      "Credential Sharing",
    ],
  },
  {
    key: "Brand Impersonation",
    categories: ["Fake PW Domain", "Trademark Misuse", "Teacher Impersonation"],
  },
  { key: "Phishing", categories: ["Lookalike Login", "Phishing"] },
  { key: "Fake Applications", categories: ["Fake Application"] },
  {
    key: "Credential Resale",
    categories: ["Batch Resale", "Credential Sharing"],
  },
  {
    key: "Reputation Risk",
    categories: [
      "False Factual Claim",
      "Coordinated Narrative",
      "Genuine Critical Feedback",
    ],
  },
] as const;

type FilterState = {
  period: ShieldPeriod;
  threat: string;
  platform: string;
  severity: string;
  status: string;
  owner: string;
  customFrom: string;
  customTo: string;
};
type MetricKey =
  | "active"
  | "critical"
  | "piracy"
  | "domains"
  | "enforcement";

const initialFilters: FilterState = {
  period: "7d",
  threat: "all",
  platform: "all",
  severity: "all",
  status: "all",
  owner: "all",
  customFrom: "2026-08-04",
  customTo: "2026-08-10",
};
const fmt = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
const date = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const severityWeight: Record<ShieldSeverity, number> = {
  Low: 20,
  Medium: 45,
  High: 72,
  Critical: 100,
};
const COMMAND_PAGE_SIZE = 10;
const isResolved = (status: ShieldCaseStatus) =>
  ["Removed", "Rejected", "False Positive"].includes(status);
const isEnforcement = (status: ShieldCaseStatus) =>
  [
    "Awaiting Legal Review",
    "Action Approved",
    "Complaint Prepared",
    "Submitted",
  ].includes(status);
const isPiracy = (category: ShieldCategory) =>
  [
    "Pirated Lecture",
    "Pirated PDF or Module",
    "Batch Resale",
    "Credential Sharing",
    "Fake Application",
  ].includes(category);

function rangeFor(period: ShieldPeriod, reference: Date, filters: FilterState) {
  const end = new Date(reference);
  const start = new Date(reference);
  if (period === "today") start.setHours(0, 0, 0, 0);
  if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  }
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  if (period === "custom")
    return {
      start: new Date(`${filters.customFrom}T00:00:00+05:30`),
      end: new Date(`${filters.customTo}T23:59:59+05:30`),
    };
  return { start, end };
}

function activityAt(item: ShieldThreatCase) {
  return new Date(
    item.status === "Reappeared" ? item.lastSeenAt : item.firstDetectedAt,
  );
}
function caseMatchesMetric(item: ShieldThreatCase, metric: MetricKey | null) {
  if (!metric) return true;
  if (metric === "active") return true;
  if (metric === "critical") return item.severity === "Critical";
  if (metric === "piracy") return isPiracy(item.category);
  if (metric === "domains") return Boolean(item.domainIntelligence);
  return isEnforcement(item.status);
}

function radarRows(items: ShieldThreatCase[], previous: ShieldThreatCase[]) {
  const score = (source: ShieldThreatCase[], categories: readonly string[]) => {
    const matching = source.filter((item) =>
      categories.includes(item.category),
    );
    if (!matching.length) return 0;
    return Math.round(
      matching.reduce(
        (sum, item) =>
          sum + (severityWeight[item.severity] * item.confidence) / 100,
        0,
      ) / Math.max(1, matching.length),
    );
  };
  return RADAR_AXES.map((axis) => ({
    subject: axis.key,
    current: score(items, axis.categories),
    previous: score(previous, axis.categories),
    fullMark: 100,
  }));
}

export function ShieldDashboard() {
  const router = useRouter();
  const commandRef = useRef<HTMLElement>(null);
  const [cases, setCases] = useState<ShieldThreatCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [metricFilter, setMetricFilter] = useState<MetricKey | null>(null);
  const [radarFilter, setRadarFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ShieldThreatCase | null>(null);
  const [complaintCase, setComplaintCase] = useState<ShieldThreatCase | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [operation, setOperation] = useState("");
  const [domainFilter, setDomainFilter] = useState("All");
  const [commandPage, setCommandPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    shieldLiveAdapter
      .loadCases()
      .then(setCases)
      .catch(() =>
        setLoadError(
          "The Physics Wallah Shield data source is unavailable. No enforcement source was contacted.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setComplaintCase(null);
        setSearchOpen(false);
        setSubmitOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const reference = useMemo(
    () =>
      cases.length
        ? new Date(
            Math.max(
              ...cases.map((item) => new Date(item.lastSeenAt).getTime()),
            ),
          )
        : new Date(),
    [cases],
  );
  const range = useMemo(
    () => rangeFor(filters.period, reference, filters),
    [filters, reference],
  );
  const rangeMs = Math.max(
    86400000,
    range.end.getTime() - range.start.getTime(),
  );
  const previousRange = {
    start: new Date(range.start.getTime() - rangeMs),
    end: new Date(range.start.getTime() - 1),
  };
  const platforms = useMemo(
    () => Array.from(new Set(cases.map((item) => item.platform))),
    [cases],
  );
  const categories = useMemo(
    () => Array.from(new Set(cases.map((item) => item.category))),
    [cases],
  );
  const inCurrentPeriod = useMemo(
    () =>
      cases.filter(
        (item) =>
          activityAt(item) >= range.start && activityAt(item) <= range.end,
      ),
    [cases, range],
  );
  const previousCases = useMemo(
    () =>
      cases.filter(
        (item) =>
          activityAt(item) >= previousRange.start &&
          activityAt(item) <= previousRange.end,
      ),
    [cases, previousRange.end, previousRange.start],
  );
  const visibleCases = useMemo(
    () =>
      inCurrentPeriod
        .filter((item) => {
          if (filters.threat !== "all" && item.category !== filters.threat)
            return false;
          if (filters.platform !== "all" && item.platform !== filters.platform)
            return false;
          if (filters.severity !== "all" && item.severity !== filters.severity)
            return false;
          if (filters.status !== "all" && item.status !== filters.status)
            return false;
          if (filters.owner === "my" && item.owner !== "Riya Mehta")
            return false;
          if (filters.owner === "unassigned" && item.owner !== "Unassigned")
            return false;
          if (
            radarFilter &&
            !RADAR_AXES.find(
              (axis) => axis.key === radarFilter,
            )?.categories.includes(item.category as never)
          )
            return false;
          if (!caseMatchesMetric(item, metricFilter)) return false;
          const needle = query.toLowerCase();
          return (
            !needle ||
            `${item.title} ${item.domain} ${item.affectedEntity} ${item.category}`
              .toLowerCase()
              .includes(needle)
          );
        })
        .sort(
          (a, b) =>
            severityWeight[b.severity] - severityWeight[a.severity] ||
            new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
        ),
    [filters, inCurrentPeriod, metricFilter, query, radarFilter],
  );

  const commandPageCount = Math.max(
    1,
    Math.ceil(visibleCases.length / COMMAND_PAGE_SIZE),
  );
  const commandCases = visibleCases.slice(
    (commandPage - 1) * COMMAND_PAGE_SIZE,
    commandPage * COMMAND_PAGE_SIZE,
  );
  useEffect(() => {
    setCommandPage(1);
  }, [filters, metricFilter, query, radarFilter]);
  useEffect(() => {
    if (commandPage > commandPageCount) setCommandPage(commandPageCount);
  }, [commandPage, commandPageCount]);

  const active = visibleCases.filter((item) => !isResolved(item.status)).length;
  const critical = visibleCases.filter(
    (item) => item.severity === "Critical",
  ).length;
  const threatLevel =
    critical >= 4
      ? "Critical"
      : critical >= 1 || active >= 6
        ? "Elevated"
        : "Guarded";
  const lastScan = cases.length
    ? new Date(
        Math.max(...cases.map((item) => new Date(item.lastSeenAt).getTime())),
      ).toISOString()
    : new Date().toISOString();
  const metrics = useMemo(
    () => [
      {
        id: "active" as MetricKey,
        label: "Total Threats",
        value: visibleCases.length,
        previous: previousCases.length,
        note: "All detected threats in the selected intelligence window",
      },
      {
        id: "critical" as MetricKey,
        label: "Critical Threats",
        value: visibleCases.filter((item) => item.severity === "Critical")
          .length,
        previous: previousCases.filter((item) => item.severity === "Critical")
          .length,
        note: "Highest urgency based on harm, reach and recurrence",
      },
      {
        id: "piracy" as MetricKey,
        label: "Pirated Assets Detected",
        value: visibleCases.filter((item) => isPiracy(item.category)).length,
        previous: previousCases.filter((item) => isPiracy(item.category))
          .length,
        note: "Potentially copied lectures, modules or access",
      },
      {
        id: "domains" as MetricKey,
        label: "Suspicious Domains",
        value: visibleCases.filter((item) => item.domainIntelligence).length,
        previous: previousCases.filter((item) => item.domainIntelligence)
          .length,
        note: "Domains with corroborating PW education context",
      },
      {
        id: "enforcement" as MetricKey,
        label: "Enforcement Cases in Progress",
        value: visibleCases.filter((item) => isEnforcement(item.status)).length,
        previous: previousCases.filter((item) => isEnforcement(item.status))
          .length,
        note: "Human-reviewed preparation and submission stages",
      },
    ],
    [previousCases, visibleCases],
  );
  const radarData = useMemo(
    () => radarRows(visibleCases, previousCases),
    [previousCases, visibleCases],
  );
  const operationalMetrics = useMemo(() => {
    const average = (
      items: ShieldThreatCase[],
      field: "detectedAfterMinutes" | "actionAfterMinutes",
    ) =>
      items.length
        ? items.reduce((sum, item) => sum + item[field], 0) / items.length
        : 0;
    const rate = (
      items: ShieldThreatCase[],
      predicate: (item: ShieldThreatCase) => boolean,
    ) =>
      items.length
        ? Math.round((items.filter(predicate).length / items.length) * 100)
        : 0;
    const formatDuration = (minutes: number) =>
      minutes >= 60
        ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`
        : `${Math.round(minutes)}m`;
    const removalRate = (items: ShieldThreatCase[]) => {
      const decided = items.filter((item) =>
        ["Removed", "Rejected"].includes(item.status),
      );
      return decided.length
        ? Math.round(
            (decided.filter((item) => item.status === "Removed").length /
              decided.length) *
              100,
          )
        : 0;
    };
    const currentDetect = average(visibleCases, "detectedAfterMinutes");
    const previousDetect = average(previousCases, "detectedAfterMinutes");
    const currentAction = average(visibleCases, "actionAfterMinutes");
    const previousAction = average(previousCases, "actionAfterMinutes");
    return [
      [
        "Average Time to Detect",
        formatDuration(currentDetect),
        previousDetect
          ? `${currentDetect <= previousDetect ? "↓" : "↑"} ${formatDuration(Math.abs(currentDetect - previousDetect))}`
          : "new baseline",
      ],
      [
        "Average Time to Action",
        formatDuration(currentAction),
        previousAction
          ? `${currentAction <= previousAction ? "↓" : "↑"} ${formatDuration(Math.abs(currentAction - previousAction))}`
          : "new baseline",
      ],
      [
        "Removal Success Rate",
        `${removalRate(visibleCases)}%`,
        `${removalRate(visibleCases) - removalRate(previousCases) >= 0 ? "+" : ""}${removalRate(visibleCases) - removalRate(previousCases)} pts`,
      ],
      [
        "Reappearance Rate",
        `${rate(visibleCases, (item) => item.reappearanceCount > 0)}%`,
        `${visibleCases.filter((item) => item.status === "Reappeared").length} linked cases`,
      ],
      [
        "Estimated Reach Prevented",
        fmt(
          visibleCases
            .filter((item) => item.status === "Removed")
            .reduce((sum, item) => sum + item.estimatedReach, 0),
        ),
        "confirmed removals only",
      ],
      [
        "False Positive Rate",
        `${rate(visibleCases, (item) => item.status === "False Positive")}%`,
        "reviewed cases",
      ],
    ];
  }, [previousCases, visibleCases]);
  function setFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setMetricFilter(null);
    setRadarFilter("");
  }
  function openCommand(metric?: MetricKey) {
    if (metric)
      setMetricFilter((current) => (current === metric ? null : metric));
    window.setTimeout(
      () =>
        commandRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  }
  function updateCase(
    id: string,
    changes: Partial<ShieldThreatCase>,
    action: string,
    detail: string,
  ) {
    setCases((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...changes,
              auditTrail: [
                ...item.auditTrail,
                {
                  id: `audit-${id}-${Date.now()}`,
                  at: new Date().toISOString(),
                  actor: "Authorised OVAL user",
                  action,
                  detail,
                },
              ],
            }
          : item,
      ),
    );
    setSelected((current) =>
      current?.id === id
        ? {
            ...current,
            ...changes,
            auditTrail: [
              ...current.auditTrail,
              {
                id: `audit-${id}-${Date.now()}`,
                at: new Date().toISOString(),
                actor: "Authorised OVAL user",
                action,
                detail,
              },
            ],
          }
        : current,
    );
    toast.success(action);
  }
  function caseAction(item: ShieldThreatCase, action: string) {
    if (action === "Mark as Verified")
      updateCase(
        item.id,
        { status: "Verified" },
        action,
        "Human reviewer confirmed the classification. External action remains unsubmitted.",
      );
    if (action === "Mark as False Positive")
      updateCase(
        item.id,
        { status: "False Positive", nextAction: "No enforcement action" },
        action,
        "Reviewer rejected the detection and retained the audit record.",
      );
    if (action === "Escalate to Security")
      updateCase(
        item.id,
        {
          supportingTeam: "Information Security",
          nextAction: "Security investigation",
        },
        action,
        "Case routed to Information Security.",
      );
    if (action === "Send for Legal Review")
      updateCase(
        item.id,
        { status: "Awaiting Legal Review", legalReviewStatus: "Pending" },
        action,
        "Legal review requested before any complaint or external report.",
      );
    if (action === "Generate Evidence Pack")
      updateCase(
        item.id,
        {},
        action,
        "Versioned evidence pack prepared locally for authorised review.",
      );
    if (action === "Prepare Complaint") setComplaintCase(item);
    if (action === "Continue Monitoring")
      updateCase(
        item.id,
        { status: "Monitoring" },
        action,
        "Fingerprint and infrastructure monitoring remains active.",
      );
  }

  async function runThreatSearch(form: HTMLFormElement) {
    const fields = new FormData(form);
    const source = String(fields.get("source") || "all");
    setOperation("Creating a persisted discovery run…");
    try {
      const created = await fetch("/api/shield/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threatType: fields.get("threatType"),
          dateScope: fields.get("dateScope"),
          maxResults: Number(fields.get("maxResults") || 50),
          sources:
            source === "all"
              ? ["exa", "certificate_transparency", "oval_social"]
              : [source],
          customQuery: fields.get("customQuery") || null,
        }),
      });
      const payload = await created.json();
      if (!created.ok)
        throw new Error(payload.error || "Unable to create search run");
      setOperation(
        "Running configured providers; failures are isolated per query…",
      );
      const executed = await fetch(`/api/shield/runs/${payload.run.id}`, {
        method: "POST",
      });
      const result = await executed.json();
      if (!executed.ok) throw new Error(result.error || "Discovery run failed");
      toast.success(
        `Threat search ${result.run.status}: ${result.progress.discovered} signals discovered`,
      );
      setSearchOpen(false);
      load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Threat search failed",
      );
    } finally {
      setOperation("");
    }
  }

  async function submitSuspiciousUrl(form: HTMLFormElement) {
    const fields = new FormData(form);
    setOperation("Normalising, deduplicating and queueing a safe capture…");
    try {
      const response = await fetch("/api/shield/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fields.get("url"),
          suspectedThreatType: fields.get("threatType"),
          description: fields.get("description"),
          urgency: fields.get("urgency"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to queue URL");
      toast.success(
        payload.duplicate
          ? "Existing candidate linked; duplicate crawl avoided"
          : "Suspicious URL queued for isolated capture",
      );
      setSubmitOpen(false);
      load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "URL submission failed",
      );
    } finally {
      setOperation("");
    }
  }

  if (loading)
    return (
      <main className="audience-studio shield-page">
        <ShieldNav router={router} />
        <OvalLoadingSkeleton embedded variant="overview" />
      </main>
    );
  if (loadError)
    return (
      <main className="audience-studio shield-page">
        <ShieldNav router={router} />
        <section className="shield-state">
          <ShieldAlert />
          <h1>Shield source unavailable</h1>
          <p>{loadError}</p>
          <button onClick={load}>Retry source</button>
        </section>
      </main>
    );

  return (
    <main className="audience-studio shield-page">
      <div className="ai-ambient ai-ambient-one" />
      <div className="ai-ambient ai-ambient-two" />
      <ShieldNav router={router} active />
      <section className="shield-hero">
        <div>
          <p className="ai-eyebrow">
            GATI · OVAL SHIELD PROPRIETARY THREAT ENGINE
          </p>
          <h1>
            Find the threat.
            <br />
            <em>Stop the spread.</em>
          </h1>
          <p>
            Detect piracy, impersonation and harmful narratives targeting
            Physics Wallah—then turn every verified threat into coordinated
            action.
          </p>
        </div>
        <button
          className={`shield-level-card level-${threatLevel.toLowerCase()}`}
          onClick={() => openCommand("critical")}
        >
          <header>
            <span>PW Threat Level</span>
            <i>
              <b /> REVIEW
            </i>
          </header>
          <strong>{threatLevel}</strong>
          <p>
            {critical} critical ·{" "}
            {
              visibleCases.filter((item) => item.status === "Investigating")
                .length
            }{" "}
            under review
          </p>
          <div className="shield-level-trend">
            <Sparkline
              values={[
                36,
                42,
                39,
                51,
                58,
                64,
                threatLevel === "Critical" ? 91 : 72,
              ]}
            />
            <span>
              <b>+12%</b> vs previous period
            </span>
          </div>
          <footer>
            <span>Last scan {date(lastScan)}</span>
            <b>
              Open Command Centre <ArrowUpRight size={15} />
            </b>
          </footer>
        </button>
      </section>

      <ShieldFilterBar
        filters={filters}
        setFilter={setFilter}
        categories={categories}
        platforms={platforms}
      />

      <section className="shield-section shield-metrics-section">
        <SectionTitle
          eyebrow="SHIELD OVERVIEW"
          title="Dashboard"
          note="Select a metric to filter the command centre."
        />
        <div className="shield-metric-grid">
          {metrics.map((metric, index) => (
            <button
              key={metric.id}
              className={metricFilter === metric.id ? "active" : ""}
              onClick={() => openCommand(metric.id)}
            >
              <header>
                <span>0{index + 1}</span>
                <ArrowUpRight size={15} />
              </header>
              <p>{metric.label}</p>
              <strong>{fmt(metric.value)}</strong>
              <div>
                <Change current={metric.value} previous={metric.previous} />
                <Sparkline
                  values={[
                    metric.previous,
                    metric.previous + 1,
                    Math.max(0, metric.value - 1),
                    metric.value,
                  ]}
                />
              </div>
              <small>{metric.note}</small>
            </button>
          ))}
        </div>
        <div className="shield-ops-grid">
          {operationalMetrics.map(([label, value, delta]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{delta}</small>
            </article>
          ))}
        </div>
      </section>

      <div className="shield-reordered-sections">
      <section className="shield-section shield-radar-section">
        <SectionTitle
          eyebrow="THREAT RADAR"
          title="PW Threat Surface"
          note="Current period compared with the previous comparable period."
        />
        <div className="shield-radar-layout">
          <article className="shield-radar-card">
            <ResponsiveContainer width="100%" height={390}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#d1d1ca" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={(props) => (
                    <RadarTick
                      {...props}
                      active={radarFilter === props.payload.value}
                      onClick={() =>
                        setRadarFilter((current) =>
                          current === props.payload.value
                            ? ""
                            : props.payload.value,
                        )
                      }
                    />
                  )}
                />
                <Tooltip content={<RadarTooltip />} />
                <Radar
                  name="Previous period"
                  dataKey="previous"
                  stroke="#96978f"
                  fill="#c8c9c2"
                  fillOpacity={0.24}
                />
                <Radar
                  name="Current period"
                  dataKey="current"
                  stroke="#11110f"
                  fill="#f2a93b"
                  fillOpacity={0.26}
                  animationDuration={650}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="shield-radar-legend">
              <span>
                <i className="current" /> Current period
              </span>
              <span>
                <i /> Previous period
              </span>
            </div>
          </article>
          <aside className="shield-radar-method">
            <p className="ai-eyebrow">HOW THE SCORE WORKS</p>
            <h3>Risk intensity, not mention volume alone.</h3>
            <p>
              Each axis averages severity × entity confidence across matching
              cases. Reach, evidence readiness, user-harm potential and
              reappearance determine severity before aggregation.
            </p>
            {radarData.map((axis) => (
              <button
                key={axis.subject}
                className={radarFilter === axis.subject ? "active" : ""}
                onClick={() =>
                  setRadarFilter((current) =>
                    current === axis.subject ? "" : axis.subject,
                  )
                }
              >
                <span>{axis.subject}</span>
                <b>
                  {axis.current}
                  <small>/100</small>
                </b>
                <i>
                  <em style={{ width: `${axis.current}%` }} />
                </i>
              </button>
            ))}
          </aside>
        </div>
      </section>

      <section className="shield-section shield-command" ref={commandRef}>
        <SectionTitle
          eyebrow="CRITICAL THREAT QUEUE"
          title="Threat Command Centre"
          note={`${visibleCases.length} cases match the selected intelligence window.`}
        />
        <div className="shield-command-tools">
          <div className="shield-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search case, domain or affected entity"
            />
          </div>
          <button
            className={filters.owner === "my" ? "active" : ""}
            onClick={() =>
              setFilter("owner", filters.owner === "my" ? "all" : "my")
            }
          >
            <UserRound size={14} /> My Cases
          </button>
          <button
            className={filters.owner === "unassigned" ? "active" : ""}
            onClick={() =>
              setFilter(
                "owner",
                filters.owner === "unassigned" ? "all" : "unassigned",
              )
            }
          >
            Unassigned
          </button>
          {(metricFilter || radarFilter) && (
            <button
              onClick={() => {
                setMetricFilter(null);
                setRadarFilter("");
              }}
            >
              <X size={13} /> Clear intelligence filter
            </button>
          )}
        </div>
        {visibleCases.length ? (
          <>
          <div className="shield-table-wrap">
            <table className="shield-table">
              <thead>
                <tr>
                  <th>Threat</th>
                  <th>Category / Source</th>
                  <th>PW Entity Affected</th>
                  <th>Severity</th>
                  <th>Confidence</th>
                  <th>Est. Reach</th>
                  <th>First Detected</th>
                  <th>Evidence</th>
                  <th>Recommended Action</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {commandCases.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSelected(item);
                    }}
                  >
                    <td>
                      <strong>{item.title}</strong>
                      <small>
                        {item.id} · {item.domain}
                      </small>
                    </td>
                    <td>
                      <span>{item.category}</span>
                      <small>{item.platform}</small>
                    </td>
                    <td>{item.affectedEntity}</td>
                    <td>
                      <SeverityPill severity={item.severity} />
                    </td>
                    <td>
                      <b>{item.confidence}%</b>
                    </td>
                    <td>{fmt(item.estimatedReach)}</td>
                    <td>{date(item.firstDetectedAt)}</td>
                    <td>
                      <EvidencePill value={item.evidenceReadiness} />
                    </td>
                    <td>{item.recommendedActions[0]}</td>
                    <td>{item.owner}</td>
                    <td>
                      <StatusPill value={item.status} />
                    </td>
                    <td>
                      <span>{item.sla}</span>
                      <small>Due {date(item.dueAt)}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={commandPage}
            pages={commandPageCount}
            total={visibleCases.length}
            onChange={setCommandPage}
          />
          </>
        ) : (
          <EmptyState
            onReset={() => {
              setFilters(initialFilters);
              setMetricFilter(null);
              setRadarFilter("");
              setQuery("");
            }}
          />
        )}
      </section>
      </div>

      <DomainIntelligence
        cases={visibleCases}
        activeFilter={domainFilter}
        setFilter={setDomainFilter}
        onOpen={setSelected}
      />
      <EnforcementCentre
        cases={visibleCases}
        onOpen={setSelected}
        onPrepareComplaint={setComplaintCase}
      />

      <AnimatePresence>
        {selected && (
          <ThreatDrawer
            item={selected}
            onClose={() => setSelected(null)}
            onAction={caseAction}
            onUpdate={updateCase}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {complaintCase && (
          <ComplaintModal
            item={complaintCase}
            onClose={() => setComplaintCase(null)}
            onUpdate={updateCase}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {searchOpen && (
          <DiscoveryModal
            title="Run Threat Search"
            note="Gati Wide Sweep searches semantic threat families across Exa, certificate logs and existing OVAL sources. Add EXA_API_KEY to oval/.env.local and restart the server; the key never reaches the browser."
            busy={operation}
            onClose={() => setSearchOpen(false)}
            onSubmit={runThreatSearch}
          >
            <label>
              Threat family
              <select name="threatType" defaultValue="all">
                <option value="all">All threat families</option>
                <option value="piracy">Piracy and leaked content</option>
                <option value="impersonation">
                  Impersonation, phishing and payments
                </option>
              </select>
            </label>
            <label>
              Evidence window
              <select name="dateScope" defaultValue="90d">
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </label>
            <label>
              Provider
              <select name="source" defaultValue="all">
                <option value="all">Wide Sweep · all configured sources</option>
                <option value="oval_social">Existing OVAL social URLs</option>
                <option value="exa">Exa Search API</option>
                <option value="certificate_transparency">
                  Certificate Transparency
                </option>
              </select>
            </label>
            <label>
              Maximum results
              <input
                name="maxResults"
                type="number"
                min="1"
                max="100"
                defaultValue="100"
              />
            </label>
            <label className="wide">
              Optional scoped query
              <input
                name="customQuery"
                placeholder='Example: "Physics Wallah" "leaked batch"'
              />
            </label>
          </DiscoveryModal>
        )}
        {submitOpen && (
          <DiscoveryModal
            title="Submit suspicious URL"
            note="The exact URL is canonicalised and checked against the official-domain allowlist before a public-only crawl is queued."
            busy={operation}
            onClose={() => setSubmitOpen(false)}
            onSubmit={submitSuspiciousUrl}
          >
            <label className="wide">
              Public URL
              <input
                name="url"
                type="url"
                required
                placeholder="https://suspected-source.example/path"
              />
            </label>
            <label>
              Suspected threat
              <select name="threatType" defaultValue="unclassified">
                <option value="unclassified">Needs classification</option>
                <option value="Pirated Lecture">Pirated lecture</option>
                <option value="Pirated PDF or Module">
                  Pirated PDF or module
                </option>
                <option value="Lookalike Login">Lookalike login</option>
                <option value="Fake PW Domain">Fake PW domain</option>
                <option value="Fake Payment">Fake payment</option>
              </select>
            </label>
            <label>
              Urgency
              <select name="urgency" defaultValue="normal">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="wide">
              Reporter context
              <textarea
                name="description"
                rows={3}
                placeholder="Why this URL should be reviewed"
              />
            </label>
          </DiscoveryModal>
        )}
      </AnimatePresence>
    </main>
  );
}

function DiscoveryModal({
  title,
  note,
  busy,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  note: string;
  busy: string;
  onClose: () => void;
  onSubmit: (form: HTMLFormElement) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="shield-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.form
        className="shield-discovery-modal"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(event.currentTarget);
        }}
      >
        <header>
          <div>
            <p className="ai-eyebrow">GATI · OVAL SHIELD DISCOVERY</p>
            <h2>{title}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <p>{note}</p>
        <div className="shield-discovery-fields">{children}</div>
        {busy && (
          <div className="shield-operation">
            <span />
            {busy}
          </div>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={Boolean(busy)}>
            {busy ? "Working…" : title}
          </button>
        </footer>
      </motion.form>
    </motion.div>
  );
}

function ShieldNav({
  router,
  active = false,
}: {
  router: ReturnType<typeof useRouter>;
  active?: boolean;
}) {
  const sources = [
    { id: "playstore", label: "Play Store" },
    { id: "freshdesk", label: "Fresh Desk" },
    { id: "linkedin", label: "LinkedIn" },
    { id: "x", label: "X" },
    { id: "instagram", label: "Instagram" },
    { id: "youtube", label: "YouTube" },
  ];
  return (
    <header className="ai-topbar">
      <button
        className="ai-brand-group"
        onClick={() => router.replace("/audience-intelligence/overview")}
      >
        <span className="ai-brand-mark">O</span>
        <span>
          <strong>OVAL</strong>
          <small>AUDIENCE INTELLIGENCE</small>
        </span>
      </button>
      <nav className="ai-source-nav" aria-label="Intelligence channels">
        <button
          onClick={() => router.replace("/audience-intelligence/overview")}
        >
          Overview
        </button>
        <button
          className={active ? "active shield-nav-item" : "shield-nav-item"}
          onClick={() => router.replace("/shield")}
        >
          <Shield size={13} /> Shield
        </button>
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() =>
              source.id === "youtube"
                ? openPwYtVerse()
                : router.replace(`/audience-intelligence/${source.id}`)
            }
          >
            {source.label}
          </button>
        ))}
      </nav>
      <div className="ai-top-actions">
        <div className="ai-search">
          <Search size={16} />
        </div>
        <button
          className="ai-icon-button ai-notification"
          aria-label="Shield alerts"
        >
          <Bell size={16} />
          <i />
        </button>
        <AuthProfileMenu />
      </div>
    </header>
  );
}

function ShieldFilterBar({
  filters,
  setFilter,
  categories,
  platforms,
}: {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => void;
  categories: string[];
  platforms: string[];
}) {
  return (
    <section className="shield-filter-bar">
      <div className="shield-periods">
        {PERIODS.map((period) => (
          <button
            key={period.id}
            className={filters.period === period.id ? "active" : ""}
            onClick={() => setFilter("period", period.id)}
          >
            {period.label}
          </button>
        ))}
      </div>
      {filters.period === "custom" && (
        <div className="shield-custom-range">
          <input
            aria-label="Custom range start"
            type="date"
            value={filters.customFrom}
            onChange={(event) => setFilter("customFrom", event.target.value)}
          />
          <span>to</span>
          <input
            aria-label="Custom range end"
            type="date"
            value={filters.customTo}
            onChange={(event) => setFilter("customTo", event.target.value)}
          />
        </div>
      )}
      <div className="shield-selects">
        <Select
          label="Threat Type"
          value={filters.threat}
          options={categories}
          onChange={(value) => setFilter("threat", value)}
        />
        <Select
          label="Platform"
          value={filters.platform}
          options={platforms}
          onChange={(value) => setFilter("platform", value)}
        />
        <Select
          label="Severity"
          value={filters.severity}
          options={SEVERITIES}
          onChange={(value) => setFilter("severity", value)}
        />
        <Select
          label="Case Status"
          value={filters.status}
          options={STATUSES}
          onChange={(value) => setFilter("status", value)}
        />
      </div>
    </section>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
function SectionTitle({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="shield-section-title">
      <div>
        <p className="ai-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <p>{note}</p>
    </div>
  );
}
function Change({ current, previous }: { current: number; previous: number }) {
  const delta = previous
    ? Math.round(((current - previous) / previous) * 100)
    : current
      ? 100
      : 0;
  return (
    <span className={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
      {delta > 0 ? "+" : ""}
      {delta}% <small>vs previous</small>
    </span>
  );
}
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 100},${32 - (value / max) * 28}`,
    )
    .join(" ");
  return (
    <svg
      className="shield-spark"
      viewBox="0 0 100 34"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Trend values: ${values.join(", ")}`}
    >
      <title>{`Trend values: ${values.join(", ")}`}</title>
      <polyline points={points} />
    </svg>
  );
}
function SeverityPill({ severity }: { severity: ShieldSeverity }) {
  return (
    <span className={`shield-pill severity-${severity.toLowerCase()}`}>
      {severity}
    </span>
  );
}
function StatusPill({ value }: { value: ShieldCaseStatus }) {
  return (
    <span
      className={`shield-pill status-${value.toLowerCase().replaceAll(" ", "-")}`}
    >
      {value}
    </span>
  );
}
function EvidencePill({ value }: { value: string }) {
  return (
    <span className={`shield-evidence-pill evidence-${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}

function RadarTick({ payload, x, y, textAnchor, active, onClick }: any) {
  return (
    <g
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => event.key === "Enter" && onClick()}
      className={active ? "shield-radar-tick active" : "shield-radar-tick"}
    >
      <text x={x} y={y} textAnchor={textAnchor} fill="#11110f">
        {payload.value}
      </text>
    </g>
  );
}
function RadarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="shield-chart-tooltip">
      <strong>{label}</strong>
      <p>
        Current{" "}
        <b>
          {payload.find((item: any) => item.dataKey === "current")?.value || 0}
          /100
        </b>
      </p>
      <p>
        Previous{" "}
        <b>
          {payload.find((item: any) => item.dataKey === "previous")?.value || 0}
          /100
        </b>
      </p>
      <small>Severity-weighted entity confidence from matching cases.</small>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="shield-empty">
      <Shield size={28} />
      <h3>No cases match these filters</h3>
      <p>
        Shield found no threat case in the selected combination. This does not
        guarantee that no external threat exists.
      </p>
      <button onClick={onReset}>Reset filters</button>
    </div>
  );
}

function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const candidates = Array.from(
    new Set([1, page - 1, page, page + 1, pages]),
  ).filter((value) => value >= 1 && value <= pages);
  return (
    <nav className="shield-pagination" aria-label="Threat queue pagination">
      <span>
        Showing {(page - 1) * COMMAND_PAGE_SIZE + 1}–
        {Math.min(page * COMMAND_PAGE_SIZE, total)} of {total}
      </span>
      <div>
        <button disabled={page === 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        {candidates.map((value, index) => (
          <span key={value}>
            {index > 0 && value - candidates[index - 1] > 1 && <i>…</i>}
            <button
              className={value === page ? "active" : ""}
              aria-current={value === page ? "page" : undefined}
              onClick={() => onChange(value)}
            >
              {value}
            </button>
          </span>
        ))}
        <button disabled={page === pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

function DomainIntelligence({
  cases,
  activeFilter,
  setFilter,
  onOpen,
}: {
  cases: ShieldThreatCase[];
  activeFilter: string;
  setFilter: (value: string) => void;
  onOpen: (item: ShieldThreatCase) => void;
}) {
  const domains = cases
    .filter((item) => item.domainIntelligence)
    .filter(
      (item) =>
        activeFilter === "All" ||
        (activeFilter === "Newly Registered"
          ? (item.domainIntelligence?.registrationAgeDays || 999) <= 30
          : activeFilter === "Reappeared"
            ? item.status === "Reappeared"
            : item.domainIntelligence?.threatTypes.includes(activeFilter)),
    );
  return (
    <section className="shield-section">
      <SectionTitle
        eyebrow="DOMAIN INTELLIGENCE"
        title="Suspicious Domain Intelligence"
        note="Similarity requires corroborating education, course, teacher, product, login or payment context."
      />
      <div className="shield-chip-row">
        {DOMAIN_FILTERS.map((item) => (
          <button
            key={item}
            className={activeFilter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {domains.length ? (
        <div className="shield-domain-grid">
          {domains.map((item) => (
            <button key={item.id} onClick={() => onOpen(item)}>
              <header>
                <Globe2 size={17} />
                <strong>{item.domain}</strong>
                <ArrowUpRight size={14} />
              </header>
              <div>
                <span>
                  PW similarity <b>{item.domainIntelligence?.similarity}%</b>
                </span>
                <i>
                  <em
                    className={
                      (item.domainIntelligence?.similarity || 0) > 60
                        ? "risk-high"
                        : (item.domainIntelligence?.similarity || 0) >= 30
                          ? "risk-medium"
                          : "risk-low"
                    }
                    style={{ width: `${item.domainIntelligence?.similarity}%` }}
                  />
                </i>
              </div>
              <p className="shield-domain-summary">
                <b>Threat type</b>
                {item.domainIntelligence?.threatTypes.join(" · ")}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <div className="shield-inline-empty">
          No suspicious domain matches this domain-intelligence filter.
        </div>
      )}
    </section>
  );
}

function EnforcementCentre({
  cases,
  onOpen,
  onPrepareComplaint,
}: {
  cases: ShieldThreatCase[];
  onOpen: (item: ShieldThreatCase) => void;
  onPrepareComplaint: (item: ShieldThreatCase) => void;
}) {
  const enforceable = cases.filter(
    (item) =>
      item.verificationState === "Verified" ||
      ["High", "Critical"].includes(item.severity),
  );
  const providerCases = enforceable
    .filter((item) => item.domainIntelligence)
    .slice(0, 3);
  const dmcaCase =
    enforceable.find((item) => isPiracy(item.category)) || enforceable[0];
  const dmcaDraft = dmcaCase
    ? `Subject: Copyright infringement notice — ${dmcaCase.domain}\n\nTo the designated DMCA agent,\n\nPhysics Wallah has identified material at ${dmcaCase.sourceUrl} that appears to reproduce or provide unauthorised access to ${dmcaCase.affectedAsset || dmcaCase.affectedEntity}.\n\nThe suspected activity is summarised as: ${dmcaCase.description}\n\nWe have a good-faith belief that the use described above is not authorised by the copyright owner, its agent, or law. The information in this notice is accurate, and the authorised representative will provide the required identity, ownership and signature declarations before submission.\n\nEvidence reference: ${dmcaCase.id}\nCaptured: ${date(dmcaCase.lastSeenAt)}\n\nThis is a review draft and must be approved and completed by PW Legal before submission.`
    : "No verified copyright case is available in this intelligence window.";

  const copyDraft = async () => {
    await navigator.clipboard.writeText(dmcaDraft);
    toast.success("DMCA review draft copied");
  };

  return (
    <section className="shield-section shield-enforcement">
      <SectionTitle
        eyebrow="ENFORCEMENT"
        title="Enforcement"
        note="Prepare evidence-backed escalation for authorised review. Nothing is submitted automatically."
      />
      <div className="shield-enforcement-grid">
        <article className="shield-provider-lane">
          <header>
            <div>
              <Globe2 size={18} />
              <span>
                <small>ROUTE 01</small>
                <strong>Raise to service provider</strong>
              </span>
            </div>
            <b>{providerCases.length} ready</b>
          </header>
          <p>
            Review the captured website snapshot, infringement summary and
            resolved provider before preparing an abuse report.
          </p>
          <div className="shield-provider-cases">
            {providerCases.length ? (
              providerCases.map((item) => {
                const evidence = item.evidence[0];
                return (
                  <div className="shield-provider-case" key={item.id}>
                    <div className="shield-site-snapshot">
                      <span>CAPTURED WEBSITE</span>
                      <Globe2 size={24} />
                      <strong>{item.domain}</strong>
                      <small>
                        {evidence?.pageTitle || item.title}
                      </small>
                      <i>{evidence ? date(evidence.captureTimestamp) : "Capture pending"}</i>
                    </div>
                    <div>
                      <SeverityPill severity={item.severity} />
                      <h3>{item.domain}</h3>
                      <p>{item.description}</p>
                      <dl>
                        <div>
                          <dt>Provider</dt>
                          <dd>{item.hostingProvider || "Under review"}</dd>
                        </div>
                        <div>
                          <dt>Evidence</dt>
                          <dd>{item.evidenceReadiness}</dd>
                        </div>
                      </dl>
                      <button onClick={() => onOpen(item)}>
                        Review provider report <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="shield-inline-empty">
                No provider-ready domain case matches this selection.
              </div>
            )}
          </div>
        </article>

        <article className="shield-dmca-lane">
          <header>
            <div>
              <FileCheck2 size={18} />
              <span>
                <small>ROUTE 02</small>
                <strong>Raise a DMCA notice</strong>
              </span>
            </div>
            <b>{dmcaCase ? "Draft ready" : "No case"}</b>
          </header>
          <p>
            A structured legal draft is prepared from the verified case and
            immutable evidence snapshot for PW Legal to review.
          </p>
          <pre>{dmcaDraft}</pre>
          <footer>
            <button onClick={copyDraft} disabled={!dmcaCase}>
              <Copy size={14} /> Copy legal draft
            </button>
            <button
              className="primary"
              disabled={!dmcaCase}
              onClick={() => dmcaCase && onPrepareComplaint(dmcaCase)}
            >
              Review and raise <ArrowUpRight size={14} />
            </button>
          </footer>
        </article>
      </div>
    </section>
  );
}

function ThreatDrawer({
  item,
  onClose,
  onAction,
  onUpdate,
}: {
  item: ShieldThreatCase;
  onClose: () => void;
  onAction: (item: ShieldThreatCase, action: string) => void;
  onUpdate: (
    id: string,
    changes: Partial<ShieldThreatCase>,
    action: string,
    detail: string,
  ) => void;
}) {
  const actions = [
    "Mark as Verified",
    "Mark as False Positive",
    "Escalate to Security",
    "Send for Legal Review",
    "Generate Evidence Pack",
    "Prepare Complaint",
    "Continue Monitoring",
  ].filter(
    (action) =>
      action !== "Prepare Complaint" ||
      (item.verificationState === "Verified" && item.status === "Verified"),
  );
  return (
    <motion.div
      className="shield-drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.aside
        className="shield-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Threat details for ${item.title}`}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="shield-drawer-head">
          <div>
            <p>
              {item.id} · {item.category}
            </p>
            <h2>{item.title}</h2>
            <div>
              <SeverityPill severity={item.severity} />
              <StatusPill value={item.status} />
            </div>
          </div>
          <button onClick={onClose} aria-label="Close threat details">
            <X />
          </button>
        </header>
        <div className="shield-drawer-body">
          <section className="shield-drawer-preview">
            <div>
              <span>PUBLIC SOURCE CAPTURE</span>
              <Globe2 />
              <strong>{item.domain}</strong>
              <p>{item.sourceUrl}</p>
              <i>
                {item.verificationState} · checked {date(item.verifiedAt)}
              </i>
            </div>
            <dl>
              <div>
                <dt>Exact URL</dt>
                <dd>
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    {item.sourceUrl} <ExternalLink size={12} />
                  </a>
                </dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{item.platform}</dd>
              </div>
              <div>
                <dt>First detected</dt>
                <dd>{date(item.firstDetectedAt)}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>{date(item.lastSeenAt)}</dd>
              </div>
            </dl>
          </section>
          <DrawerSection title="Classification & impact">
            <p>{item.description}</p>
            <blockquote>{item.sourceExcerpt}</blockquote>
            <p>
              <strong>Data origin:</strong> {item.dataOrigin}
            </p>
            <p>{item.classificationReasoning}</p>
            <div className="shield-drawer-stats">
              <span>
                <small>Entity confidence</small>
                <strong>{item.confidence}%</strong>
              </span>
              <span>
                <small>Estimated reach</small>
                <strong>
                  {item.estimatedReach
                    ? fmt(item.estimatedReach)
                    : "Unverified"}
                </strong>
              </span>
              <span>
                <small>Evidence state</small>
                <strong>{item.verificationState}</strong>
              </span>
            </div>
            <p>{item.severityExplanation}</p>
            <p>{item.trafficSignals}</p>
          </DrawerSection>
          {item.gati && (
            <DrawerSection title="Gati qualification">
              <div className="shield-drawer-stats">
                <span>
                  <small>Brand relevance</small>
                  <strong>{Math.round(item.gati.brandRelevance)}%</strong>
                </span>
                <span>
                  <small>Threat evidence</small>
                  <strong>{Math.round(item.gati.threatEvidence)}%</strong>
                </span>
                <span>
                  <small>Decision</small>
                  <strong>{item.gati.verdict.replaceAll("_", " ")}</strong>
                </span>
              </div>
              <p>{item.gati.explanation}</p>
              <dl className="shield-detail-list">
                <div>
                  <dt>Threat family</dt>
                  <dd>{item.gati.threatType.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{item.gati.analysisVersion}</dd>
                </div>
                <div>
                  <dt>Positive indicators</dt>
                  <dd>{item.gati.positiveSignals.join(" · ") || "None"}</dd>
                </div>
                <div>
                  <dt>Benign indicators</dt>
                  <dd>{item.gati.negativeSignals.join(" · ") || "None"}</dd>
                </div>
                <div>
                  <dt>Artifacts analysed</dt>
                  <dd>{item.gati.artifacts.length}</dd>
                </div>
              </dl>
            </DrawerSection>
          )}
          <DrawerSection title="Infrastructure intelligence">
            <dl className="shield-detail-list">
              <div>
                <dt>Registrar</dt>
                <dd>{item.registrar}</dd>
              </div>
              <div>
                <dt>Hosting provider</dt>
                <dd>{item.hostingProvider}</dd>
              </div>
              <div>
                <dt>WHOIS network owner</dt>
                <dd>{item.networkOperator || "Pending WHOIS enrichment"}</dd>
              </div>
              <div>
                <dt>CDN / reverse proxy</dt>
                <dd>{item.cdnProvider || "None detected"}</dd>
              </div>
              <div>
                <dt>Network abuse contact</dt>
                <dd>{item.networkAbuseContact || "Unavailable"}</dd>
              </div>
              <div>
                <dt>Provider evidence</dt>
                <dd>{item.infrastructureSource?.replaceAll("_", " ") || "Pending enrichment"}</dd>
              </div>
              <div>
                <dt>Nameservers</dt>
                <dd>{item.nameservers.join(" · ") || "Pending enrichment"}</dd>
              </div>
              <div>
                <dt>Resolved IP</dt>
                <dd>{item.resolvedIp}</dd>
              </div>
              <div>
                <dt>Cloudflare detection</dt>
                <dd>{item.cloudflareRelationship}</dd>
              </div>
              <div>
                <dt>Related domains</dt>
                <dd>{item.relatedDomains.join(" · ") || "None confirmed"}</dd>
              </div>
              <div>
                <dt>Related social posts</dt>
                <dd>{item.relatedSocialPosts.length || 0}</dd>
              </div>
              <div>
                <dt>Related cases</dt>
                <dd>
                  {item.relatedCaseIds.join(" · ") || "No linked prior case"}
                </dd>
              </div>
            </dl>
            {item.cloudflareRelationship === "Reverse proxy only" && (
              <p className="shield-cloudflare-note">
                <AlertTriangle size={14} /> Cloudflare appears to proxy this
                domain and is not assumed to be the host. Report the exact
                offending URL to Cloudflare and separately contact the
                identified origin provider. Removal is not guaranteed.
              </p>
            )}
          </DrawerSection>
          <DrawerSection title="DNS & SEO intelligence">
            {item.webIntelligence ? (
              <div className="shield-web-intelligence">
                <div>
                  <h4>DNS records</h4>
                  <dl className="shield-record-list">
                    {item.webIntelligence.dnsRecords.map((record) => (
                      <div key={record.type}>
                        <dt>{record.type}</dt>
                        <dd>
                          {record.values.join(" · ") || "No public answer"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <h4>Registration & TLS</h4>
                  <dl className="shield-record-list">
                    <div>
                      <dt>Registered</dt>
                      <dd>
                        {item.webIntelligence.rdap.registeredAt
                          ? date(item.webIntelligence.rdap.registeredAt)
                          : "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>
                        {item.webIntelligence.rdap.expiresAt
                          ? date(item.webIntelligence.rdap.expiresAt)
                          : "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Abuse contact</dt>
                      <dd>
                        {item.webIntelligence.rdap.abuseContact ||
                          "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>TLS protocol</dt>
                      <dd>
                        {item.webIntelligence.tls.protocol || "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>TLS issuer</dt>
                      <dd>{item.webIntelligence.tls.issuer || "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>TLS subject</dt>
                      <dd>{item.webIntelligence.tls.subject || "Unavailable"}</dd>
                    </div>
                    <div>
                      <dt>Certificate validity</dt>
                      <dd>
                        {item.webIntelligence.tls.validFrom || "Unknown"} →{" "}
                        {item.webIntelligence.tls.validTo || "Unknown"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {item.webIntelligence.whois?.available && (
                  <div className="wide">
                    <h4>WHOIS service-provider record</h4>
                    <dl className="shield-record-list">
                      <div>
                        <dt>Registrar</dt>
                        <dd>{item.webIntelligence.whois.registrar || "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>WHOIS server</dt>
                        <dd>{item.webIntelligence.whois.registrarWhoisServer || "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>Registrar abuse</dt>
                        <dd>{item.webIntelligence.whois.abuseEmail || "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>Registration period</dt>
                        <dd>
                          {item.webIntelligence.whois.createdAt || "Unknown"} →{" "}
                          {item.webIntelligence.whois.expiresAt || "Unknown"}
                        </dd>
                      </div>
                      <div>
                        <dt>Registrant organisation</dt>
                        <dd>{item.webIntelligence.whois.registrantOrganisation || "Redacted or unavailable"}</dd>
                      </div>
                      <div>
                        <dt>Record fingerprint</dt>
                        <dd>{item.webIntelligence.whois.responseSha256?.slice(0, 20) || "Unavailable"}</dd>
                      </div>
                    </dl>
                  </div>
                )}
                <div className="wide">
                  <h4>Page & search metadata</h4>
                  <dl className="shield-record-list">
                    <div>
                      <dt>SEO title</dt>
                      <dd>
                        {item.webIntelligence.seo.title || "Not declared"}
                      </dd>
                    </div>
                    <div>
                      <dt>Description</dt>
                      <dd>
                        {item.webIntelligence.seo.description ||
                          "Not declared"}
                      </dd>
                    </div>
                    <div>
                      <dt>Canonical URL</dt>
                      <dd>
                        {item.webIntelligence.seo.canonical || "Not declared"}
                      </dd>
                    </div>
                    <div>
                      <dt>Robots</dt>
                      <dd>
                        {item.webIntelligence.seo.robots || "Not declared"}
                      </dd>
                    </div>
                    <div>
                      <dt>Primary headings</dt>
                      <dd>
                        {item.webIntelligence.seo.h1.join(" · ") ||
                          "No H1 captured"}
                      </dd>
                    </div>
                    <div>
                      <dt>Secondary headings</dt>
                      <dd>
                        {item.webIntelligence.seo.h2.slice(0, 8).join(" · ") ||
                          "No H2 captured"}
                      </dd>
                    </div>
                    <div>
                      <dt>Language</dt>
                      <dd>{item.webIntelligence.seo.language || "Not declared"}</dd>
                    </div>
                    <div>
                      <dt>Structured data</dt>
                      <dd>
                        {item.webIntelligence.seo.schemaTypes.join(" · ") ||
                          "None detected"}
                      </dd>
                    </div>
                    <div>
                      <dt>Links</dt>
                      <dd>
                        {item.webIntelligence.seo.internalLinkCount ?? 0} internal
                        · {item.webIntelligence.seo.externalLinkCount ?? 0} external
                      </dd>
                    </div>
                    <div>
                      <dt>Images</dt>
                      <dd>{item.webIntelligence.seo.imageCount ?? 0} detected</dd>
                    </div>
                    <div>
                      <dt>HTTP status</dt>
                      <dd>{item.webIntelligence.httpStatus || "Unavailable"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="wide">
                  <h4>HTTP, redirects & discovered endpoints</h4>
                  <dl className="shield-record-list">
                    <div>
                      <dt>Captured</dt>
                      <dd>
                        {item.webIntelligence.capturedAt
                          ? date(item.webIntelligence.capturedAt)
                          : "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Redirect chain</dt>
                      <dd>
                        {item.webIntelligence.redirectChain.join(" → ") ||
                          "No redirect observed"}
                      </dd>
                    </div>
                    {item.webIntelligence.responseHeaders.map((header) => (
                      <div key={header.name}>
                        <dt>{header.name}</dt>
                        <dd>{header.value}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Social links</dt>
                      <dd>
                        {item.webIntelligence.links.social.join(" · ") ||
                          "None detected"}
                      </dd>
                    </div>
                    <div>
                      <dt>Download links</dt>
                      <dd>
                        {item.webIntelligence.links.downloads.join(" · ") ||
                          "None detected"}
                      </dd>
                    </div>
                    <div>
                      <dt>Network destinations</dt>
                      <dd>
                        {item.webIntelligence.links.networkDestinations.join(" · ") ||
                          "None captured"}
                      </dd>
                    </div>
                  </dl>
                </div>
                {(Object.keys(item.webIntelligence.seo.openGraph).length > 0 ||
                  Object.keys(item.webIntelligence.seo.twitter).length > 0) && (
                  <div className="wide">
                    <h4>Social preview metadata</h4>
                    <dl className="shield-record-list">
                      {Object.entries(item.webIntelligence.seo.openGraph).map(
                        ([key, value]) => (
                          <div key={`og-${key}`}>
                            <dt>og:{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ),
                      )}
                      {Object.entries(item.webIntelligence.seo.twitter).map(
                        ([key, value]) => (
                          <div key={`twitter-${key}`}>
                            <dt>twitter:{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  </div>
                )}
              </div>
            ) : (
              <p>
                DNS, registration and SEO metadata will appear after the safe
                public-page capture completes.
              </p>
            )}
          </DrawerSection>
          <DrawerSection title="Evidence Vault">
            <div className="shield-evidence-vault">
              {item.evidence.map((evidence) => (
                <EvidenceCard evidence={evidence} key={evidence.id} />
              ))}
            </div>
          </DrawerSection>
          <DrawerSection title="Ownership & next action">
            <div className="shield-owner-form">
              <label>
                Primary owner
                <select
                  value={item.owner}
                  onChange={(event) =>
                    onUpdate(
                      item.id,
                      { owner: event.target.value },
                      "Owner assigned",
                      `Primary owner changed to ${event.target.value}.`,
                    )
                  }
                >
                  {OWNERS.map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </label>
              <label>
                Supporting team
                <select
                  value={item.supportingTeam}
                  onChange={(event) =>
                    onUpdate(
                      item.id,
                      { supportingTeam: event.target.value as ShieldTeam },
                      "Team assigned",
                      `Supporting team changed to ${event.target.value}.`,
                    )
                  }
                >
                  {TEAMS.map((team) => (
                    <option key={team}>{team}</option>
                  ))}
                </select>
              </label>
              <label>
                Case status
                <select
                  value={item.status}
                  onChange={(event) =>
                    onUpdate(
                      item.id,
                      { status: event.target.value as ShieldCaseStatus },
                      "Status updated",
                      `Status changed to ${event.target.value}.`,
                    )
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
            <dl className="shield-detail-list">
              <div>
                <dt>SLA</dt>
                <dd>{item.sla}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{date(item.dueAt)}</dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>{item.nextAction}</dd>
              </div>
              <div>
                <dt>Legal review</dt>
                <dd>{item.legalReviewStatus}</dd>
              </div>
            </dl>
          </DrawerSection>
          <DrawerSection title="Recommended countermeasure">
            <ol className="shield-recommendations">
              {item.recommendedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
            <p>
              No external report is submitted automatically. Every complaint
              requires evidence, rights-holder authority and human approval.
            </p>
          </DrawerSection>
          <DrawerSection title="Case activity log">
            <div className="shield-timeline">
              {[...item.auditTrail].reverse().map((event) => (
                <article key={event.id}>
                  <i />
                  <div>
                    <strong>{event.action}</strong>
                    <p>{event.detail}</p>
                    <small>
                      {event.actor} · {date(event.at)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </DrawerSection>
        </div>
        <footer className="shield-drawer-actions">
          {actions.map((action) => (
            <button
              key={action}
              className={action === "Prepare Complaint" ? "primary" : ""}
              onClick={() => onAction(item, action)}
            >
              {action}
            </button>
          ))}
        </footer>
      </motion.aside>
    </motion.div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="shield-drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function EvidenceCard({ evidence }: { evidence: ShieldEvidence }) {
  return (
    <article>
      <header>
        <FileArchive size={16} />
        <div>
          <strong>{evidence.pageTitle}</strong>
          <small>
            Version {evidence.version} · {evidence.captureStatus}
          </small>
        </div>
        {evidence.immutable ? (
          <LockKeyhole size={15} />
        ) : (
          <FileCheck2 size={15} />
        )}
      </header>
      <p>{evidence.exactUrl}</p>
      <dl>
        <div>
          <dt>Captured</dt>
          <dd>{date(evidence.captureTimestamp)}</dd>
        </div>
        <div>
          <dt>Similarity</dt>
          <dd>{evidence.similarityScore}%</dd>
        </div>
        <div>
          <dt>Content hash</dt>
          <dd>{evidence.contentHash}</dd>
        </div>
        <div>
          <dt>Certificate</dt>
          <dd>{evidence.certificateInfo}</dd>
        </div>
        <div>
          <dt>DNS / host</dt>
          <dd>
            {evidence.dnsData} · {evidence.hostingData}
          </dd>
        </div>
        <div>
          <dt>Reach evidence</dt>
          <dd>{evidence.reachEvidence}</dd>
        </div>
      </dl>
      {evidence.immutable && (
        <span>
          Immutable after submission · corrections create a new version
        </span>
      )}
    </article>
  );
}

function ComplaintModal({
  item,
  onClose,
  onUpdate,
}: {
  item: ShieldThreatCase;
  onClose: () => void;
  onUpdate: (
    id: string,
    changes: Partial<ShieldThreatCase>,
    action: string,
    detail: string,
  ) => void;
}) {
  const [approver, setApprover] = useState("");
  const [legal, setLegal] = useState(item.legalReviewStatus);
  const [declaration, setDeclaration] = useState(false);
  const save = (approval = false) => {
    onUpdate(
      item.id,
      {
        status: approval ? "Awaiting Legal Review" : "Complaint Prepared",
        legalReviewStatus: approval ? "Pending" : legal,
        submissionHistory: [
          ...item.submissionHistory,
          {
            id: `draft-${Date.now()}`,
            destination:
              item.enforcementDestination || "Recipient pending approval",
            submittedAt: new Date().toISOString(),
            status: approval ? "Awaiting Approval" : "Draft",
          },
        ],
      },
      approval ? "Sent for legal approval" : "Complaint draft saved",
      "Complaint preparation saved locally. No external submission occurred.",
    );
    onClose();
  };
  const exportDraft = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            caseId: item.id,
            category: item.category,
            rightsHolder: "Physics Wallah · verification required",
            exactUrls: item.evidence.map((e) => e.exactUrl),
            intendedRecipient: item.enforcementDestination,
            legalReview: legal,
            status: "DRAFT — NOT SUBMITTED",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item.id}-complaint-draft.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Complaint draft exported");
  };
  return (
    <motion.div
      className="shield-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        className="shield-complaint-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Prepare complaint"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18 }}
      >
        <header>
          <div>
            <p className="ai-eyebrow">HUMAN REVIEW REQUIRED</p>
            <h2>Prepare Complaint</h2>
            <span>{item.id} · Draft only · no external submission</span>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="shield-complaint-grid">
          <label>
            Complaint category
            <input value={item.category} readOnly />
          </label>
          <label>
            Rights holder
            <input defaultValue="Physics Wallah · authority verification required" />
          </label>
          <label>
            Authorised representative
            <input placeholder="Name and authority" />
          </label>
          <label>
            Intended recipient
            <select defaultValue={item.recommendedActions[0]}>
              {item.recommendedActions.map((action) => (
                <option key={action}>{action}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Exact infringing URLs
            <textarea
              value={item.evidence.map((e) => e.exactUrl).join("\n")}
              readOnly
            />
          </label>
          <label className="wide">
            Description of protected PW work
            <textarea defaultValue={item.affectedAsset} />
          </label>
          <label className="wide">
            Original authorised URLs
            <textarea
              defaultValue={
                item.piracyIntelligence?.originalAsset ||
                "Authorised source URL must be confirmed by the rights holder"
              }
            />
          </label>
          <label>
            Evidence attachments
            <input
              value={`${item.evidence.length} versioned evidence item(s)`}
              readOnly
            />
          </label>
          <label>
            Ownership evidence
            <input placeholder="Attach rights schedule or ownership record" />
          </label>
          <label>
            Internal approver
            <input
              value={approver}
              onChange={(event) => setApprover(event.target.value)}
              placeholder="Required approver"
            />
          </label>
          <label>
            Legal review status
            <select
              value={legal}
              onChange={(event) => setLegal(event.target.value as typeof legal)}
            >
              <option>Not Requested</option>
              <option>Pending</option>
              <option>Approved</option>
              <option>Changes Requested</option>
            </select>
          </label>
        </div>
        <label className="shield-declaration">
          <input
            type="checkbox"
            checked={declaration}
            onChange={(event) => setDeclaration(event.target.checked)}
          />
          <span>
            I confirm the good-faith and accuracy declarations are ready for
            authorised human review. This does not submit the complaint.
          </span>
        </label>
        <aside>
          <AlertTriangle size={17} />
          <p>
            If Cloudflare is only proxying the domain, the complaint should
            identify the exact offending URL and separately reach the actual
            hosting provider. Cloudflare may forward a report; removal is not
            guaranteed.
          </p>
        </aside>
        <div className="shield-portal-actions">
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Open the official reporting portal? OVAL will not submit or transfer this draft automatically.",
                )
              )
                window.open(
                  "https://www.cloudflare.com/trust-hub/reporting-abuse/",
                  "_blank",
                  "noopener,noreferrer",
                );
            }}
          >
            <ExternalLink size={14} /> Open Official Reporting Portal
          </button>
          <button
            disabled={legal !== "Approved"}
            onClick={() => {
              navigator.clipboard.writeText(
                `Approved complaint draft for ${item.id}. Exact URLs: ${item.evidence.map((e) => e.exactUrl).join(", ")}`,
              );
              toast.success("Approved complaint copied");
            }}
          >
            <Copy size={14} /> Copy Approved Complaint
          </button>
          <button onClick={exportDraft}>
            <Download size={14} /> Download Evidence Pack
          </button>
        </div>
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => save(false)}>Save Draft</button>
          <button onClick={exportDraft}>Export Complaint</button>
          <button
            className="primary"
            disabled={!approver || !declaration}
            onClick={() => save(true)}
          >
            Send for Legal Approval
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
