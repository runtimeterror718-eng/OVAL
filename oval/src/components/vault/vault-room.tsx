"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, CirclePause, CirclePlay, Disc3, ExternalLink, Music2, Sparkles } from "lucide-react";
import { VaultNav } from "./vault-nav";
import { VAULT_CHANNEL_META, type EvidencePeriod, type VaultChannel, type VaultMood } from "@/lib/vault-types";
import { trackVaultEvent } from "@/lib/vault-analytics";
import { OvalLoadingSkeleton } from "@/components/ui/page-skeleton";

const periods: Array<{ id: EvidencePeriod; label: string }> = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "7d", label: "Last 7 Days" }, { id: "30d", label: "Last 30 Days" }, { id: "month", label: "Month Wise" },
];

export function VaultRoom() {
  const params = useParams<{ channel: VaultChannel }>();
  const search = useSearchParams();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [mood, setMood] = useState<VaultMood | null>(null);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const period = (search.get("period") || "30d") as EvidencePeriod;
  const archived = Boolean(search.get("archive"));
  const query = search.toString();

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setIndex(0);
    fetch(`/api/vault/${params.channel}?${query}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || "This Vault room is unavailable"); return response.json(); })
      .then((payload) => { setMood(payload.mood); setRole(payload.currentMember?.role || ""); trackVaultEvent("vault_room_opened", { channel: params.channel, period, archived }); })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [archived, params.channel, period, query]);

  const move = useCallback((direction: number) => { setIndex((value) => mood?.slides.length ? (value + direction + mood.slides.length) % mood.slides.length : 0); trackVaultEvent("slide_navigated", { channel: params.channel, direction }); }, [mood?.slides.length, params.channel]);
  useEffect(() => {
    if (!mood?.slides.length || paused || focused || reducedMotion) return;
    const tick = window.setInterval(() => { if (!document.hidden) move(1); }, 5000);
    return () => window.clearInterval(tick);
  }, [focused, mood?.slides.length, move, paused, reducedMotion]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "ArrowRight") move(1); if (event.key === "ArrowLeft") move(-1); if (event.key === " ") { event.preventDefault(); setPaused((value) => !value); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [move]);

  const meta = VAULT_CHANNEL_META[params.channel];
  const slide = mood?.slides[index % Math.max(1, mood?.slides.length || 1)];
  const total = useMemo(() => mood ? mood.sentiment.positive + mood.sentiment.neutral + mood.sentiment.negative : 0, [mood]);
  const selectPeriod = (next: EvidencePeriod) => { const nextQuery = new URLSearchParams(search.toString()); nextQuery.set("period", next); router.replace(`/vault/${params.channel}?${nextQuery}`); };

  return <main className={`vault-page vault-room tone-${mood?.mood.valence || "mixed"}`}>
    <VaultNav role={role} />
    {loading ? <OvalLoadingSkeleton embedded variant="vault" /> : error || !mood ? <section className="vault-state"><p>{error || "No mood is available."}</p><Link href="/vault">Back to Vault</Link></section> : <>
      <section className="vault-room-heading"><Link href="/vault"><ArrowLeft size={16} /> All rooms</Link><div><Image src={meta.icon} width={38} height={38} alt="" /><span><p>{meta.label.toUpperCase()} · {mood.coverage.signalCount} QUALIFYING SIGNALS</p><h1>{mood.mood.label}</h1></span></div><strong>{mood.mood.confidence}%<small>confidence</small></strong></section>
      <section className="vault-room-filter"><div>{periods.map((item) => <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => selectPeriod(item.id)}>{item.label}</button>)}</div><p>{new Date(mood.coverage.from).toLocaleDateString("en-IN")} — {new Date(mood.coverage.to).toLocaleDateString("en-IN")}</p></section>
      <section className="vault-stage">
        <article className="vault-music-panel"><header><span><Music2 size={16} /> Channel soundtrack</span><small>User-controlled Spotify embed</small></header>{mood.track ? <><div className="vault-track-copy"><div className="vault-vinyl large"><span><i /></span></div><p>{mood.mood.valence} · {mood.mood.intensity}</p><h2>{mood.track.title}</h2><h3>{mood.track.artist}</h3></div><iframe title={`${mood.track.title} by ${mood.track.artist}`} src={mood.track.embedUrl} width="100%" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" onLoad={() => trackVaultEvent("spotify_embed_loaded", { channel: params.channel, trackId: mood.track?.spotifyTrackId })} /><a href={mood.track.spotifyUrl} target="_blank" rel="noreferrer" onClick={() => trackVaultEvent("spotify_outbound_clicked", { channel: params.channel, trackId: mood.track?.spotifyTrackId })}>Open in Spotify <ExternalLink size={13} /></a></> : <div className="vault-no-track"><Disc3 /><h2>{mood.mood.label}</h2><p>{mood.warnings[0] || "No approved soundtrack is available for this mood."}</p></div>}</article>
        <article className="vault-story-panel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} tabIndex={0} aria-label="Representative evidence story">
          <header><span><Sparkles size={16} /> Evidence story</span><small>Independent from music playback</small></header>
          {slide ? <AnimatePresence mode="wait"><motion.div key={slide.id} className="vault-slide" initial={reducedMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -18 }} transition={{ duration: .35 }}><div><span className={`sentiment-${slide.sentiment}`}>{slide.sentiment}</span><small>{slide.theme}</small></div><blockquote>“{slide.text}”</blockquote><footer><span><strong>{slide.author}</strong><small>{slide.date ? new Date(slide.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Current evidence"}</small></span>{slide.url ? <a href={slide.url} target="_blank" rel="noreferrer" aria-label="Open original source"><ArrowUpRight size={16} /></a> : <i>Protected source</i>}</footer></motion.div></AnimatePresence> : <div className="vault-no-track"><p>No representative comments matched this exact window.</p></div>}
          <div className="vault-story-controls"><button onClick={() => move(-1)} aria-label="Previous comment"><ChevronLeft /></button><button onClick={() => setPaused((value) => !value)} aria-label={paused ? "Resume slideshow" : "Pause slideshow"}>{paused ? <CirclePlay /> : <CirclePause />}</button><span>{mood.slides.map((item, dot) => <button key={item.id} className={dot === index ? "active" : ""} onClick={() => setIndex(dot)} aria-label={`Open comment ${dot + 1}`} />)}</span><small>{mood.slides.length ? index + 1 : 0} / {mood.slides.length}</small><button onClick={() => move(1)} aria-label="Next comment"><ChevronRight /></button></div>
        </article>
      </section>
      <section className="vault-reading"><article><p>WHY THIS MOOD</p><h2>{mood.mood.explanation}</h2><span>Music is an editorial interpretation, not an objective audience score.</span></article><article><p>DOMINANT SEMANTIC THEME</p><h2>{mood.dominantTheme.name}</h2><span>{mood.dominantTheme.summary}</span></article></section>
      <section className="vault-distribution"><header><div><p>SENTIMENT DISTRIBUTION</p><h2>{total.toLocaleString("en-IN")} classified signals</h2></div><span>{mood.algorithmVersion}</span></header><div>{(["positive", "neutral", "negative"] as const).map((sentiment) => <article key={sentiment}><span>{sentiment}</span><strong>{mood.sentiment[sentiment].toLocaleString("en-IN")}</strong><div><i className={sentiment} style={{ width: `${total ? mood.sentiment[sentiment] / total * 100 : 0}%` }} /></div><small>{total ? (mood.sentiment[sentiment] / total * 100).toFixed(1) : 0}%</small></article>)}</div></section>
      {mood.warnings.length ? <section className="vault-warnings">{mood.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section> : null}
    </>}
  </main>;
}
