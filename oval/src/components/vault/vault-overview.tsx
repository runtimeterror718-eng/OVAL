"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Disc3, Sparkles } from "lucide-react";
import { VaultNav } from "./vault-nav";
import { VAULT_CHANNEL_META, type EvidencePeriod, type VaultMood } from "@/lib/vault-types";
import { trackVaultEvent } from "@/lib/vault-analytics";
import { OvalLoadingSkeleton } from "@/components/ui/page-skeleton";

const periods: Array<{ id: EvidencePeriod; label: string }> = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "7d", label: "Last 7 Days" }, { id: "30d", label: "Last 30 Days" }, { id: "month", label: "Month Wise" },
];

const format = (value: number) => new Intl.NumberFormat("en-IN", { notation: value > 9999 ? "compact" : "standard" }).format(value);
const pct = (value: number, total: number) => total ? value / total * 100 : 0;

export function VaultOverview() {
  const [period, setPeriod] = useState<EvidencePeriod>("30d");
  const [moods, setMoods] = useState<VaultMood[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archive, setArchive] = useState<any[]>([]);

  useEffect(() => {
    trackVaultEvent("vault_opened", { period });
    const controller = new AbortController();
    setLoading(true); setError("");
    Promise.all([
      fetch(`/api/vault?period=${period}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || "Vault could not be loaded"); return response.json(); }),
      fetch("/api/vault/archive?limit=8", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : { snapshots: [] }),
    ]).then(([live, history]) => { setMoods(live.moods || []); setRole(live.currentMember?.role || ""); setArchive(history.snapshots || []); })
      .catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period]);

  return <main className="vault-page">
    <VaultNav role={role} />
    <section className="vault-hero">
      <div><p className="vault-kicker"><Disc3 size={15} /> AUDIENCE MOOD · MUSIC AS INTERPRETATION</p><h1>The Sentiment <em>Vault.</em></h1><p>Every channel has a temperature, a theme and a soundtrack. Open a room to hear the editorial mood and inspect the evidence behind it.</p></div>
      <div className="vault-hero-orbit"><span /><span /><span /><Disc3 /></div>
    </section>
    <section className="vault-filter"><span>Evidence window</span><div>{periods.map((item) => <button key={item.id} onClick={() => setPeriod(item.id)} className={period === item.id ? "active" : ""}>{item.label}</button>)}</div><small>Music never autoplays</small></section>
    {loading ? <OvalLoadingSkeleton embedded variant="vault" /> : error ? <section className="vault-state"><p>{error}</p><button onClick={() => location.reload()}>Retry</button></section> : <>
      <section className="vault-section-head"><div><p>LIVE CHANNEL ROOMS</p><h2>Eight signals. Eight soundtracks.</h2></div><span>{moods.reduce((sum, mood) => sum + mood.coverage.signalCount, 0).toLocaleString("en-IN")} qualifying signals</span></section>
      <section className="vault-grid">{moods.map((mood, index) => { const meta = VAULT_CHANNEL_META[mood.channel]; const total = mood.sentiment.positive + mood.sentiment.neutral + mood.sentiment.negative; return <Link key={mood.channel} href={`/vault/${mood.channel}?period=${period}`} className={`vault-channel-card tone-${mood.mood.valence} ${index === 0 ? "featured" : ""}`}>
        <header><span><Image src={meta.icon} width={34} height={34} alt="" />{meta.label}</span><ArrowUpRight size={18} /></header>
        <div className="vault-vinyl"><span><i /></span></div>
        <p className="vault-mood-label">{mood.mood.label}</p><h3>{mood.track ? <><strong>{mood.track.title}</strong><small>{mood.track.artist}</small></> : <strong>{mood.mood.label}</strong>}</h3>
        <p className="vault-theme"><Sparkles size={13} /> {mood.dominantTheme.name}</p>
        <p className="vault-comment">“{mood.slides[0]?.text || mood.mood.explanation}”</p>
        <div className="vault-sentiment-bar"><i className="positive" style={{ width: `${pct(mood.sentiment.positive, total)}%` }} /><i className="neutral" style={{ width: `${pct(mood.sentiment.neutral, total)}%` }} /><i className="negative" style={{ width: `${pct(mood.sentiment.negative, total)}%` }} /></div>
        <footer><span>{format(mood.coverage.signalCount)} signals</span><span>{mood.mood.confidence}% confidence</span></footer>
      </Link>; })}</section>
      <section className="vault-archive"><div className="vault-section-head"><div><p>WEEKLY ARCHIVE</p><h2>Moods worth remembering.</h2></div><CalendarDays size={24} /></div>{archive.length ? <div className="vault-archive-list">{archive.map((snapshot) => <Link key={snapshot.id} href={`/vault/${snapshot.channel}?archive=${snapshot.id}`} onClick={() => trackVaultEvent("archive_selected", { channel: snapshot.channel, weekStart: snapshot.week_start })}><span>{snapshot.week_start}</span><Image src={VAULT_CHANNEL_META[snapshot.channel as keyof typeof VAULT_CHANNEL_META].icon} width={25} height={25} alt="" /><strong>{VAULT_CHANNEL_META[snapshot.channel as keyof typeof VAULT_CHANNEL_META].label}</strong><p>{snapshot.mood_label}</p><small>{snapshot.track?.title || "No soundtrack"}</small><ArrowUpRight size={14} /></Link>)}</div> : <div className="vault-empty">The first weekly snapshot will appear after Monday’s 00:15 IST archive run.</div>}</section>
    </>}
  </main>;
}
