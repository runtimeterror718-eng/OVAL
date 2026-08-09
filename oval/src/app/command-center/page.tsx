"use client";

import Link from "next/link";
import Image from "next/image";
import { Bot, ChevronLeft, ChevronRight, ExternalLink, FileText, ImageIcon, Mic, Plus, Send, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLiveData } from "@/lib/use-live-data";
import { formatNumber } from "@/lib/utils";

type ChannelSegment = { label: string; value: number; tone: "positive" | "neutral" | "negative" };
const sourceIcons: Record<string, string> = {
  "Play Store": "/platform-icons/play-store.png",
  LinkedIn: "/platform-icons/linkedin.png",
  YouTube: "/platform-icons/youtube.webp",
  Freshdesk: "/platform-icons/freshdesk.webp",
  Reddit: "/platform-icons/reddit.webp",
};

function ChannelCard({ label, href, iconSrc, value, unit, summary, segments }: { label: string; href: string; iconSrc: string; value: number; unit: string; summary: string; segments: ChannelSegment[] }) {
  const segmentTotal = segments.reduce((sum, segment) => sum + segment.value, 0);
  return <Link className="cp-metric cp-channel-card" href={href}><header><span><Image src={iconSrc} alt="" width={22} height={22} className="cp-channel-logo" />{label}</span><ExternalLink aria-hidden="true" /></header><strong>{formatNumber(value)}</strong><p className="cp-channel-unit">{unit}</p><p className="cp-channel-summary" title={summary}>{summary}</p><div className="cp-distribution" role="img" aria-label={segments.map((segment) => `${segment.label}: ${segment.value}`).join(", ")}>{segments.map((segment) => <span key={segment.label} className={`cp-segment-${segment.tone}`} style={{ width: `${share(segment.value, segmentTotal)}%` }} />)}</div><div className="cp-segment-legend">{segments.map((segment) => <span key={segment.label}><i className={`cp-dot-${segment.tone}`} />{segment.label}<b>{formatNumber(segment.value)}</b></span>)}</div></Link>;
}

function share(part: number, total: number) { return total > 0 ? (part / total) * 100 : 0; }
function briefSignal(value: unknown, fallback: string) {
  const text = String(value || fallback).replace(/^negative\s*/i, "").replace(/\s+/g, " ").trim();
  return text.length > 170 ? `${text.slice(0, 167).trimEnd()}…` : text;
}

