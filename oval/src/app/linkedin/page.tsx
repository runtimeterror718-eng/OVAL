"use client";

import { motion } from "framer-motion";
import { BriefcaseBusiness, ExternalLink, MessageCircle, Search, TrendingUp } from "lucide-react";
import { useState } from "react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

const LINKEDIN_BLUE = "#0A66C2";

function formatDate(value?: string | null) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sentimentClass(value?: string | null) {
  const text = String(value || "").toLowerCase();
  if (text.includes("negative")) return "bg-red-100 text-red-700";
  if (text.includes("positive")) return "bg-green-100 text-green-700";
  return "bg-muted text-muted-foreground";
}

export default function LinkedInPage() {
  const { data, loading } = useLiveData<any>("/api/linkedin", null);
  const [query, setQuery] = useState("");
  if (loading) return <PageSkeleton title="LinkedIn Intelligence" color={LINKEDIN_BLUE} />;

  const stats = data?.stats || {};
  const posts = data?.posts || [];
  const clusters = data?.clusters || [];
  const sentiment = stats.sentiment || {};
  const filteredPosts = query
    ? posts.filter((post: any) => `${post.title || ""} ${post.text || ""} ${post.author || ""} ${(post.evidenceComments || []).map((comment: any) => comment.text || "").join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    : posts;
  const totalSentiment = (sentiment.positive || 0) + (sentiment.negative || 0) + (sentiment.neutral || 0);

  return (
    <motion.div className="mx-auto max-w-6xl space-y-6 px-4 py-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.div variants={fadeUp as any}>
        <div className="flex items-center gap-3">
          <BriefcaseBusiness className="h-5 w-5" style={{ color: LINKEDIN_BLUE }} />
          <h1 className="text-2xl font-bold tracking-tight">LinkedIn Intelligence</h1>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">Professional reputation, hiring-market narrative, public PW posts, and visible comment evidence.</p>
      </motion.div>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-[#0A66C2]/25 bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: LINKEDIN_BLUE }}>Current Read</p>
        <h2 className="mt-2 text-xl font-bold">LinkedIn is the employer-brand and corporate-trust layer.</h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          This view is post-first: it finds LinkedIn posts talking about PhysicsWallah, PW or Alakh Pandey, then keeps visible comments under the parent post as evidence. That keeps good and bad posts visible without letting sub-comments masquerade as top-level market signals.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalPosts || 0)}</p><p className="text-[10px] text-muted-foreground">PW discussion posts</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.evidenceComments || 0)}</p><p className="text-[10px] text-muted-foreground">comment evidence</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-2xl font-bold">{formatNumber(stats.totalEngagement || 0)}</p><p className="text-[10px] text-muted-foreground">engagement</p></div>
          <div className="rounded-xl border border-red-200 p-3"><p className="text-2xl font-bold text-red-600">{totalSentiment ? Math.round((sentiment.negative || 0) / totalSentiment * 100) : 0}%</p><p className="text-[10px] text-muted-foreground">negative classified</p></div>
          <div className="rounded-xl border border-border p-3"><p className="text-sm font-bold">{formatDate(stats.latestPostAt)}</p><p className="text-[10px] text-muted-foreground">latest post</p></div>
        </div>
      </motion.section>

      {!data?.collectorConfigured ? (
        <motion.section variants={fadeUp as any} className="rounded-2xl border border-dashed border-[#0A66C2]/40 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: LINKEDIN_BLUE }}>Collector Setup Needed</p>
          <h2 className="mt-1 text-lg font-bold">No LinkedIn custom collector is configured yet.</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Add a compliant collector endpoint and token, then run the LinkedIn scraper. The UI and API contract are ready; the missing piece is fresh LinkedIn source data.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {["LINKEDIN_CUSTOM_SCRAPER_URL", "LINKEDIN_CUSTOM_SCRAPER_TOKEN", "LINKEDIN_CUSTOM_COMMENTS_URL", "LINKEDIN_COMPANY_URLS"].map((item) => (
              <code key={item} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">{item}</code>
            ))}
          </div>
        </motion.section>
      ) : null}

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Post-First Feed</p>
          <h2 className="mt-1 text-lg font-bold">Posts talking about PW, ranked by action value</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {posts.slice(0, 8).map((post: any, index: number) => (
              <a key={post.id || index} href={post.url || "#"} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border bg-background p-4 hover:border-[#0A66C2]/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{post.author || "LinkedIn member"} · {formatDate(post.publishedAt)}</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold">{post.title || "LinkedIn post"}</h3>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{post.text || "No post text captured."}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                  <span className={cn("rounded-full px-2 py-0.5", sentimentClass(post.sentiment))}>{post.sentiment || "neutral"}</span>
                  <span className="rounded-full bg-[#0A66C2]/10 px-2 py-0.5 font-semibold text-[#0A66C2]">{post.issueLabel || "General PW discussion"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{post.recommendedOwner || "Brand + PR"}</span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{formatNumber(post.engagement || 0)} engagement</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{formatNumber(post.comments || 0)} comments</span>
                  <span>{formatNumber(post.priorityScore || 0)} priority</span>
                </div>
              </a>
            ))}
            {!posts.length ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">No PW-related LinkedIn posts have been collected yet.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Theme Clusters</p>
          <h2 className="mt-1 text-lg font-bold">What LinkedIn is talking about</h2>
          <div className="mt-4 space-y-2">
            {clusters.slice(0, 6).map((cluster: any) => (
              <div key={cluster.name} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold">{cluster.name}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{formatNumber(cluster.mentions || 0)}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{(cluster.keywords || []).slice(0, 4).join(" · ")}</p>
              </div>
            ))}
            {!clusters.length ? <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Clusters appear once post or comment text is collected.</p> : null}
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evidence View</p>
            <h2 className="mt-1 text-lg font-bold">Parent posts with visible comment evidence</h2>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search posts..." className="w-40 bg-transparent outline-none" />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {filteredPosts.slice(0, 20).map((post: any, index: number) => (
            <article key={post.id || index} className="rounded-xl border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{post.author || "LinkedIn member"} · {formatDate(post.publishedAt)}</p>
                  <a href={post.url || "#"} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm font-bold hover:text-[#0A66C2]">
                    {post.title || "LinkedIn post"}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{post.text || "No post text captured."}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 md:max-w-56 md:justify-end">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px]", sentimentClass(post.sentiment))}>{post.sentiment || "neutral"}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{post.issueLabel || "General PW discussion"}</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                {(post.evidenceComments || []).slice(0, 4).map((comment: any, commentIndex: number) => (
                  <div key={comment.id || commentIndex} className="rounded-lg border border-border bg-background/50 p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground">{comment.author || "LinkedIn member"} · comment evidence</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed">&ldquo;{comment.text || "No comment text captured."}&rdquo;</p>
                    <p className="mt-2 text-[10px] text-muted-foreground">{formatDate(comment.publishedAt)} · {formatNumber(comment.engagement || 0)} engagement</p>
                  </div>
                ))}
                {!(post.evidenceComments || []).length ? (
                  <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground md:col-span-2">No visible comment evidence was captured for this post yet.</p>
                ) : null}
              </div>
            </article>
          ))}
          {!filteredPosts.length ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No PW-related LinkedIn posts match this search.</p> : null}
        </div>
      </motion.section>
    </motion.div>
  );
}
