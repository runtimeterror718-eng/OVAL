import { NextResponse } from "next/server";
import { crmSessionClient } from "@/lib/crm-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = crmSessionClient();
    await supabase.auth.signOut();
  } catch {
    // Clear the browser's OVAL flow even when Auth is temporarily unavailable.
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
