"use client";

import { AlertTriangle, CheckCircle2, Circle, Clock3, Eye, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IncidentSentiment, IncidentSeverity, IncidentStatus, VerificationState } from "@/lib/incident-intelligence";

const severityStyles: Record<IncidentSeverity, string> = {
  critical: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
  high: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300",
  medium: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  low: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300",
};

const statusStyles: Record<IncidentStatus, string> = {
  detected: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  needs_validation: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  confirmed: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
  assigned: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300",
  in_progress: "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300",
  resolved: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300",
  monitoring: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-300",
  closed: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
};

const sentimentStyles: Record<IncidentSentiment, string> = {
  negative: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
  mixed: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
  positive: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300",
  neutral: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
};

const verificationStyles: Record<VerificationState, string> = {
  ai_generated: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300",
  human_verified: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300",
  needs_review: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
};

function label(value: string) {
  return value.replace(/_/g, " ");
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", severityStyles[severity])}>
      <AlertTriangle className="h-3 w-3" />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const Icon = status === "resolved" || status === "closed" ? CheckCircle2 : status === "monitoring" ? Eye : Clock3;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", statusStyles[status])}>
      <Icon className="h-3 w-3" />
      {label(status)}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: IncidentSentiment }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", sentimentStyles[sentiment])}>
      <Circle className="h-2 w-2 fill-current" />
      {sentiment}
    </span>
  );
}

export function VerificationBadge({ verification }: { verification: VerificationState }) {
  const Icon = verification === "human_verified" ? ShieldCheck : Sparkles;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", verificationStyles[verification])}>
      <Icon className="h-3 w-3" />
      {label(verification)}
    </span>
  );
}

export function ConfidenceIndicator({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "text-green-700" : pct >= 65 ? "text-amber-700" : "text-red-700";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", tone)}>
      <Radio className="h-3 w-3" />
      {pct}% confidence
    </span>
  );
}
