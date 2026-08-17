import { ArrowRight, Check, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import "./login.css";

const DEFAULT_NEXT = "/audience-intelligence/overview";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_domain: "Enter an email address issued on the @pw.live domain.",
  invalid_credentials: "The email or access password is incorrect.",
  auth_not_configured: "Password access has not been configured on this server.",
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
              Sign in with your Physics Wallah email and the private OVAL access password.
            </p>

            {error ? <p className="oval-login-message error" role="alert">{error}</p> : null}

            <form className="oval-login-form" action="/api/auth/login" method="post">
              <input type="hidden" name="next" value={next} />
              <label>
                <span>PW email</span>
                <div className="oval-login-field">
                  <Mail size={17} aria-hidden="true" />
                  <input
                    type="email"
                    name="email"
                    placeholder="name@pw.live"
                    pattern="^[a-zA-Z0-9._%+\\-]+@pw\\.live$"
                    autoComplete="username"
                    required
                  />
                </div>
              </label>
              <label>
                <span>Access password</span>
                <div className="oval-login-field">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    type="password"
                    name="password"
                    placeholder="Enter the private access password"
                    autoComplete="current-password"
                    minLength={24}
                    required
                  />
                </div>
              </label>
              <button className="oval-login-primary" type="submit">
                <span>Enter OVAL</span>
                <ArrowRight size={17} />
              </button>
            </form>

            <p className="oval-login-policy">
              The email must end in <strong>@pw.live</strong>. Never share the access password outside the PW team.
            </p>

            <footer>
              <ShieldCheck size={15} />
              <span>Restricted to <strong>@pw.live</strong> email IDs</span>
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
