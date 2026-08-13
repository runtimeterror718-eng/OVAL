import type { User } from "@supabase/supabase-js";

export const PW_GOOGLE_DOMAIN = "pw.live";
export const PW_EMAIL = /^[a-z0-9._%+-]+@pw\.live$/i;

export function isPwGoogleUser(user: User | null | undefined) {
  if (!user?.email || !PW_EMAIL.test(user.email)) return false;
  const primaryProvider = String(user.app_metadata?.provider || "").toLowerCase();
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.map((provider: unknown) => String(provider).toLowerCase())
    : [];
  return primaryProvider === "google" || providers.includes("google");
}

export async function verifyPwGoogleWorkspace(
  user: User | null | undefined,
  providerToken: string | null | undefined,
) {
  if (!isPwGoogleUser(user) || !providerToken) return false;

  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${providerToken}` },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const claims = await response.json();
    return (
      claims.email_verified === true &&
      String(claims.email || "").toLowerCase() === user?.email?.toLowerCase() &&
      String(claims.hd || "").toLowerCase() === PW_GOOGLE_DOMAIN
    );
  } catch {
    return false;
  }
}
