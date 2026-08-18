import "server-only";

import {
  resolve4,
  resolve6,
  resolveCname,
  resolveMx,
  resolveNs,
  resolveTxt,
} from "dns/promises";
import {
  canonicalizeUrl,
  hasPwContext,
  parseRdapResponse,
  resolvePublicAddresses,
} from "@/lib/shield-discovery";

export type DiscoveryResult = {
  provider: string;
  discoveryMethod: string;
  query: string;
  url: string;
  domain: string;
  title: string;
  excerpt: string;
  timestamp: string | null;
  sourceUrl: string;
  rawMetadata: Record<string, unknown>;
  providerConfidence: number;
  rankingPosition: number | null;
};

export type ProviderRunInput = {
  queries: string[];
  maxResults: number;
  startPublishedDate?: string;
};

export interface DiscoveryProvider {
  key: string;
  type:
    | "manual"
    | "search"
    | "certificate_transparency"
    | "social"
    | "rdap_dns"
    | "malicious_url";
  configured(): boolean;
  run(input: ProviderRunInput): Promise<{
    results: DiscoveryResult[];
    cursor?: string;
    rateLimitState?: Record<string, unknown>;
  }>;
}

const PIRACY_QUERY_FAMILIES = [
  "paid courses, batches, lecture recordings, test series or subscriptions being resold or shared without authorisation",
  "free or leaked lectures, DPPs, modules, notes, PDFs, test papers or Drive links",
  "Telegram channels, invite pages, mirrors and directories distributing complete batches or course content",
  "marketplace listings selling course access, shared accounts, recorded lectures, modules or test series",
  "GitHub repositories, scripts, bots or extractors used to download protected course resources or tokens",
  "cracked or modified APK downloads claiming free premium course access",
  "file indexes, document hosts and blogs offering copied books, modules, notes or PDFs",
  "forum, Reddit and social posts advertising leaked batches, account sharing or piracy groups",
];

const IMPERSONATION_QUERY_FAMILIES = [
  "lookalike login, sign-in or OTP pages impersonating the education brand",
  "fake payment, discount, refund, scholarship or admission pages using the brand name",
  "fake customer-care, WhatsApp, Telegram or social accounts requesting money or credentials",
  "unofficial APK downloads, cloned applications or credential collection pages",
  "newly registered lookalike domains using the brand, teacher or course names",
];

export function buildDiscoveryQueries(input: {
  terms: { term: string; requires_context?: boolean }[];
  threatType?: string;
  customQuery?: string;
  limit?: number;
}) {
  const output = new Set<string>();
  if (input.customQuery?.trim()) output.add(input.customQuery.trim());
  const terms = input.terms
    .filter(
      (item) =>
        item.term.trim() &&
        !(item.term.trim().toLowerCase() === "pw" && item.requires_context),
    )
    .map((item) => item.term.trim())
    .slice(0, 12);
  const brandScope = terms.map((term) => `"${term}"`).join(" OR ");
  const threatType = input.threatType || "all";
  const families = /imperson|phish|login|payment/i.test(threatType)
    ? IMPERSONATION_QUERY_FAMILIES
    : /piracy|lecture|pdf|batch|apk|credential/i.test(threatType)
      ? PIRACY_QUERY_FAMILIES
      : [...PIRACY_QUERY_FAMILIES, ...IMPERSONATION_QUERY_FAMILIES];
  for (const family of families) {
    output.add(
      `Find the actual public offering or destination page for (${brandScope}) involving ${family}. Exclude official domains, ordinary news coverage and generic reviews.`,
    );
  }
  // High-yield surfaces get their own queries so a broad semantic result set
  // cannot crowd out marketplace, messaging and technical-tool evidence.
  const primary = terms[0] || "Physics Wallah";
  const surfaceQueries = /imperson|phish|login|payment/i.test(threatType)
    ? [
        `"${primary}" fake login OR OTP OR payment OR support`,
        `"${primary}" mod APK OR cracked APK OR cloned app`,
      ]
    : [
        `"${primary}" site:t.me batch lecture DPP free`,
        `"${primary}" site:github.com extractor download course`,
        `"${primary}" resale OR shared account OR subscription`,
        `"${primary}" PDF module test series download`,
      ];
  surfaceQueries.forEach((query) => output.add(query));
  return Array.from(output).slice(0, Math.max(1, input.limit || 40));
}

