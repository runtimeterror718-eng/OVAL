import { NextResponse } from "next/server";
import { crmSessionClient } from "@/lib/crm-server";

export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/audience-intelligence/overview";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = resolvePublicOrigin(request, requestUrl.origin);
  const next = safeNext(requestUrl.searchParams.get("next"));
  const callback = new URL("/auth/callback", publicOrigin);
  callback.searchParams.set("next", next);

  try {
    const supabase = crmSessionClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: {
          hd: "pw.live",
          prompt: "select_account",
        },
      },
    });

    if (error || !data.url) {
      return loginError(publicOrigin, "google_unavailable");
    }

    return NextResponse.redirect(data.url);
  } catch {
    return loginError(publicOrigin, "auth_not_configured");
  }
}

function resolvePublicOrigin(request: Request, fallback: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to trusted proxy headers when configuration is malformed.
    }
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host && /^(?:www\.)?oval\.run$/i.test(host)) {
    return `https://${host}`;
  }
  if (host && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host)) {
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    return `${forwardedProto === "https" ? "https" : "http"}://${host}`;
  }

  return fallback;
}

function safeNext(value: unknown) {
  const candidate = String(value || DEFAULT_NEXT);
  return candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : DEFAULT_NEXT;
}

function loginError(origin: string, error: string) {
  const login = new URL("/login", origin);
  login.searchParams.set("error", error);
  return NextResponse.redirect(login);
}
