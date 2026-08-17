import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  resolvePublicOrigin,
} from "@/lib/access-session";
import { createOAuthClient } from "@/lib/supabase-oauth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const oauth = createOAuthClient(request);
  if (oauth) await oauth.client.auth.signOut().catch(() => undefined);
  const response = oauth?.applyCookies(NextResponse.redirect(
    new URL("/login", resolvePublicOrigin(request)),
    {
      status: 303,
    },
  )) || NextResponse.redirect(new URL("/login", resolvePublicOrigin(request)), { status: 303 });
  response.cookies.set(ACCESS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
