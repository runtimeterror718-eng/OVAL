"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ExternalLink, MessageCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import RAGInsight from "@/components/dashboard/rag-insight";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { VectorChannelSummary } from "@/components/dashboard/vector-channel-summary";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const ORANGE = "#FF5700";
const PAGE_SIZE = 10;

const WINDOW_DAYS = 14;

// Lightweight theme tagging — keyword buckets over post text. Each carries a
// tone so the briefing can read the mood of the emerging conversation.
const THEMES: { label: string; tone: "positive" | "negative" | "neutral"; test: RegExp }[] = [
  { label: "Founder goodwill / CSR (Alakh Pandey)", tone: "positive", test: /alakh|pandey|government school|govt school|library|donat|jharkhand|charity|free (library|school)/i },
  { label: "Access, login & blocked accounts", tone: "negative", test: /block|access|login|not working|no result|can't open|cant open|error/i },
  { label: "Refund & payment issues", tone: "negative", test: /refund|payment|paid|money|deducted|charge|fees|not returned/i },
  { label: "Discount codes & coupons", tone: "neutral", test: /discount|coupon|\bcode\b/i },
  { label: "Resale & piracy (modules / lectures)", tone: "neutral", test: /selling|sell |buy|module|pirated|tg channel|telegram|second hand|dm me/i },
  { label: "Teacher & batch advice", tone: "neutral", test: /teacher|sir|mam|faculty|better|worth|arjuna|lakshya|yakeen|prayas|vidyapeeth|saarthi|which batch/i },
  { label: "Marks, motivation & study logs", tone: "neutral", test: /marks|test|rank|day -|marathon|motivation|score|attempt/i },
];

function themeOf(p: any): typeof THEMES[number] | null {
  const text = [p.title, p.snippet].join(" ");
  return THEMES.find((t) => t.test.test(text)) || null;
}

// Emerging-topic ranking: total engagement (upvotes + comments) per theme, not
// just post count — a small burst of high-engagement posts is what "emerging" means.
function rankThemes(posts: any[]) {
  const agg: Record<string, { count: number; engagement: number; tone: string }> = {};
  for (const p of posts) {
    const t = themeOf(p);
    if (!t) continue;
    const eng = (Number(p.upvotes) || 0) + (Number(p.comments) || 0) * 2;
    (agg[t.label] ||= { count: 0, engagement: 0, tone: t.tone }).count += 1;
    agg[t.label].engagement += eng;
  }
  return Object.entries(agg)
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.engagement - a.engagement);
}

function postScore(p: any) {
  // Rank by engagement, with negative sentiment weighted up (matters more).
  const eng = (Number(p.upvotes) || 0) + (Number(p.comments) || 0) * 2;
  const sentimentBoost = String(p.sentiment).toLowerCase() === "negative" ? 25 : 0;
  return eng + sentimentBoost;
}

