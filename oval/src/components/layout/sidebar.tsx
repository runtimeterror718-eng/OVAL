"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  Camera,
  Search,
  Trophy,
  ClipboardCheck,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Play,
  Send,
  Users,
  Smartphone,
  LifeBuoy,
  Siren,
  Compass,
  Bot,
  FileText,
  Settings,
  BriefcaseBusiness,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/theme-provider";

const navItems = [
  { label: "Command Center", href: "/command-center", icon: Home },
  { label: "Incidents", href: "/incidents", icon: Siren },
  { label: "Explore", href: "/fire-tracker", icon: Compass },
  { label: "Reddit Intel", href: "/reddit", icon: MessageCircle },
  { label: "Instagram Intel", href: "/instagram", icon: Camera },
  {
    label: "YouTube Intel",
    href: "/youtube/not-owned",
    icon: Play,
    children: [
      { label: "Owned", href: "/youtube/owned" },
      { label: "Not Owned", href: "/youtube/not-owned" },
    ],
  },
  { label: "Telegram Intel", href: "/telegram", icon: Send },
  { label: "Google Intel", href: "/google", icon: Search },
  { label: "LinkedIn Intel", href: "/linkedin", icon: BriefcaseBusiness },
  { label: "Play Store Intel", href: "/playstore", icon: Smartphone },
  { label: "Freshdesk Intel", href: "/freshdesk", icon: LifeBuoy },
  // Neural Map hidden from nav (route/code preserved at /neural-map)
  { label: "Creators", href: "/creators", icon: Users },
  { label: "Competitors", href: "/competitors", icon: Trophy },
  { label: "Action Items", href: "/actionables", icon: ClipboardCheck },
  { label: "AI Copilot", href: "/war-room", icon: Bot },
  { label: "Reports", href: "/mirror", icon: FileText },
  { label: "Admin", href: "/actionables", icon: Settings },
];

function RadarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[220px] bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] z-40">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <RadarIcon className="h-6 w-6 text-purple" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            OVAL
          </span>
        </div>
        <p className="mt-1 text-[10px] font-medium text-muted-foreground">Student Voice & Reputation Intelligence</p>
      </div>

      {/* Brand Selector */}
      <div className="px-4 pb-4">
        <button
          aria-label="Select brand"
          className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-lg bg-[var(--muted)] text-foreground hover:bg-[var(--border)] transition-colors duration-200 cursor-pointer"
        >
          <span className="truncate">Physics Wallah</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-visible">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <div key={`${item.label}-${item.href}`} className="group relative">
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 cursor-pointer",
                  isActive
                    ? "bg-purple/10 text-purple border-l-2 border-purple"
                    : "text-[var(--muted-foreground)] hover:text-foreground hover:bg-[var(--muted)]"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {item.children ? <ChevronRight className="ml-auto h-3.5 w-3.5" /> : null}
              </Link>
              {item.children ? (
                <div className="invisible fixed left-[212px] z-[999] ml-2 min-w-36 rounded-xl border border-border bg-card p-1 opacity-0 shadow-2xl transition-all group-hover:visible group-hover:opacity-100" style={{ top: "272px" }}>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                        pathname === child.href
                          ? "bg-purple/10 text-purple"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="px-4 py-4 border-t border-[var(--sidebar-border)] space-y-3">
        <p className="text-xs text-[var(--muted-foreground)]">
          Last scraped: 2 hours ago
        </p>
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center gap-2 px-3 py-2 w-full text-sm font-medium rounded-md text-[var(--muted-foreground)] hover:text-foreground hover:bg-[var(--muted)] transition-colors duration-200 cursor-pointer"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>
    </aside>
  );
}
