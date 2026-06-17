"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  ClipboardList,
  ExternalLink,
  FileDown,
  GitBranch,
  Layers3,
  MessageSquareText,
  NotebookPen,
  Radio,
  Route,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { ConfidenceIndicator, SentimentBadge, SeverityBadge, StatusBadge, VerificationBadge } from "@/components/intelligence/badges";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import type { EvidenceItem, Incident } from "@/lib/incident-intelligence";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const tabs = ["Overview", "Evidence", "Actions", "Timeline", "Model Details"];

function DetailMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function EvidenceCard({ evidence, selected, onClick }: { evidence: EvidenceItem; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn("w-full rounded-xl border p-3 text-left transition-colors", selected ? "border-purple bg-purple/5" : "border-border bg-card hover:bg-muted/30")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{evidence.channel}</span>
        <ConfidenceIndicator value={evidence.confidence} />
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed">{evidence.text}</p>
      <p className="mt-2 text-[10px] text-muted-foreground">{evidence.sourceLabel} · {evidence.timestamp}</p>
    </button>
  );
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading } = useLiveData<{ live: boolean; incident: Incident } | null>(`/api/incidents/${params.id}`, null);
  const [tab, setTab] = useState("Overview");

  const incident = data?.incident;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEvidence = useMemo(() => {
    if (!incident?.evidence.length) return null;
    return incident.evidence.find((item) => item.id === selectedId) || incident.evidence[0];
  }, [incident, selectedId]);

  if (loading) return <PageSkeleton title="Incident Detail" color="#E24B4A" />;
  if (!incident) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm font-semibold">Incident not found</p>
        <p className="mt-1 text-xs text-muted-foreground">The incident may have been removed or the adapter is missing this id.</p>
        <Link href="/incidents" className="mt-4 inline-flex text-sm font-medium text-purple hover:underline">Back to incidents</Link>
      </div>
    );
  }

  return (
    <motion.div className="space-y-5" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <Link href="/incidents" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to incidents
        </Link>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              <VerificationBadge verification={incident.verification} />
              <SentimentBadge sentiment={incident.sentiment} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{incident.title}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{incident.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Owner: <b className="text-foreground">{incident.owner}</b></span>
              <span>Team: <b className="text-foreground">{incident.team}</b></span>
              <span>First seen: <b className="text-foreground">{incident.firstSeen}</b></span>
              <span>Last activity: <b className="text-foreground">{incident.lastActivity}</b></span>
              <ConfidenceIndicator value={incident.confidence} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><UserPlus className="h-3.5 w-3.5" /> Assign</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><GitBranch className="h-3.5 w-3.5" /> Create Jira/task</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><Bell className="h-3.5 w-3.5" /> Notify</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><NotebookPen className="h-3.5 w-3.5" /> Note</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><FileDown className="h-3.5 w-3.5" /> Export</button>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp as any} className="flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium", tab === item ? "border-purple bg-purple text-white" : "border-border text-muted-foreground hover:bg-muted")}
          >
            {item}
          </button>
        ))}
      </motion.div>

      {tab === "Overview" && (
        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <div className="rounded-2xl border border-purple/25 bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-purple" />
                <p className="text-xs font-semibold uppercase tracking-widest text-purple">AI Incident Summary</p>
              </div>
              <div className="space-y-3 text-sm leading-relaxed">
                <p><b>What happened:</b> {incident.summary}</p>
                <p><b>Why it matters:</b> {incident.priorityReason}</p>
                <p><b>Probable root cause:</b> {incident.recommendedAction.includes("Compare") ? "Release or app-experience regression. Correlation, not confirmed causation." : "Operational process gap indicated by repeated support and review evidence."}</p>
                <p><b>Recommended action:</b> {incident.recommendedAction}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <ConfidenceIndicator value={incident.confidence} />
                <VerificationBadge verification={incident.verification} />
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{incident.evidence.length} evidence items</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Route className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cross-Channel Contribution</p>
              </div>
              <div className="space-y-3">
                {incident.channelContributions.map((item) => (
                  <div key={item.channel} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{item.channel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.role}</p>
                      </div>
                      <p className="text-sm font-bold">{formatNumber(item.volume)}</p>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed">{item.signal}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <DetailMetric label="Mention volume" value={formatNumber(incident.mentions)} detail="Aggregated evidence volume." />
              <DetailMetric label="Unique users" value={formatNumber(incident.uniqueUsers)} detail="Estimated until backend identity fields land." />
              <DetailMetric label="Negative share" value={`${incident.impact.negativeShare}%`} detail="Channel-native severity proxy." />
              <DetailMetric label="Support tickets" value={formatNumber(incident.impact.supportTickets)} detail="Freshdesk contribution where available." />
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Impact</p>
              <p className="mt-2 text-sm leading-relaxed">{incident.impact.operationalImpact}</p>
              {incident.impact.ratingImpact ? <p className="mt-2 text-xs text-muted-foreground">Rating impact: {incident.impact.ratingImpact}</p> : null}
              {incident.impact.affectedVersions?.length ? <p className="mt-2 text-xs text-muted-foreground">Versions: {incident.impact.affectedVersions.join(", ")}</p> : null}
              {incident.impact.devices?.length ? <p className="mt-2 text-xs text-muted-foreground">Devices/brands: {incident.impact.devices.join(", ")}</p> : null}
            </div>
          </div>
        </motion.section>
      )}

      {tab === "Evidence" && (
        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div className="space-y-3 xl:col-span-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evidence filters</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {["All channels", "Negative", "High confidence", "Human reviewed", "Media attached"].map((filter) => (
                  <button key={filter} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">{filter}</button>
                ))}
              </div>
            </div>
            {incident.evidence.map((evidence) => (
              <EvidenceCard key={evidence.id} evidence={evidence} selected={selectedEvidence?.id === evidence.id} onClick={() => setSelectedId(evidence.id)} />
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 xl:col-span-3">
            {selectedEvidence ? (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Selected evidence</p>
                    <h2 className="mt-1 text-lg font-bold">{selectedEvidence.sourceLabel}</h2>
                  </div>
                  <div className="flex gap-2">
                    <SentimentBadge sentiment={selectedEvidence.sentiment} />
                    <SeverityBadge severity={selectedEvidence.severity} />
                  </div>
                </div>
                <blockquote className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed">
                  {selectedEvidence.text}
                </blockquote>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DetailMetric label="Why included" value="Evidence path" detail={selectedEvidence.whyIncluded} />
                  <DetailMetric label="AI confidence" value={`${Math.round(selectedEvidence.confidence * 100)}%`} detail="Representative example confidence, not final truth." />
                </div>
                <div className="mt-4 rounded-xl border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Metadata</p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                    {Object.entries(selectedEvidence.metadata).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                        <dt className="capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</dt>
                        <dd className="text-right font-medium">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <button className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-purple hover:underline">
                  Open original source <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </motion.section>
      )}

      {tab === "Actions" && (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recommended and assigned actions</p>
          </div>
          <div className="space-y-3">
            {incident.actions.map((action) => (
              <div key={action.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{action.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Owner: {action.owner} · Due: {action.due}</p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold capitalize">{action.status.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {tab === "Timeline" && (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Immutable incident history</p>
          </div>
          <div className="space-y-4">
            {incident.timeline.map((event, index) => (
              <div key={`${event.at}-${event.title}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold">{index + 1}</span>
                  {index < incident.timeline.length - 1 ? <span className="h-full w-px bg-border" /> : null}
                </div>
                <div className="pb-4">
                  <p className="text-xs font-medium text-muted-foreground">{event.at} · {event.type}</p>
                  <p className="mt-1 text-sm font-bold">{event.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {tab === "Model Details" && (
        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Radio className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Model and data quality</p>
            </div>
            <p className="text-sm leading-relaxed">{incident.modelDetails.dataCompleteness}</p>
            <div className="mt-4 space-y-2">
              {incident.modelDetails.limitations.map((item) => (
                <div key={item} className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Adapter boundary</p>
            </div>
            <p className="text-sm leading-relaxed">{incident.modelDetails.adapterBoundary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {incident.modelDetails.sourcesUsed.map((source) => (
                <span key={source} className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{source}</span>
              ))}
            </div>
          </div>
        </motion.section>
      )}
    </motion.div>
  );
}
