# OVAL authentication setup

OVAL uses Supabase passwordless email OTP. Every platform page and normal API
route requires a verified Supabase session whose email exactly matches
`*@pw.live`.

## Hosted Supabase configuration

1. In **Authentication → URL Configuration**, set the production Site URL to
   `https://oval.run` and add these redirect URLs:
   - `https://oval.run/auth/callback`
   - `http://localhost:3001/auth/callback`
2. In **Authentication → Email Templates → Magic Link**, use an OTP template
   containing `{{ .Token }}`. The repository template is
   `supabase/templates/oval_login_otp.html`.
3. Keep Email OTP length at six digits and choose a short expiry. Supabase's
   default is one hour; 10–15 minutes is preferable for production OVAL.
4. Configure production SMTP in Supabase Auth. Do not rely on Supabase's
   default development mail service for an organisational application.
5. Keep email signup enabled. `shouldCreateUser: true` means the first verified
   OTP creates the user's Supabase Auth identity automatically.

## Application environment

The Next.js server requires:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The publishable key is safe for browser/session exchange. Never expose the
Supabase service-role key through a `NEXT_PUBLIC_` variable.

## Request flow

1. `POST /api/auth/login` validates the exact `@pw.live` domain.
2. Supabase sends a six-digit OTP to the submitted PW mailbox.
3. The same route verifies the OTP and writes the Supabase session to secure
   cookies through `@supabase/ssr`.
4. Middleware validates the user with Supabase Auth on every protected request.
5. Unauthenticated pages redirect to `/login`; unauthenticated APIs return 401.
6. `POST /api/auth/logout` revokes the browser session and returns to login.

Private scheduler and webhook endpoints remain outside browser-session auth;
each must continue validating its own bearer token or provider signature.
This includes the Shield scheduler and dynamic run executor, which validate
`x-shield-trigger-token` inside their route handlers.
