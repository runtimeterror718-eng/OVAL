import "server-only";

import { createHash } from "crypto";
import { headers } from "next/headers";
import {
  CrmError,
  DEFAULT_BRAND_ID,
  crmAdmin,
  crmErrorResponse,
  requireCrmContext,
} from "@/lib/crm-server";
import {
  canonicalizeUrl,
  isAuthorisedDomain,
  shieldRoleCan,
} from "@/lib/shield-discovery";
import { buildDiscoveryQueries } from "@/lib/shield-providers";

export type ShieldRole =
  | "viewer"
  | "brand_analyst"
  | "security_analyst"
  | "legal_reviewer"
  | "communications_reviewer"
  | "administrator";
export type ShieldPermission =
  | "read"
  | "submit"
  | "search"
  | "verify"
  | "assign"
  | "legal"
  | "export"
  | "configure"
  | "process";

const CRM_ROLE_FALLBACK: Record<string, ShieldRole> = {
  admin: "administrator",
  manager: "brand_analyst",
  member: "viewer",
};

export async function requireShieldContext(
  permission: ShieldPermission = "read",
) {
  const context = await requireCrmContext();
  const role =
    (context.member as any).shield_role ||
    CRM_ROLE_FALLBACK[context.member.role] ||
    "viewer";
  if (!shieldRoleCan(role, permission))
    throw new CrmError(
      "Insufficient Shield permission",
      403,
      "shield_forbidden",
    );
  return { ...context, shieldRole: role as ShieldRole };
}

export const shieldErrorResponse = crmErrorResponse;

export function requirePrivateTrigger(request: Request) {
  const configured = process.env.SHIELD_TRIGGER_TOKEN;
  const supplied =
    request.headers.get("x-shield-trigger-token") ||
    new URL(request.url).searchParams.get("token");
  if (!configured || supplied !== configured)
    throw new CrmError("Invalid Shield trigger token", 401, "invalid_trigger");
}

export async function requirePrivateShieldContext(request: Request) {
  requirePrivateTrigger(request);
  const admin = crmAdmin();
  const member = await admin
    .from("crm_members")
    .select("*,team:crm_teams(*)")
    .eq("brand_id", DEFAULT_BRAND_ID)
    .eq("active", true)
    .in("shield_role", ["administrator", "brand_analyst"])
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (member.error) throw member.error;
  if (!member.data)
    throw new CrmError(
      "No active Gati automation identity is configured",
      503,
      "gati_automation_identity_missing",
    );
  return {
    admin,
    member: member.data,
    user: { id: member.data.user_id, email: member.data.email },
    shieldRole: member.data.shield_role as ShieldRole,
  };
}

export async function submitCandidate(
  input: {
    url: string;
    suspectedThreatType?: string;
    description?: string;
    discoverySource?: string;
    relatedAssetId?: string | null;
    urgency?: "low" | "normal" | "high" | "urgent";
    reporterId?: string | null;
    runId?: string | null;
  },
  context: Awaited<ReturnType<typeof requireShieldContext>>,
) {
  const canonical = canonicalizeUrl(input.url);
  const { admin, member } = context;
  const { data: allowlist, error: allowlistError } = await admin
    .from("authorised_domains")
    .select("domain,allow_subdomains")
    .eq("brand_id", member.brand_id)
    .eq("active", true);
  if (allowlistError) throw allowlistError;
  if (isAuthorisedDomain(canonical.asciiDomain, allowlist || []))
    throw new CrmError(
      "Authorised PW domains cannot enter the suspicious crawl queue",
      400,
      "authorised_domain",
    );

  const domainResult = await admin
    .from("domains")
    .upsert(
      {
        brand_id: member.brand_id,
        ascii_domain: canonical.asciiDomain,
        unicode_domain: canonical.unicodeDomain,
        registrable_domain: canonical.registrableDomain,
        domain_hash: canonical.domainHash,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,domain_hash" },
    )
    .select("*")
    .single();
  if (domainResult.error) throw domainResult.error;
  const existing = await admin
    .from("url_candidates")
    .select("*")
    .eq("brand_id", member.brand_id)
    .eq("canonical_url_hash", canonical.canonicalUrlHash)
    .maybeSingle();
  if (existing.error) throw existing.error;
  let candidate = existing.data;
  if (!candidate) {
    const inserted = await admin
      .from("url_candidates")
      .insert({
        brand_id: member.brand_id,
        domain_id: domainResult.data.id,
        original_url: canonical.originalUrl,
        canonical_url: canonical.canonicalUrl,
        canonical_url_hash: canonical.canonicalUrlHash,
        path_hash: canonical.pathHash,
        candidate_status: "queued",
        suspected_threat_type: input.suspectedThreatType || null,
        urgency: input.urgency || "normal",
        related_asset_id: input.relatedAssetId || null,
        submitted_by: input.reporterId || member.id,
        source_context: {
          description: input.description || "",
          discoverySource: input.discoverySource || "manual",
        },
      })
      .select("*")
      .single();
    if (inserted.error) throw inserted.error;
    candidate = inserted.data;
  }
  const provider = await admin
    .from("discovery_providers")
    .select("id")
    .eq("brand_id", member.brand_id)
    .eq("provider_key", input.discoverySource || "manual")
    .maybeSingle();
  if (provider.error) throw provider.error;
  const fallbackProvider =
    provider.data ||
    (
      await admin
        .from("discovery_providers")
        .select("id")
        .eq("brand_id", member.brand_id)
        .eq("provider_key", "manual")
        .single()
    ).data;
  if (!fallbackProvider?.id)
    throw new CrmError(
      "Manual discovery provider is not configured",
      503,
      "provider_missing",
    );
  await admin.from("discovery_events").upsert(
    {
      brand_id: member.brand_id,
      run_id: input.runId || null,
      provider_id: fallbackProvider.id,
      candidate_id: candidate.id,
      discovery_method: input.discoverySource || "manual_submission",
      title: input.suspectedThreatType || "Manual suspicious URL",
      excerpt: input.description || "",
      source_url: canonical.originalUrl,
      provider_confidence: 1,
      raw_provider_metadata: { reporterId: input.reporterId || member.id },
    },
    {
      onConflict: "provider_id,candidate_id,source_url,search_query",
      ignoreDuplicates: true,
    },
  );
  const existingJob = await admin
    .from("crawl_jobs")
    .select("id,status")
    .eq("candidate_id", candidate.id)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingJob.error) throw existingJob.error;
  let crawlJob = existingJob.data;
  if (!crawlJob) {
    const queued = await admin
      .from("crawl_jobs")
      .insert({
        brand_id: member.brand_id,
        candidate_id: candidate.id,
        run_id: input.runId || null,
        priority:
          input.urgency === "urgent"
            ? 100
            : input.urgency === "high"
              ? 80
              : input.urgency === "low"
                ? 30
                : 50,
      })
      .select("id,status")
      .single();
    if (queued.error) throw queued.error;
    crawlJob = queued.data;
  }
  await audit(
    admin,
    member.brand_id,
    member.id,
    "url_candidate",
    candidate.id,
    existing.data ? "duplicate_linked" : "submitted",
    null,
    candidate,
  );
  return { candidate, crawlJob, duplicate: Boolean(existing.data) };
}

