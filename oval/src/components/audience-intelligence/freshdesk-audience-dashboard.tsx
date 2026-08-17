"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bell, ChevronLeft, ChevronRight, LifeBuoy, Search, Sparkles, TrendingUp, X } from "lucide-react";
import { OvalLoadingSkeleton } from "@/components/ui/page-skeleton";
import { openPwYtVerse } from "@/lib/youtube-navigation";
import { AuthProfileMenu } from "@/components/auth/auth-profile-menu";

type Period = "today" | "yesterday" | "7d" | "30d" | "month";
type Ticket = { ticketId: string; status: string; group: string; category?: string; subject: string; description: string };
type Category = { name: string; count: number; share: number; examples?: Ticket[] };
const COMMENTS_PER_PAGE = 10;

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "month", label: "Month Wise" },
];

const NAV = ["playstore", "freshdesk", "linkedin", "x", "instagram", "youtube"] as const;
const LABELS: Record<(typeof NAV)[number], string> = { playstore: "Play Store", freshdesk: "Fresh Desk", linkedin: "LinkedIn", x: "X", instagram: "Instagram", youtube: "YouTube" };

const ISSUE_COPY: Record<string, { summary: string; pm: string; em: string; action: string }> = {
  "Uncategorized / Needs Routing": { summary: "Tickets have enough learner context to require action, but lack a dependable L1/L2 route.", pm: "Support Operations", em: "Routing Automation EM", action: "Classify and route the oldest unassigned cohort before adding new taxonomy." },
  "App & Video Technical": { summary: "Playback, loading, device and app reliability failures are interrupting live study journeys.", pm: "Ashutosh Shukla", em: "App Platform EM", action: "Bracket by app version, device and playback surface, then link support cases to one incident." },
  "Store & Logistics": { summary: "Book, kit, tracking and delivery uncertainty is creating exam-time anxiety for learners.", pm: "Commerce Product", em: "Commerce & Logistics EM", action: "Create overdue-order cohorts and expose proactive delivery status." },
  "Access & Entitlement": { summary: "Paid learners cannot reliably see batches, subscriptions or content they expect to access.", pm: "Ashutosh Shukla", em: "Identity & Entitlements EM", action: "Trace purchase-to-entitlement sync and fast-track blocked paid access." },
  "Payment & Refund": { summary: "Payment confirmation, deductions and refund ambiguity are producing high-trust-risk contacts.", pm: "Payments Product", em: "Payments EM", action: "Show refund stage and accountable resolution time on every financial case." },
  "Batch Operations": { summary: "Batch changes, validity, tests and learning-workflow requests need operational ownership.", pm: "Learning Product", em: "Learning Platform EM", action: "Separate academic operations from reproducible platform defects." },
};

const fmt = (value: number) => new Intl.NumberFormat("en-IN", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0);
const clean = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

function snapshotInPeriod(date: string | undefined, period: Period) {
  if (period === "month") return true;
  if (!date) return false;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  if (period === "yesterday") { start.setDate(start.getDate() - 1); const end = new Date(start); end.setDate(end.getDate() + 1); return value >= start && value < end; }
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  return value >= start;
}

