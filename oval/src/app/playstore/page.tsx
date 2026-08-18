"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Box,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  Filter,
  Search,
  ShieldAlert,
  Share2,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { VectorChannelSummary } from "@/components/dashboard/vector-channel-summary";
import {
  DataTableShell,
  PanelHeader,
} from "@/components/ui/dashboard-primitives";
import { fadeUp } from "@/lib/animations";
import { useLiveData } from "@/lib/use-live-data";
import { cn, formatNumber } from "@/lib/utils";

type Review = {
  rating?: number | null;
  text?: string | null;
  version?: string | null;
  date?: string | null;
  replied?: boolean | null;
  theme?: string | null;
  owner?: string | null;
  score?: number | null;
  author?: string | null;
};

type EvidencePanel = {
  title: string;
  subtitle: string;
  reviews: Review[];
  insights?: { label: string; value: string; tone?: "red" | "amber" | "green" | "violet" }[];
  bullets?: string[];
};

type LiveIssue = {
  label: string;
  summary: string;
  count: number;
  windowLabel: string;
  reviews: Review[];
  versions: string[];
  latestDate?: string | null;
};

function normalizeEvidenceReviews(items: unknown): Review[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item): Review | null => {
      if (typeof item === "string") return { text: item };
      if (!item || typeof item !== "object") return null;
      const review = item as Record<string, unknown>;
      return {
        rating: typeof review.rating === "number" ? review.rating : review.rating ? Number(review.rating) : null,
        text: review.text == null ? null : String(review.text),
        version: review.version == null ? null : String(review.version),
        date: review.date == null ? null : String(review.date),
        replied: typeof review.replied === "boolean" ? review.replied : null,
        theme: review.theme == null ? null : String(review.theme),
        owner: review.owner == null ? null : String(review.owner),
        score: typeof review.score === "number" ? review.score : review.score ? Number(review.score) : null,
        author: review.author == null ? null : String(review.author),
      };
    })
    .filter((review): review is Review => Boolean(review?.text));
}

function displayDate(date?: string | null) {
  if (!date) return "Unknown";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function displayMonth(month?: string | null) {
  if (!month) return "Unknown";
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-IN", { month: "short" });
}

function displayMonthYear(month?: string | null) {
  if (!month) return "Unknown";
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function monthKeysBetween(startMonth: string, endMonth: string) {
  const start = new Date(`${startMonth}-01T00:00:00`);
  const end = new Date(`${endMonth}-01T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function displayShortDate(date?: string | null) {
  if (!date) return "Unknown";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function daysBefore(date?: string | null, days = 30) {
  const parsed = date ? new Date(`${date}T00:00:00`) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const next = new Date(base);
  next.setDate(base.getDate() - days);
  return next;
}

function issueWindowLabel(days: number) {
  if (days <= 1) return "today";
  if (days === 2) return "last 48 hours";
  if (days === 3) return "last 72 hours";
  return `last ${days} days`;
}

function detectLatestStudentIssue(reviews: Array<Review & { commercialRisk?: { label?: string | null } }>, endDate?: string | null): LiveIssue | null {
  const windowDays = 14;
  const windowStart = daysBefore(endDate, windowDays - 1);
  const windowEnd = endDate ? new Date(`${endDate}T23:59:59`) : new Date();
  const recentNegatives = reviews.filter((review) => {
    if (!(Number(review.rating || 0) <= 2) || !review.text) return false;
    const parsed = review.date ? new Date(`${review.date}T12:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) && parsed >= windowStart && parsed <= windowEnd;
  });
  if (!recentNegatives.length) return null;

  const rules = [
    {
      label: "Admit-card banner is blocking lectures",
      summary: "Students say an admit-card, roll-number, or exam-form banner is forcing the wrong flow, throwing invalid errors, or preventing lectures from opening.",
      pattern: /admit\s*card|roll\s*no|invalid error|banner|popup|pop up|form/i,
    },
    {
      label: "Paid batch access is failing",
      summary: "Recent low-star reviews say payments succeeded but paid batches, tests, or purchased access did not unlock correctly.",
      pattern: /purchased|purchase|paid|payment|pro batch|regular batch|not get access|did not get access|can't attempt test|test paper|batch access|access to regular batch/i,
    },
    {
      label: "App performance is disrupting study flow",
      summary: "Students report lag, delays, glitches, and app-open failures that are interrupting lectures and navigation.",
      pattern: /lag|delay|glitch|not opening|not open|network issue|slow|30 40 second|backend|not work properly|doesn't work|do not work/i,
    },
    {
      label: "Refund and support complaints are active",
      summary: "Recent reviews say refunds, books, or support follow-ups are unresolved despite repeated requests.",
      pattern: /refund|support|no response|not responsibl|complaint|books|ticket|resolution/i,
    },
    {
      label: "Teacher and batch complaints are back",
      summary: "Students are flagging schedule changes, faculty dissatisfaction, or batch-experience mismatch in recent reviews.",
      pattern: /teacher|faculty|schedule|3 class per day|class per day|offline class/i,
    },
  ];

  const matched = rules
    .map((rule) => {
      const matchedReviews = recentNegatives.filter((review) => rule.pattern.test(String(review.text || "")));
      const sorted = [...matchedReviews].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      return { ...rule, reviews: sorted, count: matchedReviews.length, latestDate: sorted[0]?.date || null };
    })
    .filter((rule) => rule.count > 0)
    .sort((a, b) => b.count - a.count || String(b.latestDate || "").localeCompare(String(a.latestDate || "")));

  const winner = matched[0];
  if (winner) {
    return {
      label: winner.label,
      summary: winner.summary,
      count: winner.count,
      windowLabel: issueWindowLabel(windowDays),
      reviews: winner.reviews,
      versions: Array.from(new Set(winner.reviews.map((review) => review.version).filter(Boolean) as string[])).slice(0, 3),
      latestDate: winner.latestDate,
    };
  }

  const fallbackReviews = [...recentNegatives].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const fallback = fallbackReviews[0];
  return {
    label: fallback?.commercialRisk?.label || "Latest negative student issue",
    summary: "Recent low-star written reviews are active and need manual readout for precise routing.",
    count: recentNegatives.length,
    windowLabel: issueWindowLabel(windowDays),
    reviews: fallbackReviews,
    versions: Array.from(new Set(fallbackReviews.map((review) => review.version).filter(Boolean) as string[])).slice(0, 3),
    latestDate: fallback?.date || null,
  };
}

function RatingStars({ rating = 0, size = "h-3 w-3" }: { rating?: number | null; size?: string }) {
  const value = Math.max(0, Math.min(5, Number(rating || 0)));
  return (
    <div className="relative inline-block" aria-label={`${value} star rating`}>
      <div className="flex w-max items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className={cn(size, "shrink-0 fill-slate-200 text-slate-200")} />
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${(value / 5) * 100}%` }}>
        <div className="flex w-max items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star key={index} className={cn(size, "shrink-0 fill-amber-400 text-amber-400")} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <CruipCard className={className}>{children}</CruipCard>;
}

function SectionTitle({ title, subtitle, action = "View all", onAction }: { title: string; subtitle?: string; action?: string | null; onAction?: () => void }) {
  return (
    <PanelHeader
      className="mb-4"
      title={title}
      subtitle={subtitle}
      action={action ? <button onClick={onAction} className="text-xs font-semibold text-[var(--brand)] hover:underline">{action}</button> : null}
    />
  );
}

type DeckCard = {
  kind: "summary" | "category";
  label: string;
  owner?: string;
  count: number;
  share?: number;
  deltaVsPrior?: number | null;
  topCategory?: string;
  versions?: string[];
  reviews: Review[];
};

const deckVariants = {
  enter: (direction: number) => ({ x: direction >= 0 ? 360 : -360, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction >= 0 ? -360 : 360, opacity: 0 }),
};

function FlashDeck({ cards, onOpen, subtitle, toolbar }: { cards: DeckCard[]; onOpen: (card: DeckCard) => void; subtitle?: string; toolbar?: React.ReactNode }) {
  const [[index, direction], setIndex] = useState<[number, number]>([0, 0]);
  const count = cards.length;
  const go = (dir: number) => setIndex(([current]) => [(current + dir + count) % count, dir]);
  const card = count ? cards[Math.min(index, count - 1)] : null;
  const deltaLabel = card?.deltaVsPrior == null
    ? null
    : card.deltaVsPrior === 0
      ? "flat vs prior period"
      : `${card.deltaVsPrior > 0 ? "+" : ""}${card.deltaVsPrior} vs prior period`;
  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
            <AlertTriangle className="h-4 w-4 text-red-500" /> What&apos;s going wrong
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle || "Negative written reviews · swipe or use arrows"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-black text-slate-500">{count ? `${Math.min(index + 1, count)} / ${count}` : "0 / 0"}</span>
          <button onClick={() => go(-1)} aria-label="Previous card" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors duration-200 hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => go(1)} aria-label="Next card" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors duration-200 hover:bg-slate-50">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {toolbar}
      {!card ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
          No negative written reviews match the selected class and date range.
        </div>
      ) : (
      <div className="relative min-h-[240px]">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={`${card.label}-${index}`}
            custom={direction}
            variants={deckVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -400) go(1);
              else if (info.offset.x > 80 || info.velocity.x > 400) go(-1);
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            {card.kind === "summary" ? (
              <div className="rounded-2xl bg-gradient-to-br from-red-50 via-rose-50 to-amber-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">14-day negative pulse</p>
                <div className="mt-3 flex flex-wrap items-end gap-6">
                  <div>
                    <p className="text-5xl font-black tracking-tight text-slate-950">{card.count}</p>
                    <p className="mt-1 text-xs font-bold text-slate-600">negative written reviews</p>
                  </div>
                  {deltaLabel ? (
                    <p className={cn("rounded-full px-3 py-1.5 text-xs font-black", (card.deltaVsPrior || 0) > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>{deltaLabel}</p>
                  ) : null}
                </div>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-700">
                  {card.topCategory ? <>Biggest driver: <span className="font-black">{card.topCategory}</span>. </> : null}
                  Swipe through each issue class to see the raw student comments behind it.
                </p>
                <button onClick={() => onOpen(card)} className="mt-4 cursor-pointer rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 transition-colors duration-200 hover:bg-red-50">
                  Open all {card.count} comments <ChevronRight className="inline h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black text-slate-950">{card.label}</p>
                  </div>
                  <span className="rounded-full bg-red-100 px-3 py-1.5 text-sm font-black text-red-700">{card.count}</span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {card.reviews.slice(0, 2).map((review, reviewIndex) => (
                    <div key={reviewIndex} className="rounded-xl border border-red-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <RatingStars rating={review.rating || 0} />
                        <span className="text-[10px] font-bold text-slate-500">v{review.version || "?"} · {displayShortDate(review.date)}</span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-700">&ldquo;{review.text}&rdquo;</p>
                    </div>
                  ))}
                </div>
                {card.versions?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {card.versions.map((version) => (
                      <span key={version} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-700">v{version}</span>
                    ))}
                  </div>
                ) : null}
                <button onClick={() => onOpen(card)} className="mt-3 cursor-pointer rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-600 transition-colors duration-200 hover:bg-violet-50">
                  Open all {card.count} comments <ChevronRight className="inline h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      )}
      {count > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5">
          {cards.map((dotCard, dotIndex) => (
            <button
              key={`${dotCard.label}-${dotIndex}`}
              onClick={() => setIndex(([current]) => [dotIndex, dotIndex > current ? 1 : -1])}
              aria-label={`Go to card ${dotIndex + 1}`}
              className={cn("h-1.5 cursor-pointer rounded-full transition-all duration-200", dotIndex === Math.min(index, count - 1) ? "w-6 bg-violet-600" : "w-1.5 bg-slate-300 hover:bg-slate-400")}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function SectionBand({ index, title, subtitle }: { index: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-end gap-3 px-1 pt-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-xs font-black text-white">{index}</span>
      <div className="min-w-0">
        <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="mb-2 ml-2 hidden h-px flex-1 bg-gradient-to-r from-slate-300 to-transparent sm:block" />
    </div>
  );
}

function EvidenceModal({ panel, onClose }: { panel: EvidencePanel; onClose: () => void }) {
  const reviews = normalizeEvidenceReviews(panel.reviews);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const toneClass: Record<string, string> = {
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
  };
  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose} role="dialog" aria-modal="true" aria-label={panel.title}>
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, y: 24, x: "-50%" }}
        animate={{ opacity: 1, y: 0, x: "-50%" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="absolute bottom-0 left-1/2 w-full max-w-6xl rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 md:bottom-8 md:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Review Evidence</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{panel.title}</h2>
            <p className="mt-1 text-xs text-slate-500">{panel.subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close review evidence">
            <X className="h-4 w-4" />
          </button>
        </div>
        {panel.insights?.length ? (
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            {panel.insights.map((insight) => (
              <div key={insight.label} className={cn("rounded-2xl border p-4", toneClass[insight.tone || "violet"])}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{insight.label}</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed">{insight.value}</p>
              </div>
            ))}
          </div>
        ) : null}
        {panel.bullets?.length ? (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Agent reasoning</p>
            <div className="mt-3 grid gap-2">
              {panel.bullets.map((bullet) => (
                <p key={bullet} className="text-sm leading-relaxed text-slate-700">- {bullet}</p>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto md:grid-cols-3">
          {reviews.length ? reviews.map((review, index) => (
            <article key={`${review.date}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <RatingStars rating={review.rating || 0} />
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-black", review.replied ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                  {review.replied ? "Replied" : "No reply"}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">&ldquo;{review.text}&rdquo;</p>
              <p className="mt-3 text-[11px] text-slate-500">{review.author ? `${review.author} · ` : ""}v{review.version || "Unknown"} · {displayDate(review.date)}</p>
            </article>
          )) : (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500 md:col-span-3">No review examples are available for this card.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function tinySpark(data: any[], key: string, color: string) {
  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChartShim data={data} dataKey={key} color={color} />
    </ResponsiveContainer>
  );
}