export const exaSearchProvider: DiscoveryProvider = {
  key: "exa",
  type: "search",
  configured: () => Boolean(process.env.EXA_API_KEY),
  async run(input) {
    if (!process.env.EXA_API_KEY)
      throw new Error("provider_not_configured:EXA_API_KEY");
    const all: DiscoveryResult[] = [];
    const perQuery = Math.max(
      1,
      Math.min(
        25,
        Math.ceil(input.maxResults / Math.max(1, input.queries.length)),
      ),
    );
    for (const query of input.queries) {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.EXA_API_KEY,
        },
        body: JSON.stringify({
          query,
          type: "auto",
          numResults: perQuery,
          startPublishedDate: input.startPublishedDate,
          contents: {
            highlights: { maxCharacters: 1200 },
            text: { maxCharacters: 3000 },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 429) throw new Error("provider_rate_limited:exa");
      if (!response.ok)
        throw new Error(`provider_error:exa:${response.status}`);
      const payload = await response.json();
      for (const [index, item] of (payload.results || []).entries()) {
        try {
          const canonical = canonicalizeUrl(item.url);
          const excerpt = Array.isArray(item.highlights)
            ? item.highlights.join(" ")
            : String(item.text || "").slice(0, 1200);
          if (!hasPwContext(`${item.title || ""} ${excerpt}`)) continue;
          all.push({
            provider: "exa",
            discoveryMethod: "search_api",
            query,
            url: item.url,
            domain: canonical.asciiDomain,
            title: item.title || canonical.asciiDomain,
            excerpt,
            timestamp: item.publishedDate || null,
            sourceUrl: item.url,
            rawMetadata: {
              id: item.id,
              author: item.author,
              requestId: payload.requestId,
            },
            providerConfidence: 0.7,
            rankingPosition: index + 1,
          });
        } catch {
          // Invalid or unsupported provider URLs are ignored per result.
        }
      }
    }
    return {
      results: all.slice(0, input.maxResults),
      rateLimitState: { exhausted: false },
    };
  },
};

export const certificateTransparencyProvider: DiscoveryProvider = {
  key: "certificate_transparency",
  type: "certificate_transparency",
  configured: () => process.env.SHIELD_CT_ENABLED === "true",
  async run(input) {
    if (process.env.SHIELD_CT_ENABLED !== "true")
      throw new Error("provider_not_configured:SHIELD_CT_ENABLED");
    const results: DiscoveryResult[] = [];
    for (const query of input.queries.slice(0, 5)) {
      const token = query.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (token.length < 5) continue;
      const sourceUrl = `https://crt.sh/?q=%25${encodeURIComponent(token)}%25&output=json`;
      const response = await fetch(sourceUrl, {
        headers: { "User-Agent": "OVAL-Shield/1.0 brand-protection" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new Error(
          `provider_error:certificate_transparency:${response.status}`,
        );
      const rows = await response.json();
      for (const row of Array.isArray(rows)
        ? rows.slice(0, input.maxResults)
        : []) {
        for (const name of String(row.name_value || "").split("\n")) {
          const hostname = name.replace(/^\*\./, "").trim().toLowerCase();
          if (!hostname || hostname.includes("@")) continue;
          try {
            const canonical = canonicalizeUrl(`https://${hostname}/`);
            results.push({
              provider: "certificate_transparency",
              discoveryMethod: "certificate_log",
              query,
              url: canonical.canonicalUrl,
              domain: canonical.asciiDomain,
              title: `Certificate name: ${canonical.unicodeDomain}`,
              excerpt:
                "Certificate issuance is a lead only; website activity and intent are unverified.",
              timestamp: row.entry_timestamp || null,
              sourceUrl,
              rawMetadata: {
                certificateId: row.id,
                issuerName: row.issuer_name,
                notBefore: row.not_before,
                notAfter: row.not_after,
                nameValue: row.name_value,
              },
              providerConfidence: 0.35,
              rankingPosition: null,
            });
          } catch {
            // Ignore invalid certificate names.
          }
        }
      }
    }
    return { results: results.slice(0, input.maxResults) };
  },
};

export async function enrichDomain(domain: string) {
  await resolvePublicAddresses(domain);
  const safe = async <T>(
    callback: () => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    try {
      return await callback();
    } catch {
      return fallback;
    }
  };
  const [a, aaaa, cname, ns, mx, txt, rdapResponse] = await Promise.all([
    safe(() => resolve4(domain), [] as string[]),
    safe(() => resolve6(domain), [] as string[]),
    safe(() => resolveCname(domain), [] as string[]),
    safe(() => resolveNs(domain), [] as string[]),
    safe(
      () => resolveMx(domain),
      [] as { exchange: string; priority: number }[],
    ),
    safe(() => resolveTxt(domain), [] as string[][]),
    safe(
      () =>
        fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        }).then(async (response) => (response.ok ? response.json() : null)),
      null,
    ),
  ]);
  return {
    dns: { a, aaaa, cname, ns, mx, txt },
    rdap: rdapResponse ? parseRdapResponse(rdapResponse) : null,
    rdapRaw: rdapResponse,
  };
}

export async function queryGoogleWebRisk(url: string) {
  const key = process.env.GOOGLE_WEB_RISK_API_KEY;
  if (!key)
    return {
      configured: false,
      provider: "google_web_risk",
      verdict: "not_queried",
      threats: [] as string[],
    };
  const endpoint = new URL("https://webrisk.googleapis.com/v1/uris:search");
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("uri", url);
  for (const type of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"])
    endpoint.searchParams.append("threatTypes", type);
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`provider_error:google_web_risk:${response.status}`);
  const payload = await response.json();
  return {
    configured: true,
    provider: "google_web_risk",
    verdict: payload.threat ? "listed" : "no_match",
    threats: payload.threat?.threatTypes || [],
    expireTime: payload.threat?.expireTime || null,
  };
}

export const providerRegistry: Record<string, DiscoveryProvider> = {
  exa: exaSearchProvider,
  certificate_transparency: certificateTransparencyProvider,
};
