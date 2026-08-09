"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { VectorChannelSummary } from "@/components/dashboard/vector-channel-summary";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const PAGE_SIZE = 10;
const toneChip = {
  negative: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  positive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
} as const;

const categoryChip: Record<string, string> = {
  parent: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  employee: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  support: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  reputation: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

function displayDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function cleanContent(value?: string | null) {
  return String(value || "").replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

function postSummary(post: any) {
  const supplied = cleanContent(post.summary);
  if (supplied) return supplied;
  const text = cleanContent(post.text || post.title);
  const firstSentence = text.match(/^.+?[.!?](?:\s|$)/)?.[0] || text;
  return firstSentence.length > 230 ? `${firstSentence.slice(0, 227).trimEnd()}…` : firstSentence;
}

function latestTopic(post: any) {
  const text = `${post?.title || ""} ${post?.text || ""}`.toLowerCase();
  if (/sarrthi|acquisition|controlling stake|majority stake|upsc bet/.test(text)) return "PW's UPSC expansion through the Sarrthi IAS acquisition";
  if (/neet|student result|selection|future doctor|medical college/.test(text)) return "NEET results and student-success stories";
  if (/work culture|employee|termination|full settlement|management/.test(text)) return "employee experience and workplace culture";
  if (/refund|support|payment|customer care/.test(text)) return "refund and support experience";
  return cleanContent(post?.title || "the latest Physics Wallah discussion");
}

export default function LinkedInPage() {
  const { data, loading } = useLiveData<any>("/api/linkedin", null, { refreshMs: 60 * 60 * 1000, noStore: true });
  const [filter, setFilter] = useState<"all" | "negative" | "neutral" | "positive">("all");
  const [cat, setCat] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d">("90d");
  const [sort, setSort] = useState<"risk" | "recent">("risk");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<any | null>(null);

  const posts = useMemo(() => data?.posts || [], [data]);
  const summary = data?.summary;
  const stats = data?.stats || {};

  // Keep genuinely recent evidence visible even though the full evidence list
  // intentionally ranks critical posts first.
  const weeklyPosts = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return posts
      .filter((p: any) => p.publishedAt && new Date(p.publishedAt).getTime() >= since)
      .sort((a: any, b: any) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
      .slice(0, 4);
  }, [posts]);

  const latestCapturedPosts = useMemo(() => [...posts]
    .filter((post: any) => post.publishedAt)
    .sort((a: any, b: any) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, 2), [posts]);
  const latestDisplayPosts = weeklyPosts.length ? weeklyPosts : latestCapturedPosts;
  const latestTopics = Array.from(new Set(latestDisplayPosts.map(latestTopic))).slice(0, 2);
  const latestHasNegative = latestDisplayPosts.some((post: any) => post.sentiment === "negative");
  const latestNarrative = latestDisplayPosts.length
    ? `The latest captured LinkedIn conversation is ${latestHasNegative ? "mixed" : "positive-to-neutral"}, led by ${latestTopics.join(" and ")}.`
    : "No recent public LinkedIn evidence about Physics Wallah has been captured.";

  const filtered = useMemo(() => {
    const rangeDays = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const matches = posts.filter((p: any) => {
      const publishedAt = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
      const okTime = publishedAt >= since;
      const okS = filter === "all" || p.sentiment === filter;
      const okC = cat === "all" || p.category === cat;
      const okQ = query ? [p.text, p.author, p.title, p.summary].join(" ").toLowerCase().includes(query.toLowerCase()) : true;
      return okTime && okS && okC && okQ;
    });
    return matches.sort((a: any, b: any) => {
      if (sort === "recent") return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
      const rank = { negative: 0, neutral: 1, positive: 2 } as any;
      if (rank[a.sentiment] !== rank[b.sentiment]) return rank[a.sentiment] - rank[b.sentiment];
      return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
    });
  }, [posts, filter, cat, timeRange, sort, query]);

  if (loading) return <PageSkeleton title="LinkedIn Intelligence" color="#0a66c2" />;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const negRate = stats.negRate || 0;
  const overallTone = negRate >= 50 ? "predominantly critical" : negRate >= 30 ? "mixed" : "predominantly positive";
  const leadingRisk = summary?.topTheme && summary.topTheme !== "general discussion" ? String(summary.topTheme).toLowerCase() : "general discussion";
  const overallSentiment = stats.totalPosts
    ? `LinkedIn conversation is ${overallTone}, with a small critical cluster around ${leadingRisk}.`
    : "No recent public LinkedIn posts about PW have been captured yet.";
  const sentimentDetail = stats.totalPosts
    ? `${stats.positive || 0} positive · ${stats.neutral || 0} neutral · ${stats.negative || 0} critical · ${negRate}% critical of ${stats.totalPosts} recent PW posts`
    : "Waiting for public LinkedIn evidence.";

  return (
    <div className="min-h-screen rounded-[28px] bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_42%,#f8fafc_100%)] p-1 text-slate-950 dark:bg-none dark:text-slate-100">
      <motion.div className="space-y-6" variants={stagger as any} initial="hidden" animate="show">

        {/* ── Hero briefing ── */}
        <motion.section variants={fadeUp as any}>
          <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#020617_0%,#0b2a4a_34%,#0a66c2_68%,#041225_100%)] p-5 text-white shadow-[0_28px_90px_rgba(10,40,80,0.34)] md:p-7">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
            <div className="relative space-y-5">
              <div className="max-w-4xl">
                <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-4xl">{overallSentiment}</h1>
                <p className="mt-1 text-xs leading-5 text-slate-300 md:text-sm">{sentimentDetail}</p>
              </div>

              {/* sentiment split bar */}
              {stats.totalPosts ? (
                <div className="max-w-3xl">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div className="bg-emerald-400" style={{ width: `${(stats.positive / stats.totalPosts) * 100}%` }} />
                    <div className="bg-slate-300" style={{ width: `${(stats.neutral / stats.totalPosts) * 100}%` }} />
                    <div className="bg-red-400" style={{ width: `${(stats.negative / stats.totalPosts) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-slate-300">
                    <span className="text-emerald-300">● {stats.positive} positive</span>
                    <span className="text-slate-400">● {stats.neutral} neutral</span>
                    <span>● {stats.negative} negative</span>
                  </div>
                </div>
              ) : null}

            </div>
          </div>
        </motion.section>

        <motion.div variants={fadeUp as any}>
          <VectorChannelSummary
            platform="linkedin"
            accent="#0a66c2"
            fallbackHeadline={overallSentiment}
            fallbackSummary={sentimentDetail}
          />
        </motion.div>

        {/* ── Evidence filters ── */}
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Time range</span><select value={timeRange} onChange={(e) => { setTimeRange(e.target.value as "7d" | "30d" | "90d"); setPage(0); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0a66c2] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Sentiment</span><select value={filter} onChange={(e) => { setFilter(e.target.value as "all" | "negative" | "neutral" | "positive"); setPage(0); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0a66c2] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><option value="all">All sentiment</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Critical</option></select></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Critical category</span><select value={cat} onChange={(e) => { setCat(e.target.value); setPage(0); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0a66c2] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><option value="all">All categories</option>{(summary?.categories || []).map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Order by date</span><select value={sort} onChange={(e) => { setSort(e.target.value as "risk" | "recent"); setPage(0); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0a66c2] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><option value="risk">Critical posts first</option><option value="recent">Most recent first</option></select></label>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search author or content..." className="w-56 bg-transparent outline-none" />
            </label>
          </div>
        </motion.section>

        {/* ── Stat tiles ── */}
        <motion.section variants={fadeUp as any} className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Posts analysed", value: formatNumber(stats.totalPosts || 0), color: "#0a66c2" },
            { label: "Critical", value: formatNumber(stats.negative || 0), color: "#ef4444" },
            { label: "% critical", value: `${negRate}%`, color: "#f59e0b" },
            { label: "Positive", value: formatNumber(stats.positive || 0), color: "#10b981" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900">
              <p className="font-mono text-3xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            </div>
          ))}
        </motion.section>

        {/* ── Latest Exa evidence ── */}
        {latestDisplayPosts.length ? (
          <motion.section variants={fadeUp as any} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.05)] dark:border-blue-950/70 dark:from-blue-950/20 dark:to-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0a66c2]">Latest LinkedIn update · Exa</p>
                <h2 className="mt-2 max-w-4xl text-xl font-bold leading-snug">{latestNarrative}</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {weeklyPosts.length
                    ? `${weeklyPosts.length} public posts were detected inside the rolling seven-day window.`
                    : `No public post was detected inside the strict rolling seven-day window. Showing the newest captured evidence from ${displayDate(latestCapturedPosts[0]?.publishedAt)}.`}
                </p>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold", weeklyPosts.length ? "bg-[#0a66c2]/10 text-[#0a66c2]" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}>
                {weeklyPosts.length ? `${weeklyPosts.length} new signals` : "No newer post detected"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {latestDisplayPosts.map((p: any) => (
                <button key={`weekly-${p.id || p.url}`} type="button" onClick={() => setDetail(p)}
                  className="rounded-xl border border-slate-200/80 bg-white p-4 text-left transition-colors hover:border-[#0a66c2]/40 hover:bg-[#0a66c2]/5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", toneChip[p.sentiment as keyof typeof toneChip])}>{p.sentiment}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">{cleanContent(p.title || "LinkedIn post")}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{postSummary(p)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[10px] dark:border-slate-800">
                    <span className="min-w-0"><span className="block font-semibold uppercase tracking-wide text-slate-400">Author</span><span className="block truncate font-semibold text-slate-700 dark:text-slate-200">{p.author || "LinkedIn user"}</span></span>
                    <span><span className="block font-semibold uppercase tracking-wide text-slate-400">Published</span><span className="font-semibold text-slate-700 dark:text-slate-200">{displayDate(p.publishedAt)}</span></span>
                  </div>
                </button>
              ))}
            </div>
          </motion.section>
        ) : null}

        {/* ── Post list ── */}
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evidence · LinkedIn posts about PW</p>
              <h2 className="mt-1 text-lg font-bold">{filtered.length} matching posts · {sort === "recent" ? "newest first" : "critical posts first"}</h2>
            </div>
          </div>

          <div className="space-y-2">
            {pageItems.map((p: any, i: number) => {
              const rank = safePage * PAGE_SIZE + i + 1;
              return (
                <button key={p.id || i} type="button" onClick={() => setDetail(p)}
                  className="flex w-full gap-3 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-[#0a66c2]/40 hover:bg-[#0a66c2]/5 dark:border-slate-800">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-100 text-xs font-black text-slate-600 dark:from-slate-700 dark:to-slate-800 dark:text-slate-300">{String(rank).padStart(2, "0")}</div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", toneChip[p.sentiment as keyof typeof toneChip])}>{p.sentiment}</span>
                      {p.categoryLabel ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", categoryChip[p.category] || categoryChip.reputation)}>{p.categoryLabel}</span> : null}
                    </div>
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">{cleanContent(p.title || "LinkedIn post")}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300"><span className="font-semibold text-slate-700 dark:text-slate-200">Summary: </span>{postSummary(p)}</p>
                    <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-[10px] sm:grid-cols-3 dark:border-slate-800">
                      <span><span className="block font-semibold uppercase tracking-wide text-slate-400">Author</span><span className="block truncate font-semibold text-slate-700 dark:text-slate-200">{p.author || "LinkedIn user"}</span></span>
                      <span><span className="block font-semibold uppercase tracking-wide text-slate-400">Published</span><span className="font-semibold text-slate-700 dark:text-slate-200">{displayDate(p.publishedAt)}</span></span>
                      <span><span className="block font-semibold uppercase tracking-wide text-slate-400">Source</span><span className="inline-flex items-center gap-0.5 font-semibold text-[#0a66c2]">LinkedIn evidence <ExternalLink className="h-3 w-3" /></span></span>
                    </div>
                  </div>
                </button>
              );
            })}
            {!filtered.length ? <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 dark:border-slate-700">No posts match this filter.</div> : null}
          </div>

          {filtered.length > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="text-xs text-slate-500">Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-slate-700"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                <span className="text-xs text-slate-500">{safePage + 1} / {pageCount}</span>
                <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-slate-700">Next <ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ) : null}
        </motion.section>

        <p className="pb-4 text-center text-[11px] text-slate-400">Source: Exa web search over public LinkedIn posts · {data?.generatedAt ? `generated ${displayDate(data.generatedAt)}` : ""}</p>
      </motion.div>

      {/* ── Detail modal ── */}
      <AnimatePresence>
        {detail ? (
          <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative m-0 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:m-4 md:rounded-3xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", toneChip[detail.sentiment as keyof typeof toneChip])}>{detail.sentiment}</span>
                  {detail.categoryLabel ? <span className={cn("ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", categoryChip[detail.category] || categoryChip.reputation)}>{detail.categoryLabel}</span> : null}
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0a66c2]">LinkedIn evidence</p>
                  <h3 className="mt-1 text-lg font-bold leading-snug text-slate-900 dark:text-slate-100">{cleanContent(detail.title || "LinkedIn post")}</h3>
                </div>
                <button onClick={() => setDetail(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/70 sm:grid-cols-3">
                <div><p className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">Author</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{detail.author || "LinkedIn user"}</p></div>
                <div><p className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">Published</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{displayDate(detail.publishedAt)}</p></div>
                <div className="col-span-2 sm:col-span-1"><p className="font-semibold uppercase tracking-wide text-[10px] text-slate-400">Source</p><p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">Public LinkedIn post</p></div>
              </div>
              <section className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-950/60 dark:bg-blue-950/20">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0a66c2]">Summary</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{postSummary(detail)}</p>
              </section>
              <section>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Post content</p>
                <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">{cleanContent(detail.text) || "The source did not provide the full post text."}</p>
              </section>
              {detail.url ? (
                <a href={detail.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#08529c]">
                  Open on LinkedIn <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
