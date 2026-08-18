"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Database, Sparkles } from "lucide-react";
import { formatNumber } from "@/lib/utils";

type SummaryPayload = {
  headline?: string;
  summary?: string;
  what_is_happening?: string;
  why_it_matters?: string;
  recommended_action?: string;
  key_findings?: Array<{ label?: string; count?: number; interpretation?: string }>;
  top_theme?: string;
  risk_level?: string;
  source_count?: number;
  generated_at?: string;
  window_label?: string;
  confidence_note?: string;
  sentiment?: { positive?: number; neutral?: number; negative?: number };
};

type VectorChannelSummaryProps = {
  platform: "playstore" | "linkedin" | "youtube" | "freshdesk" | "reddit";
  fallbackHeadline: string;
  fallbackSummary: string;
  accent?: string;
};

const FALLBACK_CONTEXT: Record<VectorChannelSummaryProps["platform"], { why: string; action: string }> = {
  playstore: {
    why: "Repeated low-rating feedback can reveal release-specific friction and affect store conversion.",
    action: "Inspect low-rating comments by app version and assign the dominant reproducible issue to Product and Engineering.",
  },
  linkedin: {
    why: "Critical professional-network posts can influence employer, parent, investor, and partner perception.",
    action: "Review the highest-engagement critical posts and decide whether Communications should respond, clarify, or monitor.",
  },
  youtube: {
    why: "High-reach creator narratives can spread faster than corrections from owned channels.",
    action: "Review negative videos and their comments together before choosing a PR or content response.",
  },
  freshdesk: {
    why: "Unresolved support demand represents blocked student journeys, not merely negative sentiment.",
    action: "Route the largest unresolved ticket cluster to its operational owner and track resolution separately from volume.",
  },
  reddit: {
    why: "Student-led discussion can expose recurring questions and frustration before formal escalation.",
    action: "Inspect the most engaged negative threads and route recurring product or support problems to the owning team.",
  },
};

export function VectorChannelSummary({ platform, fallbackHeadline, fallbackSummary, accent = "#534AB7" }: VectorChannelSummaryProps) {
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [isVector, setIsVector] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vector-summary?platform=${encodeURIComponent(platform)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (!cancelled && json?.live && json?.summary) {
          setPayload(json.summary);
          setIsVector(true);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [platform]);

  const summary = payload || {
    headline: fallbackHeadline,
    summary: fallbackSummary,
    what_is_happening: fallbackSummary,
    why_it_matters: FALLBACK_CONTEXT[platform].why,
    recommended_action: FALLBACK_CONTEXT[platform].action,
  };
  const sentiment = summary.sentiment;
  const total = Number(sentiment?.positive || 0) + Number(sentiment?.neutral || 0) + Number(sentiment?.negative || 0);
  const positiveShare = total ? Math.round((Number(sentiment?.positive || 0) / total) * 100) : 0;
  const neutralShare = total ? Math.round((Number(sentiment?.neutral || 0) / total) * 100) : 0;
  const negativeShare = Math.max(0, 100 - positiveShare - neutralShare);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-1" style={{ background: accent }} />
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {isVector ? <Database className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isVector ? "Qdrant channel synthesis" : "Channel summary"}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {summary.risk_level ? <span className="rounded-full bg-muted px-2 py-1 font-semibold capitalize">{summary.risk_level} risk</span> : null}
            {isVector ? <span>{formatNumber(summary.source_count || 0)} indexed signals</span> : <span>Live API fallback</span>}
          </div>
        </div>
        <h2 className="mt-3 max-w-4xl text-xl font-semibold leading-snug">{summary.headline}</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-background/50 p-4 md:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">What is happening</p>
            <p className="mt-2 text-sm font-medium leading-relaxed">{summary.what_is_happening || summary.summary}</p>
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Why it matters</p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">{summary.why_it_matters || "Use the evidence below to decide whether this needs product, support, or communications follow-up."}</p>
          </div>
        </div>

        {summary.recommended_action ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
            <p><span className="font-semibold">Recommended next move:</span> {summary.recommended_action}</p>
          </div>
        ) : null}

        {summary.key_findings?.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {summary.key_findings.slice(0, 3).map((finding, index) => (
              <div key={`${finding.label || "finding"}-${index}`} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold">{finding.label || "Retrieved pattern"}</p>
                  {Number.isFinite(Number(finding.count)) ? <span className="font-mono text-sm font-bold">{formatNumber(Number(finding.count))}</span> : null}
                </div>
                {finding.interpretation ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{finding.interpretation}</p> : null}
              </div>
            ))}
          </div>
        ) : summary.top_theme ? <p className="mt-3 text-xs"><span className="text-muted-foreground">Leading retrieved theme:</span> <strong>{summary.top_theme}</strong></p> : null}
        {total > 0 ? (
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`${positiveShare}% positive, ${neutralShare}% neutral, ${negativeShare}% negative`} role="img">
              <span className="bg-emerald-400" style={{ width: `${positiveShare}%` }} />
              <span className="bg-slate-300" style={{ width: `${neutralShare}%` }} />
              <span className="bg-slate-950" style={{ width: `${negativeShare}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-muted-foreground">
              <span>{formatNumber(sentiment?.positive || 0)} positive</span>
              <span>{formatNumber(sentiment?.neutral || 0)} neutral</span>
              <span>{formatNumber(sentiment?.negative || 0)} negative</span>
            </div>
          </div>
        ) : null}
        {(summary.window_label || summary.confidence_note) ? (
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            {summary.window_label ? `Evidence window: ${summary.window_label}. ` : ""}
            {summary.confidence_note || ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
