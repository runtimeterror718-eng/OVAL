import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { CrmError, DEFAULT_BRAND_ID, crmAdmin, requireIntegrationContext } from "@/lib/crm-server";

export const SOCIAL_PROVIDERS = ["linkedin", "x", "facebook", "instagram"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export type OAuthState = {
  provider: SocialProvider;
  nonce: string;
  verifier?: string;
  userId: string;
  brandId: string;
  returnTo: string;
  expiresAt: number;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
};

const env = (name: string) => String(process.env[name] || "").trim();
const requestedScopes = (name: string, fallback: string[]) => env(name).split(/[ ,]+/).filter(Boolean).length ? env(name).split(/[ ,]+/).filter(Boolean) : fallback;

export function isSocialProvider(value: string): value is SocialProvider {
  return SOCIAL_PROVIDERS.includes(value as SocialProvider);
}

export function providerConfig(provider: SocialProvider): ProviderConfig {
  const configs: Record<SocialProvider, ProviderConfig> = {
    linkedin: {
      clientId: env("LINKEDIN_CLIENT_ID"), clientSecret: env("LINKEDIN_CLIENT_SECRET"),
      authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: requestedScopes("LINKEDIN_OAUTH_SCOPES", ["r_organization_social", "r_organization_social_feed", "rw_organization_admin"]),
    },
    x: {
      clientId: env("X_CLIENT_ID"), clientSecret: env("X_CLIENT_SECRET"),
      authorizeUrl: "https://x.com/i/oauth2/authorize", tokenUrl: "https://api.x.com/2/oauth2/token",
      scopes: requestedScopes("X_OAUTH_SCOPES", ["tweet.read", "users.read", "offline.access"]), pkce: true,
    },
    facebook: {
      clientId: env("META_APP_ID"), clientSecret: env("META_APP_SECRET"),
      authorizeUrl: "https://www.facebook.com/v23.0/dialog/oauth", tokenUrl: "https://graph.facebook.com/v23.0/oauth/access_token",
      scopes: requestedScopes("FACEBOOK_OAUTH_SCOPES", ["pages_show_list", "pages_read_engagement", "pages_read_user_content"]),
    },
    instagram: {
      clientId: env("INSTAGRAM_APP_ID"), clientSecret: env("INSTAGRAM_APP_SECRET"),
      authorizeUrl: "https://www.instagram.com/oauth/authorize", tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: requestedScopes("INSTAGRAM_OAUTH_SCOPES", ["instagram_business_basic", "instagram_business_manage_comments"]),
    },
  };
  const config = configs[provider];
  if (!config.clientId || !config.clientSecret) throw new CrmError(`${provider} OAuth is not configured`, 503, "provider_not_configured");
  return config;
}

function encryptionKey() {
  const value = env("SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (!value) throw new CrmError("Social token encryption is not configured", 503, "encryption_not_configured");
  const hex = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (hex.length !== 32) throw new CrmError("SOCIAL_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64-character hex)", 503, "invalid_encryption_key");
  return hex;
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string) {
  const [version, iv, tag, ciphertext] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new CrmError("Stored social credential is invalid", 500, "credential_invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function stateSecret() {
  return env("SOCIAL_OAUTH_STATE_SECRET") || env("SOCIAL_TOKEN_ENCRYPTION_KEY");
}

function sign(encoded: string) {
  const secret = stateSecret();
  if (!secret) throw new CrmError("OAuth state signing is not configured", 503, "oauth_state_not_configured");
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function encodeOAuthState(state: OAuthState) {
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function decodeOAuthState(value: string): OAuthState {
  const [encoded, signature] = String(value || "").split(".");
  if (!encoded || !signature) throw new CrmError("OAuth state is missing", 400, "oauth_state_missing");
  const expected = Buffer.from(sign(encoded)); const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new CrmError("OAuth state is invalid", 400, "oauth_state_invalid");
  const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
  if (!isSocialProvider(state.provider) || state.expiresAt < Date.now()) throw new CrmError("OAuth state has expired", 400, "oauth_state_expired");
  return state;
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function oauthCookieName(provider: SocialProvider) { return `oval_social_oauth_${provider}`; }

export async function createAuthorization(provider: SocialProvider, requestUrl: string) {
  const context = await requireIntegrationContext(["admin", "manager"]);
  const config = providerConfig(provider);
  const origin = env("OVAL_PUBLIC_URL") || new URL(requestUrl).origin;
  const verifier = config.pkce ? randomBytes(48).toString("base64url") : undefined;
  const state: OAuthState = {
    provider, nonce: randomBytes(24).toString("base64url"), verifier,
    userId: context.user.id, brandId: context.member.brand_id || DEFAULT_BRAND_ID,
    returnTo: "/integrations", expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encoded = encodeOAuthState({ ...state, verifier: undefined });
  cookies().set(oauthCookieName(provider), encodeOAuthState(state), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  const callback = `${origin}/api/integrations/${provider}/callback`;
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: callback, response_type: "code", state: encoded, scope: config.scopes.join(" ") });
  if (provider === "facebook") params.set("auth_type", "rerequest");
  if (config.pkce && verifier) { params.set("code_challenge", pkceChallenge(verifier)); params.set("code_challenge_method", "S256"); }
  return { url: `${config.authorizeUrl}?${params}`, callback };
}

export async function validateCallback(provider: SocialProvider, stateValue: string) {
  const publicState = decodeOAuthState(stateValue);
  const cookie = cookies().get(oauthCookieName(provider))?.value;
  if (!cookie) throw new CrmError("OAuth browser session is invalid", 400, "oauth_session_invalid");
  const state = decodeOAuthState(cookie);
  if (publicState.provider !== provider || state.provider !== provider || publicState.nonce !== state.nonce || publicState.userId !== state.userId || publicState.brandId !== state.brandId) throw new CrmError("OAuth browser session is invalid", 400, "oauth_session_invalid");
  const context = await requireIntegrationContext(["admin", "manager"]);
  if (context.user.id !== state.userId || context.member.brand_id !== state.brandId) throw new CrmError("OAuth identity changed during connection", 403, "oauth_identity_changed");
  cookies().delete(oauthCookieName(provider));
  return { state, context };
}

export async function exchangeCode(provider: SocialProvider, code: string, callback: string, verifier?: string) {
  const config = providerConfig(provider);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callback, client_id: config.clientId });
  if (provider !== "instagram" && config.clientSecret) body.set("client_secret", config.clientSecret);
  if (provider === "instagram") body.set("client_secret", config.clientSecret);
  if (verifier) body.set("code_verifier", verifier);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (provider === "x" && config.clientSecret) headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  const response = await fetch(config.tokenUrl, { method: "POST", headers, body, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new CrmError(payload.error_description || payload.error?.message || `${provider} token exchange failed`, 502, "token_exchange_failed");
  return payload as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; user_id?: string };
}

export async function storeConnectedAccount(input: {
  brandId: string; userId: string; provider: SocialProvider; externalAccountId: string; displayName: string;
  accountType?: string; username?: string; profileUrl?: string; scopes: string[]; accessToken: string; refreshToken?: string; expiresIn?: number;
}) {
  const admin = crmAdmin();
  const connection = await admin.from("social_connections").upsert({
    brand_id: input.brandId, provider: input.provider, external_account_id: input.externalAccountId,
    display_name: input.displayName, account_type: input.accountType || null, username: input.username || null,
    profile_url: input.profileUrl || null, granted_scopes: input.scopes, status: "connected", last_error: null,
    created_by: input.userId, updated_at: new Date().toISOString(),
  }, { onConflict: "brand_id,provider,external_account_id" }).select("id").single();
  if (connection.error || !connection.data) throw new CrmError(connection.error?.message || "Connection could not be saved", 500, "connection_save_failed");
  const tokenExpiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000).toISOString() : null;
  const credentials = await admin.from("social_connection_credentials").upsert({
    connection_id: connection.data.id, access_token_ciphertext: encryptSecret(input.accessToken),
    refresh_token_ciphertext: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    token_expires_at: tokenExpiresAt, updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id" });
  if (credentials.error) throw new CrmError(credentials.error.message, 500, "credential_save_failed");
  return connection.data.id as string;
}

export async function connectionCredential(connectionId: string) {
  const admin = crmAdmin();
  const response = await admin.from("social_connection_credentials").select("*").eq("connection_id", connectionId).single();
  if (response.error || !response.data) throw new CrmError("Connection credential is unavailable", 409, "credential_missing");
  return { accessToken: decryptSecret(response.data.access_token_ciphertext), refreshToken: response.data.refresh_token_ciphertext ? decryptSecret(response.data.refresh_token_ciphertext) : undefined, expiresAt: response.data.token_expires_at };
}
