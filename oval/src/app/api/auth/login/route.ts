import { NextResponse } from "next/server";
import { crmSessionClient } from "@/lib/crm-server";

export const dynamic = "force-dynamic";
const PW_EMAIL = /^[a-z0-9._%+-]+@pw\.live$/i;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!PW_EMAIL.test(email)) return NextResponse.json({ error: "Access is limited to @pw.live email IDs" }, { status: 400 });
    const supabase = crmSessionClient();
    if (body.otp) {
      const result = await supabase.auth.verifyOtp({ email, token: String(body.otp).trim(), type: "email" });
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 401 });
      return NextResponse.json({ ok: true, user: { email: result.data.user?.email } });
    }
    const result = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${new URL(request.url).origin}/auth/callback?next=/issues` },
    });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, otpSent: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authenticate" }, { status: 500 });
  }
}
