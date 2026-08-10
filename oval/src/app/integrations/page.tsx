"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Camera, ChevronDown, Globe2, Link2, Loader2, Plus, RefreshCw, Unplug, X } from "lucide-react";
import { OvalLoadingSkeleton } from "@/components/ui/page-skeleton";
import "../audience-intelligence/audience-intelligence.css";
import "./integrations.css";

type Provider = "linkedin" | "x" | "facebook" | "instagram";
type SyncRun = { id: string; status: string; posts_imported: number; comments_imported: number; provider_limit_note?: string; error_summary?: string; started_at: string; finished_at?: string };
type Connection = { id: string; display_name: string; username?: string; account_type?: string; status: string; granted_scopes: string[]; coverage_started_at?: string; last_synced_at?: string; last_error?: string; postsCount: number; commentsCount: number; syncRuns: SyncRun[] };
type ProviderState = { provider: Provider; configured: boolean; canManage: boolean; connections: Connection[]; error?: string };

const PROVIDERS: Array<{ id: Provider; label: string; description: string; color: string; icon: typeof Link2 }> = [
  { id: "linkedin", label: "LinkedIn", description: "Organization posts, social actions and comment threads", color: "#0a66c2", icon: Link2 },
  { id: "x", label: "X", description: "Official posts, public metrics and available conversation replies", color: "#111111", icon: X },
  { id: "facebook", label: "Facebook", description: "Managed Page posts, engagement, comments and replies", color: "#1877f2", icon: Globe2 },
  { id: "instagram", label: "Instagram", description: "Professional media, captions, comments and replies", color: "#d62976", icon: Camera },
];

