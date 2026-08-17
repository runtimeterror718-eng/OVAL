import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnvironment } from "dotenv";
import { resolve } from "path";
import { cookies, headers } from "next/headers";
import type { CrmMember, CrmRole } from "@/lib/crm-types";
import {
  ACCESS_SESSION_COOKIE,
  verifyAccessSession,
} from "@/lib/access-session";

// The legacy OVAL workers keep server credentials in the shared secrets file.
// Load it only on the server and never override deployment-provided variables.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
  const sharedEnvironment: Record<string, string> = {};
  loadEnvironment({ path: resolve(process.cwd(), "../secrets/.env.keys"), processEnv: sharedEnvironment, quiet: true });
  for (const name of ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_SERVICE_KEY"]) {
    if (!process.env[name] && sharedEnvironment[name]) process.env[name] = sharedEnvironment[name];
  }
}

// Bracket access keeps server-only values runtime-resolved after the shared
// secrets file has loaded, instead of allowing the Next build to inline blanks.
const runtimeEnv = (name: string) => process.env[name] || "";
const url = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL") || runtimeEnv("SUPABASE_URL");
const publishableKey = runtimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || runtimeEnv("NEXT_PUBLIC_SUPABASE_KEY") || runtimeEnv("SUPABASE_ANON_KEY");
const serviceKey = runtimeEnv("SUPABASE_SERVICE_ROLE_KEY") || runtimeEnv("SUPABASE_SERVICE_KEY");
export const DEFAULT_BRAND_ID = "166d8523-79a0-4b1c-b56f-8b40b6cc2f1f";

export class CrmError extends Error {
  constructor(message: string, public status = 400, public code = "crm_error") { super(message); }
}

