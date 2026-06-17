"use client";

import { usePathname } from "next/navigation";
import { Bell, CalendarDays, HelpCircle, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { cn } from "@/lib/utils";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/command-center": { title: "Command Center", subtitle: "Cross-channel student voice, active risks, and action status" },
  "/incidents": { title: "Incidents", subtitle: "Operational work queue for risks, evidence, owners, and resolution" },
  "/reddit": { title: "Reddit Intelligence", subtitle: "Long-form student narratives and community risk" },
  "/instagram": { title: "Instagram Intelligence", subtitle: "Campaign reaction, creators, reels, and visual narratives" },
  "/youtube": { title: "YouTube Intelligence", subtitle: "Academic feedback, faculty perception, and content quality" },
  "/youtube/owned": { title: "Owned YouTube Intel", subtitle: "Negative sentiment analysis across official channels" },
  "/youtube/not-owned": { title: "YouTube Intelligence: Not Owned", subtitle: "Third-party videos, creator narratives, and PR-risk content" },
  "/telegram": { title: "Telegram Intelligence", subtitle: "Channel monitoring, fake communities, and broadcast risk" },
  "/playstore": { title: "Play Store Intelligence", subtitle: "App reviews, versions, devices, replies, and release signals" },
  "/freshdesk": { title: "Freshdesk Intelligence", subtitle: "Support tickets, routing, taxonomy, and operating evidence" },
  "/google": { title: "Google Intelligence", subtitle: "Search reputation, autocomplete, news, and enrollment risk" },
  "/competitors": { title: "Competitors", subtitle: "Share of conversation and direct comparison narratives" },
};

function getPageMeta(pathname: string) {
  if (pathname.startsWith("/incidents/")) {
    return { title: "Incident Detail", subtitle: "Evidence-backed issue story, owner, action plan, and timeline" };
  }
  return pageMeta[pathname] || { title: "OVAL", subtitle: "Student Voice & Reputation Intelligence" };
}

function TopBar({ pathname }: { pathname: string }) {
  const meta = getPageMeta(pathname);
  const filters = ["Last 30 days", "All channels", "PW", "High+ severity"];
  const showGlobalFilters = pathname !== "/playstore";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex min-h-[76px] flex-col gap-3 px-4 py-3 md:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">{meta.title}</h1>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted md:flex" aria-label="Open global search">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              Search
              <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">⌘K</kbd>
            </button>
            <button className="rounded-lg border border-border bg-card p-2 hover:bg-muted" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </button>
            <button className="hidden rounded-lg border border-border bg-card p-2 hover:bg-muted md:inline-flex" aria-label="Help">
              <HelpCircle className="h-4 w-4" />
            </button>
            <button className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted sm:flex" aria-label="Current role">
              <ShieldCheck className="h-3.5 w-3.5 text-purple" />
              CXO View
            </button>
          </div>
        </div>
        {showGlobalFilters ? (
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex items-center gap-2">
              <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium hover:bg-muted">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
              </button>
              {filters.map((filter, index) => (
                <span
                  key={filter}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    index === 3 ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/20 dark:text-orange-300" : "border-border bg-card text-muted-foreground"
                  )}
                >
                  {filter}
                </span>
              ))}
              <button className="whitespace-nowrap text-[11px] font-medium text-purple hover:underline">Clear all</button>
            </div>
            <div className="hidden items-center gap-2 text-[11px] text-muted-foreground md:flex">
              <CalendarDays className="h-3.5 w-3.5" />
              Saved view: Leadership daily
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/" || pathname === "/login";
  const isPlayStore = pathname === "/playstore";

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main id="main-content" className="min-w-0 flex-1 md:ml-[220px] min-h-screen pb-16 md:pb-0">
        <TopBar pathname={pathname} />
        <div className={cn("mx-auto p-4 md:p-6 lg:p-8", isPlayStore ? "max-w-[1840px]" : "max-w-[1440px]")}>
          {children}
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