export function FreshdeskAudienceDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [semantic, setSemantic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("30d");
  const [selected, setSelected] = useState<Category | null>(null);
  const [commentPage, setCommentPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/freshdesk", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error("Freshdesk feed unavailable"); return response.json(); }),
      fetch("/api/vector-summary?platform=freshdesk", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null),
    ]).then(([freshdesk, semanticData]) => {
      if (!cancelled) { setData(freshdesk); setSemantic(semanticData); }
    }).catch((reason) => { if (!cancelled) setError(reason.message || "Freshdesk feed unavailable"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(() => {
    if (!data) return null;
    const categories: Category[] = (data.categories || []).slice(0, 6);
    const snapshotIncluded = snapshotInPeriod(data.dataWindow?.createdAtMax, period);
    const factor = snapshotIncluded ? 1 : 0;
    const issues = categories.map((category) => ({
      ...category,
      count: Math.round(category.count * factor),
      share: snapshotIncluded ? category.share : 0,
      examples: snapshotIncluded ? category.examples : [],
    }));
    const stats = data.stats || {};
    const total = Math.round(Number(stats.totalTickets || 0) * factor);
    const active = Math.round(Number(stats.activeTickets || 0) * factor);
    const unassigned = Math.round(Number((data.groups || []).find((group: any) => group.name === "Unassigned")?.tickets || 0) * factor);
    return { issues, total, active, unassigned, snapshotIncluded, stats };
  }, [data, period]);

  const comments = selected?.examples || [];
  const commentPages = Math.max(1, Math.ceil(comments.length / COMMENTS_PER_PAGE));
  const visibleComments = comments.slice(commentPage * COMMENTS_PER_PAGE, (commentPage + 1) * COMMENTS_PER_PAGE);
  useEffect(() => { setCommentPage(0); }, [selected?.name, period]);
  const openIssue = (issue: Category) => { setSelected(issue); setCommentPage(0); };

  return <main className="audience-studio source-freshdesk fd-studio">
    <div className="ai-ambient ai-ambient-one" /><div className="ai-ambient ai-ambient-two" />
    <header className="ai-topbar">
      <button className="ai-brand-group" onClick={() => router.replace("/audience-intelligence/overview")}><span className="ai-brand-mark">O</span><span><strong>OVAL</strong><small>AUDIENCE INTELLIGENCE</small></span></button>
      <nav className="ai-source-nav" aria-label="Intelligence channels"><button onClick={() => router.replace("/audience-intelligence/overview")}>Overview</button><button onClick={() => router.replace("/shield")}>Shield</button>{NAV.map((source) => <button key={source} className={source === "freshdesk" ? "active" : ""} onClick={() => source === "youtube" ? openPwYtVerse() : router.replace(`/audience-intelligence/${source}`)}>{LABELS[source]}</button>)}</nav>
      <div className="ai-top-actions"><div className="ai-search"><Search size={16} /></div><button className="ai-icon-button ai-notification" aria-label="Freshdesk alerts"><Bell size={16} /></button><AuthProfileMenu /></div>
    </header>

    {loading ? <OvalLoadingSkeleton embedded /> : error || !model ? <section className="ai-loading"><p>{error || "Freshdesk data is unavailable."}</p><button onClick={() => location.reload()}>Retry</button></section> : <>
      <section className="fd-hero">
        <div><p className="ai-eyebrow">SUPPORT EXPERIENCE · FRESHDESK</p><h1>What every ticket<br /><em>is trying to tell you.</em></h1><p>{semantic?.summary?.what_is_happening || "Understand the biggest learner blockers, the evidence behind them and the product-engineering owner responsible for recovery."}</p></div>
        <div className="fd-csat fd-ssat"><span><LifeBuoy size={18} /> SSAT Score</span><strong>3.31</strong></div>
      </section>

      <section className="ai-filter-row fd-filter-row"><span>Ticket window</span><div className="ai-filters">{PERIODS.map((item) => <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => { setPeriod(item.id); setSelected(null); }}>{item.label}</button>)}</div><p><strong>{fmt(model.total)}</strong> tickets</p></section>
      <p className="fd-window-note">Filters use the latest available export day ending {data.dataWindow?.createdAtMax || "23 Jul 2026"}. This snapshot contains no separate previous-day export.</p>

      <section className="fd-metrics">
        <article><span>Tickets captured</span><strong>{fmt(model.total)}</strong><p>{model.snapshotIncluded ? "Queue volume in the selected evidence window." : "No export was captured for this exact window."}</p></article>
        <article><span>Active queue</span><strong>{fmt(model.active)}</strong><p>{model.total ? `${(model.active / model.total * 100).toFixed(1)}% requires operational follow-through.` : "Select another window to inspect the queue."}</p></article>
        <article><span>Unassigned</span><strong>{fmt(model.unassigned)}</strong><p>Tickets without an accountable support group.</p></article>
      </section>

      <section className="ai-section-block fd-issues">
        <div className="ai-section-heading"><div><p className="ai-eyebrow">TOP ISSUE CLUSTERS</p><h2>What learners need resolved</h2></div><p>Count, share, summary and mapped PM/EM</p></div>
        <div className="fd-issue-grid">{model.issues.slice(0, 5).map((issue: Category, index: number) => { const copy = ISSUE_COPY[issue.name] || ISSUE_COPY["Uncategorized / Needs Routing"]; return <button key={issue.name} onClick={() => openIssue(issue)}><header><span>0{index + 1}</span><ArrowUpRight size={15} /></header><h3>{issue.name}</h3><p>{copy.summary}</p><div className="fd-issue-volume"><strong>{fmt(issue.count)}</strong><span>{issue.share.toFixed(1)}% of queue</span></div><div className="fd-owner-pair"><span><small>PM</small>{copy.pm}</span><span><small>EM</small>{copy.em}</span></div></button>; })}</div>
      </section>

      <section className="fd-emerging fd-emerging-bottom"><header><span><TrendingUp size={17} /> Emerging trends <b>BETA</b></span><small>Directional prediction</small></header><h2>What may grow next</h2><p>Predictions are based on the selected issue mix and unresolved queue pressure—not a guaranteed forecast.</p>{model.snapshotIncluded ? <div><article><span>01</span><div><strong>Routing debt will remain the dominant operational load</strong><p>{model.issues[0]?.share || 0}% of the selected queue still needs dependable categorisation.</p></div><i>High likelihood</i></article><article><span>02</span><div><strong>App and video incidents may keep creating repeat contacts</strong><p>{model.issues.find((item: Category) => item.name === "App & Video Technical")?.count || 0} selected tickets sit in the technical bracket.</p></div><i>Watch</i></article><article><span>03</span><div><strong>Paid-access and payment cases carry escalation risk</strong><p>Entitlement and money-related issues combine operational blockage with trust loss.</p></div><i>Escalation</i></article></div> : <div className="ai-empty"><p>No directional prediction is available without tickets in the selected window.</p></div>}</section>

    </>}

    {selected && <div className="ai-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}><aside className="ai-detail-drawer fd-drawer"><div className="ai-drawer-head"><div><p className="ai-eyebrow">FRESHDESK ISSUE</p><h2>{selected.name}</h2></div><button onClick={() => setSelected(null)}><X size={20} /></button></div><div className="ai-drawer-summary"><div><strong>{fmt(selected.count)}</strong><span>tickets</span></div><div><strong>{selected.share.toFixed(1)}%</strong><span>queue share</span></div></div><section className="ai-drawer-description"><span>Issue summary</span><p>{(ISSUE_COPY[selected.name] || ISSUE_COPY["Uncategorized / Needs Routing"]).summary}</p></section><div className="fd-drawer-action"><Sparkles size={15} /><div><strong>Recommended action</strong><p>{(ISSUE_COPY[selected.name] || ISSUE_COPY["Uncategorized / Needs Routing"]).action}</p></div></div><div className="ai-comment-list"><div className="ai-comment-list-heading"><div><h3>Ticket evidence</h3><p>Showing {comments.length ? commentPage * COMMENTS_PER_PAGE + 1 : 0}–{Math.min((commentPage + 1) * COMMENTS_PER_PAGE, comments.length)} of {fmt(comments.length)}</p></div><span>{COMMENTS_PER_PAGE} per page</span></div>{comments.length ? visibleComments.map((ticket) => <article className="ai-comment-compact" key={ticket.ticketId}><header><div><strong>Ticket #{ticket.ticketId}</strong><small>{ticket.group}</small></div><span>{ticket.status}</span></header><p className="ai-comment-title">{clean(ticket.subject)}</p><p className="ai-comment-preview">{clean(ticket.description).length > 190 ? `${clean(ticket.description).slice(0, 189).trim()}…` : clean(ticket.description)}</p><footer><small>{ticket.group}</small><small>Ticket #{ticket.ticketId}</small></footer></article>) : <article className="ai-comment-empty"><p>No ticket evidence falls inside this selected date window. Choose a broader filter to inspect this stable issue topic.</p></article>}</div>{comments.length > COMMENTS_PER_PAGE && <nav className="ai-comment-pagination" aria-label="Ticket evidence pages"><button className="page-arrow" aria-label="Previous page" disabled={commentPage === 0} onClick={() => setCommentPage((page) => Math.max(0, page - 1))}><ChevronLeft size={15} /></button>{Array.from({ length: commentPages }, (_, page) => <button key={page} className={`page-number ${commentPage === page ? "active" : ""}`} onClick={() => setCommentPage(page)}>{page + 1}</button>)}<button className="page-arrow" aria-label="Next page" disabled={commentPage >= commentPages - 1} onClick={() => setCommentPage((page) => Math.min(commentPages - 1, page + 1))}><ChevronRight size={15} /></button></nav>}</aside></div>}
  </main>;
}
