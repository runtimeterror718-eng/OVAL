"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, ChevronRight, LifeBuoy, MessageCircle, ShieldAlert, Smartphone, Target } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

type Source = "freshdesk" | "reddit" | "playstore" | "linkedin";

const SOURCES: Record<Source, { label: string; href: string; color: string; icon: any }> = {
  freshdesk: { label: "Freshdesk", href: "/freshdesk", color: "var(--mixpanel-accent-cool)", icon: LifeBuoy },
  reddit: { label: "Reddit", href: "/reddit", color: "var(--mixpanel-warning)", icon: MessageCircle },
  playstore: { label: "Play Store", href: "/playstore", color: "var(--mixpanel-success)", icon: Smartphone },
  linkedin: { label: "LinkedIn", href: "/linkedin", color: "var(--mixpanel-accent-warm)", icon: BriefcaseBusiness },
};

const PATTERNS = [
  {
    id: "learning",
    title: "The learning journey is the biggest student conversation",
    why: "Students discuss batches, teachers, course flow and academic outcomes more than any other theme. This is both PW’s strongest asset and the place where expectation gaps become visible fastest.",
    owner: "Academic Operations",
    action: "Set a weekly batch-health review for timetable changes, faculty changes, missing content and assessment access; publish proactive updates inside the learner journey.",
    test: /batch|course|teacher|faculty|lecture|learning|test|dpp|module|content|mentor|syllabus|leaderboard/i,
  },
  {
    id: "access",
    title: "Paid access must work as one joined-up journey",
    why: "Login, OTP, video, batch visibility and app performance are appearing across support, student discussion and reviews. A student experiences these as one broken promise—not separate teams or systems.",
    owner: "Product Reliability + Support",
    action: "Create a single paid-access diagnostic: confirm payment → entitlement → content visibility → device/app health, with one escalation owner and a clear student status message.",
    test: /access|login|otp|video|app|buffer|load|crash|not working|blocked|entitlement|account|chapter/i,
  },
  {
    id: "service",
    title: "Service recovery is a product trust issue",
    why: "Refund, payment, delivery and support language is moving from private support queues into public reviews and LinkedIn. The operational fix and the reputational fix need to be connected.",
    owner: "CX Operations + Finance",
    action: "Expose refund, payment and delivery status before a student has to ask. Escalate repeat-contact cases and publish a recovery message when an issue is resolved.",
    test: /refund|payment|paid|money|delivery|order|book|support|customer care|misled|complaint|grievance/i,
  },
  {
    id: "trust",
    title: "Public trust needs a distinct response track",
    why: "LinkedIn criticism is low-volume relative to student channels, but it is durable and highly visible. Parent, employee and reputation narratives should be investigated separately from routine support tickets.",
    owner: "Leadership + People Team",
    action: "Maintain an evidence-reviewed response protocol: validate the claim, identify the responsible function, decide whether public acknowledgement is appropriate, and track closure.",
    test: /work.?culture|employee|hr|termination|toxic|parent|reputation|scam|fraud|trust|leadership/i,
  },
] as const;

function itemText(item: any) {
  return [item?.label, item?.name, item?.title, item?.subject, item?.description, item?.text, item?.snippet, item?.summary, item?.categoryLabel].filter(Boolean).join(" ");
}

function trim(value: string, max = 150) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function SignalPill({ source, value, label }: { source: Source; value: number; label: string }) {
  const meta = SOURCES[source]; const Icon = meta.icon;
  return <Link href={meta.href} className="mix-control flex items-center gap-2 px-3 py-2 transition">
    <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
    <span className="text-xs font-semibold">{meta.label}</span>
    <span className="ml-auto text-xs font-bold tabular-nums">{formatNumber(value)}</span>
    <span className="hidden text-[10px] text-muted-foreground lg:inline">{label}</span>
  </Link>;
}