export async function createDiscoveryRun(
  input: any,
  context: Awaited<ReturnType<typeof requireShieldContext>>,
) {
  const { admin, member } = context;
  const maxResults = Math.min(Math.max(Number(input.maxResults || 50), 1), 100);
  const providers =
    Array.isArray(input.sources) && input.sources.length
      ? input.sources
      : ["exa"];
  const termsResult = await admin
    .from("brand_terms")
    .select("term,requires_context")
    .eq("brand_id", member.brand_id)
    .eq("active", true)
    .order("created_at");
  if (termsResult.error) throw termsResult.error;
  const exaQueries = buildDiscoveryQueries({
    terms: termsResult.data || [],
    threatType: input.threatType,
    customQuery: input.customQuery,
    limit: 20,
  });
  const providerRows = await admin
    .from("discovery_providers")
    .select("id,provider_key,mode,enabled")
    .eq("brand_id", member.brand_id)
    .in("provider_key", providers);
  if (providerRows.error) throw providerRows.error;
  const run = await admin
    .from("discovery_runs")
    .insert({
      brand_id: member.brand_id,
      requested_by: member.id,
      run_type: "threat_search",
      status: "queued",
      request: {
        assetId: input.assetId || null,
        threatType: input.threatType || "all",
        sources: providers,
        dateScope: input.dateScope || "30d",
        maxResults,
        customQuery: input.customQuery || null,
        priority: input.priority || "normal",
      },
      provider_status: Object.fromEntries(
        providers.map((key: string) => [key, { status: "queued" }]),
      ),
    })
    .select("*")
    .single();
  if (run.error) throw run.error;
  const queryRows = [];
  for (const provider of providerRows.data || []) {
    const providerQueries =
      provider.provider_key === "exa"
        ? exaQueries
        : provider.provider_key === "certificate_transparency"
          ? (termsResult.data || [])
              .filter(
                (item: any) =>
                  !item.requires_context &&
                  String(item.term || "").replace(/[^a-z0-9]/gi, "").length >=
                    5,
              )
              .map((item: any) => String(item.term).trim())
              .slice(0, 8)
          : provider.provider_key === "oval_social"
            ? [
                input.customQuery?.trim() ||
                  `PW public social signals: ${input.threatType || "all"}`,
              ]
            : exaQueries.slice(0, 1);
    for (const query of providerQueries)
      queryRows.push({
        brand_id: member.brand_id,
        run_id: run.data.id,
        provider_id: provider.id,
        query_text: query,
        search_category: input.threatType || "all",
        requested_limit: Math.min(maxResults, 100),
        status: provider.enabled ? "queued" : "failed",
        error_code: provider.enabled ? null : `provider_${provider.mode}`,
      });
  }
  if (queryRows.length) {
    const inserted = await admin.from("discovery_queries").insert(queryRows);
    if (inserted.error) throw inserted.error;
  }
  await audit(
    admin,
    member.brand_id,
    member.id,
    "discovery_run",
    run.data.id,
    "started",
    null,
    run.data,
  );
  return {
    run: run.data,
    queries: queryRows.length,
    providers: providerRows.data || [],
  };
}

export async function audit(
  admin: any,
  brandId: string,
  actorId: string | null,
  entityType: string,
  entityId: string,
  action: string,
  beforeValue: any,
  afterValue: any,
) {
  const forwarded = headers().get("x-forwarded-for") || "";
  const ipHash = forwarded
    ? createHash("sha256").update(forwarded.split(",")[0].trim()).digest("hex")
    : null;
  const result = await admin.from("audit_events").insert({
    brand_id: brandId,
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    before_value: beforeValue,
    after_value: afterValue,
    request_id: headers().get("x-request-id"),
    ip_hash: ipHash,
  });
  if (result.error) throw result.error;
}

export function migrationMissing(error: any) {
  return (
    error?.code === "42P01" ||
    /does not exist|schema cache/i.test(String(error?.message || error || ""))
  );
}
