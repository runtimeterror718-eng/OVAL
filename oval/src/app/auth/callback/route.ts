import { NextResponse } from "next/server";
import { crmSessionClient } from "@/lib/crm-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/issues";
  if (code) {
    const supabase = crmSessionClient();
    const result = await supabase.auth.exchangeCodeForSession(code);
    if (!result.error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
}
