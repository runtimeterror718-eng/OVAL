# OVAL shared-password authentication

OVAL currently uses a temporary shared-password gate. Users enter an email with
the `@pw.live` domain and the private OVAL access password. The server issues a
signed, HTTP-only session cookie that expires after 12 hours.

## Application flow

1. `/login` posts the email and password to `POST /api/auth/login`.
2. The server validates the `@pw.live` email format and compares the configured
   password using constant-time digest comparison.
3. A successful login receives a signed, secure, HTTP-only cookie.
4. Middleware verifies the signature and expiry for every protected page and
   API request.
5. CRM and Shield operations additionally require the entered email to match an
   active `crm_members` directory record; the shared password does not grant a
   role or elevate permissions.
6. Logout expires the session cookie immediately.

The `hd` authorization parameter only improves Google account selection. It is
not the security boundary; OVAL verifies the returned Workspace domain on the
server.

## Environment

The application requires these server-only values:

```text
OVAL_ACCESS_PASSWORD=<at least 24 random characters>
OVAL_AUTH_SECRET=<at least 32 random characters, separate from the password>
```

Never prefix either value with `NEXT_PUBLIC_`, commit them, print them in logs,
or reuse the access password as the signing secret.

## Verification checklist

- A syntactically valid `@pw.live` email and correct password reaches the
  requested protected page.
- A personal Gmail address is rejected.
- A wrong password is rejected without revealing which field failed.
- A logged-out request to a platform page redirects to `/login` and preserves
  the intended destination.
- Logout expires the browser session.
- Protected APIs return `401` without a valid signed session.
- CRM and Shield return `403` when the entered email is absent or inactive in
  the OVAL directory.

This gate validates the email format, not mailbox ownership. Restore Google
Workspace SSO or another identity provider before treating it as durable
employee identity verification.

Private scheduler and webhook endpoints remain outside browser-session auth;
each continues to validate its own trigger token or provider signature.