export default function CommandCenter() {
  const [insightIndex, setInsightIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("What needs attention across OVAL right now?");
  const reddit = useLiveData<any>("/api/reddit", null);
  const linkedin = useLiveData<any>("/api/linkedin", null);
  const youtube = useLiveData<any>("/api/youtube", null);
  const playstore = useLiveData<any>("/api/playstore", null, { refreshMs: 60 * 60 * 1000 });
  const freshdesk = useLiveData<any>("/api/freshdesk", null);
  const loading = [reddit, linkedin, youtube, playstore, freshdesk].some((source) => source.loading);
  const app = playstore.data?.apps?.[playstore.data?.primaryPackage] || {};
  const topIssue = app.themes?.[0]?.name || reddit.data?.clusters?.[0]?.name || "No dominant issue";
  const linkedinSignals = Number(linkedin.data?.stats?.totalPosts || 0);
  const appCritical = Number(app.lowRatingCount || 0);
  const linkedinCritical = Number(linkedin.data?.stats?.negative || 0);
  const redditCritical = Number(reddit.data?.stats?.negativeCount || 0);
  const freshdeskSignals = Number(freshdesk.data?.stats?.totalTickets || 0);
  const freshdeskAttention = Number(freshdesk.data?.stats?.activeTickets || 0);
  const playRatingCount = (rating: number) => Number(app.ratingDistribution?.find((item: any) => Number(item.rating) === rating)?.count || 0);
  const playPositive = playRatingCount(4) + playRatingCount(5);
  const playNeutral = playRatingCount(3);
  const youtubeSentiment = youtube.data?.stats?.sentiment || {};
  const youtubeSignals = Number(youtubeSentiment.total || youtube.data?.stats?.totalComments || 0);
  const youtubePositive = Number(youtubeSentiment.positive || 0);
  const youtubeNeutral = Number(youtubeSentiment.neutral || 0);
  const youtubeNegative = Number(youtubeSentiment.negative || 0);
  const freshdeskClosed = (freshdesk.data?.statusBreakdown || []).filter((item: any) => ["closed", "resolved"].includes(String(item.status).toLowerCase())).reduce((sum: number, item: any) => sum + Number(item.count || 0), 0);
  const freshdeskOther = Math.max(0, freshdeskSignals - freshdeskClosed - freshdeskAttention);
  const freshness = linkedin.data?.generatedAt || playstore.data?.generatedAt || freshdesk.data?.generatedAt;
  const linkedinLead = linkedin.data?.summary?.topNegatives?.[0] || (linkedin.data?.posts || []).find((post: any) => String(post.sentiment).toLowerCase() === "negative");
  const redditLead = (reddit.data?.posts || []).find((post: any) => String(post.sentiment).toLowerCase() === "negative") || reddit.data?.posts?.[0];
  const playstoreLead = (app.criticalReviews || app.liveReviews || [])[0];
  const youtubeLead = youtube.data?.attentionCards?.[0] || youtube.data?.prRiskVideos?.[0];
  const freshdeskLead = freshdesk.data?.urgentExamples?.[0] || freshdesk.data?.activeExamples?.[0];
  const liveSignals = [
    ...(linkedin.data?.posts || []).slice(0, 2).map((post: any) => ({ source: "LinkedIn", title: post.title || post.author || "Public LinkedIn signal", text: post.text || post.summary, url: post.url, time: post.publishedAt, state: post.sentiment || "neutral" })),
    ...(reddit.data?.posts || []).slice(0, 2).map((post: any) => ({ source: "Reddit", title: post.title || "Reddit discussion", text: post.text || post.body, url: post.url, time: post.createdAt || post.date, state: post.sentiment || "neutral" })),
    ...(app.criticalReviews || app.liveReviews || []).slice(0, 2).map((review: any) => ({ source: "Play Store", title: `${review.rating || "—"}★ app review`, text: review.text, url: review.url, time: review.date, state: Number(review.rating || 5) <= 2 ? "critical" : "neutral" })),
    ...(freshdesk.data?.categories || []).slice(0, 2).map((item: any) => ({ source: "Freshdesk", title: item.label || item.name || "Support cluster", text: item.summary || item.examples?.[0]?.description || item.examples?.[0]?.text || item.examples?.[0]?.subject, time: freshness, state: "attention" })),
  ].filter((item) => item.text).slice(0, 6);
  const insights = [
    { title: "LinkedIn", iconSrc: sourceIcons.LinkedIn, text: briefSignal(linkedinLead?.summary || linkedinLead?.title, `${formatNumber(linkedinCritical)} LinkedIn posts currently need attention.`), href: linkedinLead?.url || "/linkedin", external: Boolean(linkedinLead?.url) },
    { title: "Reddit", iconSrc: sourceIcons.Reddit, text: briefSignal(redditLead?.title || redditLead?.snippet, `${formatNumber(redditCritical)} Reddit discussions are currently classified as negative.`), href: redditLead?.url || "/reddit", external: Boolean(redditLead?.url) },
    { title: "Play Store", iconSrc: sourceIcons["Play Store"], text: briefSignal(playstoreLead?.text, `${formatNumber(appCritical)} low-rating Play Store reviews need attention.`), href: playstoreLead?.url || "/playstore", external: Boolean(playstoreLead?.url) },
    { title: "YouTube", iconSrc: sourceIcons.YouTube, text: briefSignal(youtubeLead?.detail || youtubeLead?.title, `${formatNumber(youtubeNegative)} YouTube comments are currently classified as negative.`), href: youtubeLead?.url || "/youtube", external: Boolean(youtubeLead?.url) },
    { title: "Freshdesk", iconSrc: sourceIcons.Freshdesk, text: briefSignal(freshdeskLead?.description || freshdeskLead?.subject, `${formatNumber(freshdeskAttention)} support tickets remain active.`), href: "/freshdesk", external: false },
  ];
  const activeInsight = insights[insightIndex];
  const changeInsight = (direction: number) => setInsightIndex((current) => (current + direction + insights.length) % insights.length);
  const stackedInsights = [1, 2].map((offset) => insights[(insightIndex + offset) % insights.length]);
  const askAssistant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuestion = assistantQuery.trim();
    if (!nextQuestion) return;
    setAssistantQuestion(nextQuestion);
    setAssistantQuery("");
  };
  useEffect(() => {
    if (carouselPaused) return;
    const timer = window.setInterval(() => setInsightIndex((current) => (current + 1) % insights.length), 2000);
    return () => window.clearInterval(timer);
  }, [carouselPaused, insights.length]);

  return <div className="cp-overview">
    <section className="cp-hero">
      <div className="cp-heading"><p>Data based on active OVAL sources</p><h2>Overview Panel</h2></div>
      <div className="cp-insights" aria-label="High-attention evidence carousel" onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)} onFocusCapture={() => setCarouselPaused(true)} onBlurCapture={() => setCarouselPaused(false)}>
        {stackedInsights.slice().reverse().map((insight, reverseIndex) => {
          const depth = stackedInsights.length - reverseIndex;
          return <article key={`back-${insight.title}`} className={`cp-insight-back cp-insight-back-${depth}`} aria-hidden="true"><p><Image src={insight.iconSrc} alt="" width={28} height={28} className="cp-carousel-source-icon" /></p><h3>&ldquo;{insight.text}&rdquo;</h3></article>;
        })}
        <AnimatePresence initial={false} mode="popLayout">
          <motion.article
            key={insightIndex}
            className="cp-insight-card"
            initial={{ x: 70, opacity: 0, scale: 0.96 }}
            animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
            exit={{ x: -240, y: 20, opacity: 0, rotate: -7, scale: 0.94 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => { if (info.offset.x < -70 || info.velocity.x < -450) changeInsight(1); }}
          >
            <p><Image src={activeInsight.iconSrc} alt="" width={30} height={30} className="cp-carousel-source-icon" /><span className="sr-only">{activeInsight.title}</span><ExternalLink /></p>
            <h3>&ldquo;{activeInsight.text}&rdquo;</h3>
            <a className="cp-insight-evidence-link" href={activeInsight.href} target={activeInsight.external ? "_blank" : undefined} rel={activeInsight.external ? "noopener noreferrer" : undefined}>Open evidence <ExternalLink /></a>
            <div className="cp-carousel-controls"><button onClick={() => changeInsight(-1)} aria-label="Previous insight"><ChevronLeft /></button><span>{insightIndex + 1} / {insights.length}</span><button onClick={() => changeInsight(1)} aria-label="Remove current card and show next insight"><ChevronRight /></button></div>
            <small>Drag left or use the arrow to dismiss this card</small>
          </motion.article>
        </AnimatePresence>
      </div>
    </section>
    {loading ? <p className="cp-loading">Updating live readings as sources respond…</p> : null}
    <section className="cp-grid">
      <div className="cp-left-grid">
        <ChannelCard label="Play Store" href="/playstore" iconSrc="/platform-icons/play-store.png" value={Number(app.sampleSize || 0)} unit="reviews captured" summary={`${Number(app.averageRating || 0).toFixed(2)}★ average; ${formatNumber(appCritical)} low-rating reviews need attention.`} segments={[{ label: "4–5★", value: playPositive, tone: "positive" }, { label: "3★", value: playNeutral, tone: "neutral" }, { label: "1–2★", value: appCritical, tone: "negative" }]} />
        <ChannelCard label="LinkedIn" href="/linkedin" iconSrc="/platform-icons/linkedin.png" value={linkedinSignals} unit="posts captured" summary={`Conversation is positive-leaning; ${formatNumber(linkedinCritical)} posts are negative.`} segments={[{ label: "Positive", value: Number(linkedin.data?.stats?.positive || 0), tone: "positive" }, { label: "Neutral", value: Number(linkedin.data?.stats?.neutral || 0), tone: "neutral" }, { label: "Negative", value: linkedinCritical, tone: "negative" }]} />
        <ChannelCard label="YouTube" href="/youtube" iconSrc="/platform-icons/youtube.webp" value={youtubeSignals} unit="comments classified" summary={`${youtubeSentiment.overall || "Mixed"} sentiment; ${formatNumber(youtubeNegative)} comments are negative.`} segments={[{ label: "Positive", value: youtubePositive, tone: "positive" }, { label: "Neutral", value: youtubeNeutral, tone: "neutral" }, { label: "Negative", value: youtubeNegative, tone: "negative" }]} />
        <ChannelCard label="Freshdesk" href="/freshdesk" iconSrc="/platform-icons/freshdesk.webp" value={freshdeskSignals} unit="tickets captured" summary={`${formatNumber(freshdeskAttention)} tickets are active and require operational follow-through.`} segments={[{ label: "Closed", value: freshdeskClosed, tone: "positive" }, { label: "Other", value: freshdeskOther, tone: "neutral" }, { label: "Active", value: freshdeskAttention, tone: "negative" }]} />
      </div>
    </section>
    <section className="cp-live-stream">
      <div className="cp-live-heading"><div><p>Live intelligence</p><h3>Latest source evidence</h3><small>Recent posts, reviews, discussions, and support patterns requiring validation.</small></div><span>{liveSignals.length} verified signals</span></div>
      <div className="cp-live-list">{liveSignals.length ? liveSignals.map((signal, index) => {
        const tone = ["negative", "critical", "attention"].includes(String(signal.state).toLowerCase()) ? "critical" : String(signal.state).toLowerCase() === "positive" ? "positive" : "neutral";
        return <article className="cp-evidence-card" key={`${signal.source}-${index}`}><header><span className="cp-evidence-source"><Image src={sourceIcons[signal.source] || sourceIcons.Freshdesk} alt="" width={24} height={24} />{signal.source}</span><span className={`cp-evidence-badge cp-evidence-${tone}`}>{tone === "critical" ? "Needs attention" : tone}</span></header><div className="cp-evidence-body"><h4>{signal.title}</h4><p>{String(signal.text).replace(/\s+/g, " ").slice(0, 210)}</p></div><footer><small>{signal.time ? new Date(signal.time).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Latest refresh"}</small>{signal.url ? <a href={signal.url} target="_blank" rel="noopener noreferrer">View evidence <ExternalLink /></a> : <span>Internal evidence</span>}</footer></article>;
      }) : <p className="cp-empty">No source evidence is available yet. The next successful collector refresh will populate this stream.</p>}</div>
    </section>
    <p className="cp-freshness">Updated {freshness ? new Date(freshness).toLocaleString("en-IN") : "when the latest source refresh completes"}</p>
    {assistantOpen ? <aside className="cp-ai-float-panel" aria-label="OVAL AI Assistant">
      <header><span><Bot aria-hidden="true" />AI Assistant</span><button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close AI assistant"><X aria-hidden="true" /></button></header>
      <div className="cp-ai-conversation">
        <section><span className="cp-ai-user-avatar">PW</span><div><b>Physics Wallah</b><p>{assistantQuestion}</p></div></section>
        <section><span className="cp-ai-oval-avatar">O</span><div><b>OVAL</b><p>The leading cross-channel pattern is <strong>{topIssue}</strong>. Current attention volume includes {formatNumber(appCritical)} low-rating reviews, {formatNumber(linkedinCritical)} negative LinkedIn posts, and {formatNumber(freshdeskAttention)} active support tickets.</p><div className="cp-ai-mini-reading"><span style={{ width: `${share(appCritical, appCritical + linkedinCritical + freshdeskAttention)}%` }} /><i style={{ width: `${share(linkedinCritical, appCritical + linkedinCritical + freshdeskAttention)}%` }} /><b /></div><small>AI-generated read · validate against evidence</small></div></section>
      </div>
      <div className="cp-ai-tools"><label><FileText />Files<input type="file" /></label><label><ImageIcon />Images<input type="file" accept="image/*" /></label><button type="button" onClick={() => setAssistantQuery("Summarise the latest voice-of-customer themes")}><Mic />Audio Chat</button></div>
      <form className="cp-ai-composer" onSubmit={askAssistant}><input value={assistantQuery} onChange={(event) => setAssistantQuery(event.target.value)} placeholder="Enter your AI Assistant request" aria-label="AI Assistant request" /><label aria-label="Attach supporting file"><Plus /><input type="file" /></label><button type="submit" aria-label="Send request"><Send /></button></form>
    </aside> : null}
    <button type="button" className="cp-ai-fab" aria-expanded={assistantOpen} aria-label={assistantOpen ? "Close OVAL AI Assistant" : "Open OVAL AI Assistant"} onClick={() => setAssistantOpen((current) => !current)}><Bot aria-hidden="true" /></button>
  </div>;
}