const date = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not synced yet";
const count = (value: number) => new Intl.NumberFormat("en-IN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0);

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<Record<string, ProviderState>>({});
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(""); const [expanded, setExpanded] = useState(""); const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const entries = await Promise.all(PROVIDERS.map(async ({ id }) => {
      const response = await fetch(`/api/integrations/${id}/connections`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      return [id, response.ok ? payload : { provider: id, configured: false, canManage: false, connections: [], error: payload.error || "Connection status unavailable" }] as const;
    }));
    setProviders(Object.fromEntries(entries)); setLoading(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const connected = params.get("connected"); const error = params.get("error");
    if (connected) setNotice(`${connected[0].toUpperCase()}${connected.slice(1)} connected. The scheduled worker will begin the initial backfill.`);
    if (error) setNotice(error);
    load();
  }, [load]);

  async function mutate(provider: Provider, connectionId: string, action: "sync" | "disconnect") {
    if (action === "disconnect" && !window.confirm("Disconnect this account? Existing imported evidence will remain, but no new data will be fetched.")) return;
    setBusy(`${action}:${connectionId}`); setNotice("");
    const response = await fetch(`/api/integrations/${provider}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectionId }) });
    const payload = await response.json().catch(() => ({}));
    setNotice(response.ok ? action === "sync" ? `Sync complete: ${payload.postsImported || 0} posts and ${payload.commentsImported || 0} comments processed.` : "Account disconnected." : payload.error || `${action} failed.`);
    setBusy(""); await load();
  }

  return <main className="audience-studio integrations-page">
    <div className="ai-ambient ai-ambient-one" /><div className="ai-ambient ai-ambient-two" />
    <header className="ai-topbar">
      <Link className="ai-brand-group" href="/audience-intelligence/overview"><span className="ai-brand-mark">O</span><span><strong>OVAL</strong><small>AUDIENCE INTELLIGENCE</small></span></Link>
      <nav className="ai-source-nav" aria-label="Primary navigation"><Link href="/audience-intelligence/overview">Overview</Link><Link href="/audience-intelligence/playstore">Play Store</Link><Link href="/audience-intelligence/freshdesk">Fresh Desk</Link><Link href="/audience-intelligence/linkedin">LinkedIn</Link><Link href="/audience-intelligence/x">X</Link><Link href="/audience-intelligence/youtube">YouTube</Link><Link href="/audience-intelligence/facebook">Facebook</Link><Link href="/audience-intelligence/instagram">Instagram</Link><Link href="/vault">Vault</Link><Link className="active" href="/integrations">Integrations</Link></nav>
      <div className="integrations-security"><span>Local admin mode</span><b>AT</b></div>
    </header>

    <section className="integrations-hero"><p className="ai-eyebrow">OFFICIAL CHANNEL ACCESS</p><h1>Integrations</h1><p>Connect Physics Wallah’s official accounts through provider OAuth. OVAL never asks for or stores channel passwords.</p></section>
    {notice && <div className="integrations-notice">{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}

    {loading ? <OvalLoadingSkeleton embedded variant="integrations" /> : <section className="integration-grid">
      {PROVIDERS.map((provider) => { const state = providers[provider.id] || { provider: provider.id, configured: false, canManage: false, connections: [] }; const Icon = provider.icon; return <article className="integration-card" key={provider.id} style={{ "--provider": provider.color } as React.CSSProperties}>
        <header><span className="integration-provider-icon"><Icon size={24} /></span><div><h2>{provider.label}</h2><p>{provider.description}</p></div><i className={state.connections.length ? "connected" : ""}>{state.connections.length ? `${state.connections.length} connected` : state.configured ? "Ready" : "Setup required"}</i></header>
        {state.error && <p className="integration-error">{state.error}</p>}
        <div className="integration-accounts">{state.connections.map((connection) => <section key={connection.id}>
          <div className="integration-account-head"><div><strong>{connection.display_name}</strong><small>{connection.username ? `@${connection.username}` : connection.account_type || "Official account"}</small></div><span className={`status-${connection.status}`}>{connection.status.replace("_", " ")}</span></div>
          <div className="integration-stats"><div><strong>{count(connection.postsCount)}</strong><span>Posts</span></div><div><strong>{count(connection.commentsCount)}</strong><span>Comments</span></div><div><strong>{date(connection.coverage_started_at).split(",")[0]}</strong><span>Coverage starts</span></div></div>
          <dl><div><dt>Last successful sync</dt><dd>{date(connection.last_synced_at)}</dd></div><div><dt>Permissions</dt><dd>{connection.granted_scopes.join(", ") || "Reconnect required"}</dd></div>{connection.last_error && <div className="has-error"><dt>Latest warning</dt><dd>{connection.last_error}</dd></div>}</dl>
          <div className="integration-actions"><button disabled={!state.canManage || Boolean(busy)} onClick={() => mutate(provider.id, connection.id, "sync")}>{busy === `sync:${connection.id}` ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}Sync now</button><a className={!state.canManage ? "disabled" : ""} href={`/api/integrations/${provider.id}/authorize`}><RefreshCw size={14} />Reconnect</a><button onClick={() => setExpanded(expanded === connection.id ? "" : connection.id)}><ChevronDown size={14} />History</button><button className="danger" disabled={!state.canManage || Boolean(busy)} onClick={() => mutate(provider.id, connection.id, "disconnect")}><Unplug size={14} />Disconnect</button></div>
          {expanded === connection.id && <div className="integration-history">{connection.syncRuns.length ? connection.syncRuns.map((run) => <div key={run.id}><span className={`run-${run.status}`}>{run.status}</span><p>{date(run.started_at)} · {count(run.posts_imported)} posts · {count(run.comments_imported)} comments</p><small>{run.provider_limit_note || run.error_summary || "Completed without a provider warning."}</small></div>) : <p>No sync run has started yet.</p>}</div>}
        </section>)}{!state.connections.length && <div className="integration-empty"><Link2 size={22} /><strong>No official account connected</strong><p>{state.configured ? `Authorize a managed ${provider.label} account to start the initial backfill.` : `Add the ${provider.label} app credentials to the server before connecting.`}</p></div>}</div>
        <footer>{state.canManage && state.configured ? <a href={`/api/integrations/${provider.id}/authorize`}><Plus size={15} />{state.connections.length ? "Add another account" : `Connect ${provider.label}`}<ArrowUpRight size={14} /></a> : <span>{state.canManage ? "Provider credentials are not configured" : "Admin or manager access is required"}</span>}</footer>
      </article>; })}
    </section>}
    <section className="integration-footnote"><strong>Read-only by design</strong><p>OVAL imports provider-accessible posts, public engagement, comments and replies. Publishing, moderation, direct messages, drafts and passwords are excluded.</p></section>
  </main>;
}
