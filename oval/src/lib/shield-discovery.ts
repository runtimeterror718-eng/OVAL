import { createHash } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { domainToASCII, domainToUnicode } from "url";

export const SHIELD_FORMULA_VERSION = "shield-priority-v1";
export const SHIELD_CRAWLER_VERSION = "shield-safe-crawler-v1";
export const SHIELD_ANALYSIS_VERSION = "shield-deterministic-v1";
export const MAX_REDIRECTS = 5;
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 15_000;

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
]);
const CONTEXT_TERMS =
  /\b(education|exam|jee|neet|upsc|batch|course|teacher|lecture|module|study|student|learning|app|vidyapeeth|skills|onlyias|alakh)\b/i;
const STRONG_TERMS =
  /\b(physics\s*wallah|physicswallah|pw\s+vidyapeeth|pw\s+skills|pw\s+onlyias|alakh\s+pandey)\b/i;

export type CanonicalUrl = {
  originalUrl: string;
  canonicalUrl: string;
  asciiDomain: string;
  unicodeDomain: string;
  registrableDomain: string;
  canonicalUrlHash: string;
  domainHash: string;
  pathHash: string;
};

export type ThreatScoreInput = {
  brandMatch: number;
  infringementConfidence: number;
  harm: number;
  reach: number;
  velocity: number;
  classificationConfidence: number;
  recurrence: number;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const clamp = (value: number) =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export function canonicalizeUrl(raw: string): CanonicalUrl {
  let parsed: URL;
  try {
    parsed = new URL(String(raw || "").trim());
  } catch {
    throw new Error("A valid absolute URL is required");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("Only HTTP and HTTPS URLs are supported");
  if (parsed.username || parsed.password)
    throw new Error("URLs containing credentials are not supported");
  const asciiDomain = domainToASCII(parsed.hostname.toLowerCase());
  if (!asciiDomain || asciiDomain.length > 253)
    throw new Error("The hostname is invalid");
  parsed.hostname = asciiDomain;
  parsed.hash = "";
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  )
    parsed.port = "";
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      TRACKING_PARAMS.has(key.toLowerCase())
    )
      parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  if (!parsed.pathname) parsed.pathname = "/";
  const canonicalUrl = parsed.toString();
  const labels = asciiDomain.split(".").filter(Boolean);
  const registrableDomain = labels.slice(-2).join(".");
  return {
    originalUrl: raw,
    canonicalUrl,
    asciiDomain,
    unicodeDomain: domainToUnicode(asciiDomain),
    registrableDomain,
    canonicalUrlHash: sha256(canonicalUrl),
    domainHash: sha256(asciiDomain),
    pathHash: sha256(`${parsed.pathname}${parsed.search}`),
  };
}

export function isPrivateOrReservedIp(address: string): boolean {
  const value = address.trim().toLowerCase().split("%")[0];
  const version = isIP(value);
  if (!version) return true;
  if (version === 4) {
    const octets = value.split(".").map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (value === "::" || value === "::1") return true;
  if (
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value)
  )
    return true;
  if (value.startsWith("ff")) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateOrReservedIp(mapped[1]) : false;
}

export function assertStablePublicResolution(
  before: string[],
  after: string[],
) {
  if (!before.length || !after.length)
    throw new Error("DNS resolution returned no public address");
  if ([...before, ...after].some(isPrivateOrReservedIp))
    throw new Error(
      "Private, loopback, link-local or reserved destinations are blocked",
    );
  const first = new Set(before);
  if (!after.some((value) => first.has(value)))
    throw new Error("DNS rebinding protection blocked a changed destination");
}

export async function resolvePublicAddresses(
  hostname: string,
): Promise<string[]> {
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new Error("Local destinations are blocked");
  const records = await lookup(hostname, { all: true, verbatim: true });
  const addresses = Array.from(
    new Set(records.map((record) => record.address)),
  );
  if (!addresses.length || addresses.some(isPrivateOrReservedIp))
    throw new Error(
      "Destination resolves to a private, loopback, link-local or reserved address",
    );
  return addresses;
}

export function isAuthorisedDomain(
  hostname: string,
  domains: { domain: string; allow_subdomains?: boolean }[],
) {
  const host = domainToASCII(hostname.toLowerCase());
  return domains.some(
    (item) =>
      host === item.domain ||
      (item.allow_subdomains !== false && host.endsWith(`.${item.domain}`)),
  );
}

export function hasPwContext(text: string) {
  const value = String(text || "");
  return (
    STRONG_TERMS.test(value) ||
    (/\bpw\b/i.test(value) && CONTEXT_TERMS.test(value))
  );
}

export function levenshtein(a: string, b: string) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = old;
    }
  }
  return row[right.length];
}

