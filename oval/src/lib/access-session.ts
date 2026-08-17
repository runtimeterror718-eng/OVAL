export const ACCESS_SESSION_COOKIE = "oval_access_session";
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

export async function passwordsMatch(candidate: string) {
  const configured = process.env.OVAL_ACCESS_PASSWORD || "";
  if (configured.length < 24) return false;
  const [candidateDigest, configuredDigest] = await Promise.all([
    digest(candidate),
    digest(configured),
  ]);
  let difference = candidateDigest.length ^ configuredDigest.length;
  const length = Math.max(candidateDigest.length, configuredDigest.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (candidateDigest[index] || 0) ^ (configuredDigest[index] || 0);
  }
  return difference === 0;
}

export function accessSessionMaxAge() {
  return SESSION_TTL_SECONDS;
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

async function digest(value: string) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(result);
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
