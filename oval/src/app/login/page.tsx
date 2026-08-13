import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import "./login.css";

const DEFAULT_NEXT = "/audience-intelligence/overview";

const ERROR_MESSAGES: Record<string, string> = {
  workspace_required: "Use a Google Workspace account issued on the @pw.live domain.",
  google_unavailable: "Google sign-in is not available yet. Please try again shortly.",
  auth_not_configured: "Google sign-in still needs to be enabled in Supabase.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const next = safeNext(searchParams?.next);
  const error = searchParams?.error ? ERROR_MESSAGES[searchParams.error] : null;
  const googleUrl = `/api/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <main className="oval-login" id="main-content">
      <div className="oval-login-ambient oval-login-ambient-one" />
      <div className="oval-login-ambient oval-login-ambient-two" />

      <header className="oval-login-topbar">
        <div className="oval-login-brand" aria-label="OVAL Audience Intelligence">
          <span className="oval-login-brand-mark">O</span>
          <span>
            <strong>OVAL</strong>
            <small>AUDIENCE INTELLIGENCE</small>
          </span>
        </div>
        <div className="oval-login-secure">
          <ShieldCheck size={15} />
          <span>PW team access</span>
        </div>
      </header>

      <section className="oval-login-layout">
        <article className="oval-login-story">
          <p className="oval-login-eyebrow">PHYSICS WALLAH · INTERNAL INTELLIGENCE</p>
          <h1>Hear the signal.<br />Before it becomes<br />the story.</h1>
          <p className="oval-login-lede">
            OVAL brings product feedback, support pressure and public conversation into one clear view—so PW teams know what needs attention now.
          </p>

          <div className="oval-login-capabilities" aria-label="Platform capabilities">
            <span><Check size={13} /> Cross-channel intelligence</span>
            <span><Check size={13} /> Semantic issue discovery</span>
            <span><Check size={13} /> Verified PW access</span>
          </div>
        </article>

        <section className="oval-login-card" aria-labelledby="login-title">
          <div className="oval-login-card-glow" />
          <div className="oval-login-card-content">
            <p className="oval-login-card-kicker">SECURE WORKSPACE</p>
            <h2 id="login-title">Enter OVAL</h2>
            <p className="oval-login-card-copy">
              Continue with your Physics Wallah Google Workspace account. No password or email code is required by OVAL.
            </p>

            {error ? <p className="oval-login-message error" role="alert">{error}</p> : null}

            <a href={googleUrl} className="oval-google-button">
              <GoogleMark />
              <span>Continue with Google</span>
              <ArrowRight size={17} />
            </a>

            <p className="oval-login-policy">
              Access is automatically refused when Google does not verify the account as part of the <strong>pw.live</strong> Workspace.
            </p>

            <footer>
              <ShieldCheck size={15} />
              <span>Restricted to verified <strong>@pw.live</strong> accounts</span>
            </footer>
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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.3L6.5 14Z" />
      <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.9 5.4l3.4 2.7A5.9 5.9 0 0 1 12 6.1Z" />
    </svg>
  );
}
