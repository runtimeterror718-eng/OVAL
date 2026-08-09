"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUpRight, Bell, Bot, ChevronLeft, ChevronRight, Search, Send, Sparkles, X } from "lucide-react";

type SourceId = "playstore" | "linkedin" | "youtube" | "freshdesk" | "reddit" | "x" | "facebook" | "instagram";
type Reading = { label: string; value: number; tone: "positive" | "neutral" | "negative" };
type ChannelCard = { id: SourceId; label: string; icon: string; value: number; unit: string; summary: string; readings: Reading[] };
type Insight = { id: SourceId; label: string; icon: string; text: string; author: string; meta: string; href: string; external?: boolean };
type Signal = { source: SourceId; label: string; icon: string; title: string; text: string; sentiment: string; date?: string; url?: string };

const SOURCES: Record<SourceId, { label: string; icon: string }> = {
  playstore: { label: "Play Store", icon: "/platform-icons/play-store.png" },
  linkedin: { label: "LinkedIn", icon: "/platform-icons/linkedin.png" },
  youtube: { label: "YouTube", icon: "/platform-icons/youtube.webp" },
  freshdesk: { label: "Fresh Desk", icon: "/platform-icons/freshdesk.webp" },
  reddit: { label: "Reddit", icon: "/platform-icons/reddit.webp" },
  x: { label: "X", icon: "/platform-icons/x.svg" },
  facebook: { label: "Facebook", icon: "/platform-icons/facebook.svg" },
  instagram: { label: "Instagram", icon: "/platform-icons/instagram.svg" },
};

const overviewSources = ["playstore", "freshdesk", "linkedin", "x", "instagram", "youtube"] as const;
const sourceEndpoint = (source: (typeof overviewSources)[number]) => source === "instagram" ? `/api/owned-social/${source}` : `/api/${source}`;

const n = (value: unknown) => Number(value || 0);
const fmt = (value: number) => new Intl.NumberFormat("en-IN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
const clean = (value: unknown) => String(value || "").replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();
const brief = (value: unknown, fallback: string, max = 165) => { const text = clean(value) || fallback; return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text; };
const postBody = (value: unknown) => {
  const raw = String(value || "");
  const body = raw.includes("---") ? raw.split("---").slice(1).join("---").split("## Comments")[0] : raw;
  return clean(body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^[-*>]+\s*/gm, ""));
};
const share = (part: number, total: number) => total ? part / total * 100 : 0;

