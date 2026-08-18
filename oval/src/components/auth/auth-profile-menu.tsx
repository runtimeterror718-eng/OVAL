"use client";

import { useEffect, useState } from "react";

type SessionProfile = { email: string; displayName: string; initial: string };

export function AuthProfileMenu() {
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && data?.authenticated) {
          setProfile({ email: data.email, displayName: data.displayName, initial: data.initial });
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <details className="ai-auth-menu">
      <summary className="ai-avatar" aria-label="Open account menu">
        {profile?.initial || "P"}
      </summary>
      <div>
        <span className="ai-auth-menu-label">SIGNED IN AS</span>
        <strong>{profile?.displayName || "PW member"}</strong>
        <small>{profile?.email || "Verified PW account"}</small>
        <span className="ai-auth-menu-status"><i /> Active session</span>
        <form action="/api/auth/logout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </details>
  );
}
