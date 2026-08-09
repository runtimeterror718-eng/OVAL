"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Plus, RefreshCw, Search, Users } from "lucide-react";
import { toast } from "sonner";
import type { CrmMember, CrmTeam, Issue, IssueCandidate } from "@/lib/crm-types";
import { cn } from "@/lib/utils";

type IssuesPayload = { issues: Issue[]; metrics: Record<string, number>; currentMember: CrmMember; pagination: { page: number; limit: number; total: number; pages: number }; error?: string; code?: string };
type Directory = { members: CrmMember[]; teams: CrmTeam[] };
const views = ["all", "my", "unassigned", "overdue", "in_progress", "blocked", "resolved", "closed", "candidates"];

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed"), { code: body.code, status: response.status });
  return body;
}

export default function IssuesPage() {
  const [data, setData] = useState<IssuesPayload | null>(null);
  const [directory, setDirectory] = useState<Directory>({ members: [], teams: [] });
  const [candidates, setCandidates] = useState<IssueCandidate[]>([]);
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("");
  const [team, setTeam] = useState("");
  const [ownerFilter, setOwnerFilter] = useState(""); const [collaboratorFilter, setCollaboratorFilter] = useState(""); const [sourceFilter, setSourceFilter] = useState(""); const [dueFilter, setDueFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [issues, members, proposed] = await Promise.all([jsonFetch(`/api/issues?page=${page}&limit=50`), jsonFetch("/api/issues/directory"), jsonFetch("/api/issues/candidates")]);
      setData(issues); setDirectory(members); setCandidates(proposed.candidates || []);
    } catch (value: any) { setError({ message: value.message, code: value.code }); }
    finally { setLoading(false); }
  }
  useEffect(() => { setView(new URLSearchParams(window.location.search).get("view") || "all"); }, []);
  useEffect(() => { load(); }, [page]);

  const filtered = useMemo(() => (data?.issues || []).filter((issue: any) => {
    if (view === "my" && issue.owner_id !== data?.currentMember.id) return false;
    if (view === "unassigned" && issue.owner_id) return false;
    if (view === "overdue" && !issue.overdue) return false;
    if (!["all", "my", "unassigned", "overdue", "candidates"].includes(view) && issue.status !== view) return false;
    if (severity && issue.severity !== severity) return false;
    if (team && issue.team_id !== team) return false;
    if (ownerFilter && issue.owner_id !== ownerFilter) return false;
    if (collaboratorFilter && !issue.collaborators?.some((item: any) => item.member_id === collaboratorFilter)) return false;
    if (sourceFilter && !issue.source_platforms?.includes(sourceFilter)) return false;
    if (dueFilter === "overdue" && !issue.overdue) return false;
    if (dueFilter === "seven_days" && (!issue.due_at || new Date(issue.due_at).getTime() < Date.now() || new Date(issue.due_at).getTime() > Date.now() + 7 * 86400000)) return false;
    return !query || `${issue.title} ${issue.summary} ${issue.owner?.display_name || ""}`.toLowerCase().includes(query.toLowerCase());
  }), [collaboratorFilter, data, dueFilter, ownerFilter, query, severity, sourceFilter, team, view]);

  async function syncCandidates() {
    try { const result = await jsonFetch("/api/issues/candidates", { method: "POST" }); setCandidates(result.candidates || []); toast.success(`${result.generated} intelligence clusters reviewed`); }
    catch (value: any) { toast.error(value.message); }
  }
  async function reviewCandidate(id: string, action: "promote" | "dismiss", values: Record<string, any> = {}) {
    try {
      const result = await jsonFetch(`/api/issues/candidates/${id}`, { method: "PATCH", body: JSON.stringify({ action, ...values }) });
      setCandidates((current) => current.filter((candidate) => candidate.id !== id));
      toast.success(action === "promote" ? "Issue created" : "Candidate dismissed");
      if (result.issue) await load();
    } catch (value: any) { toast.error(value.message); }
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Loading issue workflow…</div>;
  if (error) return <SetupState error={error} />;
  const manager = data?.currentMember.role === "admin" || data?.currentMember.role === "manager";
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-medium text-muted-foreground">Operational intelligence workflow</p><h1 className="text-4xl font-medium tracking-tight">Issues</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Turn recurring customer signals into accountable work, with evidence and a complete decision history.</p></div><div className="flex gap-2">{data?.currentMember.role === "admin" ? <Link href="/issues/directory" className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"><Users className="mr-2 inline h-4 w-4" />Directory</Link> : null}{manager ? <button onClick={() => { setView("candidates"); syncCandidates(); }} className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"><Plus className="mr-2 inline h-4 w-4" />Review intelligence</button> : null}</div></header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[
        ["Open", data?.metrics.open || 0, AlertTriangle], ["Overdue", data?.metrics.overdue || 0, Clock3], ["Critical / High", data?.metrics.criticalHigh || 0, AlertTriangle], ["SLA breaches", data?.metrics.slaBreaches || 0, Clock3], ["Resolved this week", data?.metrics.resolvedThisWeek || 0, CheckCircle2],
      ].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><Icon className="h-4 w-4 text-muted-foreground" /><p className="mt-5 text-3xl font-medium">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}</section>
      <section className="rounded-2xl border border-border bg-card p-3"><div className="flex flex-wrap items-center gap-2">{views.map((item) => <button key={item} onClick={() => setView(item)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium capitalize", view === item ? "bg-black text-white" : "border border-border text-muted-foreground hover:bg-muted")}>{item.replace(/_/g, " ")}{item === "candidates" ? ` (${candidates.length})` : ""}</button>)}<div className="ml-auto flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search issues" className="w-36 bg-transparent text-xs outline-none" /></label><select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-xl border border-border bg-background px-2 text-xs"><option value="">Priority</option>{["critical", "high", "medium", "low"].map((item) => <option key={item}>{item}</option>)}</select><select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-xl border border-border bg-background px-2 text-xs"><option value="">Team</option>{directory.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="rounded-xl border border-border bg-background px-2 text-xs"><option value="">Owner</option>{directory.members.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select><select value={collaboratorFilter} onChange={(e) => setCollaboratorFilter(e.target.value)} className="rounded-xl border border-border bg-background px-2 text-xs"><option value="">Collaborator</option>{directory.members.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-xl border border-border bg-background px-2 text-xs"><option value="">Source</option>{["playstore", "linkedin", "reddit", "youtube", "freshdesk", "x"].map((item) => <option key={item}>{item}</option>)}</select><select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)} className="rounded-xl border border-border bg-background px-2 text-xs"><option value="">Due date</option><option value="overdue">Overdue</option><option value="seven_days">Next 7 days</option></select></div></div></section>
      {view === "candidates" ? <CandidateQueue candidates={candidates} manager={manager} members={directory.members} teams={directory.teams} onReview={reviewCandidate} onSync={syncCandidates} /> : <IssueTable issues={filtered} pagination={data!.pagination} onPage={setPage} />}
    </div>
  );
}