function LineChartShim({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  return (
    <ComposedChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 8 }}>
      <YAxis domain={["dataMin", "dataMax"]} hide />
      <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
      <Tooltip
        cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "2 2" }}
        contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 12px 32px rgba(15,23,42,0.12)" }}
        formatter={(value) => [typeof value === "number" ? value.toLocaleString("en-IN") : value, ""]}
        labelFormatter={() => ""}
      />
      <Line
        type="monotone"
        dataKey={dataKey}
        stroke={color}
        strokeWidth={2.25}
        dot={false}
        activeDot={{ r: 4, fill: color, stroke: "white", strokeWidth: 2 }}
        connectNulls={false}
      />
    </ComposedChart>
  );
}

function RadialScore({ score, color = "#22c55e" }: { score: number; color?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  return (
    <div
      className="grid h-20 w-20 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${value * 3.6}deg, #e2e8f0 0deg)` }}
      aria-label={`${value}%`}
    >
      <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-[11px] font-black text-slate-700">{value}%</div>
    </div>
  );
}

function CruipCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900", className)}>
      {children}
    </div>
  );
}

function CruipStatCard({
  title,
  label,
  startValue,
  startLabel,
  endValue,
  endLabel,
  delta,
  tone = "neutral",
  children,
}: {
  title: string;
  label: string;
  startValue: string;
  startLabel: string;
  endValue: string;
  endLabel: string;
  delta: string;
  tone?: "positive" | "negative" | "neutral";
  children?: React.ReactNode;
}) {
  const deltaClass = tone === "negative" ? "bg-red-500/15 text-red-700 dark:text-red-300" : tone === "positive" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-500/15 text-slate-600 dark:text-slate-300";
  return (
    <CruipCard className="col-span-full flex min-h-[188px] flex-col overflow-hidden transition-colors duration-200 hover:border-slate-300 sm:col-span-6 xl:col-span-6 2xl:col-span-3">
      <div className="flex grow flex-col gap-5 p-5">
        <header className="flex min-h-[44px] items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-5 text-slate-900 dark:text-slate-100" title={title}>{title}</h2>
            <p className="mt-1 truncate text-sm leading-5 text-slate-500 dark:text-slate-400" title={label}>{label}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-1 text-xs font-semibold leading-4", deltaClass)}>{delta}</span>
        </header>

        <div className="grid min-h-[66px] grid-cols-[58px_minmax(0,1fr)_58px] items-center gap-3">
          <div className="min-w-0 text-center">
            <p className="truncate text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100" title={startValue}>{startValue}</p>
            <p className="mt-0.5 truncate text-xs font-medium leading-4 text-slate-500 dark:text-slate-400" title={startLabel}>{startLabel}</p>
          </div>
          <div className="min-w-0">{children}</div>
          <div className="min-w-0 text-center">
            <p className="truncate text-lg font-semibold leading-6 text-slate-900 dark:text-slate-100" title={endValue}>{endValue}</p>
            <p className="mt-0.5 truncate text-xs font-medium leading-4 text-slate-500 dark:text-slate-400" title={endLabel}>{endLabel}</p>
          </div>
        </div>
      </div>
    </CruipCard>
  );
}

type IncidentCategory = {
  label: string;
  priority: "P0" | "P1" | "P2";
  count: number;
  share: number;
  examples: Review[];
};

