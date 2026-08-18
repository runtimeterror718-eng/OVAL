import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  AUTH_NEXT_COOKIE,
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
  const next = safeNext(request.cookies.get(AUTH_NEXT_COOKIE)?.value || null);
  const code = request.nextUrl.searchParams.get("code");
  const oauth = createOAuthClient(request);
  if (!oauth || !code) {
    return clearAuthNext(loginFailure(origin, next, "google_callback_failed"));
  }

  const { data, error } = await oauth.client.auth.exchangeCodeForSession(code);
  const email = data.user?.email?.trim().toLowerCase() || "";
  if (error || !email) {
    console.error(
      "[auth] Google callback exchange failed",
      error?.code || error?.name || "missing_email",
    );
    return clearAuthNext(loginFailure(origin, next, "google_callback_failed"));
  }

  if (!PW_EMAIL_PATTERN.test(email)) {
    await oauth.client.auth.signOut();
    return clearAuthNext(
      oauth.applyCookies(loginFailure(origin, next, "google_domain_denied")),
    );
  }

  const response = oauth.applyCookies(NextResponse.redirect(new URL(next, origin)));
  response.cookies.set(ACCESS_SESSION_COOKIE, await createAccessSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: accessSessionMaxAge(),
  });
  return clearAuthNext(response);
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

function clearAuthNext(response: NextResponse) {
  response.cookies.set(AUTH_NEXT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
