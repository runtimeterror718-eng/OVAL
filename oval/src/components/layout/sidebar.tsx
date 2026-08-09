"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Search, Settings, UserRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", href: "/command-center" },
  { label: "Play Store", href: "/playstore" },
  { label: "Reddit", href: "/reddit" },
  { label: "LinkedIn", href: "/linkedin" },
  { label: "YouTube", href: "/youtube" },
  { label: "Integrations", href: "/integrations" },
  { label: "Issues", href: "/issues" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [openPanel, setOpenPanel] = useState<"notifications" | "profile" | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/issues/notifications", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => setNotifications(payload?.notifications || [])).catch(() => undefined);
  }, [pathname]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    const match = navItems.find((item) => item.label.toLowerCase().includes(normalized));
    if (normalized && match) router.push(match.href);
  }

  return (
    <header className="oval-sidebar">
      <Link className="oval-sidebar-brand" href="/command-center" aria-label="OVAL overview">
        <span className="oval-brand-mark" aria-hidden="true"><i /><i /></span>
        <div>
          <p>OVAL</p>
          <span>Brand intelligence</span>
        </div>
      </Link>
      <nav aria-label="Primary navigation" className="oval-sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={cn("oval-nav-item", isActive && "oval-nav-item-active")}>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="oval-nav-tools">
        <form className="oval-nav-search" role="search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <input
            aria-label="Search OVAL sections"
            list="oval-section-options"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search platform"
            value={query}
          />
          <datalist id="oval-section-options">
            {navItems.map((item) => <option key={item.href} value={item.label} />)}
          </datalist>
        </form>
        <div className="oval-nav-action-wrap">
          <button
            type="button"
            className="oval-nav-icon-button"
            aria-expanded={openPanel === "notifications"}
            aria-label="View data notifications"
            onClick={() => setOpenPanel((current) => current === "notifications" ? null : "notifications")}
          >
            <Bell aria-hidden="true" />
            {notifications.some((item) => !item.read_at) ? <i aria-hidden="true" /> : null}
          </button>
          {openPanel === "notifications" ? <div className="oval-nav-popover" role="status"><strong>Issue notifications</strong>{notifications.length ? notifications.slice(0, 5).map((item) => <Link key={item.id} href={item.issue_id ? `/issues/${item.issue_id}` : "/issues"}><span>{item.title}</span><small>{item.body}</small></Link>) : <span>No workflow notifications yet.</span>}</div> : null}
        </div>
        <button
          type="button"
          className="oval-nav-icon-button"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} appearance`}
          onClick={toggleTheme}
        >
          <Settings aria-hidden="true" />
        </button>
        <div className="oval-nav-action-wrap">
          <button
            type="button"
            className="oval-profile-button"
            aria-expanded={openPanel === "profile"}
            onClick={() => setOpenPanel((current) => current === "profile" ? null : "profile")}
          >
            <span className="oval-profile-avatar"><UserRound aria-hidden="true" /></span>
            <span className="oval-nav-context"><b>Physics Wallah</b><small>Leadership view</small></span>
          </button>
          {openPanel === "profile" ? <div className="oval-nav-popover oval-profile-popover"><strong>Physics Wallah</strong><span>OVAL leadership workspace</span></div> : null}
        </div>
      </div>
    </header>
  );
}
