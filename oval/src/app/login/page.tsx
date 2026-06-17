"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        router.push("/playstore");
        router.refresh();
        return;
      }
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || "Login failed. Please try again.");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-[#1d1640] to-violet-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white p-1.5">
              <Image src="/google-play.webp" alt="Google Play" width={32} height={32} className="h-8 w-8 object-contain" />
            </span>
            <div>
              <h1 className="text-lg font-black text-white">OVAL · Play Store Intelligence</h1>
              <p className="text-xs text-white/60">Restricted preview - PW team access only</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">PW email ID</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 focus-within:border-violet-400">
                <Mail className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@pw.live"
                  autoComplete="email"
                  className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/30"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/50">Access password</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 focus-within:border-violet-400">
                <Lock className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Shared access password"
                  autoComplete="current-password"
                  className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/30"
                />
              </div>
            </label>
            {error ? (
              <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-300">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white transition-colors duration-200 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Checking..." : "Open dashboard"}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/40">
            Only @pw.live email IDs are allowed. Need the access password?{" "}
            <a
              href="https://slack.com/app_redirect?channel=D0391KS8R33"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer font-black text-violet-300 underline decoration-violet-400/40 underline-offset-2 transition-colors duration-200 hover:text-violet-200"
            >
              Contact Abhishek on Slack
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
