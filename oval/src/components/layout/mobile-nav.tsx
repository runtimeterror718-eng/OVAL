"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BriefcaseBusiness, CircleDot, Link2, MessageCircle, Play, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { label: "Signals", href: "/command-center", icon: BarChart3 },
  { label: "Play Store", href: "/playstore", icon: Smartphone },
  { label: "Reddit", href: "/reddit", icon: MessageCircle },
  { label: "LinkedIn", href: "/linkedin", icon: BriefcaseBusiness },
  { label: "YouTube", href: "/youtube", icon: Play },
  { label: "Integrations", href: "/integrations", icon: Link2 },
  { label: "Issues", href: "/issues", icon: CircleDot },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="oval-mobile-nav md:hidden">
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
                "oval-mobile-nav-item",
                isActive
                  ? "oval-mobile-nav-item-active"
                  : ""
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
