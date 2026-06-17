"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, Camera, Siren, Smartphone, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Incidents", href: "/incidents", icon: Siren },
  { label: "Reddit", href: "/reddit", icon: MessageCircle },
  { label: "Instagram", href: "/instagram", icon: Camera },
  { label: "Play Store", href: "/playstore", icon: Smartphone },
  { label: "Freshdesk", href: "/freshdesk", icon: LifeBuoy },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--card)] border-t border-[var(--border)]">
      <div className="flex items-center justify-around h-14">
        {mobileNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-[48px]",
                isActive
                  ? "text-purple"
                  : "text-[var(--muted-foreground)]"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
