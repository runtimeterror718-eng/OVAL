"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, Camera, Globe, Heart, LifeBuoy, MessageCircle, Play, Smartphone, TrendingUp } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { fadeUp, stagger } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { formatNumber } from "@/lib/utils";

const platformMeta: Record<string, { label: string; href: string; icon: any; color: string }> = {
  reddit: { label: "Reddit", href: "/reddit", icon: MessageCircle, color: "#FF5700" },
  instagram: { label: "Instagram", href: "/instagram", icon: Camera, color: "#E1306C" },
  youtube: { label: "YouTube", href: "/youtube", icon: Play, color: "#FF0000" },
  google: { label: "Google", href: "/google", icon: Globe, color: "#4285F4" },
  linkedin: { label: "LinkedIn", href: "/linkedin", icon: BriefcaseBusiness, color: "#0A66C2" },
  playstore: { label: "Play Store", href: "/playstore", icon: Smartphone, color: "#34A853" },
  freshdesk: { label: "Freshdesk", href: "/freshdesk", icon: LifeBuoy, color: "#534AB7" },
};

function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function latestDelta(trend: any[], field: string) {
  const latest = trend?.[trend.length - 1];
  const prior = trend?.[trend.length - 2];
  const current = Number(latest?.[field] || 0);
  const previous = Number(prior?.[field] || 0);
  const delta = current - previous;
  return { current, previous, delta, pct: previous ? Math.round((delta / previous) * 100) : null, label: latest?.label || latest?.month || "latest" };
}

function evidenceText(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.text || value.description || value.subject || value.title || "";
}

function PlatformCard({ id, metric, sentiment, issue, proof }: { id: keyof typeof platformMeta; metric: string; sentiment: string; issue: string; proof: string }) {
  const meta = platformMeta[id];
  const Icon = meta.icon;
  return (
    <Link href={meta.href} className="rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-purple/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${meta.color}18` }}>
            <Icon className="h-4 w-4" style={{ color: meta.color }} />
          </span>
          <div>
            <p className="text-sm font-bold">{meta.label}</p>
            <p className="text-[10px] text-muted-foreground">{metric}</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 rounded-xl border border-border bg-background/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Current read</p>
        <p className="mt-1 text-sm font-semibold">{issue}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{proof}</p>
      </div>
      <p className="mt-3 text-xs font-medium" style={{ color: meta.color }}>{sentiment}</p>
    </Link>
  );
}

type CarouselItem = {
  key: string;
  platform: string;
  title: string;
  meta: string;
  href?: string;
  image?: string | null;
  tone: string;
  color: string;
};

function CarouselSection({ title, eyebrow, items, emptyCopy }: { title: string; eyebrow: string; items: CarouselItem[]; emptyCopy: string }) {
  const loop = [...items, ...items];

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-bold">{title}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{emptyCopy}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        <p className="text-[10px] text-muted-foreground">PW-only · hover pauses</p>
      </div>
      <div className="flex w-max gap-3 media-carousel-track">
        {loop.map((item, index) => (
          <a key={`${item.key}-${index}`} href={item.href || "#"} target="_blank" rel="noopener noreferrer" className="w-64 shrink-0 overflow-hidden rounded-xl border border-border bg-background">
            <div className="relative h-32 bg-muted">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-purple/20 to-pink/20 px-5 text-center text-xs font-semibold text-muted-foreground">
                  {item.platform} creative preview
                </div>
              )}
              <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: item.color }}>{item.platform}</span>
              <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">{item.tone}</span>
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{item.meta}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function MovementCard({ platform, metric, delta, context, href }: { platform: string; metric: string; delta: ReturnType<typeof latestDelta>; context: string; href: string }) {
  const isUp = delta.delta > 0;
  return (
    <Link href={href} className="rounded-2xl border border-border bg-card p-4 hover:border-purple/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{platform}</p>
          <h3 className="mt-1 text-sm font-bold">{metric}</h3>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isUp ? "bg-orange-100 text-orange-700" : delta.delta < 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
          {delta.delta > 0 ? "+" : ""}{formatNumber(delta.delta)}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold">{formatNumber(delta.current)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{delta.label} · {delta.pct === null ? "new baseline" : `${delta.pct > 0 ? "+" : ""}${delta.pct}% MoM`} · {context}</p>
    </Link>
  );
}