export function crmAdmin() {
  if (!url || !serviceKey) throw new CrmError("CRM database is not configured", 503, "crm_not_configured");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function crmSessionClient() {
  if (!url || !publishableKey) throw new CrmError("Supabase Auth is not configured", 503, "auth_not_configured");
  const store = cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

export async function requireCrmContext(roles?: CrmRole[]) {
  const admin = crmAdmin();
  if (isLocalCrmBypass()) return requireLocalCrmContext(admin, roles);
  const passwordSession = await verifyAccessSession(
    cookies().get(ACCESS_SESSION_COOKIE)?.value,
  );
  if (passwordSession) {
    return requirePasswordCrmContext(admin, passwordSession.email, roles);
  }
  const auth = crmSessionClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user?.email) throw new CrmError("Authentication required", 401, "unauthorized");
  if (!user.email.toLowerCase().endsWith("@pw.live")) throw new CrmError("PW email required", 403, "domain_denied");
  let { data: member, error: memberError } = await admin
    .from("crm_members")
    .select("*, team:crm_teams(*)")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (memberError?.code === "42P01") throw new CrmError("Issue CRM migration has not been applied", 503, "migration_required");
  if (!member && shouldBootstrap(user.email)) {
    const { count } = await admin.from("crm_members").select("id", { count: "exact", head: true });
    if ((count || 0) === 0) {
      const displayName = String(user.email.split("@")[0]).replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const inserted = await admin.from("crm_members").insert({ brand_id: DEFAULT_BRAND_ID, user_id: user.id, email: user.email, display_name: displayName, role: "admin" }).select("*, team:crm_teams(*)").single();
      member = inserted.data;
      memberError = inserted.error;
    }
  }
  if (memberError) throw new CrmError(memberError.message, 500, "member_lookup_failed");
  if (!member) throw new CrmError("Your account is not active in the OVAL directory", 403, "member_inactive");
  if (roles && !roles.includes(member.role)) throw new CrmError("Insufficient permission", 403, "forbidden");
  return { user, member: member as CrmMember, admin };
}

async function requirePasswordCrmContext(
  admin: ReturnType<typeof crmAdmin>,
  email: string,
  roles?: CrmRole[],
) {
  const { data: member, error } = await admin
    .from("crm_members")
    .select("*, team:crm_teams(*)")
    .eq("brand_id", DEFAULT_BRAND_ID)
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  if (error?.code === "42P01") {
    throw new CrmError(
      "Issue CRM migration has not been applied",
      503,
      "migration_required",
    );
  }
  if (error) {
    throw new CrmError(error.message, 500, "member_lookup_failed");
  }
  if (!member) {
    throw new CrmError(
      "Your @pw.live email is not active in the OVAL directory",
      403,
      "member_inactive",
    );
  }
  if (roles && !roles.includes(member.role)) {
    throw new CrmError("Insufficient permission", 403, "forbidden");
  }
  return {
    user: { id: member.user_id, email: member.email },
    member: member as CrmMember,
    admin,
  };
}

/**
 * Local-only context for the standalone Integrations preview on port 3001.
 * This never bypasses authentication for oval.run or any non-local hostname.
 */
export async function requireIntegrationContext(roles?: CrmRole[]) {
  const admin = crmAdmin();
  if (isLocalIntegrationBypass()) return requireLocalCrmContext(admin, roles);
  return requireCrmContext(roles);
}

function isLocalCrmBypass() {
  if (process.env.CRM_DEV_AUTH_BYPASS !== "true") return false;
  const host = String(headers().get("host") || "").toLowerCase();
  return host === "localhost:3001" || host === "127.0.0.1:3001" || host === "[::1]:3001";
}

function isLocalIntegrationBypass() {
  if (process.env.INTEGRATIONS_DEV_AUTH_BYPASS !== "true") return false;
  const host = String(headers().get("host") || "").toLowerCase();
  return host === "localhost:3001" || host === "127.0.0.1:3001" || host === "[::1]:3001";
}

async function requireLocalCrmContext(admin: ReturnType<typeof crmAdmin>, roles?: CrmRole[]) {
  let memberQuery = admin
    .from("crm_members")
    .select("*, team:crm_teams(*)")
    .eq("brand_id", DEFAULT_BRAND_ID)
    .eq("active", true);
  if (roles?.length) memberQuery = memberQuery.in("role", roles);
  let { data: member, error: memberError } = await memberQuery
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!member && !memberError) {
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users.error) throw new CrmError(users.error.message, 500, "dev_identity_lookup_failed");
    const user = users.data.users.find((candidate) => candidate.email?.toLowerCase().endsWith("@pw.live"));
    if (!user?.email) throw new CrmError("No @pw.live Auth identity exists for the local CRM bypass", 503, "dev_identity_missing");
    const displayName = String(user.email.split("@")[0]).replace(/[._-]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
    const inserted = await admin.from("crm_members").insert({ brand_id: DEFAULT_BRAND_ID, user_id: user.id, email: user.email, display_name: displayName, role: "admin" }).select("*, team:crm_teams(*)").single();
    member = inserted.data;
    memberError = inserted.error;
  }
  if (memberError) throw new CrmError(memberError.message, 500, "dev_member_bootstrap_failed");
  if (!member) throw new CrmError("Local CRM member could not be created", 503, "dev_member_missing");
  if (roles && !roles.includes(member.role)) throw new CrmError("Insufficient permission", 403, "forbidden");
  return { user: { id: member.user_id, email: member.email }, member: member as CrmMember, admin };
}

function shouldBootstrap(email: string) {
  const configured = (process.env.CRM_BOOTSTRAP_ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return configured.includes(email.toLowerCase());
}

export function crmErrorResponse(error: unknown) {
  const value = error instanceof CrmError ? error : new CrmError(error instanceof Error ? error.message : "Unexpected CRM error", 500);
  return Response.json({ error: value.message, code: value.code }, { status: value.status });
}

export async function assertBrandDirectoryReferences(admin: any, brandId: string, input: { ownerId?: string | null; teamId?: string | null; memberIds?: string[] }) {
  if (input.ownerId) {
    const owner = await admin.from("crm_members").select("id").eq("id", input.ownerId).eq("brand_id", brandId).eq("active", true).maybeSingle();
    if (!owner.data) throw new CrmError("Owner is not an active member of this brand", 400, "invalid_owner");
  }
  if (input.teamId) {
    const team = await admin.from("crm_teams").select("id").eq("id", input.teamId).eq("brand_id", brandId).eq("active", true).maybeSingle();
    if (!team.data) throw new CrmError("Team is not active for this brand", 400, "invalid_team");
  }
  const ids = Array.from(new Set((input.memberIds || []).filter(Boolean)));
  if (ids.length) {
    const members = await admin.from("crm_members").select("id").eq("brand_id", brandId).eq("active", true).in("id", ids);
    if ((members.data || []).length !== ids.length) throw new CrmError("A collaborator is not active for this brand", 400, "invalid_collaborator");
  }
}
