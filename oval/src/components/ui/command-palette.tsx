"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  Home, MessageCircle, Camera, Play, Send, Search, Siren, Compass,
  Users, Trophy, ClipboardCheck, Globe, X, Smartphone, LifeBuoy,
} from "lucide-react";

const PAGES = [
  { label: "Command Center", href: "/command-center", icon: Home, keywords: "home overview dashboard student voice command center" },
  { label: "Incidents", href: "/incidents", icon: Siren, keywords: "incidents work queue severity owner status evidence" },
  { label: "Explore", href: "/fire-tracker", icon: Compass, keywords: "explore mentions student voice search evidence" },
  { label: "Reddit Intelligence", href: "/reddit", icon: MessageCircle, keywords: "reddit posts subreddit comments" },
  { label: "Instagram Intelligence", href: "/instagram", icon: Camera, keywords: "instagram reels posts hashtags" },
  { label: "YouTube Intelligence: Not Owned", href: "/youtube/not-owned", icon: Play, keywords: "youtube videos channels comments unofficial third party not owned" },
  { label: "YouTube Intelligence: Owned", href: "/youtube/owned", icon: Play, keywords: "youtube owned channels official channels" },
  { label: "Telegram Intelligence", href: "/telegram", icon: Send, keywords: "telegram channels messages fake" },
  { label: "Google Intelligence", href: "/google", icon: Globe, keywords: "google autocomplete serp trends news" },
  { label: "Play Store Intelligence", href: "/playstore", icon: Smartphone, keywords: "play store app reviews ratings versions support" },
  { label: "Freshdesk Intelligence", href: "/audience-intelligence/freshdesk", icon: LifeBuoy, keywords: "freshdesk tickets support queue taxonomy routing sla csat" },
  { label: "Creator Intelligence", href: "/creators", icon: Users, keywords: "creators threats friends influencers" },
  { label: "Competitive Intelligence", href: "/competitors", icon: Trophy, keywords: "competitors allen unacademy byju share voice" },
  { label: "Action Items", href: "/actionables", icon: ClipboardCheck, keywords: "actionables tasks actions department" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Command className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              placeholder="Search pages, platforms, actions..."
              className="flex-1 h-12 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">No results found.</Command.Empty>
            <Command.Group heading="Pages" className="text-[10px] text-muted-foreground uppercase tracking-widest px-2 py-1.5">
              {PAGES.map((page) => {
                const Icon = page.icon;
                return (
                  <Command.Item
                    key={page.href}
                    value={`${page.label} ${page.keywords}`}
                    onSelect={() => { router.push(page.href); setOpen(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer hover:bg-muted data-[selected=true]:bg-muted transition-colors"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{page.label}</span>
                    <kbd className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{page.href}</kbd>
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            <span>Navigate with <kbd className="px-1 py-0.5 rounded bg-muted">↑↓</kbd></span>
            <span>Select with <kbd className="px-1 py-0.5 rounded bg-muted">↵</kbd></span>
            <span>Close with <kbd className="px-1 py-0.5 rounded bg-muted">Esc</kbd></span>
          </div>
        </Command>
      </div>
    </div>
  );
}
