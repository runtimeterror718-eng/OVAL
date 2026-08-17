import { NextRequest, NextResponse } from "next/server";
import { resolvePublicOrigin } from "@/lib/access-session";
import { createOAuthClient } from "@/lib/supabase-oauth";

export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/audience-intelligence/overview";

export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const oauth = createOAuthClient(request);
  if (!oauth) return loginFailure(origin, next, "google_not_configured");

  const callback = new URL("/api/auth/callback", origin);
  callback.searchParams.set("next", next);
  const { data, error } = await oauth.client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      queryParams: {
        access_type: "offline",
        hd: "pw.live",
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) return loginFailure(origin, next, "google_unavailable");
  return oauth.applyCookies(NextResponse.redirect(data.url));
}

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : DEFAULT_NEXT;
}

function loginFailure(origin: string, next: string, error: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("next", next);
  login.searchParams.set("error", error);
  return NextResponse.redirect(login);
}
