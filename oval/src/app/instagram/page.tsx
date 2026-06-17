"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, ExternalLink, Heart, MessageCircle, Play, Search, ThumbsUp } from "lucide-react";
import RAGInsight from "@/components/dashboard/rag-insight";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const PINK = "#E1306C";

function InstagramPostPreview({ post }: { post: any }) {
  const [errored, setErrored] = useState(false);
  const imageUrl = post.thumbnailUrl || null;

  if (imageUrl && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={post.caption || post.tag || "Instagram preview"}
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-pink/20 to-orange-100 p-5 text-center">
      <p className="text-xs font-bold text-foreground">@{post.account || "instagram"}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{post.tag || "Instagram creative preview"}</p>
      {post.url ? <p className="mt-2 text-[10px] text-muted-foreground/80">Open post</p> : null}
    </div>
  );
}

export default function InstagramPage() {
  const { data, isLive, loading } = useLiveData<any>("/api/instagram", null);
  const [commentSearch, setCommentSearch] = useState("");
  if (loading) return <PageSkeleton title="Instagram Intelligence" color={PINK} />;

  const stats = data?.stats || {};
  const sentiment = stats.sentiment || {};
  const topPosts = data?.topPosts || [];
  const topComments = data?.topComments || [];
  const hashtags = data?.topHashtags || [];
  const accounts = data?.topAccounts || [];
  const attentionCards = data?.attentionCards || [];
  const aiDetail = data?.instagramAIDetail || [];
  const filteredComments = commentSearch ? topComments.filter((c: any) => (c.text || "").toLowerCase().includes(commentSearch.toLowerCase())) : topComments;
  const totalSentiment = (sentiment.positive || 0) + (sentiment.neutral || 0) + (sentiment.negative || 0);

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any}>
        <div className="flex items-center gap-3"><Camera className="h-5 w-5" style={{ color: PINK }} /><h1 className="text-2xl font-bold tracking-tight">Instagram Intelligence</h1></div>
        <p className="mt-0.5 text-sm text-muted-foreground">Campaign reaction, reels, creators, and comment truth behind polished posts.</p>
      </motion.div>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-pink-200 bg-card p-5 dark:border-pink-800/40">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: PINK }}>Current Read</p>
        <h2 className="mt-2 text-xl font-bold">This page highlights PW-related Instagram posts around refunds, batch quality, faculty requests, and the latest high-visibility reels.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Reels and posts show reach, but leaders should read the comment layer to catch refund, delivery, teacher, and app complaints before they cross into Reddit or Google.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalPosts || 0)}</p><p className="text-[10px] text-muted-foreground">posts</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalReelPlays || 0)}</p><p className="text-[10px] text-muted-foreground">reel plays</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.storedComments || 0)}</p><p className="text-[10px] text-muted-foreground">comments captured</p></div>
          <div className="rounded-xl border border-green-200 p-3"><p className="text-2xl font-bold text-green-600">{totalSentiment ? Math.round((sentiment.positive || 0) / totalSentiment * 100) : 0}%</p><p className="text-[10px] text-muted-foreground">positive classified</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalLikes || 0)}</p><p className="text-[10px] text-muted-foreground">likes</p></div>
        </div>
      </motion.section>

      {attentionCards.length > 0 ? (
        <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {attentionCards.map((card: any, index: number) => (
            <div key={index} className={cn("rounded-2xl border bg-card p-4", card.severity === "high" ? "border-pink-200 dark:border-pink-800/40" : "border-amber-200 dark:border-amber-800/40")}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Needs attention</p>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", card.severity === "high" ? "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}>{card.metric}</span>
              </div>
              <h3 className="mt-2 text-sm font-bold">{card.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
            </div>
          ))}
        </motion.section>
      ) : null}

      {aiDetail.length > 0 ? (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400">AI Detail</p>
              <h2 className="mt-1 text-lg font-bold">Live Instagram analysis with fallback tagging</h2>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Hardcoded from current Instagram analysis</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {aiDetail.map((bucket: any, index: number) => (
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
      ) : isLive && data?.rag?.enabled ? <motion.div variants={fadeUp as any}><RAGInsight title="AI Detail" analysis={data.rag.analysis} confidence={data.rag.confidence} mentionsUsed={data.rag.mentionsUsed} avgSimilarity={data.rag.avgSimilarity} sentimentBreakdown={data.rag.sentimentBreakdown} /></motion.div> : null}

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Top Reels / Posts</p>
          <h2 className="mt-1 text-lg font-bold">Negative content first, then supporting positives</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {topPosts.map((post: any, index: number) => (
              <a key={post.postId || index} href={post.url || "#"} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-xl border border-border bg-background hover:border-pink-300">
                <div className="relative h-36 bg-muted">
                  <InstagramPostPreview post={post} />
                  <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: PINK }}>{post.mediaType}</span>
                </div>
                <div className="p-3">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {post.isPriority ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"><AlertTriangle className="mr-1 inline h-3 w-3" />Priority</span> : null}
                    {post.sentiment ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", post.sentiment === "negative" ? "bg-red-50 text-red-700" : post.sentiment === "positive" ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground")}>{post.sentiment}</span> : null}
                    {post.tag ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{post.tag}</span> : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold">{post.caption || "(no caption)"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{post.priorityReason || `@${post.account || "instagram"}`}</p>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><Heart className="h-3 w-3" />{formatNumber(post.likes || 0)}</span><span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.comments || 0}</span>{post.reelPlays ? <span className="flex items-center gap-1"><Play className="h-3 w-3" />{formatNumber(post.reelPlays)}</span> : null}<ExternalLink className="ml-auto h-3 w-3" /></div>
                </div>
              </a>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Hashtags / Accounts</p>
          <h2 className="mt-1 text-lg font-bold">Where reach and risk concentrate</h2>
          <div className="mt-4 space-y-2">
            {hashtags.slice(0, 6).map((tag: any) => <div key={tag.tag} className="rounded-lg border border-border p-2"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold" style={{ color: PINK }}>{tag.tag}</p>{tag.sentiment ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tag.sentiment === "negative" ? "bg-red-50 text-red-700" : tag.sentiment === "positive" ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground")}>{tag.sentiment}</span> : null}</div><p className="text-[10px] text-muted-foreground">{tag.posts} posts · {formatNumber(tag.likes || 0)} likes</p></div>)}
          </div>
          <div className="mt-4 space-y-2">
            {accounts.slice(0, 4).map((acc: any) => <div key={acc.name} className="rounded-lg bg-muted/30 p-2"><p className="text-xs font-semibold">@{acc.name}</p><p className="text-[10px] text-muted-foreground">{acc.posts} posts · {formatNumber(acc.totalLikes || 0)} likes</p></div>)}
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Comment Intelligence</p><h2 className="mt-1 text-lg font-bold">What students say under posts</h2></div>
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={commentSearch} onChange={(e) => setCommentSearch(e.target.value)} placeholder="Search comments..." className="w-40 bg-transparent outline-none" /></label>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filteredComments.map((comment: any, index: number) => (
            <div key={index} className="rounded-xl border border-border p-3">
              <p className="text-sm italic leading-relaxed">&ldquo;{comment.text}&rdquo;</p>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><span>@{comment.author}</span>{comment.tag ? <span className="rounded-full bg-muted px-2 py-0.5">{comment.tag}</span> : null}{comment.sentiment ? <span className={cn("ml-auto rounded-full px-2 py-0.5", comment.sentiment === "negative" ? "bg-red-100 text-red-600" : comment.sentiment === "positive" ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground")}>{comment.sentiment === "positive" ? <ThumbsUp className="mr-1 inline h-3 w-3" /> : null}{comment.sentiment}</span> : null}</div>
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}
