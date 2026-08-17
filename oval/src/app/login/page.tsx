import { Check } from "lucide-react";
import { OvalLogo } from "@/components/brand/oval-logo";
import "./login.css";

const DEFAULT_NEXT = "/audience-intelligence/overview";

const ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in has not been configured for this environment.",
  google_unavailable: "Google sign-in is currently unavailable. Please try again.",
  google_callback_failed: "Google could not verify this sign-in. Please try again.",
  google_domain_denied: "Use a Google account issued on the @pw.live domain.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const next = safeNext(searchParams?.next);
  const error = searchParams?.error ? ERROR_MESSAGES[searchParams.error] : null;

  return (
    <main className="oval-login" id="main-content">
      <div className="oval-login-ambient oval-login-ambient-one" />
      <div className="oval-login-ambient oval-login-ambient-two" />

      <section className="oval-login-shell">
        <article className="oval-login-story">
          <header className="oval-login-brand" aria-label="OVAL Audience Intelligence">
            <OvalLogo className="oval-login-brand-mark oval-logo-image" priority />
            <span><strong>OVAL</strong><small>AUDIENCE INTELLIGENCE</small></span>
          </header>

          <div className="oval-login-story-copy">
            <h1>They’re talking.<br />They’re stealing.<br />Stop both.</h1>
            <p className="oval-login-lede">Unified brand intelligence to analyze social sentiment, detect public backlash, block unauthorized piracy, and eliminate brand fraud in real time.</p>
          </div>

          <div className="oval-login-capabilities" aria-label="Platform capabilities">
            <span><Check size={13} /> Cross-channel listening</span>
            <span><Check size={13} /> Semantic issue discovery</span>
            <span><Check size={13} /> Evidence-led decisions</span>
          </div>
          <div className="oval-login-signal" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </article>

        <section className="oval-login-card" aria-label="Google sign in">
          <div className="oval-login-card-glow" />
          <div className="oval-login-card-content">
            {error ? <p className="oval-login-message error" role="alert">{error}</p> : null}

            <a className="oval-google-cta" href={`/api/auth/google?next=${encodeURIComponent(next)}`} aria-label="Sign in with Google">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 3 7.4l3.4 2.7A6 6 0 0 1 12 5.9Z"/></svg>
              <span>Sign in with Google</span>
              <i aria-hidden="true" />
            </a>
          </div>
        </section>
      </section>
    </main>
  );
}

function safeNext(value: unknown) {
  const candidate = String(value || DEFAULT_NEXT);
  return candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : DEFAULT_NEXT;
}
