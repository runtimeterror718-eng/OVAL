# OVAL Issue CRM

## Architecture

- Supabase stores members, teams, candidates, issues, evidence snapshots, tasks,
  comments, events and notification state.
- Qdrant remains the semantic retrieval system. Candidate generation reads
  `semantic_cluster` points and safely falls back to the checked-in cluster artifact
  when Qdrant is temporarily unavailable.
- The browser uses the Supabase publishable key only for OTP sessions. CRM writes
  are performed by authenticated server routes; the service key remains server-only.

## Apply the database migration

The migration was created using the Supabase CLI and is located under
`supabase/migrations/*_issue_crm.sql`.

```bash
npx supabase login
npx supabase link --project-ref bieocyzyybjetzornlfw
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase db lint --linked --schema public --level warning
npx supabase migration list --linked
```

Review the dry run before applying it. The current workstation was not logged into
the Supabase CLI, so the hosted database was not changed automatically.

## Authentication setup

In Supabase Auth:

1. Add local and production OVAL URLs to the allowed redirect URL list.
2. Keep email OTP enabled.
3. Include `{{ .Token }}` in the email template if users should type a numeric code.
   The magic-link callback is also supported.
4. Add the first administrator to `CRM_BOOTSTRAP_ADMIN_EMAILS`. They are inserted
   only when the CRM directory is empty and after their `@pw.live` identity is verified.

Server environment variables:

```dotenv
CRM_BOOTSTRAP_ADMIN_EMAILS=admin@pw.live
CRM_REMINDER_TOKEN=replace-with-a-long-random-value
NEXT_PUBLIC_APP_URL=https://oval.run
```

Do not prefix service-role or Slack credentials with `NEXT_PUBLIC_`.

## SLA reminder schedule

Run every 15 minutes on the VPS:

```bash
curl -fsS -X POST https://oval.run/api/issues/reminders \
  -H "Authorization: Bearer $CRM_REMINDER_TOKEN"
```

The delivery table uses deterministic deduplication keys, so rerunning the job does
not resend a successful event. Slack failure is recorded without rolling back the
underlying issue change.
