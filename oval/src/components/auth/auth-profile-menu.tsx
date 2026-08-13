export function AuthProfileMenu() {
  return (
    <details className="ai-auth-menu">
      <summary className="ai-avatar" aria-label="Open account menu">
        PW
      </summary>
      <div>
        <strong>PW verified session</strong>
        <small>Access is restricted to @pw.live</small>
        <form action="/api/auth/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </details>
  );
}
