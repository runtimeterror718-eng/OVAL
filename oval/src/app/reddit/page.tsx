"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, ExternalLink, MessageCircle, Search } from "lucide-react";
import RAGInsight from "@/components/dashboard/rag-insight";
import IndiaMapComponent from "@/components/dashboard/india-map";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const ORANGE = "#FF5700";

export default function RedditPage() {
  const { data, isLive, loading } = useLiveData<any>("/api/reddit", null);
  const [query, setQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "negative" | "neutral" | "positive">("all");
  if (loading) return <PageSkeleton title="Reddit Intelligence" color={ORANGE} />;

  const stats = data?.stats || {};
  const posts = data?.posts || [];
  const subreddits = data?.subredditBreakdown || [];
  const sentimentOptions = [
    { id: "all", label: "All" },
    { id: "negative", label: "Negative" },
    { id: "neutral", label: "Neutral" },
    { id: "positive", label: "Positive" },
  ] as const;
  const filtered = posts.filter((post: any) => {
    const matchesQuery = query ? [post.title, post.snippet, post.subreddit].join(" ").toLowerCase().includes(query.toLowerCase()) : true;
    const sentiment = String(post.sentiment || "neutral").toLowerCase();
    const matchesSentiment = sentimentFilter === "all" || sentiment === sentimentFilter;
    return matchesQuery && matchesSentiment;
  });
  const sentimentTotal = (stats.positiveCount || 0) + (stats.negativeCount || 0) + (stats.neutralCount || 0);
  const negRate = sentimentTotal ? Math.round(((stats.negativeCount || 0) / sentimentTotal) * 100) : 0;

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any}>
        <div className="flex items-center gap-3"><MessageCircle className="h-5 w-5" style={{ color: ORANGE }} /><h1 className="text-2xl font-bold tracking-tight">PW Reddit Intelligence</h1></div>
        <p className="mt-0.5 text-sm text-muted-foreground">Physics Wallah conversations from Reddit.</p>
      </motion.div>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-orange-200 bg-card p-5 dark:border-orange-800/40">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: ORANGE }}>Current Narrative</p>
        <h2 className="mt-2 text-xl font-bold">Reddit is the trust-and-comparison room.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Students use Reddit to ask whether PW, Arjuna, Lakshya, Yakeen, Prayas, and Vidyapeeth are still worth trusting, compare them with Allen/Unacademy, and narrate support or academic frustration in detail.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalMentions || 0)}</p><p className="text-[10px] text-muted-foreground">posts shown</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(data?.totalComments || 0)}</p><p className="text-[10px] text-muted-foreground">comments</p></div>
          <div className="rounded-xl border border-red-200 p-3"><p className="text-2xl font-bold text-red-600">{negRate}%</p><p className="text-[10px] text-muted-foreground">negative classified</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-sm font-bold">{stats.topSubreddit || "—"}</p><p className="text-[10px] text-muted-foreground">main community</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{subreddits.length}</p><p className="text-[10px] text-muted-foreground">subreddits</p></div>
        </div>
      </motion.section>

      {isLive && data?.rag?.enabled ? <motion.div variants={fadeUp as any}><RAGInsight title="Reddit Narrative Brief" analysis={data.rag.analysis} confidence={data.rag.confidence} mentionsUsed={data.rag.mentionsUsed} avgSimilarity={data.rag.avgSimilarity} sentimentBreakdown={data.rag.sentimentBreakdown} /></motion.div> : null}

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evidence Feed</p><h2 className="mt-1 text-lg font-bold">PW-specific Reddit discussions</h2></div>
            <div className="flex flex-col gap-2 sm:items-end">
              <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Reddit..." className="w-40 bg-transparent outline-none" /></label>
              <div className="flex rounded-lg border border-border bg-muted/40 p-1">
                {sentimentOptions.map((option) => (
                  <button key={option.id} type="button" onClick={() => setSentimentFilter(option.id)} className={cn("rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors", sentimentFilter === option.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {filtered.map((post: any, index: number) => (
              <div key={index} className="rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col items-center pt-1"><ArrowUp className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-sm font-bold" style={{ color: ORANGE }}>{post.upvotes}</span></div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${ORANGE}15`, color: ORANGE }}>r/{post.subreddit}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", post.sentiment === "negative" ? "bg-red-100 text-red-600" : post.sentiment === "positive" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{post.sentiment}</span></div>
                    <p className="text-sm font-bold">{post.title}</p>
                    {post.snippet ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{post.snippet}</p> : null}
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground"><span>{post.comments} comments</span>{post.createdAt ? <span>{new Date(post.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span> : null}{post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-purple hover:underline">Open Reddit <ExternalLink className="h-3 w-3" /></a> : null}</div>
                  </div>
                </div>
              </div>
            ))}
            {!filtered.length ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No Reddit discussions match this filter.</div> : null}
          </div>
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

      <motion.div variants={fadeUp as any}><IndiaMapComponent /></motion.div>
    </motion.div>
  );
}
