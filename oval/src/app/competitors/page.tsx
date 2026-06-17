"use client";

import { motion } from "framer-motion";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy, ExternalLink } from "lucide-react";
import RAGInsight from "@/components/dashboard/rag-insight";
import { useLiveData } from "@/lib/use-live-data";
import { formatNumber, cn } from "@/lib/utils";
import { AnimatedChart, AnimatedNumber } from "@/components/ui/animated-chart";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { stagger, fadeUp } from "@/lib/animations";

const COLORS: Record<string, string> = { PW: "#534AB7", Allen: "#1D9E75", Unacademy: "#378ADD", "BYJU'S": "#9CA3AF", BYJU: "#9CA3AF", Aakash: "#BA7517", Vedantu: "#D4537E" };
const SENT_COLORS = { positive: "#639922", neutral: "#9CA3AF", negative: "#E24B4A" };

export default function CompetitorsPage() {
  const { data: live, isLive, loading } = useLiveData<any>("/api/competitors", null);

  if (loading) return <PageSkeleton title="Competitive Intelligence" color="#BA7517" />;

  const sovRaw = live?.shareOfVoice || {};
  const sovTotal = Object.values(sovRaw).reduce((s: number, v: any) => s + (v as number), 0) as number;
  const sov = Object.entries(sovRaw).map(([name, mentions]) => ({
    name, mentions: mentions as number,
    pct: Math.round(((mentions as number) / Math.max(sovTotal, 1)) * 100),
  })).sort((a, b) => b.mentions - a.mentions);

  const competitors = live?.competitors || [];
  const negAmps = live?.negativeAmplifiers || [];
  const stats = live?.stats || {};

  return (
    <motion.div className="max-w-6xl mx-auto px-4 py-6 space-y-6" variants={stagger} initial="hidden" animate="show">

      <motion.div variants={fadeUp}>
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h1 className="text-2xl font-bold tracking-tight">Competitive Intelligence</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Where PW stands in the edtech conversation</p>
      </motion.div>

      {/* RAG Analysis at top */}
      {isLive && live?.rag?.enabled && (
        <motion.div variants={fadeUp}>
          <RAGInsight title="Competitive Analysis" analysis={live.rag.analysis} confidence={live.rag.confidence} mentionsUsed={live.rag.mentionsUsed} avgSimilarity={live.rag.avgSimilarity} />
        </motion.div>
      )}

      {/* Metrics */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Total Mentions</p>
          <p className="text-xl font-bold mt-0.5"><AnimatedNumber value={stats.totalMentions || 0} /></p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Competitor Mentions</p>
          <p className="text-xl font-bold mt-0.5"><AnimatedNumber value={stats.competitorMentions || 0} /></p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-3">
          <p className="text-[10px] text-purple-600 uppercase tracking-widest font-semibold">PW Share</p>
          <p className="text-xl font-bold mt-0.5 text-purple-600">{sov.find(s => s.name === "PW")?.pct || 0}%</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-3">
          <p className="text-[10px] text-red-600 uppercase tracking-widest font-semibold">Negative Content</p>
          <p className="text-xl font-bold mt-0.5 text-red-600"><AnimatedNumber value={negAmps.length} /></p>
        </div>
      </motion.div>

      {/* Share of Voice Chart */}
      {sov.length > 0 && (
        <AnimatedChart delay={0} className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Share of Voice</h3>
          <ResponsiveContainer width="100%" height={Math.max(sov.length * 45, 160)}>
            <BarChart data={sov} layout="vertical" margin={{ left: 10, right: 30 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => [`${formatNumber(v)} mentions`, ""]} />
              <Bar dataKey="mentions" radius={[0, 6, 6, 0]} barSize={22} animationDuration={1500}>
                {sov.map((e) => <Cell key={e.name} fill={COLORS[e.name] || "#9CA3AF"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3 justify-center">
            {sov.map(s => (
              <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[s.name] || "#9CA3AF" }} />
                <span className="font-medium">{s.name}</span> — {s.pct}%
              </span>
            ))}
          </div>
        </AnimatedChart>
      )}

      {/* Competitor Breakdown Cards */}
      {competitors.length > 0 && (
        <motion.div variants={fadeUp}>
          <h3 className="text-sm font-bold mb-3">Competitor Breakdown</h3>
          <div className="space-y-3">
            {competitors.map((c: any) => {
              const quotes: string[] = c.comparison_quotes || [];
              const sentBreakdown = c.sentimentBreakdown || {};
              const sentData = Object.entries(sentBreakdown).filter(([,v]) => (v as number) > 0).map(([k, v]) => ({
                name: k, value: v as number, color: SENT_COLORS[k as keyof typeof SENT_COLORS] || "#9CA3AF"
              }));
              const platforms = typeof c.platforms === "object" && !Array.isArray(c.platforms)
                ? Object.entries(c.platforms).map(([p, n]) => ({ platform: p, count: n as number })) : [];

              return (
                <div key={c.name} className="rounded-2xl border border-border bg-card p-5 hover:shadow-sm transition-shadow" style={{ borderLeftWidth: 4, borderLeftColor: COLORS[c.name] || "#9CA3AF" }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-base font-bold">{c.name}</h4>
                      <p className="text-xs text-muted-foreground">{c.mentions} mentions across platforms</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                        c.sentiment === "negative" ? "bg-red-100 text-red-700" : c.sentiment === "positive" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>{c.sentiment}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Sentiment mini chart */}
                    {sentData.length > 0 && (
                      <div className="flex items-center gap-3">
                        <ResponsiveContainer width={60} height={60}>
                          <PieChart><Pie data={sentData} cx="50%" cy="50%" innerRadius={18} outerRadius={28} dataKey="value" strokeWidth={0}>
                            {sentData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie></PieChart>
                        </ResponsiveContainer>
                        <div className="text-[10px] space-y-0.5">
                          {sentData.map(d => <div key={d.name} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: d.color}} />{d.name}: {d.value}</div>)}
                        </div>
                      </div>
                    )}

                    {/* Quotes */}
                    <div className="md:col-span-2 space-y-1.5">
                      {quotes.slice(0, 2).map((q, i) => (
                        <p key={i} className="text-xs italic text-muted-foreground border-l-2 border-gray-200 dark:border-gray-700 pl-2 line-clamp-2">&ldquo;{q.slice(0, 180)}&rdquo;</p>
                      ))}
                      {platforms.length > 0 && (
                        <div className="flex gap-1.5 mt-1">
                          {platforms.map(p => <span key={p.platform} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{p.platform}: {p.count}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Negative Content */}
      {negAmps.length > 0 && (
        <motion.div variants={fadeUp}>
          <h3 className="text-sm font-bold mb-3">Negative Content Requiring Attention ({negAmps.length})</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {negAmps.slice(0, 15).map((amp: any, i: number) => {
              const text = (amp.text || amp.quote || "").slice(0, 200);
              const url = amp.source_url || amp.url || "";
              const hasUrl = url && url !== "#" && url.startsWith("http");
              const cardInner = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground/80 italic line-clamp-2 flex-1">&ldquo;{text}&rdquo;</p>
                    {hasUrl && (
                      <ExternalLink className="w-3.5 h-3.5 text-red-400 group-hover:text-red-600 shrink-0 mt-0.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{amp.platform}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">{amp.sentiment || amp.keyword}</span>
                    {hasUrl && (
                      <span className="text-[10px] text-muted-foreground/70 ml-auto">View source &rarr;</span>
                    )}
                  </div>
                </>
              );
              return hasUrl ? (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-xl border border-border bg-card p-3 border-l-4 border-l-red-400 hover:bg-card/80 hover:border-l-red-600 transition-colors"
                >
                  {cardInner}
                </a>
              ) : (
                <div key={i} className="rounded-xl border border-border bg-card p-3 border-l-4 border-l-red-400">
                  {cardInner}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
