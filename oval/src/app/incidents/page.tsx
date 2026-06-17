"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpDown, Download, Filter, Search, Users } from "lucide-react";
import { ConfidenceIndicator, SeverityBadge, StatusBadge, VerificationBadge } from "@/components/intelligence/badges";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import type { Incident, IncidentDashboard, IncidentStatus } from "@/lib/incident-intelligence";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const views = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "unassigned", label: "Unassigned" },
  { id: "escalating", label: "Escalating" },
  { id: "needs_validation", label: "Awaiting validation" },
  { id: "in_progress", label: "In progress" },
  { id: "monitoring", label: "Monitoring" },
  { id: "resolved", label: "Resolved" },
  { id: "my", label: "My incidents" },
];

function matchesView(incident: Incident, view: string) {
  if (view === "all") return true;
  if (view === "critical") return incident.severity === "critical" || incident.severity === "high";
  if (view === "unassigned") return incident.owner === "Unassigned";
  if (view === "escalating") return incident.trend === "accelerating" || incident.trend === "rising";
  if (view === "my") return incident.owner.includes("Product") || incident.team.includes("Product");
  return incident.status === view as IncidentStatus;
}

function SourcePills({ sources }: { sources: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((source) => (
        <span key={source} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {source}
        </span>
      ))}
    </div>
  );
}

export default function IncidentsPage() {
  const { data, loading } = useLiveData<IncidentDashboard | null>("/api/incidents", null);
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");

  const incidents = useMemo(() => data?.incidents || [], [data?.incidents]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return incidents.filter((incident) => {
      const inView = matchesView(incident, view);
      if (!q) return inView;
      return inView && [incident.title, incident.summary, incident.owner, incident.team, incident.affectedEntity, incident.sources.join(" ")].join(" ").toLowerCase().includes(q);
    });
  }, [incidents, query, view]);

  if (loading) return <PageSkeleton title="Incidents" color="#E24B4A" />;
  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm font-semibold">No incidents available</p>
        <p className="mt-1 text-xs text-muted-foreground">The incident API returned no data.</p>
      </div>
    );
  }

  return (
    <motion.div className="space-y-5" variants={stagger as any} initial="hidden" animate="show">
      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Total incidents</p>
          <p className="mt-2 text-2xl font-bold">{incidents.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Generated from connected evidence and adapter fields.</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-card p-4 dark:border-orange-800/50">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700 dark:text-orange-300">Critical / High</p>
          <p className="mt-2 text-2xl font-bold">{data.metrics.criticalHigh}</p>
          <p className="mt-1 text-xs text-muted-foreground">Needs same-day operational review.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Open actions</p>
          <p className="mt-2 text-2xl font-bold">{data.metrics.openActions}</p>
          <p className="mt-1 text-xs text-muted-foreground">Attached to owners and due dates.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Evidence volume</p>
          <p className="mt-2 text-2xl font-bold">{formatNumber(incidents.reduce((sum, incident) => sum + incident.evidence.length, 0))}</p>
          <p className="mt-1 text-xs text-muted-foreground">Representative examples, not raw exhaust.</p>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {views.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  view === item.id ? "border-purple bg-purple text-white" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex min-w-[260px] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="sr-only">Search incidents</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search incident, owner, source..."
                className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-bold">Operational queue</p>
            <p className="text-xs text-muted-foreground">{filtered.length} incidents in this view</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
            <Users className="h-3.5 w-3.5" />
            Bulk actions: assign, status, tags, export, merge, review
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold">No incidents match this view</p>
            <p className="mt-1 text-xs text-muted-foreground">Try clearing the search or selecting All.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Severity</th>
                  <th className="px-3 py-3">Incident</th>
                  <th className="px-3 py-3">Trend <ArrowUpDown className="ml-1 inline h-3 w-3" /></th>
                  <th className="px-3 py-3">Sources</th>
                  <th className="px-3 py-3">Affected entity</th>
                  <th className="px-3 py-3">Mentions</th>
                  <th className="px-3 py-3">Unique users</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Due / SLA</th>
                  <th className="px-3 py-3">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((incident) => (
                  <tr key={incident.id} className="hover:bg-muted/30">
                    <td className="px-3 py-4 align-top"><SeverityBadge severity={incident.severity} /></td>
                    <td className="max-w-[320px] px-3 py-4 align-top">
                      <Link href={`/incidents/${incident.id}`} className="font-semibold hover:text-purple">{incident.title}</Link>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{incident.summary}</p>
                      <div className="mt-2"><VerificationBadge verification={incident.verification} /></div>
                    </td>
                    <td className="px-3 py-4 align-top text-xs capitalize">{incident.trend}</td>
                    <td className="px-3 py-4 align-top"><SourcePills sources={incident.sources} /></td>
                    <td className="px-3 py-4 align-top text-xs">{incident.affectedEntity}</td>
                    <td className="px-3 py-4 align-top font-medium">{formatNumber(incident.mentions)}</td>
                    <td className="px-3 py-4 align-top font-medium">{formatNumber(incident.uniqueUsers)}</td>
                    <td className="px-3 py-4 align-top text-xs">
                      <p className="font-semibold">{incident.owner}</p>
                      <p className="text-muted-foreground">{incident.team}</p>
                    </td>
                    <td className="px-3 py-4 align-top"><StatusBadge status={incident.status} /></td>
                    <td className="px-3 py-4 align-top text-xs text-muted-foreground">{incident.due}</td>
                    <td className="px-3 py-4 align-top"><ConfidenceIndicator value={incident.confidence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
