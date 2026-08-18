import "server-only";

import { createHash } from "crypto";

export type GatiEnforcementRoute = {
  destination_type:
    | "cloudflare_abuse"
    | "hosting_provider"
    | "registrar"
    | "search_engine"
    | "app_store"
    | "github"
    | "telegram"
    | "social_platform"
    | "payment_provider"
    | "cdn_storage"
    | "rights_holder_manual";
  destination_name: string;
  recipient?: string | null;
  submission_url?: string | null;
  routing_basis: Record<string, unknown>;
  provider_relationship?: string | null;
  recommended_notice_type:
    | "copyright"
    | "trademark"
    | "phishing"
    | "malware"
    | "platform_report"
    | "cease_and_desist";
  priority: number;
};

export function enforcementIdempotencyKey(input: {
  caseId: string;
  routeId: string;
  draftId: string;
  draftVersion: number;
}) {
  return createHash("sha256")
    .update(
      `${input.caseId}:${input.routeId}:${input.draftId}:v${input.draftVersion}`,
    )
    .digest("hex");
}

export function resolveGatiEnforcementRoutes(input: {
  sourceUrl: string;
  threatType: string;
  registrar?: string | null;
  registrarAbuseContact?: string | null;
  hostingProvider?: string | null;
  cloudflareRelationship?: string | null;
  downloadLinks?: string[];
}): GatiEnforcementRoute[] {
  const hostname = safeHostname(input.sourceUrl);
  const notice = noticeType(input.threatType);
  const routes: GatiEnforcementRoute[] = [];
  const add = (route: GatiEnforcementRoute) => {
    const key = `${route.destination_type}:${route.destination_name}`;
    if (
      !routes.some(
        (item) => `${item.destination_type}:${item.destination_name}` === key,
      )
    )
      routes.push(route);
  };

  if (hostname === "github.com" || hostname.endsWith(".github.com"))
    add({
      destination_type: "github",
      destination_name: "GitHub Trust & Safety",
      submission_url: "https://support.github.com/contact/dmca-takedown",
      routing_basis: { hostname, reason: "Repository-hosted material" },
      recommended_notice_type: "copyright",
      priority: 90,
    });
  if (["t.me", "telegram.me"].includes(hostname))
    add({
      destination_type: "telegram",
      destination_name: "Telegram abuse",
      recipient: "abuse@telegram.org",
      routing_basis: { hostname, reason: "Telegram-hosted distribution" },
      recommended_notice_type: notice,
      priority: 90,
    });
  if (
    input.cloudflareRelationship &&
    !["none_detected", "relationship_unknown"].includes(
      input.cloudflareRelationship,
    )
  )
    add({
      destination_type: "cloudflare_abuse",
      destination_name: "Cloudflare Abuse",
      submission_url: "https://abuse.cloudflare.com/",
      routing_basis: {
        hostname,
        reason: "Cloudflare relationship observed",
        warning:
          "Cloudflare may be the registrar or reverse proxy rather than the origin host.",
      },
      provider_relationship: input.cloudflareRelationship,
      recommended_notice_type: notice,
      priority: 80,
    });
  if (input.registrar)
    add({
      destination_type: "registrar",
      destination_name: input.registrar,
      recipient: input.registrarAbuseContact || null,
      routing_basis: { hostname, reason: "RDAP registrar record" },
      provider_relationship: "registrar",
      recommended_notice_type:
        notice === "phishing" ? "phishing" : "cease_and_desist",
      priority: input.registrarAbuseContact ? 75 : 55,
    });
  if (input.hostingProvider)
    add({
      destination_type: "hosting_provider",
      destination_name: input.hostingProvider,
      routing_basis: { hostname, reason: "Infrastructure attribution" },
      provider_relationship: "likely_host",
      recommended_notice_type: notice,
      priority: 85,
    });
  if (
    input.threatType.includes("application") ||
    (input.downloadLinks || []).some((link) => /\.(apk|xapk|apks)(?:$|[?#])/i.test(link))
  )
    add({
      destination_type: "app_store",
      destination_name: "Application distribution review",
      routing_basis: {
        hostname,
        reason: "APK/application distribution evidence",
        downloadLinks: (input.downloadLinks || []).slice(0, 10),
      },
      recommended_notice_type: "malware",
      priority: 88,
    });
  add({
    destination_type: "search_engine",
    destination_name: "Search de-indexing review",
    submission_url: "https://support.google.com/legal/troubleshooter/1114905",
    routing_basis: { hostname, reason: "Verified public URL" },
    recommended_notice_type: notice,
    priority: 45,
  });
  add({
    destination_type: "rights_holder_manual",
    destination_name: "PW Legal Operations",
    routing_basis: {
      hostname,
      reason: "Human approval and rights-basis review required",
    },
    recommended_notice_type: notice,
    priority: 100,
  });
  return routes.sort((a, b) => b.priority - a.priority);
}

function noticeType(threatType: string): GatiEnforcementRoute["recommended_notice_type"] {
  const value = String(threatType || "").toLowerCase();
  if (value.includes("phish") || value.includes("credential")) return "phishing";
  if (value.includes("app") || value.includes("malware")) return "malware";
  if (value.includes("piracy") || value.includes("copyright")) return "copyright";
  if (value.includes("imperson")) return "trademark";
  return "platform_report";
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}