export default function CrossPlatformPage() {
  const freshdesk = useLiveData<any>("/api/freshdesk", null);
  const reddit = useLiveData<any>("/api/reddit", null);
  const playstore = useLiveData<any>("/api/playstore", null, { refreshMs: 60 * 60 * 1000, noStore: true });
  const linkedin = useLiveData<any>("/api/linkedin", null, { refreshMs: 60 * 60 * 1000, noStore: true });
  const loading = [freshdesk, reddit, playstore, linkedin].some((item) => item.loading);

  const model = useMemo(() => {
    const fStats = freshdesk.data?.stats || {};
    const fClusters = freshdesk.data?.clusters || [];
    const rClusters = reddit.data?.clusters || [];
    const rPosts = reddit.data?.posts || [];
    const lStats = linkedin.data?.stats || {};
    const lSummary = linkedin.data?.summary || {};
    const lPosts = linkedin.data?.posts || [];
    const app = playstore.data?.apps?.[playstore.data?.primaryPackage] || {};
    const pThemes = app.themes || [];
    const pReviews = playstore.data?.liveReviews || app.criticalReviews || [];

    const matching = (items: any[], test: RegExp) => items.filter((item) => test.test(itemText(item)));
    const count = (items: any[]) => items.reduce((total, item) => total + Number(item.count || item.mentions || 1), 0);
    const priorities = PATTERNS.map((pattern) => {
      const fs = matching(fClusters, pattern.test);
      const rd = matching(rClusters, pattern.test);
      const ps = matching(pThemes, pattern.test);
      const li = matching(lPosts, pattern.test);
      const sources = [fs.length > 0, rd.length > 0, ps.length > 0, li.length > 0].filter(Boolean).length;
      const evidence = [
        fs[0] && { source: "freshdesk" as const, title: fs[0].label, count: count(fs), quote: itemText(fs[0].examples?.[0] || fs[0]) },
        rd[0] && { source: "reddit" as const, title: rd[0].name, count: count(rd), quote: String(rd[0].evidence?.[0] || itemText(rd[0])) },
        ps[0] && { source: "playstore" as const, title: ps[0].name, count: count(ps), quote: itemText(ps[0].examples?.[0] || ps[0]) },
        li[0] && { source: "linkedin" as const, title: li[0].categoryLabel || "Public discussion", count: li.length, quote: itemText(li[0]) },
      ].filter(Boolean) as { source: Source; title: string; count: number; quote: string }[];
      return { ...pattern, sources, evidence };
    });
    return { fStats, fClusters, rClusters, rPosts, lStats, lSummary, lPosts, app, pThemes, pReviews, priorities };
  }, [freshdesk.data, reddit.data, playstore.data, linkedin.data]);

  if (loading) return <PageSkeleton title="Cross-platform intelligence" color="var(--mixpanel-accent-cool)" />;
  const { fStats, rClusters, lStats, lSummary, app, priorities } = model;
  const topStudentTheme = rClusters[0];
  const accessFreshdesk = model.fClusters.filter((cluster: any) => /login|otp|access|video/i.test(itemText(cluster))).reduce((sum: number, cluster: any) => sum + Number(cluster.count || 0), 0);
  const publicRisk = Number(lStats.negative || 0);

  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
    <section className="rounded-[var(--mixpanel-radius-md)] bg-[var(--mixpanel-bg-surface)] p-8 text-[var(--btn-primary-text)] ring-1 ring-[var(--token-c84791c8-4c0b-4859-a261-4a6a94ff7efc)] md:p-10">
      <p className="mix-kicker flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4" /> Cross-platform intelligence · leadership brief</p>
      <h1 className="mix-heading mt-4 max-w-5xl text-4xl leading-tight md:text-6xl">PW’s core strength—learning—needs a more reliable post-enrolment experience around it.</h1>
      <p className="mt-4 max-w-4xl text-sm leading-6 text-[var(--token-61930e01-5681-4131-8dc8-84bf4136e86b)] md:text-base">Student conversation remains centred on batches, faculty and learning. The risk is not one isolated complaint: access, support and fulfilment friction can turn a strong academic experience into a trust problem.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="mix-panel p-4"><p className="mix-heading text-3xl">{formatNumber(topStudentTheme?.mentions || 0)}</p><p className="mt-1 text-xs text-muted-foreground">Reddit mentions in “{topStudentTheme?.name || "student discussion"}”</p></div>
        <div className="mix-panel p-4"><p className="mix-heading text-3xl">{formatNumber(accessFreshdesk)}</p><p className="mt-1 text-xs text-muted-foreground">Freshdesk access/video tickets in the snapshot</p></div>
        <div className="mix-panel p-4"><p className="mix-heading text-3xl">{publicRisk} / {formatNumber(lStats.totalPosts || 0)}</p><p className="mt-1 text-xs text-muted-foreground">critical LinkedIn posts in the 90-day window</p></div>
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">1. Executive priorities</p><h2 className="mt-1 text-2xl font-bold tracking-tight">What needs a decision now</h2></div><p className="hidden max-w-sm text-right text-xs leading-5 text-muted-foreground md:block">A priority is stronger when the same underlying experience appears in more than one channel.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {priorities.map((priority, index) => <article key={priority.id} className={cn("rounded-2xl border bg-card p-5", priority.sources >= 2 ? "border-blue-200 dark:border-blue-900/60" : "border-border")}>
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{index + 1}</span><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", priority.sources >= 2 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>{priority.sources >= 2 ? `${priority.sources} channels agree` : "Watch closely"}</span></div><ChevronRight className="h-4 w-4 text-slate-400" /></div>
          <h3 className="mt-4 text-xl font-bold leading-tight">{priority.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{priority.why}</p>
          <div className="mt-4 rounded-xl border border-border bg-slate-50/70 p-3 dark:bg-slate-900/30"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Decision / owner</p><p className="mt-1 text-sm font-semibold">{priority.owner}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{priority.action}</p></div>
        </article>)}
      </div>
    </section>

    <section>
      <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">2. Evidence matrix</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Where the channels agree—and what they mean</h2></div>
      <div className="space-y-3">{priorities.map((priority) => <article key={priority.id} className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">{priority.title}</h3><p className="mt-1 text-xs text-muted-foreground">Read volume within each source, not as a direct comparison between platforms.</p></div><span className="text-xs font-bold text-blue-600">{priority.sources} evidence sources</span></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{priority.evidence.length ? priority.evidence.map((evidence) => { const meta = SOURCES[evidence.source]; const Icon = meta.icon; return <Link key={evidence.source} href={meta.href} className="rounded-xl border border-border p-3 transition hover:border-blue-300"><div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" style={{ color: meta.color }} /><span className="text-xs font-bold">{meta.label}</span><span className="ml-auto text-xs font-bold tabular-nums">{formatNumber(evidence.count)}</span></div><p className="mt-2 text-xs font-semibold">{evidence.title}</p><p className="mt-1 line-clamp-3 text-[11px] leading-4 text-muted-foreground">{trim(evidence.quote)}</p></Link>; }) : <p className="text-sm text-muted-foreground">No matching evidence is currently loaded.</p>}</div></article>)}</div>
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/60 dark:bg-amber-950/15"><div className="flex items-center gap-2 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-5 w-5" /><p className="font-bold">3. Fix the measurement before judging queue volume</p></div><h2 className="mt-3 text-xl font-bold">{formatNumber(fStats.uncategorizedTickets || 0)} Freshdesk tickets lack reliable L1 routing.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The support export is valuable as an operational snapshot, but many tickets are automated, bridged or uncategorized. Clean this layer before using it for product ranking or team performance decisions.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><SignalPill source="freshdesk" value={Number(fStats.activeTickets || 0)} label="active tickets" /><SignalPill source="linkedin" value={Number(lSummary.themes?.[0]?.count || 0)} label={lSummary.themes?.[0]?.label || "top critical theme"} /></div></div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/15"><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /><p className="font-bold">4. Keep the good visible</p></div><h2 className="mt-3 text-xl font-bold">Learning quality is a real strength to protect.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Play Store’s largest written-review theme is teaching and learning, while Reddit also carries substantial faculty and content goodwill. Improvements should preserve that strength, not only react to negative volume.</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><SignalPill source="playstore" value={Number(app.themes?.[0]?.mentions || 0)} label={app.themes?.[0]?.name || "top theme"} /><SignalPill source="reddit" value={Number(model.rClusters?.[1]?.mentions || 0)} label={model.rClusters?.[1]?.name || "student goodwill"} /></div></div>
    </section>

    <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-blue-600" /><h2 className="text-lg font-bold">How to use this page</h2></div><div className="mt-4 grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3"><p><b className="text-foreground">Product & Academic Ops:</b> use the first two priorities to decide what should be fixed in the learner journey.</p><p><b className="text-foreground">CX & Finance:</b> use service signals to reduce repeat contact and make recovery visible.</p><p><b className="text-foreground">Leadership & People:</b> review public trust claims with evidence before responding or assigning accountability.</p></div></section>
  </div>;
}
