import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  verifyAccessSession,
} from "@/lib/access-session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/google",
  "/api/auth/callback",
  "/api/auth/logout",
  "/api/issues/reminders",
  "/api/integrations/meta/webhook",
  "/api/integrations/scheduled",
  "/api/playstore/slack-summary",
  "/api/shield/gati/scheduled",
  "/api/vault/snapshots/run",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // These product surfaces remain hidden, but the redirect target is itself
  // protected by the platform-wide session gate below.
  if (
    !pathname.startsWith("/api/") &&
    (pathname === "/vault" ||
      pathname.startsWith("/vault/") ||
      pathname === "/integrations" ||
      pathname.startsWith("/integrations/"))
  ) {
    return NextResponse.redirect(
      new URL("/audience-intelligence/overview", request.url),
    );
  }

  if (
    PUBLIC_PATHS.has(pathname) ||
    // Run execution validates x-shield-trigger-token or an authenticated CRM
    // context inside the route. The scheduler needs this exception because it
    // invokes the dynamic run endpoint server-to-server.
    pathname.startsWith("/api/shield/runs/")
  ) {
    return NextResponse.next();
  }

  const session = await verifyAccessSession(
    request.cookies.get(ACCESS_SESSION_COOKIE)?.value,
  );
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "A valid OVAL session is required" },
        { status: 401 },
      );
    }
    return redirectToLogin(request);
  }

  return NextResponse.next({ request });
}

function redirectToLogin(request: NextRequest, error?: string) {
  const login = new URL("/login", request.url);
  login.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  if (error) login.searchParams.set("error", error);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)).*)",
  ],
};
