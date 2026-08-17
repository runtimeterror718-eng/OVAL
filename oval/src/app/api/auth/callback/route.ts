import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  PW_EMAIL_PATTERN,
  accessSessionMaxAge,
  createAccessSession,
  resolvePublicOrigin,
} from "@/lib/access-session";
import { createOAuthClient } from "@/lib/supabase-oauth";

export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/audience-intelligence/overview";

export async function GET(request: NextRequest) {
  const origin = resolvePublicOrigin(request);
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const oauth = createOAuthClient(request);
  if (!oauth || !code) return loginFailure(origin, next, "google_callback_failed");

  const { data, error } = await oauth.client.auth.exchangeCodeForSession(code);
  const email = data.user?.email?.trim().toLowerCase() || "";
  if (error || !email) return loginFailure(origin, next, "google_callback_failed");

  if (!PW_EMAIL_PATTERN.test(email)) {
    await oauth.client.auth.signOut();
    return oauth.applyCookies(loginFailure(origin, next, "google_domain_denied"));
  }

  const response = oauth.applyCookies(NextResponse.redirect(new URL(next, origin)));
  response.cookies.set(ACCESS_SESSION_COOKIE, await createAccessSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: accessSessionMaxAge(),
  });
  return response;
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
