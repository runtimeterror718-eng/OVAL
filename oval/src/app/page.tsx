"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bot,
  ChevronLeft,
  ChevronRight,
  Gauge,
  LineChart,
  MessageSquareWarning,
  Play,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Features", href: "#features-carousel" },
  { label: "Signals", href: "#signals" },
  { label: "Workflow", href: "#workflow" },
  { label: "FAQ", href: "#faq" },
];

const logoStrip = ["Play Store", "Reddit", "YouTube", "Instagram", "Freshdesk", "Google", "LinkedIn", "Telegram"];

const featureCards = [
  {
    title: "Navigate brand risk with clarity",
    description: "Group reviews, posts, and tickets into clean issue stories your teams can act on.",
    icon: Radar,
    preview: "Risk board",
    metric: "312",
    metricLabel: "active signals",
    bars: [78, 54, 36, 62, 44],
  },
  {
    title: "Evidence without the noise",
    description: "Read the exact student comments behind every spike, owner queue, and executive brief.",
    icon: MessageSquareWarning,
    preview: "Evidence feed",
    metric: "98%",
    metricLabel: "traceable insights",
    bars: [42, 66, 88, 58, 74],
  },
  {
    title: "Automated intelligence briefings",
    description: "Turn live data from support, app reviews, and social channels into daily leadership readouts.",
    icon: Bot,
    preview: "AI brief",
    metric: "6",
    metricLabel: "channels live",
    bars: [35, 48, 72, 91, 64],
  },
];

const signalCards = [
  { title: "Play Store health", value: "3,366", detail: "live reviews synced", tone: "blue" },
  { title: "Critical themes", value: "14", detail: "routed to owners", tone: "red" },
  { title: "Response coverage", value: "87%", detail: "tracked by channel", tone: "emerald" },
];

