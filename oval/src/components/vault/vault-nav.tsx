"use client";

import Link from "next/link";
import { Disc3, Library, Settings } from "lucide-react";
import { OvalLogo } from "@/components/brand/oval-logo";

export function VaultNav({ role, library = false }: { role?: string; library?: boolean }) {
  return <header className="vault-topbar">
    <Link className="vault-brand" href="/audience-intelligence/overview"><OvalLogo className="vault-brand-mark" /><strong>OVAL</strong></Link>
    <nav aria-label="Primary navigation">
      <Link href="/audience-intelligence/overview">Overview</Link>
      <Link className={!library ? "active" : ""} href="/vault"><Disc3 size={15} /> Vault</Link>
      <Link href="/integrations">Integrations</Link>
      {role === "admin" ? <Link className={library ? "active" : ""} href="/vault/library"><Library size={15} /> Library</Link> : null}
    </nav>
    <div className="vault-profile"><button aria-label="Vault settings"><Settings size={16} /></button><span>AT</span></div>
  </header>;
}
