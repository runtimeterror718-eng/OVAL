import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const OPEN_PATHS = new Set(["/login", "/api/auth/login", "/auth/callback", "/api/issues/reminders", "/api/integrations/meta/webhook", "/api/integrations/scheduled", "/api/vault/snapshots/run"]);
const RESTRICTED_PREFIXES = ["/issues", "/api/issues", "/integrations", "/api/integrations", "/api/owned-social", "/vault", "/api/vault"];
const PREVIEW_PAGES = new Set(["/playstore", "/youtube", "/youtube/owned", "/youtube/not-owned", "/reddit", "/linkedin", "/freshdesk", "/issues", "/coming-soon"]);
const PREVIEW_APIS = ["/api/playstore", "/api/youtube", "/api/youtube-owned/negative-sentiment", "/api/reddit", "/api/linkedin", "/api/freshdesk", "/api/issues"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();
  const requiresAuth = RESTRICTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) || process.env.PLAYSTORE_ONLY === "true";
  if (!requiresAuth) return NextResponse.next();
  if (isLocalCrmBypass(request)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) return pathname.startsWith("/api/") ? NextResponse.json({ error: "Authentication is not configured" }, { status: 503 }) : NextResponse.redirect(new URL("/login", request.url));
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email?.toLowerCase().endsWith("@pw.live")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const login = new URL("/login", request.url); login.searchParams.set("next", pathname); return NextResponse.redirect(login);
  }

  if (process.env.PLAYSTORE_ONLY === "true") {
    if (pathname.startsWith("/api/") && !PREVIEW_APIS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return NextResponse.json({ error: "This section is not available yet" }, { status: 403 });
    if (!pathname.startsWith("/api/") && !Array.from(PREVIEW_PAGES).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return NextResponse.rewrite(new URL("/coming-soon", request.url));
  }
  return response;
}

function isLocalCrmBypass(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  const local3001 = request.nextUrl.port === "3001" && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1");
  const integrationsPath = request.nextUrl.pathname === "/integrations" || request.nextUrl.pathname.startsWith("/integrations/") || request.nextUrl.pathname.startsWith("/api/integrations/") || request.nextUrl.pathname.startsWith("/api/owned-social/");
  if (local3001 && integrationsPath && process.env.INTEGRATIONS_DEV_AUTH_BYPASS === "true") return true;
  if (process.env.CRM_DEV_AUTH_BYPASS !== "true") return false;
  return local3001;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)).*)"] };