export function domainSimilarity(candidate: string, protectedTerm: string) {
  const normalise = (value: string) =>
    domainToUnicode(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const left = normalise(candidate.split(".")[0]);
  const right = normalise(protectedTerm);
  if (!left || !right) return 0;
  return (
    Math.round(
      (1 - levenshtein(left, right) / Math.max(left.length, right.length)) *
        10000,
    ) / 100
  );
}

export function generateDomainVariants(
  term: string,
  tlds = ["com", "in", "live"],
): string[] {
  const base = term.toLowerCase().replace(/[^a-z0-9]/g, "");
  const variants = new Set<string>([
    base,
    `${base}-login`,
    `${base}-support`,
    `${base}-batch`,
    `${base}-payment`,
  ]);
  for (let index = 0; index < base.length; index += 1)
    variants.add(base.slice(0, index) + base.slice(index + 1));
  for (let index = 1; index < base.length; index += 1)
    variants.add(`${base.slice(0, index)}-${base.slice(index)}`);
  return Array.from(variants)
    .slice(0, 80)
    .flatMap((variant) => tlds.map((tld) => `${variant}.${tld}`));
}

export function calculateThreatScore(input: ThreatScoreInput) {
  const values = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, clamp(value)]),
  ) as unknown as ThreatScoreInput;
  const priority =
    Math.round(
      (0.35 * values.harm +
        0.25 * values.reach +
        0.2 * values.velocity +
        0.1 * values.classificationConfidence +
        0.1 * values.recurrence) *
        100,
    ) / 100;
  const handlingBand =
    priority < 30
      ? "monitor"
      : priority < 50
        ? "low"
        : priority < 70
          ? "analyst_review"
          : priority < 85
            ? "high"
            : "urgent";
  return {
    ...values,
    priority,
    handlingBand,
    formulaVersion: SHIELD_FORMULA_VERSION,
  } as const;
}

export function classifyCloudflareRelationship(input: {
  nameservers?: string[];
  registrar?: string;
  ips?: string[];
  hostedServiceEvidence?: boolean;
}) {
  if (input.hostedServiceEvidence) return "hosted_service_detected" as const;
  if (/cloudflare/i.test(input.registrar || ""))
    return "registrar_confirmed" as const;
  if ((input.nameservers || []).some((value) => /cloudflare/i.test(value)))
    return "reverse_proxy_likely" as const;
  if (input.nameservers?.length || input.ips?.length)
    return "none_detected" as const;
  return "relationship_unknown" as const;
}

export function parseRdapResponse(value: any) {
  const events = Array.isArray(value?.events) ? value.events : [];
  const event = (name: string) =>
    events.find((item: any) => item?.eventAction === name)?.eventDate || null;
  const registrar = Array.isArray(value?.entities)
    ? value.entities.find((item: any) => item?.roles?.includes("registrar"))
    : null;
  return {
    registrar:
      registrar?.vcardArray?.[1]?.find(
        (item: any[]) => item?.[0] === "fn",
      )?.[3] || null,
    registrationDate: event("registration"),
    expirationDate: event("expiration"),
    statuses: Array.isArray(value?.status) ? value.status : [],
    nameservers: Array.isArray(value?.nameservers)
      ? value.nameservers.map((item: any) => item?.ldhName).filter(Boolean)
      : [],
  };
}

export function evidenceManifest(value: Record<string, unknown>) {
  const canonical = JSON.stringify(value, Object.keys(value).sort());
  return { manifest: canonical, sha256: sha256(canonical) };
}

export function reappearanceScore(input: {
  domainSimilarity: number;
  contentHashMatch: boolean;
  textSimilarity: number;
  faviconSimilarity: number;
  infrastructureSimilarity: number;
}) {
  return (
    Math.round(
      (0.2 * clamp(input.domainSimilarity) +
        0.35 * (input.contentHashMatch ? 100 : 0) +
        0.2 * clamp(input.textSimilarity) +
        0.1 * clamp(input.faviconSimilarity) +
        0.15 * clamp(input.infrastructureSimilarity)) *
        100,
    ) / 100
  );
}

export function shieldRoleCan(role: string, permission: string) {
  const permissions: Record<string, string[]> = {
    viewer: ["read"],
    brand_analyst: ["read", "submit", "search", "verify", "assign", "export"],
    security_analyst: [
      "read",
      "submit",
      "search",
      "verify",
      "assign",
      "export",
    ],
    legal_reviewer: ["read", "submit", "verify", "legal", "export"],
    communications_reviewer: ["read", "submit", "verify"],
    administrator: [
      "read",
      "submit",
      "search",
      "verify",
      "assign",
      "legal",
      "export",
      "configure",
      "process",
    ],
  };
  return Boolean(permissions[role]?.includes(permission));
}
