import { NextResponse } from "next/server";
import { crmSessionClient } from "@/lib/crm-server";

export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/audience-intelligence/overview";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeNext(requestUrl.searchParams.get("next"));
  const callback = new URL("/auth/callback", requestUrl.origin);
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
      return loginError(requestUrl, "google_unavailable");
    }

    return NextResponse.redirect(data.url);
  } catch {
    return loginError(requestUrl, "auth_not_configured");
  }
}

function safeNext(value: unknown) {
  const candidate = String(value || DEFAULT_NEXT);
  return candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : DEFAULT_NEXT;
}

function loginError(requestUrl: URL, error: string) {
  const login = new URL("/login", requestUrl.origin);
  login.searchParams.set("error", error);
  return NextResponse.redirect(login);
}
