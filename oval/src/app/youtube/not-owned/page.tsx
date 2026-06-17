"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarDays, ExternalLink, Eye, Flame, MessageCircle, Play, Search, ThumbsUp } from "lucide-react";
import RAGInsight from "@/components/dashboard/rag-insight";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

export default function YouTubePage() {
  const { data, isLive, loading } = useLiveData<any>("/api/youtube", null);
  const [query, setQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  if (loading) return <PageSkeleton title="YouTube Intelligence" color="#FF0000" />;

  const stats = data?.stats || {};
  const sentiment = stats.sentiment || {};
  const videos = data?.videos || [];
  const comments = data?.topComments || [];
  const prRisks = data?.prRiskVideos || [];
  const attentionCards = data?.attentionCards || [];
  const briefBuckets = data?.youtubeBriefBuckets || [];
  const backfill = data?.backfill || {};
  const queryText = query.trim().toLowerCase();
  const getSentiment = (video: any) => String(video.transcriptSentiment || video.triageLabel || (video.isPrRisk ? "negative" : "neutral")).toLowerCase();
  const severityWeight = (value: string) => value === "critical" ? 5 : value === "high" ? 4 : value === "medium" ? 3 : value === "low" ? 2 : 1;
  const filtered = videos
    .filter((video: any) => {
      const haystack = `${video.title || ""} ${video.channelName || ""} ${video.triageReason || ""} ${video.prSummary || ""}`.toLowerCase();
      if (queryText && !haystack.includes(queryText)) return false;
      const currentSentiment = getSentiment(video);
      if (sentimentFilter !== "all" && !currentSentiment.includes(sentimentFilter)) return false;
      if (riskFilter === "pr" && !video.isPrRisk) return false;
      if (riskFilter === "non-pr" && video.isPrRisk) return false;
      if (formatFilter !== "all" && video.format !== formatFilter) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const aSentiment = getSentiment(a);
      const bSentiment = getSentiment(b);
      return Number(Boolean(b.isPrRisk)) - Number(Boolean(a.isPrRisk))
        || severityWeight(b.prSeverity) - severityWeight(a.prSeverity)
        || Number(bSentiment.includes("negative")) - Number(aSentiment.includes("negative"))
        || Number(bSentiment.includes("positive")) - Number(aSentiment.includes("positive"))
        || Number(b.views || 0) - Number(a.views || 0)
        || new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });
  const FilterButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button onClick={onClick} className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors", active ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300" : "border-border bg-background text-muted-foreground hover:text-foreground")}>{children}</button>
  );

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any}>
        <div className="flex items-center gap-3"><Play className="h-5 w-5 text-red-500" /><h1 className="text-2xl font-bold tracking-tight">YouTube Intelligence</h1></div>
        <p className="mt-0.5 text-sm text-muted-foreground">Shorts, videos, comments, and creator narratives students are actually watching.</p>
      </motion.div>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-red-200 bg-card p-5 dark:border-red-800/40">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600">Current Video Read</p>
        <h2 className="mt-2 text-xl font-bold">Negative PW narratives and complaint-led creator videos are leading the YouTube conversation this week, with positive exam-prep momentum still visible underneath.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          The thumbnail/title layer tells you what is spreading; the comment layer tells you how students are reacting. Use both before deciding whether to ignore, monitor, respond, or escalate.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalVideos || 0)}</p><p className="text-[10px] text-muted-foreground">videos</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalChannels || 0)}</p><p className="text-[10px] text-muted-foreground">channels</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalViews || 0)}</p><p className="text-[10px] text-muted-foreground">views</p></div>
          <div className="rounded-xl border border-red-200 p-3"><p className="text-2xl font-bold text-red-600">{formatNumber(stats.prRiskCount || 0)}</p><p className="text-[10px] text-muted-foreground">PR risks</p></div>
          <div className="rounded-xl border border-green-200 p-3"><p className="text-2xl font-bold text-green-600">{sentiment.positive || 0}</p><p className="text-[10px] text-muted-foreground">positive comments</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{backfill.from ? new Date(backfill.from).toLocaleDateString("en-IN") : "Past 30 days"} to {backfill.to ? new Date(backfill.to).toLocaleDateString("en-IN") : "today"}</span>
          {backfill.seededRecentNegative ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950/30 dark:text-red-300">{backfill.seededRecentNegative} recent negative seed items</span> : null}
        </div>
      </motion.section>

      {attentionCards.length > 0 ? (
        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {attentionCards.map((card: any, index: number) => (
            <div key={index} className={cn("rounded-2xl border bg-card p-4", card.severity === "high" ? "border-red-200 dark:border-red-800/40" : "border-amber-200 dark:border-amber-800/40")}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Needs attention</p>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", card.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}>{card.metric}</span>
              </div>
              <h3 className="mt-2 text-sm font-bold">{card.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
            </div>
          ))}
        </motion.section>
      ) : null}

      {prRisks.length > 0 ? (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-red-200 bg-red-50/30 p-5 dark:border-red-800/40 dark:bg-red-950/10">
          <div className="mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /><h2 className="text-lg font-bold">Videos requiring PR review</h2></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {prRisks.map((video: any) => (
              <a key={video.videoId} href={video.url || "#"} target="_blank" rel="noopener noreferrer" className="flex gap-3 rounded-xl border border-red-200 bg-card p-3 hover:border-red-400">
                {video.videoId ? <img src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`} alt="" className="h-20 w-32 shrink-0 rounded-lg object-cover" /> : null}
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap gap-1">
                    {video.severity ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">{video.severity}</span> : null}
                    {video.format ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{video.format}</span> : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-bold">{video.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.reason || video.summary}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{video.date ? new Date(video.date).toLocaleDateString("en-IN") : ""}{video.sourceNote ? ` · ${video.sourceNote}` : ""}</p>
                </div>
              </a>
            ))}
          </div>
        </motion.section>
      ) : null}

      {briefBuckets.length > 0 ? (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400">YouTube Brief</p>
              <h2 className="mt-1 text-lg font-bold">Major recent buckets from YouTube Intel</h2>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Hardcoded from recent 30-day scan</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {briefBuckets.map((bucket: any, index: number) => (
              <div key={index} className={cn("rounded-xl border p-4", bucket.sentiment === "positive" ? "border-green-200 bg-green-50/30 dark:border-green-900/40 dark:bg-green-950/10" : bucket.severity === "high" ? "border-red-200 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/10" : "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10")}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", bucket.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : bucket.sentiment === "positive" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}>{bucket.severity}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{bucket.volume}</span>
                </div>
                <h3 className="text-sm font-bold">{bucket.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{bucket.evidence}</p>
                <p className="mt-3 text-xs font-medium leading-relaxed text-foreground">{bucket.action}</p>
              </div>
            ))}
          </div>
        </motion.section>
      ) : isLive && data?.rag?.enabled ? (
        <motion.div variants={fadeUp as any}><RAGInsight title="YouTube Brief" analysis={data.rag.analysis} confidence={data.rag.confidence} mentionsUsed={data.rag.mentionsUsed} avgSimilarity={data.rag.avgSimilarity} sentimentBreakdown={data.rag.sentimentBreakdown} /></motion.div>
      ) : null}

      {briefBuckets.length > 0 && isLive && data?.rag?.enabled ? (
        <motion.div variants={fadeUp as any}><RAGInsight title="AI Detail" analysis={data.rag.analysis} confidence={data.rag.confidence} mentionsUsed={data.rag.mentionsUsed} avgSimilarity={data.rag.avgSimilarity} sentimentBreakdown={data.rag.sentimentBreakdown} /></motion.div>
      ) : null}

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Video Evidence</p><h2 className="mt-1 text-lg font-bold">What students are watching</h2></div>
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos..." className="w-40 bg-transparent outline-none" /></label>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterButton active={riskFilter === "all"} onClick={() => setRiskFilter("all")}><Flame className="mr-1 inline h-3.5 w-3.5" />All risk</FilterButton>
          <FilterButton active={riskFilter === "pr"} onClick={() => setRiskFilter("pr")}>PR review</FilterButton>
          <FilterButton active={sentimentFilter === "negative"} onClick={() => setSentimentFilter(sentimentFilter === "negative" ? "all" : "negative")}>Negative</FilterButton>
          <FilterButton active={sentimentFilter === "positive"} onClick={() => setSentimentFilter(sentimentFilter === "positive" ? "all" : "positive")}><ThumbsUp className="mr-1 inline h-3.5 w-3.5" />Positive</FilterButton>
          <FilterButton active={formatFilter === "short"} onClick={() => setFormatFilter(formatFilter === "short" ? "all" : "short")}>Shorts</FilterButton>
          <FilterButton active={formatFilter === "video"} onClick={() => setFormatFilter(formatFilter === "video" ? "all" : "video")}>Videos</FilterButton>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, 24).map((video: any) => (
            <a key={video.videoId} href={video.url || "#"} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-border bg-background hover:border-red-300">
              {video.videoId ? <img src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`} alt="" className="h-36 w-full object-cover" /> : <div className="h-36 bg-muted" />}
              <div className="p-3">
                <div className="mb-2 flex flex-wrap gap-1">{video.isPrRisk ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">PR risk</span> : null}{video.triageLabel ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", getSentiment(video).includes("negative") ? "bg-red-50 text-red-700" : getSentiment(video).includes("positive") ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground")}>{video.triageLabel}</span> : null}{video.format ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{video.format}</span> : null}</div>
                <p className="line-clamp-2 text-sm font-semibold">{video.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.triageReason || video.prSummary || video.channelName || ""}</p>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(video.views || 0)}</span><span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{video.comments || 0}</span>{video.date ? <span>{new Date(video.date).toLocaleDateString("en-IN")}</span> : null}<ExternalLink className="ml-auto h-3 w-3" /></div>
              </div>
            </a>
          ))}
        </div>
        {filtered.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No videos match the selected filters.</p> : null}
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Comment Intelligence</p>
        <h2 className="mt-1 text-lg font-bold">Student reaction under videos</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {comments.map((comment: any, index: number) => (
            <div key={index} className="rounded-xl border border-border p-3">
              <p className="text-sm italic leading-relaxed">&ldquo;{comment.text}&rdquo;</p>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span>{comment.author || "anonymous"}</span>{comment.likes ? <span>{comment.likes} likes</span> : null}<span className={cn("ml-auto rounded-full px-2 py-0.5", comment.sentiment === "negative" ? "bg-red-100 text-red-600" : comment.sentiment === "positive" ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground")}>{comment.sentiment || "unlabeled"}</span></div>
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
