"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/" || pathname === "/login" || pathname.startsWith("/audience-intelligence") || pathname.startsWith("/integrations") || pathname.startsWith("/vault") || pathname.startsWith("/shield");
  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main id="main-content" className="oval-main min-h-screen min-w-0">
        <div className="oval-page-content">{children}</div>
      </main>
    </div>
  );
}