export default function RedditPage() {
  const { data, isLive, loading } = useLiveData<any>("/api/reddit", null);
  const [query, setQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "negative" | "neutral" | "positive">("all");
  const [page, setPage] = useState(0);

  const posts = useMemo(() => data?.posts || [], [data]);
  const stats = data?.stats || {};
  const subreddits = data?.subredditBreakdown || [];
  const clusters = data?.clusters || [];

  const sentimentOptions = [
    { id: "all", label: "All" },
    { id: "negative", label: "Negative" },
    { id: "neutral", label: "Neutral" },
    { id: "positive", label: "Positive" },
  ] as const;

  // Ranked, filtered feed.
  const filtered = useMemo(() => {
    return posts
      .filter((post: any) => {
        const matchesQuery = query ? [post.title, post.snippet, post.subreddit].join(" ").toLowerCase().includes(query.toLowerCase()) : true;
        const sentiment = String(post.sentiment || "neutral").toLowerCase();
        const matchesSentiment = sentimentFilter === "all" || sentiment === sentimentFilter;
        return matchesQuery && matchesSentiment;
      })
      .sort((a: any, b: any) => postScore(b) - postScore(a));
  }, [posts, query, sentimentFilter]);

  // 14-day briefing analytics.
  const summary = useMemo(() => {
    const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recent = posts.filter((p: any) => {
      const t = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
      return Number.isNaN(t) ? true : t >= cutoff; // keep undated posts rather than drop them
    });
    const total = recent.length;
    const neg = recent.filter((p: any) => String(p.sentiment).toLowerCase() === "negative").length;
    const pos = recent.filter((p: any) => String(p.sentiment).toLowerCase() === "positive").length;
    const neu = total - neg - pos;
    const themes = rankThemes(recent);
    const emerging = themes[0] || null;         // highest-engagement theme = what's emerging
    const totalEngagement = recent.reduce((s: number, p: any) => s + (Number(p.upvotes) || 0) + (Number(p.comments) || 0), 0);
    const topPost = [...recent].sort((a: any, b: any) => postScore(b) - postScore(a))[0] || null;
    const complaints = recent
      .filter((p: any) => String(p.sentiment).toLowerCase() === "negative" || /block|refund|no result|access|urgent|help|can't|cant/i.test([p.title, p.snippet].join(" ")))
      .sort((a: any, b: any) => postScore(b) - postScore(a))
      .slice(0, 3);
    return { total, neg, pos, neu, negRate: total ? Math.round((neg / total) * 100) : 0, themes, emerging, topPost, totalEngagement, complaints };
  }, [posts]);

  if (loading) return <PageSkeleton title="Reddit Intelligence" color={ORANGE} />;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const top10 = filtered.slice(0, PAGE_SIZE);
  const paginated = filtered.slice((safePage) * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const showingTop = safePage === 0;
  const primaryDiscussion = clusters[0]?.name || summary.emerging?.label || "student questions and study support";
  const primaryRisk = clusters.find((cluster: any) => cluster.sentiment === "negative")?.name || "student support friction";
  const redditSummary = posts.length
    ? `Reddit discussion is primarily practical and student-led, centred on ${String(primaryDiscussion).toLowerCase()}; the main watchout is ${String(primaryRisk).toLowerCase()}.`
    : "No Reddit discussion has been captured yet.";

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.section variants={fadeUp as any} className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#3b1304_0%,#9a3412_46%,#ea580c_100%)] p-5 text-white shadow-[0_28px_90px_rgba(194,65,12,0.26)] md:p-7">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/80 to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-semibold text-orange-100"><MessageCircle className="h-4 w-4" /> Reddit · r/PhysicsWallah · last 60 days</div>
          <h1 className="mt-4 max-w-5xl text-2xl font-semibold leading-tight tracking-tight md:text-4xl">{redditSummary}</h1>
          <p className="mt-3 text-sm leading-6 text-orange-100/90">{formatNumber(posts.length)} posts captured · {formatNumber(data?.totalComments || 0)} comments · main discussion: {primaryDiscussion} · main watchout: {primaryRisk}</p>
        </div>
      </motion.section>

      <motion.div variants={fadeUp as any}>
        <VectorChannelSummary
          platform="reddit"
          accent={ORANGE}
          fallbackHeadline={redditSummary}
          fallbackSummary={`${formatNumber(posts.length)} posts and ${formatNumber(data?.totalComments || 0)} comments captured. The leading discussion is ${primaryDiscussion}; the main watchout is ${primaryRisk}.`}
        />
      </motion.div>

      {/* ── Structured data row (at-a-glance metrics) ── */}
      <motion.section variants={fadeUp as any} className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Posts (feed)", value: formatNumber(posts.length) },
          { label: `Posts (${WINDOW_DAYS}d)`, value: formatNumber(summary.total) },
          { label: "Engagements", value: formatNumber(summary.totalEngagement) },
          { label: "Comments", value: formatNumber(data?.totalComments || 0) },
          { label: "Communities", value: formatNumber(subreddits.length || 1) },
          { label: "Neg / Pos", value: `${summary.neg} / ${summary.pos}` },
        ].map((s) => (
          <div key={s.label} className="bg-card p-4">
            <p className="font-mono text-xl font-bold tabular-nums" style={{ color: ORANGE }}>{s.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </motion.section>

      {/* ── 14-day briefing + emerging topic (mirrors the Play Store summary card) ── */}
      <motion.section variants={fadeUp as any} className="overflow-hidden rounded-2xl border border-orange-200 dark:border-orange-800/40">
        <div className="bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 p-5 dark:from-orange-950/30 dark:via-rose-950/20 dark:to-amber-950/20">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: ORANGE }}>Reddit Briefing · Last {WINDOW_DAYS} Days · r/PhysicsWallah</p>
          <h2 className="mt-2 text-xl font-bold leading-snug">
            {summary.total} posts · {formatNumber(summary.totalEngagement)} engagements.{" "}
            {summary.emerging ? (
              <>Emerging topic: <span style={{ color: ORANGE }}>{summary.emerging.label}</span>.</>
            ) : "No single topic is breaking out."}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Over the last {WINDOW_DAYS} days the conversation skews {summary.negRate < 25 ? "positive" : summary.negRate < 45 ? "mixed" : "negative"} — {summary.pos} positive · {summary.neu} neutral · {summary.neg} negative.
            {summary.emerging ? (
              <> The breakout narrative is <span className="font-semibold text-foreground">{summary.emerging.label.toLowerCase()}</span> ({summary.emerging.tone === "positive" ? "a goodwill wave" : summary.emerging.tone === "negative" ? "a risk signal" : "high-volume chatter"}),
              driven by {formatNumber(summary.emerging.engagement)} engagements across {summary.emerging.count} posts — the loudest thing in the subreddit right now.</>
            ) : null}
          </p>

          {/* Emerging-topic callout — the single highest-engagement post */}
          {summary.topPost ? (
            <div className={cn("mt-4 rounded-xl border bg-card/70 p-4", summary.emerging?.tone === "negative" ? "border-red-200 dark:border-red-900/40" : summary.emerging?.tone === "positive" ? "border-emerald-200 dark:border-emerald-900/40" : "border-orange-200 dark:border-orange-800/40")}>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: ORANGE }}>▲ Trending now — top post</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{summary.topPost.title}</p>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{formatNumber(summary.topPost.upvotes)} upvotes</span>
                <span>{formatNumber(summary.topPost.comments)} comments</span>
                {summary.topPost.url ? <a href={summary.topPost.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-purple hover:underline">open <ExternalLink className="h-3 w-3" /></a> : null}
              </div>
            </div>
          ) : null}

          {/* stat tiles */}
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-border bg-card/70 p-3"><p className="text-2xl font-bold">{formatNumber(summary.total)}</p><p className="text-[10px] text-muted-foreground">posts ({WINDOW_DAYS}d)</p></div>
            <div className="rounded-xl border border-border bg-card/70 p-3"><p className="text-2xl font-bold">{formatNumber(summary.totalEngagement)}</p><p className="text-[10px] text-muted-foreground">engagements</p></div>
            <div className="rounded-xl border border-red-200 bg-card/70 p-3 dark:border-red-900/40"><p className="text-2xl font-bold text-red-600">{summary.negRate}%</p><p className="text-[10px] text-muted-foreground">negative</p></div>
            <div className="rounded-xl border border-border bg-card/70 p-3"><p className="text-2xl font-bold text-emerald-600">{summary.pos}</p><p className="text-[10px] text-muted-foreground">positive</p></div>
            <div className="rounded-xl border border-border bg-card/70 p-3"><p className="text-sm font-bold leading-tight">{summary.emerging?.label.split(" ").slice(0, 2).join(" ") || "—"}</p><p className="text-[10px] text-muted-foreground">emerging topic</p></div>
          </div>

          {/* theme chips ranked by engagement, tone-colored */}
          {summary.themes.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.themes.map((t) => (
                <span key={t.label} className={cn("rounded-full border bg-card/70 px-3 py-1 text-[11px] font-medium", t.tone === "negative" ? "border-red-200 dark:border-red-900/40" : t.tone === "positive" ? "border-emerald-200 dark:border-emerald-900/40" : "border-orange-200 dark:border-orange-800/40")}>
                  {t.label} <span className="font-bold" style={{ color: ORANGE }}>{t.count}</span>
                </span>
              ))}
            </div>
          ) : null}

          {/* top complaints to route */}
          {summary.complaints.length ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-card/60 p-4 dark:border-red-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">⚠ Complaints worth routing</p>
              <ul className="mt-2 space-y-1.5">
                {summary.complaints.map((p: any, i: number) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.title}</span>
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-purple hover:underline">open <ExternalLink className="h-3 w-3" /></a> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </motion.section>

      {isLive && data?.rag?.enabled ? <motion.div variants={fadeUp as any}><RAGInsight title="Reddit Narrative Brief" analysis={data.rag.analysis} confidence={data.rag.confidence} mentionsUsed={data.rag.mentionsUsed} avgSimilarity={data.rag.avgSimilarity} sentimentBreakdown={data.rag.sentimentBreakdown} /></motion.div> : null}

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{showingTop ? "Top 10 posts" : `Page ${safePage + 1} of ${pageCount}`}</p>
              <h2 className="mt-1 text-lg font-bold">Ranked by engagement &amp; risk</h2>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Search Reddit..." className="w-40 bg-transparent outline-none" /></label>
              <div className="flex rounded-lg border border-border bg-muted/40 p-1">
                {sentimentOptions.map((option) => (
                  <button key={option.id} type="button" onClick={() => { setSentimentFilter(option.id); setPage(0); }} className={cn("rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors", sentimentFilter === option.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {paginated.map((post: any, index: number) => {
              const rank = safePage * PAGE_SIZE + index + 1;
              return (
                <div key={post.url || index} className="rounded-xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 flex-col items-center pt-1">
                      <span className="text-[10px] font-bold text-muted-foreground">#{rank}</span>
                      <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-bold" style={{ color: ORANGE }}>{post.upvotes}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${ORANGE}15`, color: ORANGE }}>r/{post.subreddit}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", post.sentiment === "negative" ? "bg-red-100 text-red-600" : post.sentiment === "positive" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{post.sentiment}</span></div>
                      <p className="text-sm font-bold">{post.title}</p>
                      {post.snippet ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{post.snippet}</p> : null}
                      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground"><span>{post.comments} comments</span>{post.createdAt ? <span>{new Date(post.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span> : null}{post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-purple hover:underline">Open Reddit <ExternalLink className="h-3 w-3" /></a> : null}</div>
                      {post.topComments?.length ? (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer list-none text-[11px] font-medium text-purple hover:underline">Top comments ({post.topComments.length}) ▾</summary>
                          <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
                            {post.topComments.map((c: any, ci: number) => (
                              <div key={ci} className="text-[11px]">
                                <span className="font-semibold text-foreground">u/{c.author}</span>
                                <span className="text-muted-foreground"> · {c.body}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {!filtered.length ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No Reddit discussions match this filter.</div> : null}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                <span className="text-xs text-muted-foreground">{safePage + 1} / {pageCount}</span>
                <button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Communities</p>
          <h2 className="mt-1 text-lg font-bold">Where the narrative lives</h2>
          <div className="mt-4 space-y-3">
            {subreddits.slice(0, 8).map((sub: any) => (
              <div key={sub.name}>
                <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">r/{sub.name}</span><span className="text-muted-foreground">{sub.count}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, sub.count)}%`, backgroundColor: ORANGE }} /></div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── Data / pull activity log ── */}
      {data?.pullLog?.length ? (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Data Logs</p>
              <h2 className="mt-1 text-lg font-bold">Fetch &amp; pull activity</h2>
            </div>
            {data?.meta?.generatedAt ? (
              <span className="text-[11px] text-muted-foreground">generated {new Date(data.meta.generatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            ) : null}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-semibold">Subreddit</th>
                  <th className="pb-2 pr-4 font-semibold">Source</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Posts</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Comments</th>
                  <th className="pb-2 pr-4 font-semibold">Post range</th>
                  <th className="pb-2 font-semibold">Last pulled</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {data.pullLog.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-sans font-semibold">r/{row.subreddit}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.source}</td>
                    <td className="py-2 pr-4 text-right" style={{ color: ORANGE }}>{formatNumber(row.posts)}</td>
                    <td className="py-2 pr-4 text-right">{formatNumber(row.comments)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {row.firstPost ? new Date(row.firstPost).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                      {" – "}
                      {row.lastPost ? new Date(row.lastPost).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}
                    </td>
                    <td className="py-2 text-muted-foreground">{row.pulledAt ? new Date(row.pulledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.meta?.liveSources?.length ? (
            <p className="mt-3 text-[11px] text-muted-foreground">Sources: {data.meta.liveSources.join(", ")} · window {data.meta.window}</p>
          ) : null}
        </motion.section>
      ) : null}
    </motion.div>
  );
}
