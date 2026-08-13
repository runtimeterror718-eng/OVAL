# OVAL Google Workspace authentication

OVAL uses Supabase Auth with Google OAuth. Users do not enter an OVAL password
or receive an OVAL email code. Access is restricted to Google Workspace
identities whose verified hosted domain is exactly `pw.live`.

## Application flow

1. `/login` links to `GET /api/auth/google`.
2. The server starts Supabase Google OAuth with PKCE, hints `hd=pw.live`, and
   uses `prompt=select_account` so the user deliberately chooses an account.
3. Google returns through the Supabase provider callback and then redirects to
   `/auth/callback` in OVAL.
4. OVAL exchanges the authorization code for a cookie-backed Supabase session.
5. The callback retrieves Google's signed user information and requires:
   - `email_verified = true`
   - `hd = pw.live`
   - the returned email to match the Supabase Auth user
6. Middleware requires both the `@pw.live` email and Google as the Supabase Auth
   provider on every protected request.
7. Failed checks sign the session out and return the user to `/login`.

The `hd` authorization parameter only improves Google account selection. It is
not the security boundary; OVAL verifies the returned Workspace domain on the
server.

## Google Auth Platform

In Google Cloud, open **Google Auth Platform** and configure:

1. **Branding**
   - App name: `OVAL`
   - Support email: an appropriate PW-managed address
   - Homepage: `https://oval.run`
   - Authorized domain: `oval.run`
2. **Audience**
   - Select **Internal** when the Cloud project belongs to the PW Google
     Workspace organization. This gives an additional Google-side restriction.
   - Otherwise use External and rely on OVAL's mandatory server-side `hd`
     verification.
3. **Data Access**
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - Do not request Drive, Gmail, Calendar, or other scopes for login.
4. **Clients → Create client → Web application**
   - Name: `OVAL Web`
   - Authorized JavaScript origins:
     - `https://oval.run`
     - `http://localhost:3001`
     - `http://127.0.0.1:3001`
   - Authorized redirect URI: copy the exact callback URL shown in
     **Supabase → Authentication → Sign In / Providers → Google**. It normally
     follows `https://<project-ref>.supabase.co/auth/v1/callback`.

Copy the generated Client ID and Client Secret directly into Supabase. Never
place the Google Client Secret in a browser environment variable or commit it.

## Supabase hosted project

1. Open **Authentication → Sign In / Providers → Google**.
2. Enable Google and enter the Google Client ID and Client Secret.
3. Open **Authentication → URL Configuration**:
   - Site URL: `https://oval.run`
   - Redirect URLs:
     - `https://oval.run/auth/callback`
     - `http://localhost:3001/auth/callback`
     - `http://127.0.0.1:3001/auth/callback`
4. Disable email/passwordless sign-in under the Email provider. Google should
   be the only interactive login provider for OVAL.
5. Do not expose the Supabase service-role key. The browser/session flow uses
   only the project's publishable key.

## Next.js environment

The application requires:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Google secrets belong in Google/Supabase dashboards, not Next.js.

## Verification checklist

- An active `@pw.live` Google Workspace user reaches
  `/audience-intelligence/overview`.
- A personal Gmail account is rejected after Google returns.
- A non-PW Google Workspace account is rejected.
- A logged-out request to a platform page redirects to `/login` and preserves
  the intended destination.
- Logout revokes the browser session.
- Protected APIs return `401` without a valid PW Google session.

Private scheduler and webhook endpoints remain outside browser-session auth;
each continues to validate its own trigger token or provider signature.