function IssueTable({ issues, pagination, onPage }: { issues: any[]; pagination: IssuesPayload["pagination"]; onPage: (page: number) => void }) {
  return <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="font-medium">Operational queue</p><p className="text-xs text-muted-foreground">{pagination.total} total issues · page {pagination.page} of {Math.max(pagination.pages, 1)}</p></div><div className="flex gap-2"><button disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-30">Previous</button><button disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-30">Next</button></div></div>{issues.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{["Priority", "Issue", "Sources", "Owner", "Team", "Status", "Due", "Version"].map((item) => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y divide-border">{issues.map((issue) => <tr key={issue.id} className="hover:bg-muted/20"><td className="px-4 py-4"><Pill value={issue.severity} /></td><td className="max-w-md px-4 py-4"><Link href={`/issues/${issue.id}`} className="font-semibold hover:underline">{issue.title}</Link><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{issue.summary}</p></td><td className="px-4 py-4 text-xs">{issue.source_platforms?.join(", ") || "—"}</td><td className="px-4 py-4 text-xs">{issue.owner?.display_name || "Unassigned"}</td><td className="px-4 py-4 text-xs">{issue.team?.name || "—"}</td><td className="px-4 py-4"><Pill value={issue.status} /></td><td className={cn("px-4 py-4 text-xs", issue.overdue && "font-semibold text-red-600")}>{issue.due_at ? new Date(issue.due_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="px-4 py-4 text-xs text-muted-foreground">v{issue.version}</td></tr>)}</tbody></table></div> : <div className="p-12 text-center text-sm text-muted-foreground">No issues match this view.</div>}</section>;
}

function CandidateQueue({ candidates, manager, members, teams, onReview, onSync }: { candidates: IssueCandidate[]; manager: boolean; members: CrmMember[]; teams: CrmTeam[]; onReview: (id: string, action: "promote" | "dismiss", values?: Record<string, any>) => void; onSync: () => void }) {
  return <section className="space-y-3"><div className="flex items-center justify-between"><div><h2 className="font-medium">AI-proposed candidates</h2><p className="text-xs text-muted-foreground">Human confirmation is required before work enters the CRM.</p></div>{manager ? <button onClick={onSync} className="rounded-xl border border-border px-3 py-2 text-xs font-medium"><RefreshCw className="mr-2 inline h-3.5 w-3.5" />Refresh candidates</button> : null}</div>{candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} manager={manager} members={members} teams={teams} onReview={onReview} />) : <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No proposed candidates. Refresh intelligence to scan semantic clusters.</div>}</section>;
}

function CandidateCard({ candidate, manager, members, teams, onReview }: { candidate: IssueCandidate; manager: boolean; members: CrmMember[]; teams: CrmTeam[]; onReview: (id: string, action: "promote" | "dismiss", values?: Record<string, any>) => void }) {
  const [severity, setSeverity] = useState(candidate.severity); const [ownerId, setOwnerId] = useState(""); const [teamId, setTeamId] = useState(""); const [pm, setPm] = useState(""); const [em, setEm] = useState("");
  return <article className="rounded-2xl border border-border bg-card p-5"><div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div><div className="flex flex-wrap gap-2"><Pill value={candidate.severity} />{candidate.source_platforms.map((source) => <Pill key={source} value={source} />)}</div><h3 className="mt-3 text-lg font-semibold">{candidate.title}</h3><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{candidate.summary}</p><p className="mt-3 text-xs text-muted-foreground">{candidate.evidence_snapshot?.length || 0} evidence snapshots · {candidate.source_cluster_ids?.length || 0} contributing clusters</p></div>{manager ? <div className="grid gap-2 rounded-xl border border-border p-3"><select value={severity} onChange={(e) => setSeverity(e.target.value as any)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs">{["critical", "high", "medium", "low"].map((item) => <option key={item}>{item}</option>)}</select><select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="">Proposed team</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="">Accountable owner (optional)</option>{members.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select><div className="grid grid-cols-2 gap-2"><select value={pm} onChange={(e) => setPm(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="">PM</option>{members.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select><select value={em} onChange={(e) => setEm(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="">EM</option>{members.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div><div className="mt-1 flex justify-end gap-2"><button onClick={() => onReview(candidate.id, "dismiss")} className="rounded-lg border border-border px-3 py-2 text-xs font-medium">Dismiss</button><button onClick={() => onReview(candidate.id, "promote", { severity, ownerId: ownerId || null, teamId: teamId || null, collaborators: [{ memberId: pm, responsibility: "pm" }, { memberId: em, responsibility: "em" }].filter((item) => item.memberId) })} className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white">Create issue</button></div></div> : null}</div></article>;
}

function Pill({ value }: { value: string }) { return <span className="inline-flex rounded-full border border-border bg-background px-2 py-1 text-[10px] font-semibold capitalize">{value.replace(/_/g, " ")}</span>; }
function SetupState({ error }: { error: { message: string; code?: string } }) { return <div className="mx-auto mt-20 max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-950"><AlertTriangle className="h-6 w-6" /><h1 className="mt-4 text-2xl font-semibold">Issue CRM setup required</h1><p className="mt-2 text-sm leading-relaxed">{error.message}</p><p className="mt-4 text-xs">Apply the generated Supabase migration, configure OTP redirect URLs, and add your email to CRM_BOOTSTRAP_ADMIN_EMAILS.</p></div>; }