function MiniChart({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-24 items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
      {bars.map((height, index) => (
        <div key={index} className="flex flex-1 flex-col justify-end">
          <div
            className="rounded-t-lg bg-gradient-to-t from-blue-600 to-cyan-400"
            style={{ height: `${height}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -inset-8 rounded-[44px] bg-gradient-to-r from-blue-500/20 via-cyan-400/20 to-indigo-500/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 sm:flex">
            <Search className="h-3.5 w-3.5" />
            Search live signals
          </div>
        </div>
        <div className="grid gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden border-r border-slate-200 bg-slate-950 p-4 text-white lg:block">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500">
                <Radar className="h-4 w-4" />
              </span>
              OVAL
            </div>
            <div className="mt-6 space-y-2">
              {["Command Center", "Incidents", "Play Store", "Freshdesk", "Reddit"].map((item, index) => (
                <div
                  key={item}
                  className={cn(
                    "rounded-xl px-3 py-2 text-xs font-semibold",
                    index === 2 ? "bg-blue-500 text-white" : "text-slate-400"
                  )}
                >
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <div className="bg-slate-50 p-4 md:p-6">
            <div className="grid gap-4 md:grid-cols-3">
              {signalCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold text-slate-500">{card.title}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>
                  <p className={cn("mt-1 text-xs font-semibold", card.tone === "red" ? "text-red-600" : card.tone === "emerald" ? "text-emerald-600" : "text-blue-600")}>{card.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Review Intelligence Overview</p>
                    <p className="mt-1 text-xs text-slate-500">Rating, sentiment, and volume trend</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Live</span>
                </div>
                <div className="mt-5 flex h-52 items-end gap-3">
                  {[44, 58, 38, 72, 64, 86, 70, 92, 76, 84].map((height, index) => (
                    <div key={index} className="flex flex-1 flex-col justify-end rounded-t-xl bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">Live briefing</p>
                <div className="mt-4 space-y-3">
                  {["Admit-card banner blocking lectures", "Payments and refunds require owner response", "Video playback issues rising on current release"].map((item) => (
                    <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700">{item}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                        <div className="h-full w-2/3 rounded-full bg-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState(0);
  const feature = featureCards[activeFeature];
  const Icon = feature.icon;

  const duplicatedLogos = useMemo(() => [...logoStrip, ...logoStrip], []);

  const go = (direction: number) => {
    setActiveFeature((current) => (current + direction + featureCards.length) % featureCards.length);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f8fafc] text-slate-950">
      <header className="fixed left-0 right-0 top-0 z-50 px-4 py-4">
        <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-slate-200 bg-white/85 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-white">
              <Radar className="h-4 w-4" />
            </span>
            OVAL
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition-colors hover:text-slate-950">
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">
              Sign in
            </Link>
            <Link href="/command-center" className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition-colors hover:bg-blue-700">
              Open OVAL <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative px-4 pb-16 pt-32 md:pb-24 md:pt-40">
        <div className="absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.22),transparent_42%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]" />
        <div className="relative mx-auto max-w-7xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 shadow-sm">
            <Sparkles className="h-4 w-4" />
            Brand intelligence for teams that move fast
          </div>
          <h1 className="mx-auto mt-7 max-w-5xl text-balance text-5xl font-semibold leading-[1.02] tracking-tight text-slate-950 md:text-7xl">
            Turn scattered student signals into clear action.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            OVAL brings reviews, social chatter, support tickets, and reputation risk into one executive-ready workspace.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/command-center" className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-blue-600/20 transition-colors hover:bg-blue-700">
              Start monitoring <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features-carousel" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              See features <Play className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-14">
            <ProductMockup />
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4">
          <p className="text-center text-sm font-medium text-slate-500">Built to unify the channels where reputation moves first.</p>
          <div className="mt-6 overflow-hidden">
            <div className="media-carousel-track flex w-max gap-3">
              {duplicatedLogos.map((label, index) => (
                <span key={`${label}-${index}`} className="inline-flex min-w-36 justify-center rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features-carousel" className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Feature Carousel</p>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Intelligence that fits the way your teams work.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                Switch from raw mentions to grouped evidence, owner-ready routing, and leadership summaries without losing context.
              </p>
              <div className="mt-8 flex gap-2">
                <button onClick={() => go(-1)} className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50" aria-label="Previous feature">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => go(1)} className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50" aria-label="Next feature">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-3">
                {featureCards.map((card, index) => {
                  const CardIcon = card.icon;
                  return (
                    <button
                      key={card.title}
                      onClick={() => setActiveFeature(index)}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition-colors",
                        index === activeFeature ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <CardIcon className="h-5 w-5" />
                      <p className="mt-3 text-sm font-semibold">{card.title}</p>
                    </button>
                  );
                })}
              </div>
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{feature.preview}</span>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{feature.description}</p>
                  </div>
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-8 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-4xl font-semibold tracking-tight text-slate-950">{feature.metric}</p>
                    <p className="mt-2 text-sm font-medium text-slate-500">{feature.metricLabel}</p>
                  </div>
                  <MiniChart bars={feature.bars} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="signals" className="bg-slate-950 px-4 py-20 text-white md:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Signal Operations</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">One place for every reputation pulse.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { icon: Gauge, title: "Live health dashboards", text: "Track channel health, urgency, and sentiment in one scan." },
              { icon: BellRing, title: "Spike detection", text: "Detect sudden shifts before they become leadership escalations." },
              { icon: ShieldCheck, title: "Owner-ready routing", text: "Route issues with evidence, severity, and recommended next action." },
              { icon: LineChart, title: "Trend intelligence", text: "Watch releases, campaigns, and support themes change over time." },
            ].map((item) => (
              <div key={item.title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
                <item.icon className="h-6 w-6 text-blue-300" />
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Workflow</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">From signal to action in three steps.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ["01", "Collect", "Supabase-backed live feeds and channel APIs bring the raw signal in."],
              ["02", "Cluster", "OVAL groups similar comments, tickets, and posts into readable issue stories."],
              ["03", "Act", "Teams get owner routing, evidence drawers, and exportable executive summaries."],
            ].map(([step, title, text]) => (
              <div key={step} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="text-sm font-semibold text-blue-600">{step}</span>
                <h3 className="mt-5 text-2xl font-semibold text-slate-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Ready to monitor the next signal?</h2>
            <p className="mt-2 text-slate-600">Jump into the command center and keep the landing page for stakeholder onboarding.</p>
          </div>
          <Link href="/command-center" className="inline-flex w-max items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
            Open command center <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
