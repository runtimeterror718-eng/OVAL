export const ACCESS_SESSION_COOKIE = "oval_access_session";
export const AUTH_NEXT_COOKIE = "oval_auth_next";
export const PW_EMAIL_PATTERN = /^[a-z0-9._%+-]+@pw\.live$/i;

const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AccessSession = {
  email: string;
  expiresAt: number;
};

export async function createAccessSession(email: string) {
  const session: AccessSession = {
    email: email.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = await sign(payload, sessionSecret());
  return `${payload}.${signature}`;
}

export async function verifyAccessSession(
  token: string | null | undefined,
): Promise<AccessSession | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return null;
  }

  const key = await importSigningKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(signature),
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  try {
    const session = JSON.parse(decodeBase64UrlText(payload)) as AccessSession;
    if (
      !PW_EMAIL_PATTERN.test(session.email) ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function accessSessionMaxAge() {
  return SESSION_TTL_SECONDS;
}

export function resolvePublicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to trusted proxy headers when configuration is malformed.
    }
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host && /^(?:www\.)?oval\.run$/i.test(host)) {
    return `https://${host}`;
  }
  if (host && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host)) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
  }

  if (process.env.NODE_ENV === "production") return "https://oval.run";
  return new URL(request.url).origin;
}

function sessionSecret() {
  const secret = process.env.OVAL_AUTH_SECRET || "";
  if (secret.length < 32) {
    throw new Error("OVAL_AUTH_SECRET must contain at least 32 characters");
  }
  return secret;
}

async function sign(value: string, secret: string) {
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return encodeBase64UrlBytes(new Uint8Array(signature));
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encodeBase64Url(value: string) {
  return encodeBase64UrlBytes(new TextEncoder().encode(value));
}

function encodeBase64UrlBytes(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64UrlText(value: string) {
  return new TextDecoder().decode(decodeBase64Url(value));
}
