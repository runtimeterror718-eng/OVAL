# OVAL Google Workspace authentication

OVAL uses Google OAuth through Supabase Auth. Only identities whose verified
email address ends in `@pw.live` receive an OVAL application session.

## Security boundary

1. `/login` starts OAuth through `GET /api/auth/google`.
2. Supabase creates a PKCE authorization request and stores its verifier in a
   secure, HTTP-only, same-site cookie.
3. Google returns to `/api/auth/callback`; the server exchanges the code and
   reads the verified Google identity from Supabase.
4. The server independently validates the returned email against the exact
   `@pw.live` domain. The Google `hd` parameter is only an account-selection
   hint and is never treated as authorization.
5. OVAL issues a signed, secure, HTTP-only cookie with a 12-hour expiry.
6. Middleware validates the signature and expiry for every protected page and
   API route. Unauthenticated API calls receive `401`; pages redirect to login.
7. CRM and Shield operations can apply additional directory- and role-based
   authorization after the platform session has been verified.

## Required server-only configuration

```text
NEXT_PUBLIC_APP_URL=https://oval.run
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable or anon key>
OVAL_AUTH_SECRET=<at least 32 random characters>
```

The Supabase URL and publishable/anon key are designed to be public. The OVAL
signing secret and any Supabase service-role key must remain server-only and
must never use a `NEXT_PUBLIC_` prefix.

Supabase Auth must enable Google and allow this production callback:

```text
https://oval.run/api/auth/callback
```

Use the equivalent loopback callback only for local development.

## Verification checklist

- A Google identity with a verified `@pw.live` address reaches the requested
  protected page.
- A personal Gmail or other non-PW domain is rejected after callback.
- A logged-out platform request redirects to `/login` and preserves its safe
  relative destination.
- Protected API routes return `401` without a valid signed session.
- Authentication cookies are secure and HTTP-only in production.
- Logout clears both the OVAL application session and Supabase OAuth session.
- No OAuth client secret, service-role key, or signing secret appears in
  browser JavaScript, API responses, logs, or Git.

Frontend JavaScript and browser-initiated request URLs remain inspectable in
developer tools by design. Security depends on server-side authorization and
secret isolation, not on hiding browser traffic.