export function AudienceIntelligenceOverview() {
  const router = useRouter();
  const intelligenceRef = useRef<HTMLElement>(null);
  const [feeds, setFeeds] = useState<Record<string, any>>({});
  const [semanticFeeds, setSemanticFeeds] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [insightIndex, setInsightIndex] = useState(0);
  const [driverIndex, setDriverIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [question, setQuestion] = useState("What needs attention across OVAL right now?");
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all(overviewSources.map(async (source) => {
      const response = await fetch(sourceEndpoint(source), { cache: "no-store" });
      if (!response.ok && source === "instagram") return [source, { stats: {}, posts: [], connections: [] }] as const;
      if (!response.ok) throw new Error(source);
      return [source, await response.json()] as const;
    })).then((entries) => { if (!cancelled) setFeeds(Object.fromEntries(entries)); })
      .catch(() => { if (!cancelled) setError("One or more live intelligence feeds could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    Promise.all(overviewSources.map(async (source) => {
      const response = await fetch(`/api/vector-summary?platform=${source}`, { cache: "no-store" });
      return [source, response.ok ? await response.json() : null] as const;
    })).then((entries) => { if (!cancelled) setSemanticFeeds(Object.fromEntries(entries)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(() => {
    const playstore = feeds.playstore || {}; const app = playstore.apps?.[playstore.primaryPackage] || {};
    const linkedin = feeds.linkedin || {}; const linkedinStats = linkedin.stats || {};
    const youtube = feeds.youtube || {}; const youtubeSentiment = youtube.stats?.sentiment || {};
    const freshdesk = feeds.freshdesk || {}; const freshdeskStats = freshdesk.stats || {};
    const x = feeds.x || {}; const xStats = x.stats || {};
    const instagram = feeds.instagram || {}; const instagramStats = instagram.stats || {};
    const rating = (ratingValue: number) => n(app.ratingDistribution?.find((item: any) => n(item.rating) === ratingValue)?.count);
    const playPositive = rating(4) + rating(5); const playNeutral = rating(3); const playNegative = n(app.lowRatingCount);
    const freshdeskTotal = n(freshdeskStats.totalTickets); const freshdeskActive = n(freshdeskStats.activeTickets);
    const freshdeskClosed = (freshdesk.statusBreakdown || []).filter((item: any) => ["closed", "resolved"].includes(String(item.status).toLowerCase())).reduce((sum: number, item: any) => sum + n(item.count), 0);
    const cards: ChannelCard[] = [
      { id: "playstore", label: "Play Store", icon: SOURCES.playstore.icon, value: n(app.sampleSize), unit: "reviews captured", summary: `${n(app.averageRating).toFixed(2)}★ average; ${fmt(playNegative)} low-rating reviews need attention.`, readings: [{ label: "4–5★", value: playPositive, tone: "positive" }, { label: "3★", value: playNeutral, tone: "neutral" }, { label: "1–2★", value: playNegative, tone: "negative" }] },
      { id: "freshdesk", label: "Fresh Desk", icon: SOURCES.freshdesk.icon, value: freshdeskTotal, unit: "tickets captured", summary: `${fmt(freshdeskActive)} tickets remain active and require operational follow-through.`, readings: [{ label: "Closed", value: freshdeskClosed, tone: "positive" }, { label: "Other", value: Math.max(0, freshdeskTotal - freshdeskClosed - freshdeskActive), tone: "neutral" }, { label: "Active", value: freshdeskActive, tone: "negative" }] },
      { id: "linkedin", label: "LinkedIn", icon: SOURCES.linkedin.icon, value: n(linkedinStats.totalPosts), unit: "posts captured", summary: `${fmt(n(linkedinStats.positive))} positive posts; ${fmt(n(linkedinStats.negative))} critical posts need review.`, readings: [{ label: "Positive", value: n(linkedinStats.positive), tone: "positive" }, { label: "Neutral", value: n(linkedinStats.neutral), tone: "neutral" }, { label: "Negative", value: n(linkedinStats.negative), tone: "negative" }] },
      { id: "x", label: "X", icon: SOURCES.x.icon, value: n(xStats.totalPosts), unit: x.setupRequired ? "developer connection pending" : "posts captured", summary: x.setupRequired ? "Connect the official X bearer token to retrieve recent public posts." : `${fmt(n(xStats.positive))} positive; ${fmt(n(xStats.negative))} critical posts need review.`, readings: [{ label: "Positive", value: n(xStats.positive), tone: "positive" }, { label: "Neutral", value: n(xStats.neutral), tone: "neutral" }, { label: "Negative", value: n(xStats.negative), tone: "negative" }] },
      { id: "instagram", label: "Instagram", icon: SOURCES.instagram.icon, value: n(instagramStats.totalSignals), unit: "owned signals captured", summary: instagram.connections?.length ? `${fmt(n(instagramStats.totalComments))} comments or replies across connected accounts.` : "Connect an Instagram Professional account from Integrations.", readings: [{ label: "Positive", value: n(instagramStats.positive), tone: "positive" }, { label: "Neutral", value: n(instagramStats.neutral), tone: "neutral" }, { label: "Negative", value: n(instagramStats.negative), tone: "negative" }] },
      { id: "youtube", label: "YouTube", icon: SOURCES.youtube.icon, value: n(youtubeSentiment.total), unit: "signals classified", summary: `${youtubeSentiment.overall || "Mixed"} sentiment; ${fmt(n(youtubeSentiment.negative))} negative signals.`, readings: [{ label: "Positive", value: n(youtubeSentiment.positive), tone: "positive" }, { label: "Neutral", value: n(youtubeSentiment.neutral), tone: "neutral" }, { label: "Negative", value: n(youtubeSentiment.negative), tone: "negative" }] },
    ];
    const linkedinLead = linkedin.summary?.topNegatives?.[0] || linkedin.posts?.[0];
    const playLead = (app.criticalReviews || app.liveReviews || [])[0];
    const freshdeskLead = freshdesk.urgentExamples?.[0] || freshdesk.activeExamples?.[0] || freshdesk.clusters?.[0];
    const xLead = x.posts?.[0];
    const instagramLead = instagram.posts?.[0]?.comments?.[0] || instagram.posts?.[0];
    const insights: Insight[] = [];
    if (playLead?.text) insights.push({ id: "playstore", label: "Play Store", icon: SOURCES.playstore.icon, text: brief(playLead.text, "", 245), author: playLead.author || "Play Store reviewer", meta: `${playLead.rating || "—"}★ review${playLead.version ? ` · App ${playLead.version}` : ""}`, href: "/audience-intelligence/playstore" });
    if (freshdeskLead?.description) insights.push({ id: "freshdesk", label: "Fresh Desk", icon: SOURCES.freshdesk.icon, text: brief(freshdeskLead.description, "", 245), author: "Freshdesk learner", meta: `${freshdeskLead.status || "Active"} ticket${freshdeskLead.subject ? ` · ${freshdeskLead.subject}` : ""}`, href: "/audience-intelligence/freshdesk" });
    if (linkedinLead?.text || linkedinLead?.title) insights.push({ id: "linkedin", label: "LinkedIn", icon: SOURCES.linkedin.icon, text: brief(postBody(linkedinLead.text) || linkedinLead.title, "", 265), author: linkedinLead.author || "LinkedIn author", meta: `${linkedinLead.sentiment || "Public"} post${linkedinLead.publishedAt ? ` · ${new Date(linkedinLead.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`, href: linkedinLead.url || "/audience-intelligence/linkedin", external: Boolean(linkedinLead.url) });
    if (xLead?.text) insights.push({ id: "x", label: "X", icon: SOURCES.x.icon, text: brief(xLead.text, "", 245), author: xLead.author ? `@${xLead.author}` : "X author", meta: `${xLead.sentiment || "Public"} post${xLead.createdAt ? ` · ${new Date(xLead.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`, href: xLead.url || "/audience-intelligence/x", external: Boolean(xLead.url) });
    if (instagramLead?.text) insights.push({ id: "instagram", label: "Instagram", icon: SOURCES.instagram.icon, text: brief(instagramLead.text, "", 245), author: instagramLead.author || "Instagram author", meta: instagramLead.parentCommentId ? "Audience reply" : "Owned-channel post", href: instagramLead.url || "/audience-intelligence/instagram", external: Boolean(instagramLead.url) });
    const signal = (source: SourceId, item: any, title: string, text: unknown, sentiment: string, date?: string, url?: string): Signal => ({ source, label: SOURCES[source].label, icon: SOURCES[source].icon, title: clean(title), text: brief(text, "Open this signal to inspect the available evidence.", 230), sentiment, date, url });
    const signals: Signal[] = [
      ...(app.criticalReviews || []).slice(0, 2).map((item: any) => signal("playstore", item, `${item.rating || "—"}★ app review`, item.text, n(item.rating) <= 2 ? "negative" : "neutral", item.date)),
      ...(freshdesk.clusters || []).slice(0, 1).map((item: any) => signal("freshdesk", item, item.label || item.name || "Support cluster", item.summary || item.examples?.[0]?.description, "attention")),
      ...(linkedin.posts || []).slice(0, 2).map((item: any) => signal("linkedin", item, item.title || item.author || "LinkedIn signal", item.summary || item.text, item.sentiment, item.publishedAt, item.url)),
      ...(x.posts || []).slice(0, 2).map((item: any) => signal("x", item, `@${item.author || "X user"}`, item.text, item.sentiment, item.createdAt, item.url)),
      ...(instagram.posts || []).slice(0, 1).map((item: any) => signal("instagram", item, item.author || "Official Instagram account", item.text, item.sentiment, item.publishedAt, item.url)),
      ...(youtube.youtubeBriefBuckets || []).slice(0, 1).map((item: any) => signal("youtube", item, item.title, item.evidence, item.sentiment || item.severity)),
    ].filter((item) => item.text);
    const critical = playNegative + freshdeskActive + n(linkedinStats.negative) + n(xStats.negative) + n(instagramStats.negative) + n(youtubeSentiment.negative);
    const total = cards.reduce((sum, card) => sum + card.value, 0);
    const semanticParts = overviewSources.map((source) => semanticFeeds[source]?.clusters?.[0]?.label).filter(Boolean);
    const clusterFor = (source: (typeof overviewSources)[number]) => semanticFeeds[source]?.clusters?.[0];
    const playCluster = clusterFor("playstore"); const freshdeskCluster = clusterFor("freshdesk");
    const linkedinCluster = clusterFor("linkedin"); const xCluster = clusterFor("x"); const youtubeCluster = clusterFor("youtube");
    const crossChannelSummary = semanticParts.length
      ? `${playCluster?.label || "App stability and loading failures"} are driving Play Store criticism. Freshdesk complaints are concentrated around ${String(freshdeskCluster?.label || "tests, admit cards and registrations").toLowerCase()}. LinkedIn conversations are shifting toward ${String(linkedinCluster?.label || "workplace culture").toLowerCase()}, while YouTube criticism is primarily focused on ${String(youtubeCluster?.label || "teacher-led discussion").toLowerCase()}.`
      : "App experience is driving the strongest product criticism. Freshdesk complaints remain concentrated around time-sensitive learner access. LinkedIn is shaping the workplace narrative, while YouTube discussion is primarily teacher-led.";
    const narratedCards = cards.map((card) => {
      const semantic = semanticFeeds[card.id]?.summary;
      const fallback = card.id === "instagram" && !instagram.connections?.length
        ? "Connect PW’s official Instagram account to reveal the audience comments, recurring questions and emerging narratives currently hidden from this view."
        : card.summary;
      const narrative = [semantic?.what_is_happening || semantic?.headline, semantic?.why_it_matters]
        .map(clean).filter((part, index, all) => part && all.indexOf(part) === index).join(" ");
      return { ...card, summary: brief(narrative, fallback, 235) };
    });
    const drivers = overviewSources.flatMap((source) => {
      const cluster = clusterFor(source);
      const summary = semanticFeeds[source]?.summary;
      if (!cluster) return [];
      return [{ source, label: SOURCES[source].label, icon: SOURCES[source].icon, title: clean(cluster.label), summary: brief(cluster.summary || summary?.what_is_happening, "This theme is recurring across the latest evidence.", 215), why: brief(summary?.why_it_matters, "The pattern is material enough to monitor and validate against source evidence.", 180), count: n(cluster.count), share: n(cluster.share), risk: summary?.risk_level || cluster.risk_level || "watch" }];
    }).sort((a, b) => b.share - a.share || b.count - a.count);
    const forecasts = [
      playCluster && { eyebrow: "PRODUCT EXPERIENCE", title: `${playCluster.label} will remain the clearest conversion risk`, text: brief(semanticFeeds.playstore?.summary?.why_it_matters, `${fmt(n(playCluster.count))} signals make this the leading Play Store theme.`, 210), metric: `${n(playCluster.share).toFixed(1)}% share`, tone: "warm" },
      freshdeskCluster && { eyebrow: "SUPPORT PRESSURE", title: `${freshdeskCluster.label} is likely to keep creating repeat demand`, text: brief(semanticFeeds.freshdesk?.summary?.why_it_matters, `${fmt(n(freshdeskCluster.count))} related support signals require operational follow-through.`, 210), metric: `${fmt(n(freshdeskCluster.count))} cases`, tone: "dark" },
      (xCluster || linkedinCluster || youtubeCluster) && { eyebrow: "PUBLIC NARRATIVE", title: `${xCluster?.label || "Public reach"} will drive visibility; trust will be decided elsewhere`, text: `Watch ${String(linkedinCluster?.label || "professional reputation").toLowerCase()} on LinkedIn and ${String(youtubeCluster?.label || "teacher discussion").toLowerCase()} on YouTube. These themes can determine whether reach becomes durable trust.`, metric: `${n(xCluster?.share).toFixed(1)}% on X`, tone: "cool" },
    ].filter(Boolean) as Array<{ eyebrow: string; title: string; text: string; metric: string; tone: string }>;
    const topIssue = semanticFeeds.freshdesk?.clusters?.[0]?.label || semanticFeeds.playstore?.clusters?.[0]?.label || app.themes?.[0]?.name || "Audience experience";
    return { cards: narratedCards, insights, signals, drivers, forecasts, critical, total, topIssue, crossChannelSummary, semanticReady: semanticParts.length > 0, freshness: linkedin.generatedAt || playstore.livePulledAt || freshdesk.generatedAt };
  }, [feeds, semanticFeeds]);

  useEffect(() => {
    if (paused || !model.insights.length) return;
    const timer = window.setInterval(() => setInsightIndex((value) => (value + 1) % model.insights.length), 3500);
    return () => window.clearInterval(timer);
  }, [paused, model.insights.length]);

  const activeInsight = model.insights[insightIndex % Math.max(1, model.insights.length)];
  const activeDriver = model.drivers[driverIndex % Math.max(1, model.drivers.length)];
  const queuedInsights = [2, 1].map((offset) => model.insights[(insightIndex + offset) % Math.max(1, model.insights.length)]).filter(Boolean);
  const visibleCards = model.cards.filter((card) => !query || `${card.label} ${card.summary} ${card.unit}`.toLowerCase().includes(query.toLowerCase()));
  const moveInsight = (direction: number) => setInsightIndex((value) => (value + direction + model.insights.length) % model.insights.length);

  return <main className="audience-studio ai-overview-page">
    <div className="ai-ambient ai-ambient-one" /><div className="ai-ambient ai-ambient-two" />
    <header className="ai-topbar">
      <button className="ai-brand-group" onClick={() => router.replace("/audience-intelligence/overview")}><span className="ai-brand-mark">O</span><span><strong>OVAL</strong><small>AUDIENCE INTELLIGENCE</small></span></button>
      <nav className="ai-source-nav" aria-label="Intelligence channels"><button className="active">Overview</button>{overviewSources.map((source) => <button key={source} onClick={() => router.replace(`/audience-intelligence/${source}`)}>{SOURCES[source].label}</button>)}<button onClick={() => router.replace("/vault")}>Vault</button><button onClick={() => router.replace("/integrations")}>Integrations</button></nav>
      <div className="ai-top-actions"><div className={`ai-search ${searchOpen ? "open" : ""}`}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search overview signals" /><button onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}>{searchOpen ? <X size={15} /> : <span />}</button></div><button className="ai-icon-button ai-notification" onClick={() => setAssistantOpen(true)}><Bell size={16} /></button><button className="ai-avatar">AT</button></div>
    </header>

    {loading ? <section className="ai-loading"><span /><p>Assembling the live cross-channel overview…</p></section> : error ? <section className="ai-loading"><p>{error}</p><button onClick={() => location.reload()}>Retry</button></section> : <>
      <section className="ai-overview-hero"><div className="ai-overview-title"><p className="ai-eyebrow">What PW should know today?</p><h1>Overview</h1><p>{model.crossChannelSummary}</p><button className="ai-know-more" onClick={() => intelligenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Know more <ArrowDown size={15} /></button><div className="ai-overview-dots"><i /><i /><i /></div></div>
        <div className="ai-insight-stack" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>{queuedInsights.map((insight, index) => <article key={`${insight.id}-${index}`} className={`ai-insight-back back-${index + 1}`}><Image src={insight.icon} width={30} height={30} alt="" /><p>“{insight.text}”</p></article>)}<AnimatePresence mode="popLayout" initial={false}>{activeInsight && <motion.article key={`${activeInsight.id}-${insightIndex}`} className="ai-insight-card" initial={{ opacity: 0, x: 110, rotate: 4, scale: .94 }} animate={{ opacity: 1, x: 0, rotate: 0, scale: 1 }} exit={{ opacity: 0, x: -170, y: 14, rotate: -7, scale: .9 }} transition={{ duration: .62, ease: [.22, 1, .36, 1] }}><header><span><Image src={activeInsight.icon} width={32} height={32} alt="" />{activeInsight.label}</span><i>REAL SOURCE</i><ArrowUpRight size={18} /></header><div className="ai-insight-author"><strong>{activeInsight.author}</strong><small>{activeInsight.meta}</small></div><blockquote>“{activeInsight.text}”</blockquote><div className="ai-insight-actions"><a href={activeInsight.href} target={activeInsight.external ? "_blank" : undefined} rel="noreferrer">Open original evidence <ArrowUpRight size={12} /></a><footer><button onClick={() => moveInsight(-1)}><ChevronLeft size={16} /></button><span>{insightIndex + 1} / {model.insights.length}</span><button onClick={() => moveInsight(1)}><ChevronRight size={16} /></button></footer></div></motion.article>}</AnimatePresence></div>
      </section>

      <section className="ai-overview-summary"><span>Cross-channel reading</span><p><strong>{fmt(model.total)}</strong> total captured signals</p><p><strong>{fmt(model.critical)}</strong> signals requiring attention</p><p>Updated {model.freshness ? new Date(model.freshness).toLocaleString("en-IN") : "on latest refresh"}</p></section>

      <section ref={intelligenceRef} id="intelligence-by-source" className="ai-overview-channels"><div className="ai-section-heading ai-source-section-heading"><div><h2>Intelligence by source</h2></div><p>What each audience channel is telling PW now</p></div><div className="ai-overview-card-grid">{visibleCards.map((card, index) => <button key={card.id} className={index === 0 ? "featured" : ""} onClick={() => router.replace(`/audience-intelligence/${card.id}`)}><header><span><Image src={card.icon} width={30} height={30} alt="" />{card.label}</span><ArrowUpRight size={16} /></header><div className="ai-channel-volume"><strong>{fmt(card.value)}</strong><small>{card.unit}</small></div><p>{card.summary}</p><span className="ai-channel-cta">Know more <ArrowUpRight size={13} /></span></button>)}</div></section>

      <section className="ai-conversation-section"><div className="ai-section-heading"><div><p className="ai-eyebrow">CROSS-CHANNEL ISSUE INTELLIGENCE</p><h2>What’s driving the conversation</h2></div><p>Ranked by semantic share, signal volume and business exposure.</p></div>{model.drivers.length && activeDriver ? <div className="ai-driver-layout"><div className="ai-driver-list" role="list" aria-label="Top semantic issue clusters">{model.drivers.slice(0, 5).map((driver, index) => <button key={driver.source} className={driverIndex === index ? "selected" : ""} onClick={() => setDriverIndex(index)} role="listitem"><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{driver.title}</h3><small>{fmt(driver.count)} signals · {driver.label}</small></div><b>{driver.share.toFixed(1)}%</b><i>{String(driver.risk).toUpperCase()}</i><ArrowUpRight size={16} /></button>)}</div><aside className="ai-driver-detail"><header><span>OVAL SYNTHESIS</span><span>{String(activeDriver.risk).toUpperCase()} PRIORITY</span></header><Image src={activeDriver.icon} width={38} height={38} alt="" /><h3>{activeDriver.title}</h3><p>{activeDriver.summary}</p><div className="ai-driver-source-chips"><span>{activeDriver.label}</span><span>Semantic cluster</span></div><div className="ai-driver-metrics"><div><small>Share of conversation</small><strong>{activeDriver.share.toFixed(1)}%</strong></div><div><small>Evidence</small><strong>{fmt(activeDriver.count)}</strong></div></div><button onClick={() => router.replace(`/audience-intelligence/${activeDriver.source}`)}>Open evidence <ArrowUpRight size={14} /></button></aside></div> : <p className="ai-empty-semantic">Semantic themes will appear after the next vector-summary refresh.</p>}</section>

      <section className="ai-narrative-forecast"><div className="ai-forecast-intro"><p className="ai-eyebrow">NARRATIVE FORECAST <span>BETA</span></p><h2>What may become important next</h2><p>Early direction detected through semantic concentration, repetition and cross-channel movement—not generic sentiment prediction.</p><button onClick={() => intelligenceRef.current?.scrollIntoView({ behavior: "smooth" })}>Review source intelligence <ArrowUpRight size={14} /></button></div>{model.forecasts.slice(0, 2).map((forecast, index) => <article key={forecast.eyebrow} className={`ai-forecast-card tone-${index === 0 ? "warm" : "cool"}`}><header><span>{String(index + 1).padStart(2, "0")}</span><b>{forecast.metric}</b></header><h3>{forecast.title}</h3><p>{forecast.text}</p><footer>{forecast.eyebrow}<ArrowUpRight size={13} /></footer></article>)}</section>
    </>}

    {assistantOpen && <aside className="ai-overview-assistant"><header><span><Bot size={17} />AI Assistant</span><button onClick={() => setAssistantOpen(false)}><X size={17} /></button></header><div className="ai-overview-conversation"><section><span>PW</span><div><b>Physics Wallah</b><p>{question}</p></div></section><section><span>O</span><div><b>OVAL</b><p>The leading cross-channel pattern is <strong>{model.topIssue}</strong>. Current monitored feeds contain <strong>{fmt(model.critical)}</strong> signals requiring attention.</p><div><i style={{ width: `${Math.min(100, share(model.critical, model.total))}%` }} /></div><small>AI-generated read · validate against source evidence</small></div></section></div><form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { setQuestion(draft.trim()); setDraft(""); } }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask OVAL about the live signals" /><button><Send size={15} /></button></form></aside>}
    <button className="ai-overview-fab" onClick={() => setAssistantOpen(!assistantOpen)} aria-label="Open OVAL AI Assistant">{assistantOpen ? <X size={20} /> : <Sparkles size={20} />}</button>
  </main>;
}