function IncidentReportSection({
  categories,
  chartData,
  rangeLabel,
  total,
  priorTotal,
  replyRate,
  unrepliedCount,
  onOpen,
}: {
  categories: IncidentCategory[];
  chartData: any[];
  rangeLabel: string;
  total: number;
  priorTotal: number;
  replyRate: number;
  unrepliedCount: number;
  onOpen: (title: string, subtitle: string, reviews: Review[]) => void;
}) {
  const criticalCount = categories.filter((category) => category.priority === "P0" && category.count > 0).length;
  const delta = total - priorTotal;
  const deltaPositive = delta <= 0;
  const highest = Math.max(1, ...categories.map((category) => category.count));
  const chartRows = chartData.map((row) => ({
    ...row,
    lowRating: Math.round(Number(row.reviews || 0) * Number(row.lowRatingRate || 0) / 100),
    responseGap: Math.max(0, Math.round(Number(row.reviews || 0) * (100 - Number(row.replyRate || 0)) / 100)),
  }));
  const statCards = [
    {
      label: "Critical categories",
      value: String(criticalCount),
      detail: "P0 compliance and trust signals",
      tone: criticalCount ? "text-red-600 bg-red-50 border-red-100" : "text-emerald-600 bg-emerald-50 border-emerald-100",
      icon: ShieldAlert,
      trend: criticalCount ? TrendingUp : TrendingDown,
    },
    {
      label: "Negative incidents",
      value: formatNumber(total),
      detail: `${rangeLabel} graph window`,
      tone: "text-slate-700 bg-slate-50 border-slate-200",
      icon: CircleAlert,
      trend: deltaPositive ? TrendingDown : TrendingUp,
    },
    {
      label: "Unreplied negatives",
      value: formatNumber(unrepliedCount),
      detail: `${replyRate}% reply coverage`,
      tone: unrepliedCount ? "text-amber-700 bg-amber-50 border-amber-100" : "text-emerald-600 bg-emerald-50 border-emerald-100",
      icon: Clock3,
      trend: unrepliedCount ? TrendingUp : TrendingDown,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="border-b border-slate-200 p-5 dark:border-slate-800 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Incident Report</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Issue categories and severity trend</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                All Play Store issue classes are visible here, ranked by negative-review volume with evidence.
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {rangeLabel}
            </span>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              const TrendIcon = stat.trend;
              return (
                <div key={stat.label} className={cn("rounded-xl border p-4", stat.tone)}>
                  <div className="flex items-start justify-between gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <TrendIcon className="h-4 w-4 shrink-0" />
                  </div>
                  <p className="mt-4 truncate text-[11px] font-semibold uppercase tracking-wide opacity-75">{stat.label}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight">{stat.value}</p>
                  <p className="mt-1 truncate text-xs opacity-75">{stat.detail}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="mb-4 flex flex-wrap items-center gap-5">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="h-3 w-3 rounded-sm bg-red-500" /> Low-rating incidents</span>
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className="h-3 w-3 rounded-sm bg-violet-500" /> Response gap</span>
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incidentLow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="incidentGap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 16px 40px rgba(15,23,42,0.12)" }} />
                  <Area type="monotone" dataKey="lowRating" stroke="#ef4444" strokeWidth={2.5} fill="url(#incidentLow)" dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="responseGap" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#incidentGap)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white">Category roster</h3>
              <p className="mt-1 text-xs text-slate-500">Every routed class is kept visible for triage.</p>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", deltaPositive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
              {delta === 0 ? "Flat" : `${delta > 0 ? "+" : ""}${delta}`} vs prior
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {categories.map((category) => {
              const severityClass = category.priority === "P0"
                ? "border-red-100 bg-red-50 text-red-700"
                : category.priority === "P1"
                  ? "border-amber-100 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-slate-50 text-slate-600";
              return (
                <button
                  key={category.label}
                  type="button"
                  onClick={() => category.examples.length ? onOpen(category.label, `${category.count} negative written reviews`, category.examples) : undefined}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors duration-200 hover:border-violet-200 hover:bg-violet-50/40 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{category.label}</p>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", severityClass)}>{category.priority}</span>
                      </div>
                      <p className="mt-1 truncate text-xs font-medium text-slate-500">{category.count} negative {category.count === 1 ? "review" : "reviews"}</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-slate-900 dark:text-white">{category.count}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(4, (category.count / highest) * 100)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                    <span>{category.share}% of incidents</span>
                    <span>{category.examples.length ? "Open evidence" : "No current evidence"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

const COMMERCIAL_MATCHERS = [
  {
    label: "Mis-selling",
    keywords: ["mis sell", "missell", "mis-sell", "misleading", "wrong information", "false promise", "fraud", "scam", "cheat", "cheated", "looted"],
  },
  {
    label: "Overselling",
    keywords: ["promise", "promised", "guarantee", "guaranteed", "assured rank", "selection", "advertise", "advertised", "over promise", "overpromise", "false hope"],
  },
  {
    label: "Payments & Refunds",
    keywords: ["payment", "refund", "deducted", "gateway", "transaction", "money back", "not returned", "paid", "subscription", "double charge", "extra charge"],
  },
  {
    label: "App Reliability",
    keywords: ["video", "playback", "buffer", "buffering", "crash", "crashed", "login", "log in", "download", "bug", "glitch", "otp", "not opening", "lag", "hang", "loading"],
  },
  {
    label: "Batch & Course",
    keywords: ["batch", "course", "class", "lecture", "teacher", "faculty", "sir", "mam", "syllabus", "content", "test series", "dpp", "schedule", "module", "notes"],
  },
];

// Best-match classification: score each bucket by how many of its keywords the
// review hits, and assign the highest-scoring bucket (ties broken by matcher
// order = severity). This is more accurate than first-match, which mislabels
// reviews that mention several topics.
function classifyCommercialRisk(review: Review) {
  const text = String(review.text || "").toLowerCase();
  let best: { label: string; keywords: string[] } | null = null;
  let bestScore = 0;
  for (const matcher of COMMERCIAL_MATCHERS) {
    const score = matcher.keywords.reduce((n, kw) => (text.includes(kw) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = matcher;
    }
  }
  return best || { label: "General Support", keywords: [] };
}

type NewsItem = {
  key: string;
  type: "teacher" | "batch" | "product";
  label: string;
  count: number;
  prior: number;
  delta: number;
  reviews: Review[];
};

const NEWS_NAME_STOPWORDS = new Set([
  "the", "best", "good", "nice", "very", "dear", "respected", "great", "amazing", "this",
  "that", "your", "physics", "every", "each", "all", "one", "any", "some", "main", "bhai",
]);
const NEWS_BATCH_TERMS = ["lakshya", "arjuna", "yakeen", "prayas", "udaan", "nipun", "aarambh", "prarambh", "saarthi", "lakshay"];

function newsEntitiesOf(text: string): string[] {
  const t = (text || "").toLowerCase();
  const ents = new Set<string>();
  const teacherRe = /\b([a-z]{3,})\s+(?:sir|maam|ma'?am|mam)\b/g;
  let match: RegExpExecArray | null;
  while ((match = teacherRe.exec(t)) !== null) {
    const name = match[1];
    if (!NEWS_NAME_STOPWORDS.has(name)) ents.add(`teacher:${name}`);
  }
  if (/\brj\s*sir\b|\brajwant\b/.test(t)) ents.add("teacher:rajwant");
  for (const batch of NEWS_BATCH_TERMS) {
    if (t.includes(batch)) ents.add(`batch:${batch === "lakshay" ? "lakshya" : batch}`);
  }
  if (/refund|payment|deducted|paisa|money back|fees|subscription/.test(t)) ents.add("product:payment");
  if (/\blogin\b|\botp\b|sign in|log in|not opening|can't open|cannot open/.test(t)) ents.add("product:login");
  if (/crash|hang|\blag\b|\bslow\b|not working|\bbug\b|glitch|freeze/.test(t)) ents.add("product:stability");
  if (/video|playback|buffer|download|quality setting|\b2x\b/.test(t)) ents.add("product:video");
  return Array.from(ents);
}

function newsLabel(key: string): string {
  const [type, val] = key.split(":");
  if (type === "teacher") {
    if (val === "rajwant") return "Rajwant Sir (RJ Sir)";
    return `${val.charAt(0).toUpperCase()}${val.slice(1)} Sir`;
  }
  if (type === "batch") return `${val.charAt(0).toUpperCase()}${val.slice(1)} batch`;
  const issues: Record<string, string> = {
    payment: "Payments & refunds",
    login: "Login & access",
    stability: "App stability",
    video: "Video & playback",
  };
  return issues[val] || val;
}

function newsSummary(item: NewsItem, hasPriorData = false): string {
  const trend = !hasPriorData ? "" : item.delta > 0 ? ` Up ${item.delta} vs the prior 14 days.` : item.delta < 0 ? ` Down ${Math.abs(item.delta)} vs the prior 14 days.` : "";
  if (item.type === "teacher") {
    const demand = item.reviews.filter((review) => /want|demand|chahiye|chahie|de do|dedo|assign|lao|laao|wapas|return|relaunch/i.test(String(review.text || ""))).length;
    if (demand >= Math.max(2, Math.round(item.count * 0.3))) {
      return `Students are demanding ${item.label} be assigned to their batch — ${item.count} negative reviews in 14 days.${trend}`;
    }
    return `${item.label} is named in ${item.count} negative reviews over 14 days.${trend}`;
  }
  if (item.type === "batch") {
    return `Students in the ${item.label} feel deprioritized — ${item.count} negative reviews in 14 days.${trend}`;
  }
  const map: Record<string, string> = {
    "product:payment": `Payment and refund complaints are active — ${item.count} negative reviews in 14 days.${trend}`,
    "product:login": `Login and access failures are repeating — ${item.count} negative reviews in 14 days.${trend}`,
    "product:stability": `App crashes, lag and bugs are surfacing — ${item.count} negative reviews in 14 days.${trend}`,
    "product:video": `Video and playback issues are repeating — ${item.count} negative reviews in 14 days.${trend}`,
  };
  return map[item.key] || `${item.label}: ${item.count} negative reviews in 14 days.${trend}`;
}

function HeatCell({ value, empty = false }: { value: number; empty?: boolean }) {
  if (empty) return <td className="rounded-md px-3 py-2 text-center text-xs font-bold text-slate-300">--</td>;
  const color =
    value >= 50 ? "bg-violet-600 text-white" :
    value >= 30 ? "bg-violet-400 text-white" :
    value >= 15 ? "bg-violet-200 text-violet-950" :
    value > 0 ? "bg-violet-50 text-violet-700" : "bg-slate-50 text-slate-400";
  return <td className={cn("rounded-md px-3 py-2 text-center text-xs font-black", color)}>{value}%</td>;
}

function CommentMarquee({ title, badge, reviews, tone, onOpen }: { title: string; badge?: string; reviews: Review[]; tone: "negative" | "positive"; onOpen: (review: Review) => void }) {
  const items = reviews.slice(0, 18);
  const loop = [...items, ...items];
  const isNegative = tone === "negative";
  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-black text-slate-950">{title}</h2>
        {badge ? (
          <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", isNegative ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>{badge}</span>
        ) : null}
      </div>
      {!items.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
          No {isNegative ? "1-2★" : "4-5★"} written reviews found in this window.
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          <div className={cn("flex w-max gap-3", isNegative ? "media-carousel-track" : "media-carousel-track-reverse")}>
            {loop.map((review, index) => (
              <button
                key={`${review.date}-${index}-${String(review.text).slice(0, 20)}`}
                onClick={() => onOpen(review)}
                className={cn(
                  "w-72 shrink-0 cursor-pointer rounded-2xl border p-3 text-left transition-colors duration-200",
                  isNegative ? "border-red-100 bg-red-50/60 hover:border-red-300" : "border-emerald-100 bg-emerald-50/60 hover:border-emerald-300"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <RatingStars rating={review.rating || 0} />
                  <span className={cn("text-[10px] font-black", isNegative ? "text-red-600" : "text-emerald-700")}>{review.version || "Unknown"} · {displayShortDate(review.date)}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-700">{review.text}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-[10px] font-black text-violet-700">{isNegative ? classifyCommercialRisk(review).label : review.theme || "Positive feedback"}</p>
                  {review.author ? <p className="shrink-0 text-[10px] font-bold text-slate-500">{review.author}</p> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function PlayStorePage() {
  const { data, loading } = useLiveData<any>("/api/playstore", null, { refreshMs: 60 * 60 * 1000, noStore: true });
  const [panel, setPanel] = useState<EvidencePanel | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [timeWindow, setTimeWindow] = useState<"last30" | "sixMonths" | "all">("sixMonths");
  const [reviewFilter, setReviewFilter] = useState<"all" | "negative" | "positive" | "unreplied" | "commercial">("all");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [trendRange, setTrendRange] = useState<"7d" | "30d" | "90d" | "all">("all");
  const toggleCategory = (label: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };
  if (loading || !data) return <PageSkeleton title="Play Store Intelligence" color="#6d5dfc" />

  const activePackage = selectedPackage && data.apps?.[selectedPackage] ? selectedPackage : data.primaryPackage;
  const primary = data.apps?.[activePackage] || {};
  const contract = data.contracts?.[activePackage] || data.contract || {};
  const packageLiveReviews = (data.liveReviews || []).filter((review: any) => !review.packageName || review.packageName === activePackage);
  const dataRangeLabel = data.dateRange?.from && data.dateRange?.to
    ? `${displayDate(data.dateRange.from)} - ${displayDate(data.dateRange.to)}`
    : "Uploaded range";
  const currentVersion = primary.releaseComparison?.current || primary.recentVersions?.[0] || {};
  const previousVersion = primary.releaseComparison?.previous || primary.recentVersions?.[1] || {};
  const allMonthlyTrend = (primary.monthlyTrend || []).filter((month: any) => month.month && month.month !== "Unknown");
  const periodOptions = Array.from(new Set(
    Object.values(data.apps || {}).flatMap((app: any) =>
      (app.monthlyTrend || [])
        .map((month: any) => String(month.month || ""))
        .filter((month: string) => month && month !== "Unknown")
    )
  )).sort();
  const activePeriod = selectedPeriod === "all" || periodOptions.includes(selectedPeriod)
    ? selectedPeriod
    : "all";
  const selectedWindowLabel = activePeriod === "all" ? "All time" : displayMonthYear(activePeriod);
  const isWithinSelectedWindow = (date?: string | null) => {
    if (!date) return activePeriod === "all";
    if (activePeriod === "all") return true;
    return String(date).slice(0, 7) === activePeriod;
  };
  const selectedMonthlyRow = activePeriod === "all" ? null : allMonthlyTrend.find((month: any) => String(month.month) === activePeriod);
  const trendRows = activePeriod === "all"
    ? allMonthlyTrend
    : selectedMonthlyRow
      ? [selectedMonthlyRow]
      : [];
  const kpiReviewCount = trendRows.reduce((sum: number, row: any) => sum + Number(row.reviews || 0), 0) || (activePeriod === "all" ? Number(primary.sampleSize || 0) : 0);
  const kpiAverageRating = kpiReviewCount
    ? Number((trendRows.reduce((sum: number, row: any) => sum + Number(row.averageRating || 0) * Number(row.reviews || 0), 0) / kpiReviewCount).toFixed(2))
    : activePeriod === "all" ? Number(primary.averageRating || 0) : 0;
  const kpiLowRatingCount = Math.round(trendRows.reduce((sum: number, row: any) => sum + Number(row.reviews || 0) * Number(row.lowRatingRate || 0) / 100, 0));
  const kpiLowRatingRate = kpiReviewCount ? Number(((kpiLowRatingCount / kpiReviewCount) * 100).toFixed(1)) : activePeriod === "all" ? Number(primary.lowRatingRate || 0) : 0;
  const kpiReplyCount = Math.round(trendRows.reduce((sum: number, row: any) => sum + Number(row.reviews || 0) * Number(row.replyRate || 0) / 100, 0));
  const kpiReplyRate = kpiReviewCount ? Number(((kpiReplyCount / kpiReviewCount) * 100).toFixed(1)) : activePeriod === "all" ? Number(primary.replyRate || 0) : 0;
  const sentimentScore = Math.max(55, Math.round(100 - kpiLowRatingRate * 4));
  const selectedMonthDailyRows = activePeriod === "all"
    ? []
    : (primary.dailyTrend || []).filter((day: any) => String(day.date || "").slice(0, 7) === activePeriod);
  const graphTrendRows = activePeriod === "all" ? allMonthlyTrend : selectedMonthDailyRows.length ? selectedMonthDailyRows : trendRows;
  const graphRangeLabel = activePeriod === "all" ? "All time" : displayMonthYear(activePeriod);
  const reviewTrend = graphTrendRows.map((row: any) => ({
    ...row,
    label: row.month ? displayMonth(row.month) : displayShortDate(row.date),
    rating: Number(row.reviews || 0) ? Number(row.averageRating || 0) : null,
    sentiment: Number(row.reviews || 0) ? Math.max(55, Math.round(100 - Number(row.lowRatingRate || 0) * 4)) : null,
  }));
  const unrepliedTrend = reviewTrend.map((row: any) => ({
    ...row,
    unreplied: Number(row.reviews || 0) ? Math.max(0, Math.round(Number(row.reviews || 0) * (100 - Number(row.replyRate || 0)) / 100)) : null,
  }));

  // ── Performance-trend filter (independent All-time / 90d / 30d / 7d) ──
  const dailyTrendAll = (primary.dailyTrend || []).filter((d: any) => d.date);
  const perfRangeDays: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, all: 0 };
  const perfRows = (() => {
    if (trendRange === "all") return allMonthlyTrend;                 // monthly points across all time
    const days = perfRangeDays[trendRange];
    const end = data.dateRange?.to ? new Date(`${data.dateRange.to}T23:59:59`) : new Date();
    const start = new Date(end); start.setDate(start.getDate() - (days - 1));
    const within = dailyTrendAll.filter((d: any) => {
      const t = new Date(`${d.date}T12:00:00`);
      return !Number.isNaN(t.getTime()) && t >= start && t <= end;
    });
    // fall back to monthly if daily data is sparse for this window
    return within.length ? within : allMonthlyTrend.slice(-Math.max(1, Math.round(days / 30)));
  })();
  const perfTrend = perfRows.map((row: any) => ({
    ...row,
    label: row.month ? displayMonth(row.month) : displayShortDate(row.date),
    rating: Number(row.reviews || 0) ? Number(row.averageRating || 0) : null,
    sentiment: Number(row.reviews || 0) ? Math.max(55, Math.round(100 - Number(row.lowRatingRate || 0) * 4)) : null,
  }));
  const trendRangeOptions = [
    { id: "all" as const, label: "All time" },
    { id: "90d" as const, label: "90 days" },
    { id: "30d" as const, label: "30 days" },
    { id: "7d" as const, label: "7 days" },
  ];
  const perfRangeLabel = trendRangeOptions.find((o) => o.id === trendRange)?.label || "All time";
  const firstGraphPoint = reviewTrend.find((row: any) => Number(row.reviews || 0) > 0) || reviewTrend[0] || {};
  const latestGraphPoint = [...reviewTrend].reverse().find((row: any) => Number(row.reviews || 0) > 0) || reviewTrend[reviewTrend.length - 1] || {};
  const latestUnrepliedPoint = [...unrepliedTrend].reverse().find((row: any) => row.unreplied != null) || unrepliedTrend[unrepliedTrend.length - 1] || {};
  const latestMonth = reviewTrend[reviewTrend.length - 1] || {};
  const previousMonth = reviewTrend[reviewTrend.length - 2] || {};
  const ratingDelta = previousMonth.rating ? (Number(latestMonth.rating || 0) - Number(previousMonth.rating || 0)).toFixed(2) : "0.00";
  const sentimentDelta = previousMonth.sentiment ? Number(latestMonth.sentiment || 0) - Number(previousMonth.sentiment || 0) : 0;
  const negativeCount = kpiLowRatingCount || (primary.ratingDistribution || []).filter((row: any) => row.rating <= 2).reduce((sum: number, row: any) => sum + Number(row.count || 0), 0);
  const priority = contract.priorityQueue || [];
  const topics = (contract.supervisedTopics || []).filter((topic: any) => topic.mentions > 0);
  const topTopics = topics.slice(0, 8);
  const themes = primary.themes || [];

  const latestReviewRows = [
    ...(primary.recentReviews || []),
    ...(primary.criticalReviews || []),
    ...(primary.divergentReviews || []),
    ...(primary.positiveReviews || []),
    ...themes.flatMap((theme: any) => theme.examples || []),
    // Live API reviews go last so their richer rows (author names) win the dedup
    ...packageLiveReviews,
  ];
  const latestReviewMap = new Map<string, Review>();
  latestReviewRows.forEach((review: any) => {
    if (!review?.text) return;
    const key = `${String(review.date || "unknown").slice(0, 10)}-${review.version || "unknown"}-${String(review.text).slice(0, 80)}`;
    latestReviewMap.set(key, {
      rating: review.rating,
      text: review.text,
      version: review.version,
      date: review.date ? String(review.date).slice(0, 10) : review.date,
      replied: review.replied,
      theme: review.theme,
      author: review.author || latestReviewMap.get(key)?.author || null,
    });
  });
  const latestReviews = Array.from(latestReviewMap.values()).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  const enrichedLatestReviews = latestReviews.map((review: Review) => ({ ...review, commercialRisk: classifyCommercialRisk(review) }));
  const latest7dEnd = data.dateRange?.to ? new Date(`${data.dateRange.to}T23:59:59`) : new Date();
  const latest7dStart = new Date(latest7dEnd);
  latest7dStart.setDate(latest7dStart.getDate() - 7);
  const isWithinLatest7d = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed >= latest7dStart && parsed <= latest7dEnd;
  };
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredLatestReviews = enrichedLatestReviews.filter((review) => {
    const matchesWindow = isWithinSelectedWindow(review.date);
    const matchesQuery = !normalizedQuery || [review.text, review.theme, review.version, review.commercialRisk.label]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    const matchesFilter =
      reviewFilter === "all" ||
      (reviewFilter === "negative" && Number(review.rating || 0) <= 2) ||
      (reviewFilter === "positive" && Number(review.rating || 0) >= 4) ||
      (reviewFilter === "unreplied" && review.replied === false) ||
      (reviewFilter === "commercial" && ["Overselling", "Mis-selling", "Batch & Course", "Payments & Refunds"].includes(review.commercialRisk.label));
    return matchesWindow && matchesQuery && matchesFilter;
  });
  const negativeWindowReviews = filteredLatestReviews.filter((review) => Number(review.rating || 0) <= 2);
  const negative7dReviews = enrichedLatestReviews.filter((review) => Number(review.rating || 0) <= 2 && isWithinLatest7d(review.date));
  const negativeCommercialReviews = negativeWindowReviews.filter((review) =>
    ["Overselling", "Mis-selling", "Batch & Course", "Payments & Refunds", "App Reliability"].includes(review.commercialRisk.label)
  );

  const openPanel = (title: string, subtitle: string, reviews: unknown, extras: Partial<Pick<EvidencePanel, "insights" | "bullets">> = {}) => {
    setPanel({ title, subtitle, reviews: normalizeEvidenceReviews(reviews), ...extras });
  };
  const reviewFromPriority = (item: any): Review => ({
    rating: item.rating,
    text: item.text,
    version: item.version,
    date: item.publishedAt,
    replied: item.replied,
    theme: item.topic,
    owner: item.recommendedOwner || item.enrichment?.recommendedOwner,
    score: item.score,
  });
  const reviewsForTopic = (topic: any) => {
    const label = String(topic.name || "").toLowerCase();
    const examples = priority.filter((item: any) => {
      const topicName = String(item.topic || "").toLowerCase();
      const text = String(item.text || "").toLowerCase();
      return topicName === label || (topic.keywords || []).some((keyword: string) => text.includes(String(keyword).toLowerCase()));
    }).map(reviewFromPriority);
    return examples.length ? examples : (topic.evidence || []).map((text: string) => ({ text, owner: topic.businessOwner, theme: topic.name }));
  };

  const maxTopicMentions = Math.max(...topTopics.map((topic: any) => Number(topic.mentions || 0)), 1);
  const emotionRules = [
    {
      name: "Frustration",
      color: "#ef4444",
      description: "Strong anger, bad experience, wasted study time or repeated failure language.",
      pattern: /worst|bad|frustrat|irritat|angry|waste|ghatiya|bekar|not working|problem|issue/i,
    },
    {
      name: "Confusion",
      color: "#f59e0b",
      description: "Students do not understand access, content, teacher, batch or app behaviour.",
      pattern: /confus|don't understand|didn't understand|unable|not able|can't|cannot|no idea|how can|kya|samajh/i,
    },
    {
      name: "Trust Risk",
      color: "#8b5cf6",
      description: "Fraud, scam, cheating, misleading, privacy, permission or promise-breach language.",
      pattern: /fraud|scam|cheat|mislead|false|promise|guarantee|permission|privacy|dhokha|loot/i,
    },
    {
      name: "Urgency",
      color: "#38bdf8",
      description: "Exam pressure, backlog, lost days, live class disruption or immediate study impact.",
      pattern: /exam|backlog|few days|lost|study time|live class|revision|urgent|days passed|classes/i,
    },
    {
      name: "Support Gap",
      color: "#475569",
      description: "No reply, delayed resolution, refund wait, calls, mails or support escalation.",
      pattern: /support|no response|not respond|wait|call|mail|refund|resolve|complain|ticket|help/i,
    },
    {
      name: "Delight",
      color: "#22c55e",
      description: "Positive teaching, content, faculty or app appreciation from 4-5★ comments.",
      pattern: /good|great|best|excellent|helpful|love|amazing|phenomenal|top notch|nice/i,
    },
  ];
  const emotionBaseReviews = filteredLatestReviews.filter((review) => review.text);
  const emotionDenominator = Math.max(1, emotionBaseReviews.length);
  const emotionData = emotionRules.map((rule) => {
    const matched = emotionBaseReviews.filter((review) => {
      const text = String(review.text || "");
      if (rule.name === "Delight") return Number(review.rating || 0) >= 4 && rule.pattern.test(text);
      return rule.pattern.test(text) || (Number(review.rating || 0) <= 2 && rule.name === "Frustration");
    });
    return {
      ...rule,
      count: matched.length,
      value: Number(((matched.length / emotionDenominator) * 100).toFixed(1)),
      examples: matched.slice(0, 8),
    };
  }).sort((a, b) => b.count - a.count);
  const dominantEmotion = emotionData[0];
  const stageRules = [
    { stage: "Onboarding", pattern: /access|login|entitlement|app/i },
    { stage: "Discovery", pattern: /batch|course|content|teacher/i },
    { stage: "Purchase", pattern: /payment|refund|fee|gateway|overselling|mis-selling/i },
    { stage: "Live Class", pattern: /video|app|study-flow|lecture/i },
    { stage: "Test Series", pattern: /test|dpp|batch/i },
    { stage: "Support", pattern: /support|resolution|response/i },
    { stage: "Retention", pattern: /trust|scam|reputation|delivery/i },
  ];
  const journey = stageRules.map((rule) => {
    const matchedTopics = topics.filter((topic: any) => rule.pattern.test(topic.name || ""));
    const mentions = matchedTopics.reduce((sum: number, topic: any) => sum + Number(topic.mentions || 0), 0);
    const pain = matchedTopics.length ? Number(matchedTopics.reduce((sum: number, topic: any) => sum + Number(topic.share || 0), 0).toFixed(1)) : 0;
    const neg = negativeWindowReviews.filter((review) => rule.pattern.test(`${review.text || ""} ${review.theme || ""} ${review.commercialRisk?.label || ""}`)).length;
    return { stage: rule.stage, pain, neg, mentions, topics: matchedTopics.map((topic: any) => topic.name).slice(0, 2).join(", ") || "No dominant topic" };
  });
  const heatmapTopics = topTopics.slice(0, 7);
  const criticalTopicCount = topTopics.filter((topic: any) => topic.severity === "critical" || topic.severity === "high").length;
  type HeatmapRow = { id?: string; name: string; total: number; dist: number[] };
  const heatmapRows: HeatmapRow[] = heatmapTopics.map((topic: any) => {
    const keywords = (topic.keywords || []).map((keyword: string) => String(keyword).toLowerCase());
    const matched = enrichedLatestReviews.filter((review) => {
      if (!(Number(review.rating || 0) > 0)) return false;
      const text = String(review.text || "").toLowerCase();
      return keywords.some((keyword: string) => text.includes(keyword));
    });
    const total = matched.length;
    const dist = [1, 2, 3, 4, 5].map((star) =>
      total ? Math.round((matched.filter((review) => Math.round(Number(review.rating)) === star).length / total) * 100) : 0
    );
    return { id: topic.id, name: topic.name, total, dist };
  });
  const recommendations = priority.slice(0, 5);
  const anomalyTopic = topTopics[0] || {};
  const anomalyReviews = reviewsForTopic(anomalyTopic).filter((review: Review) => review.text && isWithinSelectedWindow(review.date)).slice(0, 8);
  const commercialCategories = negativeCommercialReviews.reduce((acc: any[], review) => {
    const existing = acc.find((item) => item.label === review.commercialRisk.label);
    if (existing) {
      existing.count += 1;
      existing.examples.push(review);
    } else {
      acc.push({ label: review.commercialRisk.label, count: 1, examples: [review] });
    }
    return acc;
  }, []).sort((a, b) => b.count - a.count);
  const assignmentQueue = commercialCategories.slice(0, 6).map((category) => {
    const projectMap: Record<string, { project: string; issueType: string; priority: string }> = {
      "Batch & Course": { project: "ACADEMIC-OPS", issueType: "Batch Ops", priority: "P1" },
      "Payments & Refunds": { project: "PAYMENTS", issueType: "Refund / Payment", priority: "P1" },
      "App Reliability": { project: "APP-REL", issueType: "Bug", priority: "P1" },
      "Overselling": { project: "SALES-GOV", issueType: "Compliance Review", priority: "P0" },
      "Mis-selling": { project: "SALES-QA", issueType: "Compliance Review", priority: "P0" },
      "General Support": { project: "SUPPORT-OPS", issueType: "Support Follow-up", priority: "P2" },
    };
    return {
      ...category,
      ...(projectMap[category.label] || { project: "SUPPORT-OPS", issueType: "Review Triage", priority: "P2" }),
    };
  });
  const opportunityRules = [
    { title: "Recorded Video Controls", detail: "High-rated users still ask for notes, three-dot menu fixes, bookmarks and recorded-video controls.", icon: Box, pattern: /recorded|video section|three-dot|notes|bookmark|streak|xp|lecture/i },
    { title: "Search & Discovery", detail: "Students praise PW but ask for easier search across teachers, batches and specific content.", icon: Search, pattern: /search|find|specific teacher|teacher|content|batch/i },
    { title: "Offline Downloads", detail: "Download organization, offline playback and re-download failures are surfacing as product opportunities.", icon: Download, pattern: /download|offline|organised|organized|re-download|documents/i },
    { title: "Study Experience Quality", detail: "Positive reviews mention strong teaching but expose improvements around notes, flow and revision utility.", icon: Sparkles, pattern: /great|best|good|quality|teaching|structured|revision|study/i },
  ];
  const opportunityBaseReviews = filteredLatestReviews.filter((review) => review.text && (Number(review.rating || 0) >= 4 || /however|but|would be great|please|request|fix|missing|issue/i.test(String(review.text))));
  const hiddenGems = opportunityRules.map((rule) => {
    const examples = opportunityBaseReviews.filter((review) => rule.pattern.test(String(review.text || ""))).slice(0, 12);
    return {
      ...rule,
      count: examples.length,
      examples,
      detail: examples[0]?.text ? `${rule.detail} Evidence: "${String(examples[0].text).slice(0, 110)}..."` : rule.detail,
    };
  }).filter((gem) => gem.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);
  const leadingJourneyStage = [...journey].sort((a, b) => (b.neg + b.pain) - (a.neg + a.pain))[0];
  const leadingAssignment = assignmentQueue[0];
  const agentRiskLevel = negative7dReviews.length >= 30 || dominantEmotion?.name === "Trust Risk" ? "High" : negative7dReviews.length >= 10 ? "Medium" : "Watch";
  const futurePossibility = Number(ratingDelta) < 0
    ? "Rating pressure can continue if the current version keeps accumulating low-star comments faster than replies."
    : "Rating is not falling right now, but repeated issue language can still become a reputation problem if it repeats in the next upload.";
  const agentInsights = [
    { label: "Risk level", value: `${agentRiskLevel} attention`, tone: agentRiskLevel === "High" ? "red" : agentRiskLevel === "Medium" ? "amber" : "violet" },
    { label: "7-day negative comments", value: `${negative7dReviews.length} low-rating written reviews`, tone: negative7dReviews.length ? "red" : "green" },
    { label: "Dominant emotion", value: `${dominantEmotion?.name || "No signal"} (${dominantEmotion?.value || 0}%)`, tone: dominantEmotion?.name === "Delight" ? "green" : "amber" },
    { label: "Owner to activate", value: leadingAssignment ? `${leadingAssignment.owner} via ${leadingAssignment.project}` : "No owner queue yet", tone: "violet" },
  ] as EvidencePanel["insights"];
  const agentBullets = [
    `What looks wrong: ${leadingAssignment ? `${leadingAssignment.label} is the top routed issue with ${leadingAssignment.count} comments` : "No routed issue dominates yet"}, while ${dominantEmotion?.name || "the top emotion"} is the strongest language signal.`,
    `Why it may be happening: the journey hotspot is ${leadingJourneyStage?.stage || "not clear"} with ${leadingJourneyStage?.neg || 0} negative comments and ${leadingJourneyStage?.pain || 0}% topic pain.`,
    `Future possibility: ${futurePossibility}`,
    `Recommended next move: open the evidence, assign the top queue item, and compare the next export against this 7-day negative baseline.`,
  ];
  const agentEvidence = [...negative7dReviews.slice(0, 12), ...(leadingAssignment?.examples || [])];
  const unrepliedNegatives = negativeWindowReviews.filter((review) => review.replied === false);
  const unrepliedNegativeRate = negativeWindowReviews.length
    ? Math.round((unrepliedNegatives.length / negativeWindowReviews.length) * 100)
    : 0;

  const exportFilteredReviews = () => {
    const header = ["date", "rating", "version", "replied", "category", "review"];
    const rows = filteredLatestReviews.map((review) => [
      review.date || "",
      review.rating ?? "",
      review.version || "",
      review.replied === true ? "yes" : review.replied === false ? "no" : "",
      review.commercialRisk.label,
      String(review.text || "").replace(/\s+/g, " "),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `playstore-reviews-${data.dateRange?.to || "snapshot"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const defaultDeckFrom = daysBefore(data.dateRange?.to, 13).toISOString().slice(0, 10);
  const defaultDeckTo = data.dateRange?.to || new Date().toISOString().slice(0, 10);
  const deckFrom = defaultDeckFrom;
  const deckTo = defaultDeckTo;
  const deckFromDate = new Date(`${deckFrom}T00:00:00`);
  const deckToDate = new Date(`${deckTo}T23:59:59`);
  const deckSpanMs = Math.max(86400000, deckToDate.getTime() - deckFromDate.getTime());
  const priorDeckFromDate = new Date(deckFromDate.getTime() - deckSpanMs);
  const inDeckWindow = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed >= deckFromDate && parsed <= deckToDate;
  };
  const inPriorDeckWindow = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed >= priorDeckFromDate && parsed < deckFromDate;
  };
  const deckNegatives = enrichedLatestReviews.filter((review) => Number(review.rating || 0) <= 2 && review.text && inDeckWindow(review.date));
  const priorDeckNegatives = enrichedLatestReviews.filter((review) => Number(review.rating || 0) <= 2 && review.text && inPriorDeckWindow(review.date));

  const marqueeStart = daysBefore(data.dateRange?.to, 13);
  const inMarqueeWindow = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed >= marqueeStart && parsed <= latest7dEnd;
  };
  const marqueeNegatives = enrichedLatestReviews.filter((review) => Number(review.rating || 0) <= 2 && review.text && inMarqueeWindow(review.date));
  const marqueePositives = enrichedLatestReviews.filter((review) => Number(review.rating || 0) >= 4 && review.text && inMarqueeWindow(review.date));
  const latestStudentIssue = detectLatestStudentIssue(enrichedLatestReviews, data.dateRange?.to);

  // Review Newsroom: auto-detect breaking storylines (faculty demands, batches, product) from recent negatives
  const newsPriorStart = daysBefore(data.dateRange?.to, 27);
  const inNewsPrior = (date?: string | null) => {
    if (!date) return false;
    const parsed = new Date(`${date}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && parsed >= newsPriorStart && parsed < marqueeStart;
  };
  const newsCurrent = new Map<string, Review[]>();
  marqueeNegatives.forEach((review) => {
    newsEntitiesOf(String(review.text || "")).forEach((key) => {
      if (!newsCurrent.has(key)) newsCurrent.set(key, []);
      newsCurrent.get(key)!.push(review);
    });
  });
  const newsPrior = new Map<string, number>();
  const newsPriorNegatives = enrichedLatestReviews.filter((review) => review.text && Number(review.rating || 0) <= 2 && inNewsPrior(review.date));
  newsPriorNegatives.forEach((review) => {
    newsEntitiesOf(String(review.text || "")).forEach((key) => newsPrior.set(key, (newsPrior.get(key) || 0) + 1));
  });
  // Trend deltas are only meaningful if the prior window actually has data coverage
  const newsHasPriorData = newsPriorNegatives.length >= 10;
  const reviewNews: NewsItem[] = Array.from(newsCurrent.entries())
    .map(([key, reviews]) => {
      const sorted = [...reviews].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const prior = newsPrior.get(key) || 0;
      return { key, type: key.split(":")[0] as NewsItem["type"], label: newsLabel(key), count: reviews.length, prior, delta: reviews.length - prior, reviews: sorted };
    })
    .filter((item) => item.count >= 3)
    .sort((a, b) => (newsHasPriorData ? b.delta - a.delta : 0) || b.count - a.count)
    .slice(0, 6);
  const deckCategories = deckNegatives.reduce((acc: { label: string; reviews: Review[] }[], review) => {
    const existing = acc.find((item) => item.label === review.commercialRisk.label);
    if (existing) existing.reviews.push(review);
    else acc.push({ label: review.commercialRisk.label, reviews: [review] });
    return acc;
  }, []).sort((a, b) => b.reviews.length - a.reviews.length);
  const deckRangeLabel = `${displayDate(deckFrom)} - ${displayDate(deckTo)}`;
  const incidentCategoryDefaults: Omit<IncidentCategory, "count" | "share" | "examples">[] = [
    { label: "Mis-selling", priority: "P0" },
    { label: "Overselling", priority: "P0" },
    { label: "Payments & Refunds", priority: "P1" },
    { label: "App Reliability", priority: "P1" },
    { label: "Batch & Course", priority: "P1" },
    { label: "General Support", priority: "P2" },
  ];
  const incidentCategories: IncidentCategory[] = incidentCategoryDefaults
    .map((category) => {
      const match = deckCategories.find((item) => item.label === category.label);
      const examples = match?.reviews || [];
      const count = examples.length;
      return {
        ...category,
        count,
        share: deckNegatives.length ? Math.round((count / deckNegatives.length) * 100) : 0,
        examples,
      };
    })
    .sort((a, b) => b.count - a.count);

  const releaseWindowStart = daysBefore(data.dateRange?.to, 30);
  const liveVersions = (primary.recentVersions || []).filter((version: any) => {
    if (!version.latestReviewAt) return false;
    const parsed = new Date(version.latestReviewAt);
    return !Number.isNaN(parsed.getTime()) && parsed >= releaseWindowStart;
  }).slice(0, 6);
  const releaseComparisonData = primary.releaseComparison;

  const concernCounts = marqueeNegatives.reduce((acc: Record<string, number>, review) => {
    const label = review.commercialRisk.label;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const topConcern = Object.entries(concernCounts).sort((a, b) => b[1] - a[1])[0];
  const topConcernShortLabelMap: Record<string, string> = {
    "Batch & Course": "Batch issues",
    "Payments & Refunds": "Refund issues",
    "App Reliability": "App issues",
    "Mis-selling": "Mis-selling",
    "Overselling": "Overselling",
    "General Support": "Support issues",
  };
  const topConcernLabel = topConcern ? (topConcernShortLabelMap[topConcern[0]] || topConcern[0]) : "";
  const heroVerdict = topConcern
    ? `${topConcernLabel} lead negative reviews`
    : "No negative written reviews in the last 14 days";
  const heroNarrative = agentRiskLevel === "High"
    ? `${topConcern ? `${topConcern[1]} reports were captured in the last 14 days` : `${negative7dReviews.length} negative reviews landed in the last 7 days`}${anomalyTopic?.name ? `, with ${anomalyTopic.name.toLowerCase()} as the loudest theme` : ""}.`
    : `${dominantEmotion?.name || "Mixed sentiment"} is leading written feedback${anomalyTopic?.name ? `, with ${anomalyTopic.name.toLowerCase()} as the top theme` : ""}.`;

  // Executive briefing: auto-composed "what's happening" paragraph, fully data-driven
  const briefTotal = marqueeNegatives.length;
  const briefTopCount = topConcern ? topConcern[1] : 0;
  const briefTopLabel = topConcern ? topConcern[0] : "";
  const briefPct = briefTotal ? Math.round((briefTopCount / briefTotal) * 100) : 0;
  const brief7d = negative7dReviews.length;
  const briefAccelerating = brief7d >= briefTotal * 0.6;
  const briefTopFaculty = reviewNews.find((item) => item.type === "teacher");
  const briefTopBatches = reviewNews.filter((item) => item.type === "batch").slice(0, 2).map((item) => item.label.replace(" batch", ""));
  const briefNature: Record<string, string> = {
    "Batch & Course": "These are batch experience complaints around classes, faculty, and course setup",
    "App Reliability": "These are product issues around playback, login, crashes, and app speed",
    "Payments & Refunds": "These are commercial complaints around payments, deductions, and refund delays",
    "Mis-selling": "These are trust issues — students allege misleading or false claims",
    "Overselling": "These are expectation issues — students cite over-promised ranks or selections",
  };
  const briefNatureLine = briefNature[briefTopLabel] || "Students are raising a mix of product and service concerns";
  // representative short verbatims from the top-concern reviews
  const briefSpecifics = [
    briefTopBatches.length >= 2 ? `${briefTopBatches[0]} students feel deprioritized versus ${briefTopBatches[1]}` : null,
    briefTopFaculty ? `repeated demand for ${briefTopFaculty.label}` : null,
  ].filter(Boolean).join(", and ");
  const latestIssueEvidence = latestStudentIssue?.reviews.find((review) => review.text && String(review.text).length <= 140)?.text || latestStudentIssue?.reviews[0]?.text || "";
  const briefingHeadline = latestStudentIssue
    ? latestStudentIssue.label
    : topConcern
      ? `${briefTopLabel} is leading negative review volume`
      : "No active negative student issue in the selected window";
  const briefingSummary = latestStudentIssue
    ? `${latestStudentIssue.count} low-rating reviews landed ${latestStudentIssue.windowLabel === "today" ? "today" : `in the ${latestStudentIssue.windowLabel}`}.${latestStudentIssue.versions.length ? ` Most reports are on v${latestStudentIssue.versions.join(", v")}.` : ""}`
    : topConcern
      ? `${briefTopCount} of ${briefTotal} negative reviews (${briefPct}%) sit in this bucket${briefAccelerating ? `, with ${brief7d} arriving in the last 7 days` : ""}.`
      : "Students are relatively quiet right now.";
  const briefingContext = latestStudentIssue && topConcern
    ? `${briefNatureLine}${briefSpecifics ? `: ${briefSpecifics}` : ""}. Across the wider 14-day queue, ${briefTopLabel} remains the largest negative bucket at ${briefTopCount} of ${briefTotal} reviews (${briefPct}%)${briefAccelerating ? `, with ${brief7d} arriving in the last 7 days` : ""}.`
    : topConcern
      ? `${briefNatureLine}${briefSpecifics ? `: ${briefSpecifics}` : ""}. Complaints are landing on the current release (${currentVersion.version || "latest"}).`
      : "";
  const briefingQuote = latestStudentIssue && latestIssueEvidence
    ? String(latestIssueEvidence).trim()
    : "";
  const executiveBrief = [briefingSummary, briefingContext].filter(Boolean).join(" ");
  const briefingEvidence = latestStudentIssue?.reviews?.length
    ? latestStudentIssue.reviews
    : marqueeNegatives.filter((review) => review.commercialRisk.label === briefTopLabel);

  const shareSnapshot = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const openJiraTicket = (item: any) => {
    const examples = (item.examples || []).slice(0, 5);
    const summary = `[${item.priority || "P2"}] ${item.label} from Play Store reviews - ${primary.name || "PW app"}`;
    const description = [
      `App: ${primary.name || activePackage}`,
      `Period: ${selectedWindowLabel}`,
      `Project queue: ${item.project}`,
      `Issue type: ${item.issueType}`,
      `Suggested owner: ${item.owner}`,
      `Evidence count: ${item.count}`,
      "",
      "Summary:",
      `${item.label} is appearing in the selected Play Store review window. Please review the evidence and route to the owning team.`,
      "",
      "Evidence:",
      ...examples.map((review: Review, index: number) => `${index + 1}. ${review.rating || "?"}★ · ${review.version || "Unknown version"} · ${displayDate(review.date)}\n${review.text || ""}`),
    ].join("\n");
    const jiraBase = (process.env.NEXT_PUBLIC_JIRA_BASE_URL || "https://physicswallah.atlassian.net").replace(/\/$/, "");
    const params = new URLSearchParams({ summary, description });
    window.open(`${jiraBase}/secure/CreateIssueDetails!init.jspa?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen rounded-[28px] bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_42%,#f8fafc_100%)] p-1 text-slate-950 dark:text-slate-100">
      <main className="overflow-x-hidden">
        <motion.div className="space-y-6">
          <motion.section variants={fadeUp as any}>
            <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#020617_0%,#1e103f_34%,#4c1d95_68%,#0b0614_100%)] p-5 text-white shadow-[0_28px_90px_rgba(30,16,63,0.34)] md:p-7">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
              <div className="relative space-y-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
                      <span className="grid h-5 w-5 place-items-center overflow-hidden rounded-md bg-white p-0.5">
                        <img src="/google-play.webp" alt="Google Play" className="h-4 w-4 object-contain" />
                      </span>
                      {primary.name || "Physics Wallah"}
                    </span>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", agentRiskLevel === "High" ? "border-red-300/30 bg-red-400/15 text-red-100" : agentRiskLevel === "Medium" ? "border-amber-300/30 bg-amber-400/15 text-amber-100" : "border-emerald-300/30 bg-emerald-400/15 text-emerald-100")}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {agentRiskLevel} attention
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:max-w-[560px] xl:justify-end">
                    {data.appOptions?.length ? (
                      <label className="inline-flex min-w-56 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 backdrop-blur">
                        <Box className="h-4 w-4 text-slate-300" />
                        <select
                          value={activePackage}
                          onChange={(event) => setSelectedPackage(event.target.value)}
                          className="w-full bg-transparent outline-none"
                          aria-label="Select Play Store app"
                        >
                          {data.appOptions.map((app: any) => (
                            <option key={app.packageName} value={app.packageName} className="text-slate-900">{app.name}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="inline-flex min-w-40 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 backdrop-blur">
                      <Calendar className="h-4 w-4 text-slate-300" />
                      <select
                        value={activePeriod}
                        onChange={(event) => setSelectedPeriod(event.target.value)}
                        className="w-full bg-transparent outline-none"
                        aria-label="Select Play Store month"
                      >
                        <option value="all" className="text-slate-900">All time</option>
                        {[...periodOptions].reverse().map((month) => (
                          <option key={month} value={month} className="text-slate-900">{displayMonthYear(month)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="max-w-5xl">
                  <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white md:text-5xl">{briefingHeadline}</h1>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300 md:text-base">{briefingSummary}</p>
                  {briefingContext ? <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400 md:text-base">{briefingContext}</p> : null}
                  {briefingQuote ? (
                    <div className="mt-4 max-w-4xl rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm leading-6 text-slate-200">
                      &ldquo;{briefingQuote}&rdquo;
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {latestStudentIssue ? <span className="rounded-full bg-red-400/15 px-3 py-1.5 text-xs font-semibold text-red-100">{latestStudentIssue.label}</span> : null}
                    <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200">{briefTopLabel || "No issue"} · {briefPct}%</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200">v{currentVersion.version || "latest"}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200">{selectedWindowLabel}</span>
                  </div>
                  {briefingEvidence.length ? (
                    <button
                      type="button"
                      onClick={() => openPanel(latestStudentIssue?.label || briefTopLabel || "Latest issue evidence", executiveBrief, briefingEvidence)}
                      className="mt-5 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-200"
                    >
                      Read evidence <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

              </div>
            </div>
          </motion.section>

          <motion.div variants={fadeUp as any}>
            <VectorChannelSummary
              platform="playstore"
              accent="#6366f1"
              fallbackHeadline={briefingHeadline}
              fallbackSummary={`${formatNumber(kpiReviewCount)} reviews are in the selected evidence window, including ${formatNumber(kpiLowRatingCount)} low-rating reviews (${kpiLowRatingRate}%). ${briefingSummary}`}
            />
          </motion.div>

          <motion.section variants={fadeUp as any}>
            <div className="grid grid-cols-12 gap-6">
              <CruipStatCard
                title="Total Reviews"
                label={selectedWindowLabel}
                startValue={formatNumber(firstGraphPoint.reviews || 0)}
                startLabel={firstGraphPoint.label || "Start"}
                endValue={formatNumber(latestGraphPoint.reviews || 0)}
                endLabel={latestGraphPoint.label || "Current"}
                delta={activePeriod === "all" ? `${allMonthlyTrend.length} mo` : displayMonth(activePeriod)}
                tone="neutral"
              >
                {tinySpark(reviewTrend, "reviews", "#6366f1")}
              </CruipStatCard>
              <CruipStatCard
                title="Average Rating"
                label="Star trend"
                startValue={firstGraphPoint.rating ? String(firstGraphPoint.rating) : "--"}
                startLabel={firstGraphPoint.label || "Start"}
                endValue={latestGraphPoint.rating ? String(latestGraphPoint.rating) : String(kpiAverageRating || "--")}
                endLabel={latestGraphPoint.label || "Current"}
                delta={`${Number(ratingDelta) >= 0 ? "+" : ""}${ratingDelta}`}
                tone={Number(ratingDelta) < 0 ? "negative" : "positive"}
              >
                {tinySpark(reviewTrend, "rating", "#8b5cf6")}
              </CruipStatCard>
              <CruipStatCard
                title="Sentiment Score"
                label="Review quality"
                startValue={firstGraphPoint.sentiment ? String(firstGraphPoint.sentiment) : "--"}
                startLabel={firstGraphPoint.label || "Start"}
                endValue={latestGraphPoint.sentiment ? String(latestGraphPoint.sentiment) : String(sentimentScore)}
                endLabel={latestGraphPoint.label || "Current"}
                delta={`${sentimentDelta >= 0 ? "+" : ""}${sentimentDelta} pts`}
                tone={sentimentDelta < 0 ? "negative" : "positive"}
              >
                {tinySpark(reviewTrend, "sentiment", "#22c55e")}
              </CruipStatCard>
              <CruipStatCard
                title="Unreplied Negatives"
                label="Needs response"
                startValue={formatNumber(unrepliedTrend.find((row: any) => row.unreplied != null)?.unreplied || 0)}
                startLabel={unrepliedTrend.find((row: any) => row.unreplied != null)?.label || "Start"}
                endValue={formatNumber(latestUnrepliedPoint.unreplied ?? unrepliedNegatives.length)}
                endLabel={latestUnrepliedPoint.label || "Current"}
                delta={`${unrepliedNegativeRate}%`}
                tone={unrepliedNegatives.length > 0 ? "negative" : "positive"}
              >
                {tinySpark(unrepliedTrend, "unreplied", "#f59e0b")}
              </CruipStatCard>
            </div>
          </motion.section>

          <motion.section variants={fadeUp as any} className="space-y-6">
            <CommentMarquee
              title="Negative Comments"
              badge={`Last 14 days · ${marqueeNegatives.length}`}
              tone="negative"
              reviews={marqueeNegatives}
              onOpen={(review) => openPanel("Negative review detail", `Posted ${displayDate(review.date)} · App version ${review.version || "Unknown"}`, [review])}
            />
            <CommentMarquee
              title="What Students Love"
              badge={`Last 14 days · ${marqueePositives.length}`}
              tone="positive"
              reviews={marqueePositives}
              onOpen={(review) => openPanel("Positive review detail", `Posted ${displayDate(review.date)} · App version ${review.version || "Unknown"}`, [review])}
            />
          </motion.section>

          <motion.section variants={fadeUp as any} className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <Card className="overflow-hidden p-5">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Performance trend</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Ratings, volume, and sentiment</h2>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
                    <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-blue-500" /> Review volume</span>
                    <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-violet-500" /> Avg rating</span>
                    <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-emerald-500" /> Sentiment</span>
                  </div>
                </div>
                <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                  {trendRangeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTrendRange(option.id)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        trendRange === option.id
                          ? "bg-white text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[360px]">
                {perfTrend.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={perfTrend} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[1, 5]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}★`} />
                    <YAxis yAxisId="sentiment" hide domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 16px 40px rgba(15,23,42,0.12)" }} />
                    <Bar yAxisId="left" dataKey="reviews" fill="#60a5fa" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="rating" stroke="#7c3aed" strokeWidth={2.8} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} connectNulls={false} isAnimationActive={false} />
                    <Line yAxisId="sentiment" type="monotone" dataKey="sentiment" stroke="#10b981" strokeWidth={2.8} dot={false} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No review data in the {perfRangeLabel.toLowerCase()} window.</div>
                )}
              </div>
            </Card>

            <Card className="flex min-h-[420px] flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Issue clustering</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Issue clusters by volume</h2>
                </div>
                <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{deckNegatives.length} incidents</span>
              </div>
              <div className="mt-5 grid flex-1 gap-3">
                {incidentCategories.map((category) => {
                  const priorityClass = category.priority === "P0"
                    ? "bg-red-50 text-red-700"
                    : category.priority === "P1"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-600";
                  return (
                    <button
                      key={category.label}
                      type="button"
                      onClick={() => category.examples.length ? openPanel(category.label, `${category.count} negative written reviews`, category.examples) : undefined}
                      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors duration-200 hover:border-cyan-200 hover:bg-cyan-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-950">{category.label}</p>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityClass)}>{category.priority}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-500">{category.share}% of negative reviews</p>
                        </div>
                        <p className="text-xl font-semibold text-slate-950">{category.count}</p>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(4, category.share)}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </motion.section>

          <div className="hidden">
          {reviewNews.length ? (
            <motion.section variants={fadeUp as any}>
              <Card className="p-4">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Breaking
                  </span>
                  <h2 className="text-lg font-black text-slate-950">Emerging Storylines</h2>
                    <span className="text-xs text-slate-500">Detected from the last 14 days of negative reviews</span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {reviewNews.map((item) => {
                    const top = item.reviews[0];
                    const trendUp = newsHasPriorData && item.delta > 0;
                    const tag = item.type === "teacher" ? "Faculty" : item.type === "batch" ? "Batch" : "Product";
                    return (
                      <button
                        key={item.key}
                        onClick={() => openPanel(item.label, newsSummary(item, newsHasPriorData), item.reviews)}
                        className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors duration-200 hover:border-violet-300"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">{tag}</span>
                          <span className={cn("flex items-center gap-1 text-[10px] font-black", trendUp ? "text-red-600" : "text-slate-500")}>
                            {trendUp ? `▲ +${item.delta} vs prior · ` : ""}{item.count} reviews · 14d
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-black text-slate-950">{item.label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">{newsSummary(item, newsHasPriorData)}</p>
                        {top ? <p className="mt-2 line-clamp-2 text-xs italic leading-relaxed text-slate-500">&ldquo;{top.text}&rdquo; — {top.author || "Play Store user"}</p> : null}
                        <p className="mt-2 text-[11px] font-black text-violet-600">Read all {item.count} comments <ChevronRight className="inline h-3 w-3" /></p>
                      </button>
                    );
                  })}
                </div>
              </Card>
            </motion.section>
          ) : null}

          <motion.section variants={fadeUp as any}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold", timeWindow !== "sixMonths" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white")}>
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <select
                    value={timeWindow}
                    onChange={(event) => setTimeWindow(event.target.value as "last30" | "sixMonths" | "all")}
                    className="bg-transparent font-bold outline-none"
                    aria-label="Select Play Store timeframe"
                  >
                    <option value="last30">Last 30 days</option>
                    <option value="sixMonths">Last 6 months</option>
                    <option value="all">All uploaded months</option>
                  </select>
                </label>
                <div className={cn("flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs text-slate-500", searchQuery ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white")}>
                  <Search className="h-4 w-4" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search reviews, themes, versions..."
                    className="w-full bg-transparent outline-none placeholder:text-slate-400"
                    aria-label="Search Play Store reviews"
                  />
                </div>
                <label className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold", reviewFilter !== "all" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-white")}>
                  <Filter className="h-4 w-4" />
                  <select
                    value={reviewFilter}
                    onChange={(event) => setReviewFilter(event.target.value as "all" | "negative" | "positive" | "unreplied" | "commercial")}
                    className="bg-transparent font-bold outline-none"
                    aria-label="Filter Play Store reviews"
                  >
                    <option value="all">All reviews</option>
                    <option value="negative">Negative only</option>
                    <option value="positive">Positive only</option>
                    <option value="unreplied">Unreplied only</option>
                    <option value="commercial">Commercial risk</option>
                  </select>
                </label>
                {(searchQuery || reviewFilter !== "all" || timeWindow !== "sixMonths") ? (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setReviewFilter("all");
                      setTimeWindow("sixMonths");
                    }}
                    className="cursor-pointer rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-xs font-black text-violet-600 transition-colors duration-200 hover:bg-violet-50"
                  >
                    Clear filters
                  </button>
                ) : null}
                <button
                  onClick={() => openPanel(
                    "AI Insight Agent brief",
                    `${selectedWindowLabel} · deterministic agent layer from reviews, emotions, journey and owner routing`,
                    agentEvidence,
                    { insights: agentInsights, bullets: agentBullets }
                  )}
                  className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-black text-violet-700 hover:bg-violet-100"
                >
                  <Sparkles className="h-4 w-4" /> AI Agent Brief
                </button>
                <button
                  onClick={exportFilteredReviews}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold transition-colors duration-200 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4" /> Export CSV
                </button>
                <button
                  onClick={shareSnapshot}
                  className="flex cursor-pointer items-center gap-2 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-black text-white transition-colors duration-200 hover:bg-violet-700"
                >
                  <Share2 className="h-4 w-4" /> {shareCopied ? "Link copied" : "Share"}
                </button>
              </div>
            </Card>
          </motion.section>

          <SectionBand index="01" title="Pulse" subtitle="How students rate and feel about the app right now" />

          <div className="space-y-4">
              <div className="space-y-4">
                <motion.section variants={fadeUp as any} className="grid grid-cols-1 items-stretch gap-4 min-[1700px]:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
                  <Card className="flex min-h-[380px] flex-col p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-black">Review Intelligence Overview</h2>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold text-slate-500">
                          <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-blue-500" /> Review Volume</span>
                          <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-violet-500" /> Avg Star Rating</span>
                          <span className="flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-emerald-500" /> Sentiment Score</span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{graphRangeLabel}</span>
                    </div>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={reviewTrend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="right" orientation="right" domain={[1, 5]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}★`} />
                          <YAxis yAxisId="sentiment" hide domain={[0, 100]} />
                          <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 16px 40px rgba(15,23,42,0.12)" }} />
                          <Bar yAxisId="left" dataKey="reviews" fill="#7aa6ff" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                          <Line yAxisId="right" type="monotone" dataKey="rating" stroke="#6d5dfc" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} isAnimationActive={false} />
                          <Line yAxisId="sentiment" type="monotone" dataKey="sentiment" stroke="#22c55e" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="flex min-h-[380px] flex-col p-4">
                    <SectionTitle
                      title="Emotion Landscape"
                      subtitle={`Rule-classified from ${formatNumber(emotionBaseReviews.length)} written comments in ${selectedWindowLabel.toLowerCase()}; click any emotion to inspect the verbatims.`}
                      onAction={() => openPanel("Emotion evidence", `All filtered comments used for emotion classification · ${selectedWindowLabel}`, emotionBaseReviews)}
                    />
                    <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <button
                        onClick={() => openPanel(dominantEmotion?.name || "Emotion evidence", dominantEmotion?.description || "No emotion evidence available.", dominantEmotion?.examples || [])}
                        className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-red-50 via-amber-50 to-violet-50 p-5 text-left hover:ring-2 hover:ring-violet-100"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Dominant Emotion</p>
                        <p className="mt-3 text-3xl font-black text-slate-950">{dominantEmotion?.name || "No signal"}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          {dominantEmotion?.value || 0}% of filtered comments. {dominantEmotion?.description || "No written evidence matched the current filters."}
                        </p>
                        <p className="mt-4 text-xs font-black text-violet-600">Open verbatims <ChevronRight className="inline h-3.5 w-3.5" /></p>
                      </button>
                      <div className="grid content-center gap-3">
                        {emotionData.map((item: any) => (
                          <button
                            key={item.name}
                            onClick={() => openPanel(item.name, `${item.count} comments · ${item.description}`, item.examples)}
                            className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-violet-200 hover:bg-violet-50/40"
                          >
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="flex min-w-0 items-center gap-2 font-black text-slate-700">
                                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="truncate">{item.name}</span>
                              </span>
                              <span className="font-black text-slate-950">{item.value}% · {item.count}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(4, item.value)}%`, backgroundColor: item.color }} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </Card>
                </motion.section>

                <SectionBand index="02" title="Risk Drivers" subtitle="What is driving negative reviews right now" />

                <motion.section variants={fadeUp as any} className="grid grid-cols-1 items-start gap-4 min-[1500px]:grid-cols-2">
                  <Card className="flex flex-col p-4">
                    <SectionTitle title="Theme Radar" subtitle="The biggest complaint clusters in the current window" />
                    <div className="space-y-3">
                      {topTopics.slice(0, 7).map((topic: any, index: number) => {
                        const width = `${Math.max(8, Math.round((Number(topic.mentions || 0) / maxTopicMentions) * 100))}%`;
                        return (
                          <button
                            key={topic.id || topic.name}
                            onClick={() => openPanel(topic.name, `${topic.mentions} mentions`, reviewsForTopic(topic))}
                            className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left hover:border-violet-200 hover:bg-violet-50/40"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-slate-900">{index + 1}. {topic.name}</p>
                                <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{topic.mentions} mentions · {topic.severity || "medium"}</p>
                              </div>
                              <p className="shrink-0 text-xs font-black text-slate-700">{formatNumber(topic.mentions || 0)}</p>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-violet-500" style={{ width }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Card>

                  <Card className="flex min-h-[330px] flex-col p-4">
                    <SectionTitle title="Spike Detector" subtitle="What changed recently" />
                    <div className="grid gap-3 rounded-xl bg-red-50 p-3">
                      <p className="flex items-center gap-2 text-xs font-black text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Spike Detected: {anomalyTopic?.name || "Low-rating reviews"}</p>
                      <p className="text-xs leading-relaxed text-slate-700">
                        {anomalyTopic?.name || "Top issue"} is concentrated in written reviews. Current version v{currentVersion.version || "Unknown"} is at {currentVersion.averageRating || primary.averageRating}★.
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div><p className="text-slate-500">Affected Reviews</p><p className="text-lg font-black">{formatNumber(anomalyTopic?.mentions || primary.lowRatingCount || 0)}</p></div>
                        <div><p className="text-slate-500">Impact on Rating</p><p className="text-lg font-black text-red-600">{primary.releaseComparison?.ratingDelta || ratingDelta}★</p></div>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <p className="text-xs font-black text-slate-900">Latest comments behind this</p>
                        <div className="mt-2 space-y-2">
                          {anomalyReviews.slice(0, 3).map((review: Review, index: number) => (
                            <button
                              key={`${review.date}-${index}`}
                              onClick={() => openPanel("Comment detail", `Posted ${displayDate(review.date)} · App version ${review.version || "Unknown"}`, [review])}
                              className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2 text-left hover:border-violet-200"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <RatingStars rating={review.rating || 0} />
                                <span className="text-[10px] font-bold text-slate-500">v{review.version || "Unknown"} · {displayDate(review.date)}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-700">{review.text}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => openPanel(anomalyTopic?.name || "Top issue", "All review comments behind the anomaly", anomalyReviews.length ? anomalyReviews : reviewsForTopic(anomalyTopic || {}))} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-600">See more comments <ChevronRight className="inline h-3.5 w-3.5" /></button>
                    </div>
                  </Card>

                </motion.section>

                <motion.section variants={fadeUp as any}>
                  <Card className="p-4">
                    <SectionTitle
                      title="Issue Breakdown"
                      subtitle="Negative review evidence grouped into trust, batch, payment, and product buckets"
                      onAction={() => openPanel("All negative commercial-risk comments", `${negativeCommercialReviews.length} comments in ${selectedWindowLabel}`, negativeCommercialReviews)}
                    />
                    <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                      {negativeWindowReviews.slice(0, 3).map((review, index) => (
                        <button
                          key={`${review.date}-${index}`}
                          onClick={() => openPanel("Negative comment", `Posted ${displayDate(review.date)} · ${classifyCommercialRisk(review).label}`, [review])}
                          className="rounded-xl border border-red-100 bg-red-50/70 p-3 text-left hover:border-red-300"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <RatingStars rating={review.rating || 0} />
                            <span className="text-[10px] font-bold text-red-600">{displayShortDate(review.date)}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs text-slate-700">{review.text}</p>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {commercialCategories.slice(0, 6).map((category) => {
                        const isExpanded = expandedCategories.has(category.label);
                        return (
                          <div key={category.label} className={cn("rounded-2xl border bg-slate-50 p-4 transition-colors duration-200", isExpanded ? "border-violet-300 bg-violet-50/30 md:col-span-2 xl:col-span-3" : "border-slate-200")}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-black text-slate-950">{category.label}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">{category.count} negative {category.count === 1 ? "review" : "reviews"}</p>
                              </div>
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-violet-700">{category.count}</span>
                            </div>
                            {!isExpanded ? (
                              <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600">{category.examples[0]?.text || "No written evidence available yet."}</p>
                            ) : null}
                            <button
                              onClick={() => toggleCategory(category.label)}
                              aria-expanded={isExpanded}
                              className="mt-3 flex cursor-pointer items-center gap-1 text-xs font-black text-violet-600 transition-colors duration-200 hover:text-violet-800"
                            >
                              {isExpanded ? "Collapse" : `Expand all ${category.examples.length} comments`}
                              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded ? "rotate-180" : "")} />
                            </button>
                            {isExpanded ? (
                              <div className="mt-3 grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                                {category.examples.map((review: Review, reviewIndex: number) => (
                                  <article key={`${review.date}-${reviewIndex}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <RatingStars rating={review.rating || 0} />
                                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", review.replied ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                                        {review.replied ? "Replied" : "No reply"}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs leading-relaxed text-slate-700">{review.text}</p>
                                    <p className="mt-2 text-[10px] font-bold text-slate-400">v{review.version || "Unknown"} · {displayDate(review.date)}</p>
                                  </article>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </motion.section>

          </div>

                <SectionBand index="01" title="Release Intelligence" subtitle="Which app versions are generating praise or pain" />

                <motion.section variants={fadeUp as any}>
                  <Card className="p-4">
                    {releaseComparisonData ? (
                      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-950 p-4 text-white">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-white/50">Current vs previous release</p>
                        <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black">v{releaseComparisonData.current?.version} · {releaseComparisonData.current?.averageRating}★</span>
                        <ChevronLeft className="h-4 w-4 text-white/40" />
                        <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70">v{releaseComparisonData.previous?.version} · {releaseComparisonData.previous?.averageRating}★</span>
                        <span className={cn("rounded-full px-3 py-1.5 text-xs font-black", (releaseComparisonData.ratingDelta || 0) < 0 ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300")}>
                          {(releaseComparisonData.ratingDelta || 0) >= 0 ? "+" : ""}{releaseComparisonData.ratingDelta}★ rating
                        </span>
                        <span className={cn("rounded-full px-3 py-1.5 text-xs font-black", (releaseComparisonData.lowRatingRateDelta || 0) > 0 ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300")}>
                          {(releaseComparisonData.lowRatingRateDelta || 0) >= 0 ? "+" : ""}{releaseComparisonData.lowRatingRateDelta}% low ratings
                        </span>
                        {releaseComparisonData.directional ? <span className="text-[10px] font-bold text-white/40">directional - small sample on one side</span> : null}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {liveVersions.map((version: any, versionIndex: number) => (
                        <div key={version.version} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-950">v{version.version}</p>
                              <p className="mt-0.5 text-[10px] font-bold text-slate-400">last review {displayShortDate(String(version.latestReviewAt).slice(0, 10))}</p>
                            </div>
                            {versionIndex === 0 ? <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-700">Current</span> : null}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <RatingStars rating={version.averageRating} size="h-3.5 w-3.5" />
                            <span className="text-sm font-black text-slate-950">{version.averageRating}</span>
                            <span className="text-xs font-bold text-slate-500">{formatNumber(version.reviews)} reviews</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", version.lowRatingRate > 6 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>{version.lowRatingRate}% low</span>
                          </div>
                          {version.topThemes?.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {version.topThemes.map((theme: any) => (
                                <span key={theme.name} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600">{theme.name} · {theme.count}</span>
                              ))}
                            </div>
                          ) : null}
                          {version.negativeExamples?.length ? (
                            <button
                              onClick={() => openPanel(`v${version.version} negative reviews`, `${version.lowRatingCount} low ratings on this release · ${version.lowRatingRate}% of its reviews`, version.negativeExamples)}
                              className="mt-3 cursor-pointer text-xs font-black text-violet-600 transition-colors duration-200 hover:text-violet-800"
                            >
                              See negative comments <ChevronRight className="inline h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <p className="mt-3 text-[10px] font-bold text-emerald-600">No negative written reviews captured</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.section>

                <SectionBand index="02" title="Actionables" subtitle="Owner-ready tickets from the filtered review evidence" />

                <motion.section variants={fadeUp as any}>
                  <Card className="p-4">
                    <SectionTitle title="Action Queue" subtitle="Owner-ready routing from the filtered review evidence" />
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                      {assignmentQueue.map((item) => (
                        <article key={`${item.label}-${item.project}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-950">{item.label}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">{item.count} comments · {item.priority}</p>
                            </div>
                            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">{item.project}</span>
                          </div>
                          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
                            <p><span className="font-black text-slate-700">Assignee:</span> {item.owner}</p>
                            <p className="mt-1"><span className="font-black text-slate-700">Issue type:</span> {item.issueType}</p>
                            <p className="mt-2 line-clamp-2 text-slate-600">{item.examples[0]?.text || "No filtered evidence available."}</p>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => openJiraTicket(item)}
                              className="flex-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                            >
                              Create JIRA ticket
                            </button>
                            <button
                              onClick={() => openPanel(item.label, `${item.count} comments routed to ${item.owner}`, item.examples)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                            >
                              Evidence
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </Card>
                </motion.section>

                <div className="hidden">
                <SectionBand index="05" title="Journey & Opportunities" subtitle="Where the experience breaks and what to build next" />

                <motion.section variants={fadeUp as any}>
                  <Card className="flex min-h-[260px] flex-col p-4">
                    <SectionTitle
                      title="Voice of Customer Journey"
                      subtitle="Journey stages are calculated from supervised issue topics plus negative written reviews in the selected time window."
                      action={null}
                    />
                    <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs font-black text-slate-900">Pain %</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Sum of matched supervised topic share for that journey stage.</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs font-black text-slate-900">Neg</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Count of 1-2★ comments in {selectedWindowLabel.toLowerCase()} matching stage keywords.</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs font-black text-slate-900">Stage mapping</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Access, course, purchase, live class, test, support and trust language are mapped separately.</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto pb-1">
                      <div className="min-w-[780px]">
                        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-slate-500">
                          {journey.map((stage) => <div key={stage.stage} className="truncate">{stage.stage}</div>)}
                        </div>
                        <div className="mt-3 grid grid-cols-7 gap-2">
                          {journey.map((stage) => (
                            <div key={stage.stage} className={cn("rounded-xl px-2 py-5 text-center text-sm font-black", stage.pain >= 20 ? "bg-red-100 text-red-700" : stage.pain >= 12 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                              {stage.pain}%
                              <p className="mt-1 text-[10px] font-semibold opacity-70">Pain</p>
                              <p className="mt-1 line-clamp-2 text-[9px] font-semibold opacity-60">{stage.topics}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 grid grid-cols-7 gap-2">
                          {journey.map((stage) => (
                            <div key={stage.stage} className="rounded-xl bg-slate-50 py-4 text-center text-sm font-black">
                              {stage.neg}
                              <p className="mt-1 text-[10px] font-semibold text-slate-400">Neg</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 h-24">
                      <ResponsiveContainer width="100%" height={96}>
                        <ComposedChart data={journey}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <Line type="monotone" dataKey="neg" stroke="#ef4444" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </motion.section>

                <motion.section variants={fadeUp as any} className="grid grid-cols-1 items-stretch gap-4 min-[1700px]:grid-cols-4">
                  <Card className="flex min-h-[320px] flex-col p-4">
                    <SectionTitle
                      title="Hidden Gems"
                      subtitle="Data-backed opportunities found inside positive or constructive reviews."
                      onAction={() => openPanel("All Hidden Gem evidence", `${opportunityBaseReviews.length} constructive comments in ${selectedWindowLabel}`, opportunityBaseReviews)}
                    />
                    <div className="space-y-2">
                      {hiddenGems.length ? hiddenGems.map((gem) => {
                        const Icon = gem.icon;
                        return (
                          <button
                            key={gem.title}
                            onClick={() => openPanel(gem.title, `${gem.count} constructive comments matched this opportunity`, gem.examples)}
                            className="flex w-full gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-violet-200 hover:bg-violet-50/40"
                          >
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600"><Icon className="h-4 w-4" /></div>
                            <div className="min-w-0">
                              <p className="text-xs font-black">{gem.title}</p>
                              <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{gem.detail}</p>
                            </div>
                            <span className="ml-auto shrink-0 self-center rounded-full border border-violet-200 px-2 py-1 text-[10px] font-black text-violet-600">{gem.count}</span>
                          </button>
                        );
                      }) : (
                        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-xs font-semibold text-slate-500">
                          No constructive opportunity comments matched the current filters.
                        </p>
                      )}
                    </div>
                  </Card>

                  <Card className="flex min-h-[320px] flex-col p-4 min-[1700px]:col-span-2">
                    <SectionTitle title="Actionable AI Recommendations" subtitle="Owner-ready fixes from the review evidence" />
                    <DataTableShell className="min-h-0 flex-1">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Recommendation</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3">Owner</th>
                            <th className="px-4 py-3">Priority score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recommendations.map((item: any, index: number) => (
                            <tr key={`${item.id || index}`} className="border-t border-slate-100">
                              <td className="px-4 py-3 font-bold text-slate-900">{item.topic || item.enrichment?.topics?.[0]?.label || "Review issue"}</td>
                              <td className="px-4 py-3"><span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-black text-red-600">{item.severity || "P1"}</span></td>
                              <td className="px-4 py-3 font-semibold text-slate-600">{item.recommendedOwner || item.enrichment?.recommendedOwner || "Owner"}</td>
                              <td className="px-4 py-3 font-black text-slate-700">{item.score ?? "--"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </DataTableShell>
                  </Card>

                  <Card className="flex min-h-[320px] flex-col p-4">
                    <SectionTitle title="Topic vs Rating Heatmap" subtitle="How written reviews mentioning each topic distribute across star ratings (n = matched reviews)" action={null} />
                    <div className="overflow-x-auto">
                      <table className="w-full border-separate border-spacing-1 text-[11px]">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="px-2 py-1 text-left">Topic</th>
                            {[1, 2, 3, 4, 5].map((star) => <th key={star} className="px-2 py-1">{star}★</th>)}
                            <th className="px-2 py-1 text-right">n</th>
                          </tr>
                        </thead>
                        <tbody>
                          {heatmapRows.map((row) => (
                            <tr key={row.id || row.name}>
                              <td className="max-w-[110px] truncate px-2 py-2 font-black">{row.name}</td>
                              {row.dist.map((share, starIndex) => (
                                <HeatCell key={starIndex} value={share} empty={row.total === 0} />
                              ))}
                              <td className="px-2 py-2 text-right font-bold text-slate-500">{row.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </motion.section>
              </div>

              <SectionBand index="06" title="Evidence Explorer" subtitle="The raw student voice behind every number above" />

              <motion.section variants={fadeUp as any} className="grid grid-cols-1 gap-4 min-[1500px]:grid-cols-[minmax(0,1fr)_420px]">
                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-lg font-black">Latest Review Feed</h2>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{selectedWindowLabel}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 min-[1700px]:grid-cols-3">
                    {filteredLatestReviews.slice(0, 6).map((review, index) => {
                      const risk = Number(review.rating || 0) <= 2;
                      return (
                        <button key={`${review.date}-${index}`} onClick={() => openPanel("Review detail", `Posted ${displayDate(review.date)} · App version ${review.version || "Unknown"}`, [review])} className="w-full rounded-2xl border border-slate-200 p-3 text-left hover:border-violet-300">
                          <div className="flex gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-100 text-xs font-black">{String(index + 1).padStart(2, "0")}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-black">{review.author || review.theme || "Play Store user"}</p>
                                <span className="shrink-0 text-[10px] text-slate-400">{displayShortDate(review.date)}</span>
                              </div>
                              <div className="mt-1"><RatingStars rating={review.rating || 0} /></div>
                              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-700">{review.text}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className={cn("rounded-md px-2 py-1 text-[10px] font-black", risk ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700")}>{risk ? "Negative" : "Positive"}</span>
                                <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-600">v{review.version || "Unknown"}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => openPanel("Latest Play Store reviews", "Filtered written reviews with rating, version and date", filteredLatestReviews)} className="mt-3 w-full rounded-lg py-2 text-xs font-black text-violet-600 hover:bg-violet-50">View all reviews <ChevronRight className="inline h-3.5 w-3.5" /></button>
                </Card>

                <Card className="p-4">
                  <h3 className="text-sm font-black">Cohort Snapshot</h3>
                  <DataTableShell className="mt-3">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-bold">Cohort</th>
                          <th className="px-3 py-2 font-bold">Segment</th>
                          <th className="px-3 py-2 font-bold">Reviews</th>
                          <th className="px-3 py-2 font-bold">Sentiment</th>
                          <th className="px-3 py-2 font-bold">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Country", "India", formatNumber(primary.sampleSize || 0), sentimentScore, primary.averageRating],
                          ["App Version", `v${currentVersion.version || "Unknown"}`, formatNumber(currentVersion.reviews || 0), Math.round(100 - (currentVersion.lowRatingRate || 0) * 4), currentVersion.averageRating || primary.averageRating],
                          ["Previous Version", `v${previousVersion.version || "Unknown"}`, formatNumber(previousVersion.reviews || 0), Math.round(100 - (previousVersion.lowRatingRate || 0) * 4), previousVersion.averageRating || "--"],
                          ["Language", primary.topLanguages?.[0]?.language || "English", formatNumber(primary.topLanguages?.[0]?.reviews || 0), sentimentScore, primary.averageRating],
                        ].map((row) => (
                          <tr key={row[0]} className="border-t border-slate-100">
                            <td className="px-3 py-3 font-black text-slate-500">{row[0]}</td>
                            <td className="px-3 py-3 font-bold">{row[1]}</td>
                            <td className="px-3 py-3">{row[2]}</td>
                            <td className="px-3 py-3">{row[3]}</td>
                            <td className="px-3 py-3 font-black">{row[4]}★</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableShell>
                </Card>
              </motion.section>
              </div>
          </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
              <span>All times in IST</span>
              <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Data through {displayDate(data.dateRange?.to)}</span>
              <span>Source: Play Store review data</span>
            </div>
        </motion.div>
      </main>
      {panel ? <EvidenceModal panel={panel} onClose={() => setPanel(null)} /> : null}
    </div>
  );
}
