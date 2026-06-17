import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// When PLAYSTORE_ONLY=true, the whole app is gated behind /login
// (@pw.live email + shared password) and only the Play Store Intel
// page and its API are reachable; every other page shows Coming Soon.

const OPEN_PATHS = new Set(["/login", "/api/auth/login"]);
const ALLOWED_PAGES = new Set(["/playstore", "/youtube", "/youtube/owned", "/youtube/not-owned", "/coming-soon"]);
const ALLOWED_APIS = new Set(["/api/playstore", "/api/youtube", "/api/youtube-owned/negative-sentiment"]);

async function expectedToken(): Promise<string> {
  const data = new TextEncoder().encode(`oval-access:${process.env.ACCESS_PASSWORD || ""}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  if (process.env.PLAYSTORE_ONLY !== "true") return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (OPEN_PATHS.has(pathname)) return NextResponse.next();

  const cookie = request.cookies.get("oval_access")?.value || "";
  const authed = cookie.length > 0 && cookie === (await expectedToken());

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/api/")) {
    if (ALLOWED_APIS.has(pathname)) return NextResponse.next();
    return NextResponse.json({ error: "This section is not available yet" }, { status: 403 });
  }

  if (ALLOWED_PAGES.has(pathname)) return NextResponse.next();

  const comingSoonUrl = request.nextUrl.clone();
  comingSoonUrl.pathname = "/coming-soon";
  comingSoonUrl.search = "";
  return NextResponse.rewrite(comingSoonUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)).*)"],
};