function displayMonth(month?: string | null) {
  if (!month) return "Latest";
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-IN", { month: "short" });
}

function PulseTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: any }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="min-w-[200px] rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 shadow-xl shadow-black/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50">
      <p className="mb-2 font-medium tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="font-mono text-sm font-semibold">{Number(row.rating || 0).toFixed(2)}★ average rating</p>
      <div className="mt-2 border-t border-slate-200 pt-2 text-slate-600 dark:border-slate-700 dark:text-slate-300">
        <p>{formatNumber(row.reviews || 0)} Play Store reviews</p>
        <p>{row.lowRatingRate}% low-rating pressure · {row.replyRate}% reply rate</p>
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const reddit = useLiveData<any>("/api/reddit", null);
  const instagram = useLiveData<any>("/api/instagram", null);
  const youtube = useLiveData<any>("/api/youtube", null);
  const google = useLiveData<any>("/api/google", null);
  const linkedin = useLiveData<any>("/api/linkedin", null);
  const playstore = useLiveData<any>("/api/playstore", null);
  const freshdesk = useLiveData<any>("/api/freshdesk", null);
  const reputationRadar = useLiveData<any>("/api/reputation-radar?hours=72", null);

  const loading = [reddit, instagram, youtube, google, linkedin, playstore, freshdesk, reputationRadar].some((state) => state.loading);
  if (loading) return <PageSkeleton title="Command Center" color="#534AB7" />;

  const rStats = reddit.data?.stats || {};
  const iStats = instagram.data?.stats || {};
  const yStats = youtube.data?.stats || {};
  const gStats = google.data?.stats || {};
  const lStats = linkedin.data?.stats || {};
  const radarStats = reputationRadar.data?.stats || {};
  const radarNegative = reputationRadar.data?.negativePosts || [];
  const radarPositive = reputationRadar.data?.positivePosts || [];
  const mentionStream = reputationRadar.data?.mentionStream || reputationRadar.data?.items || [];
  const radarClusters = reputationRadar.data?.clusters || [];
  const radarOwners = reputationRadar.data?.ownerQueues || [];
  const pPrimary = playstore.data?.apps?.[playstore.data?.primaryPackage] || {};
  const fStats = freshdesk.data?.stats || {};
  const fCategories = freshdesk.data?.categories || [];
  const contracts = [
    { id: "freshdesk", label: "Freshdesk", href: "/freshdesk", contract: freshdesk.data?.contract },
    { id: "playstore", label: "Play Store", href: "/playstore", contract: playstore.data?.contract },
    { id: "reddit", label: "Reddit", href: "/reddit", contract: reddit.data?.contract },
    { id: "instagram", label: "Instagram", href: "/instagram", contract: instagram.data?.contract },
    { id: "youtube", label: "YouTube", href: "/youtube", contract: youtube.data?.contract },
    { id: "google", label: "Google", href: "/google", contract: google.data?.contract },
    { id: "linkedin", label: "LinkedIn", href: "/linkedin", contract: linkedin.data?.contract },
  ];
  const incidentCandidates = contracts
    .flatMap((item) => (item.contract?.incidentCandidates || []).map((candidate: any) => ({ ...candidate, platformLabel: item.label, href: item.href })))
    .sort((a: any, b: any) => (b.crisisScore || 0) - (a.crisisScore || 0))
    .slice(0, 6);
  const iSent = iStats.sentiment || {};
  const ySent = yStats.sentiment || {};
  const lSent = lStats.sentiment || {};
  const totalSignals = (rStats.totalMentions || 0) + (iStats.totalPosts || 0) + (yStats.totalVideos || 0) + (gStats.totalAutocomplete || 0) + (lStats.totalPosts || 0) + (pPrimary.sampleSize || 0) + (fStats.totalTickets || 0);
  const urgentFreshdesk = (freshdesk.data?.urgentExamples || []).slice(0, 3);
  const playThemes = pPrimary.themes || [];
  const topPlayTheme = playThemes[0];
  const topFreshdesk = fCategories[0];
  const negativeAutocompleteRate = pct(gStats.negativeAutocomplete || 0, gStats.totalAutocomplete || 0);
  const youtubeWindow = youtube.data?.latest24hWindow || {};
  const youtubeShorts = (youtube.data?.latest24hShorts || []).map((video: any) => ({
    key: `yt-short-${video.videoId}`,
    platform: "Short",
    title: video.title,
    meta: `${formatNumber(video.views || 0)} views · ${formatNumber(video.comments || 0)} comments`,
    href: video.url,
    image: video.videoId ? `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg` : null,
    tone: video.triageLabel || video.channelName || "PW short",
    color: "#FF0000",
  }));
  const youtubeLongVideos = (youtube.data?.latest24hVideos || []).map((video: any) => ({
    key: `yt-video-${video.videoId}`,
    platform: "Video",
    title: video.title,
    meta: `${formatNumber(video.views || 0)} views · ${formatNumber(video.comments || 0)} comments`,
    href: video.url,
    image: video.videoId ? `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg` : null,
    tone: video.channelName || "PW video",
    color: "#FF0000",
  }));
  const instagramReels = (instagram.data?.pwReels || []).map((post: any, index: number) => ({
    key: `ig-reel-${post.postId || index}`,
    platform: "Reel",
    title: post.caption || `@${post.account} reel`,
    meta: `${formatNumber(post.likes || 0)} likes · ${formatNumber(post.reelPlays || 0)} plays`,
    href: post.url,
    image: post.thumbnailUrl,
    tone: `@${post.account || "physicswallah"}`,
    color: "#E1306C",
  }));
  const movementCards = [
    { platform: "Play Store", metric: "Low-rating rate", delta: latestDelta(pPrimary.monthlyTrend || [], "lowRatingRate"), context: `${pPrimary.averageRating || "—"}★ overall`, href: "/playstore" },
    { platform: "Reddit", metric: "Posts and comment heat", delta: latestDelta(reddit.data?.monthlyTrend || [], "comments"), context: "student debate depth", href: "/reddit" },
    { platform: "Instagram", metric: "Comment volume", delta: latestDelta(instagram.data?.monthlyTrend || [], "comments"), context: "under post/reel layer", href: "/instagram" },
    { platform: "YouTube", metric: "Video comment volume", delta: latestDelta(youtube.data?.monthlyTrend || [], "comments"), context: "watch-and-react layer", href: "/youtube" },
    { platform: "Google", metric: "Negative suggestion count", delta: latestDelta(google.data?.monthlyTrend || [], "negativeSuggestions"), context: "front-door reputation", href: "/google" },
    { platform: "LinkedIn", metric: "Professional reaction volume", delta: latestDelta(linkedin.data?.monthlyTrend || [], "count"), context: "employer-brand layer", href: "/linkedin" },
  ];
  const playRatingTrend = (pPrimary.monthlyTrend || []).filter((month: any) => month.month && month.month !== "Unknown").slice(-6);
  const playRatingValues = playRatingTrend.map((month: any) => Number(month.averageRating || 0)).filter(Boolean);
  const minPlayRating = Math.max(0, Math.min(...playRatingValues, 5) - 0.03);
  const maxPlayRating = Math.min(5, Math.max(...playRatingValues, 0) + 0.03);
  const playPulseChartData = playRatingTrend.map((month: any) => ({
    ...month,
    label: displayMonth(month.month),
    rating: Number(month.averageRating || 0),
    ratingArea: Number(month.averageRating || 0),
  }));
  const latestPlayMonth = playRatingTrend[playRatingTrend.length - 1] || {};
  const previousPlayMonth = playRatingTrend[playRatingTrend.length - 2] || {};
  const clusters = [
    ...((freshdesk.data?.clusters || freshdesk.data?.categories || []).slice(0, 2).map((item: any) => ({ platform: "Freshdesk", name: item.name, mentions: item.mentions || item.count, evidence: item.evidence || item.examples || [] }))),
    ...((playThemes || []).slice(0, 2).map((item: any) => ({ platform: "Play Store", name: item.name, mentions: item.mentions, evidence: item.examples || [] }))),
    ...((reddit.data?.clusters || []).slice(0, 2).map((item: any) => ({ platform: "Reddit", ...item }))),
    ...((instagram.data?.clusters || []).slice(0, 2).map((item: any) => ({ platform: "Instagram", ...item }))),
    ...((youtube.data?.clusters || []).slice(0, 2).map((item: any) => ({ platform: "YouTube", ...item }))),
    ...((google.data?.clusters || []).slice(0, 2).map((item: any) => ({ platform: "Google", ...item }))),
    ...((linkedin.data?.clusters || []).slice(0, 2).map((item: any) => ({ platform: "LinkedIn", ...item }))),
  ].sort((a: any, b: any) => (b.mentions || 0) - (a.mentions || 0)).slice(0, 6);

  return (
    <motion.div className="space-y-6" variants={stagger as any} initial="hidden" animate="show">
      <motion.section variants={fadeUp as any} className="rounded-2xl border border-purple/25 bg-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple">Leadership Daily View</p>
            <h1 className="mt-1 text-2xl font-bold">What students are saying across every surface</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              The useful story today is operational: support asks are dominated by store/logistics, Play Store comments are about teaching, access and delivery, Google has enrollment-risk suggestions, and social video surfaces show what is spreading.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xl font-bold">{formatNumber(totalSignals)}</p>
              <p className="text-[10px] text-muted-foreground">signals</p>
            </div>
            <div className="rounded-xl border border-orange-200 p-3">
              <p className="text-xl font-bold text-orange-600">{formatNumber(fStats.activeTickets || 0)}</p>
              <p className="text-[10px] text-muted-foreground">live tickets</p>
            </div>
            <div className="rounded-xl border border-red-200 p-3">
              <p className="text-xl font-bold text-red-600">{negativeAutocompleteRate}%</p>
              <p className="text-[10px] text-muted-foreground">negative Google</p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple">72-Hour Reputation Radar</p>
            <h2 className="mt-1 text-lg font-bold">Negative posts and good things around PW right now</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              Entity-aware scan across LinkedIn, Reddit, YouTube, Instagram, Google and Play Store. Parent posts stay on top; comments are evidence under the parent item.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-border px-3 py-2">
              <p className="text-lg font-bold">{formatNumber(radarStats.total || 0)}</p>
              <p className="text-[10px] text-muted-foreground">relevant items</p>
            </div>
            <div className="rounded-xl border border-red-200 px-3 py-2">
              <p className="text-lg font-bold text-red-600">{formatNumber(radarStats.negative || 0)}</p>
              <p className="text-[10px] text-muted-foreground">negative/mixed</p>
            </div>
            <div className="rounded-xl border border-green-200 px-3 py-2">
              <p className="text-lg font-bold text-green-600">{formatNumber(radarStats.positive || 0)}</p>
              <p className="text-[10px] text-muted-foreground">good things</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 dark:bg-red-950/10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-red-600">Negative in last 72h</p>
            <div className="mt-3 space-y-2">
              {radarNegative.slice(0, 4).map((item: any) => (
                <a key={item.id} href={item.url || "#"} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-red-100 bg-background p-3 hover:border-red-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-bold">{item.title}</p>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{item.impact?.finalPriorityScore || item.priorityScore}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.text || item.evidenceComments?.[0]?.text || "No text captured."}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{item.platform} · {item.issueCategory} · {item.businessOwner}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    escalation {item.impact?.escalationScore ?? "—"} · influence {item.impact?.influenceScore ?? "—"} · engagement {item.impact?.engagementScore ?? "—"}
                  </p>
                </a>
              ))}
              {!radarNegative.length ? <p className="rounded-xl border border-dashed border-red-200 p-3 text-xs text-muted-foreground">No negative PW-relevant parent posts in the last 72 hours.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50/40 p-4 dark:bg-green-950/10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600">Good things in last 72h</p>
            <div className="mt-3 space-y-2">
              {radarPositive.slice(0, 4).map((item: any) => (
                <a key={item.id} href={item.url || "#"} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-green-100 bg-background p-3 hover:border-green-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-bold">{item.title}</p>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">{item.impact?.finalPriorityScore || item.priorityScore}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.text || item.evidenceComments?.[0]?.text || "No text captured."}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{item.platform} · {item.issueCategory}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    influence {item.impact?.influenceScore ?? "—"} · engagement {item.impact?.engagementScore ?? "—"} · {item.authorProfile?.influenceSource || "unknown"}
                  </p>
                </a>
              ))}
              {!radarPositive.length ? <p className="rounded-xl border border-dashed border-green-200 p-3 text-xs text-muted-foreground">No positive PW-relevant parent posts in the last 72 hours.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Fastest issue clusters</p>
            <div className="mt-3 space-y-2">
              {radarClusters.slice(0, 4).map((cluster: any) => (
                <div key={`${cluster.sentiment}-${cluster.name}`} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold">{cluster.name}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{formatNumber(cluster.count)}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{cluster.businessOwner} · {cluster.platforms?.join(", ")}</p>
                </div>
              ))}
              {radarOwners.slice(0, 3).map((queue: any) => (
                <div key={queue.owner} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs">
                  <span>{queue.owner}</span>
                  <span className="font-bold">{formatNumber(queue.count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple">Latest Mentions</p>
            <h2 className="mt-1 text-lg font-bold">Every PW-relevant mention the radar picked up</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the raw mention stream after entity matching. Risk items stay in the escalation queue above.
            </p>
          </div>
          <div className="rounded-xl border border-border px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Matched</p>
            <p className="text-sm font-bold">{formatNumber(mentionStream.length)} latest</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {mentionStream.slice(0, 8).map((item: any) => {
            const meta = platformMeta[item.platform] || { label: item.platform, href: "#", color: "#6B7280" };
            return (
              <a key={`mention-${item.id}`} href={item.url || meta.href || "#"} target={item.url ? "_blank" : undefined} rel={item.url ? "noopener noreferrer" : undefined} className="rounded-xl border border-border bg-background p-3 hover:border-purple/40">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: meta.color }}>{meta.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.riskLane === "main_risk" ? "bg-red-100 text-red-700" : item.riskLane === "positive_signal" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {item.riskLane === "main_risk" ? "risk" : item.riskLane === "positive_signal" ? "positive" : "mention"}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-bold">{item.title}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{item.text || item.evidenceComments?.[0]?.text || "Mention captured without text body."}</p>
                <p className="mt-2 text-[10px] text-muted-foreground">{item.reputationIntent} · score {item.impact?.finalPriorityScore ?? item.priorityScore ?? "—"}</p>
              </a>
            );
          })}
          {!mentionStream.length ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground md:col-span-2 xl:col-span-4">No PW-relevant mentions found for this window.</p>
          ) : null}
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple">Leadership Pulse</p>
            <h2 className="mt-1 text-lg font-bold">Play Store rating momentum</h2>
            <p className="mt-1 text-xs text-muted-foreground">A quick read on whether app-store trust is improving or slipping month by month.</p>
          </div>
          <div className="rounded-xl border border-border px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Latest</p>
            <p className="text-sm font-bold">{displayMonth(latestPlayMonth.month)} · {latestPlayMonth.averageRating || "—"}★</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-border bg-background/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-3.5 rounded-full border-4 bg-background" style={{ borderColor: "#14B8A6" }} />
                <span>Average rating</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Hover points for volume and low-rating pressure.</p>
            </div>
            <div className="h-[310px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={playPulseChartData} margin={{ top: 8, right: 18, left: 2, bottom: 8 }}>
                  <defs>
                    <linearGradient id="commandCenterRatingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#14B8A6" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={12} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    domain={[minPlayRating, maxPlayRating]}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => `${Number(value).toFixed(2)}★`}
                    width={48}
                  />
                  {latestPlayMonth.month ? <ReferenceLine x={displayMonth(latestPlayMonth.month)} stroke="#14B8A6" strokeWidth={1} /> : null}
                  <Tooltip content={<PulseTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                  <Area type="linear" dataKey="ratingArea" stroke="transparent" fill="url(#commandCenterRatingGradient)" dot={false} activeDot={false} />
                  <Line
                    type="linear"
                    dataKey="rating"
                    name="Rating"
                    stroke="#14B8A6"
                    strokeWidth={2.5}
                    dot={{ fill: "hsl(var(--background))", strokeWidth: 2.5, r: 6, stroke: "#14B8A6" }}
                    activeDot={{ r: 7, fill: "hsl(var(--background))", stroke: "#14B8A6", strokeWidth: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">What it says</p>
              <p className="mt-2 text-sm leading-relaxed">
                App-store trust is at {latestPlayMonth.averageRating || "—"}★ in {displayMonth(latestPlayMonth.month)}.
                {previousPlayMonth.averageRating ? ` Movement vs ${displayMonth(previousPlayMonth.month)} is ${(Number(latestPlayMonth.averageRating || 0) - Number(previousPlayMonth.averageRating || 0)).toFixed(2)}★.` : ""}
              </p>
            </div>
            <Link href="/playstore" className="block rounded-2xl border border-[#34A853]/30 p-4 hover:border-[#34A853]/70">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#34A853]">Open detail</p>
              <p className="mt-2 text-sm font-bold">See versions, issue clusters and comment evidence</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(pPrimary.textReviewCount || 0)} written reviews are available for root-cause reading.</p>
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <PlatformCard id="freshdesk" metric={`${formatNumber(fStats.totalTickets || 0)} tickets`} sentiment={`${fStats.controlledRate || 0}% controlled, ${formatNumber(fStats.activeTickets || 0)} live`} issue={topFreshdesk ? `${topFreshdesk.name} is the biggest ask` : "Support issues available"} proof={topFreshdesk ? `${formatNumber(topFreshdesk.count)} tickets. Students are asking for order status, delivery clarity, access help, and payment/refund resolution.` : "Freshdesk export loaded."} />
        <PlatformCard id="playstore" metric={`${formatNumber(pPrimary.sampleSize || 0)} reviews`} sentiment={`${pPrimary.averageRating || "—"}★ average, ${pPrimary.lowRatingRate || 0}% low ratings`} issue={topPlayTheme ? `${topPlayTheme.name} leads written reviews` : "Written review themes available"} proof={topPlayTheme ? `${formatNumber(topPlayTheme.mentions)} written-review mentions. Read comments, not crash telemetry, to understand what students feel.` : "Play Store comments loaded."} />
        <PlatformCard id="reddit" metric={`${formatNumber(rStats.totalMentions || 0)} posts shown`} sentiment={`${rStats.positiveCount || 0} positive / ${rStats.negativeCount || 0} negative classified`} issue="Anonymous long-form trust debate" proof={`${rStats.topSubreddit || "Reddit"} is where students compare PW against alternatives and narrate frustration in detail.`} />
        <PlatformCard id="instagram" metric={`${formatNumber(iStats.totalPosts || 0)} posts`} sentiment={`${iSent.positive || 0} positive / ${iSent.negative || 0} negative`} issue="Campaign and community reaction" proof={`${formatNumber(iStats.totalReelPlays || 0)} reel plays. Comments show real asks behind polished posts.`} />
        <PlatformCard id="youtube" metric={`${formatNumber(yStats.totalVideos || 0)} videos`} sentiment={`${ySent.positive || 0} positive / ${ySent.negative || 0} negative`} issue={`${yStats.prRiskCount || 0} videos flagged for PR risk`} proof="Thumbnails and comments show which narratives students and creators are actually watching." />
        <PlatformCard id="google" metric={`${formatNumber(gStats.totalAutocomplete || 0)} suggestions`} sentiment={`${gStats.negativeAutocomplete || 0} negative, ${gStats.warningAutocomplete || 0} warning`} issue="Enrollment front-door risk" proof="Google autocomplete and SERP decide what parents see before they trust the brand." />
        <PlatformCard id="linkedin" metric={`${formatNumber(lStats.totalPosts || 0)} PW discussion posts`} sentiment={`${lSent.positive || 0} positive / ${lSent.negative || 0} negative`} issue="Professional reputation and employer-brand read" proof={`${formatNumber(lStats.evidenceComments || 0)} visible comments are attached under parent posts, so reactions support the post instead of becoming noisy top-level items.`} />
      </motion.section>

      <motion.section variants={fadeUp as any}>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Incident Candidates</p>
          <h2 className="mt-1 text-lg font-bold">Issues the algorithm would watch or open</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {incidentCandidates.map((incident: any) => (
              <Link key={`${incident.platformLabel}-${incident.id}`} href={incident.href} className="block rounded-xl border border-border p-4 hover:border-purple/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{incident.platformLabel} · {incident.status}</p>
                    <h3 className="mt-1 text-sm font-bold">{incident.title}</h3>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${incident.crisisScore >= 70 ? "bg-red-100 text-red-700" : incident.crisisScore >= 50 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                    {incident.crisisScore}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{incident.owner} · {incident.crisisLevel} · {incident.negativeShare}% negative evidence</p>
                <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{(incident.drivers || []).join(" · ")}</p>
              </Link>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <CarouselSection title="YouTube Shorts In Last 24h" eyebrow="PW Shorts Auto-Scroll" items={youtubeShorts} emptyCopy={`No PW-owned Shorts found in the latest 24h window${youtubeWindow.to ? ` ending ${new Date(youtubeWindow.to).toLocaleString("en-IN")}` : ""}.`} />
          <CarouselSection title="YouTube Videos In Last 24h" eyebrow="PW Video Auto-Scroll" items={youtubeLongVideos} emptyCopy={`No PW-owned long videos found in the latest 24h window${youtubeWindow.to ? ` ending ${new Date(youtubeWindow.to).toLocaleString("en-IN")}` : ""}.`} />
          <CarouselSection title="Instagram Reels Moving Now" eyebrow="PW Reels Carousel" items={instagramReels} emptyCopy="No official PW Instagram reels are ready for this view right now." />
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-purple" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Month On Month</p>
            <h2 className="text-lg font-bold">What changed since the previous month</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          {movementCards.map((card) => <MovementCard key={`${card.platform}-${card.metric}`} {...card} />)}
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cross-Platform Clusters</p>
        <h2 className="mt-1 text-lg font-bold">The student asks behind the charts</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clusters.map((cluster: any, index: number) => (
            <div key={`${cluster.platform}-${cluster.name}-${index}`} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{cluster.platform}</p>
                  <h3 className="mt-1 text-sm font-bold">{cluster.name}</h3>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{formatNumber(cluster.mentions || 0)}</span>
              </div>
              {evidenceText(cluster.evidence?.[0]) ? (
                <p className="mt-3 line-clamp-3 text-xs italic leading-relaxed text-muted-foreground">&ldquo;{evidenceText(cluster.evidence[0])}&rdquo;</p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Cluster available; evidence opens inside the platform detail view.</p>
              )}
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <h2 className="text-lg font-bold">What needs action now</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Link href="/freshdesk" className="rounded-xl border border-border p-4 hover:border-purple/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Support ask</p>
              <p className="mt-2 text-sm font-bold">Where is my order / access / refund?</p>
              <p className="mt-1 text-xs text-muted-foreground">{topFreshdesk ? `${formatNumber(topFreshdesk.count)} tickets in ${topFreshdesk.name}.` : "Freshdesk categories loaded."}</p>
            </Link>
            <Link href="/playstore" className="rounded-xl border border-border p-4 hover:border-purple/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">App-store feeling</p>
              <p className="mt-2 text-sm font-bold">Students praise teaching but complain about delivery/access.</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(pPrimary.textReviewCount || 0)} written reviews available.</p>
            </Link>
            <Link href="/google" className="rounded-xl border border-border p-4 hover:border-purple/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Reputation risk</p>
              <p className="mt-2 text-sm font-bold">Negative suggestions still appear in search.</p>
              <p className="mt-1 text-xs text-muted-foreground">{negativeAutocompleteRate}% of autocomplete suggestions are negative.</p>
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Heart className="h-4 w-4 text-green-600" />
            <h2 className="text-lg font-bold">Voice snippets</h2>
          </div>
          <div className="space-y-2">
            {urgentFreshdesk.map((ticket: any) => (
              <div key={ticket.ticketId} className="rounded-xl border border-border p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">Freshdesk · {ticket.group}</p>
                <p className="mt-1 line-clamp-2 text-xs">{ticket.subject}</p>
              </div>
            ))}
            {(youtube.data?.topComments || []).slice(0, 2).map((comment: any, index: number) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">YouTube comment</p>
                <p className="mt-1 line-clamp-2 text-xs">&ldquo;{comment.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
