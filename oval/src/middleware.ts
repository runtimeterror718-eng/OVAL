import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/auth/callback",
  "/api/issues/reminders",
  "/api/integrations/meta/webhook",
  "/api/integrations/scheduled",
  "/api/playstore/slack-summary",
  "/api/shield/gati/scheduled",
  "/api/vault/snapshots/run",
]);

const PW_EMAIL = /^[a-z0-9._%+-]+@pw\.live$/i;

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

  let response = NextResponse.next({ request });
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    return pathname.startsWith("/api/")
      ? NextResponse.json(
          { error: "Authentication is not configured" },
          { status: 503 },
        )
      : redirectToLogin(request, "auth_not_configured");
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser validates the session with Supabase Auth instead of trusting the
  // cookie payload. The email domain is checked from the verified Auth user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !PW_EMAIL.test(user.email)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "A verified @pw.live account is required" },
        { status: 401 },
      );
    }
    return redirectToLogin(request);
  }

  return response;
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
