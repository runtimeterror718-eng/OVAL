"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, LifeBuoy, MessageSquareText, Tags, X } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

type TicketExample = {
  ticketId: string;
  status: string;
  group: string;
  issueL1: string;
  issueL2: string;
  category: string;
  subject: string;
  description: string;
};

type EvidencePanel = { title: string; subtitle: string; tickets: TicketExample[] };

const ASK_COPY: Record<string, { ask: string; sentiment: string; owner: string; action: string }> = {
  "Store & Logistics": {
    ask: "Where is my book/order, why is shipping delayed, and why is tracking unclear?",
    sentiment: "Frustrated and exam-anxious. Students feel the study material delay is hurting preparation.",
    owner: "PW Store Ops",
    action: "Create a delayed-order cohort, send proactive delivery updates, and expose courier status in support macros.",
  },
  "App & Video Technical": {
    ask: "Why is video/playback/app experience interrupting study time?",
    sentiment: "Impatient and disappointed. Students expect reliability because the app is their classroom.",
    owner: "Product Reliability",
    action: "Cluster by app version/device and publish known-issue workarounds to support.",
  },
  "Access & Entitlement": {
    ask: "I paid, so why can I not access my batch, subscription, or content?",
    sentiment: "High-trust risk. Paid users describe panic, unfairness, and refund intent.",
    owner: "Batch Operations",
    action: "Verify entitlement logs for paid-access tickets and auto-escalate missing access.",
  },
  "Batch Operations": {
    ask: "Can you change/fix my batch, planner, tests, validity, or learning workflow?",
    sentiment: "Operational frustration. Students want continuity and clarity more than apologies.",
    owner: "Batch Ops",
    action: "Separate true product bugs from academic operations and route each to the right queue.",
  },
  "Payment & Refund": {
    ask: "Where is my refund/payment confirmation, and why is money deducted without resolution?",
    sentiment: "Angry and trust-damaging. Payment ambiguity quickly turns into public complaint language.",
    owner: "Finance + Support",
    action: "Prioritize payment proof cases and add refund-stage visibility.",
  },
};

function StatusPill({ status }: { status: string }) {
  const controlled = status === "Closed" || status === "Resolved";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", controlled ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400")}>
      {status}
    </span>
  );
}

function EvidenceDrawer({ panel, onClose }: { panel: EvidencePanel; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="absolute bottom-0 right-0 top-0 w-full max-w-xl overflow-y-auto border-l border-border bg-background p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{panel.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{panel.subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close ticket evidence"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2">
          {panel.tickets.map((ticket) => (
            <div key={ticket.ticketId} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>#{ticket.ticketId}</span>
                  <span>{ticket.group}</span>
                  <span>{ticket.issueL1}</span>
                </div>
                <StatusPill status={ticket.status} />
              </div>
              <p className="text-sm font-semibold">{ticket.subject || "No subject"}</p>
              {ticket.description ? <p className="mt-2 text-xs leading-relaxed text-foreground/75">{ticket.description}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FreshdeskPage() {
  const { data, loading } = useLiveData<any>("/api/freshdesk", null);
  const [panel, setPanel] = useState<EvidencePanel | null>(null);
  if (loading || !data) return <PageSkeleton title="Freshdesk Intelligence" color="#534AB7" />;

  const stats = data.stats || {};
  const categories = data.categories || [];
  const urgentExamples = data.urgentExamples || [];
  const activeExamples = data.activeExamples || [];
  const topCategories = categories.slice(0, 5);

  const openEvidence = (title: string, subtitle: string, tickets: TicketExample[]) => setPanel({ title, subtitle, tickets });

  return (
    <>
      <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
        <motion.div variants={fadeUp as any}>
          <div className="flex items-center gap-3">
            <LifeBuoy className="h-5 w-5 text-purple" />
            <h1 className="text-2xl font-bold tracking-tight">Freshdesk Intelligence</h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">Current student asks, support sentiment, and the ticket evidence behind them.</p>
        </motion.div>

        <motion.section variants={fadeUp as any} className="rounded-2xl border border-purple/25 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple">What Is Going On</p>
          <h2 className="mt-2 text-xl font-bold">Students are mostly asking: “Where is my order, access, refund, or working study flow?”</h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The export shows {formatNumber(stats.totalTickets || 0)} tickets, but the actionable story is concentrated: store/logistics, app/video technical, access, batch operations, and payment/refund. Sentiment is not “neutral support volume”; it is frustration caused by blocked study time.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.activeTickets || 0)}</p><p className="text-[10px] text-muted-foreground">currently live tickets</p></div>
            <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{stats.controlledRate}%</p><p className="text-[10px] text-muted-foreground">closed/resolved</p></div>
            <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.uncategorizedTickets || 0)}</p><p className="text-[10px] text-muted-foreground">missing L1 routing</p></div>
            <button onClick={() => openEvidence("Live tickets", "Open ticket examples requiring queue ownership", activeExamples)} className="rounded-xl border border-amber-200 p-3 text-left hover:bg-amber-50/40 dark:border-amber-800"><p className="text-sm font-bold text-amber-700 dark:text-amber-300">Open live evidence</p><p className="mt-1 text-[10px] text-muted-foreground">Click to inspect</p></button>
          </div>
        </motion.section>

        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-3">
          {topCategories.map((category: any) => {
            const copy = ASK_COPY[category.name] || {
              ask: `Students are asking for help with ${category.name.toLowerCase()}.`,
              sentiment: "Needs human review from ticket verbatims.",
              owner: "Support Ops",
              action: "Sample tickets and define owner/action.",
            };
            return (
              <button key={category.name} onClick={() => openEvidence(category.name, `${formatNumber(category.count)} tickets · ${category.share}% of all tickets`, category.examples || [])} className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-purple/50">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-2">
                      <Tags className="h-4 w-4 text-purple" />
                      <h3 className="text-lg font-bold">{category.name}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{formatNumber(category.count)} tickets</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{copy.ask}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.sentiment}</p>
                  </div>
                  <div className="w-full shrink-0 rounded-xl border border-border bg-background/40 p-3 lg:w-72">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Owner / next action</p>
                    <p className="mt-1 text-xs font-bold">{copy.owner}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.action}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-purple">Read tickets <ChevronRight className="h-3 w-3" /></span>
                  </div>
                </div>
              </button>
            );
          })}
        </motion.section>

        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-red-200 bg-card p-5 dark:border-red-800/40">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h2 className="text-lg font-bold">Escalation language</h2>
            </div>
            <div className="space-y-2">
              {urgentExamples.slice(0, 8).map((ticket: TicketExample) => (
                <div key={ticket.ticketId} className="rounded-xl border border-border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">#{ticket.ticketId} · {ticket.group}</span>
                    <StatusPill status={ticket.status} />
                  </div>
                  <p className="text-xs font-medium leading-relaxed">{ticket.subject}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-purple" />
              <h2 className="text-lg font-bold">How to read support sentiment</h2>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Freshdesk does not contain star sentiment, so the sentiment cue comes from issue type and urgency language. Store delays, access failures, and payment ambiguity are negative because they block study progress. Closed status does not mean the student experience was good; it means the ticket workflow ended.
            </p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/30 p-4 dark:border-amber-800/40 dark:bg-amber-950/10">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Backend gap</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Add created time, first-response time, reopen count, priority, source, CSAT, and agent reply fields to convert this into SLA and sentiment recovery intelligence.</p>
            </div>
          </div>
        </motion.section>
      </motion.div>
      {panel ? <EvidenceDrawer panel={panel} onClose={() => setPanel(null)} /> : null}
    </>
  );
}
