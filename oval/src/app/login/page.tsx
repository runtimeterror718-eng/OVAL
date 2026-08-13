"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedNext = params.get("next") || "/audience-intelligence/overview";
      const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/audience-intelligence/overview";
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, otp: stage === "otp" ? otp : undefined, next }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Sign-in failed");
      if (stage === "email") setStage("otp");
      else { router.replace(payload.next || next); router.refresh(); }
    } catch (value) { setError(value instanceof Error ? value.message : "Sign-in failed"); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f5f2] p-5 text-black">
      <section className="w-full max-w-md rounded-[28px] border border-black/10 bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,.10)]">
        <div className="flex items-center gap-3"><span className="oval-brand-mark" aria-hidden="true"><i /><i /></span><div><h1 className="text-2xl font-semibold">Sign in to OVAL</h1><p className="text-sm text-black/55">Only verified @pw.live accounts can continue</p></div></div>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-black/50">PW email</span><div className="mt-2 flex items-center gap-2 rounded-xl border border-black/15 px-3 py-3"><Mail className="h-4 w-4 text-black/40" /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={stage === "otp"} required autoComplete="email" pattern="[a-zA-Z0-9._%+\-]+@pw\.live" placeholder="you@pw.live" className="w-full bg-transparent text-sm outline-none disabled:opacity-60" /></div></label>
          {stage === "otp" ? <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-black/50">Six-digit code</span><div className="mt-2 flex items-center gap-2 rounded-xl border border-black/15 px-3 py-3"><KeyRound className="h-4 w-4 text-black/40" /><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required autoFocus placeholder="000000" className="w-full bg-transparent text-sm tracking-[0.25em] outline-none" /></div></label> : null}
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {stage === "otp" ? <p className="text-xs leading-relaxed text-black/50">We sent a secure sign-in code to {email}. The first successful verification automatically creates your OVAL login.</p> : null}
          <button disabled={submitting} className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{submitting ? "Please wait…" : stage === "email" ? "Send sign-in code" : "Verify and continue"}</button>
          {stage === "otp" ? <button type="button" onClick={() => { setStage("email"); setOtp(""); }} className="w-full text-xs font-medium text-black/55">Use a different email</button> : null}
        </form>
      </section>
    </main>
  );
}
