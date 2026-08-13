import { NextResponse } from "next/server";
import { crmSessionClient } from "@/lib/crm-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") || "";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/audience-intelligence/overview";
  if (code) {
    const supabase = crmSessionClient();
    const result = await supabase.auth.exchangeCodeForSession(code);
    if (
      !result.error &&
      result.data.user?.email &&
      /^[a-z0-9._%+-]+@pw\.live$/i.test(result.data.user.email)
    ) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
}
